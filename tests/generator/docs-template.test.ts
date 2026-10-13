// The Server templates section (`template/**`) — the proof that its pages are
// rendered by @faqir-ui/template.
//
// Every page of the section is a `.faqir` file under `site/templates/pages/`.
// This file builds the site with the real writer (`scripts/build-docs.mjs`),
// then compiles and renders each page and each example again here — straight
// from the package's entries, with none of the generator's code in the path —
// and byte-compares the result with what the build wrote. When `site/dist`
// exists it is held to the same bytes. A page whose body is anything but
// render()'s output, an example whose result is not the engine's, or a
// failure the engine no longer reports fails here.
//
// The rest pins the section to its brief: every topic keeps its section, the
// section is linked from the site, and its pages pass the site's own gates.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { compile } from "../../packages/template/src/compile.js";
import { render } from "../../packages/template/src/index.js";
import { createFileLoader } from "../../packages/template/src/node.js";
import { components as table } from "../../packages/template/src/registry.js";
import { helpers } from "../../site/templates/helpers.js";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { LLMS_FULL_FILE, LLMS_INDEX_FILE, SITEMAP_FILE, buildDocsSite, isShellPage, relUrl } from "../../src/generator/docs";
import {
  OVERLAYS_LAYOUT,
  TEMPLATE_PAGE,
  readTemplateSection,
  renderTemplateSection,
  type TemplateExample,
  type TemplateFailure,
} from "../../src/generator/docs-pages/template";

const REPO = join(import.meta.dir, "../..");
const SITE = join(REPO, "site");
const TEMPLATES = join(SITE, "templates");
const DIST = join(SITE, "dist");
const OUT = join(REPO, "tests", `.tmp-template-docs-${process.pid}`);

const sectionPages = readTemplateSection(SITE);
const rendered = renderTemplateSection({ siteRoot: SITE });
const files = buildDocsSite();
const byPath = new Map(files.map((f) => [f.path, f.content]));

const loader = createFileLoader(TEMPLATES);
const read = (file: string): string => readFileSync(join(TEMPLATES, file), "utf8");
const json = (path: string): Record<string, unknown> =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
const faqirNames = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".faqir") && !f.endsWith(".overlay.faqir"))
        .map((f) => f.slice(0, -".faqir".length))
        .sort()
    : [];

/** What a host does with a template: compile it, then render it. No generator code. */
function draw(file: string, data: Record<string, unknown>, idPrefix?: string, options: any = {}): string {
  const { ast, diagnostics } = compile(read(file), {
    file,
    loader,
    components: table as any,
    helpers: Object.keys(helpers),
    ...(options.compile ?? {}),
  });
  expect(diagnostics, `${file} does not compile`).toEqual([]);
  return render(ast!, data, { helpers, idPrefix, ...(options.render ?? {}) });
}

/** The content the shell wraps: everything between the article tags. */
function articleBody(html: string): string {
  const open = '<article data-ui="prose">\n';
  const start = html.indexOf(open);
  const end = html.lastIndexOf("\n      </article>");
  expect(start, "no article in the page").toBeGreaterThan(-1);
  return html.slice(start + open.length, end);
}

/** What the shell mounts beside it: everything between the shell's last </div> and </body>. */
function overlayRegion(html: string): string {
  const shellEnd = "\n  </footer>\n\n</div>\n";
  return html.slice(html.lastIndexOf(shellEnd) + shellEnd.length, html.lastIndexOf("</body>"));
}

beforeAll(() => {
  rmSync(OUT, { recursive: true, force: true });
  const build = spawnSync(process.execPath, [join(REPO, "scripts", "build-docs.mjs"), "--out", OUT], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 120_000,
  });
  expect(build.status, build.stderr).toBe(0);
});

afterAll(() => rmSync(OUT, { recursive: true, force: true }));

