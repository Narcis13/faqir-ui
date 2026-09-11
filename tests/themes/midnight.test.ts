// midnight — dark-first navy/purple with vibrant cyan  [task 1.1A-15]
//
// A lit interface in a dark room. Until 1.1A-15 this theme could only say that
// in colour: its axes were `default`'s with a cool neutral, and everything
// structural about a dark-first product — the depth of a floating panel, the
// glow around a focused control, the grid behind the page, the weight a heading
// is set at when it would otherwise bloom — was unsayable. This file pins what
// it says now, and each assertion checks the token the registry actually reads
// rather than the presence of a declaration.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { parseThemeValues } from "../../src/utils/oklch";
import {
  axesFromCss,
  DEPTH_LAYERED_MIN_BLUR_PX,
  HEADING_WEIGHT_MAX,
  shadowLayer,
  splitTopLevel,
} from "../../src/theme/axes";
import type { ThemeManifest } from "../../src/theme-manifest";

const DIR = join(import.meta.dir, "../../registry/themes");
const REGISTRY = join(import.meta.dir, "../../registry");
const TOKENS = join(REGISTRY, "tokens");
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS)]
  .sort()
  .map((f) => readFileSync(join(TOKENS, f), "utf8"));
const CSS = readFileSync(join(DIR, "midnight.css"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "midnight.theme.json"), "utf8")) as ThemeManifest;
const VALUES = parseThemeValues(CSS);
const AXES = axesFromCss(CSS, AXIS_BASE);

/** How many times the stylesheet declares a token, comments excluded. */
function declarations(token: string): number {
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, " ");
  return bare.split(new RegExp(`--${token}\\s*:`)).length - 1;
}

describe("midnight theme · the identity it states in tokens", () => {
  it("derives the adoption table's row: layered depth, glow focus, a grid material, semibold headings", () => {
    expect({
      depth: AXES.depth,
      focus: AXES.focus,
      material: AXES.material,
      weight: AXES.type.voice!.weight,
      motion: AXES.motion,
    }).toEqual({ depth: "layered", focus: "glow", material: "grid", weight: "semibold", motion: "smooth" });
    expect(MANIFEST.axes).toEqual(AXES);
  });

  it("casts every step of the ramp in --shadow-color, in both schemes", () => {
    // Twenty literal navies before this task; two channel declarations now.
    // The classifier reads the theme's PRIMARY scheme (light, since it ships
    // both), so the light ramp is the one that has to reach the layered band —
    // and it is the one that used to contradict the dark ramp this theme was
    // designed in.
    for (const scheme of ["light", "dark", "auto"] as const) {
      expect({ [scheme]: VALUES[scheme].get("shadow-color") !== undefined }).toEqual({ [scheme]: true });
      for (const step of ["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"]) {
        const value = VALUES[scheme].get(step)!;
        expect({ [`${scheme}/${step}`]: value.includes("oklch(var(--shadow-color)") }).toEqual({
          [`${scheme}/${step}`]: true,
        });
      }
    }
    const md = shadowLayer(splitTopLevel(VALUES.light.get("shadow-md")!)[0]);
    expect(md.lengths[2]).toBeGreaterThanOrEqual(DEPTH_LAYERED_MIN_BLUR_PX);
    // One declaration re-tints the whole ramp: change the channel and nothing
    // else, and every step follows.
    const warm = axesFromCss(CSS.replace("--shadow-color: 0.20 0.05 275;", "--shadow-color: 0.4 0.12 30;"), AXIS_BASE);
    expect(warm.depth).toBe("layered");
  });

  it("the glow reaches every focusable surface, and is mixed from the ring", () => {
    // `--focus-shadow` is declared in `base/reset.css`'s `:focus-visible` AND
    // in the controls that paint their own ring — a control's own rule
    // out-specifies reset's, so a theme that could only reach reset would halo
    // bare elements and no button.
    const glow = VALUES.light.get("focus-shadow")!;
    expect(glow).toContain("var(--color-ring)");
    expect(glow).toContain("color-mix(in oklch");
    const reset = readFileSync(join(REGISTRY, "base/reset.css"), "utf8");
    expect(reset).toContain("box-shadow: var(--focus-shadow)");
    expect(readFileSync(join(REGISTRY, "primitives/button/button.css"), "utf8")).toContain("var(--focus-shadow)");
    // Mixed rather than named, so the halo cannot drift from the ring it sits
    // behind when either scheme's accent is retuned — and so ONE declaration
    // covers both schemes, which is what `declarations` counts.
    expect(declarations("focus-shadow")).toBe(1);
    expect(VALUES.light.get("color-ring")).toBeDefined();
    expect(VALUES.dark.get("color-ring")).toBeDefined();
  });

  it("dresses the page and not the things on it", () => {
    expect(VALUES.light.get("texture-page")).toBe("var(--texture-grid)");
    expect(VALUES.light.get("texture-surface")).toBeUndefined();
    // The named texture has to exist as a token, or the role resolves to
    // nothing and `background-image` drops the declaration silently.
    const textures = readFileSync(join(TOKENS, "textures.css"), "utf8");
    expect(textures).toMatch(/--texture-grid:\s*url\("data:image\/svg\+xml,/);
    // `currentColor`, so the grid tints itself from the page's foreground
    // rather than carrying a colour this theme would have to restate per scheme.
    const grid = /--texture-grid:\s*(url\("[^"]+"\))/.exec(textures)![1];
    expect(decodeURIComponent(grid)).toContain("currentColor");
    // …and `body` is what reads the role.
    expect(readFileSync(join(REGISTRY, "base/reset.css"), "utf8")).toContain("var(--texture-page)");
  });

  it("sets headings one weight lighter than the registry, and it is a real weight", () => {
    expect(VALUES.light.get("heading-weight")).toBe("var(--weight-semibold)");
    const typography = readFileSync(join(TOKENS, "typography.css"), "utf8");
    expect(typography).toMatch(/--weight-semibold:\s*600/);
    expect(600).toBeGreaterThanOrEqual(HEADING_WEIGHT_MAX.medium);
    expect(600).toBeLessThan(HEADING_WEIGHT_MAX.semibold);
  });

  it("selection wears the accent, in one declaration for both schemes", () => {
    expect(VALUES.light.get("selection-bg")).toBe("var(--color-primary)");
    expect(VALUES.light.get("selection-fg")).toBe("var(--color-primary-fg)");
    expect(declarations("selection-bg")).toBe(1);
    expect(declarations("selection-fg")).toBe(1);
    expect(readFileSync(join(REGISTRY, "base/reset.css"), "utf8")).toContain("var(--selection-bg)");
  });

  it("keeps the dark and auto blocks identical, token for token", () => {
    expect(VALUES.dark.size).toBeGreaterThan(0);
    for (const [name, value] of VALUES.dark) {
      expect({ [name]: VALUES.auto.get(name) }).toEqual({ [name]: value });
    }
    expect(VALUES.auto.size).toBe(VALUES.dark.size);
  });
});
