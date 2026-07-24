// glass — frosted-glass theme: solid fallbacks + @supports translucency  [task 0.7-10]
//
// ═══════════ How translucent contrast is computed (the documented approach) ══
//
// The standard `contrast-tokens` rule deliberately skips translucent values —
// contrast is undefined without a known backdrop. Glass therefore gets a
// two-part gate:
//
//  1. FALLBACK — with every `@supports` block stripped, the stylesheet must be
//     a complete opaque theme that clears the full standard pair list, and
//     every pair must actually COMPUTE (nothing silently skipped as
//     unresolvable). This is exactly what a browser without backdrop-filter
//     renders.
//  2. FROSTED — each translucent surface token is authored as
//     `color-mix(in oklch, C p%, transparent)`, which under CSS premultiplied
//     interpolation is exactly C at alpha p/100. A browser then composites an
//     element's background over its backdrop channel-wise on gamma-encoded
//     sRGB:  out = α·src + (1−α)·backdrop. We resolve C through the token
//     graph, composite it over EVERY opaque surface the frosted element can
//     float above (bg, bg-subtle, bg-muted — the worst realistic backdrops;
//     the accompanying backdrop-filter blur only averages arbitrary content
//     toward these), and assert WCAG AA for the text tokens that sit on the
//     frosted surface (fg, fg-muted), in both schemes.
//
// The shipped file also stays clean under the global `contrast-tokens` gate in
// tests/audit/contrast-tokens.test.ts, because the frost only touches the
// `--card-bg` / `--glass-panel` surface aliases — never the gated `color-*`
// pairs, which remain solid.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseThemeValues,
  flattenLayers,
  resolveColorString,
  parseCssColor,
  contrastRatio,
  isOpaqueColor,
  type LinearRgb,
} from "../../src/utils/oklch";
import {
  checkThemeContrast,
  CONTRAST_PAIRS,
  CONTRAST_AA,
} from "../../src/audit/contrast-tokens";
import type { ThemeManifest } from "../../src/theme-manifest";

const DIR = join(import.meta.dir, "../../registry/themes");
const TOKENS = join(import.meta.dir, "../../registry/tokens");
const CSS = readFileSync(join(DIR, "glass.css"), "utf8");
const MANIFEST = JSON.parse(
  readFileSync(join(DIR, "glass.theme.json"), "utf8"),
) as ThemeManifest;
const BASE_CSS = ["palette", "semantic", "aliases"]
  .map((f) => readFileSync(join(TOKENS, `${f}.css`), "utf8"))
  .join("\n");

// ── Split the stylesheet into its fallback body and its @supports blocks ────
// Comments are stripped first so prose mentioning @supports/color-mix never
// counts as code — every structural assertion below runs on code only.
function splitSupports(rawCss: string): { fallback: string; blocks: string[] } {
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: string[] = [];
  let fallback = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@supports", i);
    if (at === -1) {
      fallback += css.slice(i);
      break;
    }
    fallback += css.slice(i, at);
    let j = css.indexOf("{", at) + 1;
    let depth = 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    blocks.push(css.slice(at, j));
    i = j;
  }
  return { fallback, blocks };
}

const { fallback: FALLBACK_CSS, blocks: SUPPORTS_BLOCKS } = splitSupports(CSS);

// The browser's element-background compositing: channel-wise source-over on
// gamma-encoded sRGB, decoded back to linear for WCAG luminance.
const gammaEncode = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
const gammaDecode = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
function compositeOver(src: LinearRgb, alpha: number, backdrop: LinearRgb): LinearRgb {
  const blend = (s: number, b: number) =>
    gammaDecode(alpha * gammaEncode(s) + (1 - alpha) * gammaEncode(b));
  return { r: blend(src.r, backdrop.r), g: blend(src.g, backdrop.g), b: blend(src.b, backdrop.b) };
}

// Scheme lookups over the FULL stylesheet (the @supports overrides win, exactly
// as they do in a supporting browser).
const theme = parseThemeValues(CSS);
const base = parseThemeValues(BASE_CSS);
const LOOKUPS = {
  light: flattenLayers([theme.light, base.light]),
  dark: flattenLayers([theme.dark, theme.light, base.light]),
} as const;
type Scheme = keyof typeof LOOKUPS;

const MIX_RE = /^color-mix\(in oklch,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\)$/;
const FROSTED_TOKENS = ["card-bg", "glass-panel"] as const;
const BACKDROP_TOKENS = ["color-bg", "color-bg-subtle", "color-bg-muted"] as const;
const TEXT_TOKENS = ["color-fg", "color-fg-muted"] as const;

/** Resolve a token to an opaque LinearRgb within one scheme, or throw loudly. */
function resolveOpaque(token: string, scheme: Scheme): LinearRgb {
  const lookup = LOOKUPS[scheme];
  const resolved = resolveColorString(lookup.get(token) ?? `var(--${token})`, lookup);
  if (!resolved || !isOpaqueColor(resolved)) {
    throw new Error(`--${token} did not resolve to an opaque color in ${scheme}: ${resolved}`);
  }
  return parseCssColor(resolved)!;
}

