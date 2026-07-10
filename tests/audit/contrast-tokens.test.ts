// contrast-tokens audit rule (task 0.4-16): static WCAG-AA contrast over a
// theme's declared token pairs. Pure oklch → sRGB → luminance math, plus token
// graph resolution (theme → semantic → palette). No browser.

import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  oklchToLinearRgb,
  relativeLuminance,
  contrastRatio,
  contrastOf,
  resolveColorString,
  parseCssColor,
  type LinearRgb,
} from "../../src/utils/oklch";
import {
  checkThemeContrast,
  buildSchemeLookups,
  CONTRAST_PAIRS,
  CONTRAST_AA,
  CONTRAST_TOKENS_RULE,
} from "../../src/audit/contrast-tokens";

const TOKENS_DIR = join(import.meta.dir, "../../registry/tokens");
const THEMES_DIR = join(import.meta.dir, "../../registry/themes");

const BASE_CSS =
  readFileSync(join(TOKENS_DIR, "palette.css"), "utf8") +
  "\n" +
  readFileSync(join(TOKENS_DIR, "semantic.css"), "utf8") +
  "\n" +
  readFileSync(join(TOKENS_DIR, "aliases.css"), "utf8");

// ── sRGB gamma decode, so we can feed *published* sRGB hex examples (which is
//    how WCAG states them) into the WCAG luminance/contrast math. This is only
//    for the test — themes author in oklch, decoded by oklchToLinearRgb. ──────
function srgbHexToLinear(hex: string): LinearRgb {
  const n = parseInt(hex.replace("#", ""), 16);
  const to = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return { r: to((n >> 16) & 255), g: to((n >> 8) & 255), b: to(n & 255) };
}
const contrastHex = (a: string, b: string) =>
  contrastRatio(srgbHexToLinear(a), srgbHexToLinear(b));

