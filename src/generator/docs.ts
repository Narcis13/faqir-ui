// Documentation-site generator (task 0.7-13, FAQIR-PLAN §13).
//
// The docs site is a Faqir project with **no build step at runtime**: every page
// is plain HTML written at authoring time, styled by the assembled registry/docs
// stylesheet plus one swappable theme stylesheet, and served by any static file
// server. Everything that describes a component —
// anatomy, variants, states, a11y, tokens, templates, transforms, composition —
// is DERIVED from that component's manifest, so adding a component to the
// registry adds its page (and its nav entry, and its live example) with zero
// edits to `site/`.
//
// Output shape (all paths relative to the output directory):
//
//   index.html                        home (authored fragment + registry stats)
//   components/index.html             every component, grouped by layer
//   components/<layer>/<name>.html    one page per component
//   tokens/index.html                 token reference, grouped by token file
//   layout/index.html                 the layout doctrine, ladder and archetypes
//   responsive/index.html             the responsive lab: live, resizable demos
//   engine/index.html                 faqir-core: directives, magics, plugins (1.0R-09)
//   layouts/index.html                signpost for the retired lab URL (task 1.0R-09)
//   spacing/index.html                spacing ladder + default rhythm guide
//   density/index.html                density axis + nesting/reset guide
//   icons/index.html                  searchable manifest-derived icon catalogue
//   typography/index.html             type tokens, scale and prose specimens
//   playground/index.html             live in-browser audit playground (task 0.7-14)
//   themes/index.html                 theme gallery + instant switcher (task 0.7-14)
//   agents/index.html                 the machine surfaces, documented (task 0.7-15)
//   spec/<version>/index.html         the frozen protocol, rendered (task 1.0-01)
//   spec/<version>/spec.md            the same spec, verbatim markdown
//   spec/<version>/manifest.schema.json  the schema, addressable by version
//   examples/<layer>/<name>.html      one standalone live example per component
//   frames/theme-preview-<name>.html  the demo document each gallery frame renders
//   llms.txt · llms-full.txt          full-registry agent context (llmstxt.org)
//   manifest.schema.json              the manifest contract, at its own `$id` path
//   registry-index.json               the remote-registry index (`faqir add --registry`)
//   api/messages                      same-origin JSON fixture for the live inbox demo
//   robots.txt · sitemap.xml           static-publishing discovery surfaces
//   404.html                           audit-clean not-found page
//   snippets/<layer>/<name>.html.txt  copy-for-agents payload: markup + CDN preamble
//   _headers                          content types + CORS for the files above
//   styles/faqir.css                  tokens + base + components + docs presentation
//   styles/themes/<name>.css          one file per registry theme — the swappable link
//   scripts/faqir-core.js             the registry engine
//   scripts/faqir-audit.js            the audit engine, compiled for the browser
//   scripts/faqir-manifests.js        every manifest as one global, for the playground
//   scripts/playground.js             playground wiring (authored, site/lib/)
//   scripts/gallery.js                shared shell + appearance wiring (authored, site/lib/)
//
// Two page *classes*, deliberately held to different gates (see docs/docs-site.md):
//
//   • **Site pages** are authored by this generator out of registry components and
//     tokens only. They must be 100% `faqir audit`-clean at every severity and
//     axe-clean — that is the proof the framework can build its own documentation.
//     Two *layouts* share that one gate: navigable pages, wrapped in the
//     `dashboard-shell` nav (home, index, component, layouts, token, playground, gallery),
//     and `frames/**` documents, which are generator-authored markup rendered
//     inside an `<iframe>` and therefore carry no navigation — the same reason
//     `examples/**` carry none.
//   • **Example pages** wrap a registry reference fragment VERBATIM. That markup
//     is the registry's, not the site's: it is gated where it lives (the registry
//     self-audit's document rules and the a11y matrix of task 0.4-24). Re-running
//     the per-component rules over it here would only duplicate that gate — the
//     reference pages are deliberately partial demos (a card showing just its
//     header, a dialog demoed without a live controller), which those rules flag
//     by design.
//
// The site remains progressively enhanced plain HTML. A small shared wiring file
// persists appearance, opens the mobile documentation drawer, filters the
// component catalogue and sizes preview frames; the playground adds the audit
// engine, and component examples add faqir-core.js. Nothing fetches: the audit
// runs in the page and every page remains usable without JavaScript.
//
// Zero dependencies and **node:fs only** — no Bun APIs — so the same module runs
// under `bun test`, under the Playwright (Node) runner, and from
// `scripts/build-docs.mjs`. Output is deterministic: no timestamps, sorted
// traversal, so regeneration is byte-identical (asserted by the idempotence test).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Manifest } from "../manifest";
import { SCHEMA_ID_URL, SITE_ORIGIN } from "../canonical";
import { BREAKPOINT_LIST, TIERS, responsiveAttribute } from "../utils/breakpoints";
import {
  ARCHETYPES,
  LAYOUT_MECHANISMS,
  LAYOUT_PRIMITIVES,
  LAYOUT_RULES,
  MEASURE_TOKENS,
  RESPONSIVE_GRAMMAR,
  RHYTHM_TOKENS,
  DENSITY_TOKENS,
  SPACING_BANDS,
  SPACING_LADDER,
  RHYTHM_REJECTED,
  rhythmLine,
  parseArchetypes,
  type ParsedArchetype,
} from "../utils/layout";
// The frozen protocol, as data (task 1.0-01). The spec page states what this
// module says and renders the examples `SPEC-1.0.md` carries, so the published
// page, the audited markup and the normative document are one source.
import {
  AMENDMENT_RULES,
  ATTRIBUTE_SPECS,
  FREEZE_STATEMENT,
  PROTOCOL_RULES,
  PROTOCOL_STATUS,
  PROTOCOL_VALUE_GRAMMAR,
  PROTOCOL_VALUE_PATTERN,
  PROTOCOL_VERSION,
  RESPONSIVE_RULES,
  SCHEMA_CHANGELOG,
  SCHEMA_VERSION,
  SPEC_FILE,
  TOKEN_MODIFIERS,
  parseSpecExamples,
  type SpecExample,
} from "../protocol";
import { parseDocument, type ParsedElement } from "../parser/html-parser";
// The migration page renders the same three things `docs/migration-1.0.md`
// publishes — the rename, the procedure, the breaking-change inventory — from
// the module the document is checked against (task 1.0-03).
import {
  LEGACY_RENAMES,
  MIGRATION_FROM_VERSION,
  MIGRATION_STEPS,
  breakingChangeId,
  collectBreakingChanges,
  parseMigrationDoc,
  type BreakingChange,
  type DocumentedBreak,
} from "../migration";
import type { ThemeManifest } from "../theme-manifest";
// The playground's rule legend is derived from the engine's own rule lists, so it
// cannot describe a rule the shipped browser bundle does not run.
import { getHtmlRuleInventory } from "../audit/rules";
// The hosted llms.txt pair is the CLI's own `--format llms` generator pointed at
// the whole registry instead of at one project (task 0.7-15).
import { formatContextLlms, formatContextLlmsFull } from "./context";
import { BASE_LAYER_BLURB, baseLayerUiValues, loadBaseLayer } from "../base-layer";
// The playground audits against the registry's own name list — the same one the
// CLI uses — so `unknown-component` says the same thing in both (task 1.0R-11).
import { knownUiValues } from "../utils/components";
// The reactive-engine page reads the engine's own §3.0 declarations through the
// same parsers that build the skill's `references/directives.md` (task 1.0R-03):
// the site and the skill are two renderings of one vocabulary, not two lists.
import {
  parseEngineMap,
  parseEngineVocabulary,
  parseSourceController,
  type EngineVocabulary,
} from "./skill";
import { loadPluginMetadata, type PluginMetadata } from "./plugins";
import { buildRegistryContext } from "./registry-context";
import { SCAFFOLDS, SCAFFOLD_NAMES, scaffoldBody, scaffoldCommand, type ScaffoldDef } from "../scaffolds";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repository root — `src/generator/` is two levels down. */
export const PACKAGE_ROOT = join(HERE, "..", "..");

/** Stable, grep-able marker proving a page came out of this generator. */
export const DOCS_GENERATION_MARKER = "GENERATED by faqir · manifest-derived docs site";

/** The in-browser audit playground (task 0.7-14). */
export const PLAYGROUND_PAGE = "playground/index.html";
/** The theme gallery + instant switcher (task 0.7-14). */
export const THEMES_PAGE = "themes/index.html";
/**
 * The responsive lab: doctrine and live resize demonstrations (task 1.0R-09).
 *
 * Published at `responsive/`, not `layouts/`. It sat one character away from
 * {@link LAYOUT_PAGE} — two routes that differ by a trailing `s`, both linked
 * from the home page, both destined for prompts and bookmarks where the nav
 * labels that disambiguated them are not there to help. The old URL still
 * resolves, as a signpost rather than as a silent redirect: see
 * {@link RETIRED_PAGES}.
 */
export const RESPONSIVE_PAGE = "responsive/index.html";

/** Site-relative path prefix for generator-authored documents rendered in a frame. */
export const FRAME_PREFIX = "frames/";

/** The page documenting the agent-facing URLs below (task 0.7-15). */
export const AGENTS_PAGE = "agents/index.html";

/** The layout guide: the doctrine, the ladder and the archetypes (task 0.8-12). */
export const LAYOUT_PAGE = "layout/index.html";

/**
 * The reactive engine (task 1.0R-09). `faqir-core` had a README section, a size
 * budget and a shipped `scripts/faqir-core.js` on this site, and no page: an
 * agent pointed at the site could learn every component and nothing about the
 * runtime that drives them.
 *
 * The vocabulary tables are read out of the engine's own §3.0 declarations by
 * the same functions that build the skill's `references/directives.md` (task
 * 1.0R-03), so the site and the skill cannot disagree about what the engine
 * implements.
 */
export const ENGINE_PAGE = "engine/index.html";

/**
 * A published URL that no longer holds a page, and the page it became.
 *
 * The site serves a **signpost** at the old path rather than a redirect. A
 * redirect would fix the bookmark and re-create the defect that retired the URL:
 * `/layouts/` is one character from `/layout/`, so anyone who lands on it may
 * have mistyped the *other* route, and quietly serving them the lab is exactly
 * the confusion this task removes. The signpost names both destinations and
 * makes the reader choose. It carries `noindex` and is kept out of the sitemap —
 * it resolves, it is not advertised.
 */
export interface RetiredPage {
  /** The path that used to hold the page. */
  path: string;
  /** Where its content lives now. */
  movedTo: string;
  /** The route it is one typo away from, and which is a different page. */
  confusedWith: string;
  /** What used to be here, in one phrase. */
  was: string;
}

export const RETIRED_PAGES: readonly RetiredPage[] = [
  {
    path: "layouts/index.html",
    movedTo: RESPONSIVE_PAGE,
    confusedWith: LAYOUT_PAGE,
    was: "the responsive lab",
  },
] as const;

/** True for a path {@link RETIRED_PAGES} keeps resolving but no longer publishes. */
export function isRetiredPage(path: string): boolean {
  return RETIRED_PAGES.some((entry) => entry.path === path);
}

/**
 * The top-level route segment of a site path — `layout` for
 * `layout/index.html`, `components` for `components/primitives/button.html`.
 * The unit a human types, mistypes and bookmarks, which is why
 * `tests/generator/layout-docs.test.ts` holds the whole published set to a
 * minimum edit distance of two.
 */
export function routeSegment(path: string): string {
  return path.includes("/") ? path.slice(0, path.indexOf("/")) : path;
}

/**
 * The scaffold gallery (task 1.0R-08): every whole page `faqir scaffold` can
 * write, shown as the document it writes.
 *
 * Derived from {@link SCAFFOLDS}, exactly as component pages are derived from
 * the registry — registering a scaffold publishes its page, its frame, its
 * copy-for-agents payload, its nav entry, its sitemap row and its llms.txt line
 * with no edit under `site/` and none here.
 */
export const SCAFFOLDS_PAGE = "scaffolds/index.html";

/** One scaffold's documentation page. */
export function scaffoldPagePath(name: string): string {
  return `scaffolds/${name}/index.html`;
}

/** The live document for one scaffold, rendered inside an `<iframe>`. */
export function scaffoldFramePath(name: string): string {
  return `${FRAME_PREFIX}scaffold-${name}.html`;
}

/** One scaffold's copy-for-agents payload, as a file (see {@link snippetPath}). */
export function scaffoldSnippetPath(name: string): string {
  return `${SNIPPET_PREFIX}scaffolds/${name}.html.txt`;
}

/**
 * The frozen protocol, published **with its version in the path** (task 1.0-01).
 *
 * `spec/1.0/` is a promise, not a route: a 1.1 would be published beside it and
 * this directory would keep serving exactly what it serves today. The prefix is
 * therefore built from {@link PROTOCOL_VERSION} rather than written out, so the
 * URL and the constant cannot disagree — which is half of what the version
 * consistency gate checks.
 */
export const SPEC_PREFIX = `spec/${PROTOCOL_VERSION}/`;
/** The rendered specification. */
export const SPEC_PAGE = `${SPEC_PREFIX}index.html`;
/** The spec's own source, served verbatim for an agent that would rather read markdown. */
export const SPEC_MARKDOWN_FILE = `${SPEC_PREFIX}spec.md`;

/**
 * The v0.x → 1.0 migration (task 1.0-03), published as a page and as its own
 * markdown beside it — the two forms the spec is served in, for the same
 * reason: an agent asked to upgrade a project would rather read the source.
 */
export const MIGRATION_PAGE = "migration/index.html";
/** `docs/migration-1.0.md`, verbatim. */
export const MIGRATION_MARKDOWN_FILE = "migration/migration-1.0.md";
/** The repository path both are built from. */
export const MIGRATION_DOC_FILE = "docs/migration-1.0.md";

/** Spacing ladder, default rhythm, override rules, and grouping ownership. */
export const SPACING_PAGE = "spacing/index.html";

/** The `data-density` axis, remap inventory, and nesting/reset contract. */
export const DENSITY_PAGE = "density/index.html";

/** Searchable catalogue derived from the icon primitive's declared names. */
export const ICONS_PAGE = "icons/index.html";

/** Typography tokens, specimens, semantic hierarchy, and prose guidance. */
export const TYPOGRAPHY_PAGE = "typography/index.html";

/** Static-host not-found document. */
export const NOT_FOUND_PAGE = "404.html";

/** Search-engine discovery files emitted beside the static site. */
export const ROBOTS_FILE = "robots.txt";
export const SITEMAP_FILE = "sitemap.xml";

/** Same-origin static response consumed by the inbox reference's `l-source`. */
export const DEMO_MESSAGES_API = "api/messages";

/**
 * The site's **machine contract**: four files an agent or a tool fetches by URL
 * rather than reads as a page (task 0.7-15, §8.2/§9.2). These paths are stable —
 * `tests/generator/docs-agents.test.ts` hard-codes them, so moving one fails CI
 * rather than silently 404-ing something already published in a prompt.
 *
 * `manifest.schema.json` sits at the root because it mirrors the schema's `$id`
 * path ({@link SCHEMA_ID_URL}); a `$ref` in any manifest resolves relative to the
 * file, which is the one path here that is not a convention but an identifier.
 */
export const LLMS_INDEX_FILE = "llms.txt";
export const LLMS_FULL_FILE = "llms-full.txt";
export const SCHEMA_FILE = "manifest.schema.json";
export const REGISTRY_INDEX_FILE = "registry-index.json";

/**
 * The versioned copy of the schema, beside the spec that freezes it (task
 * 1.0-01). Byte-identical to {@link SCHEMA_FILE} while 1.0 is current: the root
 * path is the `$id` alias that always serves the newest 1.x schema, this one is
 * the address that will still serve *this* schema after 1.1 exists.
 */
export const SPEC_SCHEMA_FILE = `${SPEC_PREFIX}${SCHEMA_FILE}`;

/**
 * Cloudflare-Pages-style `_headers`, emitted next to the files it describes so
 * the served content types and CORS headers are generated from the same list as
 * the files themselves (task 0.7-15). Netlify reads the same format.
 */
export const HEADERS_FILE = "_headers";

/** Site-relative path prefix for copy-for-agents payloads. */
export const SNIPPET_PREFIX = "snippets/";

/**
 * The standalone, paste-and-run document for one component — the exact bytes the
 * copy-for-agents button puts on the clipboard, also written to disk so it has a
 * URL of its own.
 *
 * `.html.txt`, not `.html`, and that is deliberate: this is a *payload*, not a
 * page of the site. It is the one artifact here that points at a CDN, and the
 * site's own claim — that no page it serves reaches the network — stays absolute
 * because a browser opening this URL is shown its source, not asked to run it.
 */
export function snippetPath(layer: Layer, name: string): string {
  return `${SNIPPET_PREFIX}${layer}/${name}.html.txt`;
}

/**
 * The gallery's demo document for one theme. One file per theme rather than one
 * file plus a `?theme=` query: a static host would serve the same bytes for every
 * query anyway, the theme is then correct before first paint (no flash, and no
 * JavaScript needed for the *initial* render), and every URL on the site stays a
 * plain relative path the link checker can resolve.
 */
export function themePreviewPath(theme: string): string {
  return `${FRAME_PREFIX}theme-preview-${theme}.html`;
}

/**
 * Id of the swappable theme `<link>`. Every page carries it — swapping its `href`
 * is the whole of "instant theme switching", so the gallery and its frames find
 * the element by one stable id rather than by position in `<head>`.
 */
export const THEME_LINK_ID = "faqir-theme";

/** The global `scripts/faqir-manifests.js` installs, for the playground. */
export const MANIFESTS_GLOBAL = "__FAQIR_MANIFESTS__";

/**
 * The second global `scripts/faqir-manifests.js` installs: every `data-ui` value
 * the registry defines — components, aliases and base-layer values (task
 * 1.0R-11).
 *
 * It is not derivable from the manifest payload beside it: the payload has no
 * entry for `prose` (base-layer styling with no manifest), and a page deriving
 * "the registry" from whatever manifests it was handed would be right only for a
 * payload that happens to be complete. So the generator ships the list the CLI
 * computes, and the playground hands it to `createAuditor`; without it the
 * `unknown-component` rule does not run.
 */
export const UI_VALUES_GLOBAL = "__FAQIR_UI_VALUES__";

/**
 * Authored scripts copied out of `site/lib/` into `scripts/`. Named, never
 * globbed: what the site can execute is a closed list, and a stray file in
 * `site/lib/` must not become a script tag on a page.
 *
 * `faqir-audit.js` is generated-and-committed by
 * `scripts/build-audit-browser.mjs` (drift-gated by `bun run check:audit-browser`);
 * the other two are hand-written wiring.
 */
export const SITE_SCRIPTS = [
  "faqir-audit.js",
  "playground.js",
  "gallery.js",
  "copy-snippet.js",
] as const;

/** Registry directories that ship documentable components. */
export const LAYERS = ["primitives", "recipes", "patterns"] as const;
export type Layer = (typeof LAYERS)[number];

/** Human labels for the layer headings and nav groups. */
const LAYER_LABEL: Record<Layer, string> = {
  primitives: "Primitives",
  recipes: "Recipes",
  patterns: "Patterns",
};

const LAYER_BLURB: Record<Layer, string> = {
  primitives: "Single-element building blocks. Pure CSS, no JavaScript, no dependencies.",
  recipes: "Composed components with a small controller for behaviour that CSS cannot express.",
  patterns: "Whole-page compositions of primitives and recipes — copy, then edit.",
};

/**
 * Token load order — authoritative, mirrors `registry/tokens/index.css` and the
 * concatenation `faqir init` performs. `index.css` itself is excluded (it is only
 * `@import` statements) and `density.css` declares into `[data-density]` scopes
 * rather than `:root`, so it ships in the stylesheet but contributes no entries
 * to the token reference.
 */
const TOKEN_FILES = [
  "palette",
  "spacing",
  "typography",
  "effects",
  "motion",
  "semantic",
  "aliases",
  "document",
  "doc-aliases",
  "density",
] as const;

/** Base stylesheets, in cascade order. */
const BASE_FILES = ["reset", "prose", "rhythm", "motion-presets"] as const;

/** Prose labels for the token groups on the token-reference page. */
const TOKEN_GROUP_LABEL: Record<string, string> = {
  palette: "Palette",
  spacing: "Spacing",
  typography: "Typography",
  effects: "Effects",
  motion: "Motion",
  semantic: "Semantic colours",
  aliases: "Component aliases",
  document: "Document & print",
  "doc-aliases": "Document aliases",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocsComponent {
  /** Canonical component name (from the manifest). */
  name: string;
  /** Registry layer directory the component lives in. */
  layer: Layer;
  /** The component's manifest. */
  manifest: Manifest;
  /** Absolute path to the reference `.html` fragment (may not exist). */
  referencePath: string;
  /** Site-relative path of this component's documentation page. */
  pagePath: string;
  /** Site-relative path of this component's standalone live example page. */
  examplePath: string;
}

export interface SiteFile {
  /** Path relative to the output directory, using `/` separators. */
  path: string;
  content: string;
}

export interface DocsTheme {
  /** Theme name — the stylesheet's basename (`midnight`). */
  name: string;
  /** The theme's manifest, when it ships one (all registry themes do). */
  manifest: ThemeManifest | null;
  /** Absolute path to the theme stylesheet. */
  cssPath: string;
  /** Site-relative path of the emitted stylesheet — the href a switcher swaps. */
  stylePath: string;
}

export interface DocsSiteOptions {
  /** Registry root to document. Defaults to `<package>/registry`. */
  registryRoot?: string;
  /** Authored site sources (`site.config.json`, `content/`). Defaults to `<package>/site`. */
  siteRoot?: string;
  /** Theme stylesheet baked into the site bundle. Defaults to the site config's theme. */
  theme?: string;
  /**
   * Repository root holding `manifest.schema.json` and `packages/core/cdn.json`
   * (the CDN pin the copy-for-agents snippets carry). Defaults to `<package>`.
   */
  packageRoot?: string;
  /**
   * Force the overlay recipes' panels open on their own example pages
   * (task 0.9-05). Defaults to true; `false` builds the same site without the
   * preview, which is how the tests prove the state is docs-only — every
   * registry fragment and every copy-for-agents payload is byte-identical
   * either way.
   */
  overlayPreview?: boolean;
}

export interface SiteConfig {
  title: string;
  tagline: string;
  description: string;
  /** Canonical public origin, without a trailing slash. */
  url: string;
  theme: string;
  footer: string;
}

const DEFAULT_SITE_CONFIG: SiteConfig = {
  title: "Faqir UI",
  tagline: "The agent-native UI framework",
  description: "Manifest-driven, zero-dependency UI components documented from their own manifests.",
  url: SITE_ORIGIN,
  theme: "default",
  footer: "Faqir UI — every page on this site is generated from the registry manifests.",
};

// ---------------------------------------------------------------------------
// Small HTML helpers
// ---------------------------------------------------------------------------

/** Escape text for HTML body content. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape a value for a double-quoted attribute. */
export function escAttr(value: string): string {
  return esc(value).replace(/"/g, "&quot;");
}

/** `data-part="x"` → a filesystem/anchor-safe slug. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * A relative URL from one site page to another site path. Both arguments are
 * site-relative (`components/primitives/button.html`), so the whole site is
 * position-independent: it works at a domain root, in a sub-directory, or from
 * `file://` — which is what "served with any static server" means in practice.
 */
export function relUrl(fromPagePath: string, toPath: string): string {
  const depth = fromPagePath.split("/").length - 1;
  return depth === 0 ? toPath : "../".repeat(depth) + toPath;
}

/** Public URL for a generated page, with directory-style URLs for index pages. */
export function canonicalUrl(config: SiteConfig, pagePath: string): string {
  const origin = config.url.replace(/\/+$/, "");
  const path = pagePath === "index.html" ? "" : pagePath.replace(/index\.html$/, "");
  return `${origin}/${path}`;
}

// ---------------------------------------------------------------------------
// Registry reading (node:fs only)
// ---------------------------------------------------------------------------

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

/** Every `.css` file under a directory tree, sorted for deterministic output. */
function walkCss(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkCss(full, out);
    else if (entry.endsWith(".css")) out.push(full);
  }
  return out;
}

/**
 * Every documentable component in a registry, sorted by (layer order, name).
 * The manifest is the source of truth — a directory without one is not a
 * component and is skipped, which is what keeps `registry/tokens/density.html`
 * and the theme previews out of the site.
 */
export function discoverDocsComponents(registryRoot: string): DocsComponent[] {
  const found: DocsComponent[] = [];
  for (const layer of LAYERS) {
    const base = join(registryRoot, layer);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base).sort()) {
      const dir = join(base, entry);
      if (!statSync(dir).isDirectory()) continue;
      const manifestPath = join(dir, `${entry}.manifest.json`);
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readText(manifestPath)) as Manifest;
      const name = manifest.name ?? entry;
      found.push({
        name,
        layer,
        manifest,
        referencePath: join(dir, manifest.files?.html ?? `${entry}.html`),
        pagePath: `components/${layer}/${name}.html`,
        examplePath: `examples/${layer}/${name}.html`,
      });
    }
  }
  return found;
}

