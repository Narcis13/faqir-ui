/**
 * The Night Shift page (`night-shift/index.html`).
 *
 * The loop that generates while nobody is watching — `docs/night-shift.md`,
 * `docs/dream-rubric.md`, `.faqir-dreams/queue.json`, `dreams.tsv` and
 * `scripts/dream/*` — rendered as one page. Every table here is read from the
 * file that is its source of truth at build time: the queue and the ledger are
 * parsed, the rubric's criteria and threshold are parsed out of the versioned
 * document, and the prose sections are the documents' own sections rendered
 * through a small markdown parser (headings, lists, paragraphs, fences, tables).
 *
 * A build with none of those files on disk still renders the page: each block
 * that reads one falls back to an honest empty state, so a packaged registry
 * without the shift's state never fails the docs build.
 *
 * Imports from `../docs` are used only inside functions: `docs.ts` imports this
 * module, and a top-level use would evaluate before the shell exists.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  code,
  esc,
  escAttr,
  inlineMarkdown,
  relUrl,
  renderShell,
  section,
  slug,
  table,
} from "../docs";
import type { PageContext, SiteFile } from "./context";

export const NIGHT_SHIFT_PAGE = "night-shift/index.html";

/** Where the shift keeps its state, relative to the package root (`scripts/dream/theme.mjs`). */
export const NIGHT_SHIFT_FILES = {
  doc: "docs/night-shift.md",
  rubric: "docs/dream-rubric.md",
  queue: ".faqir-dreams/queue.json",
  ledger: "dreams.tsv",
  digest: "DREAMS.md",
  skill: ".claude/commands/faqir-dream.md",
} as const;

// ---------------------------------------------------------------------------
// A small markdown parser: the subset the two documents use
// ---------------------------------------------------------------------------

export type MdBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "fence"; code: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "rule" };

/**
 * Parse markdown into blocks. Handles ATX headings, paragraphs, fenced code,
 * `-`/`*`/`1.` lists with indented continuation lines, pipe tables, `---`
 * rules, and skips HTML comments. Anything else is a paragraph — the two
 * documents are written by us, and the subset is the subset we write.
 */
