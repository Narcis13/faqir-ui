// document — ink-efficient business documents, light only  [task 1.1A-15]
//
// Flat, sharp and untextured since 0.6. The two things this theme could not
// state before the 1.1 families are the two this file pins: paper does not
// animate, and a printed underline sits on the baseline rather than floating
// below it. Both are asserted the way the axes are derived — from the CSS —
// and the motion one is checked for the hazard it would otherwise be: a
// controller that waits for a transition that never runs.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { parseThemeValues } from "../../src/utils/oklch";
import { axesFromCss, durationMs, lengthEm, LINK_OFFSET_MIN_EM, resolveValue } from "../../src/theme/axes";
import { parseThemeSchemes } from "./theme-coverage";
import type { ThemeManifest } from "../../src/theme-manifest";

const DIR = join(import.meta.dir, "../../registry/themes");
const REGISTRY = join(import.meta.dir, "../../registry");
const TOKENS = join(REGISTRY, "tokens");
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS)]
  .sort()
  .map((f) => readFileSync(join(TOKENS, f), "utf8"));
const CSS = readFileSync(join(DIR, "document.css"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "document.theme.json"), "utf8")) as ThemeManifest;
const VALUES = parseThemeValues(CSS);
const AXES = axesFromCss(CSS, AXIS_BASE);

describe("document theme · the identity it states in tokens", () => {
  it("derives the adoption table's row: no motion, flat, sharp, untextured, a plain underline", () => {
    expect({
      motion: AXES.motion,
      depth: AXES.depth,
      radius: AXES.shape.radius,
      material: AXES.material,
      link: AXES.decoration.link,
      scheme: AXES.scheme,
      contrast: AXES.contrast,
    }).toEqual({
      motion: "none",
      depth: "flat",
      radius: "sharp",
      material: "none",
      link: "plain",
      scheme: "light",
      contrast: "high",
    });
    expect(MANIFEST.axes).toEqual(AXES);
    expect(parseThemeSchemes(CSS).dark.size).toBe(0);
  });

  it("zeroes EVERY duration, not just the one the axis reads", () => {
    // `motion` is classified from `--duration-normal`, but a theme that zeroed
    // only that one would still have components easing on `--duration-fast`.
    for (const token of [
      "duration-instant",
      "duration-fast",
      "duration-normal",
      "duration-slow",
      "duration-slower",
    ]) {
      expect({ [token]: durationMs(VALUES.light.get(token)!) }).toEqual({ [token]: 0 });
    }
    // The whole ramp: every duration token the base layer publishes is covered,
    // so a token added later shows up here rather than being quietly missed.
    const base = readFileSync(join(TOKENS, "motion.css"), "utf8");
    const published = [...base.matchAll(/--(duration-[a-z]+)\s*:/g)].map((m) => m[1]);
    expect(published.length).toBeGreaterThan(0);
    for (const token of published) {
      expect({ [token]: VALUES.light.get(token) }).toEqual({ [token]: "0ms" });
    }
  });

  it("zero duration is safe, not merely quiet: the waiters check before they wait", () => {
    // The hazard a `motion: none` theme would otherwise introduce is a
    // "closing → closed" controller parked forever on a `transitionend` that
    // never fires. Both waiters guard against it: `core/motion.js` reads the
    // computed duration and resolves immediately when there is none, and the
    // engine arms a timeout alongside the event.
    const motion = readFileSync(join(REGISTRY, "core/motion.js"), "utf8");
    expect(motion).toContain("hasDuration");
    expect(motion).toContain("if (!hasDuration) return Promise.resolve();");
    const engine = readFileSync(join(import.meta.dir, "../../src/core-src/engine.js"), "utf8");
    expect(engine).toContain("function motionTimeoutMs(el)");
  });

  it("brings the underline down to the baseline, and keeps it visible", () => {
    const lookup = new Map<string, string>();
    for (const source of AXIS_BASE) {
      for (const [name, value] of parseThemeValues(source).light) lookup.set(name, value);
    }
    for (const [name, value] of VALUES.light) lookup.set(name, value);
    const offset = lengthEm(resolveValue(lookup.get("link-underline-offset")!, lookup));
    expect(offset).not.toBeNull();
    expect(offset!).toBeLessThan(LINK_OFFSET_MIN_EM);
    // `plain`, not `none`: a link in print must still be identifiable by
    // something other than its colour (WCAG 1.4.1), so the rule stays.
    expect(VALUES.light.get("link-decoration")).toBeUndefined();
    expect(AXES.decoration.link).not.toBe("none");
    const aliases = readFileSync(join(TOKENS, "aliases.css"), "utf8");
    expect(aliases).toMatch(/--link-decoration:\s*underline/);
  });

  it("keeps the page untextured, on screen and on paper", () => {
    // The print suite depends on it: a page texture is a background image, and
    // `@media print` re-declares `background` as a shorthand.
    expect(VALUES.light.get("texture-page")).toBeUndefined();
    expect(VALUES.light.get("texture-surface")).toBeUndefined();
    expect(AXES.material).toBe("none");
    expect(CSS).toContain("@media print");
  });
});
