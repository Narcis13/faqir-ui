/**
 * Depth and material families — `registry/tokens/{effects,textures}.css`  [1.1A-04]
 *
 * The two axes 1.0 left a theme no handle on.
 *
 * **Depth** was five hardcoded `oklch(0 0 0 / a)` values. A theme could turn a
 * shadow off by overriding all five, or tint it warm by rewriting ten layers by
 * hand, and no amount of either reached the eight components that drew their own
 * ring with `box-shadow` instead of reading the ramp. `--shadow-color` makes the
 * colour one declaration and the ramp its only consumer.
 *
 * **Material** did not exist. A theme that wanted paper grain or a dot grid had
 * to ship a stylesheet reaching into `body` by selector — which is exactly how
 * `glass` frosts seven components today, and exactly what `--surface-backdrop`
 * and the two `--texture-*` roles are here to replace (1.1A-14 collects that
 * debt).
 *
 * Five things are pinned here:
 *
 * 1. **The families exist with the documented defaults**, and the defaults are
 *    all no-ops: `0 0 0` is the black the ramp already cast in, `none` is the
 *    initial value of both `backdrop-filter` and `background-image`. 1.1A-08
 *    derives the `depth` and `material` axes from exactly these names.
 *
 * 2. **Every step of the ramp reads `--shadow-color`.** A step that spells its
 *    own colour is a step the depth axis cannot tint.
 *
 * 3. **No literal `box-shadow` colour is left in the registry.** This is the
 *    depth twin of the edge gate in `shape-focus.test.ts`, and it caught nine
 *    sites, not the eight the plan's census predicted — `patterns/document`
 *    carried two `rgba()` layers in a `var(--shadow-lg, …)` fallback.
 *
 * 4. **`--surface-backdrop` is consumed only behind an `@supports` guard**, so a
 *    browser that cannot frost never sees a rule mentioning it — the
 *    fallback-first discipline `themes/glass.css` documents.
 *
 * 5. **Every named texture is a real SVG.** Parsed, not pattern-matched: a
 *    typo'd data URI is a silently-blank background otherwise.
 *
 * On the surface split: `textures.css` is a palette no component reads, so it is
 * NOT themeable surface (`NON_SURFACE_TOKEN_FILES`); the two role tokens in
 * `aliases.css` that components DO read are. The count assertion below is what
 * keeps that decision honest when the manifests regenerate.
 */
import { describe, it, expect } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { NON_SURFACE_TOKEN_FILES, isSurfaceTokenFile } from "../../src/theme-manifest";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

/** Comments blanked, newlines kept — a reported line number is the real one. */
const stripComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

const EFFECTS = stripComments(read("tokens/effects.css"));
const TEXTURES = stripComments(read("tokens/textures.css"));
const ALIASES = stripComments(read("tokens/aliases.css"));

function layerStylesheets(layer: string): { rel: string; css: string }[] {
  const dir = join(REGISTRY, layer);
  return [...new Glob("**/*.css").scanSync(dir)]
    .sort()
    .map((f) => ({ rel: `${layer}/${f}`, css: readFileSync(join(dir, f), "utf8") }));
}
/** Everything a project installs and can render. `themes/` re-points; it does not consume. */
const REGISTRY_SHEETS = [
  ...layerStylesheets("primitives"),
  ...layerStylesheets("base"),
  ...layerStylesheets("recipes"),
  ...layerStylesheets("patterns"),
];

const declaration = (css: string, token: string) =>
  new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(css)?.[1].trim();

// ── 1. the families, with the values 1.1 documents ─────────────────────────