/**
 * Every theme the registry ships, sorted by name. The `.css` file is the theme —
 * `{name}.theme.json` is its manifest and is read when present, so the gallery's
 * mood/scheme copy is derived rather than written. `*.preview.html` files are
 * reference markup, not themes, and are skipped by the `.css` extension test.
 */
export function discoverThemes(registryRoot: string): DocsTheme[] {
  const dir = join(registryRoot, "themes");
  if (!existsSync(dir)) return [];
  const themes: DocsTheme[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (!entry.endsWith(".css")) continue;
    const name = entry.slice(0, -".css".length);
    const manifestPath = join(dir, `${name}.theme.json`);
    themes.push({
      name,
      manifest: existsSync(manifestPath)
        ? (JSON.parse(readText(manifestPath)) as ThemeManifest)
        : null,
      cssPath: join(dir, entry),
      stylePath: `styles/themes/${name}.css`,
    });
  }
  return themes;
}

// ---------------------------------------------------------------------------
// Reference fragments
// ---------------------------------------------------------------------------

/**
 * A deterministic 96×96 grey placeholder. Reference fragments point `<img>` at
 * `example.com` URLs; a static docs site must never reach the network, so every
 * non-`data:` source is swapped for this inline SVG. Identical to the swap the
 * visual/a11y harness performs, for the same reason.
 */
const IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='96'%20height='96'%3E%3Crect%20width='96'%20height='96'%20fill='%23c7c7c7'/%3E%3C/svg%3E";