export function parseMarkdown(markdown: string): MdBlock[] {
  const out: MdBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") {
      i++;
      continue;
    }
    if (trimmed.startsWith("<!--")) {
      while (i < lines.length && !lines[i].includes("-->")) i++;
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      out.push({ kind: "fence", code: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      out.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^-{3,}\s*$/.test(trimmed) || /^\*{3,}\s*$/.test(trimmed)) {
      out.push({ kind: "rule" });
      i++;
      continue;
    }
    if (line.startsWith("|") && lines[i + 1]?.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i]
          .slice(1, lines[i].endsWith("|") ? -1 : undefined)
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      out.push({ kind: "table", rows });
      continue;
    }
    const listStart = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (listStart) {
      const ordered = /\d/.test(listStart[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m && m[1].length === listStart[1].length) {
          items.push(m[3]);
          i++;
          continue;
        }
        // An indented continuation line belongs to the current item.
        if (items.length > 0 && lines[i].trim() !== "" && /^\s+/.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
          continue;
        }
        break;
      }
      out.push({ kind: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("|") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("<!--")
    ) {
      paragraph.push(lines[i++].trim());
    }
    if (paragraph.length === 0) {
      i++;
      continue;
    }
    out.push({ kind: "paragraph", text: paragraph.join(" ") });
  }
  return out;
}

export interface MdSection {
  level: number;
  heading: string;
  blocks: MdBlock[];
}

/** Split parsed blocks into sections at headings of exactly `level`. */
export function splitSections(blocks: MdBlock[], level: number): MdSection[] {
  const sections: MdSection[] = [];
  let current: MdSection | null = null;
  for (const block of blocks) {
    if (block.kind === "heading" && block.level === level) {
      current = { level, heading: block.text, blocks: [] };
      sections.push(current);
      continue;
    }
    if (block.kind === "heading" && block.level < level) {
      current = null;
      continue;
    }
    if (current) current.blocks.push(block);
  }
  return sections;
}

/** The section whose heading matches, or null. */
export function findSection(sections: MdSection[], heading: string | RegExp): MdSection | null {
  return (
    sections.find((s) =>
      typeof heading === "string" ? s.heading === heading : heading.test(s.heading),
    ) ?? null
  );
}

/**
 * Render blocks to HTML. Headings are shifted by `shift` levels (a document's
 * `##` becomes the page's `<h3>`) and given ids under `idPrefix` so two
 * documents on one page never collide.
 */
export function renderBlocks(blocks: MdBlock[], options: { shift: number; idPrefix: string }): string {
  const out: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "heading": {
        const level = Math.min(6, block.level + options.shift);
        const id = `${options.idPrefix}-${slug(block.text.replace(/`/g, ""))}`;
        out.push(`      <h${level} id="${esc(id)}">${inlineMarkdown(block.text)}</h${level}>`);
        break;
      }
      case "paragraph":
        out.push(`      <p>${inlineMarkdown(block.text)}</p>`);
        break;
      case "fence":
        out.push(`      <pre tabindex="0"><code>${esc(block.code)}</code></pre>`);
        break;
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        out.push(
          `      <${tag}>\n${block.items.map((item) => `        <li>${inlineMarkdown(item)}</li>`).join("\n")}\n      </${tag}>`,
        );
        break;
      }
      case "table": {
        const [head, ...body] = block.rows;
        out.push(table(head ?? [], body.map((row) => row.map(inlineMarkdown)), "No rows."));
        break;
      }
      case "rule":
        break;
    }
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// The rubric, parsed out of the versioned document
// ---------------------------------------------------------------------------

export interface RubricCriterion {
  index: number;
  key: string;
  question: string;
}

export interface RubricSummary {
  version: string | null;
  criteria: RubricCriterion[];
  scale: { min: number; max: number } | null;
  threshold: { floor: number | null; mean: number | null };
  sections: MdSection[];
}

/**
 * The facts the page tabulates, read from `docs/dream-rubric.md` the same way
 * `tests/dream/rubric.test.ts` reads them: the version line, the criteria table
 * under "The five criteria", the scale table's ends and the threshold's two
 * numbers. The document is the source; `scripts/dream/rubric.mjs` is asserted
 * against it, so parsing the prose is parsing the code.
 */
export function parseRubric(markdown: string): RubricSummary {
  const blocks = parseMarkdown(markdown);
  const sections = splitSections(blocks, 2);
  const versionMatch = /\*\*Version:\s*([^*]+?)\*\*/.exec(markdown);
  const criteria: RubricCriterion[] = [];
  const criteriaSection = findSection(sections, /criteria/i);
  const criteriaTable = criteriaSection?.blocks.find((b) => b.kind === "table");
  if (criteriaTable && criteriaTable.kind === "table") {
    for (const row of criteriaTable.rows.slice(1)) {
      const [index, key, question] = row;
      if (!key) continue;
      criteria.push({
        index: Number.parseInt(index ?? "", 10) || criteria.length + 1,
        key: key.replace(/`/g, "").trim(),
        question: question ?? "",
      });
    }
  }
  let scale: RubricSummary["scale"] = null;
  const scaleSection = findSection(sections, /scale/i);
  const scaleTable = scaleSection?.blocks.find((b) => b.kind === "table");
  if (scaleTable && scaleTable.kind === "table") {
    const scores = scaleTable.rows
      .slice(1)
      .map((r) => Number.parseInt(r[0] ?? "", 10))
      .filter((n) => Number.isFinite(n));
    if (scores.length > 0) scale = { min: Math.min(...scores), max: Math.max(...scores) };
  }
  const floorMatch = /no criterion is below\s+\*\*(\d+(?:\.\d+)?)\*\*/i.exec(markdown);
  const meanMatch = /mean of the five is at least\s+\*\*(\d+(?:\.\d+)?)\*\*/i.exec(markdown);
  return {
    version: versionMatch ? versionMatch[1].trim() : null,
    criteria,
    scale,
    threshold: {
      floor: floorMatch ? Number(floorMatch[1]) : null,
      mean: meanMatch ? Number(meanMatch[1]) : null,
    },
    sections,
  };
}

// ---------------------------------------------------------------------------
// The queue and the ledger
// ---------------------------------------------------------------------------

export interface QueueBrief {
  id: string;
  kind: string;
  brief: string;
  axes_hint?: Record<string, unknown>;
  added: string;
  status: string;
}

/** Read `.faqir-dreams/queue.json`; null when it is absent or unreadable. */
export function readQueueFile(path: string): QueueBrief[] | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed?.briefs)) return null;
    return parsed.briefs.map((b: Record<string, unknown>) => ({
      id: String(b.id ?? ""),
      kind: String(b.kind ?? ""),
      brief: String(b.brief ?? ""),
      axes_hint: typeof b.axes_hint === "object" && b.axes_hint ? (b.axes_hint as Record<string, unknown>) : undefined,
      added: String(b.added ?? ""),
      status: String(b.status ?? ""),
    }));
  } catch {
    return null;
  }
}

