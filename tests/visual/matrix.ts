/**
 * Visual-regression matrix — generated from the registry at runtime (task 0.4-23,
 * FAQIR-PLAN §12.2 / FAQIR-NEXT §12.2).
 *
 * This module is the single source of truth for *what* the screenshot suite
 * captures. It scans the registry on disk — the reference `.html` files and the
 * theme `.css` files — and produces the full cross-product:
 *
 *     every component  ×  every theme  ×  { light, dark }  ×  { ltr, rtl }
 *
 * Adding a component (a new `registry/{primitives,recipes,patterns}/<name>/<name>.html`)
 * or a theme (`registry/themes/<name>.css`) grows the matrix automatically — the
 * Playwright spec and the CI job need **zero** edits. That is the whole point:
 * there is no hand-maintained gallery to drift from the registry.
 *
 * Deliberately dependency-free (only `node:fs` / `node:path`) so it runs
 * identically under Bun (the meta-test in `matrix.test.ts`) and under Node
 * (the Playwright runner in `visual.pw.ts`).
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..");
export const REGISTRY = join(ROOT, "registry");

/** Registry directories that ship shippable component reference pages. */
const COMPONENT_KINDS = ["primitives", "recipes", "patterns"] as const;
export type Kind = (typeof COMPONENT_KINDS)[number];

/** Colour schemes and text directions the matrix sweeps. */
export const SCHEMES = ["light", "dark"] as const;
export const DIRECTIONS = ["ltr", "rtl"] as const;
export type Scheme = (typeof SCHEMES)[number];
export type Direction = (typeof DIRECTIONS)[number];

export interface Component {
  /** Declared name from the `@ui:component` header (falls back to the dir name). */
  name: string;
  /** primitive | recipe | pattern (singular, from `@ui:kind`). */
  kind: string;
  /** Registry-relative path to the reference `.html`. */
  htmlRel: string;
  /** Absolute path to the reference `.html`. */
  htmlPath: string;
}

export interface Case {
  component: Component;
  theme: string;
  scheme: Scheme;
  dir: Direction;
  /** Stable, filesystem-safe id used as the snapshot filename (sans extension). */
  id: string;
}

// ── recursive .html walk ─────────────────────────────────────────────────────

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

function header(src: string, tag: string): string | null {
  const m = src.match(new RegExp(`<!--\\s*@ui:${tag}\\s+([^\\s>-][^>]*?)\\s*-->`));
  return m ? m[1].trim() : null;
}

// ── component discovery ──────────────────────────────────────────────────────

/**
 * Every shippable reference page under registry/{primitives,recipes,patterns}.
 * A file counts iff it carries an `@ui:component` header — the same marker the
 * docs and audit tooling key off — so a stray README-style `.html` can never be
 * silently swept into the matrix, and a real component can never be silently
 * skipped. Sorted for deterministic, reproducible ordering.
 */
export function discoverComponents(): Component[] {
  const found: Component[] = [];
  for (const kind of COMPONENT_KINDS) {
    const base = join(REGISTRY, kind);
    if (!existsSync(base)) continue;
    for (const htmlPath of walkHtml(base)) {
      const src = readFileSync(htmlPath, "utf8");
      const name = header(src, "component");
      if (!name) continue; // not a component reference page
      found.push({
        name,
        kind: header(src, "kind") ?? kind.replace(/s$/, ""),
        htmlRel: htmlPath.slice(ROOT.length + 1),
        htmlPath,
      });
    }
  }
  return found.sort((a, b) => a.htmlRel.localeCompare(b.htmlRel));
}

// ── theme discovery ──────────────────────────────────────────────────────────

/**
 * Every theme is a `registry/themes/<name>.css`. Each file is self-contained for
 * both schemes (a `:root`/light block and a `[data-theme="dark"]` block), so the
 * scheme axis is driven purely by the `data-theme` attribute on <html>.
 */
export function discoverThemes(): string[] {
  const dir = join(REGISTRY, "themes");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".css") && !f.endsWith(".preview.css"))
    .map((f) => basename(f, ".css"))
    .sort();
}

// ── the matrix ───────────────────────────────────────────────────────────────

export function buildMatrix(): Case[] {
  const components = discoverComponents();
  const themes = discoverThemes();
  const cases: Case[] = [];
  for (const component of components) {
    for (const theme of themes) {
      for (const scheme of SCHEMES) {
        for (const dir of DIRECTIONS) {
          cases.push({
            component,
            theme,
            scheme,
            dir,
            id: `${component.kind}__${component.name}__${theme}__${scheme}__${dir}`,
          });
        }
      }
    }
  }
  return cases;
}

