/**
 * Docs section: Server templates (`template/**`), the guide to
 * `@faqir-ui/template`.
 *
 * This section is the one part of the site whose pages are not written by the
 * generator. Each page is a `.faqir` file under `site/templates/pages/`, and
 * its body is what `render()` returns for it: the engine compiles the page with
 * the registry component table (`@faqir-ui/template/registry`) and a
 * `createFileLoader` (`@faqir-ui/template/node`) rooted at `site/templates/`,
 * then draws it with the data built below. The generator only wraps that output
 * in the site's shell, so the shell keeps one source (`renderShell`).
 *
 * The data is the section's own material, read and run, never restated:
 *
 *   - `ex` — every example under `examples/<page>/`, each a `.faqir` file and
 *     the JSON data beside it, compiled and rendered here. A page shows the
 *     source, the data and the HTML the engine wrote, so no example can drift
 *     from the engine;
 *   - `err` — every template under `errors/<page>/`, which must FAIL: its
 *     diagnostic (or render error) is captured at build time and shown, and a
 *     template that stops failing breaks the build;
 *   - `page`, `section`, `links`, `facts` — the page's own source, the
 *     section's page list (`site/templates/section.json`), relative links into
 *     the rest of the site, and numbers read out of the package.
 *
 * `tests/generator/docs-template.test.ts` re-renders every page and example
 * from its source and data and byte-compares the result with the built site.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compile } from "../../../packages/template/src/compile.js";
import { render } from "../../../packages/template/src/index.js";
import type { ComponentTable, Template } from "../../../packages/template/src/index.js";
// The package's `./node` and `./registry` entries, by their files.
import { createFileLoader } from "../../../packages/template/src/node.js";
import { components as registryTable } from "../../../packages/template/src/registry.js";
import { helpers as siteHelpers } from "../../../site/templates/helpers.js";
import { COMMAND_DEFINITIONS } from "../../command-registry";
import { PACKAGE_ROOT, pluginScriptPath, relUrl, renderShell, type SiteFile } from "../docs";
import type { PageContext } from "./context";

/** One entry of `site/templates/section.json`. */
export interface TemplateSectionPage {
  slug: string;
  path: string;
  label: string;
  title: string;
  description: string;
}

/** What compile and render take for one example, besides its source and data. */
export interface TemplateRunOptions {
  compile: { raw?: boolean };
  render: { maxSteps?: number; maxOutput?: number };
}

/** A rendered example, as a page's data holds it. */
export interface TemplateExample {
  file: string;
  source: string;
  data: string;
  options: string;
  html: string;
  /** The compiled AST, as the JSON a host would store. */
  ast: string;
  requires: string[];
  deps: { file: string; source: string }[];
  /**
   * The example's dialog-class markup, from `<name>.overlay.faqir` rendered
   * with the same data: the page mounts it beside `<main>`, and the example's
   * own output holds what opens it. Null for an example without one.
   */
  overlay: { file: string; source: string; html: string; requires: string[] } | null;
}

/** A template that must fail, and how it failed. */
export interface TemplateFailure {
  file: string;
  source: string;
  data: string;
  options: string;
  stage: "compile" | "render";
  code: string;
  message: string;
  line: number;
  col: number;
  deps: { file: string; source: string }[];
}

/** One rendered page of the section: its data, its body and what it loads. */
export interface TemplatePage {
  meta: TemplateSectionPage;
  file: string;
  data: Record<string, unknown>;
  body: string;
  /** The overlay region beside `<main>`, rendered by the engine; null when no example has one. */
  overlays: string | null;
  requires: string[];
}

/** The site-relative pages the section links to, by the name a page uses. */
const SITE_LINKS: Record<string, string> = {
  cliTemplate: "cli/index.html#cmd-template",
  useCases: "template/examples/index.html",
  island: "template/components/index.html#island",
  raw: "template/safety/index.html#raw",
};

