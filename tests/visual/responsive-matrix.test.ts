/**
 * Meta-tests for the viewport axis — task 0.8-11 (FAQIR-NEXT §19).
 *
 * These run in the ordinary `bun test` suite (no browser). They guard the two
 * things the Playwright run cannot:
 *
 *   1. **Discovery.** The layout-bearing set is derived from manifests, so a new
 *      layout primitive or pattern enters the suite with zero edits. The
 *      screenshot suite can only prove the set it was handed; only a test that
 *      re-derives the set from disk — and one that hands the builder a synthetic
 *      component — can prove the *property*.
 *   2. **The pre-assertion's failure modes.** `checkLayoutFacts` is pure over a
 *      plain facts object, so every way a responsive rule can break is
 *      reproducible here from a literal: a grid that ignored its tier override,
 *      a drawer that stayed in flow on a phone, an inbox showing both panes.
 *      The browser proves the gatherer; this proves the judgement.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { discoverComponents, REGISTRY, type Component } from "./matrix";
import {
  LAYOUT_CATEGORY,
  LAYOUT_LAYER,
  RESPONSIVE_DIRECTION,
  RESPONSIVE_SCHEME,
  RESPONSIVE_THEME,
  RESPONSIVE_WIDTHS,
  activeTiers,
  buildResponsiveMatrix,
  checkLayoutFacts,
  discoverLayoutBearing,
  isLayoutBearing,
  manifestPathFor,
  readLayoutManifest,
  resolveTierValue,
  type LayoutFacts,
} from "./responsive-matrix";
import { BREAKPOINTS } from "../../src/utils/breakpoints";

describe("responsive set discovery (manifest-driven, never hand-listed)", () => {
  test("every discovered component has a sibling manifest to classify it by", () => {
    const orphans = discoverComponents().filter((c) => !existsSync(manifestPathFor(c)));
    expect(orphans.map((c) => c.htmlRel), "reference pages with no manifest").toEqual([]);
  });

  test("the set is exactly {category: layout} ∪ {kind: pattern}, re-derived from disk", () => {
    // Ground truth, independent of the module: read every manifest directly.
    const expected: string[] = [];
    for (const rel of new Glob("{primitives,recipes,patterns}/**/*.manifest.json").scanSync(
      REGISTRY,
    )) {
      const m = JSON.parse(readFileSync(join(REGISTRY, rel), "utf8"));
      if (m.category === LAYOUT_CATEGORY || m.kind === LAYOUT_LAYER) {
        expected.push(`${m.kind}__${m.name}`);
      }
    }
    expect(expected.length).toBeGreaterThan(0);

    const actual = discoverLayoutBearing().map((c) => `${c.kind}__${c.name}`);
    expect(actual.sort()).toEqual(expected.sort());
  });

  test("every pattern is in, and no non-layout primitive sneaks in", () => {
    const set = new Set(discoverLayoutBearing().map((c) => c.name));
    // Layer clause: patterns own the page, so all of them are layout-bearing.
    for (const name of ["dashboard-shell", "inbox", "auth-form", "hero", "pricing", "document"]) {
      expect(set.has(name), `${name} (a pattern) must be in the responsive set`).toBe(true);
    }
    // Category clause.
    for (const name of ["grid", "stack", "cluster", "container", "switcher", "card", "surface"]) {
      expect(set.has(name), `${name} (category: layout) must be in the responsive set`).toBe(true);
    }
    // …and the rest of the registry stays out: 78 captures, not 258.
    for (const name of ["button", "input", "table", "badge", "tooltip", "calendar"]) {
      expect(set.has(name), `${name} must NOT be in the responsive set`).toBe(false);
    }
  });

  test("a NEW layout component enters with zero suite edits", () => {
    // The property, proven without touching the registry: hand the discoverer a
    // component it has never seen and a manifest reader that classifies it.
    const invented: Component = {
      name: "zz-invented-layout",
      kind: "primitive",
      htmlRel: "registry/primitives/zz-invented-layout/zz-invented-layout.html",
      htmlPath: "/nowhere/zz-invented-layout.html",
    };
    const real = discoverComponents();

    const asLayout = discoverLayoutBearing([...real, invented], (c) =>
      c === invented ? { kind: "primitive", category: LAYOUT_CATEGORY } : readLayoutManifest(c),
    );
    expect(asLayout.map((c) => c.name)).toContain("zz-invented-layout");
    expect(asLayout.length).toBe(discoverLayoutBearing().length + 1);

    // A new pattern too — via the layer clause, whatever its category.
    const asPattern = discoverLayoutBearing([...real, invented], (c) =>
      c === invented ? { kind: LAYOUT_LAYER, category: "marketing" } : readLayoutManifest(c),
    );
    expect(asPattern.map((c) => c.name)).toContain("zz-invented-layout");

    // And a component that is neither stays out — the filter is a filter.
    const excluded = discoverLayoutBearing([...real, invented], (c) =>
      c === invented ? { kind: "primitive", category: "forms" } : readLayoutManifest(c),
    );
    expect(excluded.map((c) => c.name)).not.toContain("zz-invented-layout");
    expect(excluded.length).toBe(discoverLayoutBearing().length);
  });

  test("isLayoutBearing is total over the manifest shapes it can meet", () => {
    expect(isLayoutBearing({ kind: "primitive", category: "layout" })).toBe(true);
    expect(isLayoutBearing({ kind: "pattern", category: "composite" })).toBe(true);
    expect(isLayoutBearing({ kind: "recipe", category: "layout" })).toBe(true);
    expect(isLayoutBearing({ kind: "primitive", category: "forms" })).toBe(false);
    expect(isLayoutBearing({})).toBe(false);
    expect(isLayoutBearing(null)).toBe(false);
  });
});

