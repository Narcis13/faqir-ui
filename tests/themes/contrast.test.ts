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

// ═══════════════════════════════════════════════════════════════════════════
// The `contrast` theme — WCAG AAA gate  [task 0.4-14]
// ═══════════════════════════════════════════════════════════════════════════
//
// The accessibility-statement theme. Unlike the AA spot-checks above, this is a
// full gate: every semantic text pair must clear AAA (≥ 7:1) in BOTH schemes,
// derived-state (hover/active) pairs stay ≥ 4.5:1, and an opaque focus ring is
// re-asserted for every interactive `data-ui` value. All ratios are computed
// from the stylesheet itself with the oklch util — test-enforced, not eyeballed.

const AAA = 7;

const contrastCss = readFileSync(join(THEMES_DIR, "contrast.css"), "utf8");
const contrastValues = parseThemeValues(contrastCss);

// Foreground text tokens × surface tokens. Requiring AAA for the muted/subtle
// weights on EVERY surface (not just on bg) is what "no low-contrast muted text"
// means — muted is a lighter weight, never a lower contrast.
const FG_TOKENS = ["color-fg", "color-fg-muted", "color-fg-subtle"] as const;
const BG_TOKENS = ["color-bg", "color-bg-subtle", "color-bg-muted"] as const;

// On-color text pairs — the label each solid action paints on itself.
const ON_COLOR_PAIRS: Array<[fg: string, bg: string]> = [
  ["color-primary-fg", "color-primary"],
  ["color-secondary-fg", "color-secondary"],
  ["color-destructive-fg", "color-destructive"],
];

// Body text on the tinted "subtle" callout/badge backgrounds.
const SUBTLE_BG_PAIRS: Array<[fg: string, bg: string]> = [
  ["color-fg", "color-primary-subtle"],
  ["color-fg", "color-destructive-subtle"],
  ["color-fg", "color-success-subtle"],
  ["color-fg", "color-warning-subtle"],
  ["color-fg", "color-info-subtle"],
];

// Derived interactive states — AA (≥ 4.5:1) per the plan (§0.4-14).
const INTERACTIVE_PAIRS: Array<[fg: string, bg: string]> = [
  ["color-primary-fg", "color-primary-hover"],
  ["color-primary-fg", "color-primary-active"],
  ["color-destructive-fg", "color-destructive-hover"],
  ["color-secondary-fg", "color-secondary-hover"],
];

for (const scheme of ["light", "dark"] as const) {
  describe(`contrast theme · AAA text pairs · ${scheme}`, () => {
    const tokens = contrastValues[scheme];

    const ratioOf = (fg: string, bg: string): number => {
      const f = tokens.get(fg);
      const b = tokens.get(bg);
      // The theme overrides every token in every scheme — a missing one is a
      // failure in itself (no silent fallthrough to the base light values).
      expect(f, `${scheme}: ${fg} defined`).toBeDefined();
      expect(b, `${scheme}: ${bg} defined`).toBeDefined();
      return contrastOf(f!, b!);
    };

    // Every foreground weight on every surface ≥ 7:1.
    for (const fg of FG_TOKENS) {
      for (const bg of BG_TOKENS) {
        it(`${fg} on ${bg} ≥ ${AAA}:1`, () => {
          expect(ratioOf(fg, bg)).toBeGreaterThanOrEqual(AAA);
        });
      }
    }

    // On-color + subtle-bg text pairs ≥ 7:1.
    for (const [fg, bg] of [...ON_COLOR_PAIRS, ...SUBTLE_BG_PAIRS]) {
      it(`${fg} on ${bg} ≥ ${AAA}:1`, () => {
        expect(ratioOf(fg, bg)).toBeGreaterThanOrEqual(AAA);
      });
    }

    // Derived interactive states ≥ 4.5:1.
    for (const [fg, bg] of INTERACTIVE_PAIRS) {
      it(`${fg} on ${bg} ≥ ${AA}:1 (interactive state)`, () => {
        expect(ratioOf(fg, bg)).toBeGreaterThanOrEqual(AA);
      });
    }
  });
}

describe("contrast theme · auto scheme mirrors dark exactly", () => {
  it("every token declared in dark has the identical value in auto", () => {
    expect(contrastValues.dark.size).toBeGreaterThan(0);
    for (const [name, value] of contrastValues.dark) {
      expect(contrastValues.auto.get(name)).toBe(value);
    }
  });
});

// ── Focus visibility: an opaque :focus-visible ring for every interactive control ──
//
// A CSS-level presence assertion (per §0.4-14): the theme re-asserts `:focus-visible`
// on every interactive `data-ui` value. The canonical interactive set is kept in
// sync with the focus block in registry/themes/contrast.css. The match tolerates a
// descendant part (e.g. `[data-ui="slider"] [data-part="thumb"]:focus-visible`) but
// not crossing a comma/brace, so the ui and the pseudo-class share one selector.
describe("contrast theme · :focus-visible present for every interactive data-ui", () => {
  const INTERACTIVE_UI = [
    "button", "link", "input", "textarea", "select", "checkbox", "radio",
    "switch", "toggle", "slider", "tabs", "select-custom", "date-picker",
  ] as const;

  const stripped = contrastCss.replace(/\/\*[\s\S]*?\*\//g, "");

  const hasFocusVisibleFor = (ui: string): boolean =>
    new RegExp(`\\[data-ui="${ui}"\\][^{},]*:focus-visible`).test(stripped);

  it("defines at least one :focus-visible rule", () => {
    expect(stripped.includes(":focus-visible")).toBe(true);
  });

  for (const ui of INTERACTIVE_UI) {
    it(`has a :focus-visible rule targeting data-ui="${ui}"`, () => {
      expect(hasFocusVisibleFor(ui)).toBe(true);
    });
  }

  it("the focus ring is opaque (references --color-ring, no inline alpha)", () => {
    // The rule uses the themed ring color; --color-ring itself is opaque in the
    // theme (no `/ <alpha>`), so the ring is never translucent.
    const ringLight = contrastValues.light.get("color-ring");
    const ringDark = contrastValues.dark.get("color-ring");
    expect(ringLight).toBeDefined();
    expect(ringDark).toBeDefined();
    expect(ringLight).not.toContain("/");
    expect(ringDark).not.toContain("/");
  });
});
