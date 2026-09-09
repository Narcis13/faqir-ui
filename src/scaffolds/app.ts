// The application page scaffolds — `admin-dashboard` and `internal-tool`
// (task 1.0R-08, generalising task 0.7-08).
//
// These two used to be hand-written HTML inside `src/commands/scaffold.ts`: a
// page-local `<style>` block, `style="…"` attributes, and `data-part` values
// that belonged to no component. They therefore drifted from the very patterns
// their own catalogue entry named (`dashboard-shell`, `crud-table`,
// `settings-page`), could not be axe- or audit-tested, and could not be shown
// on the documentation site at all — which is the defect 1.0R-08 opens with.
//
// Now, exactly like `./landing.ts`, each page is composed verbatim from the
// marked block of the patterns it declares. Editing a pattern edits every page
// generated from it afterwards, and the page inherits the pattern's audit-clean,
// axe-clean, themed CSS rather than one-off inline styles.

import { composePatterns } from "./compose";

export const APP_SCAFFOLD_NAMES = ["admin-dashboard", "internal-tool"] as const;

export type AppScaffoldName = (typeof APP_SCAFFOLD_NAMES)[number];

/**
 * The patterns each page is composed from, in layout order. The first is the
 * page's lead: `dashboard-shell` declares a `@ui:scaffold-slot` inside its own
 * `<main data-part="content">`, so the table is nested there; `settings-page`
 * declares none, so both blocks become siblings inside a generated `<main>`.
 */
export const APP_SCAFFOLD_PATTERNS: Record<AppScaffoldName, readonly string[]> = {
  "admin-dashboard": ["dashboard-shell", "crud-table"],
  "internal-tool": ["settings-page", "crud-table"],
};

/**
 * Registry components the composed blocks nest, so `faqir scaffold` installs
 * (and links) their stylesheets. Held to the composed markup by
 * `tests/scaffolds/app-pages.test.ts`, which scans the generated page for every
 * `data-ui` it references — a stale list is a broken page, not a stale comment.
 *
 * A few `data-ui` values on those pages are not components of their own but
 * companion selectors a component's stylesheet already carries: `input-group`
 * ships in `input.css`, `switch-label` in `switch.css`. They are covered by
 * their owner and must not be listed here, or `faqir add` would go looking for
 * a directory the registry does not have.
 */
export const APP_SCAFFOLD_COMPONENTS: Record<AppScaffoldName, readonly string[]> = {
  "admin-dashboard": [
    "avatar", "badge", "button", "card", "chip", "dropdown", "grid", "input",
    "pagination", "separator", "table",
  ],
  "internal-tool": [
    "badge", "button", "card", "chip", "input", "label", "pagination", "select",
    "switch", "table", "tabs", "textarea",
  ],
};

export interface AppScaffoldOptions {
  title: string;
  /** Pre-rendered <link rel="stylesheet"> lines for the page head. */
  stylesheets: string;
  /** Absolute path to the registry the patterns are read from. */
  registryPath: string;
  /** `src` for the engine these pages need — dialog, dropdown and tabs are recipes. */
  coreScriptSrc?: string;
}

function guide(name: AppScaffoldName, coreScriptSrc?: string): string {
  const patterns = APP_SCAFFOLD_PATTERNS[name].join(", ");
  // Name the engine tag rather than referring to it (task W2-5). This comment
  // used to end "add the script tag when you wire them up" — while the tag was
  // already at the bottom of the very file it was printed in, and while nothing
  // anywhere in the agent-facing documentation ever gave its spelling. A reader
  // was told a thing was missing, told to add it, and not told what it was.
  const engine = coreScriptSrc
    ? `The overlay recipes on this page (dialog, dropdown, tabs) are opened by the
    engine, which this page already loads at the bottom of <body>:
      <script src="${coreScriptSrc}" defer></script>
    Keep it — without it those components render, but never open.`
    : `The overlay recipes on this page (dialog, dropdown, tabs) need the engine to
    open. Add it as the last thing in <body>:
      <script src="ui/core/faqir-core.js" defer></script>`;

  return `  <!--
    Composed by \`faqir scaffold ${name}\` from maintained patterns: ${patterns}.
    Each block below is the pattern's own canonical example, copied verbatim — so
    it is already audit-clean, themed from tokens, and free of inline styles.

    Edit the copy in place, or re-run the scaffold after customising the patterns
    under ui/patterns/. Keep the data-ui / data-part attributes intact so
    \`faqir audit\` can keep checking the page.

    ${engine}
  -->`;
}

/**
 * The page's `<body>` contents. Split out from {@link generateAppPage} so the
 * documentation site can mount the same composition in its own frame (task
 * 1.0R-08) rather than re-deriving a lookalike: the gallery shows the bytes
 * `faqir scaffold` writes.
 */
export function appScaffoldBody(name: AppScaffoldName, registryPath: string): string {
  return composePatterns(registryPath, name, APP_SCAFFOLD_PATTERNS[name]);
}

/** The whole document `faqir scaffold <name>` writes. */
export function generateAppPage(name: AppScaffoldName, options: AppScaffoldOptions): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
${options.stylesheets}
</head>
<body>
${guide(name, options.coreScriptSrc)}

${appScaffoldBody(name, options.registryPath)}
${options.coreScriptSrc ? `\n<script src="${options.coreScriptSrc}" defer></script>\n` : ""}
</body>
</html>
`;
}

/**
 * `data-ui` values the composed pages use that are *not* components: companion
 * selectors carried by another component's stylesheet. Named here so the
 * coverage test can subtract them rather than carry a magic list of its own.
 */
export const APP_SCAFFOLD_COMPANION_SELECTORS: Record<string, string> = {
  "input-group": "input",
  "switch-label": "switch",
};
