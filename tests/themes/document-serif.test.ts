// document-serif — formal contracts/legal theme  [task 0.6-09]

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { parseThemeSchemes } from "./theme-coverage";
import { axesFromCss, expandSides, lengthPx, resolveValue } from "../../src/theme/axes";
import { parseThemeValues } from "../../src/utils/oklch";
import type { ThemeManifest } from "../../src/theme-manifest";

const DIR = join(import.meta.dir, "../../registry/themes");
const TOKENS = join(import.meta.dir, "../../registry/tokens");
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS)]
  .sort()
  .map((f) => readFileSync(join(TOKENS, f), "utf8"));
const CSS = readFileSync(join(DIR, "document-serif.css"), "utf8");
const PREVIEW = readFileSync(join(DIR, "document-serif.preview.html"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "document-serif.theme.json"), "utf8")) as ThemeManifest;
const VALUES = parseThemeValues(CSS);

/** The theme's light values over the base token layer — what a browser resolves. */
function lightLookup(themeCss: string): Map<string, string> {
  const merged = new Map<string, string>();
  for (const source of AXIS_BASE) {
    for (const [name, value] of parseThemeValues(source).light) merged.set(name, value);
  }
  for (const [name, value] of parseThemeValues(themeCss).light) merged.set(name, value);
  return merged;
}