/** Strip `@ui:*` authoring comments and neutralise external image sources. */
export function sanitizeReferenceFragment(html: string): string {
  return html
    .replace(/<!--\s*@ui:[^]*?-->/g, "")
    .replace(/(\bsrc\s*=\s*)(["'])(?!\s*data:)[^"']*\2/gi, `$1$2${IMG_PLACEHOLDER}$2`)
    .trim();
}

// ---------------------------------------------------------------------------
// Demo blocks — lifting the fragments' own labels into visible captions (0.9-03)
// ---------------------------------------------------------------------------

/**
 * One demonstration inside a reference fragment: the markup, plus the label its
 * author already wrote for it.
 *
 * Every fragment in the registry separates its demos with a top-level HTML
 * comment — `<!-- Tag row — the canonical cluster -->`, `<!-- Sizes -->`. A
 * comment is invisible in a browser, so a reader of `accordion`'s example page
 * saw three accordions as one seven-item accordion and `table`'s five tables as
 * one table. The labels are already there in all 86 files; this is what makes
 * them visible, which is why 0.9-03 edits no fragment.
 */
export interface DemoBlock {
  /**
   * The one-line label lifted from the comment, or `null` when the demo carries
   * no comment at all (five fragments today) — an uncaptioned block, never an
   * empty caption.
   */
  caption: string | null;
  /**
   * The comment's remaining lines. 25 fragments annotate a demo with a
   * paragraph of authoring prose rather than a label; it was shipped as
   * invisible bytes before and is rendered as a note now. `null` when the
   * comment was a single line.
   */
  note: string | null;
  /** The fragment slice this block wraps — the registry's markup, verbatim. */
  html: string;
}

/** HTML elements with no end tag, so the depth counter does not go negative. */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Split a sanitized reference fragment at its **top-level** comments.
 *
 * Depth matters: `sidebar` writes `<!-- ── Sidebar ── -->` *inside* its shell and
 * that is an annotation, not a demo boundary. Only a comment at nesting depth 0
 * separates two demos, so the scanner tracks open elements rather than running a
 * regex over the whole file.
 *
 * The markup between two boundaries is passed through byte for byte — the
 * concatenation of the blocks is the fragment with its top-level comments
 * removed, which is what `tests/generator/docs-site.test.ts` asserts and what
 * keeps "an example page IS its registry fragment" true after this task.
 */
export function splitReferenceDemos(fragment: string): DemoBlock[] {
  const blocks: DemoBlock[] = [];
  let depth = 0;
  let cursor = 0;
  // Every comment seen since the last demo. Usually one; a fragment that opens
  // with a paragraph of orientation prose and *then* labels its first demo
  // (`aspect-ratio`) leaves two, and neither may be dropped.
  let pending: string[] = [];
  let start = 0;

  const flush = (end: number) => {
    const html = fragment.slice(start, end).trim();
    // A label with nothing under it labels nothing: keep the comment pending so
    // it reaches the demo it belongs to instead of becoming an empty block.
    if (html.length === 0) return;
    blocks.push({ ...parseDemoLabel(pending), html });
    pending = [];
  };

  while (cursor < fragment.length) {
    const lt = fragment.indexOf("<", cursor);
    if (lt === -1) break;

    if (fragment.startsWith("<!--", lt)) {
      const close = fragment.indexOf("-->", lt);
      const end = close === -1 ? fragment.length : close;
      if (depth === 0) {
        flush(lt);
        pending.push(fragment.slice(lt + 4, end));
        start = close === -1 ? fragment.length : close + 3;
      }
      cursor = close === -1 ? fragment.length : close + 3;
      continue;
    }

    const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(fragment.slice(lt, lt + 40));
    if (!tag) {
      cursor = lt + 1;
      continue;
    }
    // Walk to the tag's `>`, honouring quoted attribute values so a `>` inside
    // one (`aria-label="a > b"`) does not end the tag early.
    let i = lt + 1;
    let quote = "";
    for (; i < fragment.length; i++) {
      const ch = fragment[i];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
    }
    const source = fragment.slice(lt, i + 1);
    if (tag[1] === "/") depth = Math.max(0, depth - 1);
    else if (!VOID_ELEMENTS.has(tag[2].toLowerCase()) && !source.endsWith("/>")) depth++;
    cursor = i + 1;
  }
  flush(fragment.length);
  return blocks;
}

/**
 * The caption and note a run of comments yields.
 *
 * The **caption is the first line of the last comment** — the nearest label,
 * which is the one an author wrote for this demo. Every other line becomes the
 * note, in document order, so an opening paragraph of prose is still shown; it
 * just does not out-shout the label it precedes.
 *
 * Lines carrying no letter or digit are dropped first, so the box-drawing rules
 * some fragments frame a comment with (`── ────── ──`) never become the label.
 */
function parseDemoLabel(comments: readonly string[]): {
  caption: string | null;
  note: string | null;
} {
  const meaningful = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /[\p{L}\p{N}]/u.test(line));

  const groups = comments.map(meaningful).filter((lines) => lines.length > 0);
  if (groups.length === 0) return { caption: null, note: null };

  const last = groups[groups.length - 1];
  const caption = last[0];
  const note = [...groups.slice(0, -1).flat(), ...last.slice(1)];
  return { caption, note: note.length > 0 ? note.join("\n") : null };
}

/**
 * The demo blocks as markup: one `<figure>` per demo, captioned by
 * `<figcaption>`.
 *
 * `figure`/`figcaption` rather than a section and a heading, for two reasons
 * that both matter here. It is literally what the elements are for — self-
 * contained content with a caption — and it keeps the example pages out of the
 * heading outline, so a caption cannot collide with the headings the fragment
 * itself contains (the `heading-order` document rule runs over these pages).
 * `figure` is also a flow root *and* a participant in the default rhythm
 * (§20/0.9-02), so consecutive demos are spaced by the base rule with nothing
 * declared here — which is why this change also separates the demos whose own
 * roots were not `[data-ui]` siblings.
 */
function renderDemoBlocks(blocks: readonly DemoBlock[]): string {
  return blocks
    .map((b) => {
      const parts = [`<figure data-docs-demo>`];
      if (b.caption !== null) {
        parts.push(`<figcaption data-docs-demo-caption>${esc(b.caption)}</figcaption>`);
      }
      if (b.note !== null) parts.push(`<p data-docs-demo-note>${esc(b.note)}</p>`);
      parts.push(b.html, `</figure>`);
      return parts.join("\n");
    })
    .join("\n");
}

/**
 * Does a fragment declare its own `main` landmark (patterns often do)?
 *
 * Exported because it is the *content-derived* exemption from the example-page
 * shell: a fragment that declares the landmark is describing a whole document —
 * an app shell that runs edge to edge and paints its own inset — so mounting it
 * inside a 72rem measure column would misrepresent the very thing it demos.
 */
export function hasOwnMain(fragment: string): boolean {
  return /<main[\s>]/i.test(fragment) || /role\s*=\s*["']main["']/i.test(fragment);
}

/**
 * Does a fragment contain dialog-class markup? The framework's `landmark` rule
 * requires overlays to sit outside the main content flow, so such a fragment is
 * mounted as a sibling of `<main>` rather than inside it.
 */
function hasDialog(fragment: string): boolean {
  return (
    /<dialog[\s>]/i.test(fragment) ||
    /data-ui\s*=\s*["']dialog["']/i.test(fragment) ||
    /role\s*=\s*["'](?:dialog|alertdialog)["']/i.test(fragment)
  );
}

// ---------------------------------------------------------------------------
// Forced-open overlay previews (task 0.9-05)
// ---------------------------------------------------------------------------

/**
 * The attribute an example page's `<html>` carries so the site stylesheet can
 * force that one component's overlay open. Its value is the component name, so
 * the reveal is scoped to the page that documents it: a `dropdown` nested inside
 * `dashboard-shell` stays shut on the shell's own page, where it is furniture
 * rather than the subject.
 */
export const OVERLAY_PREVIEW_ATTR = "data-docs-overlay";

/**
 * The surfaces a static page can never show, per component.
 *
 * Eight recipes documented themselves with a lone trigger and nothing else: the
 * panel is `hidden` until a controller opens it, so `dialog`'s contract page —
 * the flagship recipe — rendered four buttons and no dialog. That is also why
 * `dialog.css` could ship with no trigger rule at all for as long as it did
 * (task 0.9-05): nobody could see the page was wrong, because the page showed
 * nothing to be wrong about.
 *
 * **This list is not free-form.** `lonelyFragments()` derives, from the registry
 * itself, every component whose reference markup leaves nothing visible but its
 * triggers, and the docs tests assert that each one appears here — so a recipe
 * added tomorrow inherits the gate rather than quietly joining the eight. Two
 * entries (`context-menu`, `menubar`) are editorial additions on top of that
 * floor: their fragments do render something, but the menu — the substance of
 * the component — is exactly the part that never appears.
 *
 * Deliberately NOT in it: `tabs`' inactive panels and `accordion`'s collapsed
 * content, which are `hidden` because closed *is* the state being demonstrated,
 * and every pattern, whose incidental dialogs are not what its page is about.
 */
export interface OverlaySurface {
  /** The `data-part` that is `hidden` until a controller opens it. */
  part: string;
  /**
   * The display the part takes when open — **not** derivable at render time.
   * `registry/base/reset.css` ships `[hidden] { display: none !important }`, so
   * a recipe's own `display: flex` never applies to a hidden panel and the only
   * declaration that can revive one is an `!important` of equal or greater
   * specificity. That forces the docs layer to *state* the value, which is why
   * it is recorded here beside the part rather than inferred: getting it wrong
   * silently relayouts a panel (`drawer`, `sheet` and `command-palette` are
   * flex columns; the rest are blocks).
   */
  display: string;
}

const panel = (display: string): readonly OverlaySurface[] =>
  Object.freeze([{ part: "panel", display }]);

export const OVERLAY_PREVIEW_SURFACES: Readonly<Record<string, readonly OverlaySurface[]>> =
  Object.freeze({
    "alert-dialog": panel("block"),
    "command-palette": panel("flex"),
    "context-menu": Object.freeze([{ part: "menu", display: "block" }]),
    dialog: panel("block"),
    drawer: panel("flex"),
    dropdown: Object.freeze([{ part: "menu", display: "block" }]),
    menubar: Object.freeze([{ part: "submenu", display: "block" }]),
    popover: Object.freeze([{ part: "content", display: "block" }]),
    sheet: panel("flex"),
    tooltip: Object.freeze([{ part: "content", display: "block" }]),
  });

/**
 * Does this reference fragment render nothing but its triggers?
 *
 * The predicate {@link OVERLAY_PREVIEW_SURFACES} is measured against, and the
 * reason the list cannot go stale: every part in the fragment is either visible
 * or sits under a `hidden` ancestor, and a fragment whose visible parts are only
 * triggers (or which has no visible part at all — `command-palette` renders an
 * empty page) is a component whose contract page demonstrates nothing.
 *
 * Attribution is deliberately by *ancestor*, not by owning component: a `close`
 * button inside a `hidden` panel is hidden regardless of which component claims
 * it, which is exactly the question being asked here.
 */
export function rendersOnlyTriggers(fragment: string): boolean {
  const doc = parseDocument(fragment, "fragment.html");
  const hidden = new Set<ParsedElement>();
  let visibleParts = 0;
  let visibleNonTrigger = 0;

  for (const el of doc.elements) {
    const concealed = "hidden" in el.attrs || (el.parent !== null && hidden.has(el.parent));
    if (concealed) hidden.add(el);
    const part = el.attrs["data-part"];
    if (part === undefined || concealed) continue;
    visibleParts++;
    if (part !== "trigger") visibleNonTrigger++;
  }

  // A fragment with no parts at all is a primitive demonstrating itself
  // (`badge`, `kbd`), not an overlay hiding its substance.
  return visibleNonTrigger === 0 && (visibleParts > 0 || doc.elements.some((e) => "hidden" in e.attrs));
}

/**
 * The forced-open rules, generated from {@link OVERLAY_PREVIEW_SURFACES} — the
 * docs-only half of this task, and the reason it is CSS rather than markup.
 *
 * An example page's body IS its registry fragment, byte for byte (asserted by
 * `tests/generator/docs-site.test.ts`), and the copy-for-agents payload is the
 * same bytes under a CDN preamble. A preview state that edited either would ship
 * an open dialog to everyone who pasted the snippet. A stylesheet the registry
 * never sees cannot: it lives in `styles/faqir.css`, which only the docs site
 * links, behind an attribute only an example page carries.
 *
 * Two rules per surface, and the split between them is load-bearing:
 *
 *  1. **Defeat `[hidden]`, and only that.** The reset ships
 *     `[hidden] { display: none !important }` — the one `!important` in the base
 *     layer — so nothing but another `!important` can put the panel back in the
 *     box tree, and the value has to be *stated* rather than left to the
 *     recipe's own rule (which the reset already outranks). Hence
 *     {@link OverlaySurface.display}: this is the whole reason a docs table
 *     records a display at all.
 *  2. **Force the open look, above the closed-state rules.** Four attribute
 *     selectors outrank every `[data-ui=…][data-state=…] [data-part=…]` rule in
 *     the registry, and the docs layer is concatenated last, so it also wins the
 *     ties (`tooltip` has one). No `!important` here: nothing in the base layer
 *     competes for these properties, so ordinary specificity settles it.
 *
 * The panel is put back **in flow** (`position: static`) rather than shown where
 * it really opens. A fixed panel would cover the triggers, stack four deep on a
 * page with four demos, and — since the layout gate of 0.9-01 counts overlapping
 * *fixed* boxes — turn every one of these pages into a finding. In flow it reads
 * as what it is: this trigger opens this panel.
 */
export function renderOverlayPreviewRules(
  surfaces: Readonly<Record<string, readonly OverlaySurface[]>> = OVERLAY_PREVIEW_SURFACES,
): string {
  const blocks: string[] = [];
  for (const name of Object.keys(surfaces).sort()) {
    for (const { part, display } of surfaces[name]) {
      const page = `[${OVERLAY_PREVIEW_ATTR}="${name}"]`;
      const target = `[data-part="${part}"]`;
      blocks.push(
        `/* ${name} — ${part}: the surface a static page can never show */\n` +
          `${page} [data-ui="${name}"] ${target}[hidden] {\n` +
          `  display: ${display} !important;\n` +
          `  max-inline-size: 100%;\n` +
          `}\n\n` +
          `${page} [data-ui="${name}"] ${target}[hidden] {\n` +
          `  position: static;\n` +
          `  inset: auto;\n` +
          `  inline-size: auto;\n` +
          `  block-size: auto;\n` +
          `  max-block-size: none;\n` +
          `  opacity: 1;\n` +
          `  visibility: visible;\n` +
          `  transform: none;\n` +
          `  transition: none;\n` +
          `  margin-block-start: var(--space-3);\n` +
          `}`,
      );
    }
  }
  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// The CDN preamble (task 0.7-15)
// ---------------------------------------------------------------------------

/**
 * `packages/core/cdn.json` — the published runtime's version and the SHA-384
 * integrity of every file in it, written by `scripts/build-core-package.mjs`.
 *
 * It is committed while `packages/core/dist/` is not, precisely so this
 * generator can emit `integrity="…"` without a package build having run: `bun
 * test` and the CI docs build both work from a bare checkout. A hash is only
 * meaningful beside the version it was computed for, so the two travel together
 * in one file, and the contract test fails while that version disagrees with
 * `packages/core/package.json` — pinning the URL to one release and the
 * integrity to another ships a page the browser refuses to load.
 */
export interface CdnPin {
  package: string;
  version: string;
  /** Absolute URL prefix, version-pinned, with a trailing slash. */
  base: string;
  /** File name (relative to `base`) → `sha384-…` token. */
  integrity: Record<string, string>;
}

export function readCdnPin(packageRoot: string = PACKAGE_ROOT): CdnPin {
  const path = join(packageRoot, "packages", "core", "cdn.json");
  if (!existsSync(path)) {
    throw new Error(
      `Missing CDN pin manifest at ${path} — run \`bun run build:core-package\` to write it.`,
    );
  }
  return JSON.parse(readText(path)) as CdnPin;
}

/** One `<link>`/`<script>` tag, version-pinned and integrity-checked. */
function cdnTag(pin: CdnPin, file: string, kind: "css" | "js"): string {
  const integrity = pin.integrity[file];
  if (!integrity) {
    throw new Error(
      `${file} has no integrity hash in packages/core/cdn.json — ` +
        `rerun \`bun run build:core-package\` so the docs site can pin it.`,
    );
  }
  const href = `${pin.base}${file}`;
  return kind === "css"
    ? `<link rel="stylesheet" href="${escAttr(href)}" integrity="${escAttr(
        integrity,
      )}" crossorigin="anonymous">`
    : `<script src="${escAttr(href)}" integrity="${escAttr(
        integrity,
      )}" crossorigin="anonymous" defer></script>`;
}

/**
 * The two-tag CDN preamble from `packages/core/README.md`, rendered with a real
 * version and real hashes instead of a `…paste from sri.json…` placeholder: one
 * prebuilt theme bundle and the minified engine. Everything a Faqir page needs,
 * and nothing else — there is no third tag.
 */
export function renderCdnPreamble(pin: CdnPin, theme: string): string {
  return (
    `<!-- Faqir UI — two tags, no build step. Pinned to ${pin.package}@${pin.version} with SRI. -->\n` +
    cdnTag(pin, `faqir.${theme}.css`, "css") +
    "\n" +
    cdnTag(pin, "faqir-core.min.js", "js")
  );
}

// ---------------------------------------------------------------------------
// Token reference
// ---------------------------------------------------------------------------

export interface TokenEntry {
  /** Token name without the leading `--`. */
  name: string;
  /** Declared value, verbatim. */
  value: string;
  /** Token file the canonical declaration came from. */
  group: string;
}

const ROOT_BLOCK_RE = /:root\s*\{([^}]*)\}/g;
const DECL_RE = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;

/**
 * Every `:root` custom property the registry declares, in cascade order,
 * first-declaration-wins. Only `:root` blocks are read: a `[data-theme="dark"]`
 * or `[data-density]` block re-declares tokens for a scope, and the reference
 * documents the token, not each of its scoped values.
 */
export function parseTokenReference(registryRoot: string): TokenEntry[] {
  const seen = new Map<string, TokenEntry>();
  for (const file of TOKEN_FILES) {
    const path = join(registryRoot, "tokens", `${file}.css`);
    if (!existsSync(path)) continue;
    const css = readText(path).replace(/\/\*[^]*?\*\//g, "");
    for (const block of css.matchAll(ROOT_BLOCK_RE)) {
      for (const decl of block[1].matchAll(DECL_RE)) {
        const name = decl[1];
        if (seen.has(name)) continue;
        seen.set(name, { name, value: decl[2].trim(), group: file });
      }
    }
  }
  return [...seen.values()];
}

export interface DensityTokenEntry {
  /** Token name without the leading `--`. */
  name: string;
  /** Value in `[data-density="compact"]`. */
  compact: string | null;
  /** Value in `[data-density="comfortable"]`. */
  comfortable: string | null;
}

/**
 * Every custom property in the two density scopes, ordered by the public
 * density contract in `src/utils/layout.ts`. The page renderer and the reverse
 * cross-check consume this same shape, while the CSS parser remains independent
 * enough to expose a missing or extra declaration as `null`/a set mismatch.
 */
export function parseDensityReference(registryRoot: string): DensityTokenEntry[] {
  const path = join(registryRoot, "tokens", "density.css");
  if (!existsSync(path)) return [];
  const css = readText(path).replace(/\/\*[^]*?\*\//g, "");
  const scopes = new Map<string, Map<string, string>>();
  for (const match of css.matchAll(/\[data-density="(compact|comfortable)"\]\s*\{([^}]*)\}/g)) {
    const declarations = new Map<string, string>();
    for (const decl of match[2].matchAll(DECL_RE)) {
      declarations.set(decl[1], decl[2].trim().replace(/\s+/g, " "));
    }
    scopes.set(match[1], declarations);
  }
  const compact = scopes.get("compact") ?? new Map<string, string>();
  const comfortable = scopes.get("comfortable") ?? new Map<string, string>();
  const declared = new Set([...compact.keys(), ...comfortable.keys()]);
  const ordered = [
    ...DENSITY_TOKENS,
    ...[...declared].filter((name) => !DENSITY_TOKENS.includes(name)).sort(),
  ];
  return ordered.map((name) => ({
    name,
    compact: compact.get(name) ?? null,
    comfortable: comfortable.get(name) ?? null,
  }));
}

/** One live example embedded in an authored spacing/density guide. */
export interface GuideExample {
  id: string;
  title: string;
  /** Exact bytes between the authored `<template>` tags. */
  html: string;
}

const GUIDE_EXAMPLE_OPEN =
  /<template data-docs-example="([a-z0-9-]+)" data-title="([^"]+)">[ \t]*\n/g;

/** One extracted example, with the span of the authored source it came from. */
interface GuideExampleSpan extends GuideExample {
  start: number;
  end: number;
}

/**
 * Extract guide examples from an authored page, with their source spans.
 *
 * The close tag is found by **counting**, not by matching the first
 * `</template>`: `l-for` and `l-if` are `<template>` directives, so an engine
 * example legally nests one or two of them, and a non-greedy regex ended the
 * example at the inner tag — shipping a truncated demo that still audited clean
 * because the audit tolerates an unclosed element (task 1.0R-09; the runtime
 * test in `tests/generator/engine-page.test.ts` is what caught it).
 */
function scanGuideExamples(authored: string): GuideExampleSpan[] {
  const found: GuideExampleSpan[] = [];
  GUIDE_EXAMPLE_OPEN.lastIndex = 0;
  for (const open of authored.matchAll(GUIDE_EXAMPLE_OPEN)) {
    const bodyStart = open.index! + open[0].length;
    const tag = /<template\b|<\/template\s*>/g;
    tag.lastIndex = bodyStart;
    let depth = 1;
    let match: RegExpExecArray | null;
    while ((match = tag.exec(authored)) !== null) {
      depth += match[0].startsWith("</") ? -1 : 1;
      if (depth === 0) break;
    }
    // An unbalanced example is an authoring error, not something to render half of.
    if (!match) continue;
    // The example's own bytes end at the newline before the closing tag's indent.
    const closeAt = match.index!;
    const lineStart = authored.lastIndexOf("\n", closeAt);
    const html = authored.slice(bodyStart, /^\s*$/.test(authored.slice(lineStart + 1, closeAt)) ? lineStart : closeAt);
    found.push({
      id: open[1],
      title: open[2],
      html,
      start: open.index!,
      end: closeAt + match[0].length,
    });
  }
  return found;
}

/**
 * Extract guide examples from `site/content/{spacing,density,engine}.html`
 * without rewriting their markup. Tests audit `html`; the renderer below mounts
 * and prints those exact bytes, so the page cannot ship a lookalike of the
 * example that passed the audit.
 */
export function parseGuideExamples(authored: string): GuideExample[] {
  return scanGuideExamples(authored).map(({ id, title, html }) => ({ id, title, html }));
}

function renderGuideExamples(authored: string): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const example of scanGuideExamples(authored)) {
    parts.push(authored.slice(cursor, example.start));
    const { id, title, html } = example;
    parts.push(
      `<figure data-docs-guide-example id="${escAttr(id)}">\n` +
        `  <figcaption><strong>${esc(title)}</strong></figcaption>\n` +
        `  <div data-docs-example-live>\n${html}\n  </div>\n` +
        `  <details>\n` +
        `    <summary>Copy the audited markup</summary>\n` +
        `    <pre tabindex="0"><code>${esc(html)}</code></pre>\n` +
        `  </details>\n` +
        `</figure>`,
    );
    cursor = example.end;
  }
  parts.push(authored.slice(cursor));
  return parts.join("");
}

/** Is this token's value paintable — i.e. worth a colour swatch? */
function isColorToken(entry: TokenEntry): boolean {
  return (
    /^(?:oklch|rgb|hsl|color-mix)\(/i.test(entry.value) ||
    /^#[0-9a-f]{3,8}$/i.test(entry.value) ||
    (/^var\(--color-/i.test(entry.value) && !/shadow/i.test(entry.name))
  );
}

/** Anchor id for a token on the token-reference page. */
export function tokenAnchor(name: string): string {
  return `token-${slug(name)}`;
}

/**
 * Tokens the site paints a swatch for: the ones whose *value* is a colour (the
 * token reference's sample column) plus the semantic `color-*` set, whose values
 * are usually a `var(--palette-…)` hop the value heuristic cannot see and which
 * is exactly the surface a theme re-declares (the gallery frames).
 *
 * One list, because one list is what {@link renderSwatchRules} can turn into
 * CSS: a swatch's background is a *per-token* declaration, and the alternative
 * — `style="background: var(--x)"` on every span — is the inline escape 0.9-03
 * removes from the site.
 */
function isSwatchToken(entry: TokenEntry): boolean {
  return isColorToken(entry) || (entry.group === "semantic" && entry.name.startsWith("color-"));
}

/** One painted swatch, named by the token it shows. */
function renderSwatch(entry: TokenEntry): string {
  return `<span data-docs-swatch="${escAttr(entry.name)}" title="--${escAttr(entry.name)}"></span>`;
}

/**
 * `[data-docs-swatch="…"] { background: var(--…); }` for every swatchable token.
 * Generated rather than authored: the token set is the registry's, so a new
 * colour token paints itself with no edit to `site/styles/docs.css`, which is
 * the same claim every other page of this site makes.
 */
function renderSwatchRules(tokenList: readonly TokenEntry[]): string {
  return tokenList
    .filter(isSwatchToken)
    .map((t) => `[data-docs-swatch="${t.name}"] { background: var(--${t.name}); }`)
    .join("\n");
}

/**
 * Live typography previews, generated from the same token list as the reference
 * page. The attribute value names the token; the prefix decides which CSS
 * property consumes it, so adding a new type-scale step makes it render without
 * an inline style or a hand-maintained selector.
 */
function renderTypographyPreviewRules(tokenList: readonly TokenEntry[]): string {
  return tokenList
    .filter((entry) => entry.group === "typography")
    .map((entry) => {
      const property = entry.name.startsWith("font-")
        ? "font-family"
        : entry.name.startsWith("text-")
          ? "font-size"
          : entry.name.startsWith("weight-")
            ? "font-weight"
            : entry.name.startsWith("leading-")
              ? "line-height"
              : null;
      return property
        ? `[data-docs-token-preview="${entry.name}"] { ${property}: var(--${entry.name}); }`
        : "";
    })
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

interface ShellInput {
  /** Site-relative path of the page being rendered (drives every relative URL). */
  pagePath: string;
  title: string;
  description: string;
  /** Main-content HTML, already escaped/assembled. */
  body: string;
  config: SiteConfig;
  components: DocsComponent[];
  /** Registry themes offered by the persistent appearance selector. */
  themes?: DocsTheme[];
  /** Nav entry that should carry `aria-current="page"`. */
  current: string;
  /** Width/presentation treatment for the page body. */
  layout?: "home" | "wide" | "reference";
  /**
   * Site-relative scripts this page loads, in order. Empty for every page except
   * the playground and the theme gallery (task 0.7-14).
   */
  scripts?: string[];
  /**
   * Emit `<meta name="robots" content="noindex">`. True only for the signposts
   * at {@link RETIRED_PAGES}: they resolve for the links that already exist,
   * and are not a URL of this site any more.
   */
  noindex?: boolean;
}

/**
 * The swappable theme `<link>`, or nothing for a registry that ships no themes.
 * It always comes last in `<head>`, and always carries {@link THEME_LINK_ID}, so
 * "switch the theme" is one `href` assignment on every page of the site.
 */
function renderThemeLink(pagePath: string, theme: string): string {
  if (!theme) return "";
  return (
    `\n<link rel="stylesheet" href="${escAttr(
      relUrl(pagePath, `styles/themes/${theme}.css`),
    )}" id="${THEME_LINK_ID}" data-theme-name="${escAttr(theme)}">`
  );
}

/**
 * The navigation shell every site page shares: the `dashboard-shell` pattern,
 * with a searchable, disclosure-grouped component index and persistent
 * appearance controls. The sidebar is still generated from the registry, so a
 * new component appears across the whole site with no site edit.
 *
 * It deliberately starts without `data-state`. On small screens dashboard-shell
 * turns it into an off-canvas panel; the shared progressive-enhancement script
 * adds `data-state="expanded"` only after the reader activates the menu button.
 * Without JavaScript, the compact header navigation still reaches every section.
 */
function renderShell(input: ShellInput): string {
  const { pagePath, config, components, current } = input;
  const themes = input.themes ?? [];
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const canonical = canonicalUrl(config, pagePath);
  const currentAttr = (key: string) => (key === current ? ' aria-current="page"' : "");
  const themeLink = renderThemeLink(pagePath, config.theme);
  const scripts = ["scripts/gallery.js", ...(input.scripts ?? [])].filter(
    (src, index, list) => list.indexOf(src) === index,
  );

  const groups = LAYERS.map((layer) => ({
    layer,
    items: components.filter((c) => c.layer === layer),
  })).filter((g) => g.items.length > 0);

  // The scaffold group, built from the CLI catalogue exactly as the layer groups
  // are built from the registry: registering a scaffold adds its nav entry.
  const scaffoldNav = SCAFFOLD_NAMES.length
    ? `        <details data-docs-nav-group data-docs-layer="scaffolds"${
        current.startsWith("scaffolds/") ? " open" : ""
      }>\n` +
      `          <summary>Scaffolds <span data-ui="badge" data-size="sm">${esc(
        String(SCAFFOLD_NAMES.length),
      )}</span></summary>\n` +
      `          <div data-docs-nav-items>\n` +
      SCAFFOLD_NAMES.map(
        (name) =>
          `            <a data-part="nav-item" href="${u(scaffoldPagePath(name))}"${currentAttr(
            scaffoldPagePath(name),
          )}>${esc(name)}</a>`,
      ).join("\n") +
      `\n          </div>\n        </details>`
    : "";

  const navGroups = groups
    .map((g) => {
      const open = current.startsWith(`components/${g.layer}/`) ? " open" : "";
      const items = g.items
        .map(
          (c) =>
            `            <a data-part="nav-item" href="${u(c.pagePath)}"${currentAttr(
              c.pagePath,
            )}>${esc(c.name)}</a>`,
        )
        .join("\n");
      return (
        `        <details data-docs-nav-group data-docs-layer="${g.layer}"${open}>\n` +
        `          <summary>${esc(LAYER_LABEL[g.layer])} <span data-ui="badge" data-size="sm">${esc(
          String(g.items.length),
        )}</span></summary>\n` +
        `          <div data-docs-nav-items>\n${items}\n          </div>\n` +
        `        </details>`
      );
    })
    .join("\n");

  const themeOptions = (themes.length
    ? themes
    : [{ name: config.theme, manifest: null } as DocsTheme]
  )
    .map(
      (theme) =>
        `<option value="${escAttr(theme.name)}" data-theme-scheme="${escAttr(
          theme.manifest?.scheme ?? "both",
        )}"${theme.name === config.theme ? " selected" : ""}>${esc(theme.name)}</option>`,
    )
    .join("");

  const topActive = (section: string): string => {
    const active =
      section === "components"
        ? current.startsWith("components/")
        : section === "icons"
          ? current === ICONS_PAGE
          : section === "typography"
            ? current === TYPOGRAPHY_PAGE
            : section === "layouts"
              ? [LAYOUT_PAGE, RESPONSIVE_PAGE, SPACING_PAGE, DENSITY_PAGE].includes(current)
              : section === "scaffolds"
                ? current.startsWith("scaffolds/")
                : section === "themes"
                  ? current === THEMES_PAGE
                  : section === "agents"
                    ? current === AGENTS_PAGE
                    : section === "spec"
                      ? current === SPEC_PAGE
                      : false;
    return active ? ' data-state="active"' : "";
  };

  return `<!DOCTYPE html>
<html lang="en" data-theme="auto" data-faqir-docs>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escAttr(input.title)}</title>
<meta name="description" content="${escAttr(input.description)}">
<meta name="color-scheme" content="light dark">${
  input.noindex ? '\n<meta name="robots" content="noindex">' : ""
}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escAttr(config.title)}">
<meta property="og:title" content="${escAttr(input.title)}">
<meta property="og:description" content="${escAttr(input.description)}">
<meta property="og:url" content="${escAttr(canonical)}">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="${escAttr(canonical)}">
<link rel="stylesheet" href="${u("styles/faqir.css")}">${themeLink}
${scripts.map((src) => `<script src="${u(src)}" defer></script>`).join("\n")}
<!-- ${DOCS_GENERATION_MARKER} · regenerate with \`bun run build:docs\` · do not edit by hand -->
</head>
<body>
<a data-ui="button" data-variant="primary" data-size="sm" href="#main-content" data-docs-skip>Skip to content</a>
<div data-ui="dashboard-shell" data-docs-shell>

  <aside data-part="sidebar" id="docs-sidebar" aria-label="Documentation sidebar">
    <a data-part="logo" href="${u("index.html")}" data-docs-brand>
      <span data-docs-brand-mark><span data-ui="icon" data-icon="sparkles" aria-hidden="true"></span></span>
      <span data-docs-brand-copy>
        <span data-docs-brand-name>${esc(config.title)}</span>
        <span data-docs-brand-tagline>${esc(config.tagline)}</span>
      </span>
    </a>
    <div data-docs-sidebar-filter>
      <label data-ui="label" for="docs-nav-filter">Filter ${esc(String(components.length))} components</label>
      <input data-ui="input" data-size="sm" id="docs-nav-filter" type="search" placeholder="Search components…" autocomplete="off" data-docs-nav-filter>
    </div>
    <nav data-part="nav" role="navigation" aria-label="Documentation">
      <div data-docs-nav-primary>
        <a data-part="nav-item" href="${u("index.html")}"${currentAttr("index.html")}>Overview</a>
        <a data-part="nav-item" href="${u("components/index.html")}"${currentAttr(
          "components/index.html",
        )}>All components</a>
        <a data-part="nav-item" href="${u(ICONS_PAGE)}"${currentAttr(
          ICONS_PAGE,
        )}>Icons</a>
        <a data-part="nav-item" href="${u(TYPOGRAPHY_PAGE)}"${currentAttr(
          TYPOGRAPHY_PAGE,
        )}>Typography</a>
        <a data-part="nav-item" href="${u(LAYOUT_PAGE)}"${currentAttr(
          LAYOUT_PAGE,
        )}>Layout guide</a>
        <a data-part="nav-item" href="${u(RESPONSIVE_PAGE)}"${currentAttr(
          RESPONSIVE_PAGE,
        )}>Responsive lab</a>
        <a data-part="nav-item" href="${u(SPACING_PAGE)}"${currentAttr(
          SPACING_PAGE,
        )}>Spacing &amp; rhythm</a>
        <a data-part="nav-item" href="${u(DENSITY_PAGE)}"${currentAttr(
          DENSITY_PAGE,
        )}>Density</a>
        <a data-part="nav-item" href="${u(ENGINE_PAGE)}"${currentAttr(
          ENGINE_PAGE,
        )}>Reactive engine</a>
        <a data-part="nav-item" href="${u("tokens/index.html")}"${currentAttr(
          "tokens/index.html",
        )}>Design tokens</a>
        <a data-part="nav-item" href="${u(THEMES_PAGE)}"${currentAttr(
          THEMES_PAGE,
        )}>Theme gallery</a>
        <a data-part="nav-item" href="${u(SCAFFOLDS_PAGE)}"${currentAttr(
          SCAFFOLDS_PAGE,
        )}>Scaffolds</a>
        <a data-part="nav-item" href="${u(PLAYGROUND_PAGE)}"${currentAttr(
          PLAYGROUND_PAGE,
        )}>Audit playground</a>
        <a data-part="nav-item" href="${u(AGENTS_PAGE)}"${currentAttr(
          AGENTS_PAGE,
        )}>For agents</a>
        <a data-part="nav-item" href="${u(SPEC_PAGE)}"${currentAttr(
          SPEC_PAGE,
        )}>Protocol ${esc(PROTOCOL_VERSION)}</a>
        <a data-part="nav-item" href="${u(MIGRATION_PAGE)}"${currentAttr(
          MIGRATION_PAGE,
        )}>Migrating to ${esc(PROTOCOL_VERSION)}</a>
      </div>
      <div data-docs-nav-groups>
${[scaffoldNav, navGroups].filter(Boolean).join("\n")}
      </div>
    </nav>
  </aside>

  <header data-part="header" role="banner">
    <button data-ui="button" data-variant="ghost" data-size="sm" type="button" aria-label="Open documentation navigation" aria-controls="docs-sidebar" aria-expanded="false" data-docs-sidebar-toggle>
      <span data-ui="icon" data-icon="menu" aria-hidden="true"></span>
    </button>
    <a data-docs-header-brand href="${u("index.html")}">
      <span data-docs-brand-mark><span data-ui="icon" data-icon="sparkles" aria-hidden="true"></span></span>
      <span data-docs-brand-name>${esc(config.title)}</span>
    </a>
    <nav data-ui="nav" aria-label="Site sections" data-docs-top-nav>
      <a data-part="link"${topActive("components")} href="${u("components/index.html")}">Components</a>
      <a data-part="link"${topActive("icons")} href="${u(ICONS_PAGE)}">Icons</a>
      <a data-part="link"${topActive("typography")} href="${u(TYPOGRAPHY_PAGE)}">Typography</a>
      <a data-part="link"${topActive("layouts")} href="${u(LAYOUT_PAGE)}">Layout</a>
      <a data-part="link"${topActive("themes")} href="${u(THEMES_PAGE)}">Themes</a>
      <a data-part="link"${topActive("scaffolds")} href="${u(SCAFFOLDS_PAGE)}">Scaffolds</a>
      <a data-part="link"${topActive("agents")} href="${u(AGENTS_PAGE)}">For agents</a>
      <a data-part="link"${topActive("spec")} href="${u(SPEC_PAGE)}">Protocol</a>
      <a data-part="link" href="${u(PLAYGROUND_PAGE)}">Playground</a>
    </nav>
    <div data-docs-appearance>
      <label data-docs-control for="docs-theme-select">
        <span data-docs-control-label>Theme</span>
        <select data-ui="select" data-size="sm" id="docs-theme-select" data-theme-select>${themeOptions}</select>
      </label>
      <label data-docs-control data-docs-scheme-control for="docs-scheme-select">
        <span data-docs-control-label>Mode</span>
        <select data-ui="select" data-size="sm" id="docs-scheme-select" data-scheme-select>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="auto" selected>Auto</option>
        </select>
      </label>
      <span id="appearance-status" role="status" aria-live="polite" data-docs-a11y></span>
    </div>
  </header>

  <main data-part="content" role="main" id="main-content" tabindex="0" data-docs-page="${input.layout ?? "reference"}">
    <div data-ui="container" data-measure="wide">
      <article data-ui="prose">
${input.body}
      </article>
    </div>
  </main>

  <footer data-part="footer">
    <span>${esc(config.footer)}</span>
    <span data-docs-footer-links>
      <a data-ui="link" data-variant="muted" href="${u(LLMS_INDEX_FILE)}">llms.txt</a>
      <a data-ui="link" data-variant="muted" href="https://github.com/Narcis13/faqir-ui" target="_blank" rel="noopener noreferrer">GitHub</a>
    </span>
  </footer>

</div>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Manifest-derived sections
// ---------------------------------------------------------------------------

/** A `<table>` with a header row, or an italic note when there is nothing to show. */
function table(headers: string[], rows: string[][], emptyNote: string): string {
  if (rows.length === 0) return `      <p><em>${esc(emptyNote)}</em></p>`;
  const head = headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  const body = rows
    .map((r) => `        <tr>${r.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("\n");
  return `      <table>\n        <thead><tr>${head}</tr></thead>\n        <tbody>\n${body}\n        </tbody>\n      </table>`;
}

function code(value: string): string {
  return `<code>${esc(value)}</code>`;
}

/**
 * A monospaced link. Deliberately NOT `<a><code>…</code></a>`: prose gives
 * `code` a `--color-bg-muted` plate and no colour of its own, so a code element
 * inside a link renders `--color-primary` on `--color-bg-muted` — 4.41:1 in the
 * default dark scheme, just under AA (caught by the site's own axe gate). The
 * `text` primitive's `mono` variant supplies the typeface and nothing else, so
 * the link keeps its own colour on the page background.
 */
function monoLink(href: string, label: string): string {
  return (
    `<a data-ui="link" href="${escAttr(href)}">` +
    `<span data-ui="text" data-variant="mono">${esc(label)}</span></a>`
  );
}

/**
 * The anatomy tree: the root element followed by every named slot, annotated
 * with its tag hint and required-ness. Same shape the generated skill renders,
 * so an agent reading the docs and an agent reading the skill see one anatomy.
 */
export function renderAnatomyTree(m: Manifest): string {
  const lines: string[] = [];
  const content = m.anatomy?.content_model ? `  ·  content: ${m.anatomy.content_model}` : "";
  lines.push(`${m.anatomy?.selector ?? ""}  ·  <${m.anatomy?.tag ?? "div"}>${content}`);
  const slots = Object.entries(m.slots ?? {});
  slots.forEach(([, slot], i) => {
    const branch = i === slots.length - 1 ? "└─" : "├─";
    const tag = slot.tag_hint ? ` <${slot.tag_hint}>` : "";
    const req = slot.required ? "required" : "optional";
    lines.push(`${branch} ${slot.selector}${tag}  ${req}`);
  });
  return `      <pre tabindex="0"><code>${esc(lines.join("\n"))}</code></pre>`;
}

function renderSlotTable(m: Manifest): string {
  const rows = Object.entries(m.slots ?? {}).map(([name, slot]) => [
    code(name),
    code(slot.selector),
    slot.tag_hint ? code(`<${slot.tag_hint}>`) : "—",
    slot.required ? "required" : "optional",
    esc(slot.description ?? ""),
  ]);
  return table(
    ["Slot", "Selector", "Tag hint", "Required", "Description"],
    rows,
    "This component has no named slots — its content model is its anatomy.",
  );
}

function renderVariantTable(m: Manifest): string {
  const entries = Object.entries(m.variants ?? {});
  // The responsive column only appears when the component declares at least one
  // responsive group — a column of dashes on the other 80-odd pages teaches
  // nothing. Generic: every tier comes from the canon, no component is named.
  const anyResponsive = entries.some(([, v]) => v.responsive === true);
  const rows = entries.map(([name, v]) => {
    const row = [
      esc(name),
      code(v.attr),
      v.values.map((value) => code(`${v.attr}="${value}"`)).join(" "),
      code(v.default),
      code(v.applied_to ?? "root"),
    ];
    if (anyResponsive) {
      row.push(
        v.responsive === true
          ? TIERS.map((tier) => code(`${responsiveAttribute(v.attr, tier)}="…"`)).join(" ")
          : "—",
      );
    }
    return row;
  });
  const headers = ["Variant", "Attribute", "Values", "Default", "Applied to"];
  if (anyResponsive) headers.push("Responsive");
  return table(headers, rows, "This component has no variants.");
}

function renderStateTable(m: Manifest): string {
  const rows = Object.entries(m.states ?? {}).map(([name, s]) => [
    esc(name),
    s.attr ? code(s.attr) : "—",
    s.default ? "yes" : "no",
    code(s.applied_to ?? "root"),
    esc(s.description ?? ""),
  ]);
  return table(
    ["State", "Attribute", "Default", "Applied to", "Description"],
    rows,
    "This component declares no states.",
  );
}

function renderA11yTable(m: Manifest): string {
  const a = m.a11y ?? {};
  const rows: string[][] = [];
  if (a.role) rows.push(["Role", code(a.role)]);
  if (a["aria-modal"]) rows.push(["Modal", code('aria-modal="true"')]);
  if (a.focus_trap) rows.push(["Focus trap", "yes — focus is confined while open"]);
  if (a.escape_closes) rows.push(["Escape", "closes the component"]);
  if (a.return_focus) rows.push(["Return focus", esc(a.return_focus)]);
  if (a.required_attrs?.length) {
    rows.push(["Required ARIA", a.required_attrs.map((x) => code(x)).join("<br>")]);
  }
  for (const [key, action] of Object.entries(a.keyboard ?? {})) {
    rows.push([code(key), esc(action)]);
  }
  return table(
    ["Requirement", "Contract"],
    rows,
    "No component-specific accessibility contract — standard semantics apply.",
  );
}

function renderTokenList(m: Manifest, tokens: Map<string, TokenEntry>, pagePath: string): string {
  const used = m.tokens_used ?? [];
  if (used.length === 0) return `      <p><em>This component declares no design tokens.</em></p>`;
  const items = used
    .map((name) => {
      if (!tokens.has(name)) return `<li>${code(`--${name}`)}</li>`;
      const href = `${relUrl(pagePath, "tokens/index.html")}#${tokenAnchor(name)}`;
      return `<li>${monoLink(href, `--${name}`)}</li>`;
    })
    .join("\n        ");
  return `      <ul>\n        ${items}\n      </ul>`;
}

function renderTemplates(m: Manifest): string {
  const entries = Object.entries(m.templates ?? {});
  if (entries.length === 0) return `      <p><em>No canonical template recorded.</em></p>`;
  return entries
    .map(
      ([key, tpl]) =>
        `      <h3>${esc(key)}</h3>\n      <pre tabindex="0"><code>${esc(String(tpl))}</code></pre>`,
    )
    .join("\n");
}

function renderTransforms(m: Manifest): string {
  const safe = m.safe_transforms ?? [];
  const unsafe = m.unsafe_transforms ?? [];
  const parts: string[] = [];
  parts.push(`      <h3>Safe transforms</h3>`);
  parts.push(
    safe.length
      ? `      <ul>\n        ${safe.map((t) => `<li>${code(t)}</li>`).join("\n        ")}\n      </ul>`
      : `      <p><em>None recorded.</em></p>`,
  );
  parts.push(`      <h3>Never do this</h3>`);
  parts.push(
    unsafe.length
      ? `      <ul>\n        ${unsafe.map((t) => `<li>${code(t)}</li>`).join("\n        ")}\n      </ul>`
      : `      <p><em>None recorded.</em></p>`,
  );
  return parts.join("\n");
}

function renderComposition(
  m: Manifest,
  byName: Map<string, DocsComponent>,
  pagePath: string,
): string {
  const link = (name: string): string => {
    const target = byName.get(name);
    if (!target) return code(name);
    return monoLink(relUrl(pagePath, target.pagePath), name);
  };
  const contains = m.composition?.contains ?? [];
  const usedIn = m.composition?.used_in ?? [];
  const rows: string[][] = [
    ["Composes", contains.length ? contains.map(link).join(", ") : "—"],
    ["Used in", usedIn.length ? usedIn.map(link).join(", ") : "—"],
  ];
  return table(["Relationship", "Components"], rows, "No composition recorded.");
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function section(id: string, heading: string, body: string): string {
  return `      <h2 id="${escAttr(id)}">${esc(heading)}</h2>\n${body}`;
}

function metaBadges(c: DocsComponent): string {
  const m = c.manifest;
  const badge = (variant: string, text: string) =>
    `<span data-ui="badge" data-variant="${escAttr(variant)}">${esc(text)}</span>`;
  const kindVariant =
    m.kind === "primitive" ? "primary" : m.kind === "recipe" ? "secondary" : "default";
  return (
    `      <p>${badge(kindVariant, m.kind)} ${badge("default", m.category ?? "uncategorised")} ` +
    `${badge("default", `v${m.version ?? "1.0.0"}`)}${
      m.files?.js ? ` ${badge("default", m.files.js)}` : ""
    }</p>`
  );
}

/** One component's documentation page — every section derived from its manifest. */
function renderComponentPage(
  c: DocsComponent,
  ctx: {
    config: SiteConfig;
    components: DocsComponent[];
    byName: Map<string, DocsComponent>;
    tokens: Map<string, TokenEntry>;
    themes: DocsTheme[];
    hasExample: boolean;
    /** The copy-for-agents payload, when this component ships reference markup. */
    snippet: string | null;
    pin: CdnPin;
  },
): SiteFile {
  const m = c.manifest;
  const exampleUrl = escAttr(relUrl(c.pagePath, c.examplePath));

  const live = ctx.hasExample
    ? `      <p>The frame below is this component's registry reference page — the canonical, ` +
      `authored demonstration of its variants and states, rendered live with the site's own stylesheet. ` +
      `<a data-ui="link" href="${exampleUrl}">Open it on its own page</a>.</p>\n` +
      `      <div data-docs-preview-toolbar>\n` +
      `        <span data-ui="text" data-size="sm" data-variant="muted">Preview the real component at three inline sizes.</span>\n` +
      `        <div data-ui="cluster" data-gap="2" role="group" aria-label="Preview width">\n` +
      `          <button data-ui="button" data-variant="outline" data-size="sm" type="button" data-preview-size="phone" data-preview-width="23.5rem" data-preview-target="component-preview" aria-pressed="false">Phone</button>\n` +
      `          <button data-ui="button" data-variant="outline" data-size="sm" type="button" data-preview-size="tablet" data-preview-width="48rem" data-preview-target="component-preview" aria-pressed="false">Tablet</button>\n` +
      `          <button data-ui="button" data-variant="outline" data-size="sm" type="button" data-preview-size="full" data-preview-width="100%" data-preview-target="component-preview" aria-pressed="true">Full</button>\n` +
      `        </div>\n` +
      `      </div>\n` +
      `      <div data-docs-preview-stage>\n` +
      `        <iframe id="component-preview" src="${exampleUrl}" title="${escAttr(
        `${c.name} live example`,
      )}" loading="lazy" data-docs-preview-frame data-component-frame></iframe>\n` +
      `      </div>`
    : `      <p><em>No reference page ships with this component.</em></p>`;

  const body = [
    `      <nav data-ui="breadcrumb" data-size="sm" aria-label="Breadcrumb" data-docs-breadcrumbs>
        <ol data-part="list">
          <li><a data-part="item" href="${escAttr(relUrl(c.pagePath, "index.html"))}">Overview</a></li>
          <li data-part="separator" aria-hidden="true"></li>
          <li><a data-part="item" href="${escAttr(relUrl(c.pagePath, "components/index.html"))}">${esc(
            LAYER_LABEL[c.layer],
          )}</a></li>
          <li data-part="separator" aria-hidden="true"></li>
          <li><span data-part="current" aria-current="page">${esc(c.name)}</span></li>
        </ol>
      </nav>`,
    `      <h1>${esc(c.name)}</h1>`,
    metaBadges(c),
    `      <p>${esc(m.description ?? "")}</p>`,
    m.aliases?.length
      ? `      <p>Also available as ${m.aliases.map((a) => code(a)).join(", ")}.</p>`
      : "",
    section("live-example", "Live example", live),
    ctx.snippet
      ? section("copy-for-agents", "Copy for agents", renderCopyForAgents(c, ctx.snippet, ctx.pin))
      : "",
    section("anatomy", "Anatomy", renderAnatomyTree(m) + "\n" + renderSlotTable(m)),
    section("variants", "Variant matrix", renderVariantTable(m)),
    section("states", "States", renderStateTable(m)),
    section("accessibility", "Accessibility", renderA11yTable(m)),
    section("tokens", "Design tokens", renderTokenList(m, ctx.tokens, c.pagePath)),
    section("templates", "Templates", renderTemplates(m)),
    section("transforms", "Transforms", renderTransforms(m)),
    section("composition", "Composition", renderComposition(m, ctx.byName, c.pagePath)),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    path: c.pagePath,
    content: renderShell({
      pagePath: c.pagePath,
      title: `${c.name} · ${ctx.config.title}`,
      description: m.description ?? `${c.name} — a Faqir ${m.kind}.`,
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: c.pagePath,
      layout: "reference",
      // Only the copy button needs scripting, and only where there is a payload
      // to copy: a component with no reference markup stays a static page.
      scripts: ctx.snippet ? ["scripts/copy-snippet.js"] : undefined,
    }),
  };
}

/** The component index: every component as a card, grouped by layer. */
function renderComponentIndex(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  registryRoot: string;
}): SiteFile {
  const pagePath = "components/index.html";
  const categories = [
    ...new Set(ctx.components.map((c) => c.manifest.category).filter((x): x is string => !!x)),
  ].sort();
  const parts: string[] = [
    `      <h1>Components</h1>`,
    `      <p>${esc(
      `${ctx.components.length} components across three layers. Search the real registry, then open any card for its live example, anatomy, variants, accessibility contract, tokens, and agent-ready snippet.`,
    )}</p>`,
    `      <div data-docs-filter-panel>
        <div data-ui="switcher" data-threshold="md" data-gap="3">
          <div data-docs-filter-control>
            <label data-ui="label" for="component-search">Search the registry</label>
            <input data-ui="input" id="component-search" type="search" placeholder="button, table, navigation…" autocomplete="off" data-component-search>
          </div>
          <div data-docs-filter-control>
            <label data-ui="label" for="component-layer-filter">Layer</label>
            <select data-ui="select" id="component-layer-filter" data-component-layer-filter>
              <option value="">All layers</option>
              ${LAYERS.map(
                (layer) => `<option value="${layer}">${esc(LAYER_LABEL[layer])}</option>`,
              ).join("")}
            </select>
          </div>
          <div data-docs-filter-control>
            <label data-ui="label" for="component-category-filter">Category</label>
            <select data-ui="select" id="component-category-filter" data-component-category-filter>
              <option value="">All categories</option>
              ${categories
                .map((category) => `<option value="${escAttr(category)}">${esc(category)}</option>`)
                .join("")}
            </select>
          </div>
        </div>
        <div data-docs-filter-meta>
          <strong id="component-result-count" role="status" aria-live="polite">${esc(
            `${ctx.components.length} of ${ctx.components.length} components`,
          )}</strong>
          <span>Manifest-derived · keyboard searchable · no request leaves this page</span>
        </div>
        <p data-component-empty hidden>No components match those filters. Try a broader term.</p>
      </div>`,
  ];

  for (const layer of LAYERS) {
    const items = ctx.components.filter((c) => c.layer === layer);
    if (items.length === 0) continue;
    parts.push(`      <section id="${layer}" data-component-group>`);
    parts.push(`      <h2>${esc(LAYER_LABEL[layer])} (${items.length})</h2>`);
    parts.push(`      <p>${esc(LAYER_BLURB[layer])}</p>`);
    parts.push(
      `      <div data-ui="grid" data-cols="1" data-cols-md="2" data-cols-xl="3" data-gap="4">`,
    );
    for (const c of items) {
      const href = escAttr(relUrl(pagePath, c.pagePath));
      const category = c.manifest.category ?? "uncategorised";
      parts.push(
        `        <div data-ui="card" data-variant="outlined" data-component-card ` +
          `data-component-layer="${c.layer}" data-component-category="${escAttr(category)}" ` +
          `data-component-text="${escAttr(
            `${c.name} ${category} ${c.manifest.description ?? ""}`,
          )}">\n` +
          `          <div data-part="header">\n` +
          `            <div data-ui="cluster" data-gap="2">\n` +
          `              <span data-ui="badge" data-variant="${
            c.layer === "primitives"
              ? "primary"
              : c.layer === "recipes"
                ? "secondary"
                : "success"
          }" data-size="sm">${esc(c.manifest.kind)}</span>\n` +
          `              <span data-ui="badge" data-size="sm">${esc(category)}</span>\n` +
          `            </div>\n` +
          `            <h3 data-part="title"><a data-ui="link" href="${href}">${esc(c.name)}</a></h3>\n` +
          `            <p data-part="description">v${esc(c.manifest.version ?? "1.0.0")}</p>\n` +
          `          </div>\n` +
          `          <div data-part="body">${esc(c.manifest.description ?? "")}</div>\n` +
          `          <div data-part="footer">\n` +
          `            <a data-ui="link" href="${href}">Open contract <span data-ui="icon" data-icon="arrow-right" aria-hidden="true"></span></a>\n` +
          `          </div>\n` +
          `        </div>`,
      );
    }
    parts.push(`      </div>`);
    parts.push(`      </section>`);
  }

  parts.push(...renderBaseLayerSection(ctx.registryRoot));

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Components · ${ctx.config.title}`,
      description: `Every component in the Faqir registry, grouped by layer.`,
      body: parts.join("\n"),
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
    }),
  };
}

/**
 * The base layer, on the page that lists every component (task 1.0R-10).
 *
 * `data-ui="prose"` is defined in `registry/base/prose.css` and used on a dozen
 * pages of this very site, but it has no manifest — so it appeared on no
 * catalogue page, and a reader who searched the component index for it found
 * nothing. It belongs on this page precisely because it is NOT one of the cards
 * above: the section says so, and the rows are derived from the base
 * stylesheets rather than typed, so a second base-layer value would appear here
 * on its own.
 */
function renderBaseLayerSection(registryRoot: string): string[] {
  const files = loadBaseLayer(registryRoot);
  if (baseLayerUiValues(files).length === 0) return [];
  const rows = files.flatMap((file) =>
    file.defines.map((value) => [
      code(`data-ui="${value}"`),
      code(`base/${file.file}`),
      esc(file.blurb),
    ]),
  );
  return [
    `      <section id="base-layer">`,
    `      <h2>Base layer</h2>`,
    `      <p>${esc(BASE_LAYER_BLURB.replace(/`/g, ""))}</p>`,
    `      <p>${esc(
      "These are not components and the filters above do not apply to them: they ship in base/, " +
        "every project loads them, and they have no manifest because there is no structure to declare.",
    )}</p>`,
    table(["Attribute", "Defined in", "What it styles"], rows, "No base-layer values."),
    `      <p>${esc(
      "Write ordinary HTML inside — headings, paragraphs, lists, tables, blockquotes and code " +
        "blocks are all styled for you. prose sets its own measure (max-inline-size: " +
        "var(--measure-prose)); wrap it in container when a page needs a different one.",
    )}</p>`,
    `      </section>`,
  ];
}

/** The icon catalogue: every name comes from the icon primitive's manifest. */
function renderIconPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
}): SiteFile {
  const pagePath = ICONS_PAGE;
  const icon = ctx.components.find((c) => c.layer === "primitives" && c.name === "icon");
  const names = [...new Set(icon?.manifest.variants.icon?.values ?? [])].sort();
  const iconContract = icon?.pagePath ?? "components/primitives/icon.html";
  const cards = names
    .map(
      (name) =>
        `        <button data-ui="button" data-variant="ghost" type="button" data-docs-icon-card ` +
        `data-docs-icon-copy="${escAttr(name)}" title="Copy ${escAttr(name)} icon markup">\n` +
        `          <span data-ui="icon" data-icon="${escAttr(name)}" aria-hidden="true"></span>\n` +
        `          <span data-ui="text" data-size="xs" data-variant="mono">${esc(name)}</span>\n` +
        `        </button>`,
    )
    .join("\n");

  const body = `      <div data-docs-foundation-page>
        <header data-docs-foundation-header>
          <span data-ui="badge" data-variant="primary">CSS-only · Lucide ISC</span>
          <h1>Icons</h1>
          <p>${esc(
            `${names.length} curated glyphs rendered as CSS masks. They inherit currentColor, scale with font-size, need no JavaScript, and make no network request.`,
          )}</p>
          <div data-ui="cluster" data-gap="3">
            <a data-ui="button" data-variant="primary" href="${escAttr(
              relUrl(pagePath, iconContract),
            )}">Open the icon contract</a>
            <a data-ui="button" data-variant="outline" href="#icon-usage">Usage &amp; accessibility</a>
          </div>
        </header>

        <section aria-labelledby="icon-library-heading">
          <div data-docs-section-heading>
            <span data-ui="badge" data-variant="secondary">Complete set</span>
            <h2 id="icon-library-heading">Find and copy a glyph.</h2>
            <p>Search by name, then activate a tile to copy its complete decorative markup.</p>
          </div>
          <div data-docs-filter-panel data-docs-icon-toolbar>
            <div data-docs-filter-control>
              <label data-ui="label" for="icon-search">Search ${esc(String(names.length))} icons</label>
              <input data-ui="input" id="icon-search" type="search" placeholder="arrow, user, chart…" autocomplete="off" data-docs-icon-search>
            </div>
            <div data-docs-filter-meta>
              <strong id="icon-result-count" role="status" aria-live="polite">${esc(
                `${names.length} of ${names.length} icons`,
              )}</strong>
              <span>Click any tile to copy its markup</span>
            </div>
            <span id="icon-copy-status" role="status" aria-live="polite" data-docs-a11y></span>
          </div>
          <div data-ui="grid" data-cols="auto" data-min="8" data-gap="2" data-docs-icon-grid>
${cards}
          </div>
          <p data-docs-icon-empty hidden>No icons match that search. Try a broader name.</p>
        </section>

        <section id="icon-usage" aria-labelledby="icon-usage-heading" data-docs-section>
          <div data-docs-section-heading>
            <span data-ui="badge">One element</span>
            <h2 id="icon-usage-heading">Use the accessible form that matches the meaning.</h2>
            <p>Decorative icons disappear from the accessibility tree. Meaningful icons expose an image role and a concise label.</p>
          </div>
          <div data-ui="grid" data-cols="1" data-cols-lg="2" data-gap="4">
            <div data-ui="card" data-variant="outlined">
              <div data-part="header">
                <span data-ui="icon" data-icon="sparkles" aria-hidden="true"></span>
                <h3 data-part="title">Decorative</h3>
                <p data-part="description">The adjacent text already carries the meaning.</p>
              </div>
              <div data-part="body"><pre tabindex="0"><code>&lt;span data-ui="icon"
  data-icon="sparkles"
  aria-hidden="true"&gt;&lt;/span&gt;</code></pre></div>
            </div>
            <div data-ui="card" data-variant="outlined">
              <div data-part="header">
                <span data-ui="icon" data-icon="circle-check" role="img" aria-label="Complete"></span>
                <h3 data-part="title">Meaningful</h3>
                <p data-part="description">The glyph communicates information on its own.</p>
              </div>
              <div data-part="body"><pre tabindex="0"><code>&lt;span data-ui="icon"
  data-icon="circle-check"
  role="img"
  aria-label="Complete"&gt;&lt;/span&gt;</code></pre></div>
            </div>
          </div>
          <div data-ui="callout" data-variant="info">
            <span data-part="icon"><span data-ui="icon" data-icon="package" aria-hidden="true"></span></span>
            <div data-part="content">
              <h3 data-part="title">Ship only what you use</h3>
              <p><code>faqir add icons --only check,x,chevron-down</code> creates a deterministic subset and merges future additions without clobbering the current set.</p>
            </div>
          </div>
        </section>
      </div>`;

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Icons · ${ctx.config.title}`,
      description: `${names.length} searchable, CSS-only icons with copy-ready accessible markup.`,
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
    }),
  };
}

/** Typography specimens and guidance, driven by registry/tokens/typography.css. */
function renderTypographyPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  tokenList: TokenEntry[];
}): SiteFile {
  const pagePath = TYPOGRAPHY_PAGE;
  const typography = ctx.tokenList.filter((entry) => entry.group === "typography");
  const families = typography.filter((entry) => entry.name.startsWith("font-"));
  const sizes = typography.filter((entry) => entry.name.startsWith("text-"));
  const weights = typography.filter((entry) => entry.name.startsWith("weight-"));
  const leading = typography.filter((entry) => entry.name.startsWith("leading-"));
  const textComponent = ctx.components.find(
    (component) => component.layer === "primitives" && component.name === "text",
  );

  const familyCards = families
    .map(
      (entry) => `          <div data-ui="card" data-variant="outlined" data-docs-type-family>
            <div data-part="header">
              <span data-ui="text" data-size="xs" data-variant="mono">--${esc(entry.name)}</span>
              <h3 data-part="title">${esc(entry.name.replace("font-", ""))}</h3>
              <p data-part="description"><code>${esc(entry.value)}</code></p>
            </div>
            <div data-part="body">
              <p data-docs-token-preview="${escAttr(entry.name)}" data-docs-type-display>Ag</p>
              <p data-docs-token-preview="${escAttr(entry.name)}">The interface is the contract. 0123456789</p>
            </div>
          </div>`,
    )
    .join("\n");
  const sizeRows = sizes
    .map(
      (entry) => `          <li data-docs-type-row>
            <span data-docs-type-sample data-docs-token-preview="${escAttr(entry.name)}">The interface is the contract.</span>
            <span data-docs-type-meta><code>--${esc(entry.name)}</code><span>${esc(entry.value)}</span></span>
          </li>`,
    )
    .join("\n");
  const weightRows = weights
    .map(
      (entry) => `          <div data-ui="surface" data-variant="flat" data-size="md">
            <p data-docs-token-preview="${escAttr(entry.name)}">${esc(
              entry.name.replace("weight-", ""),
            )} — Build interfaces agents can understand.</p>
            <code>--${esc(entry.name)} · ${esc(entry.value)}</code>
          </div>`,
    )
    .join("\n");
  const leadingRows = leading
    .map(
      (entry) => `          <div data-ui="surface" data-variant="flat" data-size="md">
            <p data-docs-token-preview="${escAttr(entry.name)}">A stable interface contract makes markup readable to people, style sheets, controllers, audits, and agents at the same time.</p>
            <code>--${esc(entry.name)} · ${esc(entry.value)}</code>
          </div>`,
    )
    .join("\n");

  const body = `      <div data-docs-foundation-page>
        <header data-docs-foundation-header>
          <span data-ui="badge" data-variant="primary">System fonts · token scale</span>
          <h1>Typography</h1>
          <p>${esc(
            `${families.length} font stacks, ${sizes.length} size steps, ${weights.length} weights, and ${leading.length} line-height choices form one portable type system with no font download.`,
          )}</p>
          <div data-ui="cluster" data-gap="3">
            <a data-ui="button" data-variant="primary" href="${escAttr(
              relUrl(pagePath, textComponent?.pagePath ?? "components/primitives/text.html"),
            )}">Open the text contract</a>
            <a data-ui="button" data-variant="outline" href="${escAttr(
              relUrl(pagePath, "tokens/index.html"),
            )}#group-typography">View typography tokens</a>
          </div>
        </header>

        <section aria-labelledby="font-families-heading" data-docs-section>
          <div data-docs-section-heading>
            <span data-ui="badge" data-variant="secondary">Font families</span>
            <h2 id="font-families-heading">Native stacks, available immediately.</h2>
            <p>The sans, serif, and monospace stacks use installed system fonts, keeping text private, fast, and stable across static and offline pages.</p>
          </div>
          <div data-ui="grid" data-cols="1" data-cols-lg="3" data-gap="4">
${familyCards}
          </div>
        </section>

        <section aria-labelledby="type-scale-heading" data-docs-section>
          <div data-docs-section-heading>
            <span data-ui="badge">Type scale</span>
            <h2 id="type-scale-heading">Eight deliberate steps.</h2>
            <p>Use the semantic heading level the document needs, then choose a visual size through the text or heading primitive.</p>
          </div>
          <ol data-docs-type-scale>
${sizeRows}
          </ol>
        </section>

        <section aria-labelledby="type-detail-heading" data-docs-section>
          <div data-docs-section-heading>
            <span data-ui="badge" data-variant="secondary">Rhythm inside text</span>
            <h2 id="type-detail-heading">Weight and leading stay independent.</h2>
            <p>Weight establishes emphasis. Line height establishes reading density. Keeping them separate prevents a visual choice from changing the document hierarchy.</p>
          </div>
          <div data-ui="switcher" data-threshold="lg" data-gap="4">
            <div data-ui="card" data-variant="outlined">
              <div data-part="header"><h3 data-part="title">Weights</h3></div>
              <div data-part="body"><div data-ui="stack" data-gap="3">${weightRows}</div></div>
            </div>
            <div data-ui="card" data-variant="outlined">
              <div data-part="header"><h3 data-part="title">Line heights</h3></div>
              <div data-part="body"><div data-ui="stack" data-gap="3">${leadingRows}</div></div>
            </div>
          </div>
        </section>

        <section aria-labelledby="hierarchy-heading" data-docs-section>
          <div data-docs-section-heading>
            <span data-ui="badge" data-variant="primary">Semantic hierarchy</span>
            <h2 id="hierarchy-heading">Structure first, appearance second.</h2>
            <p>Heading elements preserve the page outline. Faqir's heading primitive applies the visual level without asking the HTML element to lie about its meaning.</p>
          </div>
          <div data-ui="surface" data-variant="raised" data-size="lg" data-docs-hierarchy-specimen>
            <p data-ui="heading" data-size="1">Heading level 1 style</p>
            <p data-ui="heading" data-size="2">Heading level 2 style</p>
            <p data-ui="heading" data-size="3">Heading level 3 style</p>
            <p data-ui="heading" data-size="4">Heading level 4 style</p>
            <p data-ui="text" data-size="base" data-leading="relaxed">Body copy uses the base step and relaxed leading for comfortable reading across documentation, applications, and print surfaces.</p>
            <p data-ui="text" data-size="sm" data-variant="muted">Supporting copy uses a smaller step and the AA-gated muted foreground.</p>
          </div>
        </section>

        <section aria-labelledby="prose-heading" data-docs-section>
          <div data-docs-section-heading>
            <span data-ui="badge">Long-form prose</span>
            <h2 id="prose-heading">A complete reading surface.</h2>
            <p>The base prose layer coordinates headings, paragraphs, links, lists, quotations, code, tables, and media around a readable measure.</p>
          </div>
          <div data-ui="surface" data-variant="flat" data-size="lg" data-docs-prose-specimen>
            <h3>Designing a machine-readable interface</h3>
            <p>A component contract works when its structure remains clear in source, in the browser, and in the tools that inspect it. <a href="${escAttr(
              relUrl(pagePath, "agents/index.html"),
            )}">Agent surfaces</a> expose that same contract without a parallel documentation format.</p>
            <blockquote>Readable interfaces are easier to operate, test, repair, and hand to the next contributor.</blockquote>
            <ul>
              <li>Use one heading level per document relationship.</li>
              <li>Keep paragraphs near the content they explain.</li>
              <li>Reserve monospace text for code, tokens, and identifiers.</li>
            </ul>
            <pre tabindex="0"><code>&lt;p data-ui="text" data-size="lg" data-leading="relaxed"&gt;
  Human-readable. Agent-readable.
&lt;/p&gt;</code></pre>
          </div>
        </section>
      </div>`;

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Typography · ${ctx.config.title}`,
      description: "Faqir's complete typography system: font stacks, scale, weights, leading, hierarchy, and prose.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
    }),
  };
}