describe("responsive matrix generation", () => {
  test("matrix is the set × the three canon-relevant widths, unique ids", () => {
    const components = discoverLayoutBearing();
    const matrix = buildResponsiveMatrix();

    expect(RESPONSIVE_WIDTHS).toEqual([390, 768, 1280]);
    expect(matrix.length).toBe(components.length * RESPONSIVE_WIDTHS.length);

    const ids = new Set(matrix.map((c) => c.id));
    expect(ids.size).toBe(matrix.length);
    // The id carries the kind, which is what keeps the two `empty-state`
    // components (the feedback primitive and the composite pattern) apart.
    expect(ids.has("responsive__pattern__empty-state__390")).toBe(true);
    expect(ids.has("responsive__primitive__grid__1280")).toBe(true);
  });

  test("the axis is deliberately one theme, one scheme, one direction", () => {
    // ×12 themes ×2 schemes ×2 dirs would be 12× the captures for information
    // the single-viewport matrix already carries. Pin the decision.
    for (const c of buildResponsiveMatrix()) {
      expect(c.theme).toBe(RESPONSIVE_THEME);
      expect(c.scheme).toBe(RESPONSIVE_SCHEME);
      expect(c.dir).toBe(RESPONSIVE_DIRECTION);
    }
  });

  test("the widths sit where the canon says they do", () => {
    // 390 is below every floor; 768 IS the md floor (a boundary width belongs to
    // the wide side under min-width semantics); 1280 IS the xl floor.
    expect(activeTiers(390)).toEqual([]);
    expect(activeTiers(768)).toEqual(["sm", "md"]);
    expect(activeTiers(1280)).toEqual(["sm", "md", "lg", "xl"]);
    expect(BREAKPOINTS.md.px).toBe(768);
    expect(BREAKPOINTS.xl.px).toBe(1280);
  });
});

describe("resolveTierValue — the mobile-first ladder, read from markup", () => {
  const attrs = { "data-cols": "1", "data-cols-md": "2", "data-cols-lg": "4", "data-gap": "6" };

  test("the widest matching tier wins, base below every floor", () => {
    expect(resolveTierValue(attrs, "cols", 390)).toBe("1");
    expect(resolveTierValue(attrs, "cols", 640)).toBe("1"); // sm floor, no sm value
    expect(resolveTierValue(attrs, "cols", 767)).toBe("1");
    expect(resolveTierValue(attrs, "cols", 768)).toBe("2"); // the md floor itself
    expect(resolveTierValue(attrs, "cols", 1023)).toBe("2");
    expect(resolveTierValue(attrs, "cols", 1024)).toBe("4");
    expect(resolveTierValue(attrs, "cols", 1280)).toBe("4"); // no xl value: lg holds
  });

  test("a fractional width in the old dead zone still resolves (0.8-01)", () => {
    // The retired range pair matched neither at 640.5px. A floor ladder has no gap.
    expect(resolveTierValue(attrs, "cols", 640.5)).toBe("1");
    expect(resolveTierValue(attrs, "cols", 768.5)).toBe("2");
  });

  test("an attribute with no ladder at all is undefined, not a guess", () => {
    expect(resolveTierValue(attrs, "min", 1280)).toBeUndefined();
    expect(resolveTierValue({}, "cols", 1280)).toBeUndefined();
  });
});