/** `{ type: { pairing: "mono" } }` → `[["type.pairing", "mono"]]`, sorted by key. */
export function flattenHint(hint: Record<string, unknown> | undefined): [string, string][] {
  const out: [string, string][] = [];
  const walk = (value: unknown, path: string) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k);
      return;
    }
    out.push([path, Array.isArray(value) ? value.join(", ") : String(value)]);
  };
  if (hint) walk(hint, "");
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

export interface LedgerRow {
  cells: Record<string, string>;
}

export interface LedgerFile {
  preamble: string[];
  columns: string[];
  rows: LedgerRow[];
}

/** Read `dreams.tsv` the way `scripts/dream/ledger.mjs` writes it; null when absent. */
export function readLedgerFile(path: string): LedgerFile | null {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").replace(/\r\n/g, "\n").split("\n");
  const preamble: string[] = [];
  let columns: string[] | null = null;
  const rows: LedgerRow[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    if (line.startsWith("#")) {
      preamble.push(line.replace(/^#\s*/, ""));
      continue;
    }
    const cells = line.split("\t");
    if (!columns) {
      columns = cells;
      continue;
    }
    const record: Record<string, string> = {};
    columns.forEach((column, index) => {
      record[column] = cells[index] ?? "";
    });
    rows.push({ cells: record });
  }
  if (!columns) return null;
  return { preamble, columns, rows };
}

/** The theme a ledger row is about: the `theme:` prefix of its description, as the digest reads it. */
export function themeOfRow(row: LedgerRow): string | null {
  const match = /^([a-z][a-z0-9-]*):/.exec(row.cells.description ?? "");
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** One step of the loop, as the page draws it. Sentences are the documents' own. */
export const LOOP_STEPS: readonly { id: string; name: string; file: string; sentence: string }[] = [
  {
    id: "queue",
    name: "Queue",
    file: ".faqir-dreams/queue.json",
    sentence: "Twelve briefs, in running order: the first pending one is what the shift dreams next.",
  },
  {
    id: "dream",
    name: "Dream",
    file: "/faqir-dream",
    sentence: "One dream per run: the agent reads the brief and writes the seed, and nothing else by hand.",
  },
  {
    id: "gate",
    name: "Gate",
    file: "scripts/dream/theme.mjs",
    sentence:
      "A branch, nine gates in order stopping at the first failure, the diff checked against the allow-list, then a commit or a deleted branch.",
  },
  {
    id: "ledger",
    name: "Ledger",
    file: "dreams.tsv",
    sentence: "Append-only, one row per dream: keep with its distinctiveness, or discard with the gate that stopped it.",
  },
  {
    id: "digest",
    name: "Digest",
    file: "DREAMS.md",
    sentence:
      "The week of it, regenerated from the ledger and every unmerged dream branch; a kept dream is a branch waiting for a human, not a merge.",
  },
] as const;

/** What each command does, read from the scripts and the skill they invoke. */
export const NIGHT_SHIFT_COMMANDS: readonly {
  command: string;
  runs: string;
  usage: string;
  does: string;
}[] = [
  {
    command: "bun run dream",
    runs: "node scripts/dream/theme.mjs",
    usage: "--brief <id> [--seed <path>] [--dry-run]",
    does:
      "One brief in, one gated branch out, or a discard row with a reason. Refuses a dirty tree, releases briefs a crashed run left dreaming, marks the brief, creates dream/theme-<id>, runs the nine gates in order, checks the diff, commits the theme and then the ledger row, and writes the scorecard and the light/dark pair to .faqir-dreams/out/<id>/. With --dry-run it prints the branch and the gate commands and writes nothing, seed or no seed.",
  },
  {
    command: "bun run dream:nightly",
    runs: "bash scripts/dream/nightly.sh",
    usage: "[--dry-run] [--keep] [--brief <id>] [--base <ref>] [--worktree <path>]",
    does:
      "One dream in a worktree of its own: git worktree add --detach from main (DREAM_BASE), node_modules symlinked in, DREAM_CMD run inside it (default: claude -p \"/faqir-dream next\" --permission-mode acceptEdits), the bundle harvested back to .faqir-dreams/out/, a dirty worktree kept and named rather than removed, tonight's new dream/* branches listed, DREAMS.md regenerated in the repository, and the dream's exit status passed through. It runs git rev-parse, worktree, branch and status and nothing else.",
  },
  {
    command: "bun run dream:digest",
    runs: "node scripts/dream/digest.mjs",
    usage: "[--week YYYY-MM-DD] [--out DREAMS.md] [--print]",
    does:
      "Rewrites DREAMS.md from dreams.tsv unioned with every unmerged dream/* branch's copy, the queue, each dream's scorecard, and gh pr list when gh answers. A pure function of its inputs: unchanged bytes are not rewritten. --print writes to stdout instead; --week picks an older ISO week (Monday to Sunday, UTC).",
  },
  {
    command: "bun run dream:snapshot",
    runs: "node scripts/dream/snapshot.mjs",
    usage: "--theme <name> --out <dir>",
    does:
      "A 1280×1600 light/dark PNG pair of registry/themes/<name>.preview.html, opened over file:// with ?scheme=light and ?scheme=dark. Dev-time only: Playwright's Chromium is loaded lazily, and nothing under bun run test launches it. Gate nine calls it; the morning review calls it to remake a bundle from a committed theme.",
  },
  {
    command: "/faqir-dream",
    runs: ".claude/commands/faqir-dream.md",
    usage: "[brief-id | next | status | dry-run]",
    does:
      "The skill: check the tree is clean and the dry run passes, read the brief and what already ships, write .faqir-dreams/seeds/<id>.seed.json plus the two source edits the generators require, hand it to theme.mjs, score both PNGs against the rubric into the scorecard's taste block naming the judge, report, refresh the digest, and stop. status prints queue counts and the last ledger rows without dreaming; dry-run is theme.mjs --dry-run.",
  },
] as const;

/** What `DREAMS.md` carries, section by section, as `renderDigest` writes it. */
export const DIGEST_CONTENTS: readonly { part: string; detail: string }[] = [
  {
    part: "Header",
    detail:
      "A generated-file notice, the sentence naming docs/night-shift.md and docs/dream-rubric.md, and the week's heading: Week of <Monday> – <Sunday>.",
  },
  {
    part: "Counts",
    detail:
      "N dreams · kept · discarded · briefs still queued, every number read from the ledger and the queue. A week with no rows says so and points at tail dreams.tsv.",
  },
  {
    part: "Kept",
    detail:
      "One entry per kept dream: the brief quoted, the branch and commit, distinctiveness as axes from the nearest shipped theme with ΔE when the scorecard has it, the taste score with its rubric version and judge (or unscored, and why the block is invalid), links to the light and dark snapshots and the scorecard, the open pull request when gh answers, and the five per-criterion scores with their sentences.",
  },
  {
    part: "Discarded",
    detail:
      "A table of brief, gates (4/9 (gen:theme-previews)) and why, followed by the line that a discard with a reason is the cheapest data the loop produces.",
  },
  {
    part: "Still queued",
    detail: "Every pending brief with the date it was added and the first 110 characters of what it is aiming at.",
  },
  {
    part: "Earlier weeks",
    detail: "One line per earlier week with its dream, kept and discarded counts; absent when this is the only week.",
  },
  {
    part: "Footer",
    detail: "How to regenerate the digest, and how to remake a snapshot pair from a committed theme with dream:snapshot.",
  },
] as const;

const QUEUE_STATUS_VARIANT: Record<string, string> = {
  pending: "default",
  dreaming: "warning",
  kept: "success",
  discarded: "destructive",
};

const LEDGER_STATUS_VARIANT: Record<string, string> = {
  baseline: "secondary",
  keep: "success",
  discard: "destructive",
};

function readOptional(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function renderNightShiftPages(ctx: PageContext): SiteFile[] {
  const pagePath = NIGHT_SHIFT_PAGE;
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const badge = (variant: string, text: string) =>
    `<span data-ui="badge" data-variant="${escAttr(variant)}">${esc(text)}</span>`;
  const emptyState = (what: string, path: string, why: string) =>
    `      <div data-ui="callout" data-variant="muted" role="note" data-docs-night-empty>\n` +
    `        <div data-part="content"><p><strong>${esc(what)} is not on this build.</strong> ${esc(why)} It lives at ${code(path)} in the repository.</p></div>\n` +
    `      </div>`;

  const at = (rel: string) => join(ctx.packageRoot, rel);
  const docText = readOptional(at(NIGHT_SHIFT_FILES.doc));
  const rubricText = readOptional(at(NIGHT_SHIFT_FILES.rubric));
  const queue = readQueueFile(at(NIGHT_SHIFT_FILES.queue));
  const ledger = readLedgerFile(at(NIGHT_SHIFT_FILES.ledger));
  const shippedThemes = new Set(ctx.themes.map((t) => t.name));

  const docSections = docText ? splitSections(parseMarkdown(docText), 2) : [];
  const docSection = (heading: RegExp, idPrefix: string): string | null => {
    const found = findSection(docSections, heading);
    return found ? renderBlocks(found.blocks, { shift: 1, idPrefix }) : null;
  };
  const rubric = rubricText ? parseRubric(rubricText) : null;

  // ── the loop ──────────────────────────────────────────────────────────────
  const loop =
    `      <p>Night Shift is a skill plus a ledger plus a queue. No new infrastructure and no new dependency: ` +
    `the generators, the gates and the browser it screenshots with all shipped before it did. ` +
    `One dream kind so far, ${code("theme")}; run by hand or by ${code("scripts/dream/nightly.sh")} on a schedule, ` +
    `scored against a versioned rubric, summarized weekly into ${code("DREAMS.md")}.</p>\n` +
    `      <ol data-docs-night-loop>\n` +
    LOOP_STEPS.map(
      (step) =>
        `        <li data-docs-night-step>\n` +
        `          <span data-docs-night-step-name>${esc(step.name)}</span>\n` +
        `          <span data-docs-night-step-file><span data-ui="text" data-variant="mono" data-size="sm">${esc(step.file)}</span></span>\n` +
        `          <span data-docs-night-step-sentence>${esc(step.sentence)}</span>\n` +
        `        </li>`,
    ).join("\n") +
    `\n      </ol>\n` +
    `      <p data-docs-night-morning-line>Then it is morning. A human merges, edits the seed and regenerates, or closes the branch. ` +
    `Whatever they choose, the ledger row stays: a theme rejected on taste is the row that teaches the next brief something.</p>`;

  // ── the files, the gates, the guards ──────────────────────────────────────
  const filesBody =
    docSection(/^The files$/, "files") ??
    emptyState("The file map", NIGHT_SHIFT_FILES.doc, "The list of what the shift reads and writes is in that document.");
  const gatesBody =
    docSection(/^The gates$/, "gates") ??
    emptyState("The gate list", NIGHT_SHIFT_FILES.doc, "The nine gates and what each proves are tabulated in that document.");
  const guardsBody =
    docSection(/^The guards$/, "guards") ??
    emptyState("The guard list", NIGHT_SHIFT_FILES.doc, "The guards and their rules are tabulated in that document.");

  // ── the rubric ────────────────────────────────────────────────────────────
  let rubricBody: string;
  if (rubric && rubric.criteria.length > 0) {
    const floor = rubric.threshold.floor;
    const mean = rubric.threshold.mean;
    const scale = rubric.scale ? `${rubric.scale.min}–${rubric.scale.max}` : "1–5";
    const weight = `1 / ${rubric.criteria.length}`;
    rubricBody =
      `      <p>${badge("primary", `rubric ${rubric.version ?? "unversioned"}`)} ${badge(
        "default",
        `${rubric.criteria.length} criteria`,
      )} ${badge("default", `scored ${scale}`)}${
        floor !== null && mean !== null ? ` ${badge("secondary", `floor ${floor} · mean ≥ ${mean}`)}` : ""
      }</p>\n` +
      `      <p>Deterministic gates catch correctness. They do not catch <em>this is ugly</em> or <em>this is the same thing again</em>. ` +
      `The distinctiveness gate answers the second numerically; this rubric is the first question. Five criteria, each scored ${esc(
        scale,
      )} from the light/dark PNG pair with one sentence saying why, by a vision-capable model that is named in the scorecard. ` +
      `The version travels with every score, so a digest never averages across a revision. The prose half is ${code(
        NIGHT_SHIFT_FILES.rubric,
      )}; the code half is ${code("scripts/dream/rubric.mjs")}, and a test asserts the two agree.</p>\n` +
      `      <h3 id="rubric-criteria">The five criteria</h3>\n` +
      `      <div data-docs-night-criteria>\n` +
      rubric.criteria
        .map(
          (c) =>
            `        <div data-ui="card" data-variant="outlined" data-docs-night-criterion>\n` +
            `          <div data-part="header"><h4 data-part="title" id="${escAttr(`criterion-${c.key}`)}"><span data-docs-night-criterion-index>${esc(
              String(c.index),
            )}</span> <span data-ui="text" data-variant="mono">${esc(c.key)}</span></h4></div>\n` +
            `          <div data-part="body"><p>${esc(c.question.replace(/\*\*/g, ""))}</p></div>\n` +
            `        </div>`,
        )
        .join("\n") +
      `\n      </div>\n` +
      table(
        ["#", "Criterion", "Weight", "Scale", "Floor", "Fails a PR when"],
        rubric.criteria.map((c) => [
          esc(String(c.index)),
          code(c.key),
          esc(weight),
          esc(scale),
          floor === null ? "—" : esc(String(floor)),
          floor === null ? "—" : `${esc(`below ${floor}`)}${c.key === "fit" ? " (the one that fails a beautiful page)" : ""}`,
        ]),
        "No criteria.",
      ) +
      `\n      <p>The five weigh the same: the threshold is a floor on every criterion and a mean over all of them, ` +
      `${floor !== null && mean !== null ? `nothing below ${esc(String(floor))} and a mean of at least ${esc(String(mean))}. ` : ""}` +
      `It decides what a PR is opened for and deletes nothing.</p>\n` +
      renderBlocks(
        rubric.sections
          .filter((s) => !/criteria/i.test(s.heading))
          .flatMap((s) => [{ kind: "heading", level: 2, text: s.heading } as MdBlock, ...s.blocks]),
        { shift: 1, idPrefix: "rubric" },
      );
  } else {
    rubricBody = emptyState(
      "The taste rubric",
      NIGHT_SHIFT_FILES.rubric,
      "Its five criteria, scale and threshold are parsed from that document at build time.",
    );
  }

  // ── the queue ─────────────────────────────────────────────────────────────
  let queueBody: string;
  if (queue === null) {
    queueBody = emptyState(
      "The queue",
      NIGHT_SHIFT_FILES.queue,
      "The briefs the shift is going to dream, in the order it will dream them, are in that file.",
    );
  } else {
    const counts = new Map<string, number>();
    for (const b of queue) counts.set(b.status, (counts.get(b.status) ?? 0) + 1);
    const countBadges = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([status, n]) => badge(QUEUE_STATUS_VARIANT[status] ?? "default", `${n} ${status}`))
      .join(" ");
    queueBody =
      `      <p>${badge("primary", `${queue.length} brief${queue.length === 1 ? "" : "s"}`)} ${countBadges}</p>\n` +
      `      <p>The running order is the file order; there is deliberately no priority field. ${code("pickNext()")} takes the first ` +
      `pending brief, ${code("dreaming")} marks a run in progress so a crash is distinguishable from a night that never started, ` +
      `and ${code("kept")} and ${code("discarded")} are terminal: a brief worth trying again is a new brief with what was learnt written into it. ` +
      `The hint is a partial seed the agent may override after looking at what already ships.</p>\n` +
      (queue.length === 0
        ? `      <p><em>The queue is empty. An empty queue is a quiet night, not an error.</em></p>`
        : `      <div data-docs-night-queue>\n` +
          table(
            ["Brief", "Status", "Added", "Aiming at", "Axes hint"],
            queue.map((b) => [
              `<span data-ui="text" data-variant="mono">${esc(b.id)}</span>`,
              badge(QUEUE_STATUS_VARIANT[b.status] ?? "default", b.status),
              esc(b.added),
              esc(b.brief),
              flattenHint(b.axes_hint).length === 0
                ? "—"
                : `<span data-docs-night-hint>${flattenHint(b.axes_hint)
                    .map(([k, v]) => `<span data-docs-night-hint-pair><span data-ui="text" data-variant="mono" data-size="xs">${esc(k)}</span> ${esc(v)}</span>`)
                    .join(" ")}</span>`,
            ]),
            "No briefs.",
          ) +
          `\n      </div>`);
  }

  // ── the ledger ────────────────────────────────────────────────────────────
  let ledgerBody: string;
  if (ledger === null) {
    ledgerBody = emptyState(
      "The ledger",
      NIGHT_SHIFT_FILES.ledger,
      "One append-only row per dream, thirteen tab-separated columns, lives in that file.",
    );
  } else {
    const rows = ledger.rows;
    const kept = rows.filter((r) => r.cells.status === "keep").length;
    const discarded = rows.filter((r) => r.cells.status === "discard").length;
    const linkTheme = (row: LedgerRow): string => {
      const theme = themeOfRow(row);
      if (row.cells.status === "keep" && theme && shippedThemes.has(theme)) {
        return `<a data-ui="link" href="${u(`themes/${theme}/index.html`)}"><span data-ui="text" data-variant="mono">${esc(
          row.cells.id,
        )}</span></a>`;
      }
      return `<span data-ui="text" data-variant="mono">${esc(row.cells.id)}</span>`;
    };
    ledgerBody =
      `      <p>${badge("primary", `${rows.length} row${rows.length === 1 ? "" : "s"}`)} ${badge("success", `${kept} kept`)} ${badge(
        "destructive",
        `${discarded} discarded`,
      )}${ledger.preamble.map((line) => ` ${badge("default", line)}`).join("")}</p>\n` +
      `      <p>${code("dreams.tsv")} is append-only: ${esc(String(ledger.columns.length))} tab-separated columns, ` +
      `${code("-")} where a cell has no value, and a tab or a newline in a cell is a refusal rather than an escape. ` +
      `${code("metric")} is the theme's axis distance to its nearest shipped peer, ${code("delta")} is measured against the last row of the same kind, ` +
      `${code("gates")} reads ${code("9/9")} on a keep and ${code("4/9 (gen:theme-previews)")} on a discard, and ${code(
        "taste",
      )} carries score, rubric and judge in one cell because the column count is frozen. ` +
      `A kept dream commits its row on its own branch, after the theme, so the row can cite the theme's hash.</p>\n` +
      `      <div data-docs-night-ledger tabindex="0" role="region" aria-label="Dream ledger, scrolls sideways">\n` +
      table(
        ledger.columns.map((c) => c),
        rows.map((row) =>
          ledger.columns.map((column) => {
            const value = row.cells[column] ?? "";
            if (column === "status") return badge(LEDGER_STATUS_VARIANT[value] ?? "default", value);
            if (column === "id") return linkTheme(row);
            if (column === "description") return esc(value);
            return `<span data-ui="text" data-variant="mono" data-size="sm">${esc(value)}</span>`;
          }),
        ),
        "No rows yet. The first dream writes the first one.",
      ) +
      `\n      </div>`;
  }

  // ── the commands ──────────────────────────────────────────────────────────
  const commandsBody =
    `      <p>Four package scripts and one skill. Everything that decides anything lives in ${code(
      "scripts/dream/theme.mjs",
    )} and ${code("scripts/dream/guards.mjs")}; the runner and the skill are two ways to the same place.</p>\n` +
    `      <div data-docs-night-commands>\n` +
    NIGHT_SHIFT_COMMANDS.map(
      (c) =>
        `        <div data-ui="card" data-variant="filled" data-docs-night-command>\n` +
        `          <div data-part="header"><h3 data-part="title" id="${escAttr(`command-${c.command.replace(/^\/|^bun run /, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`)}"><span data-ui="text" data-variant="mono">${esc(
          c.command,
        )}</span></h3></div>\n` +
        `          <div data-part="body">\n` +
        `            <pre tabindex="0"><code>${esc(`${c.runs} ${c.usage}`)}</code></pre>\n` +
        `            <p>${esc(c.does)}</p>\n` +
        `          </div>\n` +
        `        </div>`,
    ).join("\n") +
    `\n      </div>\n` +
    `      <h3 id="commands-schedule">Scheduling it</h3>\n` +
    `      <p>Nothing above needs a schedule to work; the schedule is what makes it a shift. ` +
    `Locally, cron or launchd runs the nightly script. In the cloud, a Claude Code scheduled routine brings its own checkout, so schedule the skill rather than the script.</p>\n` +
    `      <pre tabindex="0"><code>${esc(
      [
        "# local — crontab -e",
        "0 3 * * * cd /path/to/faqir && bash scripts/dream/nightly.sh >> /tmp/faqir-night.log 2>&1",
        "",
        "# local — launchd (macOS), ~/Library/LaunchAgents/dev.faqir.night.plist",
        "#   ProgramArguments: /bin/bash -lc 'cd /path/to/faqir && bash scripts/dream/nightly.sh'",
        "#   StartCalendarInterval: { Hour: 3, Minute: 0 }",
        "",
        "# cloud — a Claude Code scheduled routine (/schedule): every day at 03:00 — /faqir-dream",
        "",
        "# run the script directly inside the nightly worktree instead of the skill",
        "DREAM_CMD='node scripts/dream/theme.mjs --brief arcade' bash scripts/dream/nightly.sh",
      ].join("\n"),
    )}</code></pre>`;

  // ── the digest ────────────────────────────────────────────────────────────
  const digestBody =
    `      <p>${code("DREAMS.md")} is the week of the ledger a human reads on a Monday. Every number in it is read, never kept: ` +
    `counts from the ledger, distinctiveness from the row the generator measured, taste from the scorecard the scorer wrote, ` +
    `open pull requests from ${code("gh")} when ${code("gh")} is there, and no PR section at all when it is not. ` +
    `It reads unmerged ${code("dream/*")} branches too, because a kept dream commits its row on its branch; ` +
    `a digest that only read HEAD would report last night as nothing until someone merged it. ` +
    `${code("renderDigest")} is a pure function of the data, so re-running it on an unchanged week rewrites nothing, which is what lets the nightly runner run it every night.</p>\n` +
    table(
      ["Section", "What it carries"],
      DIGEST_CONTENTS.map((d) => [`<strong>${esc(d.part)}</strong>`, esc(d.detail)]),
      "No sections.",
    ) +
    `\n      <p>The runner writes it in your checkout, not in the worktree, so a night that produced a dream leaves ${code(
      "DREAMS.md",
    )} modified and uncommitted for the morning. Commit it or check it out; the next hand run of the skill refuses to start until you have.</p>`;

  // ── the morning ───────────────────────────────────────────────────────────
  const morningBody =
    docSection(/^The morning review$/, "morning") ??
    emptyState("The morning review", NIGHT_SHIFT_FILES.doc, "What a kept dream and a discarded one each leave behind is in that document.");
  const notYetBody =
    docSection(/^What is not here yet$/, "not-yet") ??
    emptyState("The open items", NIGHT_SHIFT_FILES.doc, "The list of what v0 does not do yet is in that document.");

  // ── assemble ──────────────────────────────────────────────────────────────
  const toc: [string, string][] = [
    ["loop", "The loop"],
    ["files", "The files"],
    ["gates", "The gates"],
    ["guards", "The guards"],
    ["rubric", "The taste rubric"],
    ["queue", "The queue"],
    ["ledger", "The ledger"],
    ["commands", "The commands"],
    ["digest", "The digest"],
    ["morning", "The morning review"],
    ["not-yet", "What is not here yet"],
  ];

  const body =
    `      <div data-docs-night-shift>\n` +
    `      <div data-docs-night-hero>\n` +
    `      <h1>Night Shift</h1>\n` +
    `      <p>${badge("primary", "v0")} ${badge("default", "one dream kind: theme")} ${badge("default", "tasks 1.1N-01 · 1.1N-02")} ${badge(
      "secondary",
      "a human merges",
    )}</p>\n` +
    `      <p data-docs-night-lede>The framework generates while nobody is watching, and a human decides in the morning. ` +
    `An autonomous nightly loop takes the next brief from a queue, turns it into a theme seed, runs the theme through nine deterministic gates, ` +
    `scores the light/dark pair against a versioned taste rubric, and lands it as a PR-ready branch or deletes it and writes down why. ` +
    `Nothing it does leaves the machine on its own: the guards are code, the ledger is append-only, and the only way out is a pull request a person opens.</p>\n` +
    `      </div>\n` +
    `      <nav aria-label="On this page" data-docs-toc>\n        <ul>\n` +
    toc.map(([id, label]) => `          <li><a data-ui="link" href="#${escAttr(id)}">${esc(label)}</a></li>`).join("\n") +
    `\n        </ul>\n      </nav>\n` +
    section("loop", "The loop", loop) +
    "\n" +
    section("files", "The files", filesBody) +
    "\n" +
    section("gates", "The gates", gatesBody) +
    "\n" +
    section("guards", "The guards", guardsBody) +
    "\n" +
    section("rubric", "The taste rubric", rubricBody) +
    "\n" +
    section("queue", "The queue", queueBody) +
    "\n" +
    section("ledger", "The ledger", ledgerBody) +
    "\n" +
    section("commands", "The commands", commandsBody) +
    "\n" +
    section("digest", "The digest", digestBody) +
    "\n" +
    section("morning", "The morning review", morningBody) +
    "\n" +
    section("not-yet", "What is not here yet", notYetBody) +
    `\n      </div>`;

  return [
    {
      path: pagePath,
      content: renderShell({
        pagePath,
        title: `Night Shift · ${ctx.config.title}`,
        description:
          "The autonomous nightly loop: a queue of theme briefs, nine gates, a versioned taste rubric, an append-only ledger and a weekly digest. A human merges.",
        body,
        config: ctx.config,
        components: ctx.components,
        themes: ctx.themes,
        current: pagePath,
        layout: "reference",
        scripts: [],
      }),
    },
  ];
}