/** The token reference: every `:root` custom property the registry declares. */
function renderTokenPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  tokenList: TokenEntry[];
}): SiteFile {
  const pagePath = "tokens/index.html";
  const parts: string[] = [
    `      <h1>Design tokens</h1>`,
    `      <p>${esc(
      `${ctx.tokenList.length} custom properties. Every component styles itself from these — ` +
        `a theme re-declares them, and the whole registry restyles.`,
    )}</p>`,
  ];

  // Three ladders that a reader looking for "how wide" or "how far apart" needs
  // before the alphabet of tokens is useful (task 0.8-12). The breakpoints are
  // deliberately NOT tokens — media queries cannot read custom properties — so
  // this is the one place on the site that says so next to the numbers.
  parts.push(
    section(
      "breakpoints",
      "Breakpoints",
      `      <p>The one responsive ladder. These four numbers are <strong>not</strong> tokens: ` +
        `a media query cannot read a custom property, so they are literal in CSS and canonical in ` +
        `<code>src/utils/breakpoints.ts</code>. A responsive value is a suffixed attribute — ` +
        `<code>${esc(RESPONSIVE_GRAMMAR)}</code>, read as “this value, from that tier up”.</p>\n` +
        table(
          ["Tier", "Min-width", "Equivalent px", "Example"],
          BREAKPOINT_LIST.map((b) => [
            `<code id="${escAttr(`tier-${b.tier}`)}">${esc(b.tier)}</code>`,
            code(`min-width: ${b.rem}rem`),
            esc(String(b.px)),
            code(`${responsiveAttribute("cols", b.tier)}="2"`),
          ]),
          "No breakpoints in this build.",
        ),
    ),
  );

  const tokenRows = (names: readonly { token: string; role: string }[]) =>
    names.map((entry) => {
      const t = ctx.tokenList.find((x) => x.name === entry.token);
      return [
        `<code id="${escAttr(`ladder-${entry.token}`)}">--${esc(entry.token)}</code>`,
        t ? code(t.value) : "<em>not declared</em>",
        esc(entry.role),
      ];
    });

  parts.push(
    section(
      "measure",
      "Measure",
      `      <p>Every centred column in the framework resolves to one of these — ` +
        `<code>container</code>’s <code>data-measure</code> and <code>surface</code>’s max-width alike. ` +
        `Named for the content they are cut for, never <code>sm|md|lg|xl</code>: those names belong to ` +
        `the breakpoints above and describe a viewport, not a column.</p>\n` +
        table(["Token", "Value", "Cut for"], tokenRows(MEASURE_TOKENS), "No measure tokens."),
    ),
  );

  parts.push(
    section(
      "rhythm",
      "Rhythm",
      `      <p>The vertical air between page sections and the page’s own inset. Composed from ` +
        `<code>--space-*</code> rather than declared as new numbers, so density mode remaps them for free.</p>\n` +
        table(["Token", "Value", "Feels like"], tokenRows(RHYTHM_TOKENS), "No rhythm tokens."),
    ),
  );

  const groups = [...new Set(ctx.tokenList.map((t) => t.group))];
  for (const group of groups) {
    const entries = ctx.tokenList.filter((t) => t.group === group);
    parts.push(
      `      <h2 id="${escAttr(`group-${slug(group)}`)}">${esc(
        TOKEN_GROUP_LABEL[group] ?? group,
      )} (${entries.length})</h2>`,
    );
    const rows = entries.map((t) => {
      const swatch = isColorToken(t) ? renderSwatch(t) : "—";
      return [
        `<code id="${escAttr(tokenAnchor(t.name))}">--${esc(t.name)}</code>`,
        code(t.value),
        swatch,
      ];
    });
    parts.push(table(["Token", "Value", "Sample"], rows, "No tokens in this group."));
  }

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Design tokens · ${ctx.config.title}`,
      description: "Every design token the Faqir registry declares, with its default value.",
      body: parts.join("\n"),
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
    }),
  };
}

/**
 * The layout guide (task 0.8-12): the doctrine and the ladder from
 * `src/utils/layout.ts`, and the five page archetypes lifted verbatim out of
 * `docs/layout.md`. The markdown is the source — the site renders what
 * `parseArchetypes` returns and the test suite audits the same function's
 * output, so the page that ships and the markup that is proven clean are the
 * same bytes. A build with no `docs/layout.md` emits the page without
 * archetypes rather than failing: the doctrine is still worth serving.
 */
function renderLayoutPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  archetypes: ParsedArchetype[];
}): SiteFile {
  const pagePath = LAYOUT_PAGE;
  const u = (to: string) => escAttr(relUrl(pagePath, to));

  const parts: string[] = [
    `      <h1>Layout</h1>`,
    `      <p>Page structure is five primitives, one measure ladder and one breakpoint canon — ` +
      `no utility classes, no hand-written <code>max-width</code>. Reach for the first mechanism ` +
      `that solves the problem; most layouts never get past the first.</p>`,
    section(
      "doctrine",
      "The doctrine",
      table(
        ["Step", "Mechanism", "Why here"],
        LAYOUT_MECHANISMS.map((m) => [esc(String(m.step)), `<strong>${esc(m.title)}</strong>`, esc(m.summary)]),
        "No doctrine in this build.",
      ),
    ),
    section(
      "primitives",
      "The five primitives",
      table(
        ["Primitive", "Mechanism", "Reach for it when"],
        LAYOUT_PRIMITIVES.map((p) => {
          const c = ctx.components.find((x) => x.name === p.name);
          return [
            c ? `<a data-ui="link" href="${u(c.pagePath)}">${esc(p.name)}</a>` : code(p.name),
            esc(p.mechanism),
            esc(p.use),
          ];
        }),
        "No layout primitives in this registry.",
      ),
    ),
    section(
      "ladder",
      "The ladder and the grammar",
      `      <p>A responsive value is a suffixed attribute — <code>${esc(RESPONSIVE_GRAMMAR)}</code>, ` +
        `read as “this value, from that tier up”. Mobile-first: the unsuffixed attribute is the phone ` +
        `layout. The four tiers are documented with their values in the ` +
        `<a data-ui="link" href="${u("tokens/index.html")}#breakpoints">token reference</a>.</p>\n` +
        `      <pre tabindex="0"><code>${esc(
          `<div data-ui="grid" data-cols="1" ${responsiveAttribute("cols", "md")}="2" ${responsiveAttribute("cols", "lg")}="4" data-gap="4">`,
        )}</code></pre>\n` +
        `      <ul>\n` +
        LAYOUT_RULES.map((r) => `        <li>${esc(r.replace(/`/g, ""))}</li>`).join("\n") +
        `\n      </ul>`,
    ),
    section(
      "rhythm",
      "The default rhythm",
      `      <p>${esc(rhythmLine().replace(/`/g, ""))}</p>\n` +
        `      <p>Two mechanisms were considered and rejected, recorded here because the next ` +
        `spacing question will ask again:</p>\n` +
        `      <ul>\n` +
        RHYTHM_REJECTED.map(
          (r) => `        <li><strong>${esc(r.candidate.replace(/`/g, ""))}</strong> — ${esc(r.why)}</li>`,
        ).join("\n") +
        `\n      </ul>`,
    ),
  ];

  if (ctx.archetypes.length > 0) {
    parts.push(
      section(
        "archetypes",
        "Page archetypes",
        `      <p>Five pages, each structured by those primitives. Every block is audited against ` +
          `the registry manifests on every test run, so it is safe to copy verbatim. The prose ` +
          `version lives in <code>docs/layout.md</code>.</p>`,
      ),
    );
    for (const a of ctx.archetypes) {
      parts.push(
        `      <h3 id="${escAttr(a.id)}">${esc(a.title)}</h3>`,
        `      <p>${esc(a.summary.replace(/[`*]/g, ""))}</p>`,
        `      <pre tabindex="0"><code>${esc(a.html)}</code></pre>`,
      );
    }
  }

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Layout · ${ctx.config.title}`,
      description:
        "The Faqir layout system: the doctrine, the five layout primitives, the breakpoint ladder, and five copy-ready page archetypes.",
      body: parts.join("\n"),
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
    }),
  };
}


