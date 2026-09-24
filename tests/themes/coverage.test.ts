// ═══════════════════════════════════════════════════════════════════════════
// Theme coverage matrix — permanent CI gate  [task 0.3-11]
// ═══════════════════════════════════════════════════════════════════════════
//
// Every shipped theme must define values for all 31 semantic color tokens plus
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
  schemesFromManifest,
} from "./theme-coverage";
import type { ThemeManifest } from "../../src/theme-manifest";

/** Read a theme's sibling `{name}.theme.json` — the source of truth for its scheme. */
function readThemeManifest(cssFile: string): ThemeManifest {
  const path = join(THEMES_DIR, cssFile.replace(/\.css$/, ".theme.json"));
  return JSON.parse(readFileSync(path, "utf8")) as ThemeManifest;
}

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
  it("derives 31 semantic color tokens + 5 shadow tokens from the base files", () => {
    expect(REQUIRED.colors.length).toBe(31);
    expect(REQUIRED.shadows.length).toBe(5);
    expect(REQUIRED.all.length).toBe(36);
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
    // Declared scheme now comes from the theme manifest (0.4-12), not a heuristic.
    const manifest = readThemeManifest(file);
    const declared = schemesFromManifest(manifest.scheme);
    const schemeLabel = declared.join("+");
    it(`${file} (${schemeLabel}) covers all ${REQUIRED.all.length} tokens in every scheme`, () => {
      const coverage = computeCoverage(css, REQUIRED.all, BASE, declared);
      const failures = coverage
        .filter(c => !c.covered)
        .map(c => `${c.scheme} [${c.block}] → missing: ${c.missing.join(", ")}`);
      // Empty string == full coverage. A regression prints theme/scheme/tokens.
      expect(failures.join("\n")).toBe("");
    });
  }

  // The manifest's declared scheme must not lie about the CSS: a theme that
  // declares dark (scheme "dark"/"both") must actually ship dark blocks, and a
  // light-only theme (scheme "light") must ship none. This is what makes the
  // manifest a trustworthy source of truth for the matrix above.
  for (const file of THEME_FILES) {
    it(`${file} manifest scheme is consistent with its CSS dark blocks`, () => {
      const css = readFileSync(join(THEMES_DIR, file), "utf8");
      const manifest = readThemeManifest(file);
      const schemes = parseThemeSchemes(css);
      const hasDarkBlocks = schemes.dark.size > 0 || schemes.auto.size > 0;
      const declaresDark = manifest.scheme !== "light";
      expect(hasDarkBlocks).toBe(declaresDark);
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

  // ── The one-block form covers the same schemes  [1.1A-06] ──
  it("computes identical coverage for a theme written both ways", () => {
    // The same theme, twice: once with `light-dark()` in a single `:root` block
    // and once with the three blocks it replaces. Coverage must not be able to
    // tell them apart — a gate that goes quiet on a migrated theme is worse than
    // no gate, because the CSS looks tidier while nothing is checking it.
    const decl = (token: string) => `--${token}: ${token.startsWith("shadow-") ? "none" : "black"};`;
    const body = REQUIRED.all.map(decl).join("\n  ");
    const tripleBlock = `/* @ui:theme twin */
:root { ${REQUIRED.all.map((t) => `--${t}: ${t.startsWith("shadow-") ? "none" : "white"};`).join(" ")} }
[data-theme="dark"] {
  ${body}
}
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] {
  ${body}
  }
}`;
    const oneBlock = `/* @ui:theme twin */
:root {
  ${REQUIRED.all
    .map((t) =>
      t.startsWith("shadow-")
        ? `--${t}: light-dark(none, none);`
        : `--${t}: light-dark(white, black);`,
    )
    .join("\n  ")}
}`;
    const triple = computeCoverage(tripleBlock, REQUIRED.all, BASE, ["light", "dark"]);
    const one = computeCoverage(oneBlock, REQUIRED.all, BASE, ["light", "dark"]);
    expect(one).toEqual(triple);
    expect(one.every(c => c.covered)).toBe(true);
  });

  it("reports light-dark() in a theme that claims a single scheme", () => {
    // `light-dark()` in a light-only theme is a contradiction: the dark argument
    // can never render. It surfaces through the same channel as a stray dark
    // block — the single-scheme claim disagreeing with the CSS.
    const contradiction = `/* @ui:schemes light */
:root { --color-bg: light-dark(white, black); }`;
    const cov = computeCoverage(contradiction, REQUIRED.all, BASE, ["light"]);
    const dark = cov.find(c => c.scheme === "dark")!;
    expect(dark.covered).toBe(false);
    expect(dark.missing).toEqual(["color-bg"]);
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

// ═══════════════════════════════════════════════════════════════════════════
// A theme states VALUES. It does not state rules about components. [1.1A-15]
// ═══════════════════════════════════════════════════════════════════════════
//
// The permanent form of 1.1A-14's and 1.1A-15's first acceptance criterion,
// stated once over all twelve rather than per theme. 1.0 shipped two themes
// that reached into components by selector because the tokens they needed did
// not exist: `glass` boosted five recipes to make them translucent (1.1A-04
// gave every floating surface `--surface-backdrop`, and 1.1A-14 deleted the
// fourteen lines), and `contrast` re-asserted a 3px ring on thirteen `data-ui`
// values and dimmed every disabled `[data-ui]` (1.1A-02 gave the ring a width
// token, this task gave the dim `--disabled-opacity`, and both blocks are
// gone).
//
// Why it is a rule and not a preference: a theme that out-specifies a component
// is a theme that breaks when that component's selector changes, that cannot be
// scoped to a subtree (1.1A-19's `data-skin`), and whose effect no manifest
// records — `tokens_overridden` cannot describe a rule. Keeping themes to
// declarations is what makes the manifest a complete description of a theme.
describe("theme CSS · declarations only — no theme selects a component", () => {
  /** The five protocol attributes, as they appear in a selector. */
  const PROTOCOL = /\[data-(?:ui|part|variant|size|state)[=\]~|^$*]/;

  for (const file of THEME_FILES) {
    it(`${file} mentions no protocol attribute`, () => {
      const css = readFileSync(join(THEMES_DIR, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
      const hits = [...css.matchAll(new RegExp(PROTOCOL, "g"))].map((m) => m[0]);
      expect({ [file]: hits }).toEqual({ [file]: [] });
    });
  }

  it("every selector in every theme is a :root or a sanctioned modifier", () => {
    // The converse, so a theme cannot smuggle a rule in under a selector that
    // simply avoids the five attributes (`button:focus`, `.card`, `a`).
    const ALLOWED = new Set([
      ":root",
      '[data-theme="dark"]',
      '[data-theme="auto"]',
      ':root [data-theme="dark"]',
      // Every scheme island, beside `:root`: where a theme re-points an alias
      // the token layer restates per island (tests/themes/scheme-islands.test.ts).
      "[data-theme]",
    ]);
    const offenders: string[] = [];
    for (const file of THEME_FILES) {
      const css = readFileSync(join(THEMES_DIR, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
      for (const match of css.matchAll(/([^{}]+)\{/g)) {
        const prelude = match[1].trim().replace(/\s+/g, " ");
        // `@media`/`@supports` preludes open a nested block, not a rule.
        if (prelude.startsWith("@")) continue;
        for (const selector of prelude.split(",").map((s) => s.trim())) {
          if (!ALLOWED.has(selector)) offenders.push(`${file}: ${selector}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is not vacuous: a planted rule is reported", () => {
    const planted = `:root { --color-bg: white; }\n[data-ui="card"] { box-shadow: none; }\n`.replace(
      /\/\*[\s\S]*?\*\//g,
      " ",
    );
    expect(PROTOCOL.test(planted)).toBe(true);
    const selectors = [...planted.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    expect(selectors).toContain('[data-ui="card"]');
  });
});
