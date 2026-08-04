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
//   layouts/index.html                responsive layout doctrine + live labs
//   playground/index.html             live in-browser audit playground (task 0.7-14)
//   themes/index.html                 theme gallery + instant switcher (task 0.7-14)
//   agents/index.html                 the machine surfaces, documented (task 0.7-15)
//   examples/<layer>/<name>.html      one standalone live example per component
//   frames/theme-preview-<name>.html  the demo document each gallery frame renders
//   llms.txt · llms-full.txt          full-registry agent context (llmstxt.org)
//   manifest.schema.json              the manifest contract, at its own `$id` path
//   registry-index.json               the remote-registry index (`faqir add --registry`)
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
import { BREAKPOINT_LIST, TIERS, responsiveAttribute } from "../utils/breakpoints";
import {
  ARCHETYPES,
  LAYOUT_MECHANISMS,
  LAYOUT_PRIMITIVES,
  LAYOUT_RULES,
  MEASURE_TOKENS,
  RESPONSIVE_GRAMMAR,
  RHYTHM_TOKENS,
  RHYTHM_REJECTED,
  rhythmLine,
  parseArchetypes,
  type ParsedArchetype,
} from "../utils/layout";
import type { ThemeManifest } from "../theme-manifest";
// The playground's rule legend is derived from the engine's own rule lists, so it
// cannot describe a rule the shipped browser bundle does not run.
import { ALL_RULES, DOCUMENT_RULES } from "../audit/rules";
// The hosted llms.txt pair is the CLI's own `--format llms` generator pointed at
// the whole registry instead of at one project (task 0.7-15).
import { formatContextLlms, formatContextLlmsFull } from "./context";
import { buildRegistryContext } from "./registry-context";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repository root — `src/generator/` is two levels down. */
export const PACKAGE_ROOT = join(HERE, "..", "..");

/** Stable, grep-able marker proving a page came out of this generator. */
export const DOCS_GENERATION_MARKER = "GENERATED by faqir · manifest-derived docs site";

/** The in-browser audit playground (task 0.7-14). */
export const PLAYGROUND_PAGE = "playground/index.html";
/** The theme gallery + instant switcher (task 0.7-14). */
export const THEMES_PAGE = "themes/index.html";
/** Responsive layout doctrine and live resize demonstrations. */
export const LAYOUTS_PAGE = "layouts/index.html";

/** Site-relative path prefix for generator-authored documents rendered in a frame. */
export const FRAME_PREFIX = "frames/";

/** The page documenting the agent-facing URLs below (task 0.7-15). */
export const AGENTS_PAGE = "agents/index.html";

/** The layout guide: the doctrine, the ladder and the archetypes (task 0.8-12). */
export const LAYOUT_PAGE = "layout/index.html";

/**
 * The site's **machine contract**: four files an agent or a tool fetches by URL
 * rather than reads as a page (task 0.7-15, §8.2/§9.2). These paths are stable —
 * `tests/generator/docs-agents.test.ts` hard-codes them, so moving one fails CI
 * rather than silently 404-ing something already published in a prompt.
 *
 * `manifest.schema.json` sits at the root because that is literally its `$id`
 * (`https://faqir.dev/manifest.schema.json`); a `$ref` in any manifest resolves
 * to it, which is the one path here that is not a convention but an identifier.
 */
export const LLMS_INDEX_FILE = "llms.txt";
export const LLMS_FULL_FILE = "llms-full.txt";
export const SCHEMA_FILE = "manifest.schema.json";
export const REGISTRY_INDEX_FILE = "registry-index.json";

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
}

export interface SiteConfig {
  title: string;
  tagline: string;
  description: string;
  theme: string;
  footer: string;
}

