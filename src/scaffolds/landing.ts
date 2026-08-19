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

import { extractScaffoldBlock, readPatternSection } from "./compose";

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
  "grid",
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

// The marker grammar now lives in ./compose.ts, shared with the app scaffolds
// (task 1.0R-08). Re-exported here because this module is where it was born and
// where the landing tests still reach for it.
export { extractScaffoldBlock, readPatternSection };

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
 * The page's `<body>` contents: hero + feature-grid + pricing inside <main> (the
 * main landmark the `landmark` audit rule requires), with the site-footer as a
 * sibling so it stays the document's contentinfo.
 *
 * Split out from {@link generateLandingPage} so the documentation site can mount
 * the same composition in its own frame (task 1.0R-08) rather than re-deriving
 * a lookalike: the gallery shows the bytes `faqir scaffold` writes.
 */
export function landingScaffoldBody(registryPath: string): string {
  const sections = LANDING_MAIN_PATTERNS.map((p) => readPatternSection(registryPath, p)).join(
    "\n\n",
  );
  const footer = readPatternSection(registryPath, "site-footer");
  return `<main>\n\n${sections}\n\n</main>\n\n${footer}`;
}

/** The whole document `faqir scaffold landing-page` writes. */
export function generateLandingPage(options: LandingScaffoldOptions): string {
  const body = landingScaffoldBody(options.registryPath);

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

${body}

</body>
</html>
`;
}