const RUN_OPTION_KEYS: Record<keyof TemplateRunOptions, string[]> = {
  compile: ["raw"],
  render: ["maxSteps", "maxOutput"],
};

const readText = (path: string): string => readFileSync(path, "utf8");

/** The section's page list, in reading order. */
export function readTemplateSection(siteRoot: string): TemplateSectionPage[] {
  const section = JSON.parse(readText(join(siteRoot, "templates", "section.json"))) as { pages: TemplateSectionPage[] };
  return section.pages;
}

/** `name.options.json` beside a template, checked: only the keys the docs need. */
function readRunOptions(dir: string, name: string): TemplateRunOptions {
  const path = join(dir, `${name}.options.json`);
  const options = existsSync(path) ? (JSON.parse(readText(path)) as Partial<TemplateRunOptions>) : {};
  for (const [stage, value] of Object.entries(options)) {
    const allowed = RUN_OPTION_KEYS[stage as keyof TemplateRunOptions];
    if (!allowed) throw new Error(`template docs: ${name}.options.json has an unknown stage "${stage}"`);
    for (const key of Object.keys(value ?? {})) {
      if (!allowed.includes(key)) throw new Error(`template docs: ${name}.options.json: unknown ${stage} option "${key}"`);
    }
  }
  return { compile: options.compile ?? {}, render: options.render ?? {} };
}

const OVERLAY_SUFFIX = ".overlay.faqir";

/**
 * The `.faqir` files in a directory, by base name, sorted; an example's
 * `.overlay.faqir` companion is part of that example, not one of its own.
 * Empty when the directory is absent.
 */
function templateNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".faqir") && !f.endsWith(OVERLAY_SUFFIX))
    .map((f) => f.slice(0, -".faqir".length))
    .sort();
}

/** What every template of the section compiles with: the registry table, a loader rooted at site/templates/, the site's helpers. */
function compileOptions(templatesRoot: string, file: string, extra: TemplateRunOptions["compile"]) {
  return {
    file,
    loader: createFileLoader(templatesRoot),
    components: registryTable as ComponentTable,
    helpers: Object.keys(siteHelpers),
    ...extra,
  };
}

/**
 * Compile and render one template under `site/templates/`, the way every page
 * and example of the section is drawn: the registry table, the file loader
 * rooted at `site/templates/`, the site's helpers.
 */
export function runTemplate(
  templatesRoot: string,
  file: string,
  data: Record<string, unknown>,
  options: TemplateRunOptions & { idPrefix?: string },
): { ast: Template; html: string } {
  const result = compile(readText(join(templatesRoot, file)), compileOptions(templatesRoot, file, options.compile));
  if (!result.ast) {
    const d = result.diagnostics[0];
    throw new Error(`template docs: ${d.file}:${d.line}:${d.col} ${d.code} — ${d.message}`);
  }
  const html = render(result.ast, data, { helpers: siteHelpers, idPrefix: options.idPrefix, ...options.render });
  return { ast: result.ast, html };
}

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

/** The files a template loaded besides itself, with their source. */
function depsOf(templatesRoot: string, files: string[], self: string): { file: string; source: string }[] {
  return files.filter((f) => f !== self).map((file) => ({ file, source: readText(join(templatesRoot, file)) }));
}

function readData(dir: string, name: string): Record<string, unknown> {
  const path = join(dir, `${name}.json`);
  return existsSync(path) ? (JSON.parse(readText(path)) as Record<string, unknown>) : {};
}

