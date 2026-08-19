// Marker-driven pattern composition — the mechanism behind every page scaffold
// that is assembled out of the registry rather than written by hand (task
// 1.0R-08, generalising the landing-page mechanism of task 0.7-08).
//
// A pattern offers a scaffold one canonical block of its own reference page:
//
//     registry/patterns/crud-table/crud-table.html
//         <!-- @ui:scaffold admin-dashboard internal-tool -->  … the block …
//         <!-- @ui:scaffold-end -->
//
// One marker may name several scaffolds, because one pattern is often the right
// body for more than one page. A *shell* pattern — one whose block is a whole
// page rather than a section — marks where the rest of the composition goes:
//
//     <main data-part="content" role="main">
//       …
//       <!-- @ui:scaffold-slot -->
//     </main>
//
// Everything here is verbatim: nothing is synthesised, nothing is rewritten.
// Editing a pattern edits every page generated from it afterwards, and the page
// inherits the pattern's audit-clean, axe-clean, themed CSS instead of one-off
// inline styles.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Where a shell pattern wants the rest of the composition inserted. */
export const SCAFFOLD_SLOT_MARKER = "<!-- @ui:scaffold-slot -->";

/**
 * Brackets a run of markup a marked block keeps for its own reference page but
 * that a *composed page* must not carry — in practice, the modal dialogs both
 * `crud-table` and `settings-page` nest for convenience.
 *
 * They are omitted rather than moved, and the reason is the audit:
 *
 * - Left where they are, they sit inside the composed page's `<main>`, and the
 *   `landmark` rule wants an overlay outside the main content flow.
 * - Lifted out of their pattern to the end of the body — where that rule wants
 *   them — they take their `data-part`s with them, and parts declared by the
 *   pattern (`crud-table`'s `field`) re-attach to the `dialog` that does not
 *   declare them, which `orphan-part` then reports.
 *
 * Either way `faqir scaffold` would write a page `faqir audit` complains about,
 * which is the one thing a scaffold may never do. An unwired modal is also dead
 * markup in a starting page: it cannot open until something opens it. The
 * pattern's own reference page still ships them, `faqir add <pattern>` still
 * copies them, and the generated page's guide comment says where to find them.
 */
export const SCAFFOLD_OMIT_MARKER = "<!-- @ui:scaffold-omit -->";
export const SCAFFOLD_OMIT_END_MARKER = "<!-- @ui:scaffold-omit-end -->";

/** Drop every `@ui:scaffold-omit` … `@ui:scaffold-omit-end` run from a block. */
export function stripOmitted(block: string): string {
  let out = block;
  for (;;) {
    const start = out.indexOf(SCAFFOLD_OMIT_MARKER);
    if (start === -1) return out;
    const end = out.indexOf(SCAFFOLD_OMIT_END_MARKER, start);
    if (end === -1) {
      throw new Error(`${SCAFFOLD_OMIT_MARKER} is never closed by ${SCAFFOLD_OMIT_END_MARKER}.`);
    }
    out =
      out.slice(0, start).trimEnd() +
      "\n" +
      out.slice(end + SCAFFOLD_OMIT_END_MARKER.length).replace(/^[ \t]*\n/, "");
  }
}

/** Closes a marked block. */
export const SCAFFOLD_END_MARKER = "<!-- @ui:scaffold-end -->";

/**
 * Opening marker: `@ui:scaffold` followed by one or more scaffold names. The
 * trailing `\s` is what keeps `@ui:scaffold-end` and `@ui:scaffold-slot` from
 * matching — they are different markers, not nameless openings.
 */
const START_RE = /<!--\s*@ui:scaffold\s+([^>]*?)\s*-->/g;

/**
 * The canonical example a pattern offers to one scaffold: the block between its
 * `@ui:scaffold <name>` markers. Throws rather than falling back to synthesised
 * markup — a missing marker is a registry bug, and silently emitting a different
 * page is exactly the drift this module exists to remove.
 */
export function extractScaffoldBlock(
  source: string,
  pattern: string,
  scaffold: string = "landing-page",
): string {
  START_RE.lastIndex = 0;
  for (let m = START_RE.exec(source); m; m = START_RE.exec(source)) {
    if (!m[1].split(/\s+/).includes(scaffold)) continue;
    const from = m.index + m[0].length;
    const end = source.indexOf(SCAFFOLD_END_MARKER, from);
    if (end === -1) break;
    return source.slice(from, end).trim();
  }
  throw new Error(
    `Pattern '${pattern}' has no <!-- @ui:scaffold ${scaffold} --> … ${SCAFFOLD_END_MARKER} block. ` +
      `The ${scaffold} scaffold composes patterns verbatim and cannot synthesise a replacement.`,
  );
}

/** Read one pattern's marked block out of the registry. */
export function readPatternSection(
  registryPath: string,
  pattern: string,
  scaffold: string = "landing-page",
): string {
  const file = join(registryPath, "patterns", pattern, `${pattern}.html`);
  if (!existsSync(file)) {
    throw new Error(`Pattern '${pattern}' is missing from the registry (${file}).`);
  }
  return extractScaffoldBlock(readFileSync(file, "utf8"), pattern, scaffold);
}

/**
 * Compose one scaffold's patterns into the contents of a `<body>`.
 *
 * The first pattern leads. When its block declares a {@link SCAFFOLD_SLOT_MARKER}
 * it is a page shell and the remaining blocks are nested at that point (an admin
 * dashboard is a `dashboard-shell` with a `crud-table` inside its content, not a
 * shell followed by a table). Otherwise the blocks are siblings inside `<main>`,
 * which is the landmark the `landmark` audit rule requires.
 */
export function composePatterns(
  registryPath: string,
  scaffold: string,
  patterns: readonly string[],
): string {
  if (patterns.length === 0) throw new Error(`Scaffold '${scaffold}' composes no patterns.`);
  const blocks = patterns.map((p) => stripOmitted(readPatternSection(registryPath, p, scaffold)));
  const [shell, ...rest] = blocks;
  const inner = rest.join("\n\n");

  return shell.includes(SCAFFOLD_SLOT_MARKER)
    ? shell.replace(SCAFFOLD_SLOT_MARKER, inner)
    : `<main>\n\n${[shell, inner].filter(Boolean).join("\n\n")}\n\n</main>`;
}
