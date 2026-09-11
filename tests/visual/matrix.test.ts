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
  isMatrixTheme,
  readThemeManifest,
  themeManifestPathFor,
  REDUCED_SWEEP_KIND,
  REDUCED_SWEEP_DIRECTION,
  REGISTRY,
  SCHEMES,
  DIRECTIONS,
  type Component,
  type ThemeManifestReader,
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

  test("matrix is the cross-product for matrix themes, patterns-only for the rest", () => {
    const components = discoverComponents();
    const themes = discoverThemes();
    const matrixThemes = discoverThemes({ matrix: true });
    const patterns = components.filter((c) => c.kind === REDUCED_SWEEP_KIND);
    const matrix = buildMatrix();

    expect(components.length).toBeGreaterThan(0);
    expect(themes.length).toBeGreaterThan(0);
    expect(matrix.length).toBe(
      components.length * matrixThemes.length * SCHEMES.length * DIRECTIONS.length +
        patterns.length * (themes.length - matrixThemes.length) * SCHEMES.length,
    );

    // Case ids are unique — no two captures can clobber the same baseline file.
    const ids = new Set(matrix.map((c) => c.id));
    expect(ids.size).toBe(matrix.length);
  });

  test("both directions and both schemes are represented (RTL + dark locked in)", () => {
    const matrix = buildMatrix();
    for (const dir of DIRECTIONS) expect(matrix.some((c) => c.dir === dir)).toBe(true);
    for (const scheme of SCHEMES) expect(matrix.some((c) => c.scheme === scheme)).toBe(true);
    // RTL specifically (0.3-10): every component has an rtl case for every theme
    // that takes the full sweep. A reduced theme is ltr-only by policy (1.1A-13),
    // so the halving claim is made against the full-sweep cells, not the total.
    const matrixThemes = new Set(discoverThemes({ matrix: true }));
    const full = matrix.filter((c) => matrixThemes.has(c.theme));
    const rtl = matrix.filter((c) => c.dir === "rtl");
    expect(rtl.length).toBe(full.length / 2);
    expect(rtl.every((c) => matrixThemes.has(c.theme))).toBe(true);
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

  test("the harness adds no geometry the shipped artifact lacks", () => {
    // Task 0.9-01. The capture must be of shipped bytes: the copy-for-agents
    // payload is `<body><main>` + the fragment under the framework's own CSS, so
    // a padded body or a flex column with a gap in *this* document baselines a
    // page nobody has — and hides exactly the cramping v0.9 exists to fix.
    const c = buildMatrix().find((x) => x.component.name === "badge")!;
    const html = buildPageHtml(c);
    // One <style>, and it is the framework's — no second harness sheet.
    expect(html.match(/<style>/g) ?? []).toHaveLength(1);
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    const harness = head.slice(head.lastIndexOf("</style>"));
    expect(harness).not.toContain("padding");
    expect(harness).not.toContain("gap");
    // …and the mount point itself is unstyled: no inline style, no rule for it.
    expect(html).not.toContain("main.vr-root {");
    expect(/<main[^>]*style=/.test(html)).toBe(false);
  });

  test("page carries the case's data-theme and dir on <html>", () => {
    const c = buildMatrix().find((x) => x.scheme === "dark" && x.dir === "rtl")!;
    const html = buildPageHtml(c);
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(`/* theme: ${c.theme} */`);
  });
});

// ── matrix membership policy (task 1.1A-13) ──────────────────────────────────
//
// The cross-product is multiplicative and themes are the axis that explodes: 12
// themes are 4 128 captures, 24 would be 8 256. So membership became a manifest
// fact — `visual_matrix: false` buys a theme a patterns-only sweep instead. These
// cases pin the arithmetic and, more importantly, the *direction* of the default:
// absence means full membership, so a theme can never shrink the gate by omission.

