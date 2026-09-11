// ═══════════════════════════════════════════════════════════════════════════
// The one-block theme: `default` migrated to light-dark()  [task 1.1A-06]
// ═══════════════════════════════════════════════════════════════════════════
//
// Two things have to hold for a one-block theme to be a simplification rather
// than a trap:
//
//   1. The CASCADE CONTRACT exists. `light-dark()` reads `color-scheme`, not
//      `data-theme`, so without the three rules in `base/reset.css` a migrated
//      theme renders its LIGHT side under `data-theme="dark"` — silently, with
//      no error anywhere. That mapping is declared once, for every theme.
//   2. The LIGHT SIDE does not drift. A token cannot read its own base value
//      (`light-dark(var(--color-bg), …)` on `--color-bg` is a cycle), so the
//      one-block form has to restate the light value the theme used to inherit
//      from `tokens/semantic.css`. That copy is only safe while something
//      compares it to the original — which is the second half of this file.
//
// The third thing, that a migrated theme RENDERS what the three-block file
// rendered, is not decidable here: `light-dark()` is resolved by the engine, and
// happy-dom has none. It is proven in a real browser by
// `tests/browser/light-dark.pw.ts`, against the v1.0.0 file read from git.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import {
  parseThemeValues,
  substituteLightDark,
  hasLightDark,
  flattenLayers,
  resolveColorString,
  isOpaqueColor,
} from "../../src/utils/oklch";
import { requiredTokens } from "./theme-coverage";

const REGISTRY = join(import.meta.dir, "../../registry");
const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

const RESET = read("base/reset.css");
const SEMANTIC = read("tokens/semantic.css");
const EFFECTS = read("tokens/effects.css");
const DEFAULT_CSS = read("themes/default.css");

// ── 1. The cascade contract ─────────────────────────────────────────────────

