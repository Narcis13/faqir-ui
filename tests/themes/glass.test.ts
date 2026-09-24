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
import { axesFromCss } from "../../src/theme/axes";
import type { ThemeManifest } from "../../src/theme-manifest";
import { Glob } from "bun";

const DIR = join(import.meta.dir, "../../registry/themes");
const TOKENS = join(import.meta.dir, "../../registry/tokens");
const CSS = readFileSync(join(DIR, "glass.css"), "utf8");
const MANIFEST = JSON.parse(
  readFileSync(join(DIR, "glass.theme.json"), "utf8"),
) as ThemeManifest;
const BASE_CSS = ["palette", "semantic", "aliases"]
  .map((f) => readFileSync(join(TOKENS, `${f}.css`), "utf8"))
  .join("\n");
/** The axis resolver reads the WHOLE token layer — see tests/themes/axes.test.ts. */
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS)]
  .sort()
  .map((f) => readFileSync(join(TOKENS, f), "utf8"));

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
const FROSTED_TOKENS = ["card-bg", "panel-bg"] as const;
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

  it("keeps every color-mix() and translucent value inside the @supports block", () => {
    expect(FALLBACK_CSS).not.toContain("color-mix(");
    expect(FALLBACK_CSS).not.toContain("surface-backdrop");
    const frost = SUPPORTS_BLOCKS.join("\n");
    expect(frost).toContain("color-mix(");
    expect(frost).toContain("--surface-backdrop: blur(var(--glass-blur))");
  });

  it("defines the frosted surface tokens ONLY inside @supports — the fallback never sees them", () => {
    for (const token of FROSTED_TOKENS) {
      expect(FALLBACK_CSS).not.toContain(`--${token}:`);
      expect(SUPPORTS_BLOCKS.join("\n")).toContain(`--${token}:`);
    }
  });

  // ═══════════ 1b. The frost is tokens now, not selectors [1.1A-14] ═════════
  //
  // Until 1.1A-14 this theme reached into five components by selector to say one
  // thing about surfaces: `backdrop-filter` on card and the four floating
  // panels, plus a `background` for the panels, boosted with a `:root` prefix to
  // out-specify the recipes. All of it is three token declarations now — the
  // components carry the feature query and read `--surface-backdrop` (1.1A-04),
  // and the panel fill is `--panel-bg`. A theme that selects a component is a
  // theme that only themes the components it happened to name.
  it("selects no component: the whole theme is token declarations", () => {
    expect(CSS).not.toContain("[data-ui=");
    expect(CSS).not.toContain("[data-part=");
    // Every block in the file states tokens at :root (in or out of @supports);
    // the aliases the token layer restates per island also on [data-theme].
    const selectors = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim().replace(/\s+/g, " "))
      .filter((s) => !s.startsWith("@"));
    expect(selectors).toEqual([
      ":root",
      ":root, [data-theme]",
      '[data-theme="dark"]',
      '[data-theme="auto"]',
      ":root",
      ":root, [data-theme]",
    ]);
  });

  it("names the frost once, and lets the components decide where it lands", () => {
    // The nine surfaces that read `--surface-backdrop` — asserted against the
    // registry rather than against a list here, so a component that gains or
    // loses the hook shows up as a change in this count.
    const surfaces = ["primitives/card/card", "primitives/surface/surface"].concat(
      ["dialog", "sheet", "drawer", "popover", "dropdown", "toast", "tooltip"].map((r) => `recipes/${r}/${r}`),
    );
    for (const path of surfaces) {
      const css = readFileSync(join(import.meta.dir, "../../registry", `${path}.css`), "utf8");
      expect(`${path}: ${css.includes("backdrop-filter: var(--surface-backdrop)")}`).toBe(`${path}: true`);
    }
  });

  it("fills every floating panel through --panel-bg, including the popover's arrow", () => {
    // The half a backdrop filter cannot do: a blur behind an OPAQUE fill renders
    // nothing, so the fill has to be a token too.
    const panels: Array<[string, number]> = [
      ["recipes/dialog/dialog", 1],
      ["recipes/sheet/sheet", 1],
      ["recipes/drawer/drawer", 1],
      ["recipes/popover/popover", 2], // the content, and the arrow that must match it
      ["recipes/dropdown/dropdown", 1],
      ["recipes/toast/toast", 1],
    ];
    for (const [path, count] of panels) {
      const css = readFileSync(join(import.meta.dir, "../../registry", `${path}.css`), "utf8");
      expect(`${path}: ${css.split("background: var(--panel-bg);").length - 1}`).toBe(`${path}: ${count}`);
    }
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

// ═══════════ 4. The axes it claims, derived [1.1A-14] ══════════════════════
describe("glass · the identity it states in tokens", () => {
  const axes = axesFromCss(CSS, AXIS_BASE);

  it("derives the adoption table's row: glass depth, round shape, filled controls", () => {
    expect({
      depth: axes.depth,
      radius: axes.shape.radius,
      input: axes.controls.input,
      neutral: axes.neutral,
    }).toEqual({ depth: "glass", radius: "round", input: "filled", neutral: "cool" });
  });

  it("the manifest carries the same block, because the generator derives it too", () => {
    expect(MANIFEST.axes).toEqual(axes);
  });

  it("`depth: glass` is the backdrop speaking, not the shadows", () => {
    // The classifier checks `flat` first, so a theme that removed its shadows
    // would read flat however it frosts. Glass keeps a full, large ramp — the
    // surfaces float AND they are translucent — which is why the axis lands on
    // the backdrop. Remove the frost and the same stylesheet reads `layered`,
    // which is what it derived before this task.
    expect(axesFromCss(FALLBACK_CSS, AXIS_BASE).depth).toBe("layered");
  });
});

// ═══════════ 5. Manifest: agent-facing character ═══════════════════════════
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
