// Auto-fix engine — applies deterministic repairs to HTML files based on audit results
// Uses string manipulation (not DOM parsing) for precise, predictable fixes

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AuditResult, RepairAction } from "./rules";
import type { TagEdit } from "./field-wiring";
import { log } from "../utils/logger";

// Fix types whose `offset` indexes into the file source and must be applied
// high-to-low so earlier edits never invalidate later offsets. See `applyRepairs`.
const OFFSET_SENSITIVE = new Set<RepairAction["type"]>(["rename-id", "wire-field-group"]);

export interface RepairSummary {
  files_modified: number;
  fixes_applied: number;
  fixes_skipped: number;
}

/**
 * Apply all fixable audit results to their source files.
 * Returns a summary of what was changed.
 */
export async function applyRepairs(
  results: AuditResult[],
  cwd: string,
): Promise<RepairSummary> {
  const fixable = results.filter(r => r.fix);
  if (fixable.length === 0) {
    return { files_modified: 0, fixes_applied: 0, fixes_skipped: 0 };
  }

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
      continue;
    }

    let source = await Bun.file(filePath).text();
    let modified = false;

    // Apply offset-sensitive fixes first (`rename-id`, `wire-field-group`), in
    // descending byte-offset order: each edits text at a known offset, so
    // processing higher offsets first keeps every lower offset valid (no
    // re-parsing needed). Other fix types don't rely on absolute offsets (they
    // search or use line numbers) and are unaffected.
    const ordered = [...fileResults].sort((a, b) => {
      const ar = OFFSET_SENSITIVE.has(a.fix!.type) ? 0 : 1;
      const br = OFFSET_SENSITIVE.has(b.fix!.type) ? 0 : 1;
      if (ar !== br) return ar - br;
      if (ar === 0) return b.fix!.offset - a.fix!.offset;
      return 0;
    });

    for (const result of ordered) {
      const fix = result.fix!;
      const newSource = applyFix(source, fix, result);
      if (newSource !== null && newSource !== source) {
        source = newSource;
        modified = true;
        fixesApplied++;
        log.step(`Fixed: ${result.message}`);
      } else {
        fixesSkipped++;
      }
    }

    if (modified) {
      await Bun.write(filePath, source);
      filesModified++;
    }
  }

  return { files_modified: filesModified, fixes_applied: fixesApplied, fixes_skipped: fixesSkipped };
}

/**
 * Apply a single fix to an HTML source string.
 * Returns the modified source, or null if the fix could not be applied.
 */
function applyFix(source: string, fix: RepairAction, result: AuditResult): string | null {
  switch (fix.type) {
    case "add-attribute":
      return addAttribute(source, fix, result);
    case "add-script":
      return addScript(source, fix, result);
    case "rewrite-css":
      return rewriteCss(source, fix, result);
    case "rename-id":
      return renameId(source, fix);
    case "wire-field-group":
      return applyWireFieldGroup(source, fix);
    default:
      return null;
  }
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
function applyWireFieldGroup(source: string, fix: RepairAction): string | null {
  let edits: TagEdit[];
  try {
    edits = JSON.parse(fix.details.edits) as TagEdit[];
  } catch {
    return null;
  }
  const ordered = [...edits].sort((a, b) => b.offset - a.offset);
  let out = source;
  for (const edit of ordered) {
    const next = editTagAt(out, edit.offset, edit.set || {}, edit.remove || []);
    if (next !== null) out = next;
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
  const gt = source.indexOf(">", tagStart);
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

  const gt = source.indexOf(">", start);
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
 * Add an attribute to an element found by its component/part context.
 */
function addAttribute(source: string, fix: RepairAction, result: AuditResult): string | null {
  const { attr, value } = fix.details;
  if (!attr) return null;

  // Find the element in the source by its data-ui/data-part context
  const componentName = result.component_name;
  const message = result.message;

  // Determine the target element: look for the part mentioned in the message
  let searchPattern: string;
  const partMatch = message.match(/\[data-part="(\w+)"\]/);
  if (partMatch) {
    searchPattern = `data-part="${partMatch[1]}"`;
  } else {
    searchPattern = `data-ui="${componentName}"`;
  }

  // Find the tag containing this pattern
  const idx = source.indexOf(searchPattern);
  if (idx === -1) return null;

  // Find the end of this tag (the closing >)
  const tagEnd = source.indexOf(">", idx);
  if (tagEnd === -1) return null;

  // Check if the attribute already exists on this element
  // Walk back to find the opening < of this tag
  let tagStart = idx;
  while (tagStart > 0 && source[tagStart] !== "<") tagStart--;
  const tagContent = source.slice(tagStart, tagEnd + 1);

  // If the attribute already exists, skip
  const attrPattern = new RegExp(`\\b${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  if (attrPattern.test(tagContent)) return null;

  // Also check for boolean attribute (no value)
  const boolPattern = new RegExp(`\\b${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|>|/)`);
  if (boolPattern.test(tagContent)) return null;

  // Insert the attribute before the closing >
  const insertion = value ? ` ${attr}="${value}"` : ` ${attr}`;

  // Handle self-closing tags
  if (source[tagEnd - 1] === "/") {
    return source.slice(0, tagEnd - 1) + insertion + " />" + source.slice(tagEnd + 1);
  }

  return source.slice(0, tagEnd) + insertion + source.slice(tagEnd);
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
