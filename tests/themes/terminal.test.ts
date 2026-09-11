// terminal — phosphor CRT theme, dark-primary  [task 0.7-10]

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { parseThemeSchemes } from "./theme-coverage";
import { parseThemeValues, parseOklch } from "../../src/utils/oklch";
import { axesFromCss } from "../../src/theme/axes";
import type { ThemeManifest } from "../../src/theme-manifest";

const DIR = join(import.meta.dir, "../../registry/themes");
const TOKENS = join(import.meta.dir, "../../registry/tokens");
const CSS = readFileSync(join(DIR, "terminal.css"), "utf8");
const MANIFEST = JSON.parse(
  readFileSync(join(DIR, "terminal.theme.json"), "utf8"),
) as ThemeManifest;
const VALUES = parseThemeValues(CSS);
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS)]
  .sort()
  .map((f) => readFileSync(join(TOKENS, f), "utf8"));

describe("terminal theme", () => {
  it("is monospaced everywhere — all three type ROLES point at --font-mono", () => {
    // Said in roles since 1.1A-14. Aliasing the `--font-sans` palette entry
    // worked only because every role happened to point at it; naming the roles
    // is the same rendering and an honest statement about the palette.
    for (const role of ["font-heading", "font-body", "font-ui"]) {
      expect(`${role}: ${VALUES.light.get(role)}`).toBe(`${role}: var(--font-mono)`);
    }
    expect(CSS).not.toContain("--font-sans:");
  });

  it("has sharp corners: every radius scale token and component radius alias is 0", () => {
    const radii = [
      "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-2xl", "radius-full",
      "button-radius", "card-radius", "input-radius", "dialog-radius", "badge-radius", "avatar-radius",
    ];
    for (const token of radii) {
      expect(`${token}: ${VALUES.light.get(token)}`).toBe(`${token}: 0`);
    }
  });

  it("dark is phosphor: fg and primary are luminous high-chroma greens on near-black", () => {
    const bg = parseOklch(VALUES.dark.get("color-bg")!)!;
    expect(bg.l).toBeLessThan(0.2); // near-black glass
    for (const token of ["color-fg", "color-primary"]) {
      const phosphor = parseOklch(VALUES.dark.get(token)!)!;
      expect(phosphor.l).toBeGreaterThan(0.8); // luminous…
      expect(phosphor.c).toBeGreaterThanOrEqual(0.15); // …saturated…
      expect(phosphor.h).toBeGreaterThan(120); // …green
      expect(phosphor.h).toBeLessThan(160);
    }
  });

  it("warnings are phosphor amber in dark", () => {
    const warning = parseOklch(VALUES.dark.get("color-warning")!)!;
    expect(warning.l).toBeGreaterThan(0.7);
    expect(warning.h).toBeGreaterThan(70);
    expect(warning.h).toBeLessThan(100);
  });

  it("declares dark-primary honestly: mood says dark, and BOTH schemes are genuinely shipped", () => {
    expect(MANIFEST.scheme).toBe("both");
    expect(MANIFEST.dark_mode).toBe("native");
    expect(MANIFEST.mood).toContain("dark");
    expect(MANIFEST.mood).toContain("terminal");
    expect(MANIFEST.mood).toContain("mono");
    // The `both` claim is backed by CSS: full dark + auto blocks AND a real
    // (paper-terminal) light scheme — not a lazy fallthrough to the base theme.
    const schemes = parseThemeSchemes(CSS);
    expect(schemes.dark.size).toBeGreaterThanOrEqual(32);
    expect(schemes.auto.size).toBeGreaterThanOrEqual(32);
    expect(schemes.light.size).toBeGreaterThanOrEqual(32);
  });

  // ── The identity it states in tokens [1.1A-14] ────────────────────────────
  it("derives the adoption table's row: mono type, scanlines, snappy, inset focus, dashed rules", () => {
    const axes = axesFromCss(CSS, AXIS_BASE);
    expect({
      pairing: axes.type.pairing,
      material: axes.material,
      motion: axes.motion,
      focus: axes.focus,
      divider: axes.decoration.divider,
      radius: axes.shape.radius,
    }).toEqual({
      pairing: "mono",
      material: "stripes",
      motion: "snappy",
      focus: "inset",
      divider: "dashed",
      radius: "sharp",
    });
    expect(MANIFEST.axes).toEqual(axes);
  });

  it("`snappy` is a short duration ON this theme's own ease-out, not a literal", () => {
    // The classifier compares `--ease-default` against the theme's OWN
    // `--ease-out`, so a theme that re-points its easing palette is still read
    // in its own terms. Terminal says it the same way: by reference.
    expect(VALUES.light.get("ease-default")).toBe("var(--ease-out)");
    expect(parseFloat(VALUES.light.get("duration-normal")!)).toBeLessThanOrEqual(160);
  });

  it("the inset ring is a literal length, because an axis that cannot be read is not an axis", () => {
    // `calc(-1 * var(--focus-ring-width))` resolves to an EXPRESSION, which is
    // not a length any browser-free classifier can band — the theme would frost
    // its own focus treatment out of the manifest. The literal is deliberate.
    expect(VALUES.light.get("focus-ring-offset")).toBe("-2px");
  });

  it("ships a preview wired to terminal.css", () => {
    expect(MANIFEST.preview).toBe("terminal.preview.html");
    const preview = readFileSync(join(DIR, "terminal.preview.html"), "utf8");
    expect(preview).toContain('href="terminal.css"');
    expect(preview).toContain('data-ui="button"');
  });
});
