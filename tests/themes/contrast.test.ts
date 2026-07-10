// ═══════════════════════════════════════════════════════════════════════════
// Contrast spot-checks for aurora + slate  [task 0.4-13]
// ═══════════════════════════════════════════════════════════════════════════
//
// WCAG AA spot-checks over the two 0.4-13 themes, computed with the manual
// oklch pipeline in ./contrast.ts (which becomes the full contrast gate in
// 0.4-16): in BOTH schemes, text-on-surface (fg/bg) and text-on-primary
// (primary-fg/primary) must reach ≥ 4.5:1. Values are read from the theme
// stylesheets themselves — a retune that drops below AA fails here.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contrastOf,
  contrastRatio,
  oklchToLinearRgb,
  parseCssColor,
  parseThemeValues,
} from "./contrast";

const THEMES_DIR = join(import.meta.dir, "../../registry/themes");

// ── The util itself: known-value sanity checks ───────────────────────────────
describe("contrast util · oklch → WCAG pipeline", () => {
  it("white/black is exactly 21:1", () => {
    expect(contrastOf("white", "black")).toBeCloseTo(21, 5);
  });

  it("a color against itself is 1:1 and order does not matter", () => {
    const c = "oklch(0.55 0.22 20)";
    expect(contrastOf(c, c)).toBeCloseTo(1, 5);
    expect(contrastOf("white", c)).toBeCloseTo(contrastOf(c, "white"), 10);
  });

  it("oklch pure red round-trips to linear sRGB {1, 0, 0}", () => {
    // oklch(0.628 0.2577 29.23) ≈ #ff0000
    const red = oklchToLinearRgb(0.628, 0.2577, 29.23);
    expect(red.r).toBeCloseTo(1, 2);
    expect(red.g).toBeCloseTo(0, 2);
    expect(red.b).toBeCloseTo(0, 2);
  });

  it("parses the value forms themes use (alpha, %, keywords) and rejects the rest", () => {
    expect(parseCssColor("oklch(0.5 0.2 300)")).not.toBeNull();
    expect(parseCssColor("oklch(0.5 0.2 300 / 0.4)")).not.toBeNull();
    expect(parseCssColor("oklch(50% 0.2 300)")).not.toBeNull();
    expect(parseCssColor("WHITE")).toEqual({ r: 1, g: 1, b: 1 });
    expect(parseCssColor("var(--palette-gray-25)")).toBeNull();
    expect(parseCssColor("linear-gradient(135deg, red, blue)")).toBeNull();
  });

  it("alpha is ignored — contrast is defined over opaque colors", () => {
    expect(contrastOf("oklch(0.5 0.2 300 / 0.4)", "white")).toBeCloseTo(
      contrastOf("oklch(0.5 0.2 300)", "white"),
      10,
    );
  });
});

// ── The spot-checks: aurora + slate, both schemes, AA on the key pairs ───────
const SPOT_CHECKED_THEMES = ["aurora", "slate"] as const;
const AA = 4.5;

/** The pairs the plan calls out: text on the page, text on the primary action. */
const PAIRS: Array<[fg: string, bg: string]> = [
  ["color-fg", "color-bg"],
  ["color-primary-fg", "color-primary"],
];

for (const theme of SPOT_CHECKED_THEMES) {
  describe(`contrast spot-checks · ${theme}`, () => {
    const css = readFileSync(join(THEMES_DIR, `${theme}.css`), "utf8");
    const values = parseThemeValues(css);

    for (const scheme of ["light", "dark"] as const) {
      const tokens = values[scheme];

      for (const [fg, bg] of PAIRS) {
        it(`${scheme}: ${fg} on ${bg} ≥ ${AA}:1`, () => {
          // Both themes override every spot-checked token in every scheme, so
          // a missing token is itself a failure (no silent base fallback).
          const fgValue = tokens.get(fg);
          const bgValue = tokens.get(bg);
          expect(fgValue).toBeDefined();
          expect(bgValue).toBeDefined();

          const ratio = contrastOf(fgValue!, bgValue!);
          expect(ratio).toBeGreaterThanOrEqual(AA);
        });
      }
    }

    it("auto scheme mirrors dark exactly for the spot-checked tokens", () => {
      for (const [fg, bg] of PAIRS) {
        expect(values.auto.get(fg)).toBe(values.dark.get(fg)!);
        expect(values.auto.get(bg)).toBe(values.dark.get(bg)!);
      }
    });
  });
}

// ── Proof the check has teeth: a failing pair is caught ──────────────────────
describe("contrast spot-checks · the gate fails low-contrast pairs", () => {
  it("flags white on a light primary (a classic sub-AA button)", () => {
    // white on oklch(0.75 0.15 250) — light blue — is well under 4.5:1
    expect(contrastOf("white", "oklch(0.75 0.15 250)")).toBeLessThan(AA);
  });

  it("flags muted-on-muted text", () => {
    const c1 = parseCssColor("oklch(0.60 0.02 250)")!;
    const c2 = parseCssColor("oklch(0.75 0.02 250)")!;
    expect(contrastRatio(c1, c2)).toBeLessThan(AA);
  });
});