describe("checkLayoutFacts — the pre-assertion's failure modes", () => {
  const grid = (
    attrs: Record<string, string>,
    trackCount: number,
    display = "grid",
  ): LayoutFacts["grids"][number] => ({ where: '[data-ui="grid"]#0', attrs, display, trackCount });

  test("a grid that computed what its markup authored is silent", () => {
    expect(
      checkLayoutFacts({
        width: 768,
        grids: [grid({ "data-cols": "1", "data-cols-md": "2" }, 2)],
      }),
    ).toEqual([]);
    expect(
      checkLayoutFacts({ width: 390, grids: [grid({ "data-cols": "1", "data-cols-md": "2" }, 1)] }),
    ).toEqual([]);
  });

  test("a grid that ignored its md override is caught, with the numbers in the message", () => {
    const problems = checkLayoutFacts({
      width: 768,
      grids: [grid({ "data-cols": "1", "data-cols-md": "2" }, 1)],
    });
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain("expected 2 columns");
    expect(problems[0]).toContain("computed 1");
    expect(problems[0]).toContain("tiers active: sm, md");
    expect(problems[0]).toContain("@768px");
  });

  test("a collapse that fired too early is caught too (the inverse regression)", () => {
    const problems = checkLayoutFacts({
      width: 390,
      grids: [grid({ "data-cols": "1", "data-cols-md": "2" }, 2)],
    });
    expect(problems[0]).toContain("expected 1 columns");
    expect(problems[0]).toContain("below every canon floor");
  });

  test("intrinsic mode is checked for tracks, not for a count it cannot have", () => {
    expect(
      checkLayoutFacts({ width: 390, grids: [grid({ "data-cols": "auto", "data-min": "16" }, 1)] }),
    ).toEqual([]);
    const collapsed = checkLayoutFacts({
      width: 390,
      grids: [grid({ "data-cols": "auto" }, 0)],
    });
    expect(collapsed[0]).toContain('data-cols="auto" resolved to no tracks');
  });

  test("a data-scroll strip is a flex snap strip below sm and a grid from sm up", () => {
    const strip = { "data-cols": "4", "data-scroll": "" };
    expect(checkLayoutFacts({ width: 390, grids: [grid(strip, 0, "flex")] })).toEqual([]);
    expect(checkLayoutFacts({ width: 768, grids: [grid(strip, 4, "grid")] })).toEqual([]);

    // Below sm it must NOT still be a grid…
    expect(checkLayoutFacts({ width: 390, grids: [grid(strip, 4, "grid")] })[0]).toContain(
      "flex snap strip",
    );
    // …and from sm up it must NOT still be a strip.
    expect(checkLayoutFacts({ width: 768, grids: [grid(strip, 0, "flex")] })[0]).toContain(
      "expected display: grid",
    );
  });

  test("the drawer archetype: fixed + one column below md, static + two from md up", () => {
    expect(
      checkLayoutFacts({ width: 390, grids: [], drawer: { position: "fixed", shellTrackCount: 1 } }),
    ).toEqual([]);
    expect(
      checkLayoutFacts({
        width: 768,
        grids: [],
        drawer: { position: "static", shellTrackCount: 2 },
      }),
    ).toEqual([]);

    const stuckInFlow = checkLayoutFacts({
      width: 390,
      grids: [],
      drawer: { position: "static", shellTrackCount: 2 },
    });
    expect(stuckInFlow.join("\n")).toContain("expected an off-canvas drawer");
    expect(stuckInFlow.join("\n")).toContain("single-column shell");

    const stuckOffCanvas = checkLayoutFacts({
      width: 1280,
      grids: [],
      drawer: { position: "fixed", shellTrackCount: 1 },
    });
    expect(stuckOffCanvas.join("\n")).toContain("position: static from the md floor up");
    expect(stuckOffCanvas.join("\n")).toContain("two-column shell");
  });

  test("the pane archetype: one pane below md, both (and no back link) from md up", () => {
    expect(
      checkLayoutFacts({
        width: 390,
        grids: [],
        panes: { listVisible: true, detailVisible: false, backVisible: true },
      }),
    ).toEqual([]);
    expect(
      checkLayoutFacts({
        width: 1280,
        grids: [],
        panes: { listVisible: true, detailVisible: true, backVisible: false },
      }),
    ).toEqual([]);

    expect(
      checkLayoutFacts({
        width: 390,
        grids: [],
        panes: { listVisible: true, detailVisible: true, backVisible: true },
      })[0],
    ).toContain("expected exactly the active pane");

    const desktop = checkLayoutFacts({
      width: 768,
      grids: [],
      panes: { listVisible: true, detailVisible: false, backVisible: true },
    });
    expect(desktop.join("\n")).toContain("expected both panes");
    expect(desktop.join("\n")).toContain("back link is phone-only");
  });

  test("a page with nothing responsive on it reports nothing (no false positives)", () => {
    expect(checkLayoutFacts({ width: 390, grids: [] })).toEqual([]);
    expect(checkLayoutFacts({ width: 1280, grids: [grid({ "data-gap": "4" }, 3)] })).toEqual([]);
  });
});