// ═══════════════════════════ Ratio math vs published WCAG examples ══════════
describe("contrast math · published WCAG examples (±ε)", () => {
  // The canonical anchors.
  it("white on black is exactly 21:1", () => {
    expect(contrastHex("#ffffff", "#000000")).toBeCloseTo(21, 4);
  });

  // WebAIM / W3C-published ratios for well-known sRGB pairs.
  it("#767676 on white ≈ 4.54:1 (the AA boundary gray)", () => {
    expect(contrastHex("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
  });
  it("pure red #ff0000 on white ≈ 4.0:1", () => {
    expect(contrastHex("#ff0000", "#ffffff")).toBeCloseTo(4.0, 1);
  });
  it("pure blue #0000ff on white ≈ 8.59:1", () => {
    expect(contrastHex("#0000ff", "#ffffff")).toBeCloseTo(8.59, 1);
  });
  it("#595959 on white ≈ 7:1 (AAA boundary gray)", () => {
    expect(contrastHex("#595959", "#ffffff")).toBeCloseTo(7.0, 1);
  });

  it("relative luminance uses the WCAG channel weights (0.2126/0.7152/0.0722)", () => {
    expect(relativeLuminance({ r: 1, g: 0, b: 0 })).toBeCloseTo(0.2126, 6);
    expect(relativeLuminance({ r: 0, g: 1, b: 0 })).toBeCloseTo(0.7152, 6);
    expect(relativeLuminance({ r: 0, g: 0, b: 1 })).toBeCloseTo(0.0722, 6);
  });

  it("contrast is order-independent and ≥ 1", () => {
    const a = "oklch(0.55 0.22 20)";
    const b = "oklch(0.98 0.01 20)";
    expect(contrastOf(a, b)).toBeCloseTo(contrastOf(b, a), 10);
    expect(contrastOf(a, a)).toBeCloseTo(1, 10);
  });
});

// ═══════════════════════════ oklch → sRGB conversion vs references ══════════
describe("oklch → linear sRGB · known reference points (±ε)", () => {
  // oklch values for the sRGB primaries (CSS Color 4 reference conversions).
  const REF: Array<[string, [number, number, number], LinearRgb]> = [
    ["white", [1, 0, 0], { r: 1, g: 1, b: 1 }],
    ["black", [0, 0, 0], { r: 0, g: 0, b: 0 }],
    ["red", [0.628, 0.2577, 29.23], { r: 1, g: 0, b: 0 }],
    ["green", [0.8664, 0.2948, 142.5], { r: 0, g: 1, b: 0 }],
    ["blue", [0.452, 0.3132, 264.05], { r: 0, g: 0, b: 1 }],
  ];
  for (const [name, [L, C, H], want] of REF) {
    it(`oklch ${name} round-trips to linear sRGB {${want.r}, ${want.g}, ${want.b}}`, () => {
      const got = oklchToLinearRgb(L, C, H);
      expect(got.r).toBeCloseTo(want.r, 2);
      expect(got.g).toBeCloseTo(want.g, 2);
      expect(got.b).toBeCloseTo(want.b, 2);
    });
  }

  it("a chroma-0 oklch is a true neutral (r = g = b)", () => {
    const g = oklchToLinearRgb(0.5, 0, 0);
    expect(g.r).toBeCloseTo(g.g, 6);
    expect(g.g).toBeCloseTo(g.b, 6);
  });
});

// ═══════════════════════════ Token-graph resolution (3-layer chain) ═════════
describe("token graph · resolves alias → semantic → palette", () => {
  it("follows a 3-hop var() chain to the palette literal", () => {
    // alias → semantic → palette → oklch, exactly the registry's layering.
    const lookup = new Map<string, string>([
      ["card-ink", "var(--color-fg)"], // component alias
      ["color-fg", "var(--palette-gray-950)"], // semantic
      ["palette-gray-950", "oklch(0.14 0.01 260)"], // palette literal
    ]);
    expect(resolveColorString("var(--card-ink)", lookup)).toBe("oklch(0.14 0.01 260)");
  });

  it("honors a var() inline fallback when the token is undefined", () => {
    const lookup = new Map<string, string>();
    expect(resolveColorString("var(--missing, white)", lookup)).toBe("white");
  });

  it("dead-ends (undefined token, gradient) resolve to null, not a wrong color", () => {
    const lookup = new Map<string, string>([["x", "linear-gradient(red, blue)"]]);
    expect(resolveColorString("var(--x)", lookup)).toBeNull();
    expect(resolveColorString("var(--nope)", new Map())).toBeNull();
  });

  it("is cycle-safe (a → b → a terminates)", () => {
    const lookup = new Map<string, string>([
      ["a", "var(--b)"],
      ["b", "var(--a)"],
    ]);
    expect(resolveColorString("var(--a)", lookup)).toBeNull();
  });

  it("builds a dark lookup that inherits light for non-overridden tokens", () => {
    // Theme overrides only bg in dark; fg must fall back to its light value.
    const themeCss = `:root { --color-fg: oklch(0.2 0 0); --color-bg: white; }
      [data-theme="dark"] { --color-bg: oklch(0.15 0 0); }`;
    const lk = buildSchemeLookups(themeCss, "");
    expect(resolveColorString(lk.dark.get("color-fg")!, lk.dark)).toBe("oklch(0.2 0 0)");
    expect(resolveColorString(lk.dark.get("color-bg")!, lk.dark)).toBe("oklch(0.15 0 0)");
  });
});

// ═══════════════════════════ The rule: failing fixture flags with the ratio ═
describe("checkThemeContrast · flags a sub-AA pair with the computed ratio", () => {
  // white on a light-blue primary — a classic sub-AA button (≈ 1.8:1).
  const badTheme = `:root {
    --color-primary:    oklch(0.75 0.15 250);
    --color-primary-fg: white;
  }`;

  it("emits one error naming the pair and quoting its ratio", () => {
    const results = checkThemeContrast({
      themeName: "bad",
      themeCss: badTheme,
      baseCss: BASE_CSS,
      pairs: [{ fg: "color-primary-fg", bg: "color-primary" }],
    });
    // Light and dark both inherit the same (only) primary override → 2 findings.
    expect(results.length).toBe(2);
    const r = results[0];
    expect(r.rule_id).toBe("contrast-tokens");
    expect(r.severity).toBe("error");
    expect(r.component_name).toBe("bad");
    expect(r.message).toContain("--color-primary-fg on --color-primary");

    // The exact computed ratio appears in the message.
    const ratio = contrastOf("white", "oklch(0.75 0.15 250)");
    expect(r.message).toContain(`${ratio.toFixed(2)}:1`);
    expect(r.message).toContain(`${CONTRAST_AA}:1`);
    expect(ratio).toBeLessThan(CONTRAST_AA);
  });

  it("points at the offending declaration's line", () => {
    const [r] = checkThemeContrast({
      themeName: "bad",
      themeCss: badTheme,
      baseCss: BASE_CSS,
      pairs: [{ fg: "color-primary-fg", bg: "color-primary" }],
    });
    // --color-primary-fg is declared on line 3 of badTheme.
    expect(r.line).toBe(3);
  });

  it("skips translucent pairs instead of inventing a ratio", () => {
    const translucent = `:root {
      --color-primary:    oklch(0.72 0.18 307 / 0.14);
      --color-primary-fg: white;
    }`;
    const results = checkThemeContrast({
      themeName: "t",
      themeCss: translucent,
      baseCss: BASE_CSS,
      pairs: [{ fg: "color-primary-fg", bg: "color-primary" }],
    });
    expect(results).toEqual([]);
  });

  it("resolves a 3-layer chain before computing (fg via alias → semantic → palette)", () => {
    // The theme paints fg through a component alias that chains into the base
    // palette; the rule must resolve it, not skip it, and still catch the fail.
    const themeCss = `:root {
      --brand-ink:        var(--palette-gray-25);
      --color-primary-fg: var(--brand-ink);
      --color-primary:    oklch(0.80 0.12 250);
    }`;
    const results = checkThemeContrast({
      themeName: "chain",
      themeCss,
      baseCss: BASE_CSS, // defines --palette-gray-25: oklch(0.995 ...)
      pairs: [{ fg: "color-primary-fg", bg: "color-primary" }],
    });
    expect(results.length).toBeGreaterThan(0);
    // near-white ink on a light primary → low contrast, and it was resolved.
    expect(results[0].message).toContain("oklch(0.995 0.001 260)");
  });
});

// ═══════════════════════════ Passing themes stay clean ═════════════════════
describe("checkThemeContrast · a well-tuned theme is silent", () => {
  it("the AAA contrast theme reports nothing at AA", () => {
    const themeCss = readFileSync(join(THEMES_DIR, "contrast.css"), "utf8");
    const results = checkThemeContrast({ themeName: "contrast", themeCss, baseCss: BASE_CSS });
    expect(results).toEqual([]);
  });
});

// ═══════════════════════════ Acceptance: all shipped themes pass ════════════
describe("contrast-tokens gate · every shipped theme clears WCAG AA", () => {
  const themeFiles = readdirSync(THEMES_DIR).filter((f) => f.endsWith(".css"));

  it("finds the shipped themes", () => {
    expect(themeFiles.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of themeFiles) {
    const name = file.replace(/\.css$/, "");
    it(`${name} passes every declared pair in light and dark`, () => {
      const themeCss = readFileSync(join(THEMES_DIR, file), "utf8");
      const results = checkThemeContrast({ themeName: name, themeCss, baseCss: BASE_CSS });
      // On failure, surface exactly which pairs fell short.
      expect(results.map((r) => r.message)).toEqual([]);
    });
  }
});

// ═══════════════════════════ Encoded pair list / rule metadata ═════════════
describe("contrast-tokens · encoded pair list & rule descriptor", () => {
  it("encodes the declared pairs once, including the plan's callouts", () => {
    const has = (fg: string, bg: string) =>
      CONTRAST_PAIRS.some((p) => p.fg === fg && p.bg === bg);
    expect(has("color-fg", "color-bg")).toBe(true); // fg/bg
    expect(has("color-primary-fg", "color-primary")).toBe(true); // primary/primary-fg
    expect(has("color-fg-muted", "color-bg")).toBe(true); // muted-fg/bg
    // fg-subtle is a low-emphasis weight — deliberately NOT gated.
    expect(CONTRAST_PAIRS.some((p) => p.fg === "color-fg-subtle")).toBe(false);
  });

  it("the rule descriptor is an error-level theme rule", () => {
    expect(CONTRAST_TOKENS_RULE.id).toBe("contrast-tokens");
    expect(CONTRAST_TOKENS_RULE.severity).toBe("error");
  });
});