describe("the cascade contract · data-theme drives color-scheme", () => {
  it("maps all three data-theme values in base/reset.css", () => {
    // Written as the mapping, not as a substring search for the property: a rule
    // that set `color-scheme` on the wrong selector would pass a looser check.
    const rule = (selector: string) =>
      new RegExp(`${selector}\\s*\\{[^}]*color-scheme\\s*:\\s*([a-z ]+)\\s*;`).exec(RESET)?.[1];
    expect(rule(":root")).toBe("light");
    expect(rule('\\[data-theme="dark"\\]')).toBe("dark");
    expect(rule('\\[data-theme="auto"\\]')).toBe("light dark");
  });

  it("is the only place the registry declares color-scheme outside print", () => {
    // Two declarations of one scheme signal is how a page ends up rendering the
    // light side of every light-dark() under `data-theme="dark"`.
    const offenders: string[] = [];
    for (const dir of ["base", "tokens", "primitives", "recipes", "patterns", "themes"]) {
      for (const file of new Glob("**/*.css").scanSync(join(REGISTRY, dir))) {
        const rel = `${dir}/${file}`;
        if (rel === "base/reset.css") continue;
        const css = read(rel).replace(/\/\*[\s\S]*?\*\//g, "");
        // `@media print { :root { color-scheme: light } }` in the document themes
        // is a different contract — paged media, where dark mode does not exist.
        const outsidePrint = css.replace(/@media\s+print\s*\{[\s\S]*?\n\}/g, "");
        if (/(^|[;{\s])color-scheme\s*:/.test(outsidePrint)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── 2. The light side of `default` still equals the base ────────────────────

/**
 * The tokens `default` deliberately moves away from the base in LIGHT mode — the
 * WCAG 2 AA corrections from task 0.4-24 · §12.3, each one a darkening that only
 * raises contrast on the solid surfaces that carry it.
 *
 * Everything else must match `tokens/semantic.css` / `tokens/effects.css`
 * exactly. The list is checked in BOTH directions below, so an entry that stops
 * differing has to be removed rather than left here as documentation of a value
 * that no longer exists.
 */
const LIGHT_OVERRIDES: Record<string, string> = {
  "color-fg-muted": "gray-500 was 4.31:1 on muted surfaces (avatar/tabs)",
  "color-fg-subtle": "gray-400 was 2.61:1 (subtle text, footers, page-break)",
  "color-success": "green-500 as soft-badge/stat/stepper text was 3.19:1",
  "color-warning": "amber-500 as soft-badge text was 2.02:1",
};

describe("default (one block) · the restated light side does not drift", () => {
  const base = flattenLayers([
    parseThemeValues(SEMANTIC).light,
    parseThemeValues(EFFECTS).light,
  ]);
  // Re-read the raw `:root` declarations: the parser hands back the light side
  // already substituted, which is exactly the value under comparison.
  const themeLight = parseThemeValues(DEFAULT_CSS).light;

  it("uses the one-block form at all (the gate is not vacuous)", () => {
    const oneBlock = [...new Map(
      [...DEFAULT_CSS.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2]] as const),
    )].filter(([, value]) => hasLightDark(value));
    expect(oneBlock.length).toBeGreaterThanOrEqual(27);
  });

  it("restates every non-override token exactly as the base declares it", () => {
    const drifted: string[] = [];
    for (const [token, value] of themeLight) {
      if (token in LIGHT_OVERRIDES) continue;
      const baseValue = base.get(token);
      if (baseValue == null) continue; // a token the base does not own
      if (value !== baseValue) drifted.push(`--${token}: ${value} (base: ${baseValue})`);
    }
    expect(drifted).toEqual([]);
  });

  it("keeps every listed override an override, and every override listed", () => {
    const stillDiffers = Object.keys(LIGHT_OVERRIDES)
      .filter((token) => themeLight.get(token) !== base.get(token));
    expect(stillDiffers.sort()).toEqual(Object.keys(LIGHT_OVERRIDES).sort());
  });
});

// ── 3. Both schemes resolve, in both directions ─────────────────────────────

describe("default (one block) · every required token resolves per scheme", () => {
  const REQUIRED = requiredTokens(SEMANTIC, EFFECTS);
  const theme = parseThemeValues(DEFAULT_CSS);
  const base = parseThemeValues(`${read("tokens/palette.css")}\n${SEMANTIC}\n${EFFECTS}`);
  const lookups = {
    light: flattenLayers([theme.light, base.light]),
    dark: flattenLayers([theme.dark, theme.light, base.light]),
    auto: flattenLayers([theme.auto, theme.light, base.light]),
  } as const;

  for (const scheme of ["light", "dark", "auto"] as const) {
    it(`${scheme}: all ${REQUIRED.colors.length} colour tokens reach an opaque literal`, () => {
      const lookup = lookups[scheme];
      const unresolved = REQUIRED.colors.filter((token) => {
        const resolved = resolveColorString(`var(--${token})`, lookup);
        return !resolved || !isOpaqueColor(resolved);
      });
      expect(unresolved).toEqual([]);
    });
  }

  it("light and dark disagree on the colours a theme exists to change", () => {
    // The converse proof: if the parser quietly handed the LIGHT argument to
    // both schemes, every assertion above would still pass.
    const differing = REQUIRED.colors.filter(
      (token) =>
        resolveColorString(`var(--${token})`, lookups.light) !==
        resolveColorString(`var(--${token})`, lookups.dark),
    );
    expect(differing.length).toBeGreaterThanOrEqual(25);
    expect(differing).toContain("color-bg");
    expect(differing).toContain("color-fg");
    expect(differing).toContain("color-primary-fg");
  });

  it("auto resolves exactly as dark does (it is the system-preference mirror)", () => {
    for (const token of REQUIRED.all) {
      expect(
        resolveColorString(`var(--${token})`, lookups.auto),
        token,
      ).toBe(resolveColorString(`var(--${token})`, lookups.dark));
    }
  });

  it("the shadow ramp is still authored as blocks, and says why", () => {
    // `light-dark()` is a <color> function; a shadow list is not a colour. The
    // decision is load-bearing enough to assert, so a later sweep that "finishes
    // the migration" has to come back to this comment first.
    const shadows = REQUIRED.shadows;
    for (const token of shadows) {
      expect(hasLightDark(theme.light.get(token) ?? ""), token).toBe(false);
      expect(theme.dark.has(token), token).toBe(true);
      expect(theme.auto.has(token), token).toBe(true);
    }
    expect(DEFAULT_CSS).toContain("<color> function and a");
  });
});

// ── 4. The two authoring forms are interchangeable ──────────────────────────

describe("the two authoring forms parse to the same thing", () => {
  it("expands to the triple form and parses identically", () => {
    // The three-block spelling of the same theme, written out rather than
    // derived from the one-block file — a mechanical re-substitution would only
    // prove the substituter agrees with itself.
    const oneBlock = `:root {
  --color-bg: light-dark(white, black);
  --color-fg: light-dark(black, white);
  --color-surface-1: var(--color-bg);
}`;
    const tripleBlock = `:root {
  --color-bg: white;
  --color-fg: black;
  --color-surface-1: var(--color-bg);
}
[data-theme="dark"] {
  --color-bg: black;
  --color-fg: white;
  --color-surface-1: var(--color-bg);
}
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] {
    --color-bg: black;
    --color-fg: white;
    --color-surface-1: var(--color-bg);
  }
}`;
    const one = parseThemeValues(oneBlock);
    const triple = parseThemeValues(tripleBlock);
    for (const scheme of ["light", "dark", "auto"] as const) {
      expect([...one[scheme]].sort(), scheme).toEqual([...triple[scheme]].sort());
    }
  });

  it("substituting a scheme is idempotent, declaration by declaration", () => {
    const values = [...parseThemeValues(DEFAULT_CSS).light.values()];
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      // The parser already substituted; a second pass must be a no-op, and no
      // call may survive into a scheme's resolved value.
      expect(hasLightDark(value), value).toBe(false);
      expect(substituteLightDark(value, "dark")).toBe(value);
    }
  });
});
