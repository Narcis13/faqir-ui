/**
 * `data-accent` — the runtime accent, the fifth sanctioned token modifier
 * (forecraft #9, SPEC-1.0 §4, `registry/tokens/accent.css`).
 *
 * Pinned here:
 *
 * 1. **One vocabulary.** The spec's row, `TOKEN_MODIFIERS`, `ACCENT_HUES` and the
 *    stylesheet's hue rules name the same values, and `custom` keeps it closed.
 * 2. **The stylesheet's shape.** The five tokens `faqir-tweak` dials are the five
 *    re-pointed, each from its own capture, inside the `@supports` fallback guard,
 *    and the file is wired into every token list the framework ships.
 * 3. **The cascade.** Read back from a real cascade (happy-dom, its own window):
 *    `<html data-accent>` re-points the page without a self-reference, a nested
 *    region re-points only itself, `custom` reads `--accent-hue`, and a missing
 *    hue falls back to the theme's.
 * 4. **The measurement.** Every named hue, in every shipped theme, light and dark,
 *    clears every pair `contrast-tokens` checks — under the gate's per-channel
 *    clip AND under CSS Color 4's constant-lightness chroma reduction, so the
 *    vocabulary does not depend on how a browser maps an out-of-gamut colour.
 * 5. **The audit** accepts `data-accent` anywhere, as it accepts `data-density`.
 *
 * ── The measurement that chose the vocabulary ──
 * Seventeen candidates, each at the Tailwind v4 palette's 500-step hue rounded
 * to the degree, re-hued into all 31 themes × light/dark. Findings (theme ×
 * scheme × pair below its minimum), then the worst `--color-primary` on
 * `--color-bg-muted` (AA 4.5), each under clip / chroma-reduction:
 *
 *   red 25        1 / 0   4.48 / 4.65
 *   orange 48     0 / 3   4.51 / 4.43
 *   amber 70      3 / 3   4.34 / 4.29
 *   yellow 86     5 / 5   4.21 / 4.22
 *   lime 131     19 / 10  3.86 / 4.00
 *   green 150    31 / 17  3.56 / 3.92
 *   emerald 162  39 / 14  3.37 / 3.95
 *   teal 183     48 / 12  3.21 / 3.98
 *   cyan 215     41 / 10  3.36 / 4.04
 *   sky 237      24 / 7   3.72 / 4.11
 *   blue 260      3 / 3   4.34 / 4.34
 *   indigo 277    1 / 1   4.49 / 4.49
 *   violet 293    0 / 0   4.59 / 4.59  ← kept
 *   purple 304    0 / 0   4.64 / 4.64  ← kept
 *   fuchsia 322   0 / 0   4.68 / 4.68  ← kept
 *   pink 354      0 / 0   4.61 / 4.69  ← kept
 *   rose 16       1 / 0   4.47 / 4.67
 *   (teal also drops the focus ring to 2.95:1 on default's muted plate)
 *
 * The binding pair is the accent as text on the muted plate, in the light
 * scheme of the themes whose own hue is violet-to-pink and which clear AA there
 * by a hair (neumorph 4.63, memphis, aurora, paper): at equal OKLCH lightness
 * almost every other hue has the higher WCAG luminance. The numbers are a
 * comment, not assertions — a theme retune may move them, and only the kept
 * hues are a promise.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import {
  ACCENT_TOKENS,
  CONTRAST_AA,
  CONTRAST_NON_TEXT,
  CONTRAST_PAIRS,
  NON_TEXT_PAIRS,
  accentLookups,
  buildSchemeLookups,
  checkAccentContrast,
  checkThemeContrast,
  rehueColor,
} from "../../src/audit/contrast-tokens";
import { contrastRatio, parseCssColor, parseOklch, resolveColorString } from "../../src/utils/oklch";
import { ACCENT_CUSTOM, ACCENT_HUES, ACCENT_HUE_TOKEN, ACCENT_VALUES } from "../../src/theme/accent";
import {
  SPEC_FILE,
  TOKEN_MODIFIERS,
  isTokenModifier,
  mayTakeTierSuffix,
  parseSpecModifiers,
} from "../../src/protocol";
import { TOKEN_MODIFIER_ATTRIBUTES } from "../../src/utils/breakpoints";
import { TOKEN_FILES_ORDERED } from "../../src/utils/bundler";
import { isSurfaceTokenFile, stripCssComments } from "../../src/theme-manifest";
import { auditHtmlSource } from "../../src/audit/html-audit";
import { loadRegistryManifestMap } from "../../src/utils/components";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ACCENT_CSS = read("registry/tokens/accent.css");
const ACCENT_SRC = stripCssComments(ACCENT_CSS);
const THEMES_DIR = join(ROOT, "registry/themes");
const THEME_FILES = readdirSync(THEMES_DIR).filter((f) => f.endsWith(".css")).sort();
/** The base layer the contrast gate's own tests use. */
const BASE_CSS = ["palette", "semantic", "aliases"].map((f) => read(`registry/tokens/${f}.css`)).join("\n");
const NAMED = Object.entries(ACCENT_HUES);

