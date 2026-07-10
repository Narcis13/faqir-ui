#!/usr/bin/env node
/**
 * Icon system build (task 0.4-04 · §B4).
 *
 * Ingests the curated Lucide (ISC) SVG subset vendored under
 * `scripts/icons/lucide/*.svg`, optimizes each glyph, and emits the three
 * shipped artifacts of the `icon` primitive:
 *
 *   registry/primitives/icon/icons.css          — base rule + one `--icon`
 *                                                  data-URI rule per name
 *   registry/primitives/icon/icon.manifest.json — schema-valid manifest whose
 *                                                  `variants.icon.values` enumerate
 *                                                  every icon name
 *   registry/primitives/icon/icon.html          — reference page: the full grid,
 *                                                  colored by `currentColor`
 *
 * Icons render with **zero JavaScript and zero web requests**: each glyph is a
 * `mask-image` data-URI on a `background-color: currentColor` box, so it inherits
 * text color and sizes with `font-size` (`1em`).
 *
 * The curated name list lives in the checked-in `scripts/icons/curated-icons.txt`
 * (one name per line; `#` comments and blanks ignored). To change the set: edit
 * that list, vendor any new SVGs into `scripts/icons/lucide/`, and re-run this
 * script (`node scripts/build-icons.mjs` / `bun run build:icons`).
 *
 * DETERMINISM: the emitted `icons.css` is a pure function of (curation list +
 * vendored SVGs). Names are sorted, whitespace is normalized, and there is no
 * timestamp or environment-dependent output — same inputs → byte-identical
 * `icons.css`. The pure builders (parseCurationList / optimizeSvg /
 * encodeSvgDataUri / buildIconsCss / buildIconManifest / buildReferenceHtml) are
 * exported and unit-tested independently of the filesystem.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SVG_DIR = join(ROOT, "scripts", "icons", "lucide");
export const CURATION_LIST = join(ROOT, "scripts", "icons", "curated-icons.txt");
export const OUT_DIR = join(ROOT, "registry", "primitives", "icon");

/** Provenance of the vendored icon set — the single source of truth for attribution. */
export const ICON_SET = {
  source: "lucide",
  homepage: "https://lucide.dev",
  package: "lucide-static@1.24.0",
  license: "ISC",
  version: "1.24.0",
  attribution_file: "LICENSE.lucide",
};

// ── Pure builders (no I/O) ──────────────────────────────────────────────────

/**
 * Parse the curation list text into a sorted, de-duplicated array of icon names.
 * Blank lines and `#` comments are ignored. Sorting makes the downstream output
 * order-independent of how the list is written.
 */
export function parseCurationList(text) {
  const names = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    names.push(line);
  }
  return [...new Set(names)].sort();
}

/**
 * Reduce a raw Lucide SVG to the minimal glyph needed for a CSS mask: a single
 * `<svg>` carrying the standard Lucide stroke presentation (24×24 viewBox,
 * `fill="none"`, `stroke="currentColor"`, width 2, round caps/joins) wrapping the
 * original drawing elements (path/circle/line/rect/polyline/… preserved verbatim).
 *
 * Drops the `class`, `width`, `height`, `xmlns` bloat and collapses whitespace.
 * `xmlns` is re-added canonically so the data-URI parses as a standalone image.
 * The color is irrelevant to the mask (only the alpha channel is sampled), but a
 * concrete `currentColor` stroke keeps the SVG independently renderable.
 *
 * Pure and deterministic: identical input → identical output.
 */
export function optimizeSvg(rawSvg, name = "icon") {
  // Strip the leading `<!-- @license … -->` banner and any XML/DOCTYPE prologue.
  const withoutComments = rawSvg.replace(/<!--[\s\S]*?-->/g, "");
  const match = withoutComments.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!match) throw new Error(`build-icons: ${name}: no <svg> element found`);

  const openAttrs = match[1];
  const vbMatch = openAttrs.match(/viewBox\s*=\s*"([^"]+)"/i);
  const viewBox = vbMatch ? vbMatch[1].trim() : "0 0 24 24";

  const inner = match[2]
    .replace(/>\s+</g, "><") // drop whitespace between elements
    .replace(/\s*\/>/g, "/>") // tidy self-closing tags
    .replace(/\s{2,}/g, " ") // collapse runs of whitespace within a tag
    .trim();

  if (!inner) throw new Error(`build-icons: ${name}: <svg> has no drawing elements`);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ` +
    `fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  );
}

/**
 * Encode an SVG string as a `data:image/svg+xml,…` URI suitable for `url()` in
 * CSS. Uses single quotes for attributes (so the value can sit inside a
 * double-quoted `url("…")`) and percent-encodes only the characters that must be
 * escaped — `%` first so the escapes it introduces aren't double-encoded. Spaces
 * are left intact: valid inside a quoted `url()` and smaller than `%20`.
 *
 * Round-trips: `decodeURIComponent(uri.slice("data:image/svg+xml,".length))`
 * with `'`→`"` yields parseable SVG.
 */