describe("depth & material · the token contract", () => {
  it("--shadow-color defaults to the bare channels of black", () => {
    // Bare channels, NOT `oklch(0 0 0)`: each step wraps them so it can set its
    // own alpha. A theme that ships `oklch(...)` here breaks all five steps.
    expect(declaration(EFFECTS, "--shadow-color")).toBe("0 0 0");
  });

  it("--surface-backdrop defaults to none", () => {
    expect(declaration(EFFECTS, "--surface-backdrop")).toBe("none");
  });

  for (const role of ["--texture-page", "--texture-surface"]) {
    it(`${role} defaults to none, in aliases.css where the surface can reach it`, () => {
      expect(declaration(ALIASES, role)).toBe("none");
    });
  }

  it("the six named textures live in textures.css, not in aliases", () => {
    const named = [...TEXTURES.matchAll(/(--texture-[a-z]+)\s*:/g)].map((m) => m[1]).sort();
    expect(named).toEqual([
      "--texture-dots",
      "--texture-grain",
      "--texture-grid",
      "--texture-mesh",
      "--texture-paper",
      "--texture-stripes",
    ]);
    // The palette and the roles are different files on purpose (see the surface
    // split below); a named texture in aliases.css would blur that line.
    expect(ALIASES).not.toMatch(/--texture-(grain|paper|dots|grid|stripes|mesh)\s*:/);
  });
});

// ── 2. every step of the ramp reads the colour ─────────────────────────────

describe("depth & material · the shadow ramp is tintable", () => {
  const steps = [...EFFECTS.matchAll(/(--shadow-(?:xs|sm|md|lg|xl))\s*:\s*([^;]+);/g)];

  it("finds all five steps (the gate is not vacuously green)", () => {
    expect(steps.map((m) => m[1])).toEqual([
      "--shadow-xs",
      "--shadow-sm",
      "--shadow-md",
      "--shadow-lg",
      "--shadow-xl",
    ]);
  });

  for (const [, token, value] of steps) {
    it(`${token} casts in var(--shadow-color) and names no colour of its own`, () => {
      expect(value).toContain("oklch(var(--shadow-color)");
      // Every colour in the step arrives through the token. A literal hex, a
      // second colour function, or a bare `oklch(0 0 0` is an untintable layer.
      expect(value).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      expect(value).not.toMatch(/oklch\(\s*[0-9.]/);
      // Each layer of a multi-layer step must be tintable, not just the first.
      const layers = value.split(/,(?![^(]*\))/);
      for (const layer of layers) expect(layer).toContain("var(--shadow-color)");
    });
  }
});

// ── 3. no literal box-shadow colour anywhere in the registry ───────────────

describe("depth & material · no component hardcodes a shadow colour", () => {
  /**
   * `box-shadow` VALUES only. A `transition: … box-shadow …` names the property
   * and carries no colour, and `box-shadow: none` is the documented way to
   * remove one — both are allowed through by construction.
   */
  function shadowValues(css: string): { line: number; value: string }[] {
    const out: { line: number; value: string }[] = [];
    const src = stripComments(css);
    for (const m of src.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
      const value = m[1].trim();
      if (value === "none") continue;
      out.push({ line: src.slice(0, m.index).split("\n").length, value });
    }
    return out;
  }

  const offenders: string[] = [];
  let inspected = 0;
  for (const { rel, css } of REGISTRY_SHEETS) {
    for (const { line, value } of shadowValues(css)) {
      inspected++;
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|\b(?:black|white|gray|grey)\b/i.test(value)) {
        offenders.push(`${rel}:${line} — ${value}`);
      }
    }
  }

  it("inspects real declarations (the sweep is not vacuous)", () => {
    expect(inspected).toBeGreaterThan(10);
  });

  it("every box-shadow colour in the registry is a token", () => {
    expect(offenders).toEqual([]);
  });

  it("every shadow that is not a ring reads the ramp", () => {
    // A ring is `0 0 0 <width> <colour>` — an edge drawn as a shadow, whose
    // colour is the state's, not the depth axis's. Anything with real offset or
    // blur is depth and must come from --shadow-*, or a theme cannot lift it.
    const notFromRamp: string[] = [];
    for (const { rel, css } of REGISTRY_SHEETS) {
      for (const { line, value } of shadowValues(css)) {
        const isRing = /^(inset\s+)?0\s+0\s+0\s/.test(value);
        if (isRing || value.includes("var(--shadow")) continue;
        if (value.includes("var(--focus-shadow)")) continue;
        notFromRamp.push(`${rel}:${line} — ${value}`);
      }
    }
    expect(notFromRamp).toEqual([]);
  });
});

// ── 4. the frosting hook is guarded ────────────────────────────────────────

