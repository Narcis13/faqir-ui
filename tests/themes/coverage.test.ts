// ═══════════════════════════════════════════════════════════════════════════
// Theme coverage matrix — permanent CI gate  [task 0.3-11]
// ═══════════════════════════════════════════════════════════════════════════
//
// Every shipped theme must define values for all 27 semantic color tokens plus
// the 5 shadow tokens in each color scheme it ships (light + dark, or an explicit
// single-scheme via `@ui:schemes light`). A dark block cannot inherit correct
// values from the base `:root` (that holds the *light* values), so it must
// redefine the whole set — otherwise a token renders with its light value in dark
// mode.
//
// The matrix is fully data-driven:
//   • required tokens  ← parsed from tokens/semantic.css + tokens/effects.css
//   • themes           ← globbed from registry/themes/*.css
//   • declared schemes ← parsed from each theme's `@ui:schemes` directive
// so adding a sixth theme (or a 28th token) needs no edits to this test.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import {
  requiredTokens,
  computeCoverage,
  parseThemeSchemes,
  declaredSchemes,
} from "./theme-coverage";

const REGISTRY = join(import.meta.dir, "../../registry");
const THEMES_DIR = join(REGISTRY, "themes");

// Required token set — derived from the base token files, never hand-listed.
const semanticCss = readFileSync(join(REGISTRY, "tokens/semantic.css"), "utf8");
const effectsCss = readFileSync(join(REGISTRY, "tokens/effects.css"), "utf8");
const REQUIRED = requiredTokens(semanticCss, effectsCss);

// The light-scheme baseline every theme builds on (semantic.css + effects.css :root).
const BASE = new Set<string>([
  ...parseThemeSchemes(semanticCss).light,
  ...parseThemeSchemes(effectsCss).light,
]);

// Themes discovered by globbing — a 6th theme is picked up with zero test edits.
const THEME_FILES = [...new Glob("*.css").scanSync(THEMES_DIR)].sort();

describe("theme coverage · required token set (data-driven)", () => {
  it("derives 27 semantic color tokens + 5 shadow tokens from the base files", () => {
    expect(REQUIRED.colors.length).toBe(27);
    expect(REQUIRED.shadows.length).toBe(5);
    expect(REQUIRED.all.length).toBe(32);
  });

  it("the base (semantic.css + effects.css) defines every required token for light", () => {
    expect(REQUIRED.all.filter(t => !BASE.has(t))).toEqual([]);
  });
});

// ── The matrix: themes × schemes, each cell must cover every required token ──
describe("theme coverage · every shipped theme covers its declared schemes", () => {
  it("discovers the shipped themes by globbing (no hand-maintained list)", () => {
    expect(THEME_FILES.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of THEME_FILES) {
    const css = readFileSync(join(THEMES_DIR, file), "utf8");
    const schemeLabel = declaredSchemes(css).join("+");
    it(`${file} (${schemeLabel}) covers all ${REQUIRED.all.length} tokens in every scheme`, () => {
      const coverage = computeCoverage(css, REQUIRED.all, BASE);
      const failures = coverage
        .filter(c => !c.covered)
        .map(c => `${c.scheme} [${c.block}] → missing: ${c.missing.join(", ")}`);
      // Empty string == full coverage. A regression prints theme/scheme/tokens.
      expect(failures.join("\n")).toBe("");
    });
  }
});

// ── Proof the gate actually catches under-coverage (failing-theme fixtures) ──
describe("theme coverage · the gate fails loudly for under-covering themes", () => {
  it("flags a dual theme whose dark block omits most tokens", () => {
    const underCovered = `/* @ui:theme broken */
:root { /* light inherits the base */ }
[data-theme="dark"] {
  --color-bg: black;
  --color-fg: white;
  /* every other color + all shadows are missing */
}
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] { --color-bg: black; --color-fg: white; }
}`;
    const cov = computeCoverage(underCovered, REQUIRED.all, BASE);
    const dark = cov.find(c => c.scheme === "dark")!;
    expect(dark.covered).toBe(false);
    expect(dark.missing).toContain("color-primary");
    expect(dark.missing).toContain("color-destructive-fg");
    expect(dark.missing).toContain("shadow-md");
    // …but light is still fine because it resolves through the base.
    expect(cov.find(c => c.scheme === "light")!.covered).toBe(true);
  });

  it("fails a theme that omits its dark block unless it declares single-scheme", () => {
    const body = `:root { --color-bg: white; }`;

    // No @ui:schemes directive → defaults to dual → dark is required → fails.
    const implicitDual = computeCoverage(`/* @ui:theme x */\n${body}`, REQUIRED.all, BASE);
    expect(implicitDual.find(c => c.scheme === "dark")!.covered).toBe(false);

    // Explicit single-scheme declaration → light-only → passes.
    const single = computeCoverage(`/* @ui:schemes light */\n${body}`, REQUIRED.all, BASE);
    expect(single.every(c => c.covered)).toBe(true);
  });

  it("flags a single-scheme theme that still half-defines a dark block", () => {
    const inconsistent = `/* @ui:schemes light */
:root { --color-bg: white; }
[data-theme="dark"] { --color-bg: black; }`;
    const cov = computeCoverage(inconsistent, REQUIRED.all, BASE);
    expect(cov.find(c => c.scheme === "dark")!.covered).toBe(false);
    expect(cov.find(c => c.scheme === "dark")!.missing).toContain("color-bg");
  });
});

// ── Parser unit checks: declarations land in the right scheme bucket ──
describe("theme coverage · scheme parser", () => {
  it("attributes declarations to light / dark / auto by their enclosing selector", () => {
    const css = `:root { --color-bg: white; }
[data-theme="dark"] { --color-bg: black; }
@media (prefers-color-scheme: dark) { [data-theme="auto"] { --color-bg: black; } }`;
    const s = parseThemeSchemes(css);
    expect(s.light.has("color-bg")).toBe(true);
    expect(s.dark.has("color-bg")).toBe(true);
    expect(s.auto.has("color-bg")).toBe(true);
  });

  it("only tracks --color-* and --shadow-* custom properties", () => {
    const s = parseThemeSchemes(`:root { --space-4: 1rem; --radius-md: 4px; --shadow-sm: none; --color-fg: black; }`);
    expect([...s.light].sort()).toEqual(["color-fg", "shadow-sm"]);
  });

  it("reads a narrowed scheme set from the @ui:schemes directive", () => {
    expect(declaredSchemes(`/* @ui:schemes light */`)).toEqual(["light"]);
    expect(declaredSchemes(`/* no directive */`)).toEqual(["light", "dark"]);
    expect(declaredSchemes(`/* @ui:schemes light dark */`)).toEqual(["light", "dark"]);
  });
});