describe("matrix membership policy (1.1A-13)", () => {
  /** Three synthetic themes: two full members, one opted out. */
  const FIXTURE_THEMES = ["fixture-full", "fixture-silent", "fixture-reduced"];
  const fixtureRead: ThemeManifestReader = (theme) => {
    if (theme === "fixture-reduced") return { visual_matrix: false };
    if (theme === "fixture-silent") return null; // no manifest at all
    return { visual_matrix: true };
  };

  test("absence means membership — only an explicit false opts a theme out", () => {
    expect(isMatrixTheme(null)).toBe(true); // no manifest on disk
    expect(isMatrixTheme({})).toBe(true); // a manifest that never mentions it
    expect(isMatrixTheme({ visual_matrix: true })).toBe(true);
    expect(isMatrixTheme({ visual_matrix: false })).toBe(false);
  });

  test("discoverThemes({ matrix: true }) narrows; discoverThemes() still returns all", () => {
    const all = discoverThemes();
    // The option is the only thing that filters — same reader, same disk.
    expect(discoverThemes({}, fixtureRead)).toEqual(all);
    expect(discoverThemes(undefined, fixtureRead)).toEqual(all);
    // With a reader that opts every theme out, the matrix set is empty while the
    // full set is untouched: proof the two answers come from different questions.
    expect(discoverThemes({ matrix: true }, () => ({ visual_matrix: false }))).toEqual([]);
    expect(discoverThemes({ matrix: true }, () => null)).toEqual(all);
  });

  test("no authored theme opts out — the field is for generated themes", () => {
    // The policy in one sentence: a theme someone *wrote* earns the full matrix;
    // a theme a seed *generated* (1.1A-16/17), and the print companion it brings
    // with it, ship `visual_matrix: false` and are promoted by a deliberate
    // one-line manifest edit.
    //
    // "Authored" is read off the manifest rather than off a name list, and it
    // takes BOTH derived facts: a generated theme is one with a `seed`, and a
    // companion is one with no `axes` block — the same rule `readPeerThemes`
    // and the distinctiveness gate use, so there is one definition of "a theme
    // in its own right" in the repository rather than three.
    const themes = discoverThemes();
    expect(themes.length).toBeGreaterThanOrEqual(12);
    const authored: string[] = [];
    const generated: string[] = [];
    for (const theme of themes) {
      const manifest = readThemeManifest(theme) as
        | (ReturnType<typeof readThemeManifest> & { seed?: unknown; axes?: unknown })
        | null;
      expect(manifest, `${theme} has a manifest at ${themeManifestPathFor(theme)}`).not.toBeNull();
      if (manifest!.seed !== undefined || manifest!.axes === undefined) {
        generated.push(theme);
        expect(
          manifest!.visual_matrix,
          `generated theme ${theme} is in the full matrix`,
        ).toBe(false);
        expect(isMatrixTheme(manifest)).toBe(false);
        continue;
      }
      authored.push(theme);
      expect(
        manifest!.visual_matrix,
        `authored theme ${theme} declares visual_matrix`,
      ).toBeUndefined();
      expect(isMatrixTheme(manifest)).toBe(true);
    }
    // The twelve authored themes of 1.0 are all still here and all still
    // members; the twelve generated ones (1.1A-16's six, 1.1A-17's six) and
    // their three companions are the ones that are not.
    expect(authored.length).toBe(12);
    expect(generated.sort()).toEqual([
      "candy",
      "clinical",
      "editorial",
      "editorial-document",
      "fintech",
      "ink",
      "ink-document",
      "luxe",
      "neo",
      "neumorph",
      "nordic",
      "organic",
      "sunset",
      "swiss",
      "swiss-document",
    ]);
  });

  test("case count equals the formula: full × members + patterns × the rest", () => {
    const components = discoverComponents();
    const patterns = components.filter((c) => c.kind === REDUCED_SWEEP_KIND);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.length).toBeLessThan(components.length);

    const cases = buildMatrix(components, FIXTURE_THEMES, fixtureRead);
    const full = 2 * components.length * SCHEMES.length * DIRECTIONS.length;
    const reduced = 1 * patterns.length * SCHEMES.length; // one direction
    expect(cases.length).toBe(full + reduced);

    // …and per theme, which is the number the policy is actually about.
    const per = (theme: string) => cases.filter((c) => c.theme === theme).length;
    expect(per("fixture-full")).toBe(components.length * 4);
    expect(per("fixture-silent")).toBe(components.length * 4);
    expect(per("fixture-reduced")).toBe(patterns.length * 2);
  });

  test("a non-matrix theme costs 30 captures, not 344", () => {
    const components = discoverComponents();
    const cases = buildMatrix(components, ["reduced"], () => ({ visual_matrix: false }));
    expect(components.length).toBe(86);
    expect(components.length * SCHEMES.length * DIRECTIONS.length).toBe(344);
    expect(cases.length).toBe(30);
  });

  test("the reduced sweep is patterns only, both schemes, ltr only", () => {
    const cases = buildMatrix(discoverComponents(), ["reduced"], () => ({ visual_matrix: false }));
    expect(new Set(cases.map((c) => c.component.kind))).toEqual(new Set([REDUCED_SWEEP_KIND]));
    expect([...new Set(cases.map((c) => c.dir))]).toEqual([REDUCED_SWEEP_DIRECTION]);
    expect([...new Set(cases.map((c) => c.scheme))].sort()).toEqual([...SCHEMES].sort());
    const ids = new Set(cases.map((c) => c.id));
    expect(ids.size).toBe(cases.length);
  });

  test("ids are unchanged by membership — promotion adds cells, it never renames one", () => {
    // The same theme, swept both ways. Every id the reduced sweep produces is an
    // id the full sweep produces too, spelled identically — so a theme promoted
    // to the full matrix keeps the baselines it already has.
    const components = discoverComponents();
    const reduced = buildMatrix(components, ["twin"], () => ({ visual_matrix: false }));
    const full = buildMatrix(components, ["twin"], () => null);
    const fullIds = new Set(full.map((c) => c.id));
    for (const c of reduced) expect(fullIds.has(c.id), `${c.id} renamed by the split`).toBe(true);
    expect(reduced.length).toBeLessThan(full.length);

    // And every matrix theme's shipped ids are byte-identical to the pre-policy
    // cross-product — the baselines the suite already has did not move.
    const matrixThemes = discoverThemes({ matrix: true });
    const member = new Set(matrixThemes);
    const expected = new Set<string>();
    for (const component of components) {
      for (const theme of matrixThemes) {
        for (const scheme of SCHEMES) {
          for (const dir of DIRECTIONS) {
            expected.add(`${component.kind}__${component.name}__${theme}__${scheme}__${dir}`);
          }
        }
      }
    }
    const shipped = buildMatrix().filter((c) => member.has(c.theme));
    expect(new Set(shipped.map((c) => c.id))).toEqual(expected);
  });

  test("a reduced theme still gets a structural render of most of the registry", () => {
    // The justification for the cheap sweep, measured rather than asserted: a
    // pattern composes primitives and recipes, so a patterns-only theme is not a
    // theme nobody looked at. At the current registry the 15 patterns mount **47
    // of the 85 distinct component names** — 55%, for 8.7% of the captures. The
    // rest are mostly floating chrome a controller opens (toast, tooltip,
    // popover, drawer, sheet, the overlay menus) plus leaf primitives no pattern
    // happens to use; they are swept in full in every matrix theme, which is
    // exactly the trade the policy makes.
    const patterns = discoverComponents().filter((c) => c.kind === REDUCED_SWEEP_KIND);
    const markup = patterns.map((p) => readFileSync(p.htmlPath, "utf8")).join("\n");
    const used = new Set<string>();
    for (const m of markup.matchAll(/data-ui="([a-z0-9-]+)"/g)) used.add(m[1]);
    const all = new Set(discoverComponents().map((c) => c.name));
    const covered = [...all].filter((n) => used.has(n));
    expect(
      covered.length,
      `patterns mount ${covered.length}/${all.size} components`,
    ).toBeGreaterThanOrEqual(45);
    expect(covered.length / all.size).toBeGreaterThan(0.5);
    // Every pattern pulls its weight: none is a page that mounts nothing.
    for (const p of patterns) {
      const own = readFileSync(p.htmlPath, "utf8").match(/data-ui="[a-z0-9-]+"/g) ?? [];
      expect(own.length, `${p.name} mounts components`).toBeGreaterThan(1);
    }
  });

  test("a component the reduced sweep skips is one the full sweep still has", () => {
    // The gate must be non-vacuous in the other direction too: prove the filter
    // actually removes something, with a synthetic non-pattern component.
    const synthetic: Component = {
      name: "fixture-widget",
      kind: "primitive",
      htmlRel: "registry/primitives/fixture-widget/fixture-widget.html",
      htmlPath: "/nowhere/fixture-widget.html",
    };
    const reduced = buildMatrix([synthetic], ["r"], () => ({ visual_matrix: false }));
    expect(reduced).toEqual([]);
    const full = buildMatrix([synthetic], ["r"], () => null);
    expect(full.length).toBe(SCHEMES.length * DIRECTIONS.length);
  });
});