// ── 1. one vocabulary ───────────────────────────────────────────────────────

describe("data-accent · one closed vocabulary", () => {
  const modifier = TOKEN_MODIFIERS.find((m) => m.attr === "data-accent");

  it("is a sanctioned token modifier, written by the author, with a closed vocabulary", () => {
    expect(modifier).toBeDefined();
    expect(modifier!.owner).toBe("author");
    expect(modifier!.open).toBeFalsy();
    expect(isTokenModifier("data-accent")).toBe(true);
    expect(mayTakeTierSuffix("data-accent")).toBe(false);
    expect(TOKEN_MODIFIER_ATTRIBUTES.has("data-accent")).toBe(true);
  });

  it("states the named hues, then custom — in TOKEN_MODIFIERS, in the spec and in src/theme/accent.ts", () => {
    expect([...modifier!.values]).toEqual([...ACCENT_VALUES]);
    expect(ACCENT_VALUES.at(-1)).toBe(ACCENT_CUSTOM);
    const row = parseSpecModifiers(read(SPEC_FILE)).find((r) => r.attr === "data-accent");
    expect(row?.values).toEqual([...ACCENT_VALUES]);
  });

  it("every named hue has exactly one rule in accent.css, with the same number", () => {
    const rules = [...ACCENT_SRC.matchAll(/\[data-accent="([a-z-]+)"\]\s*\{\s*--accent-hue:\s*([\d.]+);\s*\}/g)];
    expect(Object.fromEntries(rules.map((m) => [m[1], Number(m[2])]))).toEqual({ ...ACCENT_HUES });
    // `custom` names no hue — it reads the author's.
    expect(ACCENT_SRC).not.toContain(`[data-accent="${ACCENT_CUSTOM}"]`);
    expect(ACCENT_HUE_TOKEN).toBe("--accent-hue");
  });

  it("names its hues in hue order, each a legal protocol value", () => {
    const hues = NAMED.map(([, h]) => h);
    expect(hues).toEqual([...hues].sort((a, b) => a - b));
    for (const [name] of NAMED) expect(name).toMatch(/^[a-z]+$/);
  });
});

// ── 2. the stylesheet ───────────────────────────────────────────────────────

/** The body of the one `@supports` block, or "" when there is none. */
function supportsBody(src: string): { condition: string; body: string } {
  const at = src.indexOf("@supports");
  if (at === -1) return { condition: "", body: "" };
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) {
      return { condition: src.slice(at + "@supports".length, open).trim(), body: src.slice(open + 1, i) };
    }
  }
  return { condition: "", body: "" };
}

