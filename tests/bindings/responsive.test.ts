// Responsive variant groups through the bindings codegen (task 0.8-02).
//
// A manifest declares `"responsive": true` ONCE; every binding target expands it
// into typed per-tier props with no target-specific and no component-specific
// code. These tests drive the real emitters over a synthetic probe manifest —
// no registry component declares a responsive group yet (0.8-03/0.8-04 are the
// first), so the contract is proven here before the CSS lands rather than after.

import { describe, it, expect, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { manifestToIR, responsiveTierVariants, variantTypeName } from "../../src/bindings/ir";
import { loadRecipeBundle } from "../../src/bindings/recipe-ir";
import { emitVueComponent, emitVueRecipe } from "../../src/bindings/vue";
import { emitReactComponent, emitReactRecipe } from "../../src/bindings/react";
import { TIERS } from "../../src/utils/breakpoints";
import type { Manifest } from "../../src/manifest";

const TMP = join(import.meta.dir, ".tmp-responsive");

const PROBE: Manifest = {
  name: "zz-grid",
  version: "1.0.0",
  kind: "primitive",
  category: "layout",
  description: "Probe grid with one responsive group and one plain group.",
  anatomy: { tag: "div", selector: "[data-ui='zz-grid']", content_model: "block" },
  slots: {},
  variants: {
    cols: {
      values: ["1", "2", "3", "4"],
      default: "1",
      attr: "data-cols",
      applied_to: "root",
      responsive: true,
    },
    gap: { values: ["0", "4"], default: "4", attr: "data-gap", applied_to: "root" },
  },
  states: {},
  a11y: {},
  tokens_used: [],
  templates: { html: '<div data-ui="zz-grid"></div>' },
  safe_transforms: [],
  unsafe_transforms: [],
  composition: { contains: [], used_in: [] },
  files: { html: "zz-grid.html", css: "zz-grid.css", manifest: "zz-grid.manifest.json" },
  tests: [],
};

const ir = manifestToIR(PROBE, "registry/primitives/zz-grid/zz-grid.manifest.json");

describe("responsive groups in the primitive IR", () => {
  it("expands one declaration into one prop per canon tier", () => {
    expect(ir.variants.map((v) => v.prop)).toEqual([
      "cols",
      "colsSm",
      "colsMd",
      "colsLg",
      "colsXl",
      "gap",
    ]);
    const tiers = ir.variants.filter((v) => v.tier);
    expect(tiers.map((v) => v.attr)).toEqual([
      "data-cols-sm",
      "data-cols-md",
      "data-cols-lg",
      "data-cols-xl",
    ]);
    expect(tiers.every((v) => v.basedOn === "cols")).toBe(true);
    // Every tier prop carries the base group's values — the union is shared.
    for (const v of tiers) expect(v.values).toEqual(["1", "2", "3", "4"]);
  });

  it("leaves a non-responsive group alone", () => {
    expect(ir.variants.filter((v) => v.group === "gap").map((v) => v.prop)).toEqual(["gap"]);
  });

  it("points every tier prop at the base group's type", () => {
    for (const v of ir.variants.filter((x) => x.tier)) {
      expect(variantTypeName(ir.componentName, v)).toBe("LZzGridCols");
    }
  });

  it("refuses to make a protocol attribute responsive", () => {
    expect(() =>
      responsiveTierVariants({
        prop: "size",
        attr: "data-size",
        values: ["sm"],
        default: "sm",
        group: "size",
      }),
    ).toThrow(/protocol attribute/);

    const bad: Manifest = {
      ...PROBE,
      variants: {
        size: { values: ["sm", "lg"], default: "sm", attr: "data-size", responsive: true },
      },
    };
    expect(() => manifestToIR(bad, "x")).toThrow(/protocol attribute/);
  });
});

describe("vue emits typed per-tier props", () => {
  const source = emitVueComponent(ir);

  it("declares one union type, not five", () => {
    expect(source).toContain(`export type LZzGridCols = "1" | "2" | "3" | "4";`);
    for (const tier of TIERS) {
      expect(source).not.toContain(`export type LZzGridCols${tier[0].toUpperCase()}${tier[1]} =`);
    }
  });

  it("types every tier prop with the base union", () => {
    expect(source).toContain("cols?: LZzGridCols;");
    expect(source).toContain("colsSm?: LZzGridCols;");
    expect(source).toContain("colsMd?: LZzGridCols;");
    expect(source).toContain("colsLg?: LZzGridCols;");
    expect(source).toContain("colsXl?: LZzGridCols;");
  });

  it("passes each tier attribute to the runtime spec", () => {
    expect(source).toContain(
      `{ prop: "colsMd", attr: "data-cols-md", values: ["1", "2", "3", "4"] },`,
    );
  });

  it("documents the grammar on the prop", () => {
    expect(source).toContain("the `cols` value from the `md` breakpoint up");
  });
});

describe("react emits the same props from the same IR", () => {
  const source = emitReactComponent(ir);

  it("declares one union type and five props", () => {
    expect(source).toContain(`export type LZzGridCols = "1" | "2" | "3" | "4";`);
    expect(source.match(/export type LZzGrid/g)?.length).toBe(2); // Cols + Gap
    for (const prop of ["cols", "colsSm", "colsMd", "colsLg", "colsXl"]) {
      expect(source).toContain(`${prop}?: LZzGridCols;`);
    }
  });

  it("omits the tier props from the intrinsic-element base type", () => {
    // They are Faqir-declared names, so they must be Omit-ed like any other.
    expect(source).toContain(`"colsMd"`);
    expect(source).toContain(
      `{ prop: "colsXl", attr: "data-cols-xl", values: ["1", "2", "3", "4"] },`,
    );
  });
});

// ── recipes take the same path ───────────────────────────────────────────────

describe("responsive groups in the recipe IR", () => {
  const registry = join(TMP, "registry");

  afterAll(() => rmSync(TMP, { recursive: true, force: true }));

  it("expands and attaches tier attributes onto the same element", async () => {
    const dir = join(registry, "recipes", "zz-panel");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "zz-panel.manifest.json"),
      JSON.stringify({
        name: "zz-panel",
        version: "1.0.0",
        kind: "recipe",
        category: "layout",
        description: "Probe recipe with a responsive group.",
        anatomy: { tag: "div", selector: "[data-ui='zz-panel']", content_model: "block" },
        slots: {},
        variants: {
          cols: {
            values: ["1", "2"],
            default: "1",
            attr: "data-cols",
            applied_to: "root",
            responsive: true,
          },
        },
        states: {},
        a11y: {},
        tokens_used: [],
        templates: { html: '<div data-ui="zz-panel"></div>' },
        safe_transforms: [],
        unsafe_transforms: [],
        composition: { contains: [], used_in: [] },
        files: {
          html: "zz-panel.html",
          css: "zz-panel.css",
          js: "zz-panel.js",
          manifest: "zz-panel.manifest.json",
        },
        tests: [],
      }),
    );
    writeFileSync(
      join(dir, "zz-panel.js"),
      "// @ui:provides destroy\nexport function createZzPanel(root) {\n  return { destroy() {} };\n}\n",
    );

    const bundle = await loadRecipeBundle(registry);
    const recipe = bundle.irs[0];
    expect(recipe.variantProps.map((v) => v.prop).sort()).toEqual([
      "cols",
      "colsLg",
      "colsMd",
      "colsSm",
      "colsXl",
    ]);
    // All five write onto the root node of the render tree.
    expect(recipe.tree.dyn).toEqual([
      ["cols", "data-cols"],
      ["colsSm", "data-cols-sm"],
      ["colsMd", "data-cols-md"],
      ["colsLg", "data-cols-lg"],
      ["colsXl", "data-cols-xl"],
    ]);

    for (const source of [emitVueRecipe(recipe), emitReactRecipe(recipe)]) {
      expect(source).toContain(`export type LZzPanelCols = "1" | "2";`);
      expect(source).not.toContain("export type LZzPanelColsMd");
      expect(source).toContain("colsMd?: LZzPanelCols;");
      expect(source).toContain(`{ prop: "colsMd", values: ["1", "2"] },`);
    }
  });
});
