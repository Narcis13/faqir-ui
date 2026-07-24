// terminal — phosphor CRT theme, dark-primary  [task 0.7-10]

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseThemeSchemes } from "./theme-coverage";
import { parseThemeValues, parseOklch } from "../../src/utils/oklch";
import type { ThemeManifest } from "../../src/theme-manifest";

const DIR = join(import.meta.dir, "../../registry/themes");
const CSS = readFileSync(join(DIR, "terminal.css"), "utf8");
const MANIFEST = JSON.parse(
  readFileSync(join(DIR, "terminal.theme.json"), "utf8"),
) as ThemeManifest;
const VALUES = parseThemeValues(CSS);

describe("terminal theme", () => {
  it("is monospaced everywhere — --font-sans aliases --font-mono", () => {
    expect(CSS).toMatch(/--font-sans:\s*var\(--font-mono\)/);
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

  it("ships a preview wired to terminal.css", () => {
    expect(MANIFEST.preview).toBe("terminal.preview.html");
    const preview = readFileSync(join(DIR, "terminal.preview.html"), "utf8");
    expect(preview).toContain('href="terminal.css"');
    expect(preview).toContain('data-ui="button"');
  });
});
