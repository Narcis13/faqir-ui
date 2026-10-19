// The 1.3 pages: the runtime accent, documents & print, the strict-CSP engine,
// and the home page's 1.3 story.
//
// `docs-site.test.ts` already holds every page to the audit gate and the
// no-class/no-inline-style rule. These cases hold the new pages to what they
// claim: that each named hue is shown live and only the measured ones are, that
// the print voices are the stylesheets' own declarations, and that the
// strict-CSP page really runs under a policy without 'unsafe-eval', on the
// interpreter build and nothing else.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCENT_PAGE,
  buildDocsSite,
  CSP_DEMO_POLICY,
  CSP_ENGINE_SCRIPT,
  CSP_PAGE,
  isPrintTheme,
  discoverThemes,
  PRINT_PAGE,
  TOKEN_FILES,
} from "../../src/generator/docs";
import { TOKEN_FILES_ORDERED } from "../../src/utils/bundler";
import { ACCENT_CUSTOM, ACCENT_HUES } from "../../src/theme/accent";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const files = buildDocsSite();
const byPath = new Map(files.map((file) => [file.path, file.content]));

function file(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`the docs site does not ship ${path}`);
  return content;
}

/** A page with its copyable code blocks removed: only what actually renders. */
function live(path: string): string {
  return file(path).replace(/<pre\b[\s\S]*?<\/pre>/g, "");
}

function scriptsOf(path: string): string[] {
  return [...file(path).matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]!);
}

describe("the site stylesheet", () => {
  it("concatenates the token files the bundler does, in the bundler's order", () => {
    expect(TOKEN_FILES.map((file) => `${file}.css`)).toEqual(TOKEN_FILES_ORDERED);
    const css = file("styles/faqir.css");
    // The two that had fallen out: the material palette and the runtime accent.
    expect(css).toContain("--texture-mesh:");
    expect(css).toContain('[data-accent="rose"]');
  });
});