// ---------------------------------------------------------------------------
// The reactive engine (task 1.0R-09)
//
// One vocabulary, two readers. `src/generator/skill.ts` renders the engine's
// §3.0 declarations into `references/directives.md` for an agent that reads the
// skill; this page renders the same parse for an agent — or a person — that
// reads the site. Nothing below is transcribed: the directives, their
// modifiers and the magics come from `parseEngineVocabulary`, the application
// order from `PRIORITY`, the key aliases from `KEY_MAP`, the transition presets
// from `MOTION_PRESETS`, the `l-source` controller API from the engine's own
// `ctrl` literal, and the plugin rows from `loadPluginMetadata`. Add a
// directive to the engine and it appears here.
//
// The prose and the live examples are authored, in `site/content/engine.html`,
// and mounted through the same `<template data-docs-example>` machinery the
// spacing and density guides use: the bytes the test audits are the bytes the
// page runs.
// ---------------------------------------------------------------------------

const ENGINE_DIRECTIVES_MARKER = "<!-- @faqir:engine-directives -->";
const ENGINE_MODIFIERS_MARKER = "<!-- @faqir:engine-modifiers -->";
const ENGINE_MAGICS_MARKER = "<!-- @faqir:engine-magics -->";
const ENGINE_SOURCE_MARKER = "<!-- @faqir:engine-source -->";
const ENGINE_PLUGINS_MARKER = "<!-- @faqir:engine-plugins -->";

/**
 * Escaped prose that keeps the source's markdown code spans as `<code>`. The
 * engine's declarations are written for a markdown reference; the backticks are
 * information (`l-data` is an attribute, not a word), so they are rendered
 * rather than stripped.
 */
function engineProse(value: string): string {
  return esc(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** The engine's declared vocabulary, or nothing when the source is not on disk. */
export function readEngineVocabulary(packageRoot: string): {
  vocabulary: EngineVocabulary;
  source: string;
} | null {
  const path = join(packageRoot, "src", "core-src", "engine.js");
  if (!existsSync(path)) return null;
  const source = readText(path);
  return { vocabulary: parseEngineVocabulary(source), source };
}

/**
 * The reactive-engine page: authored prose and live examples around five
 * generated tables.
 *
 * A build with no engine source emits the page without them rather than
 * failing, exactly as the layout guide does without `docs/layout.md` — but the
 * suite asserts the tables are there, so an empty one is a test failure and not
 * a quietly thinner page.
 */
function renderEnginePage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  authored: string;
  engine: { vocabulary: EngineVocabulary; source: string } | null;
  plugins: PluginMetadata[];
}): SiteFile {
  const pagePath = ENGINE_PAGE;
  const vocab = ctx.engine?.vocabulary ?? { directives: [], magics: [], modifiers: [] };
  const source = ctx.engine?.source ?? "";
  const isPublic = (placement: string) => placement !== "internal";

  const directives = table(
    ["Attribute", "Shorthand", "Goes on", "Example", "What it does"],
    vocab.directives
      .filter((d) => isPublic(d.placement))
      .map((d) => [
        code(d.attribute),
        d.shorthand === "—" ? "—" : code(d.shorthand),
        engineProse(d.placement),
        code(d.example),
        engineProse(d.description),
      ]),
    "No engine source in this build.",
  );

  const priority = parseEngineMap(source, "PRIORITY");
  const order =
    priority.length > 0
      ? `      <p>Directives on one element run in this order, whatever order the attributes are ` +
        `written in: ${[...priority]
          .sort((a, b) => Number(a[1]) - Number(b[1]))
          .map(([name]) => code(`l-${name}`))
          .join(" → ")}.</p>`
      : "";

  // `l-source`'s modifiers are rendered beside its controller API instead, where
  // the thing they modify is explained — one table, not the same table twice.
  const modifierTable = (directive: string) =>
    table(
      ["Modifier", "What it does"],
      vocab.modifiers
        .filter((m) => m.directive === directive)
        .map((m) => [code(m.modifier), engineProse(m.description)]),
      "None declared.",
    );
  const modifierGroups = [...new Set(vocab.modifiers.map((m) => m.directive))]
    .filter((directive) => directive !== "l-source")
    .map(
      (directive) =>
        `      <h3 id="modifiers-${escAttr(slug(directive))}">${code(directive)}</h3>\n` +
        modifierTable(directive),
    );

  const keys = parseEngineMap(source, "KEY_MAP");
  const keyAliases =
    keys.length > 0
      ? `      <p>An <code>l-on</code> key filter is a modifier too — <code>@keydown.enter</code>, ` +
        `<code>@keydown.escape</code>. The engine maps ${keys
          .map(([alias, key]) => `${code(`.${alias}`)} → ${code(key.trim() === "" ? `'${key}'` : key)}`)
          .join(", ")}; any other name is matched against <code>event.key</code> lowercased.</p>`
      : "";

  const presets = parseEngineMap(source, "MOTION_PRESETS");
  const motion =
    presets.length > 0
      ? `      <p><code>l-transition</code> takes one of ${presets
          .map(([name]) => code(name))
          .join(", ")}. The engine only stamps ` +
        `<code>data-motion</code> through its four phases (${TOKEN_MODIFIERS.find(
          (m) => m.attr === "data-motion",
        )
          ?.values.map((v) => code(v))
          .join(", ") ?? "—"}); the CSS animates.</p>`
      : "";

  const magics = table(
    ["Magic", "Available in", "What it is"],
    vocab.magics
      .filter((m) => isPublic(m.where))
      .map((m) => [code(m.name), engineProse(m.where), engineProse(m.description)]),
    "No engine source in this build.",
  );
  const internals = vocab.magics.filter((m) => !isPublic(m.where));
  const magicNote =
    internals.length > 0
      ? `      <p>Named rather than hidden: ${internals
          .map((m) => `${code(m.name)} is an engine internal — ${engineProse(m.description)}`)
          .join(" ")}</p>`
      : "";

  const controller = parseSourceController(source);
  const sourceApi =
    `      <h3 id="source-controller">The <code>$&lt;name&gt;</code> controller</h3>\n` +
    table(
      ["Method", "Signature"],
      controller.map((m) => [code(m.name), code(`$<name>.${m.name}(${m.params})`)]),
      "No engine source in this build.",
    );
  const sourceModifiers =
    `      <h3 id="modifiers-l-source">${code("l-source")} modifiers</h3>\n` +
    modifierTable("l-source");

  const plugins = table(
    ["Plugin", "File", "Adds"],
    ctx.plugins.map((p) => [
      `<strong>${esc(p.name)}</strong>${p.description ? `<br>${engineProse(p.description)}` : ""}`,
      code(`core/plugins/${p.file}`),
      p.provides.map((name) => code(name)).join(" "),
    ]),
    "This registry ships no plugins.",
  );
  const pluginExamples = ctx.plugins
    .filter((p) => p.example)
    .map(
      (p) =>
        `      <h3 id="plugin-${escAttr(slug(p.name))}">${esc(p.name)}</h3>\n` +
        (p.notes ? `      <p>${engineProse(p.notes)}</p>\n` : "") +
        `      <pre tabindex="0"><code>${esc(p.example!)}</code></pre>`,
    )
    .join("\n");

  let body = replaceGuideMarker(ctx.authored, ENGINE_DIRECTIVES_MARKER, [directives, order].filter(Boolean).join("\n"));
  body = replaceGuideMarker(
    body,
    ENGINE_MODIFIERS_MARKER,
    [...modifierGroups, keyAliases, motion].filter(Boolean).join("\n"),
  );
  body = replaceGuideMarker(body, ENGINE_MAGICS_MARKER, [magics, magicNote].filter(Boolean).join("\n"));
  body = replaceGuideMarker(body, ENGINE_SOURCE_MARKER, [sourceApi, sourceModifiers].join("\n"));
  body = replaceGuideMarker(body, ENGINE_PLUGINS_MARKER, [plugins, pluginExamples].filter(Boolean).join("\n"));
  body = renderGuideExamples(body);

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Reactive engine · ${ctx.config.title}`,
      description:
        "faqir-core: every directive, modifier and magic the engine implements, the l-source controller API, and the official plugin vocabulary — read out of the engine itself.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
      scripts: ["scripts/faqir-core.js"],
    }),
  };
}

/**
 * The signpost at a {@link RetiredPage}: what used to be here, where it went,
 * and the route it is one keystroke away from.
 *
 * Deliberately not a redirect — see {@link RETIRED_PAGES}. It is `noindex` and
 * absent from the sitemap, so it serves the bookmark that already exists
 * without ever being published as a URL of this site again.
 */
function renderRetiredPage(ctx: {
  entry: RetiredPage;
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  titles: Map<string, string>;
}): SiteFile {
  const { entry } = ctx;
  const pagePath = entry.path;
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const moved = ctx.titles.get(entry.movedTo) ?? entry.movedTo;
  const other = ctx.titles.get(entry.confusedWith) ?? entry.confusedWith;

  const body = [
    `      <h1>This page moved</h1>`,
    `      <p><code>/${esc(routeSegment(entry.path))}/</code> was ${esc(entry.was)}. It has a URL ` +
      `that reads as what it is now, and this one is kept so an existing link still lands ` +
      `somewhere true. Two pages are one keystroke apart here, so pick the one you meant:</p>`,
    `      <ul>`,
    `        <li><a data-ui="link" href="${u(entry.movedTo)}">${esc(moved)}</a> — ` +
      `<code>/${esc(routeSegment(entry.movedTo))}/</code>. What used to be at this address.</li>`,
    `        <li><a data-ui="link" href="${u(entry.confusedWith)}">${esc(other)}</a> — ` +
      `<code>/${esc(routeSegment(entry.confusedWith))}/</code>. A different page, and the one ` +
      `most people who type this address were looking for.</li>`,
    `      </ul>`,
  ].join("\n");

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Moved · ${ctx.config.title}`,
      description:
        `${entry.was[0].toUpperCase()}${entry.was.slice(1)} moved to ` +
        `/${routeSegment(entry.movedTo)}/. This URL is kept as a signpost, not a redirect: ` +
        `/${routeSegment(entry.confusedWith)}/ is a different page.`,
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: entry.movedTo,
      layout: "wide",
      noindex: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// The migration guide (task 1.0-03)
//
// One document, two renderings, and neither is a retelling. The rename table
// and the numbered procedure come from `src/migration.ts` — the same constants
// the end-to-end upgrade test executes — and the breaking-change sections are
// the migration document's own prose, parsed back out by marker. A break that
// gains a section in `docs/migration-1.0.md` appears here with no edit; a break
// with no section fails the suite before it can reach this page.
// ---------------------------------------------------------------------------

/**
 * Inline markdown: code spans, bold, and links. Deliberately not a markdown
 * library — the migration document is written by us, the subset is the subset
 * we write, and anything unrecognised passes through escaped rather than
 * rendering as an accidental tag.
 */
function inlineMarkdown(value: string): string {
  return esc(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (whole, label: string, href: string) =>
      /^https?:/.test(href) ? `<a data-ui="link" href="${escAttr(href)}">${label}</a>` : label,
    );
}

/**
 * The block subset the migration document uses: paragraphs, fenced code, pipe
 * tables and `+`-prefixed diff lines inside fences. A relative link (`../SPEC-1.0.md`)
 * loses its anchor rather than pointing at a path the site does not serve.
 */
function renderMarkdownBlocks(markdown: string): string {
  const out: string[] = [];
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++; // closing fence
      out.push(`      <pre tabindex="0"><code>${esc(body.join("\n"))}</code></pre>`);
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
      const [head, ...body] = rows;
      out.push(table(head ?? [], body.map((row) => row.map(inlineMarkdown)), "No rows."));
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("```") && !lines[i].startsWith("|")) {
      paragraph.push(lines[i++]);
    }
    out.push(`      <p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }
  return out.join("\n");
}

/**
 * The migration guide at `migration/`.
 *
 * A build with no `docs/migration-1.0.md` on disk still publishes the rename,
 * the procedure and the changelog inventory — those come from the module and
 * the manifests — and simply carries no per-break prose, exactly as the layout
 * guide does without its own document.
 */
function renderMigrationPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  breaking: BreakingChange[];
  documented: DocumentedBreak[];
  hasDocument: boolean;
}): SiteFile {
  const pagePath = MIGRATION_PAGE;
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const badge = (variant: string, text: string) =>
    `<span data-ui="badge" data-variant="${escAttr(variant)}">${esc(text)}</span>`;
  const componentPage = (name: string): string | null =>
    ctx.components.find((c) => c.name === name)?.pagePath ?? null;

  const parts: string[] = [
    `      <h1>Migrating to 1.0</h1>`,
    `      <p>${badge("primary", `from v${MIGRATION_FROM_VERSION}`)} ${badge(
      "secondary",
      `${ctx.breaking.length} breaking change${ctx.breaking.length === 1 ? "" : "s"}`,
    )} ${badge("default", `${MIGRATION_STEPS.length} steps`)}</p>`,
    `      <p>The protocol did not move: the five attributes, their value grammars, the ` +
      `<code>l-*</code> directives and the token names are the same in 1.0 as in v${esc(
        MIGRATION_FROM_VERSION,
      )}. What moved is the framework's own name, and the vocabulary of the components below. ` +
      `The list is assembled from the manifests' <code>changes</code> arrays, and a test fails ` +
      `when one of them has no section here.</p>`,
    `      <p>The full guide, verbatim: ${monoLink(
      relUrl(pagePath, MIGRATION_MARKDOWN_FILE),
      `/${MIGRATION_MARKDOWN_FILE}`,
    )}</p>`,
    section(
      "rename",
      "The rename",
      `      <p>The framework was called Loom through v${esc(MIGRATION_FROM_VERSION)}. These are ` +
        `the only things that carry the old name; <code>&lt;output_dir&gt;</code> is whatever your ` +
        `config's <code>output_dir</code> says, <code>ui/</code> by default.</p>\n` +
        table(
          ["v0.2.4 wrote", "1.0 expects", "Why it has to move"],
          LEGACY_RENAMES.map((r) => [code(r.from), code(r.to), inlineMarkdown(r.why)]),
          "Nothing was renamed.",
        ),
    ),
    section(
      "procedure",
      "The procedure",
      `      <p>In this order. Nothing runs before the config exists, and ` +
        `<code>faqir init --force</code> refreshes the tokens, base styles and engine that ` +
        `<code>faqir upgrade</code> never touches — <code>upgrade</code> merges components and ` +
        `nothing else.</p>\n` +
        table(
          ["#", "Step", "Command", "Why"],
          MIGRATION_STEPS.map((step, i) => [
            esc(String(i + 1)),
            `<strong>${esc(step.title)}</strong>`,
            step.command ? code(step.command) : "—",
            inlineMarkdown(step.why),
          ]),
          "No procedure in this build.",
        ),
    ),
    section(
      "breaking",
      "Breaking changes",
      `      <p>One section per <code>breaking: true</code> changelog entry in the registry, in ` +
        `the words of the migration guide. <code>faqir upgrade</code> prints the same list for ` +
        `the components you actually have installed.</p>`,
    ),
  ];

  for (const change of ctx.breaking) {
    const documented = ctx.documented.find(
      (d) => d.component === change.component && d.version === change.version,
    );
    const page = componentPage(change.component);
    const heading = documented?.heading ?? `${change.component} ${change.version}`;
    parts.push(
      `      <h3 id="${escAttr(breakingChangeId(change))}">${inlineMarkdown(heading)}</h3>`,
      `      <p>${badge("default", `${change.layer.replace(/s$/, "")}`)} ${
        page ? `<a data-ui="link" href="${u(page)}">${esc(change.component)}</a>` : code(change.component)
      } ${badge("secondary", change.version)}</p>`,
    );
    if (documented && documented.body.trim() !== "") {
      parts.push(renderMarkdownBlocks(documented.body));
    } else {
      // No prose to render: the manifest's own note is the record, and it is
      // what `faqir upgrade` prints.
      parts.push(`      <p>${inlineMarkdown(change.note)}</p>`);
    }
  }

  if (!ctx.hasDocument) {
    parts.push(
      `      <p><em>Built without ${esc(MIGRATION_DOC_FILE)} — the notes above are the manifests' ` +
        `own changelog entries.</em></p>`,
    );
  }

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Migrating to 1.0 · ${ctx.config.title}`,
      description:
        `The v0.x → 1.0 migration: the four files the framework's rename touched, the ` +
        `${MIGRATION_STEPS.length}-step upgrade procedure, and every breaking component change ` +
        `shipped since v${MIGRATION_FROM_VERSION}.`,
      body: parts.filter((p) => p.trim() !== "").join("\n"),
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
    }),
  };
}

/**
 * The frozen protocol (task 1.0-01), at `spec/<version>/`.
 *
 * Every table on this page is rendered from `src/protocol.ts`, and every code
 * block is an example lifted verbatim out of `SPEC-1.0.md` — the same examples
 * `tests/spec/protocol-1.0.test.ts` audits against the shipped manifests. So the
 * page cannot publish a rule the framework does not hold itself to, or markup
 * the framework would reject. A build with no `SPEC-1.0.md` on disk still emits
 * the contract and simply carries no examples: the normative half lives in the
 * module, not in the markdown.
 */
function renderSpecPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  examples: SpecExample[];
}): SiteFile {
  const pagePath = SPEC_PAGE;
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const badge = (variant: string, text: string) =>
    `<span data-ui="badge" data-variant="${escAttr(variant)}">${esc(text)}</span>`;
  /** The examples filed under one spec section, in document order. */
  const under = (prefix: string) => ctx.examples.filter((e) => e.section.startsWith(prefix));
  const blocks = (list: SpecExample[]) =>
    list.map((e) => `      <pre tabindex="0"><code>${esc(e.html)}</code></pre>`).join("\n");

  const parts: string[] = [
    `      <h1>Protocol ${esc(PROTOCOL_VERSION)}</h1>`,
    `      <p>${badge("primary", PROTOCOL_STATUS)} ${badge(
      "secondary",
      `protocol ${PROTOCOL_VERSION}`,
    )} ${badge("default", `manifest schema ${SCHEMA_VERSION}`)}</p>`,
    `      <p>${esc(FREEZE_STATEMENT)}</p>`,
    `      <p>Five attributes, three token modifiers, one tier suffix, and one manifest schema. ` +
      `This page is generated from the same module the audit engine reads; the normative text is ` +
      `<a data-ui="link" href="${u(SPEC_MARKDOWN_FILE)}">${esc(SPEC_FILE)}</a>, published beside it.</p>`,
    section(
      "attributes",
      "The five attributes",
      table(
        ["Attribute", "Purpose", "Written by", "Legal values come from", "Enforced by"],
        ATTRIBUTE_SPECS.map((a) => [
          code(a.attr),
          esc(a.purpose),
          esc(a.owner),
          esc(a.vocabulary.replace(/`/g, "")),
          a.rule ? code(a.rule) : "—",
        ]),
        "No protocol attributes in this build.",
      ),
    ),
    `      <ol>\n` +
      PROTOCOL_RULES.map((r) => `        <li>${esc(r.replace(/`/g, ""))}</li>`).join("\n") +
      `\n      </ol>`,
    blocks(under("2.")),
    section(
      "grammar",
      "Value grammar",
      `      <p>All five take ${esc(PROTOCOL_VALUE_GRAMMAR.replace(/`/g, ""))}. ` +
        `A component that needs a second visual axis declares a second attribute of its own ` +
        `rather than a second value here — which is why a stylesheet never needs ` +
        `<code>~=</code> and never depends on attribute-value order.</p>\n` +
        `      <pre tabindex="0"><code>${esc(PROTOCOL_VALUE_PATTERN)}</code></pre>\n` +
        blocks(under("3.")),
    ),
    section(
      "modifiers",
      "Sanctioned token modifiers",
      `      <p>Three attributes are part of the frozen surface without being protocol ` +
        `attributes: each re-declares design tokens for a subtree and is inherited by every ` +
        `descendant. None names a component, fills a slot, or carries a per-component ` +
        `vocabulary — which is exactly why none of them needs a manifest declaration.</p>\n` +
        table(
          ["Attribute", "Purpose", "Values", "Written by"],
          TOKEN_MODIFIERS.map((m) => [
            code(m.attr),
            esc(m.purpose),
            m.values.map((v) => code(v)).join(" · "),
            esc(m.owner),
          ]),
          "No token modifiers in this build.",
        ) +
        "\n" +
        blocks(under("4.")),
    ),
    section(
      "responsive",
      "The responsive tier suffix",
      `      <ul>\n` +
        RESPONSIVE_RULES.map((r) => `        <li>${esc(r.replace(/`/g, ""))}</li>`).join("\n") +
        `\n      </ul>\n` +
        blocks(under("5.")),
    ),
    section(
      "schema",
      `Manifest schema ${SCHEMA_VERSION}`,
      `      <p>Every component and theme manifest validates against one JSON Schema document. ` +
        `It is published twice on purpose: ${monoLink(
          relUrl(pagePath, SPEC_SCHEMA_FILE),
          `/${SPEC_SCHEMA_FILE}`,
        )} is the versioned address that will still serve <em>this</em> schema after a 1.1 ` +
        `exists, and ${monoLink(
          relUrl(pagePath, SCHEMA_FILE),
          `/${SCHEMA_FILE}`,
        )} is the schema's own <code>$id</code> — the alias that always resolves to the newest ` +
        `1.x. While 1.0 is current the two are byte-identical.</p>`,
    ),
    section(
      "amendments",
      "The amendment process",
      `      <p>An <strong>additive</strong> change may ship in any 1.x release. A ` +
        `<strong>major</strong> change waits for 2.0, however small it looks.</p>\n` +
        table(
          ["Change", "Level", "Because"],
          AMENDMENT_RULES.map((r) => [
            esc(r.change.replace(/`/g, "")),
            `<strong>${esc(r.level)}</strong>`,
            esc(r.because.replace(/`/g, "")),
          ]),
          "No amendment policy in this build.",
        ),
    ),
    section(
      "changelog",
      "Manifest schema changelog",
      table(
        ["Schema", "Task", "Change", "Breaking"],
        SCHEMA_CHANGELOG.map((c) => [
          code(c.version),
          esc(c.task),
          esc(c.note.replace(/`/g, "")),
          c.breaking ? "yes" : "no",
        ]),
        "No changelog in this build.",
      ),
    ),
  ];

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Protocol ${PROTOCOL_VERSION} · ${ctx.config.title}`,
      description:
        `The frozen Faqir protocol ${PROTOCOL_VERSION}: the five attributes and their value ` +
        `grammars, the sanctioned token modifiers, the responsive tier suffix, manifest schema ` +
        `${SCHEMA_VERSION}, and the amendment process.`,
      body: parts.filter((p) => p.trim() !== "").join("\n"),
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
    }),
  };
}

const SPACING_LADDER_MARKER = "<!-- @faqir:spacing-ladder -->";
const RHYTHM_LADDER_MARKER = "<!-- @faqir:rhythm-ladder -->";
const DENSITY_REMAP_MARKER = "<!-- @faqir:density-remaps -->";

/**
 * Substitute one generated block into an authored guide, or append it when the
 * marker is absent.
 *
 * The replacement is a FUNCTION, not a string: `String.replace` reads `$&`,
 * `$\'` and `$<name>` in a string replacement as substitution patterns, and the
 * engine page's generated tables are full of `$<name>` — the `l-source`
 * controller is literally called that. Passing the block as a string silently
 * ate it (task 1.0R-09).
 */
function replaceGuideMarker(authored: string, marker: string, generated: string): string {
  return authored.includes(marker) ? authored.replace(marker, () => generated) : `${authored}\n${generated}`;
}

function documentedToken(name: string): string {
  return `<code data-token="--${escAttr(name)}">--${esc(name)}</code>`;
}

/** The authored spacing/rhythm guide plus registry-derived ladder tables. */
function renderSpacingPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  authored: string;
  tokenList: TokenEntry[];
}): SiteFile {
  const pagePath = SPACING_PAGE;
  const byName = new Map(ctx.tokenList.map((entry) => [entry.name, entry]));
  const ladder = table(
    ["Token", "CSS value", "At 16px root", "Reach for it when"],
    SPACING_LADDER.map((entry) => {
      const actual = byName.get(entry.token);
      const index = SPACING_LADDER.findIndex((candidate) => candidate.token === entry.token);
      const band = SPACING_BANDS.find((candidate) => {
        const start = SPACING_LADDER.findIndex((item) => item.token === candidate.from);
        const end = SPACING_LADDER.findIndex((item) => item.token === candidate.to);
        return index >= start && index <= end;
      });
      return [
        documentedToken(entry.token),
        actual ? code(actual.value) : "<em>not declared</em>",
        code(`${entry.px}px`),
        band ? `<strong>${esc(band.label)}</strong> — ${esc(band.use)}` : "—",
      ];
    }),
    "No spacing tokens in this registry.",
  );
  const rhythm = table(
    ["Token", "Composes", "Use"],
    RHYTHM_TOKENS.map((entry) => {
      const actual = byName.get(entry.token);
      return [
        documentedToken(entry.token),
        actual ? code(actual.value) : "<em>not declared</em>",
        esc(entry.role),
      ];
    }),
    "No rhythm tokens in this registry.",
  );

  let body = replaceGuideMarker(ctx.authored, SPACING_LADDER_MARKER, ladder);
  body = replaceGuideMarker(body, RHYTHM_LADDER_MARKER, rhythm);
  body = renderGuideExamples(body);

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Spacing & rhythm · ${ctx.config.title}`,
      description:
        "The complete Faqir spacing ladder, the default vertical rhythm, override rules, and intra-/inter-group spacing ownership.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
    }),
  };
}

/** The authored density guide plus the complete scoped token remap. */
function renderDensityPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  authored: string;
  tokenList: TokenEntry[];
  densityTokens: DensityTokenEntry[];
}): SiteFile {
  const pagePath = DENSITY_PAGE;
  const base = new Map(ctx.tokenList.map((entry) => [entry.name, entry.value]));
  const remaps = table(
    ["Token", "Compact", "Comfortable reset", "Base declaration"],
    ctx.densityTokens.map((entry) => [
      documentedToken(entry.name),
      entry.compact ? code(entry.compact) : "<em>not declared</em>",
      entry.comfortable ? code(entry.comfortable) : "<em>not declared</em>",
      base.has(entry.name) ? code(base.get(entry.name)!) : "scoped only",
    ]),
    "No density remaps in this registry.",
  );

  let body = replaceGuideMarker(ctx.authored, DENSITY_REMAP_MARKER, remaps);
  body = renderGuideExamples(body);
  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Density · ${ctx.config.title}`,
      description:
        "The Faqir data-density axis: compact subtrees, comfortable nesting resets, and the complete token remap.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
    }),
  };
}

/** The home page: authored storytelling with registry-derived live inserts. */
function renderHomePage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  authored: string;
  tokenCount: number;
}): SiteFile {
  const pagePath = "index.html";
  const counts = LAYERS.map((layer) => ({
    layer,
    n: ctx.components.filter((c) => c.layer === layer).length,
  })).filter((g) => g.n > 0);
  const total = ctx.components.length;

  const stats =
    `      <section aria-label="Faqir registry statistics" data-docs-stats>\n` +
    `        <div data-ui="grid" data-cols="2" data-cols-lg="4" data-gap="3">\n` +
    `          <div data-ui="stat" data-variant="card" data-size="lg" aria-label="${escAttr(
      `${total} components in the registry`,
    )}"><span data-part="label">Components</span><span data-part="value">${esc(
      String(total),
    )}</span><span data-part="change">${esc(
      counts.map((g) => `${g.n} ${g.layer}`).join(" · "),
    )}</span></div>\n` +
    `          <div data-ui="stat" data-variant="card" data-size="lg" aria-label="${escAttr(
      `${ctx.tokenCount} design tokens`,
    )}"><span data-part="label">Design tokens</span><span data-part="value">${esc(
      String(ctx.tokenCount),
    )}</span><span data-part="change">one semantic cascade</span></div>\n` +
    `          <div data-ui="stat" data-variant="card" data-size="lg" aria-label="${escAttr(
      `${ctx.themes.length} built-in themes`,
    )}"><span data-part="label">Built-in themes</span><span data-part="value">${esc(
      String(ctx.themes.length),
    )}</span><span data-part="change">light · dark · print</span></div>\n` +
    `          <div data-ui="stat" data-variant="card" data-size="lg" aria-label="Zero core runtime dependencies"><span data-part="label">Runtime dependencies</span><span data-part="value">0</span><span data-part="change">plain HTML, CSS, and JavaScript</span></div>\n` +
    `        </div>\n` +
    `      </section>`;

  const editorial = [
    ["patterns", "stats-dashboard"],
    ["patterns", "pricing"],
    ["patterns", "auth-form"],
    ["patterns", "inbox"],
  ] as const;
  const featured = editorial
    .map(([layer, name]) =>
      ctx.components.find((c) => c.layer === layer && c.name === name),
    )
    .filter((c): c is DocsComponent => !!c);
  const featuredCards = featured
    .map(
      (c) =>
        `        <div data-ui="card" data-variant="outlined">\n` +
        `          <div data-part="header">\n` +
        `            <span data-ui="badge" data-variant="secondary" data-size="sm">${esc(
          c.manifest.kind,
        )}</span>\n` +
        `            <h3 data-part="title">${esc(c.name)}</h3>\n` +
        `            <p data-part="description">${esc(c.manifest.description ?? "")}</p>\n` +
        `          </div>\n` +
        `          <div data-part="body">\n` +
        `            <iframe src="${escAttr(c.examplePath)}" title="${escAttr(
          `${c.name} pattern preview`,
        )}" loading="lazy" data-component-frame></iframe>\n` +
        `          </div>\n` +
        `          <div data-part="footer">\n` +
        `            <a data-ui="link" href="${escAttr(c.pagePath)}">Inspect the manifest <span data-ui="icon" data-icon="arrow-right" aria-hidden="true"></span></a>\n` +
        `          </div>\n` +
        `        </div>`,
    )
    .join("\n");
  const components =
    `      <section aria-labelledby="featured-heading" data-docs-section>\n` +
    `        <div data-docs-section-heading>\n` +
    `          <span data-ui="badge" data-variant="secondary">Patterns in action</span>\n` +
    `          <h2 id="featured-heading">From tiny primitives to complete product surfaces.</h2>\n` +
    `          <p>These are the registry's canonical examples, running live—not screenshots. Every one is composed from the same contracts an agent reads.</p>\n` +
    `        </div>\n` +
    `        <div data-ui="grid" data-cols="1" data-cols-lg="2" data-gap="4" data-docs-featured-grid>\n` +
    `${featuredCards}\n` +
    `        </div>\n` +
    `        <p><a data-ui="button" data-variant="outline" href="components/index.html">Explore all ${esc(
      String(total),
    )} components <span data-ui="icon" data-icon="arrow-right" aria-hidden="true"></span></a></p>\n` +
    `      </section>`;

  const themeButtons = ctx.themes
    .map(
      (theme) =>
        `            <button data-ui="button" data-variant="outline" data-size="sm" type="button" ` +
        `data-theme-pick="${escAttr(theme.name)}" data-theme-scheme="${escAttr(
          theme.manifest?.scheme ?? "both",
        )}" aria-pressed="${theme.name === ctx.config.theme}">${esc(theme.name)}</button>`,
    )
    .join("\n");
  const themes =
    `      <section aria-labelledby="home-themes-heading" data-docs-section>\n` +
    `        <div data-docs-theme-runway>\n` +
    `          <div data-docs-theme-copy>\n` +
    `            <span data-ui="badge" data-variant="primary">All ${esc(
      String(ctx.themes.length),
    )} themes, live</span>\n` +
    `            <h2 id="home-themes-heading">One interface. ${esc(
      String(ctx.themes.length),
    )} distinct voices.</h2>\n` +
    `            <p>Pick any theme below. This entire page—and every live component frame—restyles in place from token declarations alone.</p>\n` +
    `          </div>\n` +
    `          <div data-docs-theme-actions>\n` +
    `            <div data-ui="cluster" data-gap="2" role="group" aria-label="Choose a Faqir theme">\n` +
    `${themeButtons}\n` +
    `            </div>\n` +
    `            <p><a data-ui="link" href="${escAttr(THEMES_PAGE)}">Compare every theme side by side</a></p>\n` +
    `          </div>\n` +
    `        </div>\n` +
    `      </section>`;

  const inserts = [
    ["<!-- @faqir:home-stats -->", stats],
    ["<!-- @faqir:home-components -->", components],
    ["<!-- @faqir:home-themes -->", themes],
  ] as const;
  let body = ctx.authored;
  for (const [marker, content] of inserts) {
    body = body.includes(marker) ? body.replace(marker, content) : `${body}\n${content}`;
  }

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `${ctx.config.title} · ${ctx.config.tagline}`,
      description: ctx.config.description,
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "home",
    }),
  };
}

/**
 * The authored responsive lab, in the same generated navigation shell.
 *
 * Published at {@link RESPONSIVE_PAGE}. The doctrine's *guide* is
 * {@link LAYOUT_PAGE}; this is the room with the live, resizable demos in it.
 */
function renderResponsivePage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  authored: string;
}): SiteFile {
  const pagePath = RESPONSIVE_PAGE;
  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Responsive layouts · ${ctx.config.title}`,
      description:
        "Live demonstrations of Faqir's intrinsic, container-driven, and mobile-first responsive layout system.",
      body: ctx.authored,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
      scripts: ["scripts/faqir-core.js"],
    }),
  };
}

/**
 * The **copy-for-agents** mount: the reference fragment, verbatim, under exactly
 * the landmark it needs and nothing else. A fragment that declares its own
 * `main` is mounted as-is, a fragment carrying dialog-class markup is mounted
 * beside `<main>` (overlays belong outside the content flow), and everything
 * else is wrapped in `<main>`.
 *
 * Deliberately NOT what the live-example page carries any more (see
 * {@link mountExample}): a payload someone pastes into an empty file must stay a
 * correct *minimal* example, so the docs site's measure column and demo captions
 * — which are a rendering of the fragment, not part of it — end at the page.
 */
function mountFragment(fragment: string, name: string): string {
  if (hasOwnMain(fragment)) return fragment;
  if (hasDialog(fragment)) {
    return (
      `<main>\n<p>Live reference example: <code>${esc(name)}</code>. ` +
      `Overlay markup is mounted outside the main landmark, where it belongs.</p>\n</main>\n${fragment}`
    );
  }
  return `<main>\n${fragment}\n</main>`;
}

/**
 * The measure column every example page is mounted in. `wide` (72rem) is the
 * docs shell's own measure, so a component is demonstrated at the width the site
 * reads at rather than stretched across whatever window is open; `data-gutter`
 * keeps `avatar`'s and `skeleton`'s circles off the viewport edge.
 *
 * Both come from `container`'s declared vocabulary — the site must not reach for
 * an inline style to fix its own showcase, which is the whole of the 0.9-03
 * gutter defect. The container wraps the landmark rather than *being* it, which
 * is what `container.manifest.json`'s a11y note asks for: it is a layout-only
 * primitive and the landmark belongs on the element inside.
 */
export const EXAMPLE_MEASURE = "wide";
export const EXAMPLE_GUTTER = "4";
const EXAMPLE_COLUMN_OPEN = `<div data-ui="container" data-measure="${EXAMPLE_MEASURE}" data-gutter="${EXAMPLE_GUTTER}">`;

/**
 * The body of a live-example page: the fragment's demos, each in its own
 * captioned block, inside the measure column.
 *
 * Landmark placement is decided from the fragment itself, never from a
 * per-component list — a fragment that declares its own `main` already describes
 * a whole document (an app shell) and is mounted verbatim, a fragment carrying
 * dialog-class markup keeps its overlays outside `<main>` where the `landmark`
 * rule wants them, and everything else becomes the content of `<main>`.
 *
 * The captioned blocks are a *rendering* of the fragment: every byte of markup
 * inside them is the registry's (see {@link splitReferenceDemos}), which is what
 * keeps example pages outside the per-component audit gate honest.
 */
function mountExample(fragment: string, name: string): string {
  if (hasOwnMain(fragment)) return fragment;
  const demos = renderDemoBlocks(splitReferenceDemos(fragment));
  if (hasDialog(fragment)) {
    return (
      `${EXAMPLE_COLUMN_OPEN}\n<main>\n<p>Live reference example: <code>${esc(name)}</code>. ` +
      `Overlay markup is mounted outside the main landmark, where it belongs.</p>\n</main>\n` +
      `${demos}\n</div>`
    );
  }
  return `${EXAMPLE_COLUMN_OPEN}\n<main>\n${demos}\n</main>\n</div>`;
}

function renderExamplePage(
  c: DocsComponent,
  config: SiteConfig,
  overlayPreview: boolean = true,
): SiteFile | null {
  if (!existsSync(c.referencePath)) return null;
  const fragment = sanitizeReferenceFragment(readText(c.referencePath));
  const u = (to: string) => escAttr(relUrl(c.examplePath, to));
  const mounted = mountExample(fragment, c.name);
  // The forced-open preview is one attribute on the wrapper the generator owns —
  // never a byte of the fragment, which is what keeps the page, the snippet and
  // the registry the same markup (task 0.9-05).
  const preview =
    overlayPreview && c.name in OVERLAY_PREVIEW_SURFACES
      ? ` ${OVERLAY_PREVIEW_ATTR}="${escAttr(c.name)}"`
      : "";

  return {
    path: c.examplePath,
    content: `<!DOCTYPE html>
<html lang="en" data-theme="auto" data-preview-role="component"${preview}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escAttr(`${c.name} example · ${config.title}`)}</title>
<link rel="stylesheet" href="${u("styles/faqir.css")}">${renderThemeLink(c.examplePath, config.theme)}
<script src="${u("scripts/gallery.js")}" defer></script>
<script src="${u("scripts/faqir-core.js")}" defer></script>
<!-- ${DOCS_GENERATION_MARKER} · verbatim registry reference markup for ${escAttr(c.name)} -->
</head>
<body>
${mounted}
</body>
</html>
`,
  };
}

// ---------------------------------------------------------------------------
// Copy for agents (task 0.7-15)
// ---------------------------------------------------------------------------

/**
 * A component's copy-for-agents payload: a complete, standalone HTML document
 * that renders that component with **no repository, no install and no build
 * step** — the registry's own reference markup under the two-tag CDN preamble.
 *
 * Everything below the preamble is {@link mountFragment} — the fragment under
 * the landmark its own content asks for, and nothing else. The docs site's
 * example page adds a measure column and visible demo captions on top of the
 * same fragment ({@link mountExample}); a payload does not, because the payload
 * is what someone pastes into an empty file and it has to stay minimal.
 *
 * Paste it into an empty file, open the file, and it works. That claim is the
 * whole point of the button, so the tests assert it as a document — it parses,
 * it has one `<main>`, and every URL in it is pinned and integrity-checked.
 */
export function renderAgentSnippet(input: {
  name: string;
  fragment: string;
  pin: CdnPin;
  theme: string;
  siteTitle: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escAttr(`${input.name} · ${input.siteTitle}`)}</title>
${renderCdnPreamble(input.pin, input.theme)}
</head>
<body>
${mountFragment(input.fragment, input.name)}
</body>
</html>
`;
}

/**
 * The copy-for-agents block on a component page: the payload as visible source,
 * a button that copies it, and a link to the same bytes as a file.
 *
 * The payload is rendered as ESCAPED TEXT inside `<pre><code>`, which is what
 * makes all three work from one source. `textContent` on that element is the
 * payload byte for byte, so the button copies what the page shows and the file
 * serves; the audit gate over this page sees text rather than markup (the same
 * reason the playground's dirty sample is escaped into its textarea); and with
 * JavaScript off — or on `file://`, where the clipboard API is unavailable —
 * the snippet is still right there to select, and the link still resolves.
 */
function renderCopyForAgents(c: DocsComponent, snippet: string, pin: CdnPin): string {
  const sourceId = "agent-snippet";
  const statusId = "agent-snippet-status";
  const fileUrl = escAttr(relUrl(c.pagePath, snippetPath(c.layer, c.name)));

  return (
    `      <p>A standalone document: this component's reference markup under the ` +
    `two-tag CDN preamble, pinned to <code>${esc(`${pin.package}@${pin.version}`)}</code> with ` +
    `subresource integrity. Paste it into an empty file and open it — no install, no build step.</p>\n` +
    `      <p>\n` +
    `        <button data-ui="button" data-variant="primary" data-size="sm" type="button" ` +
    `data-copy-snippet="${sourceId}" data-copy-status="${statusId}">Copy for agents</button>\n` +
    `        <a data-ui="link" href="${fileUrl}">Open the raw file</a>\n` +
    `        <span data-ui="text" data-size="sm" data-variant="muted" id="${statusId}" ` +
    `role="status" aria-live="polite"></span>\n` +
    `      </p>\n` +
    `      <pre tabindex="0"><code id="${sourceId}">${esc(snippet)}</code></pre>`
  );
}

// ---------------------------------------------------------------------------
// The audit playground (task 0.7-14)
// ---------------------------------------------------------------------------

/**
 * The in-browser audit playground: a textarea, a findings region and a preview
 * frame. The engine is `scripts/faqir-audit.js` — `src/audit/browser.ts` compiled
 * for the browser — and the manifests it audits against are
 * `scripts/faqir-manifests.js`, so **the audit runs entirely in the page**: no
 * server, no API, nothing to deploy but files.
 *
 * The rule legend at the bottom is derived from the engine's own rule lists, so
 * it cannot claim a rule the shipped bundle does not run.
 *
 * The sample markup is authored (`site/content/playground.html`) and deliberately
 * dirty — it is the page's demonstration, and a playground that opens with an
 * empty findings list demonstrates nothing. It is *escaped* into the textarea, so
 * the audit gate over this page sees text, not markup: the only Faqir components
 * on the page are the ones the generator wrote around it.
 */
function renderPlaygroundPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  seed: string;
}): SiteFile {
  const pagePath = PLAYGROUND_PAGE;

  // Every rule a caller holding markup alone can run, as the engine lists them
  // (`getHtmlRuleInventory`). A rule added there gains its row here with no edit
  // to this generator and none to the site — which is how `unknown-component`
  // (task 1.0R-11) arrived.
  const ruleRows = getHtmlRuleInventory().map((r) => [
    code(r.id),
    esc(r.severity),
    esc(r.applies_to),
    esc(r.description),
  ]);

  const body = [
    `      <h1>Audit playground</h1>`,
    `      <p>Type Faqir markup on the left and watch <code>faqir audit</code> run on it — ` +
      `in this page, as you type. The engine is the same <code>auditHtmlSource</code> the CLI and the ` +
      `MCP server call, compiled for the browser; the manifests are the registry's. ` +
      `Nothing is uploaded, and there is no server to upload it to.</p>`,
    `      <p data-ui="text" data-variant="muted" data-size="sm" id="playground-status">` +
      `The audit engine loads with this page.</p>`,
    `      <div data-ui="grid" data-cols="1" data-cols-lg="2" data-gap="6">`,
    `        <div>`,
    `          <div data-ui="field-group">`,
    `            <label data-part="label" for="playground-source">Markup to audit</label>`,
    `            <div data-part="input">`,
    `              <textarea data-ui="textarea" id="playground-source" name="source" rows="22" ` +
      `spellcheck="false" aria-describedby="playground-source-hint">${esc(ctx.seed)}</textarea>`,
    `            </div>`,
    `            <p data-part="description" id="playground-source-hint">Edits are audited about a tenth of a second after you stop typing.</p>`,
    `          </div>`,
    `        </div>`,
    `        <div>`,
    `          <h2 id="findings">Findings <span data-ui="badge" id="playground-count" data-variant="default">0</span></h2>`,
    `          <div id="playground-findings" role="status" aria-live="polite">`,
    `            <p><em>This page runs the audit in your browser — with JavaScript disabled there are no findings to show.</em></p>`,
    `          </div>`,
    `        </div>`,
    `      </div>`,
    section(
      "preview",
      "Preview",
      `      <p>The same markup, rendered with the site's stylesheet and the registry engine, ` +
        `in a sandboxed frame.</p>\n` +
        `      <iframe id="playground-preview" title="Rendered preview of the markup above" ` +
        `sandbox="allow-scripts" data-docs-playground-frame></iframe>`,
    ),
    section(
      "rules",
      "Rules this page runs",
      `      <p>Every HTML rule in the engine, as the bundle reports them. ` +
        `CSS, token and contrast rules scan files on disk, so they belong to the CLI, not to a textarea.</p>\n` +
        table(["Rule", "Severity", "Scope", "What it checks"], ruleRows, "No rules registered."),
    ),
    section(
      "cli",
      "The same audit, from the command line",
      `      <pre tabindex="0"><code>${esc(
        "faqir audit                 # every HTML file in the project\n" +
          "faqir audit --stdin < page.html\n" +
          "faqir audit --json          # the findings above, as JSON\n" +
          "faqir audit --rules         # every rule, its severity and its exemptions\n" +
          "faqir audit --skip-rules unknown-component   # a page that mixes in another system\x27s data-ui",
      )}</code></pre>`,
    ),
  ].join("\n");

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Audit playground · ${ctx.config.title}`,
      description:
        "Audit Faqir markup as you type — the CLI's audit engine, compiled for the browser and running with no server.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
      scripts: ["scripts/faqir-audit.js", "scripts/faqir-manifests.js", "scripts/playground.js"],
    }),
  };
}

// ---------------------------------------------------------------------------
// The theme gallery (task 0.7-14)
// ---------------------------------------------------------------------------

/**
 * Declared values of the variant a component drives through a given attribute, or
 * `[]` when the component or the attribute is absent.
 *
 * Keyed by the ATTRIBUTE, not by the manifest's variant name: `button` calls its
 * `data-variant` axis `visual`, and the docs site is not the place to know that.
 * The attribute is what an author types, which is the whole point of the protocol.
 */
function variantValues(c: DocsComponent | undefined, attr: string): string[] {
  const variants = Object.values(c?.manifest.variants ?? {});
  return variants.find((v) => v.attr === attr)?.values ?? [];
}

/**
 * The demo document a gallery frame renders — one per theme, so the theme is
 * right before first paint. Manifest-derived: one button per declared `button`
 * variant, and a swatch per semantic colour token, which is exactly the surface a
 * theme re-declares. Add a variant to `button.manifest.json` and every theme
 * preview grows it.
 *
 * The frame's own `<main>` is a `surface` (task 0.9-03, resolving follow-up
 * 0.8-13). It was `<main style="padding: var(--space-4); display: grid; gap:
 * var(--space-4);">` — the last inline layout escape in this generator, and two
 * concerns in one attribute: an inset and a rhythm. `container` could not
 * express it, because a container's gutter is `padding-inline` only and a naive
 * swap would silently drop the frame's block padding; `surface` is the primitive
 * that pads on both axes (`data-size="md"` is literally `padding:
 * var(--space-4)`), and the rhythm no longer needs a grid at all — a surface is
 * a flow root, so §20's default rule spaces the four demos and `data-gap="4"`
 * tunes it to the same `--space-4` the grid used. `flat` because the frame is
 * the page, not a card on it: no border, no shadow.
 *
 * The two rows are `cluster`s — a button row and a swatch row are the primitive's
 * literal use case (task 0.8-05). They have been through the whole argument: an
 * inline `flex-wrap` escape while the attribute existed in `stack.css` but no
 * manifest declared it and the site may only use what the manifests describe
 * (0.7-20); then `stack` + `data-wrap` once 0.8-03 declared it; now the component
 * whose wrap is intrinsic rather than opted into.
 *
 * The badge row is the browser witness for the semantic subtle-pair contract.
 * It was removed when the gallery first exposed sub-AA `<sem>` text on
 * `<sem>-subtle` fills in 10 of 12 themes (0.7-19); 0.9-10 restores it after the
 * static contrast gate and the full-theme axe matrix make that rendering safe.
 */
function renderThemePreviewPage(ctx: {
  theme: DocsTheme;
  config: SiteConfig;
  byName: Map<string, DocsComponent>;
  tokenList: TokenEntry[];
}): SiteFile {
  const { theme, byName } = ctx;
  const pagePath = themePreviewPath(theme.name);
  const u = (to: string) => escAttr(relUrl(pagePath, to));

  const buttons = variantValues(byName.get("button"), "data-variant")
    .map(
      (v) =>
        `      <button data-ui="button" data-variant="${escAttr(v)}" data-size="sm" type="button">${esc(
          v,
        )}</button>`,
    )
    .join("\n");

  const badges = variantValues(byName.get("badge"), "data-variant")
    .map(
      (v) =>
        `      <span data-ui="badge" data-variant="${escAttr(v)}">${esc(v)}</span>`,
    )
    .join("\n");

  // Selected by NAME, not by value: a semantic colour token's value is usually a
  // `var(--palette-…)` hop, which `isColorToken` (a value heuristic, for the token
  // reference's sample column) does not recognise. Here the question is which
  // tokens a theme re-declares, and `color-*` in the semantic layer IS that set.
  const swatches = ctx.tokenList
    .filter((t) => t.group === "semantic" && t.name.startsWith("color-"))
    .map((t) => `      ${renderSwatch(t)}`)
    .join("\n");

  const card = byName.has("card")
    ? `    <div data-ui="card">
      <div data-part="header">
        <h2 data-part="title">${esc(theme.name)}</h2>
        <p data-part="description">${esc(
          theme.manifest?.mood?.join(" · ") ?? "a registry theme",
        )}</p>
      </div>
      <div data-part="body">
        <div data-ui="field-group">
          <label data-part="label" for="${escAttr(`preview-${theme.name}-field`)}">Project name</label>
          <div data-part="input">
            <input data-ui="input" id="${escAttr(
              `preview-${theme.name}-field`,
            )}" name="project" value="Faqir">
          </div>
        </div>
      </div>
    </div>`
    : "";

  const callout = byName.has("callout")
    ? `    <div data-ui="callout" data-variant="info" role="note">
      <div data-part="content">Every colour on this card is a token. The theme re-declares ${esc(
        String(theme.manifest?.tokens_overridden?.length ?? 0),
      )} of them.</div>
    </div>`
    : "";

  return {
    path: pagePath,
    content: `<!DOCTYPE html>
<html lang="en" data-theme="auto" data-preview-role="theme">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escAttr(`${theme.name} theme preview · ${ctx.config.title}`)}</title>
<link rel="stylesheet" href="${u("styles/faqir.css")}">
<link rel="stylesheet" href="${u(theme.stylePath)}" id="${THEME_LINK_ID}" data-theme-name="${escAttr(
      theme.name,
    )}">
<script src="${u("scripts/gallery.js")}" defer></script>
<!-- ${DOCS_GENERATION_MARKER} · theme preview frame for ${escAttr(theme.name)} -->
</head>
<body>
<main data-ui="surface" data-variant="flat" data-size="md" data-gap="4">
${card}
${callout}
    <div data-ui="cluster" data-gap="2" role="group" aria-label="Badge variants">
${badges}
    </div>
    <div data-ui="cluster" data-gap="2">
${buttons}
    </div>
    <div data-ui="cluster" data-gap="1">
${swatches}
    </div>
</main>
</body>
</html>
`,
  };
}

/**
 * The theme gallery: every registry theme, rendered as the same document, with a
 * switcher that changes this page too.
 *
 * The switcher is the demo. Selecting a theme rewrites one attribute — the `href`
 * of `#faqir-theme` — and the page you are reading restyles with no reload;
 * selecting a scheme rewrites one attribute — `data-theme` on `<html>` — on this
 * page and, by `postMessage`, in all of the preview frames at once. There is no
 * other mechanism, which is the claim: a theme is a stylesheet of tokens, and a
 * scheme is one attribute.
 */
function renderThemeGalleryPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
}): SiteFile {
  const pagePath = THEMES_PAGE;
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const { themes } = ctx;

  const themeButtons = themes
    .map(
      (t) =>
        `        <button data-ui="button" data-variant="outline" data-size="sm" type="button" ` +
        `data-theme-pick="${escAttr(t.name)}" data-theme-scheme="${escAttr(
          t.manifest?.scheme ?? "both",
        )}" aria-pressed="${t.name === ctx.config.theme}">${esc(t.name)}</button>`,
    )
    .join("\n");

  const schemeButtons = (
    [
      ["light", "Light"],
      ["dark", "Dark"],
      ["auto", "Auto"],
    ] as const
  )
    .map(
      ([value, label]) =>
        `        <button data-ui="button" data-variant="outline" data-size="sm" type="button" ` +
        `data-scheme-pick="${value}" aria-pressed="${value === "auto"}">${label}</button>`,
    )
    .join("\n");

  const cards = themes
    .map((t) => {
      const m = t.manifest;
      const frame = themePreviewPath(t.name);
      return (
        `        <div data-ui="card" data-variant="outlined" data-docs-theme-card>\n` +
        `          <div data-part="header">\n` +
        `            <h3 data-part="title">${esc(t.name)}</h3>\n` +
        `            <p data-part="description">${esc(m?.mood?.join(" · ") ?? "")}</p>\n` +
        `          </div>\n` +
        `          <div data-part="body">\n` +
        `            <iframe src="${u(frame)}" title="${escAttr(
          `${t.name} theme preview`,
        )}" loading="lazy" data-theme-frame="${escAttr(t.name)}"></iframe>\n` +
        `          </div>\n` +
        `          <div data-part="footer">\n` +
        `            <span data-ui="badge" data-variant="secondary">${esc(
          m ? `${m.scheme} scheme` : "no manifest",
        )}</span>\n` +
        `            <a data-ui="link" href="${u(frame)}">Open frame</a>\n` +
        `          </div>\n` +
        `        </div>`
      );
    })
    .join("\n");

  const rows = themes.map((t) => {
    const m = t.manifest;
    return [
      code(t.name),
      esc(m?.scheme ?? "—"),
      esc(m?.dark_mode ?? "—"),
      m?.mood?.length ? m.mood.map((x) => code(x)).join(" ") : "—",
      esc(String(m?.tokens_overridden?.length ?? 0)),
      monoLink(u(t.stylePath), `${t.name}.css`),
    ];
  });

  const body = [
    `      <h1>Themes</h1>`,
    `      <p>${esc(
      `${themes.length} themes. A theme is a stylesheet of design-token declarations and nothing else — ` +
        `no component is aware of it, so every one of them restyles at once.`,
    )}</p>`,
    section(
      "switch",
      "Switch this page",
      `      <div data-docs-theme-switcher>\n` +
        `      <p>These buttons restyle <em>this documentation page</em>, live: picking a theme rewrites the ` +
        `<code>href</code> of one <code>&lt;link&gt;</code>, and picking a scheme rewrites ` +
        `<code>data-theme</code> on <code>&lt;html&gt;</code> here and in every frame below. No reload, ` +
        `no rebuild, no flash of unstyled content.</p>\n` +
        `      <div data-ui="cluster" data-gap="2" role="group" aria-label="Theme">\n` +
        `${themeButtons}\n      </div>\n` +
        `      <div data-ui="cluster" data-gap="2" role="group" aria-label="Colour scheme">\n` +
        `${schemeButtons}\n      </div>\n` +
        `      </div>`,
    ),
    section(
      "gallery",
      "Every theme, side by side",
      `      <p>Each frame is the same manifest-derived document — one button per declared ` +
        `<code>button</code> variant and one swatch per semantic colour token, the surface a theme ` +
        `re-declares — loaded with a different theme stylesheet.</p>\n` +
        `      <div data-ui="grid" data-cols="1" data-cols-lg="2" data-gap="4">\n${cards}\n      </div>`,
    ),
    section(
      "reference",
      "Theme reference",
      `      <p>Derived from each theme's <code>{name}.theme.json</code> manifest.</p>\n` +
        table(
          ["Theme", "Ships", "Dark mode", "Mood", "Tokens re-declared", "Stylesheet"],
          rows,
          "No themes in this registry.",
        ),
    ),
    section(
      "usage",
      "Using a theme",
      `      <pre tabindex="0"><code>${esc(
        "faqir init --theme midnight       # a new project\n" +
          "faqir theme midnight              # switch an existing one\n" +
          '<html data-theme="dark">          # the scheme, at runtime',
      )}</code></pre>`,
    ),
  ].join("\n");

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Themes · ${ctx.config.title}`,
      description: `Every Faqir theme, side by side, with an instant switcher that restyles this page.`,
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
      scripts: ["scripts/gallery.js"],
    }),
  };
}

// ---------------------------------------------------------------------------
// The scaffold gallery (task 1.0R-08)
// ---------------------------------------------------------------------------

/**
 * The theme a scaffold's document is shown in: the one the CLI pins for it
 * (`invoice` and `report` pin `document`), falling back to the site's own.
 *
 * A print-oriented scaffold shown in the docs theme would be a component dump
 * with a page border; shown in its own theme it is the document it is.
 */
function scaffoldTheme(def: ScaffoldDef, config: SiteConfig, themes: readonly DocsTheme[]): string {
  const pinned = def.defaultTheme;
  if (pinned && themes.some((t) => t.name === pinned)) return pinned;
  return config.theme;
}

/**
 * The live document for one scaffold, as a frame page.
 *
 * The markup is {@link scaffoldBody} — the same bytes `faqir scaffold <name>`
 * writes into the file — run through {@link sanitizeReferenceFragment} for the
 * same reason every example page is: the registry's own reference markup points
 * an `<img>` at `example.com`, and no page this site serves reaches the network.
 * Nothing else is touched, which is what makes the gallery a demonstration
 * rather than an illustration.
 */
function renderScaffoldFrame(ctx: {
  def: ScaffoldDef;
  config: SiteConfig;
  themes: DocsTheme[];
  registryRoot: string;
}): SiteFile {
  const { def } = ctx;
  const pagePath = scaffoldFramePath(def.name);
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const theme = scaffoldTheme(def, ctx.config, ctx.themes);
  // A document theme is a paper simulation: it declares light surfaces only, so
  // the frame pins the scheme instead of following the reader's.
  const scheme = def.defaultTheme ? "light" : "auto";

  return {
    path: pagePath,
    content: `<!DOCTYPE html>
<html lang="en" data-theme="${escAttr(scheme)}" data-preview-role="scaffold">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escAttr(`${def.title} scaffold · ${ctx.config.title}`)}</title>
<link rel="stylesheet" href="${u("styles/faqir.css")}">
<link rel="stylesheet" href="${u(`styles/themes/${theme}.css`)}" id="${THEME_LINK_ID}" data-theme-name="${escAttr(
      theme,
    )}">
<script src="${u("scripts/gallery.js")}" defer></script>
<script src="${u("scripts/faqir-core.js")}" defer></script>
<!-- ${DOCS_GENERATION_MARKER} · the page \`faqir scaffold ${escAttr(def.name)}\` writes -->
</head>
<body>
${sanitizeReferenceFragment(scaffoldBody(def.name, ctx.registryRoot))}
</body>
</html>
`,
  };
}

/**
 * A scaffold's copy-for-agents payload: the whole page under the two-tag CDN
 * preamble, pinned and integrity-checked. Paste it into an empty file, open the
 * file, and a complete admin dashboard — or a print-ready invoice — renders with
 * no repository, no install and no build step.
 */
function renderScaffoldSnippet(ctx: {
  def: ScaffoldDef;
  config: SiteConfig;
  themes: DocsTheme[];
  registryRoot: string;
  pin: CdnPin;
}): string {
  const { def } = ctx;
  const theme = scaffoldTheme(def, ctx.config, ctx.themes);
  return `<!DOCTYPE html>
<html lang="en" data-theme="${def.defaultTheme ? "light" : "auto"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escAttr(`${def.title} · ${ctx.config.title}`)}</title>
${renderCdnPreamble(ctx.pin, theme)}
</head>
<body>
${sanitizeReferenceFragment(scaffoldBody(def.name, ctx.registryRoot))}
</body>
</html>
`;
}

/** The composition table: what a scaffold installs, linked to each component's page. */
function renderScaffoldComposition(
  def: ScaffoldDef,
  byName: Map<string, DocsComponent>,
  pagePath: string,
): string {
  const link = (name: string): string => {
    const c = byName.get(name);
    return c ? monoLink(escAttr(relUrl(pagePath, c.pagePath)), name) : code(name);
  };
  return table(
    ["Layer", "Installed"],
    [
      ["Patterns", def.patterns.map(link).join(" ")],
      ["Components", def.components.map(link).join(" ")],
    ],
    "This scaffold installs nothing.",
  );
}

/** One scaffold's page: the live document, the payload, and the command. */
function renderScaffoldPage(ctx: {
  def: ScaffoldDef;
  config: SiteConfig;
  components: DocsComponent[];
  byName: Map<string, DocsComponent>;
  themes: DocsTheme[];
  snippet: string;
  pin: CdnPin;
}): SiteFile {
  const { def } = ctx;
  const pagePath = scaffoldPagePath(def.name);
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const frame = u(scaffoldFramePath(def.name));
  const theme = scaffoldTheme(def, ctx.config, ctx.themes);
  const sourceId = "agent-snippet";
  const statusId = "agent-snippet-status";

  const command =
    `      <pre tabindex="0"><code>${esc(
      `${scaffoldCommand(def.name)}${
        def.defaultTheme ? `\n# pins the ${def.defaultTheme} theme; override with --theme <name>` : ""
      }`,
    )}</code></pre>`;

  const body = [
    `      <nav data-ui="breadcrumb" data-size="sm" aria-label="Breadcrumb" data-docs-breadcrumbs>
        <ol data-part="list">
          <li><a data-part="item" href="${u("index.html")}">Overview</a></li>
          <li data-part="separator" aria-hidden="true"></li>
          <li><a data-part="item" href="${u(SCAFFOLDS_PAGE)}">Scaffolds</a></li>
          <li data-part="separator" aria-hidden="true"></li>
          <li><span data-part="current" aria-current="page">${esc(def.name)}</span></li>
        </ol>
      </nav>`,
    `      <h1>${esc(def.title)}</h1>`,
    `      <p><span data-ui="badge" data-variant="primary">scaffold</span> ` +
      `<span data-ui="badge" data-variant="default">${esc(theme)} theme</span> ` +
      `<span data-ui="badge" data-variant="default">${esc(
        `${def.patterns.length} patterns · ${def.components.length} components`,
      )}</span></p>`,
    `      <p>${esc(def.description)}.</p>`,
    section(
      "command",
      "The command",
      `      <p>One command writes the whole page and installs everything it references. ` +
        `Nothing below is authored by this site — it is the file you get.</p>\n${command}`,
    ),
    section(
      "document",
      "The document",
      `      <p>The frame below is the generated page, running live under the site's own stylesheet. ` +
        `<a data-ui="link" href="${frame}">Open it on its own page</a>.</p>\n` +
        `      <div data-docs-preview-toolbar>\n` +
        `        <span data-ui="text" data-size="sm" data-variant="muted">Check the page at three widths.</span>\n` +
        `        <div data-ui="cluster" data-gap="2" role="group" aria-label="Preview width">\n` +
        `          <button data-ui="button" data-variant="outline" data-size="sm" type="button" data-preview-size="phone" data-preview-width="23.5rem" data-preview-target="scaffold-preview" aria-pressed="false">Phone</button>\n` +
        `          <button data-ui="button" data-variant="outline" data-size="sm" type="button" data-preview-size="tablet" data-preview-width="48rem" data-preview-target="scaffold-preview" aria-pressed="false">Tablet</button>\n` +
        `          <button data-ui="button" data-variant="outline" data-size="sm" type="button" data-preview-size="full" data-preview-width="100%" data-preview-target="scaffold-preview" aria-pressed="true">Full</button>\n` +
        `        </div>\n` +
        `      </div>\n` +
        `      <div data-docs-preview-stage data-docs-scaffold-stage>\n` +
        `        <iframe id="scaffold-preview" src="${frame}" title="${escAttr(
          `${def.title} scaffold, running live`,
        )}" loading="lazy" data-docs-preview-frame data-docs-scaffold-frame></iframe>\n` +
        `      </div>`,
    ),
    section(
      "copy-for-agents",
      "Copy for agents",
      `      <p>The same page as a standalone document, under the two-tag CDN preamble pinned to ` +
        `<code>${esc(`${ctx.pin.package}@${ctx.pin.version}`)}</code> with subresource integrity. ` +
        `Paste it into an empty file and open it — no repository, no install, no build step.</p>\n` +
        `      <p>\n` +
        `        <button data-ui="button" data-variant="primary" data-size="sm" type="button" ` +
        `data-copy-snippet="${sourceId}" data-copy-status="${statusId}">Copy for agents</button>\n` +
        `        <a data-ui="link" href="${u(scaffoldSnippetPath(def.name))}">Open the raw file</a>\n` +
        `        <span data-ui="text" data-size="sm" data-variant="muted" id="${statusId}" ` +
        `role="status" aria-live="polite"></span>\n` +
        `      </p>\n` +
        `      <pre tabindex="0"><code id="${sourceId}">${esc(ctx.snippet)}</code></pre>`,
    ),
    section(
      "composition",
      "What it installs",
      `      <p>Every block on the page is one of these patterns' own canonical example, copied ` +
        `verbatim — so the generated page is audit-clean, themed from tokens, and free of inline ` +
        `styles before you edit a word of it.</p>\n` +
        renderScaffoldComposition(def, ctx.byName, pagePath),
    ),
  ].join("\n");

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `${def.title} scaffold · ${ctx.config.title}`,
      description: `${def.description} — generated by \`faqir scaffold ${def.name}\`.`,
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "reference",
      scripts: ["scripts/copy-snippet.js"],
    }),
  };
}

/** The gallery: every registered scaffold, as the document it produces. */
function renderScaffoldGalleryPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  defs: ScaffoldDef[];
}): SiteFile {
  const pagePath = SCAFFOLDS_PAGE;
  const u = (to: string) => escAttr(relUrl(pagePath, to));

  const cards = ctx.defs
    .map(
      (def) =>
        `        <div data-ui="card" data-variant="outlined" data-docs-theme-card>\n` +
        `          <div data-part="header">\n` +
        `            <h3 data-part="title">${esc(def.title)}</h3>\n` +
        `            <p data-part="description">${esc(def.description)}</p>\n` +
        `          </div>\n` +
        `          <div data-part="body">\n` +
        `            <iframe src="${u(scaffoldFramePath(def.name))}" title="${escAttr(
          `${def.title} scaffold preview`,
        )}" loading="lazy"></iframe>\n` +
        `          </div>\n` +
        `          <div data-part="footer">\n` +
        `            <span data-ui="badge" data-variant="secondary">${esc(
          `${def.patterns.length} patterns`,
        )}</span>\n` +
        `            <a data-ui="link" href="${u(scaffoldPagePath(def.name))}">Open the scaffold</a>\n` +
        `          </div>\n` +
        `        </div>`,
    )
    .join("\n");

  const rows = ctx.defs.map((def) => [
    monoLink(u(scaffoldPagePath(def.name)), def.name),
    esc(def.description),
    def.patterns.map((p) => code(p)).join(" "),
    def.defaultTheme ? code(def.defaultTheme) : "project's",
  ]);

  const body = [
    `      <h1>Scaffolds</h1>`,
    `      <p>${esc(
      `${ctx.defs.length} whole pages, each written by one command. A scaffold is not a starter ` +
        `template that drifts from the framework: every block in it is a registry pattern's own ` +
        `canonical example, copied verbatim, so the page you get is already audit-clean, ` +
        `accessible and themed from tokens.`,
    )}</p>`,
    section(
      "gallery",
      "Every scaffold, running live",
      `      <p>Each frame is the real generated document, not a screenshot.</p>\n` +
        `      <div data-ui="grid" data-cols="1" data-cols-lg="2" data-gap="4">\n${cards}\n      </div>`,
    ),
    section(
      "reference",
      "Scaffold reference",
      `      <p>Derived from the CLI's own catalogue, so this table cannot advertise a scaffold ` +
        `<code>faqir scaffold</code> will not write.</p>\n` +
        table(["Scaffold", "What it is", "Patterns", "Theme"], rows, "No scaffolds are registered."),
    ),
    section(
      "usage",
      "Using a scaffold",
      `      <pre tabindex="0"><code>${esc(
        ctx.defs.map((def) => scaffoldCommand(def.name)).join("\n"),
      )}</code></pre>\n` +
        `      <p>Add <code>--theme &lt;name&gt;</code> to pin a theme, or <code>--no-add</code> to ` +
        `write the page without installing anything it references.</p>`,
    ),
  ].join("\n");

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Scaffolds · ${ctx.config.title}`,
      description: `Every whole page \`faqir scaffold\` writes, running live — landing pages, dashboards, and print-ready documents.`,
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
    }),
  };
}

// ---------------------------------------------------------------------------
// Agent surfaces (task 0.7-15)
// ---------------------------------------------------------------------------

/** One machine-readable file the site serves at a stable URL. */
export interface MachineFile extends SiteFile {
  /** `Content-Type` the host must serve it as (drives {@link HEADERS_FILE}). */
  contentType: string;
  /** One line for the agents page — what it is and what it is for. */
  description: string;
}

/**
 * The four machine files, built once and used three times: written to the
 * output, listed on the agents page, and turned into `_headers`. One list, so a
 * file cannot be served without being documented, or documented without being
 * served.
 */
function buildMachineFiles(ctx: {
  registryRoot: string;
  packageRoot: string;
  components: DocsComponent[];
  config: SiteConfig;
}): MachineFile[] {
  const context = buildRegistryContext({
    registryRoot: ctx.registryRoot,
    components: ctx.components,
    theme: ctx.config.theme,
  });

  const files: MachineFile[] = [
    {
      path: LLMS_INDEX_FILE,
      content: formatContextLlms(context),
      contentType: "text/plain; charset=utf-8",
      description:
        "llmstxt.org index — every component in one line each, linked into the full reference.",
    },
    {
      path: LLMS_FULL_FILE,
      content: formatContextLlmsFull(context),
      contentType: "text/plain; charset=utf-8",
      description:
        "The expanded reference: template, variants, slots, states and accessibility contract " +
        "for every component, plus the attribute protocol and the token scales.",
    },
  ];

  // The schema is served at the path its own `$id` claims, so a `$schema` link
  // in any manifest resolves here — and again under the frozen spec's versioned
  // prefix, from the same bytes, so an agent can pin the schema it validated
  // against instead of following an alias that will one day move (task 1.0-01).
  const schemaPath = join(ctx.packageRoot, SCHEMA_FILE);
  if (existsSync(schemaPath)) {
    const schema = readText(schemaPath);
    files.push({
      path: SCHEMA_FILE,
      content: schema,
      contentType: "application/schema+json; charset=utf-8",
      description:
        "JSON Schema for component and theme manifests — the contract every manifest validates against.",
    });
    files.push({
      path: SPEC_SCHEMA_FILE,
      content: schema,
      contentType: "application/schema+json; charset=utf-8",
      description: `The same schema, frozen at ${SCHEMA_VERSION} and addressable by version — the copy to pin.`,
    });
  }

  // The spec's own source. Served as markdown because that is what it is: an
  // agent that reads llms.txt reads this the same way, and the bytes are the
  // repository's `SPEC-1.0.md` rather than a rendering of it.
  const specPath = join(ctx.packageRoot, SPEC_FILE);
  if (existsSync(specPath)) {
    files.push({
      path: SPEC_MARKDOWN_FILE,
      content: readText(specPath),
      contentType: "text/markdown; charset=utf-8",
      description: `The frozen protocol ${PROTOCOL_VERSION} specification, verbatim — five attributes, three token modifiers, one tier suffix, one schema.`,
    });
  }

  // The migration guide's own source (task 1.0-03), served as markdown for the
  // same reason the spec is: an agent upgrading a project reads the document,
  // not a rendering of it.
  const migrationPath = join(ctx.packageRoot, MIGRATION_DOC_FILE);
  if (existsSync(migrationPath)) {
    files.push({
      path: MIGRATION_MARKDOWN_FILE,
      content: readText(migrationPath),
      contentType: "text/markdown; charset=utf-8",
      description: `The v0.x → ${PROTOCOL_VERSION} migration guide, verbatim — the rename, the upgrade procedure, and every breaking component change since v${MIGRATION_FROM_VERSION}.`,
    });
  }

  // The remote-registry index (task 0.5-03): what `faqir add --registry <url>`
  // fetches, with a hash per file.
  const indexPath = join(ctx.registryRoot, REGISTRY_INDEX_FILE);
  if (existsSync(indexPath)) {
    files.push({
      path: REGISTRY_INDEX_FILE,
      content: readText(indexPath),
      contentType: "application/json; charset=utf-8",
      description:
        "Remote-registry index — every component with a SHA-256 per file, fetched by faqir add --registry.",
    });
  }

  return files;
}

