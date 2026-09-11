// soft — pastel consumer/health theme, large radii  [task 0.7-10]

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { parseThemeValues, parseOklch } from "../../src/utils/oklch";
import { axesFromCss } from "../../src/theme/axes";
import type { ThemeManifest } from "../../src/theme-manifest";

const DIR = join(import.meta.dir, "../../registry/themes");
const TOKENS = join(import.meta.dir, "../../registry/tokens");
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS)]
  .sort()
  .map((f) => readFileSync(join(TOKENS, f), "utf8"));
const CSS = readFileSync(join(DIR, "soft.css"), "utf8");
const MANIFEST = JSON.parse(
  readFileSync(join(DIR, "soft.theme.json"), "utf8"),
) as ThemeManifest;
const TERMINAL_MANIFEST = JSON.parse(
  readFileSync(join(DIR, "terminal.theme.json"), "utf8"),
) as ThemeManifest;
const VALUES = parseThemeValues(CSS);

describe("soft theme", () => {
  it("has large friendly radii across the scale", () => {
    // The scale is remapped upward: lg is a full 1rem and grows from there.
    expect(parseFloat(VALUES.light.get("radius-lg")!)).toBeGreaterThanOrEqual(1);
    expect(parseFloat(VALUES.light.get("radius-xl")!)).toBeGreaterThanOrEqual(1.5);
    expect(parseFloat(VALUES.light.get("radius-2xl")!)).toBeGreaterThanOrEqual(2);
    // Pill buttons/badges, pillowy cards and dialogs.
    expect(VALUES.light.get("button-radius")).toBe("var(--radius-full)");
    expect(VALUES.light.get("badge-radius")).toBe("var(--radius-full)");
    expect(VALUES.light.get("card-radius")).toBe("var(--radius-xl)");
    expect(VALUES.light.get("dialog-radius")).toBe("var(--radius-2xl)");
  });

  it("is pastel with legible ink: near-white warm surfaces, deep text, mid-lightness accents", () => {
    const bg = parseOklch(VALUES.light.get("color-bg")!)!;
    const fg = parseOklch(VALUES.light.get("color-fg")!)!;
    const primary = parseOklch(VALUES.light.get("color-primary")!)!;
    expect(bg.l).toBeGreaterThanOrEqual(0.98); // warm cream, nearly white
    expect(fg.l).toBeLessThanOrEqual(0.35); // ink stays deep — pastel fills, not pastel text
    expect(primary.l).toBeGreaterThan(0.4); // calm, not neon…
    expect(primary.l).toBeLessThan(0.6); // …but deep enough for its white label
    expect(primary.c).toBeLessThanOrEqual(0.12); // muted chroma is what reads as pastel
  });

  it("dark stays soft: warm cocoa, not stark near-black", () => {
    const bg = parseOklch(VALUES.dark.get("color-bg")!)!;
    expect(bg.l).toBeGreaterThanOrEqual(0.2); // lifted off pure black
    expect(bg.l).toBeLessThanOrEqual(0.3);
    const primary = parseOklch(VALUES.dark.get("color-primary")!)!;
    expect(primary.c).toBeLessThanOrEqual(0.12); // accents stay pastel in dark too
  });

  it("mood tags target consumer/health selection — and share nothing with terminal", () => {
    expect(MANIFEST.mood).toContain("pastel");
    expect(MANIFEST.mood).toContain("consumer");
    expect(MANIFEST.mood).toContain("health");
    // Acceptance criterion: an agent choosing by mood must never conflate the
    // two — the vocabularies are fully disjoint.
    const terminalMoods = new Set(TERMINAL_MANIFEST.mood);
    expect(MANIFEST.mood.filter((m) => terminalMoods.has(m))).toEqual([]);
    expect(MANIFEST.mood.length).toBeGreaterThan(0);
    expect(TERMINAL_MANIFEST.mood.length).toBeGreaterThan(0);
  });

  // ── The identity it states in tokens [1.1A-14] ────────────────────────────
  it("derives the adoption table's row: springy motion, glow focus, round tick boxes, pill buttons", () => {
    const axes = axesFromCss(CSS, AXIS_BASE);
    expect({
      motion: axes.motion,
      focus: axes.focus,
      checkbox: axes.controls.checkbox,
      button: axes.controls.button,
      depth: axes.depth,
    }).toEqual({ motion: "springy", focus: "glow", checkbox: "round", button: "pill", depth: "layered" });
    expect(MANIFEST.axes).toEqual(axes);
  });

  it("is springy rather than playful: the easing overshoots, the surface barely moves", () => {
    // The classifier separates the two by how far the hover LIFT travels: past
    // -2px a theme is moving its surfaces, not just its curves. This one is
    // calm, and the boundary is why the lift is -1px rather than a round -2px.
    expect(VALUES.light.get("ease-default")).toBe("var(--ease-spring)");
    expect(VALUES.light.get("motion-hover-lift")).toBe("0 -1px");
    const playful = axesFromCss(`${CSS}\n:root { --motion-hover-lift: 0 -3px; }\n`, AXIS_BASE);
    expect(playful.motion).toBe("playful");
  });

  it("the glow reaches every focusable surface, because reset and the controls both read it", () => {
    // `--focus-shadow` is declared in `base/reset.css`'s `:focus-visible` AND in
    // all thirteen controls that paint their own ring — a control's own rule
    // out-specifies reset's, so a theme that could only reach reset would halo
    // bare elements and no button.
    expect(VALUES.light.get("focus-shadow")).toBe("0 0 0 var(--space-1) var(--color-primary-subtle)");
    const reset = readFileSync(join(import.meta.dir, "../../registry/base/reset.css"), "utf8");
    expect(reset).toContain("box-shadow: var(--focus-shadow)");
    const button = readFileSync(join(import.meta.dir, "../../registry/primitives/button/button.css"), "utf8");
    expect(button).toContain("var(--focus-shadow)");
  });

  it("ships a preview wired to soft.css", () => {
    expect(MANIFEST.preview).toBe("soft.preview.html");
    const preview = readFileSync(join(DIR, "soft.preview.html"), "utf8");
    expect(preview).toContain('href="soft.css"');
    expect(preview).toContain('data-ui="button"');
  });
});
