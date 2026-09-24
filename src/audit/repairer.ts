// Auto-fix engine — applies deterministic repairs to HTML files based on audit results
// Uses string manipulation (not DOM parsing) for precise, predictable fixes

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AuditResult, RepairAction } from "./rules";
import type { TagEdit } from "./field-wiring";
import { log } from "../utils/logger";

// Fix types whose `offset` indexes into the file source and must be applied
// high-to-low so earlier edits never invalidate later offsets. See `applyRepairs`.
const OFFSET_SENSITIVE = new Set<RepairAction["type"]>(["add-attribute", "rename-id", "wire-field-group"]);

export interface RepairSummary {
  files_modified: number;
  fixes_applied: number;
  fixes_skipped: number;
  /** Every fix offered, in file order, and whether it applied (`repair --json`). */
  fixes: RepairRecord[];
}

/** One offered fix and its outcome. On a dry run, `applied` means "would apply". */
export interface RepairRecord {
  file: string;
  line: number;
  rule_id: string;
  type: RepairAction["type"];
  message: string;
  applied: boolean;
}

/** One applied repair, for a machine-readable change log. */
export interface SourceRepairChange {
  rule_id: string;
  type: RepairAction["type"];
  message: string;
}

/** Result of applying repairs to a single source string. */
export interface SourceRepairResult {
  /** The repaired source (unchanged if no fix applied). */
  source: string;
  applied: number;
  skipped: number;
  changes: SourceRepairChange[];
}

/**
 * Apply every fixable audit result to a single HTML source **string** and return
 * the repaired string plus a change log — the shared, **filesystem-free** core
 * behind both `faqir repair` (per file) and the MCP `faqir_repair_html` tool
 * (per string). Pure: no reads, no writes, no logging.
 *
 * Offset-sensitive fixes (`add-attribute`, `rename-id`, `wire-field-group`) name
 * a tag by its offset in the ORIGINAL source. They are applied high-offset-first,
 * and every applied tag edit is recorded as (original tag start, length delta),
 * so each later offset is mapped through the edits before it — a field-group's
 * edits interleave with an `add-attribute` inside the same group, and ordering
 * alone cannot keep both right. Tag edits never cross a tag boundary, so an edit
 * at original position `p` moves exactly the tags that start after `p`. The
 * remaining fix types search or use line numbers (tag edits add no newlines)
 * and run last.
 */
export function applyRepairsToSource(source: string, results: AuditResult[]): SourceRepairResult {
  const { source: repaired, applied, skipped, changes } = repairSource(source, results);
  return { source: repaired, applied, skipped, changes };
}

/** {@link applyRepairsToSource}, plus each fix's outcome for the change log. */
function repairSource(
  source: string,
  results: AuditResult[],
): SourceRepairResult & { outcomes: Array<{ result: AuditResult; applied: boolean }> } {
  const fixable = results.filter((r) => r.fix);
  const ordered = [...fixable].sort((a, b) => {
    const ar = OFFSET_SENSITIVE.has(a.fix!.type) ? 0 : 1;
    const br = OFFSET_SENSITIVE.has(b.fix!.type) ? 0 : 1;
    if (ar !== br) return ar - br;
    if (ar === 0) return b.fix!.offset - a.fix!.offset;
    return 0;
  });

  let current = source;
  let applied = 0;
  let skipped = 0;
  const changes: SourceRepairChange[] = [];
  const outcomes: Array<{ result: AuditResult; applied: boolean }> = [];
  const shifts: Array<[position: number, delta: number]> = [];
  const shift: OffsetShift = {
    map: (offset) => shifts.reduce((n, [p, d]) => (p < offset ? n + d : n), offset),
    record: (offset, delta) => {
      if (delta !== 0) shifts.push([offset, delta]);
    },
  };

  for (const result of ordered) {
    const fix = result.fix!;
    const next = applyFix(current, fix, result, shift);
    if (next !== null && next !== current) {
      current = next;
      applied++;
      changes.push({ rule_id: result.rule_id, type: fix.type, message: result.message });
      outcomes.push({ result, applied: true });
    } else {
      skipped++;
      outcomes.push({ result, applied: false });
    }
  }

  return { source: current, applied, skipped, changes, outcomes };
}