describe("every page of the section is render() output", () => {
  it("lists its pages in site/templates/section.json, overview first", () => {
    expect(sectionPages[0].path).toBe(TEMPLATE_PAGE);
    expect(rendered.map((p) => p.meta.path)).toEqual(sectionPages.map((p) => p.path));
    for (const p of sectionPages) expect(existsSync(join(TEMPLATES, "pages", `${p.slug}.faqir`)), p.slug).toBe(true);
  });

  for (const page of sectionPages) {
    it(`${page.path} is pages/${page.slug}.faqir rendered with its data, byte for byte`, () => {
      const data = rendered.find((p) => p.meta.slug === page.slug)!.data;
      const fresh = draw(`pages/${page.slug}.faqir`, data);
      const overlays = Object.values(data.ex as Record<string, TemplateExample>)
        .filter((e) => e.overlay !== null)
        .map((e) => e.overlay);
      const freshOverlays = overlays.length ? draw(OVERLAYS_LAYOUT, { overlays }) : "";
      const built = [readFileSync(join(OUT, page.path), "utf8")];
      if (existsSync(join(DIST, page.path))) built.push(readFileSync(join(DIST, page.path), "utf8"));
      for (const html of built) {
        expect(articleBody(html), `${page.path} is stale — run \`bun run build:docs\``).toBe(fresh);
        expect(overlayRegion(html), `${page.path}'s overlays are stale`).toBe(freshOverlays);
      }
    });
  }
});