// ═══════════ 1. Solid-first authoring: translucency only behind @supports ═══
describe("glass · @supports fallback structure", () => {
  it("gates the frost behind a backdrop-filter feature query (with the -webkit- twin)", () => {
    expect(SUPPORTS_BLOCKS.length).toBeGreaterThanOrEqual(1);
    expect(CSS).toMatch(
      /@supports\s*\(\(-webkit-backdrop-filter:[^)]+\)\s+or\s+\(backdrop-filter:[^)]+\)\)/,
    );
  });

  it("keeps every color-mix() and backdrop-filter inside the @supports block", () => {
    expect(FALLBACK_CSS).not.toContain("color-mix(");
    expect(FALLBACK_CSS).not.toContain("backdrop-filter");
    const frost = SUPPORTS_BLOCKS.join("\n");
    expect(frost).toContain("color-mix(");
    expect(frost).toContain("-webkit-backdrop-filter: blur(var(--glass-blur))");
    expect(frost).toContain("backdrop-filter: blur(var(--glass-blur))");
  });

  it("defines the frosted surface tokens ONLY inside @supports — the fallback never sees them", () => {
    for (const token of FROSTED_TOKENS) {
      expect(FALLBACK_CSS).not.toContain(`--${token}:`);
      expect(SUPPORTS_BLOCKS.join("\n")).toContain(`--${token}:`);
    }
  });

  it("applies the frost to the floating panels with :root-boosted specificity", () => {
    const frost = SUPPORTS_BLOCKS.join("\n");
    // The recipes hardcode `background: var(--color-bg)` at (0,2,0); the theme
    // needs the :root prefix to win regardless of stylesheet load order.
    for (const selector of [
      ':root [data-ui="card"]',
      ':root [data-ui="dialog"] [data-part="panel"]',
      ':root [data-ui="sheet"] [data-part="panel"]',
      ':root [data-ui="popover"] [data-part="content"]',
      ':root [data-ui="toast"] [data-part="toast"]',
    ]) {
      expect(frost).toContain(selector);
    }
    expect(frost).toContain("background: var(--glass-panel)");
  });
});

// ═══════════ 2. The fallback is a complete, AA-clean opaque theme ═══════════
describe("glass · solid fallbacks clear WCAG AA on their own", () => {
  const lookupsWithout = (() => {
    const t = parseThemeValues(FALLBACK_CSS);
    return {
      light: flattenLayers([t.light, base.light]),
      dark: flattenLayers([t.dark, t.light, base.light]),
    } as const;
  })();

  it("emits zero contrast findings for the stripped stylesheet", () => {
    const results = checkThemeContrast({
      themeName: "glass(fallback)",
      themeCss: FALLBACK_CSS,
      baseCss: BASE_CSS,
    });
    expect(results.map((r) => r.message)).toEqual([]);
  });

  it("actually computes every declared pair — no silent translucent skips", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (const { fg, bg } of CONTRAST_PAIRS) {
        const lookup = lookupsWithout[scheme];
        for (const token of [fg, bg]) {
          const resolved = resolveColorString(lookup.get(token)!, lookup);
          expect(`${scheme} --${token} opaque: ${resolved && isOpaqueColor(resolved)}`).toBe(
            `${scheme} --${token} opaque: true`,
          );
        }
      }
    }
  });
});

// ═══════════ 3. Frosted surfaces pass AA on the RESOLVED backgrounds ════════
describe("glass · frosted surfaces clear WCAG AA composited over every opaque surface", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const token of FROSTED_TOKENS) {
      const raw = LOOKUPS[scheme].get(token)!;
      const mix = MIX_RE.exec(raw);

      it(`${scheme} --${token} is a genuinely translucent color-mix over a resolvable color`, () => {
        expect(mix).not.toBeNull();
        const alpha = parseFloat(mix![2]) / 100;
        expect(alpha).toBeGreaterThan(0);
        expect(alpha).toBeLessThan(1);
        const inner = resolveColorString(mix![1], LOOKUPS[scheme]);
        expect(inner).not.toBeNull();
        expect(isOpaqueColor(inner!)).toBe(true);
      });

      for (const backdropToken of BACKDROP_TOKENS) {
        for (const textToken of TEXT_TOKENS) {
          it(`${scheme}: --${textToken} on --${token} over --${backdropToken} ≥ ${CONTRAST_AA}:1`, () => {
            const alpha = parseFloat(mix![2]) / 100;
            const src = parseCssColor(resolveColorString(mix![1], LOOKUPS[scheme])!)!;
            const composited = compositeOver(src, alpha, resolveOpaque(backdropToken, scheme));
            const text = resolveOpaque(textToken, scheme);
            const ratio = contrastRatio(text, composited);
            expect(`${ratio.toFixed(2)} >= ${CONTRAST_AA}`).toBe(
              ratio >= CONTRAST_AA ? `${ratio.toFixed(2)} >= ${CONTRAST_AA}` : `FAILED at ${ratio.toFixed(2)}`,
            );
          });
        }
      }
    }
  }
});

// ═══════════ 4. Manifest: agent-facing character ═══════════════════════════
describe("glass · manifest and preview", () => {
  it("declares both schemes and a translucent/glass mood vocabulary", () => {
    expect(MANIFEST.scheme).toBe("both");
    expect(MANIFEST.dark_mode).toBe("native");
    expect(MANIFEST.mood).toContain("glass");
    expect(MANIFEST.mood).toContain("translucent");
  });

  it("ships a preview wired to glass.css with a decorative backdrop to frost", () => {
    expect(MANIFEST.preview).toBe("glass.preview.html");
    const preview = readFileSync(join(DIR, "glass.preview.html"), "utf8");
    expect(preview).toContain('href="glass.css"');
    expect(preview).toContain("radial-gradient"); // something behind the panels to blur
  });
});