/**
 * Apply all fixable audit results to their source files.
 * Returns a summary of what was changed.
 */
export async function applyRepairs(
  results: AuditResult[],
  cwd: string,
  opts: { dryRun?: boolean } = {},
): Promise<RepairSummary> {
  const fixable = results.filter(r => r.fix);
  if (fixable.length === 0) {
    return { files_modified: 0, fixes_applied: 0, fixes_skipped: 0, fixes: [] };
  }
  const fixes: RepairRecord[] = [];
  const record = (result: AuditResult, applied: boolean) =>
    fixes.push({
      file: result.file,
      line: result.line,
      rule_id: result.rule_id,
      type: result.fix!.type,
      message: result.message,
      applied,
    });

  // Group fixes by file
  const byFile = new Map<string, AuditResult[]>();
  for (const result of fixable) {
    const filePath = join(cwd, result.file);
    const existing = byFile.get(filePath) || [];
    existing.push(result);
    byFile.set(filePath, existing);
  }

  let filesModified = 0;
  let fixesApplied = 0;
  let fixesSkipped = 0;

  for (const [filePath, fileResults] of byFile) {
    if (!existsSync(filePath)) {
      fixesSkipped += fileResults.length;
      for (const result of fileResults) record(result, false);
      continue;
    }

    const source = await Bun.file(filePath).text();
    const repaired = repairSource(source, fileResults);
    const byLine = [...repaired.outcomes].sort((a, b) => a.result.line - b.result.line);
    for (const { result, applied } of byLine) record(result, applied);

    fixesApplied += repaired.applied;
    fixesSkipped += repaired.skipped;
    const verb = opts.dryRun ? "Would fix" : "Fixed";
    for (const change of repaired.changes) log.step(`${verb}: ${change.message}`);

    if (repaired.source !== source) {
      if (!opts.dryRun) await Bun.write(filePath, repaired.source);
      filesModified++;
    }
  }

  return { files_modified: filesModified, fixes_applied: fixesApplied, fixes_skipped: fixesSkipped, fixes };
}

/**
 * Apply a single fix to an HTML source string.
 * Returns the modified source, or null if the fix could not be applied.
 */
function applyFix(
  source: string,
  fix: RepairAction,
  result: AuditResult,
  shift: OffsetShift,
): string | null {
  switch (fix.type) {
    case "add-attribute":
      return atShiftedOffset(source, fix, shift, (f) => addAttribute(source, f, result));
    case "add-script":
      return addScript(source, fix, result);
    case "rewrite-css":
      return rewriteCss(source, fix, result);
    case "rename-id":
      return atShiftedOffset(source, fix, shift, (f) => renameId(source, f));
    case "wire-field-group":
      return applyWireFieldGroup(source, fix, shift);
    default:
      return null;
  }
}

/** Maps original-source offsets through the tag edits already applied. */
interface OffsetShift {
  map(offset: number): number;
  record(offset: number, delta: number): void;
}

/** Run a single-tag fix at its offset as mapped into the current source, and
 * record the length it added at its original position. */
function atShiftedOffset(
  source: string,
  fix: RepairAction,
  shift: OffsetShift,
  apply: (fix: RepairAction) => string | null,
): string | null {
  const next = apply({ ...fix, offset: shift.map(fix.offset) });
  if (next !== null) shift.record(fix.offset, next.length - source.length);
  return next;
}

/**
 * Apply a `wire-field-group` repair (task 0.4-17): a bundle of tag-local edits
 * that bring one field-group to canonical §7.1 wiring — generated ids on the
 * control/label/description/error, `for`/`aria-describedby` cross-links, and
 * `aria-invalid` toggled to match the invalid state. Edits carry absolute offsets
 * into the file source; we apply them in descending offset order so each edit's
 * length change never shifts a still-pending (lower) offset. The whole thing is
 * idempotent — re-running on already-canonical markup makes no change.
 */