describe("document-serif theme", () => {
  it("is explicitly light-only and uses serif document typography", () => {
    expect(CSS).toContain("@ui:schemes light");
    expect(CSS).toMatch(/--doc-font:\s*'Georgia'/);
    expect(CSS).toMatch(/--doc-heading-font:\s*'Times New Roman'/);
    expect(parseThemeSchemes(CSS).dark.size).toBe(0);
  });

  it("removes screen-only decoration and defines deterministic print ink", () => {
    for (const token of ["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"]) {
      expect(CSS).toContain(`--${token}:`);
    }
    expect(CSS).toContain("@media print");
    expect(CSS).toContain("--doc-bg:");
    expect(CSS).toContain("--doc-fg:");
  });

  it("ships a document preview exercising watermark and barcode", () => {
    expect(existsSync(join(DIR, "document-serif.preview.html"))).toBe(true);
    expect(PREVIEW).toContain('data-ui="document"');
    expect(PREVIEW).toContain('data-ui="watermark"');
    expect(PREVIEW).toContain('data-ui="barcode"');
    expect(PREVIEW).toContain("../core/faqir-core.js");
  });

  // ── The identity it states in tokens [1.1A-15] ─────────────────────────────

  it("derives the adoption table's row: serif roles, tight headings, a dotted rule, ruled fields", () => {
    const axes = axesFromCss(CSS, AXIS_BASE);
    expect({
      pairing: axes.type.pairing,
      tracking: axes.type.voice!.tracking,
      divider: axes.decoration.divider,
      input: axes.controls.input,
    }).toEqual({ pairing: "serif-editorial", tracking: "tight", divider: "dotted", input: "underline" });
    expect(MANIFEST.axes).toEqual(axes);
  });

  it("is serif on the PAGE, not only inside a data-ui=\"document\"", () => {
    // The theme has been serif since 0.6 — through `--doc-font`, which only
    // reaches a document primitive. `--font-heading`/`--font-body` are what
    // every heading, every piece of prose and every description in the registry
    // reads, so pointing them at the serif palette is what makes the claim in
    // the theme's NAME true off the page as well as on it.
    expect(VALUES.light.get("font-heading")).toBe("var(--font-serif)");
    expect(VALUES.light.get("font-body")).toBe("var(--font-serif)");
    // `--font-ui` deliberately stays sans: a field label is furniture, not
    // text. That is the same pairing `paper` makes.
    expect(VALUES.light.get("font-ui")).toBeUndefined();
    const prose = readFileSync(join(import.meta.dir, "../../registry/base/prose.css"), "utf8");
    expect(prose).toContain("var(--font-heading)");
    expect(prose).toContain("var(--font-body)");
  });

  it("fields are ruled lines: the edge collapses to the bottom side alone", () => {
    const lookup = lightLookup(CSS);
    const sides = expandSides(resolveValue(lookup.get("input-border-width")!, lookup));
    expect(sides).not.toBeNull();
    const px = sides!.map((s) => lengthPx(s));
    expect(px).toEqual([0, 0, 1, 0]);
    // And all three text controls read it, so one declaration rules them all.
    for (const name of ["input", "textarea", "select"]) {
      const css = readFileSync(
        join(import.meta.dir, `../../registry/primitives/${name}/${name}.css`),
        "utf8",
      );
      expect(css).toContain("var(--input-border-width)");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The `double` divider needs a rule it can split        [1.1A-15 → 1.1A-26]
// ═══════════════════════════════════════════════════════════════════════════
//
// A contract's section break is traditionally a DOUBLE rule, and that is what
// FAQIR-PLAN-1.1's adoption table asks this theme for. A `double` border only
// splits into two lines at 3px or more. Measured in Chrome 149 against a white
// page, sampling the darkest pixel per row:
//
//     1px double → ONE black row  (indistinguishable from `solid`)
//     2px double → two ADJACENT black rows (still one visual rule)
//     3px double → black / white / black — the double rule finally appears
//
// 1.1A-15 found `separator` drawing its rule at `--border-width`, so the style
// and the width were one knob and a hairline theme could not ask for a double
// rule at all; this theme took `dotted` and a gate refused `double` under 3px.
// 1.1A-26 gave the divider its own width — `--divider-width`, following
// `--border-width` by default — so the gate is now the rule it always meant:
// a theme that declares `double` must raise `--divider-width` to 3px, and the
// generator does exactly that for a `double` seed.

describe("divider · `double` needs a rule it can split", () => {
  const THEMES = [...new Glob("*.css").scanSync(DIR)].map((f) => f.replace(/\.css$/, "")).sort();

  /** The px width `separator` draws for a theme, through its own token chain. */
  function dividerPx(themeCss: string): number | null {
    return lengthPx(resolveValue("var(--divider-width)", lightLookup(themeCss)));
  }

  /** The minimum border width at which Chrome renders `double` as two rules. */
  const DOUBLE_MIN_PX = 3;

  it("separator draws its rule at --divider-width, the knob a double rule raises", () => {
    const separator = readFileSync(
      join(import.meta.dir, "../../registry/primitives/separator/separator.css"),
      "utf8",
    );
    expect(separator).toContain("var(--divider-width) var(--divider-style) var(--color-border)");
    expect(separator).not.toContain("var(--border-width) var(--divider-style)");
  });

  it("no shipped theme declares `double` without raising --divider-width to 3px", () => {
    const offenders: string[] = [];
    for (const name of THEMES) {
      const css = readFileSync(join(DIR, `${name}.css`), "utf8");
      const style = parseThemeValues(css).light.get("divider-style");
      if (style?.trim() !== "double") continue;
      const px = dividerPx(css);
      if (px == null || px < DOUBLE_MIN_PX) offenders.push(`${name} (${px}px)`);
    }
    expect(offenders).toEqual([]);
  });

  it("the gate is not vacuous: document-serif asking for double WITHOUT the width would offend", () => {
    // The divider follows this theme's own 1px hairline edge, so a bare
    // `double` is exactly the case above…
    expect(dividerPx(CSS)).toBe(1);
    const wishful = `${CSS}\n:root { --divider-style: double; }\n`;
    expect(parseThemeValues(wishful).light.get("divider-style")).toBe("double");
    expect(dividerPx(wishful)! < DOUBLE_MIN_PX).toBe(true);
    // …which the classifier reports as the single line it renders…
    expect(axesFromCss(wishful, AXIS_BASE).decoration.divider).toBe("solid");
    // …while raising the divider's OWN width, and nothing else, makes it real.
    const raised = `${CSS}\n:root { --divider-style: double; --divider-width: 3px; }\n`;
    expect(dividerPx(raised)).toBe(3);
    expect(lengthPx(resolveValue("var(--border-width)", lightLookup(raised)))).toBe(1);
    expect(axesFromCss(raised, AXIS_BASE).decoration.divider).toBe("double");
    // `dotted`, which it actually ships, is a style a 1px rule can draw.
    expect(axesFromCss(CSS, AXIS_BASE).decoration.divider).toBe("dotted");
  });
});