// ── page assembly ────────────────────────────────────────────────────────────

// Token load order is authoritative: it mirrors registry/tokens/index.css.
const TOKEN_ORDER = [
  "palette",
  "spacing",
  "typography",
  "effects",
  "motion",
  "semantic",
  "aliases",
  "document",
  "doc-aliases",
];
const BASE_ORDER = ["reset", "prose", "motion-presets"];

function read(rel: string): string {
  return readFileSync(join(REGISTRY, rel), "utf8");
}

/** All component stylesheets, so every reference page renders regardless of
 *  which primitives a recipe/pattern happens to compose. Cached. */
let _componentCss: string | null = null;
function componentCss(): string {
  if (_componentCss !== null) return _componentCss;
  const parts: string[] = [];
  for (const kind of COMPONENT_KINDS) {
    const base = join(REGISTRY, kind);
    if (!existsSync(base)) continue;
    const cssFiles: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const full = join(d, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (e.endsWith(".css")) cssFiles.push(full);
      }
    };
    walk(base);
    for (const f of cssFiles.sort()) parts.push(readFileSync(f, "utf8"));
  }
  _componentCss = parts.join("\n");
  return _componentCss;
}

/** tokens + base, cached (theme is the only per-case variable). */
let _foundationCss: string | null = null;
function foundationCss(): string {
  if (_foundationCss !== null) return _foundationCss;
  const tokens = TOKEN_ORDER.map((n) => read(`tokens/${n}.css`)).join("\n");
  const base = BASE_ORDER.filter((n) => existsSync(join(REGISTRY, "base", `${n}.css`)))
    .map((n) => read(`base/${n}.css`))
    .join("\n");
  _foundationCss = `${tokens}\n${base}`;
  return _foundationCss;
}

// A deterministic 96×96 grey placeholder — the reference pages point <img> at
// example.com URLs (and one bare "cover.jpg"). Those would hit the network and
// render a browser-specific broken-image glyph, so we swap every non-data src
// for this inline SVG: no requests, identical pixels every run.
const IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='96'%20height='96'%3E%3Crect%20width='96'%20height='96'%20fill='%23c7c7c7'/%3E%3C/svg%3E";

/** Strip @ui:* authoring comments and neutralise external image sources. */
export function sanitizeFragment(html: string): string {
  return html
    .replace(/<!--\s*@ui:[^]*?-->/g, "")
    .replace(/(\bsrc\s*=\s*)(["'])(?!\s*data:)[^"']*\2/gi, `$1$2${IMG_PLACEHOLDER}$2`);
}

/**
 * A complete, standalone HTML document for one matrix case: the full framework
 * CSS (tokens + base + the theme under test + every component stylesheet) inlined
 * so nothing touches the network, with `data-theme` and `dir` on <html> and the
 * sanitized reference fragment mounted in <main>. No controller JS is loaded —
 * pages are captured in their authored, static default state, which is exactly
 * what makes the screenshot deterministic.
 */
export function buildPageHtml(c: Case): string {
  const fragment = sanitizeFragment(readFileSync(c.component.htmlPath, "utf8"));
  const themeCss = read(`themes/${c.theme}.css`);
  const css = `${foundationCss()}\n/* theme: ${c.theme} */\n${themeCss}\n/* components */\n${componentCss()}`;
  return `<!DOCTYPE html>
<html lang="en" data-theme="${c.scheme}" dir="${c.dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${c.id}</title>
<style>${css}</style>
<style>
  html, body { margin: 0; }
  body { padding: 24px; background: var(--color-bg); color: var(--color-fg); }
  main.vr-root { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
</style>
</head>
<body>
<main class="vr-root">
${fragment}
</main>
</body>
</html>`;
}

/**
 * Assemble a registry reference fragment for paged-media tests. Unlike
 * `buildPageHtml`, this intentionally adds no screen-preview padding or flex
 * layout: Chromium must hand the authored document and its `@page` rules to the
 * PDF renderer without test-harness geometry affecting pagination.
 */
export function buildPrintReferencePageHtml(
  fragment: string,
  title: string,
): string {
  const theme = "document";
  const themeCss = read(`themes/${theme}.css`);
  const css = `${foundationCss()}\n/* theme: ${theme} */\n${themeCss}\n/* components */\n${componentCss()}`;
  return `<!DOCTYPE html>
<html lang="en" data-theme="light" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<main>
${sanitizeFragment(fragment)}
</main>
</body>
</html>`;
}