export function encodeSvgDataUri(svg) {
  const normalized = svg
    .replace(/"/g, "'")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
  const encoded = normalized
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/&/g, "%26")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
  return `data:image/svg+xml,${encoded}`;
}

/** name + raw SVG → `{ name, dataUri }`. */
export function buildIconEntry(name, rawSvg) {
  return { name, dataUri: encodeSvgDataUri(optimizeSvg(rawSvg, name)) };
}

/**
 * Assemble the full `icons.css`: a header banner, the `[data-ui="icon"]` base
 * rule (mask / currentColor / 1em sizing), and one `[data-icon="…"]` rule per
 * entry that sets the `--icon` custom property to the glyph's data-URI.
 *
 * `entries` must already be sorted by name (buildIconEntries guarantees this).
 */
export function buildIconsCss(entries) {
  const header = [
    "/* @ui:component icon */",
    "/* @ui:tokens */ /* none — icons inherit color (currentColor) and size (1em) from context, by design */",
    `/* Generated by scripts/build-icons.mjs from scripts/icons/curated-icons.txt — DO NOT EDIT BY HAND. */`,
    `/* Icons: Lucide (${ICON_SET.license}) · ${ICON_SET.package} · ${ICON_SET.homepage} · attribution: ${ICON_SET.attribution_file} */`,
  ].join("\n");

  const base = [
    "",
    "/* ── Base ── */",
    '[data-ui="icon"] {',
    "  display: inline-block;",
    "  width: 1em;",
    "  height: 1em;",
    "  flex-shrink: 0;",
    "  vertical-align: -0.125em;",
    "  background-color: currentColor;",
    "  -webkit-mask: var(--icon) center / contain no-repeat;",
    "  mask: var(--icon) center / contain no-repeat;",
    "}",
  ].join("\n");

  const glyphs = [
    "",
    `/* ── Glyphs (${entries.length}) ── */`,
    ...entries.map((e) => `[data-icon="${e.name}"] { --icon: url("${e.dataUri}"); }`),
  ].join("\n");

  return `${header}\n${base}\n${glyphs}\n`;
}

/**
 * Build the schema-valid `icon.manifest.json`. Every icon name is enumerated as
 * `variants.icon.values` (attr `data-icon`) so agents can enumerate and validate
 * icon usage "like any variant" (§B4). Deterministic given a sorted `names`.
 */
export function buildIconManifest(names) {
  return {
    name: "icon",
    version: "1.0.0",
    kind: "primitive",
    category: "data-display",
    description:
      "CSS-only icon: a data-URI SVG rendered via mask-image on a currentColor box. " +
      "Inherits text color and sizes with font-size (1em). data-icon selects the glyph " +
      "from a curated Lucide (ISC) subset. Zero JavaScript, zero web requests.",
    anatomy: {
      tag: "span",
      selector: "[data-ui='icon']",
      content_model: "text",
    },
    slots: {},
    variants: {
      icon: {
        values: names,
        default: "circle",
        attr: "data-icon",
        applied_to: "root",
      },
    },
    states: {},
    props: {
      name: {
        type: "enum",
        values: names,
        default: "circle",
        description: "Icon glyph name (data-icon). Must be one of variants.icon.values.",
      },
    },
    a11y: {
      keyboard: {},
      // No unconditionally-required attribute: an icon is either decorative
      // (aria-hidden="true") or meaningful (role="img" + aria-label). Guidance
      // lives in a11y_notes so the audit's required-attr parser stays quiet.
      a11y_notes: [
        'Decorative icon: add aria-hidden="true" (it repeats adjacent text or is purely ornamental).',
        'Meaningful icon: add role="img" and an aria-label describing it.',
      ],
    },
    tokens_used: [],
    templates: {
      html: '<span data-ui="icon" data-icon="{name}" aria-hidden="true"></span>',
      html_labeled: '<span data-ui="icon" data-icon="{name}" role="img" aria-label="{label}"></span>',
    },
    safe_transforms: ["change-icon", "size-via-font-size", "color-via-color", "toggle-decorative-vs-labeled"],
    unsafe_transforms: ["remove-data-icon", "replace-mask-with-inline-svg", "hardcode-color"],
    composition: {
      contains: [],
      used_in: [],
    },
    files: {
      html: "icon.html",
      css: "icons.css",
      manifest: "icon.manifest.json",
    },
    tests: [
      "renders-as-span",
      "base-rule-is-mask-currentColor-1em",
      "every-manifest-name-has-a-css-rule",
      "data-uris-are-valid-and-escaped",
    ],
    icon_set: { ...ICON_SET, count: names.length },
  };
}