/** Every example of one page, rendered. Ids are prefixed per example, so a page holding many stays valid. */
export function renderTemplateExamples(templatesRoot: string, slug: string): Record<string, TemplateExample> {
  const dir = join(templatesRoot, "examples", slug);
  const out: Record<string, TemplateExample> = {};
  for (const name of templateNames(dir)) {
    const file = `examples/${slug}/${name}.faqir`;
    const data = readData(dir, name);
    const options = readRunOptions(dir, name);
    const { ast, html } = runTemplate(templatesRoot, file, data, { ...options, idPrefix: `${slug}-${name}` });
    const overlayFile = `examples/${slug}/${name}${OVERLAY_SUFFIX}`;
    let overlay: TemplateExample["overlay"] = null;
    if (existsSync(join(templatesRoot, overlayFile))) {
      const drawn = runTemplate(templatesRoot, overlayFile, data, { ...options, idPrefix: `${slug}-${name}-overlay` });
      overlay = { file: overlayFile, source: readText(join(templatesRoot, overlayFile)), html: drawn.html, requires: drawn.ast.requires };
    }
    out[name] = {
      file,
      source: readText(join(templatesRoot, file)),
      data: pretty(data),
      options: existsSync(join(dir, `${name}.options.json`)) ? pretty(options) : "",
      html,
      ast: pretty(ast),
      requires: ast.requires,
      deps: depsOf(templatesRoot, ast.files, file),
      overlay,
    };
  }
  return out;
}

/**
 * Every failing template of one page, with the error it produced. A template
 * here that compiles and renders is a build error: the page would be showing
 * a diagnostic the engine no longer gives.
 */
export function captureTemplateFailures(templatesRoot: string, slug: string): Record<string, TemplateFailure> {
  const dir = join(templatesRoot, "errors", slug);
  const out: Record<string, TemplateFailure> = {};
  for (const name of templateNames(dir)) {
    const file = `errors/${slug}/${name}.faqir`;
    const source = readText(join(templatesRoot, file));
    const data = readData(dir, name);
    const options = readRunOptions(dir, name);
    const base = {
      file,
      source,
      data: pretty(data),
      options: existsSync(join(dir, `${name}.options.json`)) ? pretty(options) : "",
    };
    const result = compile(source, compileOptions(templatesRoot, file, options.compile));
    if (!result.ast) {
      const d = result.diagnostics[0];
      out[name] = { ...base, stage: "compile", code: d.code, message: d.message, line: d.line, col: d.col, deps: [] };
      continue;
    }
    try {
      render(result.ast, data, { helpers: siteHelpers, idPrefix: `${slug}-${name}`, ...options.render });
    } catch (error) {
      const e = error as { code?: string; message: string; line?: number; col?: number };
      if (typeof e.code !== "string") throw error;
      out[name] = {
        ...base,
        stage: "render",
        code: e.code,
        message: e.message,
        line: e.line ?? 0,
        col: e.col ?? 0,
        deps: depsOf(templatesRoot, result.ast.files, file),
      };
      continue;
    }
    throw new Error(`template docs: ${file} is in errors/ but compiles and renders without one`);
  }
  return out;
}

/**
 * Numbers the pages quote, read from the package rather than typed — the
 * package this module imports, so a fixture `packageRoot` (the generator
 * tests build against one) still documents the engine that rendered the page.
 */
