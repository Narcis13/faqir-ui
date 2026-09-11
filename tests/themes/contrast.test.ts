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
import { Glob } from "bun";
import {
  contrastOf,
  contrastRatio,
  oklchToLinearRgb,
  parseCssColor,
  parseThemeValues,
} from "./contrast";
import {
  axesFromCss,
  CONTRAST_HIGH_BORDER_MIN,
  CONTRAST_HIGH_TEXT_MIN,
  FOCUS_BOLD_MIN_WIDTH_PX,
} from "../../src/theme/axes";
import type { ThemeManifest } from "../../src/theme-manifest";

const THEMES_DIR = join(import.meta.dir, "../../registry/themes");
const TOKENS_DIR = join(import.meta.dir, "../../registry/tokens");
/** The axis resolver reads the WHOLE token layer — see tests/themes/axes.test.ts. */
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .sort()
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));

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

// ── Focus visibility: an opaque, oversized ring on every focusable surface ──
//
// Until 1.1A-15 this was a CSS-level presence assertion over thirteen
// `[data-ui="…"]:focus-visible` selectors this theme wrote itself, because 1.0
// had no token for a ring width. It has one now, so the claim is stated once
// and the assertions below check the two things that make it TRUE rather than
// the spelling of a selector list: the theme sets the width, and every surface
// that draws a ring reads it.
//
// The set is not a list this file maintains any more — it is derived from the
// registry, so a control added later is covered on the commit that adds it.

const REGISTRY = join(import.meta.dir, "../../registry");

/** Every stylesheet that draws a focus ring, from the registry itself. */
function ringStylesheets(): string[] {
  const found: string[] = [];
  for (const kind of ["primitives", "recipes", "patterns"]) {
    const dir = join(REGISTRY, kind);
    for (const rel of new Glob("*/*.css").scanSync(dir)) {
      const css = readFileSync(join(dir, rel), "utf8");
      if (/:focus(-visible|-within)?\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, ""))) {
        found.push(`${kind}/${rel}`);
      }
    }
  }
  return found.sort();
}

describe("contrast theme · the ring is a token now, and it reaches further than the list did", () => {
  const stripped = contrastCss.replace(/\/\*[\s\S]*?\*\//g, "");

  it("states an oversized ring in ONE declaration, and selects no component to do it", () => {
    // The thirteen-selector block and the blanket `:root [data-ui]:disabled`
    // rule are both gone; nothing in this stylesheet mentions the protocol.
    expect(stripped).not.toContain("[data-ui=");
    expect(stripped).not.toContain("[data-part=");
    expect(stripped).not.toContain(":focus-visible");
    const blocks = [...stripped.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim())
      .filter((sel) => !sel.startsWith("@"));
    expect(blocks).toEqual([":root", '[data-theme="dark"]', "[data-theme=\"auto\"]"]);
    // 3px — the shape ladder's widest — offset by the family's own 2px gap.
    expect(contrastValues.light.get("focus-ring-width")).toBe("var(--border-width-lg)");
  });

  it("is 3px in resolved pixels, which is what `focus: bold` means", () => {
    const axes = axesFromCss(contrastCss, AXIS_BASE);
    expect(axes.focus).toBe("bold");
    expect(FOCUS_BOLD_MIN_WIDTH_PX).toBe(3);
    const effects = readFileSync(join(REGISTRY, "tokens/effects.css"), "utf8");
    expect(effects).toMatch(/--border-width-lg:\s*3px/);
  });

  it("every stylesheet in the registry that draws a ring reads the width token", () => {
    // What the swap is worth: the old block named thirteen components, and the
    // registry draws a focus ring in far more places than that. Each one reads
    // `--focus-ring-width` since 1.1A-02/03, so one declaration reaches all of
    // them — including `base/reset.css`, which owns the ring for a bare
    // element no `data-ui` list could have covered.
    const sheets = ringStylesheets();
    expect(sheets.length).toBeGreaterThan(13);
    const missing = sheets.filter(
      (rel) => !readFileSync(join(REGISTRY, rel), "utf8").includes("var(--focus-ring-width)"),
    );
    expect(missing).toEqual([]);
    expect(readFileSync(join(REGISTRY, "base/reset.css"), "utf8")).toContain("var(--focus-ring-width)");
  });

  it("the focus ring is opaque (references --color-ring, no inline alpha)", () => {
    // The ring colour is the themed one; --color-ring itself is opaque in the
    // theme (no `/ <alpha>`), so the ring is never translucent.
    const ringLight = contrastValues.light.get("color-ring");
    const ringDark = contrastValues.dark.get("color-ring");
    expect(ringLight).toBeDefined();
    expect(ringDark).toBeDefined();
    expect(ringLight).not.toContain("/");
    expect(ringDark).not.toContain("/");
  });
});

// ── The rest of the accessibility statement, as derived axes [1.1A-15] ───────
describe("contrast theme · the axes it claims", () => {
  const axes = axesFromCss(contrastCss, AXIS_BASE);

  it("derives the adoption table's row: high contrast, bold focus, regular border, thick link", () => {
    expect({
      contrast: axes.contrast,
      focus: axes.focus,
      border: axes.shape.border,
      link: axes.decoration.link,
    }).toEqual({ contrast: "high", focus: "bold", border: "regular", link: "thick" });
    const manifest = JSON.parse(
      readFileSync(join(THEMES_DIR, "contrast.theme.json"), "utf8"),
    ) as ThemeManifest;
    expect(manifest.axes).toEqual(axes);
  });

  it("`contrast: high` is derived from the ratios above, not declared", () => {
    // The axis is a reading of the same two pairs this file gates — body text
    // and the strong border, in BOTH schemes — so it cannot claim `high` for a
    // theme whose colours stopped clearing the bar.
    for (const scheme of ["light", "dark"] as const) {
      const tokens = contrastValues[scheme];
      expect(contrastOf(tokens.get("color-fg")!, tokens.get("color-bg")!)).toBeGreaterThanOrEqual(
        CONTRAST_HIGH_TEXT_MIN,
      );
      expect(
        contrastOf(tokens.get("color-border-strong")!, tokens.get("color-bg")!),
      ).toBeGreaterThanOrEqual(CONTRAST_HIGH_BORDER_MIN);
    }
    // Dim the ink and the axis follows — the classifier is not reading a name.
    const dimmed = contrastCss.replace("--color-fg:              oklch(0.18 0 0)", "--color-fg: oklch(0.42 0 0)");
    expect(dimmed).not.toBe(contrastCss);
    expect(axesFromCss(dimmed, AXIS_BASE).contrast).toBe("standard");
  });

  it("dims disabled controls through the token the registry reads", () => {
    // 0.6 rather than the registry's 0.5 — "honestly dimmed, never faded to
    // invisibility" — and it reaches the parts the blanket `[data-ui]` rule
    // never matched, because a menu item and a calendar day carry a
    // `data-part`, not a `data-ui`.
    expect(contrastValues.light.get("disabled-opacity")).toBe("0.6");
    const menu = readFileSync(join(REGISTRY, "recipes/context-menu/context-menu.css"), "utf8");
    expect(menu).toContain("opacity: var(--disabled-opacity)");
  });
});