/**
 * Cloudflare Pages / Netlify `_headers`. Generated from {@link MachineFile}, so
 * the served content type of an agent surface is decided in the same place the
 * file is: `llms.txt` must arrive as text an agent can read, and every machine
 * file must be readable cross-origin or a browser-based agent cannot fetch it
 * at all.
 */
function renderHeadersFile(machine: MachineFile[]): SiteFile {
  const lines = [
    `# ${DOCS_GENERATION_MARKER} — do not edit by hand`,
    "#",
    "# Cloudflare Pages (and Netlify) read this file from the root of the published",
    "# directory. It exists for the machine surfaces: an agent fetching llms.txt or",
    "# the manifest schema needs the right content type and a permissive CORS header.",
    "",
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), geolocation=(), microphone=()",
    "  X-Frame-Options: SAMEORIGIN",
    "  Content-Security-Policy: default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; frame-src 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    "",
  ];
  for (const f of machine) {
    lines.push(`/${f.path}`);
    lines.push(`  Content-Type: ${f.contentType}`);
    lines.push(`  Access-Control-Allow-Origin: *`);
    lines.push("");
  }
  lines.push(`/${SNIPPET_PREFIX}*`);
  lines.push(`  Content-Type: text/plain; charset=utf-8`);
  lines.push(`  Access-Control-Allow-Origin: *`);
  lines.push("");
  lines.push(`/${DEMO_MESSAGES_API}`);
  lines.push(`  Content-Type: application/json; charset=utf-8`);
  lines.push(`  Cache-Control: public, max-age=300`);
  lines.push("");
  return { path: HEADERS_FILE, content: lines.join("\n") };
}

/** Static JSON backing for the canonical inbox reference on a backend-free host. */
function renderDemoMessagesFile(siteRoot: string): SiteFile {
  const source = join(siteRoot, "content", "messages.json");
  const content = existsSync(source) ? `${readText(source).trim()}\n` : "[]\n";
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("site/content/messages.json must contain a JSON array");
  }
  return { path: DEMO_MESSAGES_API, content };
}

/** Audit-clean destination for unknown static-host paths. */
function renderNotFoundPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
}): SiteFile {
  const pagePath = NOT_FOUND_PAGE;
  const body = `      <div data-docs-empty-page>
        <span data-ui="badge" data-variant="secondary">404 · Not found</span>
        <span data-ui="icon" data-icon="compass" aria-hidden="true"></span>
        <h1>This route has no contract.</h1>
        <p>The page may have moved, or the URL may describe something that is not in the published registry.</p>
        <div data-ui="cluster" data-gap="3" data-justify="center">
          <a data-ui="button" data-variant="primary" href="${escAttr(
            relUrl(pagePath, "index.html"),
          )}">Return to the overview</a>
          <a data-ui="button" data-variant="outline" href="${escAttr(
            relUrl(pagePath, "components/index.html"),
          )}">Browse components</a>
        </div>
      </div>`;
  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Not found · ${ctx.config.title}`,
      description: "The requested Faqir documentation page could not be found.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "reference",
    }),
  };
}

/** Search-engine discovery file for the static deployment. */
function renderRobotsFile(config: SiteConfig): SiteFile {
  return {
    path: ROBOTS_FILE,
    content:
      `# ${DOCS_GENERATION_MARKER}\n` +
      "User-agent: *\n" +
      "Allow: /\n" +
      `Sitemap: ${config.url.replace(/\/+$/, "")}/${SITEMAP_FILE}\n`,
  };
}

/** Deterministic sitemap for every navigable public document. */
function renderSitemapFile(config: SiteConfig, paths: readonly string[]): SiteFile {
  const urls = [...new Set(paths)]
    .filter((path) => path !== NOT_FOUND_PAGE)
    .sort()
    .map((path) => `  <url><loc>${esc(canonicalUrl(config, path))}</loc></url>`)
    .join("\n");
  return {
    path: SITEMAP_FILE,
    content:
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  };
}

/**
 * The agents page: the stable URLs, in prose, for the human who is wiring an
 * agent up. Every row is generated from the same list that emits the files, and
 * the preamble shown is the same string the snippets carry — the page cannot
 * document a URL the site does not serve, or a preamble it does not ship.
 */
function renderAgentsPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  machine: MachineFile[];
  pin: CdnPin;
  exampleSnippet: string | null;
}): SiteFile {
  const pagePath = AGENTS_PAGE;
  const u = (to: string) => escAttr(relUrl(pagePath, to));

  const rows = ctx.machine.map((f) => [
    monoLink(u(f.path), `/${f.path}`),
    esc(f.description),
    code(f.contentType.split(";")[0]),
  ]);

  const body = [
    `      <h1>For agents</h1>`,
    `      <p>Four files describe this framework to a machine, each at a URL that does not move. ` +
      `They are generated from the registry manifests by the same build that generates these pages, ` +
      `so they cannot describe a component that does not exist.</p>`,
    section(
      "files",
      "Stable URLs",
      table(["URL", "What it is", "Type"], rows, "No machine files in this build."),
    ),
    section(
      "preamble",
      "The two-tag preamble",
      `      <p>Every component page carries a <strong>Copy for agents</strong> button. What it ` +
        `copies is a complete HTML document: the component's reference markup under these two tags, ` +
        `version-pinned with subresource integrity. Nothing to install, nothing to build.</p>\n` +
        `      <pre tabindex="0"><code>${esc(
          renderCdnPreamble(ctx.pin, ctx.config.theme),
        )}</code></pre>\n` +
        `      <p>The same payloads are files: ` +
        `<code>${esc(`${SNIPPET_PREFIX}<layer>/<component>.html.txt`)}</code> — for example ` +
        (ctx.exampleSnippet
          ? `${monoLink(u(ctx.exampleSnippet), `/${ctx.exampleSnippet}`)}.</p>`
          : `none in this build.</p>`),
    ),
    section(
      "cli",
      "The same files, locally",
      `      <p>A project generates its own, describing what it actually installed ` +
        `rather than the whole registry:</p>\n` +
        `      <pre tabindex="0"><code>${esc(
          "faqir context --format llms   # llms.txt + llms-full.txt for this project\n" +
            "faqir context --skill         # a manifest-derived agent skill\n" +
            "faqir audit --json            # the audit findings, machine-readable",
        )}</code></pre>`,
    ),
  ].join("\n");

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `For agents · ${ctx.config.title}`,
      description:
        "Stable, machine-readable URLs for Faqir UI: llms.txt, llms-full.txt, the manifest schema and the registry index.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
    }),
  };
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

/**
 * The site stylesheet: tokens, base, every component stylesheet, then the
 * token-only documentation presentation layer. One file, one `<link>`, so a
 * page works from any directory depth and any static host. The final authored
 * layer arranges the shell and showroom; component identity and behaviour still
 * come exclusively from the registry.
 *
 * The **theme is a second `<link>`** (`styles/themes/<name>.css`, see
 * {@link buildThemeStylesheet}) rather than a slice of this file, because that is
 * what makes the gallery's instant switcher a one-attribute change instead of a
 * rebuild: swapping that link's `href` restyles the whole document with no
 * reload. It loads *after* the components, one step later than `faqir init`
 * concatenates it, which is safe in both directions: no component stylesheet
 * declares `:root` (asserted), so nothing competes with a theme's token
 * declarations at all, and the one theme that also targets components
 * (`contrast.css`, via `:root [data-ui]…`) already outranks them on specificity —
 * loading later can only raise a theme's authority, never lower it.
 */
export function buildSiteStylesheet(
  registryRoot: string,
  siteRoot: string = join(PACKAGE_ROOT, "site"),
  overlayPreview: boolean = true,
): string {
  const parts: string[] = [`/* ${DOCS_GENERATION_MARKER} — do not edit by hand */`];

  parts.push("/* ── tokens ── */");
  for (const name of TOKEN_FILES) {
    const path = join(registryRoot, "tokens", `${name}.css`);
    if (!existsSync(path)) continue;
    parts.push(
      readText(path)
        .split("\n")
        .filter((line) => !line.startsWith("@import"))
        .join("\n"),
    );
  }

  parts.push("/* ── base ── */");
  for (const name of BASE_FILES) {
    const path = join(registryRoot, "base", `${name}.css`);
    if (existsSync(path)) parts.push(readText(path));
  }

  parts.push("/* ── components ── */");
  for (const layer of LAYERS) {
    const base = join(registryRoot, layer);
    if (!existsSync(base)) continue;
    for (const file of walkCss(base)) parts.push(readText(file));
  }

  const docsCss = join(siteRoot, "styles", "docs.css");
  if (existsSync(docsCss)) {
    parts.push("/* ── documentation presentation ── */");
    parts.push(readText(docsCss));
  }

  // One rule per swatchable token. The *shape* of a swatch (size, border, radius)
  // is authored in docs.css; only its colour is per-token, and a colour that
  // varies per element is the one thing an attribute selector cannot express
  // without a rule per value — so the rules are generated from the same token
  // reference the pages are, rather than written inline on 100-odd spans.
  parts.push("/* ── documentation swatches (generated from the token reference) ── */");
  parts.push(renderSwatchRules(parseTokenReference(registryRoot)));

  parts.push("/* ── documentation typography specimens (generated from type tokens) ── */");
  parts.push(renderTypographyPreviewRules(parseTokenReference(registryRoot)));

  // Last, so it wins the specificity ties the closed-state rules can force
  // (task 0.9-05). Scoped to `[data-docs-overlay="<name>"]`, which only an
  // example page carries — nothing a user installs or pastes ever sees these.
  if (overlayPreview) {
    parts.push("/* ── forced-open overlay previews (docs example pages only) ── */");
    parts.push(renderOverlayPreviewRules());
  }

  return parts.join("\n") + "\n";
}

/** One theme's stylesheet, verbatim — the swappable half of the cascade. */
export function buildThemeStylesheet(theme: DocsTheme): string {
  return (
    `/* ${DOCS_GENERATION_MARKER} — theme: ${theme.name} · do not edit by hand */\n` +
    readText(theme.cssPath)
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Read `site/site.config.json`, falling back to the built-in defaults. */
export function readSiteConfig(siteRoot: string): SiteConfig {
  const path = join(siteRoot, "site.config.json");
  if (!existsSync(path)) return { ...DEFAULT_SITE_CONFIG };
  return { ...DEFAULT_SITE_CONFIG, ...(JSON.parse(readText(path)) as Partial<SiteConfig>) };
}

/**
 * Build the whole docs site in memory. Pure with respect to the output: it reads
 * the registry and the authored `site/` sources and returns every file, so tests
 * can assert on the site without touching a directory, and `build:docs` is a thin
 * "write these files" wrapper.
 */
export function buildDocsSite(options: DocsSiteOptions = {}): SiteFile[] {
  const registryRoot = options.registryRoot ?? join(PACKAGE_ROOT, "registry");
  const siteRoot = options.siteRoot ?? join(PACKAGE_ROOT, "site");
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const pin = readCdnPin(packageRoot);
  const authoredConfig = readSiteConfig(siteRoot);
  const themes = discoverThemes(registryRoot);
  // The active theme must be one the site actually ships, or its `<link>` would be
  // a broken URL: fall back to the first theme in the registry, and to no theme
  // link at all for a registry that ships none.
  const requested = options.theme ?? authoredConfig.theme;
  const config: SiteConfig = {
    ...authoredConfig,
    theme: themes.some((t) => t.name === requested) ? requested : (themes[0]?.name ?? ""),
  };

  const components = discoverDocsComponents(registryRoot);
  // A name can exist in two layers (`empty-state` is both a primitive and a
  // pattern), so page paths are layer-scoped and this lookup — used only to link
  // `composition.contains`/`used_in`, which name a component without its layer —
  // resolves to the first match in layer order (primitive wins).
  const byName = new Map<string, DocsComponent>();
  for (const c of components) if (!byName.has(c.name)) byName.set(c.name, c);
  const tokenList = parseTokenReference(registryRoot);
  const tokens = new Map(tokenList.map((t) => [t.name, t]));

  const files: SiteFile[] = [];

  // Example pages first — a component page links its example, and only emits the
  // frame when one was actually produced. The copy-for-agents payload comes from
  // the same reference fragment, so the two are produced together: a component
  // with no reference markup gets neither.
  const examples = new Map<string, SiteFile>();
  const snippets = new Map<string, string>();
  const overlayPreview = options.overlayPreview ?? true;
  for (const c of components) {
    const example = renderExamplePage(c, config, overlayPreview);
    if (!example) continue;
    examples.set(c.examplePath, example);
    snippets.set(
      c.pagePath,
      renderAgentSnippet({
        name: c.name,
        fragment: sanitizeReferenceFragment(readText(c.referencePath)),
        pin,
        theme: config.theme,
        siteTitle: config.title,
      }),
    );
  }

  const authoredHome = join(siteRoot, "content", "home.html");
  files.push(
    renderHomePage({
      config,
      components,
      themes,
      authored: existsSync(authoredHome) ? readText(authoredHome).trim() : "",
      tokenCount: tokenList.length,
    }),
  );
  files.push(renderComponentIndex({ config, components, themes, registryRoot }));
  files.push(renderIconPage({ config, components, themes }));
  files.push(renderTypographyPage({ config, components, themes, tokenList }));
  files.push(renderTokenPage({ config, components, themes, tokenList }));

  const authoredResponsive = join(siteRoot, "content", "responsive.html");
  files.push(
    renderResponsivePage({
      config,
      components,
      themes,
      authored: existsSync(authoredResponsive) ? readText(authoredResponsive).trim() : "",
    }),
  );

  // The layout guide reads its archetypes out of `docs/layout.md` — the doc is
  // the source, this page is a rendering of it (task 0.8-12).
  const layoutDoc = join(packageRoot, "docs", "layout.md");
  files.push(
    renderLayoutPage({
      config,
      components,
      themes,
      archetypes: existsSync(layoutDoc) ? parseArchetypes(readText(layoutDoc)) : [],
    }),
  );

  // The reactive engine (task 1.0R-09). The vocabulary tables come out of the
  // engine's §3.0 declarations through the same parsers the skill uses, so the
  // site and `references/directives.md` cannot describe two different engines.
  const authoredEngine = join(siteRoot, "content", "engine.html");
  files.push(
    renderEnginePage({
      config,
      components,
      themes,
      authored: existsSync(authoredEngine) ? readText(authoredEngine).trim() : "",
      engine: readEngineVocabulary(packageRoot),
      plugins: loadPluginMetadata(join(registryRoot, "core", "plugins")),
    }),
  );

  // The frozen protocol (task 1.0-01). The normative tables come from
  // `src/protocol.ts`; the examples come from the spec document itself, so the
  // page renders exactly the markup the test suite audits.
  const specDoc = join(packageRoot, SPEC_FILE);
  files.push(
    renderSpecPage({
      config,
      components,
      themes,
      examples: existsSync(specDoc) ? parseSpecExamples(readText(specDoc)) : [],
    }),
  );

  // The migration guide (task 1.0-03). The rename and the procedure come from
  // `src/migration.ts`; the per-break prose is the document's own, parsed by
  // marker — so the page cannot document a break the guide does not, and the
  // suite already fails if the guide misses one the registry ships.
  const migrationDoc = join(packageRoot, MIGRATION_DOC_FILE);
  const hasMigrationDoc = existsSync(migrationDoc);
  files.push(
    renderMigrationPage({
      config,
      components,
      themes,
      breaking: collectBreakingChanges(registryRoot),
      documented: hasMigrationDoc ? parseMigrationDoc(readText(migrationDoc)) : [],
      hasDocument: hasMigrationDoc,
    }),
  );

  const authoredSpacing = join(siteRoot, "content", "spacing.html");
  files.push(
    renderSpacingPage({
      config,
      components,
      themes,
      authored: existsSync(authoredSpacing) ? readText(authoredSpacing).trim() : "",
      tokenList,
    }),
  );

  const authoredDensity = join(siteRoot, "content", "density.html");
  files.push(
    renderDensityPage({
      config,
      components,
      themes,
      authored: existsSync(authoredDensity) ? readText(authoredDensity).trim() : "",
      tokenList,
      densityTokens: parseDensityReference(registryRoot),
    }),
  );

  const authoredSeed = join(siteRoot, "content", "playground.html");
  files.push(
    renderPlaygroundPage({
      config,
      components,
      themes,
      seed: existsSync(authoredSeed) ? readText(authoredSeed).trim() : DEFAULT_PLAYGROUND_SEED,
    }),
  );

  if (themes.length > 0) {
    files.push(renderThemeGalleryPage({ config, components, themes }));
    for (const t of themes) {
      files.push(renderThemePreviewPage({ theme: t, config, byName, tokenList }));
    }
  }

  // The scaffold gallery (task 1.0R-08). Driven by SCAFFOLD_NAMES — the CLI's own
  // catalogue — so registering a sixth scaffold publishes its page, its frame,
  // its payload, its nav entry and its sitemap row with no edit here and none
  // under `site/`.
  const scaffoldDefs = SCAFFOLD_NAMES.map((name) => SCAFFOLDS[name]);
  files.push(renderScaffoldGalleryPage({ config, components, themes, defs: scaffoldDefs }));
  for (const def of scaffoldDefs) {
    files.push(renderScaffoldFrame({ def, config, themes, registryRoot }));
    const snippet = renderScaffoldSnippet({ def, config, themes, registryRoot, pin });
    files.push({ path: scaffoldSnippetPath(def.name), content: snippet });
    files.push(
      renderScaffoldPage({ def, config, components, byName, themes, snippet, pin }),
    );
  }

  for (const c of components) {
    files.push(
      renderComponentPage(c, {
        config,
        components,
        byName,
        tokens,
        themes,
        hasExample: examples.has(c.examplePath),
        snippet: snippets.get(c.pagePath) ?? null,
        pin,
      }),
    );
  }
  files.push(...examples.values());

  // Agent surfaces (task 0.7-15): the machine files at their stable URLs, the
  // page that documents them, the copy-for-agents payloads as files, and the
  // static-host header rules generated from that same list.
  const machine = buildMachineFiles({ registryRoot, packageRoot, components, config });
  files.push(...machine.map(({ path, content }) => ({ path, content })));
  for (const c of components) {
    const snippet = snippets.get(c.pagePath);
    if (snippet) files.push({ path: snippetPath(c.layer, c.name), content: snippet });
  }
  const firstSnippet = components.find((c) => snippets.has(c.pagePath));
  files.push(
    renderAgentsPage({
      config,
      components,
      themes,
      machine,
      pin,
      exampleSnippet: firstSnippet ? snippetPath(firstSnippet.layer, firstSnippet.name) : null,
    }),
  );
  files.push(renderNotFoundPage({ config, components, themes }));
  files.push(renderDemoMessagesFile(siteRoot));
  files.push(renderHeadersFile(machine));

  files.push({
    path: "styles/faqir.css",
    content: buildSiteStylesheet(registryRoot, siteRoot, overlayPreview),
  });
  for (const t of themes) {
    files.push({ path: t.stylePath, content: buildThemeStylesheet(t) });
  }

  const corePath = join(registryRoot, "core", "faqir-core.js");
  if (existsSync(corePath)) {
    files.push({ path: "scripts/faqir-core.js", content: readText(corePath) });
  }

  // The manifests the playground audits against — the registry's own, verbatim
  // and complete. Trimming them to "just the fields the rules read" would make
  // CLI ↔ browser parity a property of this serializer instead of a property of
  // the shared engine, so nothing is trimmed. Keyed `layer/name` because a name
  // can exist in two layers; `createAuditor` re-keys by the manifest's own name.
  files.push({
    path: "scripts/faqir-manifests.js",
    content: renderManifestsScript(components, registryRoot),
  });

  for (const name of SITE_SCRIPTS) {
    const path = join(siteRoot, "lib", name);
    if (existsSync(path)) files.push({ path: `scripts/${name}`, content: readText(path) });
  }

  // Signposts for retired URLs (task 1.0R-09). Emitted last of the pages so the
  // titles they link by are already built, and filtered out of the sitemap
  // below: a retired URL resolves, it is not advertised.
  const titles = new Map<string, string>([
    [RESPONSIVE_PAGE, "The responsive lab"],
    [LAYOUT_PAGE, "The layout guide"],
  ]);
  for (const entry of RETIRED_PAGES) {
    files.push(renderRetiredPage({ entry, config, components, themes, titles }));
  }

  const publicPages = files
    .filter((file) => isShellPage(file.path) && !isRetiredPage(file.path))
    .map((file) => file.path);
  files.push(renderRobotsFile(config));
  files.push(renderSitemapFile(config, publicPages));

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Every manifest as one global, as a plain script (not JSON + `fetch`): a
 * `<script src>` works from `file://` and from any static host, and the audit
 * therefore needs no network at all — which is the difference between "runs
 * client-side" and "calls an endpoint".
 */
function renderManifestsScript(components: DocsComponent[], registryRoot: string): string {
  const payload: Record<string, Manifest> = {};
  // Written in discovery order — primitives, then recipes, then patterns, each
  // sorted by name. That is deterministic (the idempotence gate) AND it is the
  // order `runAudit` loads manifests in, which decides who wins when a name ships
  // in two layers (`empty-state`). `manifestMap` in the browser preserves it.
  for (const c of components) payload[`${c.layer}/${c.name}`] = c.manifest;
  // The same list `faqir audit` decides `unknown-component` from, from the same
  // function — not a second derivation that could disagree with the CLI.
  const values = knownUiValues(registryRoot);
  return (
    `/* ${DOCS_GENERATION_MARKER} — ${
      Object.keys(payload).length
    } manifests, verbatim from the registry, and the ${values.length} data-ui values it defines */\n` +
    `window.${MANIFESTS_GLOBAL} = ${JSON.stringify(payload)};\n` +
    `window.${UI_VALUES_GLOBAL} = ${JSON.stringify(values)};\n`
  );
}

/** Fallback playground sample, used only when `site/content/playground.html` is absent. */
const DEFAULT_PLAYGROUND_SEED = `<div data-ui="card" data-variant="nope">\n  <div data-part="header">\n    <h3 data-part="title">Audit me</h3>\n  </div>\n</div>`;

/** Site-relative path prefix under which pages carry verbatim registry markup. */
export const EXAMPLE_PREFIX = "examples/";

/** True for the pages this generator authors end-to-end (the audit/axe gate set). */
export function isSitePage(path: string): boolean {
  return path.endsWith(".html") && !path.startsWith(EXAMPLE_PREFIX);
}

/** True for the pages that wrap a registry reference fragment verbatim. */
export function isExamplePage(path: string): boolean {
  return path.endsWith(".html") && path.startsWith(EXAMPLE_PREFIX);
}

/**
 * True for a site page rendered inside an `<iframe>` rather than navigated to.
 * Frame documents carry the same audit + axe gate as every other site page — they
 * are generator-authored markup — but no navigation shell, for the same reason
 * `examples/**` carry none: there is nowhere to navigate from inside a frame.
 */
export function isFramePage(path: string): boolean {
  return path.endsWith(".html") && path.startsWith(FRAME_PREFIX);
}

/** True for the site pages that carry the `dashboard-shell` navigation. */
export function isShellPage(path: string): boolean {
  return isSitePage(path) && !isFramePage(path);
}

/**
 * True for a scaffold's live-document frame (task 1.0R-08).
 *
 * These are the one page class the generator emits whose `<body>` is not its own
 * markup: it is the page `faqir scaffold <name>` writes, composed verbatim out of
 * registry patterns. They carry the same audit + axe gate as every other site
 * page — an audit-clean scaffold is the whole claim — but their in-body `href`s
 * are the patterns' own placeholders (`#pricing`, `/`), pointing at an imaginary
 * host app, exactly as on an `examples/**` page.
 */
export function isScaffoldFramePage(path: string): boolean {
  return isFramePage(path) && basename(path).startsWith("scaffold-");
}
