// ═══════════════════════════════════════════════════════════════════════════
// The focus ring — WCAG 2.2 SC 1.4.11, on every shipped theme  [W3-3]
// ═══════════════════════════════════════════════════════════════════════════
//
// `--color-ring` was authored translucent (α 0.35–0.6) in every theme except
// `contrast`, so the composited ring landed at 1.37–2.72:1 against the surface
// it was drawn on: a keyboard user could not see where focus was, on 19 of 24
// theme × mode combinations.
//
// The framework's own contrast gate could not catch it, and not by oversight:
// `contrast-tokens` skips translucent pairs BY DESIGN, because a composited
// colour has no context-free ratio. So the one token whose entire purpose is to
// be visible was exempt from the visibility check by construction. Two things
// close that: the rings are opaque, and the rule now treats a translucent ring
// as a finding rather than as something it cannot judge.
//
// This file gates the shipped themes. The rule's own unit behaviour lives in
// tests/audit/contrast-tokens.test.ts.

import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildSchemeLookups,
  checkThemeContrast,
  CONTRAST_NON_TEXT,
  NON_TEXT_PAIRS,
} from "../../src/audit/contrast-tokens";
import { resolveColorString, parseCssColor, contrastRatio, isOpaqueColor } from "../../src/utils/oklch";

const THEMES_DIR = join(import.meta.dir, "../../registry/themes");
const TOKENS_DIR = join(import.meta.dir, "../../registry/tokens");

const BASE_CSS = ["palette.css", "semantic.css", "aliases.css"]
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"))
  .join("\n");

const THEMES = readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith(".css"))
  .map((f) => f.replace(/\.css$/, ""))
  .sort();

const SCHEMES = ["light", "dark"] as const;

it("every shipped theme is covered", () => {
  // A theme added without a stylesheet here would silently not be checked.
  expect(THEMES.length).toBeGreaterThanOrEqual(12);
  expect(THEMES).toContain("default");
  expect(THEMES).toContain("contrast");
});

for (const theme of THEMES) {
  describe(`focus ring · ${theme}`, () => {
    const themeCss = readFileSync(join(THEMES_DIR, `${theme}.css`), "utf8");
    const lookups = buildSchemeLookups(themeCss, BASE_CSS);

    for (const scheme of SCHEMES) {
      const lk = lookups[scheme];
      const ringRaw = lk.get("color-ring");
      const ring = ringRaw ? resolveColorString(ringRaw, lk) : null;

      it(`${scheme}: --color-ring resolves and is opaque`, () => {
        expect(ring, `${theme}/${scheme} has no --color-ring`).not.toBeNull();
        // A translucent ring composites down to whatever is behind it; the ratio
        // it advertises is not the ratio anybody sees.
        expect(isOpaqueColor(ring!), `${theme}/${scheme} ring ${ring} is translucent`).toBe(true);
      });

      for (const { bg } of NON_TEXT_PAIRS) {
        it(`${scheme}: ring on --${bg} ≥ ${CONTRAST_NON_TEXT}:1`, () => {
          const bgRaw = lk.get(bg);
          if (!bgRaw) return; // token not declared in this theme
          const bgVal = resolveColorString(bgRaw, lk);
          const ringRgb = ring ? parseCssColor(ring) : null;
          const bgRgb = bgVal ? parseCssColor(bgVal) : null;
          if (!ringRgb || !bgRgb) return;

          const ratio = contrastRatio(ringRgb, bgRgb);
          expect(
            ratio,
            `${theme}/${scheme}: ${ring} on ${bgVal} is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(CONTRAST_NON_TEXT);
        });
      }
    }
  });
}

describe("the widened rule reports what it used to skip", () => {
  const themeCss = readFileSync(join(THEMES_DIR, "default.css"), "utf8");

  it("passes on every shipped theme as authored", () => {
    for (const theme of THEMES) {
      const css = readFileSync(join(THEMES_DIR, `${theme}.css`), "utf8");
      const findings = checkThemeContrast({ themeName: theme, themeCss: css, baseCss: BASE_CSS });
      expect(findings.map((f) => f.message), theme).toEqual([]);
    }
  });

  it("flags a translucent ring as a finding, not as unjudgeable", () => {
    // Exactly the value `default` shipped before W3-3.
    const regressed = themeCss.replace(
      /--color-ring:(\s*)oklch\(([^)]*)\)/g,
      "--color-ring:$1oklch($2 / 0.4)",
    );
    expect(regressed).not.toBe(themeCss);

    const findings = checkThemeContrast({
      themeName: "default",
      themeCss: regressed,
      baseCss: BASE_CSS,
    });
    const ringFindings = findings.filter((f) => f.message.includes("--color-ring"));
    expect(ringFindings.length).toBeGreaterThan(0);
    expect(ringFindings[0].message).toContain("translucent");
    expect(ringFindings[0].message).toContain("1.4.11");
    // One report per scheme for the token, not one per surface it sits on.
    expect(ringFindings.length).toBeLessThanOrEqual(2);
  });

  it("flags an opaque ring that is simply too faint", () => {
    // `default` states its ring only in the dark blocks (light inherits the
    // semantic base), so the faint stand-in has to be dark-on-dark.
    const faint = themeCss.replace(
      /--color-ring:(\s*)oklch\([^)]*\)/g,
      "--color-ring:$1oklch(0.17 0.01 264)",
    );
    const findings = checkThemeContrast({ themeName: "default", themeCss: faint, baseCss: BASE_CSS });
    const ringFindings = findings.filter((f) => f.message.includes("--color-ring"));
    expect(ringFindings.length).toBeGreaterThan(0);
    expect(ringFindings.some((f) => f.message.includes(`${CONTRAST_NON_TEXT}:1`))).toBe(true);
  });
});