/**
 * Build the reference page: the full grid of every icon, each a labeled
 * `[data-ui="icon"]` box colored by `currentColor`. Plain (non-`data-ui`)
 * wrappers keep the page audit-clean; the layout uses rem/token values only (no
 * hardcoded px or colors) so the `token-aware-style` rule stays quiet.
 */
export function buildReferenceHtml(names) {
  const variantsComment = `<!-- @ui:variants icon=${names.join("|")} -->`;
  const cells = names
    .map(
      (n) =>
        `  <figure style="display:flex; flex-direction:column; align-items:center; gap:0.5rem; margin:0; padding:0.75rem; text-align:center">\n` +
        `    <span data-ui="icon" data-icon="${n}" role="img" aria-label="${n}" style="font-size:1.5rem"></span>\n` +
        `    <figcaption style="font-size:0.75rem; color:var(--color-fg-muted)">${n}</figcaption>\n` +
        `  </figure>`,
    )
    .join("\n");

  return (
    `<!-- @ui:component icon -->\n` +
    `<!-- @ui:kind primitive -->\n` +
    `<!-- @ui:slots -->\n` +
    `${variantsComment}\n` +
    `<!-- Generated by scripts/build-icons.mjs — the full curated grid (${names.length} icons). -->\n` +
    `<!-- Every glyph is a CSS mask colored by currentColor; set color/font-size on an ancestor to restyle. -->\n\n` +
    `<section aria-label="Faqir icon set" style="color:var(--color-fg)">\n` +
    `  <p style="font-size:0.875rem; color:var(--color-fg-muted)">${names.length} icons · Lucide (${ICON_SET.license}) · rendered from CSS alone · colored by currentColor</p>\n` +
    `  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(6rem, 1fr)); gap:0.5rem">\n` +
    `${cells}\n` +
    `  </div>\n` +
    `</section>\n`
  );
}

// ── Filesystem layer ────────────────────────────────────────────────────────

/** Read + optimize + encode every curated icon, sorted by name. Throws on a missing SVG. */
export function buildIconEntries(names, svgDir = SVG_DIR) {
  return names.map((name) => {
    const svgPath = join(svgDir, `${name}.svg`);
    if (!existsSync(svgPath)) {
      throw new Error(
        `build-icons: vendored SVG missing for "${name}" (${svgPath}). ` +
          `Vendor it into scripts/icons/lucide/ or remove it from curated-icons.txt.`,
      );
    }
    return buildIconEntry(name, readFileSync(svgPath, "utf8"));
  });
}

/** Human-readable byte size, e.g. 13741 → "13.42 KB". */
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(2)} KB`;
}

/**
 * Run the whole build against the vendored inputs and write the three artifacts.
 * Returns the emitted strings + size stats (used by the CLI to print a report).
 */
export function buildIcons({ svgDir = SVG_DIR, curationList = CURATION_LIST, outDir = OUT_DIR, write = true } = {}) {
  const names = parseCurationList(readFileSync(curationList, "utf8"));
  if (names.length === 0) throw new Error(`build-icons: curation list ${curationList} is empty`);

  const entries = buildIconEntries(names, svgDir);
  const css = buildIconsCss(entries);
  const manifest = buildIconManifest(names);
  const html = buildReferenceHtml(names);
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

  if (write) {
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "icons.css"), css);
    writeFileSync(join(outDir, "icon.manifest.json"), manifestJson);
    writeFileSync(join(outDir, "icon.html"), html);
  }

  const bytes = Buffer.byteLength(css);
  return {
    names,
    css,
    manifest,
    manifestJson,
    html,
    stats: { count: names.length, cssBytes: bytes, cssGzipBytes: gzipSync(Buffer.from(css)).length },
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (invokedDirectly) {
  try {
    const { stats } = buildIcons({ write: true });
    // Sanity: the vendored SVG directory should hold exactly the curated set.
    const vendored = readdirSync(SVG_DIR).filter((f) => f.endsWith(".svg")).length;
    console.log(`▶ build-icons — ${stats.count} icons`);
    console.log(`  wrote registry/primitives/icon/{icons.css, icon.manifest.json, icon.html}`);
    console.log(`  icons.css: ${formatBytes(stats.cssBytes)} raw · ${formatBytes(stats.cssGzipBytes)} gzip`);
    if (vendored !== stats.count) {
      console.log(`  note: ${vendored} SVG(s) vendored vs ${stats.count} curated (extras are ignored).`);
    }
    console.log(`✓ done.`);
  } catch (e) {
    process.stderr.write(`✗ build-icons failed: ${e.message}\n`);
    process.exit(1);
  }
}