function applyWireFieldGroup(source: string, fix: RepairAction, shift: OffsetShift): string | null {
  let edits: TagEdit[];
  try {
    edits = JSON.parse(fix.details.edits) as TagEdit[];
  } catch {
    return null;
  }
  const ordered = [...edits].sort((a, b) => b.offset - a.offset);
  let out = source;
  for (const edit of ordered) {
    const next = editTagAt(out, shift.map(edit.offset), edit.set || {}, edit.remove || []);
    if (next !== null) {
      shift.record(edit.offset, next.length - out.length);
      out = next;
    }
  }
  return out === source ? null : out;
}

/**
 * Set and/or remove attributes on the single tag whose opening `<` is at
 * `tagStart`. Only the tag's own text is rewritten; everything around it is left
 * byte-for-byte intact. Returns the new source, or null if nothing changed (attr
 * already had the target value / wasn't present to remove).
 */
function editTagAt(
  source: string,
  tagStart: number,
  set: Record<string, string>,
  remove: string[],
): string | null {
  if (tagStart < 0 || tagStart >= source.length || source[tagStart] !== "<") return null;
  const gt = findTagEnd(source, tagStart);
  if (gt === -1) return null;

  const original = source.slice(tagStart, gt + 1);
  let tag = original;
  for (const name of remove) tag = removeAttrInTag(tag, name);
  for (const [name, value] of Object.entries(set)) tag = setAttrInTag(tag, name, value);

  if (tag === original) return null;
  return source.slice(0, tagStart) + tag + source.slice(gt + 1);
}

/** Set `name="value"` on a full tag string (`<input …>` / `<input … />`),
 * replacing an existing value (quoted or boolean) or inserting before the close. */
function setAttrInTag(tag: string, name: string, value: string): string {
  const n = escapeRegExp(name);
  const valued = new RegExp(`(\\s${n}\\s*=\\s*)(?:"[^"]*"|'[^']*')`);
  if (valued.test(tag)) return tag.replace(valued, `$1"${value}"`);
  const boolean = new RegExp(`\\s${n}(?=[\\s/>])`);
  if (boolean.test(tag)) return tag.replace(boolean, ` ${name}="${value}"`);
  const insertion = ` ${name}="${value}"`;
  if (tag.endsWith("/>")) return tag.slice(0, -2) + insertion + " />";
  if (tag.endsWith(">")) return tag.slice(0, -1) + insertion + ">";
  return tag;
}

/** Remove `name` (quoted value or boolean) from a full tag string, if present. */
function removeAttrInTag(tag: string, name: string): string {
  const n = escapeRegExp(name);
  return tag
    .replace(new RegExp(`\\s${n}\\s*=\\s*(?:"[^"]*"|'[^']*')`), "")
    .replace(new RegExp(`\\s${n}(?=[\\s/>])`), "");
}

/**
 * Rename a single duplicate id occurrence to a unique value (task 0.4-15). Only
 * emitted by `duplicate-id` when the rename is safe — the id is not referenced by
 * any IDREF attribute or `#frag` URL — so changing it has no behavioral effect.
 * Targets the exact element at `fix.offset` (its opening `<`) and rewrites just
 * that element's `id` attribute, leaving other occurrences untouched.
 */
