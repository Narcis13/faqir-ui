// Landing-page scaffold — composed from the maintained registry patterns
// (task 0.7-08, FAQIR-PLAN §B3).
//
// This module deliberately owns no marketing markup of its own. `faqir scaffold
// landing-page` used to synthesise a hero/features/CTA page inline, which meant
// the generated page drifted from the registry the moment either side changed —
// and shipped a <style> block the audit rules never saw. Now each section is
// lifted verbatim out of the pattern's own reference page:
//
//     registry/patterns/hero/hero.html
//         <!-- @ui:scaffold landing-page -->  … the canonical example …
//         <!-- @ui:scaffold-end -->
//
// Editing a pattern therefore edits every landing page generated afterwards, and
// the page inherits the pattern's audit-clean, axe-clean, themed CSS instead of
// one-off inline styles. The four sections carry zero JavaScript between them.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Patterns composed into the page, in the order they are laid out. */
export const LANDING_PATTERNS = ["hero", "feature-grid", "pricing", "site-footer"] as const;

export type LandingPattern = (typeof LANDING_PATTERNS)[number];

/** Patterns that live inside <main>; the footer is a sibling landmark. */
export const LANDING_MAIN_PATTERNS: readonly LandingPattern[] = [
  "hero",
  "feature-grid",
  "pricing",
];

/**
 * Primitives the composed sections nest, so `faqir scaffold landing-page`
 * installs (and links) their stylesheets. Kept in sync with the patterns by
 * `tests/scaffolds/landing-page.test.ts`, which scans the generated page for
 * every `data-ui` it references.
 */
export const LANDING_COMPONENTS = [
  "badge",
  "button",
  "card",
  "icon",
  "link",
  "nav",
  "separator",
  "stat",
] as const;

export interface LandingScaffoldOptions {
  title: string;
  /** Pre-rendered <link rel="stylesheet"> lines for the page head. */
  stylesheets: string;
  /** Absolute path to the registry the patterns are read from. */
  registryPath: string;
}

const START_MARKER = "<!-- @ui:scaffold landing-page -->";
const END_MARKER = "<!-- @ui:scaffold-end -->";

/**
 * The canonical example a pattern offers to the landing-page scaffold: the block
 * between its `@ui:scaffold landing-page` markers. Throws rather than falling
 * back to synthesised markup — a missing marker is a registry bug, and silently
 * emitting a different page is exactly the drift this module exists to remove.
 */
export function extractScaffoldBlock(source: string, pattern: string): string {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Pattern '${pattern}' has no <!-- @ui:scaffold landing-page --> … <!-- @ui:scaffold-end --> block. ` +
        `The landing-page scaffold composes patterns verbatim and cannot synthesise a replacement.`,
    );
  }
  return source.slice(start + START_MARKER.length, end).trim();
}

/** Read one pattern's reference page out of the registry. */
export function readPatternSection(registryPath: string, pattern: string): string {
  const file = join(registryPath, "patterns", pattern, `${pattern}.html`);
  if (!existsSync(file)) {
    throw new Error(`Pattern '${pattern}' is missing from the registry (${file}).`);
  }
  return extractScaffoldBlock(readFileSync(file, "utf8"), pattern);
}

const GUIDE = `  <!--
    Composed by \`faqir scaffold landing-page\` from four maintained patterns:
    hero, feature-grid, pricing, and site-footer. Each section below is the
    pattern's own canonical example, copied verbatim — so it is already
    audit-clean, themed from tokens, and free of JavaScript.

    Edit the copy in place, or re-run the scaffold after customising the
    patterns under ui/patterns/. Keep the data-ui / data-part attributes intact
    so \`faqir audit\` can keep checking the page. No script tag is needed until
    you add reactive directives (l-data, l-for, …) — then include faqir-core.js.
  -->`;

/**
 * Assemble the page: hero + feature-grid + pricing inside <main> (the main
 * landmark the `landmark` audit rule requires), with the site-footer as a
 * sibling so it stays the document's contentinfo.
 */
export function generateLandingPage(options: LandingScaffoldOptions): string {
  const sections = LANDING_MAIN_PATTERNS.map((p) =>
    readPatternSection(options.registryPath, p),
  ).join("\n\n");
  const footer = readPatternSection(options.registryPath, "site-footer");

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
${options.stylesheets}
</head>
<body>
${GUIDE}

<main>

${sections}

</main>

${footer}

</body>
</html>
`;
}