describe("data-accent · registry/tokens/accent.css", () => {
  const { condition, body } = supportsBody(ACCENT_SRC);

  it("re-points exactly faqir-tweak's ACCENT tokens", () => {
    const tweak = read("registry/core/plugins/faqir-tweak.js");
    const list = /var ACCENT = (\[[^\]]*\]);/.exec(tweak);
    expect(list).not.toBeNull();
    expect(JSON.parse(list![1])).toEqual(ACCENT_TOKENS.map((t) => `--${t}`));
  });

  it("guards everything that re-points behind relative colour syntax over a light-dark() origin", () => {
    expect(condition).toBe("(color: oklch(from light-dark(red, red) l c h))");
    // Nothing outside the guard declares an accent token: without support, the
    // attribute is a no-op rather than a page with no primary colour.
    const outside = ACCENT_SRC.replace(body, "");
    for (const t of ACCENT_TOKENS) expect(outside).not.toContain(`--${t}:`);
    expect(outside).not.toContain("--accent-base-");
  });

  /** `selector → declarations` for every block inside the guard, whitespace collapsed. */
  const blocks = new Map(
    [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [
      m[1].trim().replace(/\s+/g, " "),
      m[2]
        .split(";")
        .map((d) => d.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ]),
  );
  const CAPTURE = ":root, [data-theme], [data-skin]";
  const REPOINT =
    "[data-accent]:not(:root, [data-theme], [data-skin]), " +
    ":is(:root, [data-theme], [data-skin])[data-accent] > :not([data-theme], [data-skin]), " +
    "[data-accent] :is([data-theme], [data-skin]) > :not([data-theme], [data-skin])";
  /** The capture each re-pointed token reads. */
  const base = (t: string) => (t === "color-ring" ? "--accent-base-ring" : `--accent-base-${t.slice("color-".length)}`);

  it("captures the theme's values where a theme declares them", () => {
    expect([...blocks.keys()]).toEqual([CAPTURE, REPOINT]);
    expect(blocks.get(CAPTURE)).toEqual([
      ...ACCENT_TOKENS.map((t) => `${base(t)}: var(--${t})`),
      "--accent-base-doc: var(--doc-accent)",
    ]);
  });

  it("re-points each token from its own capture — theme lightness and chroma, accent hue, theme hue as the fallback", () => {
    const decls = blocks.get(REPOINT)!;
    for (const t of ACCENT_TOKENS) {
      expect(decls).toContain(`--${t}: oklch(from var(${base(t)}) l c var(--accent-hue, h))`);
    }
    // Print follows the accent: --doc-accent is re-hued from its own capture.
    expect(decls).toContain("--doc-accent: oklch(from var(--accent-base-doc) l c var(--accent-hue, h))");
    // The ring alias resolved on :root; restated so focus follows the accent.
    expect(decls).toContain("--focus-ring-color: var(--color-ring)");
    // Nothing else: --color-primary-fg keeps the theme's ink.
    expect(decls.length).toBe(ACCENT_TOKENS.length + 2);
    expect(decls.join(";")).not.toContain("--color-primary-fg");
  });

  it("is wired into every token list the framework ships, before density.css", () => {
    const imports = [...read("registry/tokens/index.css").matchAll(/@import '\.\/([\w-]+\.css)';/g)].map((m) => m[1]);
    expect(imports).toContain("accent.css");
    expect(imports.indexOf("accent.css")).toBeLessThan(imports.indexOf("density.css"));
    expect(TOKEN_FILES_ORDERED).toContain("accent.css");
    expect(TOKEN_FILES_ORDERED.indexOf("accent.css")).toBeLessThan(TOKEN_FILES_ORDERED.indexOf("density.css"));
    for (const file of ["src/commands/init.ts", "scripts/build-core-package.mjs"]) {
      expect(read(file), `${file} does not ship accent.css`).toContain('"accent.css"');
    }
  });

  it("is not themeable surface — a theme never sets the captures", () => {
    expect(isSurfaceTokenFile("accent.css")).toBe(false);
  });
});

// ── 3. the cascade ──────────────────────────────────────────────────────────
//
// Which element captures and which re-points, read with `Element.matches` in a
// window of its own. The var() chain itself is ordinary CSS; what this stylesheet
// has to get right is that no element ever does both — a capture and a re-point
// on one element is `--color-primary` reading itself, which invalidates it — and
// that every element that should draw the accent is re-pointed or inherits from
// one that is.

const { body: GUARDED } = supportsBody(ACCENT_SRC);
const SELECTORS = [...GUARDED.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim().replace(/\s+/g, " "));
const [CAPTURES, REPOINTS] = SELECTORS;

/** For each `#id` (and `html`/`body`): does it capture, does it re-point? */
function roles(markup: string, rootAttrs: Record<string, string> = {}) {
  const win = new Window();
  try {
    const doc = win.document;
    for (const [k, v] of Object.entries(rootAttrs)) doc.documentElement.setAttribute(k, v);
    doc.body.innerHTML = markup;
    const out: Record<string, string> = {};
    const els = [doc.documentElement, doc.body, ...doc.querySelectorAll("[id]")];
    for (const el of els) {
      const key = el.id || el.tagName.toLowerCase();
      out[key] = (el.matches(CAPTURES) ? "capture" : "") + (el.matches(REPOINTS) ? "repoint" : "") || "-";
    }
    return out;
  } finally {
    win.close();
  }
}

