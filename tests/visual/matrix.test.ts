/**
 * Meta-test for the visual-regression matrix — task 0.4-23 (FAQIR-PLAN §12.2).
 *
 * This runs in the ordinary `bun test` suite (no browser needed): it guards the
 * *generation* of the matrix, which is the acceptance-critical part — "adding a
 * component requires zero suite edits" only holds if the generator can never
 * silently skip a reference page. The screenshot comparison itself lives in the
 * Playwright suite (visual.pw.ts) and runs in CI's Linux container.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";
import {
  discoverComponents,
  discoverThemes,
  buildMatrix,
  buildPageHtml,
  REGISTRY,
  SCHEMES,
  DIRECTIONS,
} from "./matrix";

describe("visual matrix generation", () => {
  test("every registry reference page appears in the matrix (nothing silently skipped)", () => {
    // Ground truth, independent of matrix.ts: scan the disk directly for every
    // reference page that declares an @ui:component header.
    const referencePages: string[] = [];
    for (const kind of ["primitives", "recipes", "patterns"]) {
      for (const rel of new Glob(`${kind}/**/*.html`).scanSync(REGISTRY)) {
        const src = readFileSync(`${REGISTRY}/${rel}`, "utf8");
        if (/<!--\s*@ui:component\s+/.test(src)) referencePages.push(rel);
      }
    }
    expect(referencePages.length).toBeGreaterThan(0);

    const discovered = new Set(
      discoverComponents().map((c) => c.htmlRel.replace(/^registry\//, "")),
    );

    const missing = referencePages.filter((p) => !discovered.has(p));
    expect(missing, `reference pages missing from the matrix:\n${missing.join("\n")}`).toEqual([]);
    expect(discovered.size).toBe(referencePages.length);
  });

  test("matrix is the full component × theme × scheme × dir cross-product", () => {
    const components = discoverComponents();
    const themes = discoverThemes();
    const matrix = buildMatrix();

    expect(components.length).toBeGreaterThan(0);
    expect(themes.length).toBeGreaterThan(0);
    expect(matrix.length).toBe(components.length * themes.length * SCHEMES.length * DIRECTIONS.length);

    // Case ids are unique — no two captures can clobber the same baseline file.
    const ids = new Set(matrix.map((c) => c.id));
    expect(ids.size).toBe(matrix.length);
  });

  test("both directions and both schemes are represented (RTL + dark locked in)", () => {
    const matrix = buildMatrix();
    for (const dir of DIRECTIONS) expect(matrix.some((c) => c.dir === dir)).toBe(true);
    for (const scheme of SCHEMES) expect(matrix.some((c) => c.scheme === scheme)).toBe(true);
    // RTL specifically (0.3-10): every component has an rtl case for every theme.
    const rtl = matrix.filter((c) => c.dir === "rtl");
    expect(rtl.length).toBe(matrix.length / 2);
  });

  test("discovered themes include every registry/themes/*.css", () => {
    const cssThemes = [...new Glob("*.css").scanSync(`${REGISTRY}/themes`)]
      .filter((f) => !f.endsWith(".preview.css"))
      .map((f) => f.replace(/\.css$/, ""))
      .sort();
    expect(discoverThemes()).toEqual(cssThemes);
  });

  test("assembled pages are self-contained (no fetchable external references)", () => {
    // Only resources fetched during load matter for determinism: img/script/etc.
    // `src=` and CSS `url(...)`. Anchor hrefs and `xmlns="http://www.w3.org/..."`
    // namespaces (in inline SVGs and data: URIs) are never fetched, so they don't
    // count. The reference pages point <img> at example.com — those must be gone.
    const remoteSrc = /\bsrc\s*=\s*["']https?:\/\//i;
    const remoteCssUrl = /url\(\s*["']?https?:\/\//i;
    const matrix = buildMatrix();
    for (const name of ["avatar", "image", "dashboard-shell", "aspect-ratio"]) {
      const c = matrix.find((x) => x.component.name === name);
      expect(c, `expected a matrix case for "${name}"`).toBeDefined();
      const html = buildPageHtml(c!);
      expect(remoteSrc.test(html), `${name} page has a remote src=`).toBe(false);
      expect(remoteCssUrl.test(html), `${name} page has a remote CSS url()`).toBe(false);
      // The authoring @ui: comments never reach the mounted fragment.
      const body = html.slice(html.indexOf("<main"));
      expect(/<!--\s*@ui:/.test(body)).toBe(false);
    }
  });

  test("page carries the case's data-theme and dir on <html>", () => {
    const c = buildMatrix().find((x) => x.scheme === "dark" && x.dir === "rtl")!;
    const html = buildPageHtml(c);
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(`/* theme: ${c.theme} */`);
  });
});