function renameId(source: string, fix: RepairAction): string | null {
  const { from, to } = fix.details;
  const start = fix.offset;
  if (!from || !to) return null;
  if (start < 0 || start >= source.length || source[start] !== "<") return null;

  const gt = findTagEnd(source, start);
  if (gt === -1) return null;

  const tag = source.slice(start, gt + 1);
  const re = new RegExp(`(\\bid\\s*=\\s*)(["'])${escapeRegExp(from)}\\2`);
  const newTag = tag.replace(re, `$1"${to}"`);
  if (newTag === tag) return null;

  return source.slice(0, start) + newTag + source.slice(gt + 1);
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite a physical, direction-bound CSS property (or text-align value) to its
 * logical equivalent on the flagged line (task 0.3-09). Mappings are 1:1, so the
 * rewrite is deterministic. Targets a single occurrence on `result.line`:
 *
 *   - kind "property": rename the property, e.g. `margin-left:` → `margin-inline-start:`.
 *     A negative lookbehind for [\w-] keeps `left` from matching inside `margin-left`,
 *     and a lookahead for `:` restricts the match to the property position.
 *   - kind "value": swap a text-align value, e.g. `text-align: left` → `text-align: start`.
 */
function rewriteCss(source: string, fix: RepairAction, result: AuditResult): string | null {
  const { kind, physical, logical } = fix.details;
  if (!physical || !logical) return null;

  const lines = source.split("\n");
  const idx = result.line - 1;
  if (idx < 0 || idx >= lines.length) return null;

  const original = lines[idx];
  let updated: string;
  if (kind === "value") {
    const re = new RegExp(`(?<![\\w-])text-align(\\s*:\\s*)${escapeRegExp(physical)}(?![\\w-])`, "i");
    updated = original.replace(re, `text-align$1${logical}`);
  } else {
    const re = new RegExp(`(?<![\\w-])${escapeRegExp(physical)}(?=\\s*:)`, "i");
    updated = original.replace(re, logical);
  }

  if (updated === original) return null;
  lines[idx] = updated;
  return lines.join("\n");
}

/**
 * Add an attribute to the element whose tag starts at `fix.offset`.
 *
 * Located by offset, as `renameId` is. It used to search the source for the
 * first `data-part="…"` (or `data-ui="…"`) named in the message, so with two
 * dialogs in one file the fix for the second was written into the first — and,
 * the first now carrying the attribute, the second's own fix was then "skipped"
 * as already present. Offsets from before the tag-start convention (pointing at
 * the tag's closing `>`) are walked back to their `<`.
 *
 * Never writes an empty `aria-*` value: a bare `aria-labelledby` names nothing,
 * and reporting it as "Fixed" hides a finding that still needs a human.
 */
function addAttribute(source: string, fix: RepairAction, _result: AuditResult): string | null {
  const attr = fix.details.attr ?? fix.details.attribute;
  const value = fix.details.value ?? "";
  if (!attr) return null;
  if (!value && /^aria-/i.test(attr)) return null;

  const tagStart = tagStartAt(source, fix.offset);
  if (tagStart === null) return null;
  const tagEnd = findTagEnd(source, tagStart);
  if (tagEnd === -1) return null;

  const tag = source.slice(tagStart, tagEnd + 1);
  // Already present — valued or boolean — is not something to add again.
  if (new RegExp(`\\s${escapeRegExp(attr)}(?=[\\s=/>])`, "i").test(tag)) return null;

  const insertion = value ? ` ${attr}="${value}"` : ` ${attr}`;
  const closeAt = tag.endsWith("/>") ? tagEnd - 1 : tagEnd;
  const before = source.slice(0, closeAt).replace(/\s+$/, "");
  const spacer = closeAt !== tagEnd ? " " : "";
  return before + insertion + spacer + source.slice(closeAt);
}

/**
 * The opening `<` of the element tag at `offset`: the offset itself when it is
 * one, else the nearest `<` before it (an offset at the tag's closing `>`).
 * Null when that is not the start of an element tag.
 */
function tagStartAt(source: string, offset: number): number | null {
  if (!Number.isInteger(offset) || offset < 0 || offset >= source.length) return null;
  const start = source[offset] === "<" ? offset : source.lastIndexOf("<", offset);
  if (start === -1 || !/^<[a-zA-Z]/.test(source.slice(start, start + 2))) return null;
  return start;
}

/**
 * Index of the `>` that closes the tag opened at `tagStart`, skipping quoted
 * attribute values — a directive like `l-show="count > 0"` carries a `>` that
 * does not end the tag. -1 when the tag never closes.
 */
function findTagEnd(source: string, tagStart: number): number {
  let quote: string | null = null;
  for (let i = tagStart + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  return -1;
}

/**
 * Add a script tag for a recipe controller.
 */
function addScript(source: string, fix: RepairAction, _result: AuditResult): string | null {
  const { src, component } = fix.details;
  if (!src) return null;

  // Check if the script is already referenced
  if (source.includes(src) || source.includes("faqir.js")) return null;

  // Find the closing </body> or end of file
  const bodyClose = source.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    const scriptTag = `  <script type="module" src="ui/recipes/${component}/${src}"></script>\n`;
    return source.slice(0, bodyClose) + scriptTag + source.slice(bodyClose);
  }

  // No </body> tag — append at end
  const scriptTag = `\n<script type="module" src="ui/recipes/${component}/${src}"></script>\n`;
  return source + scriptTag;
}
