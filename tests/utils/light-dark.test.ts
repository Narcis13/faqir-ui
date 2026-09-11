// ═══════════════════════════════════════════════════════════════════════════
// light-dark() authoring — the parser contract  [task 1.1A-06]
// ═══════════════════════════════════════════════════════════════════════════
//
// A theme may state both schemes in ONE `:root` block by writing
// `light-dark(<light>, <dark>)` instead of repeating its whole token set in a
// `[data-theme="dark"]` block and again in the `prefers-color-scheme` mirror.
// Every browser-free gate this repo owns — coverage, contrast, elevation,
// focus-ring, the generator's own pre-write verification — reads a theme through
// `parseThemeValues`. So the moment a theme is migrated, those gates either
// understand the function or go silently quiet on it, which is the worst thing a
// gate can do. This file is that understanding, stated as cases.

import { describe, it, expect } from "bun:test";
import {
  hasLightDark,
  parseThemeValues,
  substituteLightDark,
  flattenLayers,
  resolveColorString,
} from "../../src/utils/oklch";

describe("substituteLightDark · picks one scheme's argument", () => {
  it("resolves a plain call to either side", () => {
    expect(substituteLightDark("light-dark(white, black)", "light")).toBe("white");
    expect(substituteLightDark("light-dark(white, black)", "dark")).toBe("black");
  });

  it("keeps a value with no call verbatim", () => {
    for (const value of ["white", "var(--palette-gray-50)", "0 1px 2px oklch(0 0 0 / 0.1)"]) {
      expect(substituteLightDark(value, "light")).toBe(value);
      expect(substituteLightDark(value, "dark")).toBe(value);
    }
  });

  it("splits at the TOP-LEVEL comma, so a var() fallback stays with its side", () => {
    // Three commas, one separator. A naive split would hand `red` to dark.
    const value = "light-dark(var(--a, red), var(--b, blue))";
    expect(substituteLightDark(value, "light")).toBe("var(--a, red)");
    expect(substituteLightDark(value, "dark")).toBe("var(--b, blue)");
  });

  it("handles nested parentheses in either argument", () => {
    const value = "light-dark(oklch(0.96 0.03 25), color-mix(in oklch, var(--x) 20%, black))";
    expect(substituteLightDark(value, "light")).toBe("oklch(0.96 0.03 25)");
    expect(substituteLightDark(value, "dark")).toBe("color-mix(in oklch, var(--x) 20%, black)");
  });

  it("resolves a call nested inside a larger value, not only a whole value", () => {
    const value = "0 1px 2px light-dark(oklch(0 0 0 / 0.04), oklch(0 0 0 / 0.3))";
    expect(substituteLightDark(value, "light")).toBe("0 1px 2px oklch(0 0 0 / 0.04)");
    expect(substituteLightDark(value, "dark")).toBe("0 1px 2px oklch(0 0 0 / 0.3)");
  });

  it("resolves every call in a value, and calls nested inside a chosen argument", () => {
    const two = "light-dark(a, b) light-dark(c, d)";
    expect(substituteLightDark(two, "light")).toBe("a c");
    expect(substituteLightDark(two, "dark")).toBe("b d");

    const nested = "light-dark(light-dark(a, b), light-dark(c, d))";
    expect(substituteLightDark(nested, "light")).toBe("a");
    expect(substituteLightDark(nested, "dark")).toBe("d");
  });

  it("tolerates whitespace and newlines around the arguments", () => {
    const value = "light-dark(\n  var(--palette-gray-25),\n  var(--palette-gray-950)\n)";
    expect(substituteLightDark(value, "light")).toBe("var(--palette-gray-25)");
    expect(substituteLightDark(value, "dark")).toBe("var(--palette-gray-950)");
  });

  it("leaves a malformed call verbatim rather than guessing at it", () => {
    // Unbalanced, and single-argument. Both are values a browser rejects too;
    // inventing a side here would hide the authoring error from every gate.
    expect(substituteLightDark("light-dark(white, black", "dark")).toBe("light-dark(white, black");
    expect(substituteLightDark("light-dark(white)", "dark")).toBe("light-dark(white)");
  });

  it("does not treat a token whose NAME ends in light-dark as a call", () => {
    expect(hasLightDark("var(--my-light-dark)")).toBe(false);
    expect(substituteLightDark("var(--my-light-dark)", "dark")).toBe("var(--my-light-dark)");
    expect(hasLightDark("light-dark(a, b)")).toBe(true);
  });
});