const DEFAULT_SITE_CONFIG: SiteConfig = {
  title: "Faqir UI",
  tagline: "The agent-native UI framework",
  description: "Manifest-driven, zero-dependency UI components documented from their own manifests.",
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
  const currentAttr = (key: string) => (key === current ? ' aria-current="page"' : "");
  const themeLink = renderThemeLink(pagePath, config.theme);
  const scripts = ["scripts/gallery.js", ...(input.scripts ?? [])].filter(
    (src, index, list) => list.indexOf(src) === index,
  );

  const groups = LAYERS.map((layer) => ({
    layer,
    items: components.filter((c) => c.layer === layer),
  })).filter((g) => g.items.length > 0);

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
        : section === "layouts"
          ? current === LAYOUT_PAGE || current === LAYOUTS_PAGE
          : section === "themes"
            ? current === THEMES_PAGE
            : section === "agents"
              ? current === AGENTS_PAGE
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
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="website">
<meta property="og:title" content="${escAttr(input.title)}">
<meta property="og:description" content="${escAttr(input.description)}">
<meta name="twitter:card" content="summary">
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
        <a data-part="nav-item" href="${u(LAYOUT_PAGE)}"${currentAttr(
          LAYOUT_PAGE,
        )}>Layout guide</a>
        <a data-part="nav-item" href="${u(LAYOUTS_PAGE)}"${currentAttr(
          LAYOUTS_PAGE,
        )}>Responsive lab</a>
        <a data-part="nav-item" href="${u("tokens/index.html")}"${currentAttr(
          "tokens/index.html",
        )}>Design tokens</a>
        <a data-part="nav-item" href="${u(THEMES_PAGE)}"${currentAttr(
          THEMES_PAGE,
        )}>Theme gallery</a>
        <a data-part="nav-item" href="${u(PLAYGROUND_PAGE)}"${currentAttr(
          PLAYGROUND_PAGE,
        )}>Audit playground</a>
        <a data-part="nav-item" href="${u(AGENTS_PAGE)}"${currentAttr(
          AGENTS_PAGE,
        )}>For agents</a>
      </div>
      <div data-docs-nav-groups>
${navGroups}
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
      <a data-part="link"${topActive("layouts")} href="${u(LAYOUT_PAGE)}">Layouts</a>
      <a data-part="link"${topActive("themes")} href="${u(THEMES_PAGE)}">Themes</a>
      <a data-part="link"${topActive("agents")} href="${u(AGENTS_PAGE)}">For agents</a>
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

/** The authored responsive-layout lab, in the same generated navigation shell. */
function renderLayoutsPage(ctx: {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  authored: string;
}): SiteFile {
  const pagePath = LAYOUTS_PAGE;
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

function renderExamplePage(c: DocsComponent, config: SiteConfig): SiteFile | null {
  if (!existsSync(c.referencePath)) return null;
  const fragment = sanitizeReferenceFragment(readText(c.referencePath));
  const u = (to: string) => escAttr(relUrl(c.examplePath, to));
  const mounted = mountExample(fragment, c.name);

  return {
    path: c.examplePath,
    content: `<!DOCTYPE html>
<html lang="en" data-theme="auto" data-preview-role="component">
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

  const ruleRows = [
    ...ALL_RULES.map((r) => ({ ...r, scope: "component markup vs manifest" })),
    ...DOCUMENT_RULES.map((r) => ({ ...r, scope: "whole document" })),
  ].map((r) => [code(r.id), esc(r.severity), esc(r.scope), esc(r.description)]);

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
          "faqir audit --json          # the findings above, as JSON",
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
 * It deliberately shows **solid** component colour and bare token swatches, not
 * text on a tinted `-subtle` surface. That is not a layout preference: the
 * gallery's axe gate found `badge`'s soft variants (`--color-<sem>` text on
 * `--color-<sem>-subtle`) below WCAG AA in 10 of the 12 registry themes — this
 * frame is the first thing that ever rendered a component in every theme, and the
 * static `contrast-tokens` rule exempts those pairs on the premise that they carry
 * no text. Filed as task 0.7-19 with the measured ratios; the badge row belongs in
 * this frame the moment the pairs clear AA.
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
  // in any manifest resolves here.
  const schemaPath = join(ctx.packageRoot, SCHEMA_FILE);
  if (existsSync(schemaPath)) {
    files.push({
      path: SCHEMA_FILE,
      content: readText(schemaPath),
      contentType: "application/schema+json; charset=utf-8",
      description:
        "JSON Schema for component and theme manifests — the contract every manifest validates against.",
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
  return { path: HEADERS_FILE, content: lines.join("\n") };
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
  for (const c of components) {
    const example = renderExamplePage(c, config);
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
  files.push(renderComponentIndex({ config, components, themes }));
  files.push(renderTokenPage({ config, components, themes, tokenList }));

  const authoredLayouts = join(siteRoot, "content", "layouts.html");
  files.push(
    renderLayoutsPage({
      config,
      components,
      themes,
      authored: existsSync(authoredLayouts) ? readText(authoredLayouts).trim() : "",
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
  files.push(renderHeadersFile(machine));

  files.push({ path: "styles/faqir.css", content: buildSiteStylesheet(registryRoot, siteRoot) });
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
    content: renderManifestsScript(components),
  });

  for (const name of SITE_SCRIPTS) {
    const path = join(siteRoot, "lib", name);
    if (existsSync(path)) files.push({ path: `scripts/${name}`, content: readText(path) });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Every manifest as one global, as a plain script (not JSON + `fetch`): a
 * `<script src>` works from `file://` and from any static host, and the audit
 * therefore needs no network at all — which is the difference between "runs
 * client-side" and "calls an endpoint".
 */
function renderManifestsScript(components: DocsComponent[]): string {
  const payload: Record<string, Manifest> = {};
  // Written in discovery order — primitives, then recipes, then patterns, each
  // sorted by name. That is deterministic (the idempotence gate) AND it is the
  // order `runAudit` loads manifests in, which decides who wins when a name ships
  // in two layers (`empty-state`). `manifestMap` in the browser preserves it.
  for (const c of components) payload[`${c.layer}/${c.name}`] = c.manifest;
  return (
    `/* ${DOCS_GENERATION_MARKER} — ${
      Object.keys(payload).length
    } manifests, verbatim from the registry */\n` +
    `window.${MANIFESTS_GLOBAL} = ${JSON.stringify(payload)};\n`
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
