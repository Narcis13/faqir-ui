// slate — conservative enterprise blue-gray  [task 1.1A-15]
//
// The theme 1.0 shipped was "default, but bluer": its axes were identical to
// `default`'s on all twenty-three enumerated leaves, and its colour surface sat
// 0.0282 mean OKLab ΔE from `glass`'s — closer than the framework's own minimum
// separation between a card and the page under it. Both are fixed here, and
// this file is where the fix is pinned: the SHAPE of an enterprise console
// (grotesque type, crisp corners, no elevation, snappy motion, compact density)
// plus surfaces that are steel rather than a second cool white.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { parseOklch, parseThemeValues } from "../../src/utils/oklch";
import {
  axesFromCss,
  durationMs,
  familyClass,
  lengthPx,
  MOTION_SNAPPY_MAX_MS,
  RADIUS_CRISP_MAX_PX,
  resolveValue,
} from "../../src/theme/axes";
import {
  distinctiveness,
  distinctivenessContext,
  prepareTheme,
  TOKEN_MIN,
} from "../../src/theme/distinctiveness";
import { isSurfaceTokenFile, type ThemeManifest } from "../../src/theme-manifest";

const DIR = join(import.meta.dir, "../../registry/themes");
const TOKENS = join(import.meta.dir, "../../registry/tokens");
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS)]
  .sort()
  .map((f) => readFileSync(join(TOKENS, f), "utf8"));
const SURFACE_BASE = [...new Glob("*.css").scanSync(TOKENS)]
  .filter(isSurfaceTokenFile)
  .sort()
  .map((f) => readFileSync(join(TOKENS, f), "utf8"));
const CSS = readFileSync(join(DIR, "slate.css"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "slate.theme.json"), "utf8")) as ThemeManifest;
const VALUES = parseThemeValues(CSS);
const AXES = axesFromCss(CSS, AXIS_BASE);

describe("slate theme · the identity it states in tokens", () => {
  it("derives the adoption table's row: grotesque type, crisp shape, flat depth, snappy motion, compact density", () => {
    expect({
      pairing: AXES.type.pairing,
      radius: AXES.shape.radius,
      depth: AXES.depth,
      motion: AXES.motion,
      density: AXES.density,
      neutral: AXES.neutral,
      input: AXES.controls.input,
    }).toEqual({
      pairing: "sans-grotesque",
      radius: "crisp",
      depth: "flat",
      motion: "snappy",
      density: "compact",
      neutral: "cool",
      input: "box",
    });
    // The stored block and the stylesheet cannot drift apart.
    expect(MANIFEST.axes).toEqual(AXES);
  });

  it("moves all three type roles together, and names no webfont", () => {
    // A console has one voice, which is also what makes the pairing derive a
    // single class: `axesFromCss` reports `custom` when heading and body
    // classify differently.
    const stack = VALUES.light.get("font-heading")!;
    expect(VALUES.light.get("font-body")).toBe(stack);
    expect(VALUES.light.get("font-ui")).toBe(stack);
    expect(familyClass(stack)).toBe("sans-grotesque");
    // Platform faces only — 1.1A-18 is what installs self-hosted families, and
    // a theme that needed one before then would render in the fallback.
    expect(MANIFEST.fonts ?? []).toEqual([]);
    expect(stack).not.toContain("url(");
  });

  it("tightens the WHOLE radius ladder, so a card and a badge agree", () => {
    const px = (token: string) => lengthPx(resolveValue(VALUES.light.get(token)!, VALUES.light));
    expect(px("radius-md")).toBeLessThanOrEqual(RADIUS_CRISP_MAX_PX);
    expect(px("radius-md")).toBeGreaterThan(0);
    for (const token of ["radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-2xl"]) {
      expect({ [token]: VALUES.light.get(token) !== undefined }).toEqual({ [token]: true });
    }
    // `--radius-full` is NOT remapped: a pill is a shape, not a corner size,
    // and an avatar or a switch that stopped being round would be a different
    // component rather than a crisper one.
    expect(VALUES.light.get("radius-full")).toBeUndefined();
  });

  it("removes every step of the ramp, in every scheme it ships", () => {
    // A dark block that omits a shadow token renders with the LIGHT value, so
    // `flat` has to be said twice (three times, with the `auto` mirror).
    for (const scheme of ["light", "dark", "auto"] as const) {
      for (const step of ["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"]) {
        expect({ [`${scheme}/${step}`]: VALUES[scheme].get(step) }).toEqual({ [`${scheme}/${step}`]: "none" });
      }
    }
    // Elevation is then carried by the surface steps and the borders, which is
    // what the three `--color-surface-*` tokens are for.
    expect(VALUES.light.get("color-surface-1")).toBe("var(--color-bg-subtle)");
    expect(VALUES.light.get("color-surface-2")).toBe("var(--color-bg-muted)");
  });

  it("is snappy in its own terms: a short duration ON its own ease-out", () => {
    // `snappy` is not a duration alone — the classifier compares the theme's
    // `--ease-default` to the theme's OWN `--ease-out`, so a theme that
    // re-points its easing palette is read in its own terms.
    expect(durationMs(VALUES.light.get("duration-normal")!)).toBeLessThanOrEqual(MOTION_SNAPPY_MAX_MS);
    expect(VALUES.light.get("ease-default")).toBe("var(--ease-out)");
    const eased = axesFromCss(CSS.replace("--ease-default:    var(--ease-out);", ""), AXIS_BASE);
    expect(eased.motion).toBe("smooth");
  });

  it("states its density in the header, and the preview honours it", () => {
    // A theme cannot declare a density at `:root` — density.css states each
    // ramp inside a `[data-density]` subtree scope — so the directive is the
    // authoring form, and a harness that did not stamp the attribute would
    // preview slate at a ramp it was not drawn for.
    expect(CSS).toContain("@ui:density compact");
    const preview = readFileSync(join(DIR, "slate.preview.html"), "utf8");
    expect(preview).toContain('data-density="compact"');
    expect(preview).toContain("../tokens/density.css");
    // Last of the token sheets: the density blocks re-declare alias tokens at
    // the same specificity as the `:root` ones, so a later `:root` sheet wins.
    const sheets = [...preview.matchAll(/href="\.\.\/(tokens\/[a-z-]+\.css)"/g)].map((m) => m[1]);
    expect(sheets[sheets.length - 1]).toBe("tokens/density.css");
  });
});