function templateFacts(templatesRoot: string): Record<string, unknown> {
  const pkg = JSON.parse(readText(join(PACKAGE_ROOT, "packages", "template", "package.json"))) as {
    version: string;
    exports: Record<string, unknown>;
  };
  const table = registryTable as ComponentTable;
  return {
    version: pkg.version,
    entries: Object.keys(pkg.exports).filter((e) => e !== "./package.json"),
    callable: Object.keys(table.components).length,
    unavailable: Object.entries(table.unavailable)
      .map(([name, reason]) => ({ name, reason }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    controllers: Object.keys(table.controllers).sort(),
    plugins: Object.entries(table.plugins)
      .map(([directive, file]) => ({ directive, file }))
      .sort((a, b) => a.directive.localeCompare(b.directive)),
    command: {
      name: "template",
      summary: COMMAND_DEFINITIONS.template.summary,
      args: COMMAND_DEFINITIONS.template.args ?? "",
    },
    helpers: { file: "helpers.js", names: Object.keys(siteHelpers), source: readText(join(templatesRoot, "helpers.js")) },
  };
}

/** The template that draws a page's overlay region from its examples' overlays. */
export const OVERLAYS_LAYOUT = "layouts/section-overlays.faqir";

/** Every page of the section, rendered by the engine (no shell yet). */
export function renderTemplateSection(ctx: Pick<PageContext, "siteRoot">): TemplatePage[] {
  const pages = readTemplateSection(ctx.siteRoot);
  return pages.map((meta) => renderTemplatePage(ctx.siteRoot, meta.slug, pages));
}

/** One page of the section, rendered by the engine (no shell yet). */
export function renderTemplatePage(
  siteRoot: string,
  slug: string,
  pages: TemplateSectionPage[] = readTemplateSection(siteRoot),
): TemplatePage {
  const templatesRoot = join(siteRoot, "templates");
  const meta = pages.find((p) => p.slug === slug);
  if (!meta) throw new Error(`template docs: section.json has no page "${slug}"`);
  const file = `pages/${slug}.faqir`;
  const layoutFile = "layouts/section.faqir";
  const ex = renderTemplateExamples(templatesRoot, slug);
  const err = captureTemplateFailures(templatesRoot, slug);
  const data: Record<string, unknown> = {
    page: {
      ...meta,
      file,
      source: readText(join(templatesRoot, file)),
      layout: { file: layoutFile, source: readText(join(templatesRoot, layoutFile)) },
    },
    section: pages.map((p) => ({
      href: relUrl(meta.path, p.path),
      label: p.label,
      title: p.title,
      description: p.description,
      current: p.slug === slug,
    })),
    links: Object.fromEntries(Object.entries(SITE_LINKS).map(([k, to]) => [k, relUrl(meta.path, to)])),
    facts: templateFacts(templatesRoot),
    // The page's own material, when it keeps some as data: pages/<slug>.json.
    content: readData(join(templatesRoot, "pages"), slug),
    ex,
    err,
  };
  const { ast, html } = runTemplate(templatesRoot, file, data, { compile: {}, render: {} });
  const withOverlay = Object.values(ex).filter((e) => e.overlay !== null);
  const overlays = withOverlay.length
    ? runTemplate(templatesRoot, OVERLAYS_LAYOUT, { overlays: withOverlay.map((e) => e.overlay) }, { compile: {}, render: {} }).html
    : null;
  const requires = [
    ...new Set([...ast.requires, ...Object.values(ex).flatMap((e) => [...e.requires, ...(e.overlay?.requires ?? [])])]),
  ].sort();
  return { meta, file, data, body: html, overlays, requires };
}

/**
 * The scripts a page loads, from what its markup requires: the engine (which
 * carries every recipe controller) when anything needs it, then each official
 * plugin the page's directives name.
 */
function scriptsFor(requires: string[]): string[] {
  if (!requires.includes("faqir-core.js")) return [];
  const plugins = new Set(Object.values((registryTable as ComponentTable).plugins));
  return ["scripts/faqir-core.js", ...requires.filter((r) => plugins.has(r)).map(pluginScriptPath)];
}

/**
 * The section's pages in the site's shell. The body is the engine's output,
 * byte for byte: the shell adds only what surrounds `<article>`'s content.
 */
export function renderTemplatePages(ctx: PageContext): SiteFile[] {
  return renderTemplateSection(ctx).map((p) => shellTemplatePage(ctx, p));
}

/** One rendered page in the site's shell. */
export function shellTemplatePage(ctx: PageContext, p: TemplatePage): SiteFile {
  return {
    path: p.meta.path,
    content: renderShell({
      pagePath: p.meta.path,
      title: `${p.meta.title} · ${ctx.config.title}`,
      description: p.meta.description,
      body: p.body,
      overlays: p.overlays ?? undefined,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: p.meta.path,
      layout: "reference",
      scripts: scriptsFor(p.requires),
    }),
  };
}