describe("runtime accent page", () => {
  const page = live(ACCENT_PAGE);
  const hues = Object.keys(ACCENT_HUES);

  it("shows every measured hue live, and no other named hue", () => {
    expect(hues.length).toBe(9);
    for (const name of hues) {
      expect(page, `${name} has no live card`).toMatch(
        new RegExp(`data-ui="card"[^>]*data-accent="${name}"[^>]*data-docs-accent-card`),
      );
    }
    const named = [...page.matchAll(/data-accent="([a-z]+)"/g)].map((m) => m[1]!);
    for (const value of named) {
      expect([...hues, ACCENT_CUSTOM], `${value} is not in the vocabulary`).toContain(value);
    }
  });

  it("tabulates the vocabulary from src/theme/accent.ts, custom included", () => {
    const html = file(ACCENT_PAGE);
    expect(html).not.toContain("<!-- @faqir:accent-");
    for (const [name, hue] of Object.entries(ACCENT_HUES)) {
      expect(html).toContain(`<tr><td><code>${name}</code></td><td>${hue}°</td>`);
    }
    expect(html).toContain(`<tr><td><code>${ACCENT_CUSTOM}</code></td>`);
  });

  it("drives the custom hue from an l-data scope, with a stylesheet fallback", () => {
    expect(page).toMatch(/l-data="\{ hue: 200 \}"/);
    expect(page).toMatch(/data-accent="custom" :style="\{ '--accent-hue': hue \}"/);
    expect(scriptsOf(ACCENT_PAGE)).toContain("../scripts/faqir-core.js");
    const css = readFileSync(join(REPO, "site", "styles", "pages", "accent.css"), "utf8");
    expect(css).toMatch(/\[data-docs-accent-custom-target\]\s*\{\s*--accent-hue: 200;/);
  });
});

describe("documents & print page", () => {
  const themes = discoverThemes(REGISTRY);
  const print = themes.filter(isPrintTheme);

  it("finds the five print themes and no screen theme", () => {
    expect(print.map((t) => t.name).sort()).toEqual([
      "document",
      "document-serif",
      "editorial-document",
      "ink-document",
      "swiss-document",
    ]);
  });

  it("tabulates each print theme's own document tokens out of its stylesheet", () => {
    const html = file(PRINT_PAGE);
    expect(html).not.toContain("<!-- @faqir:print-voices -->");
    for (const theme of print) {
      expect(html).toContain(`href="../themes/${theme.name}/index.html">${theme.name}</a>`);
    }
    // The three voices forecraft #48 gave the generated companions, by value.
    const ink = readFileSync(join(REGISTRY, "themes", "ink-document.css"), "utf8");
    expect(ink).toMatch(/--doc-rule-scale\s*:\s*2;/);
    const inkRow = html.split("\n").find((line) => line.includes(">ink-document</a>"))!;
    expect(inkRow).toContain("<td><code>2</code></td>");
    const swissRow = html.split("\n").find((line) => line.includes(">swiss-document</a>"))!;
    expect(swissRow).toContain("<td><code>1.2</code></td>");
  });

  it("draws a live chart with the plugin, and links the print components", () => {
    const page = live(PRINT_PAGE);
    expect(page).toMatch(/<figure data-ui="chart" data-variant="column"/);
    expect(scriptsOf(PRINT_PAGE)).toEqual(["../scripts/gallery.js", "../scripts/plugins/faqir-chart.js"]);
    for (const href of [
      "../components/patterns/document.html",
      "../components/primitives/chart.html",
      "../components/recipes/table.html",
      "../components/recipes/qr-code.html",
      "../frames/scaffold-invoice.html",
      "../frames/scaffold-report.html",
    ]) {
      expect(page).toContain(`="${href}"`);
    }
  });
});

describe("strict-CSP engine page", () => {
  const html = file(CSP_PAGE);
  const head = html.slice(0, html.indexOf("</head>"));

  it("states a policy without 'unsafe-eval' ahead of every script", () => {
    expect(CSP_DEMO_POLICY).toContain("script-src 'self'");
    expect(CSP_DEMO_POLICY).not.toContain("unsafe-eval");
    const meta = head.indexOf(`<meta http-equiv="Content-Security-Policy" content="${CSP_DEMO_POLICY}">`);
    expect(meta).toBeGreaterThan(-1);
    expect(meta).toBeLessThan(head.indexOf("<script"));
    // No other page carries a policy of its own.
    for (const f of files) {
      if (f.path !== CSP_PAGE && f.path.endsWith(".html")) {
        expect(f.content, f.path).not.toContain('http-equiv="Content-Security-Policy"');
      }
    }
  });

  it("runs the interpreter build, verbatim, and never the default engine", () => {
    expect(scriptsOf(CSP_PAGE)).toEqual([
      "../../scripts/gallery.js",
      `../../${CSP_ENGINE_SCRIPT}`,
      "../../scripts/csp-proof.js",
    ]);
    expect(file(CSP_ENGINE_SCRIPT)).toBe(readFileSync(join(REGISTRY, "core", "faqir-core.csp.js"), "utf8"));
    expect(html).not.toContain('src="../../scripts/faqir-core.js"');
  });

  it("has an inline script nowhere, so script-src 'self' blocks nothing it needs", () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });

  it("demonstrates live directives and reports the refused compile", () => {
    const page = live(CSP_PAGE);
    expect(page).toContain('@click="count++"');
    expect(page).toMatch(/<template l-for="city in shown" l-key="city">/);
    for (const result of ["policy", "eval", "engine"]) {
      expect(page).toContain(`data-docs-csp-result="${result}"`);
    }
    const proof = readFileSync(join(REPO, "site", "lib", "csp-proof.js"), "utf8");
    expect(proof).toContain('new Function("return 1")');
  });
});

describe("home page 1.3 story and discovery", () => {
  const home = live("index.html");

  it("tells the 1.3 story with one live accent badge per measured hue and a live chart", () => {
    expect(home).toContain('<h2 id="release-13-heading">');
    for (const name of Object.keys(ACCENT_HUES)) {
      expect(home).toContain(`<span data-ui="badge" data-variant="primary" data-accent="${name}">${name}</span>`);
    }
    expect(home).toMatch(/<figure data-ui="chart" data-variant="column" data-docs-home-chart>/);
    expect(scriptsOf("index.html")).toEqual(["scripts/gallery.js", "scripts/plugins/faqir-chart.js"]);
  });

  it("lists the three pages in the sidebar, the home map and the sitemap", () => {
    const index = file("index.html");
    const sitemap = file("sitemap.xml");
    for (const path of [ACCENT_PAGE, PRINT_PAGE, CSP_PAGE]) {
      expect(index).toContain(`data-part="nav-item" href="${path}"`);
      expect(home).toContain(`<a data-ui="link" href="${path}">`);
      expect(sitemap).toContain(path.replace(/index\.html$/, ""));
    }
  });

  it("names every engine plugin in the numbers row", () => {
    const row = file("index.html").match(/<span data-docs-number-label>engine plugins<\/span><span data-docs-number-note>([^<]+)</)!;
    expect(row[1]).toContain("chart");
    expect(row[1]).toContain("validate");
  });
});