describe("slate theme · steel, not a second cool white", () => {
  const CONTEXT = distinctivenessContext(SURFACE_BASE);
  const theme = (name: string) => {
    const css = readFileSync(join(DIR, `${name}.css`), "utf8");
    const manifest = JSON.parse(readFileSync(join(DIR, `${name}.theme.json`), "utf8")) as ThemeManifest;
    return prepareTheme({ name, css, scheme: manifest.scheme, axes: axesFromCss(css, AXIS_BASE) }, CONTEXT);
  };

  it("clears the colour bar against glass — the pair that was under it", () => {
    // 0.0282 before this task: slate's neutrals were a colourway of glass's
    // (0.985/0.95/0.915 against 0.975/0.945/0.905, at the same hue). The axis
    // rule could not see it, which is exactly why the colour measure exists.
    const result = distinctiveness(theme("slate"), theme("glass"), CONTEXT);
    expect(result.token_distance).toBe(0.0397);
    expect(result.token_distance!).toBeGreaterThan(TOKEN_MIN);
  });

  it("carries enough chroma for the `cool` it has always claimed in prose", () => {
    // The file's own first line said "conservative enterprise blue-gray" and
    // its surfaces comment said "cool blue-gray neutrals", while the derived
    // neutral axis reported `gray`: at 0.003 chroma the page was achromatic.
    const bg = parseOklch(VALUES.light.get("color-bg")!)!;
    expect(bg.c).toBeGreaterThan(0.005);
    expect(bg.h).toBeGreaterThanOrEqual(200);
    expect(bg.h).toBeLessThanOrEqual(280);
    expect(AXES.neutral).toBe("cool");
  });

  it("keeps its elevation steps and its ink where the gates want them", () => {
    // The surfaces moved down and the dark ones moved further; the ordering and
    // the ink are what the contrast and elevation gates read, so they are
    // asserted here as the thing the retune had to preserve.
    const l = (scheme: "light" | "dark", token: string) => parseOklch(VALUES[scheme].get(token)!)!.l;
    expect(l("light", "color-bg")).toBeGreaterThan(l("light", "color-bg-subtle"));
    expect(l("light", "color-bg-subtle")).toBeGreaterThan(l("light", "color-bg-muted"));
    expect(l("dark", "color-bg")).toBeLessThan(l("dark", "color-bg-subtle"));
    expect(l("dark", "color-bg-subtle")).toBeLessThan(l("dark", "color-bg-muted"));
    // Night-shift dark: near-black rather than the mid slate it was.
    expect(l("dark", "color-bg")).toBeLessThan(0.16);
  });

  it("keeps the dark and auto blocks identical, token for token", () => {
    expect(VALUES.dark.size).toBeGreaterThan(0);
    for (const [name, value] of VALUES.dark) {
      expect({ [name]: VALUES.auto.get(name) }).toEqual({ [name]: value });
    }
    expect(VALUES.auto.size).toBe(VALUES.dark.size);
  });
});