describe("what a page shows is its examples' own files, run", () => {
  for (const page of sectionPages) {
    const p = rendered.find((r) => r.meta.slug === page.slug)!;
    const ex = p.data.ex as Record<string, TemplateExample>;
    const err = p.data.err as Record<string, TemplateFailure>;
    const dir = join(TEMPLATES, "examples", page.slug);
    const errDir = join(TEMPLATES, "errors", page.slug);

    it(`${page.slug}: every example is its source, its data and render()'s output, and the page shows all three`, () => {
      expect(Object.keys(ex).sort()).toEqual(faqirNames(dir));
      for (const name of faqirNames(dir)) {
        const file = `examples/${page.slug}/${name}.faqir`;
        const data = json(join(dir, `${name}.json`));
        const options = json(join(dir, `${name}.options.json`));
        const html = draw(file, data, `${page.slug}-${name}`, options);
        expect(ex[name].source).toBe(read(file));
        expect(ex[name].data).toBe(JSON.stringify(data, null, 2));
        expect(ex[name].html).toBe(html);
        const overlayFile = `examples/${page.slug}/${name}.overlay.faqir`;
        if (existsSync(join(TEMPLATES, overlayFile))) {
          expect(ex[name].overlay!.html).toBe(draw(overlayFile, data, `${page.slug}-${name}-overlay`, options));
        } else {
          expect(ex[name].overlay).toBeNull();
        }
        // Live, and as text: the page carries the markup itself and its escaped source.
        expect(p.body, `${file}'s output is not live on the page`).toContain(html);
        expect(p.body, `${file} is not named on the page`).toContain(file);
      }
    });

    it(`${page.slug}: every failure fails, and the page shows the engine's own code and message`, () => {
      expect(Object.keys(err).sort()).toEqual(faqirNames(errDir));
      for (const name of faqirNames(errDir)) {
        const file = `errors/${page.slug}/${name}.faqir`;
        const options = json(join(errDir, `${name}.options.json`));
        const { ast, diagnostics } = compile(read(file), {
          file,
          loader,
          components: table as any,
          helpers: Object.keys(helpers),
          ...(options.compile ?? {}),
        });
        let code = diagnostics[0]?.code;
        let message = diagnostics[0]?.message;
        if (ast) {
          try {
            render(ast, json(join(errDir, `${name}.json`)), { helpers, ...(options.render ?? {}) });
            throw new Error(`${file} rendered without an error`);
          } catch (e: any) {
            code = e.code;
            message = e.message;
          }
        }
        expect(err[name].code).toBe(code);
        expect(err[name].message).toBe(message);
        expect(p.body).toContain(`<code>${code}</code>`);
        expect(p.body).toContain(message!.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
      }
    });
  }

  it("uses raw in its own templates only to place what the engine already rendered", () => {
    const uses: string[] = [];
    for (const dir of ["pages", "layouts", "partials"]) {
      for (const f of readdirSync(join(TEMPLATES, dir)).filter((n) => n.endsWith(".faqir"))) {
        for (const line of read(`${dir}/${f}`).split("\n")) if (/^ *raw\b/.test(line)) uses.push(`${dir}/${f}: ${line.trim()}`);
      }
    }
    expect(uses.sort()).toEqual([
      `${OVERLAYS_LAYOUT}: raw overlay.html`,
      "partials/example.faqir: raw example.html",
    ]);
  });
});

// ── every topic keeps its section ───────────────────────────────────────────

/**
 * The topics the section must teach: the page, the h2 that holds the topic, and
 * text the section must show. Each section must also carry a live example.
 */
const TOPICS: { topic: string; slug: string; id: string; shows: string[] }[] = [
  { topic: "source text and indentation", slug: "syntax", id: "source-text", shows: ["bad-indent"] },
  { topic: "elements and attributes", slug: "syntax", id: "elements", shows: ["directive-interpolation"] },
  { topic: "text, holes and the \\{{ escape", slug: "syntax", id: "text", shows: ["\\{{"] },
  { topic: "comments", slug: "syntax", id: "comments", shows: ["//-"] },
  { topic: "expressions, operators, ?? and helpers", slug: "syntax", id: "expressions", shows: ["??", "helpers.js"] },
  { topic: "if, else and each", slug: "syntax", id: "control-flow", shows: ["else if", "each"] },
  { topic: "layout, block and include", slug: "components", id: "composition", shows: ["layout", "block", "include"] },
  { topic: "component calls", slug: "components", id: "components", shows: ["+card", "@body", "unknown-arg"] },
  { topic: "the l-data island", slug: "components", id: "island", shows: ["l-data=json(", "json-misplaced"] },
  { topic: "server-rendered recipes", slug: "components", id: "hydration", shows: ['data-ui="tabs"', 'data-ui="accordion"', 'data-open="'] },
  { topic: "escaping contexts", slug: "safety", id: "escaping", shows: ["unsafe-url"] },
  { topic: "raw", slug: "safety", id: "raw", shows: ["raw-refused"] },
  { topic: "limits", slug: "safety", id: "limits", shows: ["step-limit", "output-limit"] },
  { topic: "diagnostics", slug: "safety", id: "diagnostics", shows: ["Compile error", "unknown-component"] },
  { topic: "compile", slug: "api", id: "compile", shows: ["@faqir-ui/template/compile"] },
  { topic: "render", slug: "api", id: "render", shows: ["@ui:requires"] },
  { topic: "the /node and /registry entries", slug: "api", id: "entries", shows: ["createFileLoader", "@faqir-ui/template/registry"] },
  { topic: "the faqir template command", slug: "api", id: "cli", shows: ["faqir template", "--check"] },
  { topic: "how it relates to @faqir-ui/render", slug: "api", id: "render-package", shows: ["@faqir-ui/render"] },
  { topic: "server-rendered app pages", slug: "examples", id: "app-pages", shows: ["l-data"] },
  { topic: "documentation and CMS content", slug: "examples", id: "content", shows: ["+callout"] },
  { topic: "email-style static output", slug: "examples", id: "email", shows: ["money("] },
  { topic: "templates you do not trust", slug: "examples", id: "untrusted", shows: ["raw-refused", "step-limit"] },
];

/** A page's h2 section: from its heading to the next h2 (or the colophon). */
function sectionOf(body: string, id: string): string {
  const start = body.indexOf(`<h2 id="${id}">`);
  if (start < 0) return "";
  const next = body.indexOf("<h2 ", start + 1);
  return body.slice(start, next < 0 ? undefined : next);
}

describe("every topic keeps its section, with a live example", () => {
  for (const t of TOPICS) {
    it(`${t.topic} — template/${t.slug === "index" ? "" : `${t.slug}/`}#${t.id}`, () => {
      const page = rendered.find((p) => p.meta.slug === t.slug)!;
      const section = sectionOf(page.body, t.id);
      expect(section, `no <h2 id="${t.id}"> on ${page.meta.path}`).not.toBe("");
      // A live result, or a failure the engine reported when the site was built.
      expect(section, `${t.id} has no live example`).toMatch(/<div data-docs-template-example[ >]/);
      const text = section.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      for (const s of t.shows) expect(text, `${t.id} does not show ${s}`).toContain(s);
    });
  }

  it("captures at least one real compile error, with its message, at build time", () => {
    const failures = rendered.flatMap((p) => Object.values(p.data.err as Record<string, TemplateFailure>));
    expect(failures.filter((f) => f.stage === "compile").length).toBeGreaterThan(0);
    expect(failures.filter((f) => f.stage === "render").length).toBeGreaterThan(0);
  });

  it("hydrates: the recipes and an island are live markup, and the page loads the engine for them", () => {
    const html = byPath.get("template/components/index.html")!;
    expect(html).toContain('<script src="../../scripts/faqir-core.js" defer></script>');
    for (const ui of ["tabs", "accordion", "dialog"]) expect(html).toContain(`data-ui="${ui}"`);
    expect(html).toMatch(/<div l-data="\{[^"]*\}">/);
    // The dialog is mounted beside <main>, where overlays belong.
    expect(html).toMatch(/<\/main>[\s\S]*<div id="delete-project" data-ui="dialog" data-state="closed">/);
  });
});