describe("data-accent · who captures, who re-points", () => {
  it("<html data-accent> re-points the page from its children, so the root never reads itself", () => {
    expect(roles(`<p id="p"></p>`, { "data-accent": "pink" })).toEqual({ html: "capture", body: "repoint", p: "-" });
    expect(roles("", { "data-theme": "dark", "data-accent": "violet" })).toEqual({ html: "capture", body: "repoint" });
  });

  it("a region re-points itself and nothing around it", () => {
    expect(roles(`<section id="s" data-accent="fuchsia"><i id="in"></i></section><i id="out"></i>`)).toEqual({
      html: "capture",
      body: "-",
      s: "repoint",
      in: "-",
      out: "-",
    });
  });

  it("an island inside an accent region re-captures its own theme and re-points again below it", () => {
    expect(
      roles(`<section id="s" data-accent="pink"><div id="isle" data-theme="dark"><i id="in"></i></div></section>`),
    ).toEqual({ html: "capture", body: "-", s: "repoint", isle: "capture", in: "repoint" });
    expect(roles(`<div id="skin" data-skin="midnight" data-accent="violet"><i id="in"></i></div>`)).toEqual({
      html: "capture",
      body: "-",
      skin: "capture",
      in: "repoint",
    });
  });

  it("an island outside any accent region is left alone", () => {
    expect(roles(`<div id="isle" data-theme="dark"><i id="in"></i></div>`)).toEqual({
      html: "capture",
      body: "-",
      isle: "capture",
      in: "-",
    });
  });

  it("no element ever both captures and re-points", () => {
    const trees = [
      `<div id="a" data-accent="pink" data-theme="dark" data-skin="x"><i id="b" data-accent="custom"></i></div>`,
      `<div id="a" data-skin="x"><div id="b" data-theme="dark" data-accent="violet"><i id="c" data-theme="light"></i></div></div>`,
    ];
    for (const tree of trees) {
      const roots: Record<string, string>[] = [
        {},
        { "data-accent": "pink" },
        { "data-accent": "pink", "data-theme": "dark" },
      ];
      for (const attrs of roots) {
        for (const role of Object.values(roles(tree, attrs))) expect(role).not.toBe("capturerepoint");
      }
    }
  });

  it("custom reads --accent-hue, and a hue that resolves to nothing falls back to the theme's", () => {
    // The hue channel is `var(--accent-hue, h)`: `h` is the origin's own hue.
    expect(GUARDED).toContain("var(--accent-hue, h)");
    const win = new Window();
    try {
      const doc = win.document;
      const style = doc.createElement("style");
      style.textContent = ACCENT_SRC.slice(0, ACCENT_SRC.indexOf("@supports"));
      doc.head.appendChild(style);
      doc.body.innerHTML =
        `<div id="named" data-accent="pink"></div>` +
        `<div id="custom" data-accent="custom" style="--accent-hue: 200"></div>` +
        `<div id="bare" data-accent="custom"></div>`;
      const hue = (id: string) =>
        win.getComputedStyle(doc.getElementById(id) as never).getPropertyValue("--accent-hue").trim();
      expect(hue("named")).toBe("354");
      expect(hue("custom")).toBe("200");
      expect(hue("bare")).toBe("");
    } finally {
      win.close();
    }
  });
});

// ── 4. the measurement ──────────────────────────────────────────────────────