describe("parseThemeValues · a one-block theme covers dark and auto", () => {
  const ONE_BLOCK = `/* @ui:theme one */
:root {
  --color-bg: light-dark(var(--palette-gray-25), var(--palette-gray-950));
  --color-fg: light-dark(black, white);
}`;

  it("routes each argument to its scheme", () => {
    const v = parseThemeValues(ONE_BLOCK);
    expect(v.light.get("color-bg")).toBe("var(--palette-gray-25)");
    expect(v.dark.get("color-bg")).toBe("var(--palette-gray-950)");
    expect(v.auto.get("color-bg")).toBe("var(--palette-gray-950)");
    expect(v.light.get("color-fg")).toBe("black");
    expect(v.dark.get("color-fg")).toBe("white");
  });

  it("lets an explicit block win over the function for the same token", () => {
    // The cascade: `[data-theme="dark"]` is (0,1,0) and `:root` is (0,0,1), so a
    // block outranks whatever the function in `:root` would have picked.
    const both = `${ONE_BLOCK}
[data-theme="dark"] { --color-fg: gray; }
@media (prefers-color-scheme: dark) { [data-theme="auto"] { --color-fg: gray; } }`;
    const v = parseThemeValues(both);
    expect(v.dark.get("color-fg")).toBe("gray");
    expect(v.auto.get("color-fg")).toBe("gray");
    // …and the token the block does NOT restate still comes from the function.
    expect(v.dark.get("color-bg")).toBe("var(--palette-gray-950)");
  });

  it("resolves a light-dark() written INSIDE a dark block for dark", () => {
    const v = parseThemeValues(`[data-theme="dark"] { --color-fg: light-dark(black, white); }`);
    expect(v.dark.get("color-fg")).toBe("white");
  });

  it("carries scheme-awareness through a var() chain", () => {
    // `--color-surface-1` needs no second spelling: the token it reads has one.
    const v = parseThemeValues(`${ONE_BLOCK.slice(0, -1)}
  --color-surface-1: var(--color-bg);
  --card-bg: var(--color-surface-1);
}`);
    expect(v.dark.get("color-surface-1")).toBe("var(--color-bg)");
    expect(v.dark.get("card-bg")).toBe("var(--color-surface-1)");
    // …and it resolves, through the dark lookup, to the dark colour.
    const lookup = flattenLayers([v.dark, new Map([["palette-gray-950", "oklch(0.13 0 0)"]])]);
    expect(resolveColorString("var(--card-bg)", lookup)).toBe("oklch(0.13 0 0)");
  });

  it("does NOT make a literal in :root count as a dark value", () => {
    // This is the whole point of the coverage gate: `--color-bg: white` in
    // `:root` is a LIGHT value, and a dark scheme leaning on it is the gap.
    const v = parseThemeValues(`:root { --color-bg: white; --color-fg: var(--palette-gray-950); }`);
    expect(v.dark.has("color-bg")).toBe(false);
    expect(v.dark.has("color-fg")).toBe(false);
  });

  it("strips comments before attributing declarations", () => {
    const v = parseThemeValues(`:root {
  /* a comment mentioning [data-theme="dark"] and light-dark(x, y) */
  --color-bg: light-dark(white, /* mid-value */ black);
}`);
    expect(v.light.get("color-bg")).toBe("white");
    expect(v.dark.get("color-bg")).toBe("black");
  });

  it("gives a single-scheme theme nothing to cover dark with", () => {
    // `light-dark()` in a light-only theme is a contradiction, not a feature:
    // the light side is all that renders. The parser keeps the light value and
    // still reports the dark contribution, which is what the coverage gate turns
    // into "single-scheme claim is inconsistent with the CSS".
    const lightOnly = `/* @ui:schemes light */
:root { --color-bg: white; --color-fg: light-dark(black, white); }`;
    const v = parseThemeValues(lightOnly);
    expect(v.light.get("color-bg")).toBe("white");
    expect(v.light.get("color-fg")).toBe("black");
    expect([...v.dark.keys()]).toEqual(["color-fg"]);
  });

  it("leaves a theme with neither form untouched in dark and auto", () => {
    const v = parseThemeValues(`:root { --color-bg: white; }`);
    expect(v.dark.size).toBe(0);
    expect(v.auto.size).toBe(0);
  });
});