describe("the section is linked from the site", () => {
  it("from the navigation of every shell page", () => {
    for (const f of files.filter((f) => isShellPage(f.path))) {
      expect(f.content, f.path).toContain(`href="${relUrl(f.path, TEMPLATE_PAGE)}"`);
    }
  });

  it("from the home page's site map, the sitemap and both llms files", () => {
    expect(byPath.get("index.html")).toContain('href="template/index.html"');
    const sitemap = byPath.get(SITEMAP_FILE)!;
    for (const p of sectionPages) expect(sitemap, p.path).toContain(p.path.replace(/index\.html$/, ""));
    expect(byPath.get(LLMS_INDEX_FILE)).toContain("](template/index.html)");
    expect(byPath.get(LLMS_INDEX_FILE)).toContain("](llms-full.txt#server-templates)");
    expect(byPath.get(LLMS_FULL_FILE)).toContain("\n## Server templates\n");
    expect(byPath.get(LLMS_FULL_FILE)).toContain("template/index.html");
  });
});

describe("the section passes the site-page bar", () => {
  it("audits clean at every severity, with no class and no style attribute", async () => {
    const manifests = await loadRegistryManifestMap(join(REPO, "registry"));
    for (const p of sectionPages) {
      const html = byPath.get(p.path)!;
      const findings = auditHtmlSource({ source: html, file: p.path, manifests }).map(
        (r) => `${p.path}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`,
      );
      expect(findings.join("\n")).toBe("");
      expect(html, p.path).not.toMatch(/\sclass\s*=/);
      expect(html, p.path).not.toMatch(/\sstyle\s*=/);
    }
  });

  it("styles itself from site/styles/pages/template.css, with attribute selectors and tokens only", () => {
    const css = readFileSync(join(SITE, "styles", "pages", "template.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|lab|lch)\(/);
    expect(css).not.toContain("!important");
    for (const m of css.matchAll(/(^|[{}])\s*([^{}@;]+)\{/g)) {
      const selector = m[2].trim();
      expect(selector, "class selector").not.toMatch(/(^|[\s,>+~(])\.[a-zA-Z]/);
      expect(selector, "id selector").not.toMatch(/(^|[\s,>+~(])#[a-zA-Z]/);
    }
    if (/\b(transition|animation)\s*:/.test(css)) expect(css).toContain("prefers-reduced-motion");
  });
});