describe("data-accent · every named hue clears the contrast gate in every theme", () => {
  it("measures all 31 shipped themes", () => {
    expect(THEME_FILES.length).toBe(31);
  });

  for (const file of THEME_FILES) {
    const name = file.replace(/\.css$/, "");
    it(`${name}: every named hue, light and dark`, () => {
      const themeCss = readFileSync(join(THEMES_DIR, file), "utf8");
      // The theme itself is clean, so every finding below is the accent's.
      expect(checkThemeContrast({ themeName: name, themeCss, baseCss: BASE_CSS })).toEqual([]);
      const findings = checkAccentContrast({ themeName: name, themeCss, baseCss: BASE_CSS }, ACCENT_HUES);
      expect(findings.map((r) => r.message)).toEqual([]);
    });
  }

  /** Unclamped OKLCH → linear sRGB, to test gamut membership. */
  function linear(l: number, c: number, h: number): number[] {
    const r = (h * Math.PI) / 180;
    const a = c * Math.cos(r);
    const b = c * Math.sin(r);
    const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
      -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
      -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
    ];
  }
  const inGamut = (v: number[]) => v.every((x) => x >= -1e-6 && x <= 1 + 1e-6);
  /** CSS Color 4's direction: keep lightness and hue, reduce chroma until in sRGB. */
  function gamutMapped(value: string): string {
    const o = parseOklch(value);
    if (!o || inGamut(linear(o.l, o.c, o.h))) return value;
    let lo = 0;
    let hi = o.c;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(linear(o.l, mid, o.h))) lo = mid;
      else hi = mid;
    }
    return `oklch(${o.l} ${lo} ${o.h})`;
  }

  it("…and still clears it when the out-of-gamut colours are chroma-reduced instead of clipped", () => {
    const pairs = [
      ...CONTRAST_PAIRS.map((p) => ({ ...p, min: CONTRAST_AA })),
      ...NON_TEXT_PAIRS.map((p) => ({ ...p, min: CONTRAST_NON_TEXT })),
    ].filter((p) => (ACCENT_TOKENS as readonly string[]).some((t) => t === p.fg || t === p.bg));
    const failures: string[] = [];
    for (const file of THEME_FILES) {
      const built = buildSchemeLookups(readFileSync(join(THEMES_DIR, file), "utf8"), BASE_CSS);
      for (const [accent, hue] of NAMED) {
        const lookups = accentLookups(built, hue);
        for (const scheme of ["light", "dark"] as const) {
          const lk = new Map(lookups[scheme]);
          for (const t of ACCENT_TOKENS) {
            const v = lk.get(t);
            if (v && parseOklch(v)) lk.set(t, gamutMapped(v));
          }
          for (const p of pairs) {
            const fg = lk.get(p.fg) && resolveColorString(lk.get(p.fg)!, lk);
            const bg = lk.get(p.bg) && resolveColorString(lk.get(p.bg)!, lk);
            const f = fg ? parseCssColor(fg) : null;
            const b = bg ? parseCssColor(bg) : null;
            if (!f || !b) continue;
            const ratio = contrastRatio(f, b);
            if (ratio < p.min) failures.push(`${file} ${scheme} ${accent}: --${p.fg} on --${p.bg} ${ratio.toFixed(2)}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("data-accent · the static re-hue the gate measures", () => {
  it("keeps lightness, chroma and alpha and replaces only the hue", () => {
    expect(rehueColor("oklch(0.51 0.22 264)", 354)).toBe("oklch(0.51 0.22 354)");
    expect(rehueColor("oklch(0.6 0.1 30 / 0.5)", 293)).toBe("oklch(0.6 0.1 293 / 0.5)");
    expect(rehueColor("white", 322)).toBe("oklch(1 0 322)");
    expect(rehueColor("var(--x)", 322)).toBeNull();
    const hex = parseOklch(rehueColor("#3355cc", 10)!)!;
    expect(hex.h).toBe(10);
    expect(hex.c).toBeGreaterThan(0.1);
  });

  it("touches the five accent tokens and nothing else", () => {
    const built = buildSchemeLookups(read("registry/themes/default.css"), BASE_CSS);
    const moved = accentLookups(built, 322);
    for (const scheme of ["light", "dark"] as const) {
      for (const [token, value] of built[scheme]) {
        if ((ACCENT_TOKENS as readonly string[]).includes(token)) {
          expect(parseOklch(moved[scheme].get(token)!)?.h, `${scheme} ${token}`).toBe(322);
        } else {
          expect(moved[scheme].get(token), `${scheme} ${token}`).toBe(value);
        }
      }
    }
  });

  it("labels an accent finding with the accent it measured", () => {
    // A theme built to fail: a pale accent that only clears AA in its own hue.
    const themeCss = `:root { --color-primary: oklch(0.6 0.25 264); --color-bg-muted: white; }`;
    const findings = checkAccentContrast(
      { themeName: "t", themeCss, baseCss: BASE_CSS, pairs: [{ fg: "color-primary", bg: "color-bg-muted" }] },
      { green: 150 },
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].message).toContain('[t · light · data-accent="green"]');
  });
});

// ── 5. the audit ────────────────────────────────────────────────────────────

describe("data-accent · the audit accepts it anywhere", () => {
  it("on the page, a region, a component root and a part, every value in the vocabulary", async () => {
    const manifests = await loadRegistryManifestMap(join(ROOT, "registry"));
    for (const value of ACCENT_VALUES) {
      const source =
        `<section data-accent="${value}">\n` +
        `  <div data-ui="card" data-accent="${value}">\n` +
        `    <div data-part="body" data-accent="${value}">\n` +
        `      <button data-ui="button" data-variant="primary" data-accent="${value}">Save</button>\n` +
        `    </div>\n  </div>\n</section>`;
      const findings = auditHtmlSource({ source, file: "accent.html", manifests, strict: true }).map(
        (r) => `${r.line} [${r.severity}/${r.rule_id}] ${r.message}`,
      );
      expect(findings, value).toEqual([]);
    }
  });
});