describe("depth & material · --surface-backdrop is fallback-first", () => {
  /** The `@supports` blocks of a stylesheet, as {condition, body} pairs. */
  function supportsBlocks(css: string): { condition: string; body: string }[] {
    const src = stripComments(css);
    const out: { condition: string; body: string }[] = [];
    for (const m of src.matchAll(/@supports([^{]+)\{/g)) {
      let depth = 1;
      let i = m.index! + m[0].length;
      const start = i;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        i++;
      }
      out.push({ condition: m[1].trim(), body: src.slice(start, i - 1) });
    }
    return out;
  }

  const consumers = REGISTRY_SHEETS.filter((s) => s.css.includes("var(--surface-backdrop)"));

  it("is consumed by the card, the overlay surface and the seven floating recipes", () => {
    expect(consumers.map((c) => c.rel).sort()).toEqual([
      "primitives/card/card.css",
      "primitives/surface/surface.css",
      "recipes/dialog/dialog.css",
      "recipes/drawer/drawer.css",
      "recipes/dropdown/dropdown.css",
      "recipes/popover/popover.css",
      "recipes/sheet/sheet.css",
      "recipes/toast/toast.css",
      "recipes/tooltip/tooltip.css",
    ]);
  });

  for (const { rel, css } of REGISTRY_SHEETS.filter((s) =>
    s.css.includes("var(--surface-backdrop)"),
  )) {
    it(`${rel} names it only inside a backdrop-filter @supports guard`, () => {
      const guarded = supportsBlocks(css).filter((b) => /backdrop-filter/.test(b.condition));
      const inside = guarded.reduce(
        (n, b) => n + (b.body.match(/var\(--surface-backdrop\)/g) ?? []).length,
        0,
      );
      const total = (stripComments(css).match(/var\(--surface-backdrop\)/g) ?? []).length;
      expect(total).toBeGreaterThan(0);
      expect(inside).toBe(total);
    });

    it(`${rel} ships the -webkit- prefix alongside the standard property`, () => {
      // Safari shipped the prefixed property for years; glass.css tests both in
      // its condition, so both must be declared or half the guard is a lie.
      expect(css).toMatch(/-webkit-backdrop-filter:\s*var\(--surface-backdrop\)/);
      expect(css).toMatch(/[^-]backdrop-filter:\s*var\(--surface-backdrop\)/);
    });
  }
});

// ── 5. the textures are real SVGs ──────────────────────────────────────────

describe("depth & material · every named texture parses", () => {
  const textures = [...TEXTURES.matchAll(/(--texture-[a-z]+):\s*\n?\s*url\("([^"]+)"\)/g)].map(
    (m) => ({ name: m[1], uri: m[2] }),
  );

  it("finds all six (the sweep is not vacuous)", () => {
    expect(textures).toHaveLength(6);
  });

  for (const { name, uri } of textures) {
    it(`${name} is a data:image/svg+xml URI whose SVG parses and tints with currentColor`, () => {
      expect(uri.startsWith("data:image/svg+xml,")).toBe(true);

      const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
      expect(svg).toContain("currentColor");

      const w = new Window();
      const doc = new w.DOMParser().parseFromString(svg, "image/svg+xml");
      // A parse failure surfaces as a <parsererror> element, not as a throw.
      expect(doc.querySelector("parsererror")).toBeNull();
      const root = doc.documentElement;
      expect(root.tagName.toLowerCase()).toBe("svg");
      // Without explicit dimensions the tile is the browser's 300×150 default,
      // which is nobody's intended grain.
      expect(root.getAttribute("width")).toBeTruthy();
      expect(root.getAttribute("height")).toBeTruthy();
      w.close();
    });
  }

  it("no texture is quoted with a bare # — an unencoded fragment truncates the URI", () => {
    for (const { name, uri } of textures) {
      expect(`${name}:${uri}`).not.toContain("#");
    }
  });
});

// ── 6. the surface split, and what the manifests inherit ───────────────────

describe("depth & material · the themeable surface grew by exactly the roles", () => {
  it("textures.css is excluded from the themeable surface", () => {
    expect(NON_SURFACE_TOKEN_FILES).toContain("textures.css");
    expect(isSurfaceTokenFile("textures.css")).toBe(false);
  });

  it("effects.css and aliases.css stay in it — that is where the axis is reachable", () => {
    expect(isSurfaceTokenFile("effects.css")).toBe(true);
    expect(isSurfaceTokenFile("aliases.css")).toBe(true);
  });

  it("a theme inherits the four new reachable tokens and none of the six URIs", () => {
    // What 1.1A-04 adds to the surface: --shadow-color and --surface-backdrop
    // from effects.css, the two --texture-* roles from aliases.css. The six
    // named textures are a palette a theme re-points a ROLE at, so they would
    // be six data URIs of noise in every manifest.
    const surface = new Set<string>();
    for (const file of ["effects.css", "aliases.css", "textures.css"]) {
      if (!isSurfaceTokenFile(file)) continue;
      for (const m of stripComments(read(`tokens/${file}`)).matchAll(/(--[a-z0-9-]+)\s*:/g)) {
        surface.add(m[1]);
      }
    }
    for (const token of [
      "--shadow-color",
      "--surface-backdrop",
      "--texture-page",
      "--texture-surface",
    ]) {
      expect(surface.has(token)).toBe(true);
    }
    for (const texture of ["--texture-grain", "--texture-paper", "--texture-mesh"]) {
      expect(surface.has(texture)).toBe(false);
    }
  });
});

// ── 7. no visual change at defaults ────────────────────────────────────────

/**
 * happy-dom's shorthand parser drops any declaration resolving to an `oklch()`
 * colour (the finding 1.1A-02 recorded), so the ramp is read as the raw custom
 * property rather than through a rendered `box-shadow`. That is the right read
 * anyway: what this asserts is that the `var()` chain substitutes to the same
 * text the literal ramp used to be.
 */
const TOKEN_FILES = [
  "tokens/palette.css",
  "tokens/spacing.css",
  "tokens/typography.css",
  "tokens/effects.css",
  "tokens/textures.css",
  "tokens/motion.css",
  "tokens/semantic.css",
  "tokens/aliases.css",
];

describe("depth & material · the defaults render as they did before", () => {
  const w = new Window();
  const d = w.document;
  d.head.innerHTML = `<style>${TOKEN_FILES.map(read).join("\n")}</style>`;
  const root = w.getComputedStyle(d.documentElement);
  const value = (token: string) => root.getPropertyValue(token).trim();

  const BEFORE: Record<string, string> = {
    "--shadow-xs": "0 1px 2px oklch(0 0 0 / 0.04)",
    "--shadow-sm": "0 1px 3px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.04)",
    "--shadow-md": "0 4px 6px oklch(0 0 0 / 0.05), 0 2px 4px oklch(0 0 0 / 0.04)",
    "--shadow-lg": "0 10px 15px oklch(0 0 0 / 0.06), 0 4px 6px oklch(0 0 0 / 0.04)",
    "--shadow-xl": "0 20px 25px oklch(0 0 0 / 0.08), 0 8px 10px oklch(0 0 0 / 0.04)",
  };

  for (const [token, before] of Object.entries(BEFORE)) {
    it(`${token} substitutes to its pre-1.1A-04 value`, () => {
      const resolved = value(token).replace(/var\(--shadow-color\)/g, "0 0 0");
      expect(resolved.replace(/\s+/g, " ")).toBe(before);
    });
  }

  it("the material and frosting roles resolve to no-ops", () => {
    // `none` is the initial value of both properties they feed, so every rule
    // added by this task renders exactly nothing until a theme speaks.
    expect(value("--surface-backdrop")).toBe("none");
    expect(value("--texture-page")).toBe("none");
    expect(value("--texture-surface")).toBe("none");
  });

  it("a named texture is a url(), ready for a role to point at it", () => {
    expect(value("--texture-grain").startsWith('url("data:image/svg+xml,')).toBe(true);
  });
});

// ── 7b. the wiring is live, not just present ───────────────────────────────

/**
 * The gates above prove the registry NAMES the new tokens. This one proves a
 * theme that sets them actually reaches the surfaces — the difference between a
 * real axis and four tokens nobody reads (the drift 1.1A-21 exists to collect).
 *
 * happy-dom resolves `backdrop-filter` through the `@supports` guard, so the
 * frosting is asserted on the real property. It does NOT substitute a `url()`
 * var() chain into `background-image` (it returns empty), so the material and
 * depth axes are asserted one step earlier, on the custom property itself —
 * which is the substitution that matters. Both are additionally measured
 * end-to-end in Chromium; see the task's acceptance notes.
 */
describe("depth & material · a theme that sets them reaches the surfaces", () => {
  const THEME = `:root {
    --texture-page: var(--texture-grain);
    --texture-surface: var(--texture-dots);
    --surface-backdrop: blur(16px) saturate(140%);
    --shadow-color: 0.4 0.12 30;
  }`;

  const w = new Window();
  const d = w.document;
  d.head.innerHTML = `<style>
    ${TOKEN_FILES.map(read).join("\n")}
    ${[
      "primitives/card/card.css",
      "primitives/surface/surface.css",
      "recipes/dialog/dialog.css",
    ]
      .map(read)
      .join("\n")}
    ${THEME}
  </style>`;
  d.body.innerHTML = `
    <div id="card" data-ui="card"></div>
    <div id="overlay" data-ui="surface" data-variant="overlay"></div>
    <div data-ui="dialog"><div id="panel" data-part="panel"></div></div>`;
  const prop = (id: string, name: string) =>
    w.getComputedStyle(d.getElementById(id)!).getPropertyValue(name).trim();

  for (const id of ["card", "overlay", "panel"]) {
    it(`${id} frosts when a theme sets --surface-backdrop`, () => {
      expect(prop(id, "backdrop-filter")).toBe("blur(16px) saturate(140%)");
    });
  }

  it("one --shadow-color declaration re-tints every step of the ramp", () => {
    const root = w.getComputedStyle(d.documentElement);
    for (const step of ["--shadow-xs", "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl"]) {
      const value = root.getPropertyValue(step);
      expect(value).toContain("0.4 0.12 30");
      expect(value).not.toContain("0 0 0");
    }
  });

  it("the two material roles resolve to the named textures they point at", () => {
    const root = w.getComputedStyle(d.documentElement);
    const grain = root.getPropertyValue("--texture-grain").trim();
    const dots = root.getPropertyValue("--texture-dots").trim();
    expect(grain).not.toBe("");
    expect(root.getPropertyValue("--texture-page").trim()).toBe(grain);
    expect(root.getPropertyValue("--texture-surface").trim()).toBe(dots);
  });
});

// ── 8. the print path keeps its paper blank ────────────────────────────────

describe("depth & material · documents stay untextured", () => {
  it("the document theme does not set a page texture", () => {
    // A grain on a printed invoice is toner nobody asked for. The document and
    // document-serif themes must leave --texture-page alone; if one ever wants
    // a watermark it should be a deliberate, separately-reviewed change.
    for (const theme of ["document.css", "document-serif.css"]) {
      const css = stripComments(readFileSync(join(REGISTRY, "themes", theme), "utf8"));
      expect(css).not.toMatch(/--texture-page\s*:/);
    }
  });

  it("printing drops the page texture even if a theme sets one", () => {
    // The @media print rule re-declares `background` as a SHORTHAND, which
    // resets background-image — so a grain a theme puts on screen never reaches
    // paper. That is the behaviour we want (toner nobody asked for), and it is
    // load-bearing enough to pin: a future change to `background-color` there
    // would silently start printing the texture.
    const css = stripComments(read("patterns/document/document.css"));
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/\[data-ui="document"\]\s*\{[^}]*background:\s*var\(--doc-bg/);
  });

  it("the document pattern reads the page role, so a theme CAN reach it", () => {
    expect(stripComments(read("patterns/document/document.css"))).toMatch(
      /background-image:\s*var\(--texture-page\)/,
    );
  });
});

// ── 9. shadows are not a contrast pair ─────────────────────────────────────

describe("depth & material · the colour gates ignore depth", () => {
  it("no --shadow-* token is treated as a foreground/background pair", () => {
    // `oklch(var(--shadow-color) / a)` is not a colour a contrast test can read
    // as a pair, and it never was one: the ramp is decoration behind an edge.
    // Asserted against the shipped pair list so a future refactor that starts
    // feeding it token names cannot silently pull a shadow in.
    const contrast = readFileSync(join(ROOT, "tests/themes/contrast.test.ts"), "utf8");
    const pairs = [...contrast.matchAll(/"(--color-[a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(pairs.some((p) => p.includes("shadow"))).toBe(false);
  });
});
