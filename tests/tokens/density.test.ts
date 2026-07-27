/**
 * Density mode — `registry/tokens/density.css` (task 0.7-11, FAQIR-NEXT §B6).
 *
 * Three things are being pinned here:
 *
 * 1. **Subtree scoping is honest.** `data-density="compact"` must change what
 *    descendants resolve for the spacing/height tokens, must NOT touch a sibling
 *    subtree, and an inner `comfortable` must reset back to the base scale.
 *    Custom properties do not show up on descendants in happy-dom's
 *    `getComputedStyle`, so the checks read the tokens the way a component does:
 *    through a real property (`padding` / `block-size`) that consumes them. That
 *    is the stronger assertion anyway — it is what the user sees.
 *
 * 2. **It is pure CSS.** No JavaScript anywhere in the shipped surface may read,
 *    write or know about `data-density`, and the five-attribute protocol picks up
 *    no sixth member (no audit rule mentions density).
 *
 * 3. **It cannot silently drift.** Every value in the density blocks is derived
 *    from — and re-derived against — `spacing.css` / `aliases.css` /
 *    `doc-aliases.css`, so adding a spacing step or a control alias without
 *    teaching density.css about it fails here.
 */
import { describe, it, expect } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { auditHtmlSource } from "../../src/audit/checker";
import { DOCUMENT_RULES } from "../../src/audit/rules";
import { parseDocument } from "../../src/parser/html-parser";
import { loadRegistryManifestMap } from "../../src/utils/components";
import {
  buildDensityPageHtml,
  discoverComponents,
  discoverThemes,
  DENSITY_REFERENCE_REL,
  DENSITY_THEMES,
  SCHEMES,
} from "../visual/matrix";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const TOKENS = join(REGISTRY, "tokens");

const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

const DENSITY_CSS = read("tokens/density.css");
const SPACING_CSS = read("tokens/spacing.css");
const ALIASES_CSS = read("tokens/aliases.css");
const DOC_ALIASES_CSS = read("tokens/doc-aliases.css");
const INDEX_CSS = read("tokens/index.css");

// ── tiny CSS helpers (comment-stripped, block-scoped) ────────────────────────

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule whose selector list matches `selector`. */
function block(css: string, selector: string): Record<string, string> {
  const src = stripComments(css);
  const start = src.indexOf(selector);
  if (start === -1) throw new Error(`No rule for selector: ${selector}`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("}", open);
  const decls: Record<string, string> = {};
  for (const line of src.slice(open + 1, close).split(";")) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/);
    if (m) decls[m[1]] = m[2].replace(/\s+/g, " ");
  }
  return decls;
}

const COMPACT = block(DENSITY_CSS, '[data-density="compact"]');
const COMFORTABLE = block(DENSITY_CSS, '[data-density="comfortable"]');
const BASE_SPACING = block(SPACING_CSS, ":root");
const BASE_ALIASES = block(ALIASES_CSS, ":root");
const BASE_DOC_ALIASES = block(DOC_ALIASES_CSS, ":root");

/** Spacing steps that scale — everything except the two invariants. */
const INVARIANT = ["--space-0", "--space-px"];
const SCALED_SPACE = Object.keys(BASE_SPACING).filter((t) => !INVARIANT.includes(t));
const CONTROL_HEIGHTS = ["--control-height-sm", "--control-height-md", "--control-height-lg"];

/**
 * Resolve the subset of CSS values these tokens produce — `<n>px`, `<n>rem` and
 * `calc(<value> * <k>)` — to pixels, so assertions can compare numbers rather
 * than the literal text happy-dom hands back (it substitutes `var()` but does
 * not evaluate `calc()`).
 */
function px(value: string): number {
  const v = value.trim();
  const calc = v.match(/^calc\(\s*([\s\S]+?)\s*\*\s*([\d.]+)\s*\)$/);
  if (calc) return px(calc[1]) * Number(calc[2]);
  if (v.endsWith("rem")) return Number.parseFloat(v) * 16;
  if (v.endsWith("px")) return Number.parseFloat(v);
  if (v === "0") return 0;
  throw new Error(`Cannot resolve to px: ${value}`);
}

// ── a probe document: components read tokens, so the probe does too ──────────

/**
 * `[data-probe]` consumes exactly the two token families density remaps, so a
 * computed `padding` / `block-size` is the resolved token as a component would
 * see it. The stylesheet under test is the real one, verbatim.
 */
const PROBE_CSS = `
  [data-probe] {
    padding: var(--space-4);
    block-size: var(--control-height-md);
    gap: var(--space-6);
  }
`;

function mount(bodyHtml: string) {
  const w = new Window();
  const d = w.document;
  d.head.innerHTML = `<style>${SPACING_CSS}\n${ALIASES_CSS}\n${DOC_ALIASES_CSS}\n${DENSITY_CSS}\n${PROBE_CSS}</style>`;
  d.body.innerHTML = bodyHtml;
  return {
    /** Resolved padding (a `--space-4` reading) in px for the element with `id`. */
    space: (id: string) => px(w.getComputedStyle(d.getElementById(id)!).getPropertyValue("padding")),
    /** Resolved block-size (a `--control-height-md` reading) in px. */
    control: (id: string) =>
      px(w.getComputedStyle(d.getElementById(id)!).getPropertyValue("block-size")),
    close: () => w.close(),
  };
}

const SCALE = Number(COMPACT["--density-scale"]);

describe("density · subtree scoping", () => {
  it("compact tightens descendants and leaves a sibling subtree alone", () => {
    const dom = mount(`
      <div data-density="compact"><span id="dense" data-probe></span></div>
      <div><span id="default" data-probe></span></div>
    `);

    expect(dom.space("default")).toBe(16); // --space-4 base
    expect(dom.space("dense")).toBe(16 * SCALE);
    expect(dom.space("dense")).toBeLessThan(dom.space("default"));

    expect(dom.control("default")).toBe(40); // --control-height-md base
    expect(dom.control("dense")).toBe(32);
    expect(dom.control("dense")).toBeLessThan(dom.control("default"));
    dom.close();
  });

  it("applies at any depth, not just to direct children", () => {
    const dom = mount(`
      <section data-density="compact">
        <div><div><span id="deep" data-probe></span></div></div>
      </section>
    `);
    expect(dom.space("deep")).toBe(16 * SCALE);
    expect(dom.control("deep")).toBe(32);
    dom.close();
  });

  it("the density element itself is scoped too (not only its descendants)", () => {
    const dom = mount(`<div id="self" data-density="compact" data-probe></div>`);
    expect(dom.space("self")).toBe(16 * SCALE);
    expect(dom.control("self")).toBe(32);
    dom.close();
  });

  it("nesting: an inner comfortable resets its subtree back to the base scale", () => {
    const dom = mount(`
      <div data-density="compact">
        <span id="dense" data-probe></span>
        <div data-density="comfortable">
          <span id="reset" data-probe></span>
        </div>
      </div>
    `);
    expect(dom.space("dense")).toBe(16 * SCALE);
    expect(dom.space("reset")).toBe(16);
    expect(dom.control("reset")).toBe(40);
    dom.close();
  });

  it("nesting: compact inside comfortable inside compact still tightens", () => {
    const dom = mount(`
      <div data-density="compact">
        <div data-density="comfortable">
          <div data-density="compact"><span id="deep" data-probe></span></div>
        </div>
      </div>
    `);
    expect(dom.space("deep")).toBe(16 * SCALE);
    expect(dom.control("deep")).toBe(32);
    dom.close();
  });

  it("an unknown data-density value is inert (no partial remap)", () => {
    const dom = mount(`<div data-density="cozy"><span id="x" data-probe></span></div>`);
    expect(dom.space("x")).toBe(16);
    expect(dom.control("x")).toBe(40);
    dom.close();
  });

  it("component aliases re-substitute in the scope (a card is not stuck at base padding)", () => {
    const w = new Window();
    const d = w.document;
    d.head.innerHTML = `<style>${SPACING_CSS}\n${ALIASES_CSS}\n${DENSITY_CSS}
      [data-ui="card"] { padding: var(--card-padding); }
      [data-ui="input"] { block-size: var(--input-height); }</style>`;
    d.body.innerHTML = `
      <div data-density="compact">
        <div id="dense-card" data-ui="card"></div><input id="dense-input" data-ui="input">
      </div>
      <div id="card" data-ui="card"></div><input id="input" data-ui="input">`;
    const val = (id: string, prop: string) =>
      px(w.getComputedStyle(d.getElementById(id)!).getPropertyValue(prop));

    expect(val("card", "padding")).toBe(24); // --space-6
    expect(val("dense-card", "padding")).toBe(24 * SCALE);
    expect(val("input", "block-size")).toBe(40);
    expect(val("dense-input", "block-size")).toBe(32);
    w.close();
  });
});

describe("density · the remap is complete and derived", () => {
  it("compact scales every spacing step by --density-scale", () => {
    expect(SCALE).toBeGreaterThan(0);
    expect(SCALE).toBeLessThan(1);
    for (const token of SCALED_SPACE) {
      expect(COMPACT[token]).toBeDefined();
      expect(COMPACT[token]).toContain("var(--density-scale)");
      expect(px(COMPACT[token].replace("var(--density-scale)", String(SCALE)))).toBeCloseTo(
        px(BASE_SPACING[token]) * SCALE,
        6,
      );
    }
  });

  it("comfortable restores every spacing step to its base value verbatim", () => {
    expect(Number(COMFORTABLE["--density-scale"])).toBe(1);
    for (const token of SCALED_SPACE) {
      expect(COMFORTABLE[token]).toBe(BASE_SPACING[token]);
    }
  });

  it("leaves --space-0 and --space-px alone (0 stays 0, a hairline stays a hairline)", () => {
    for (const token of INVARIANT) {
      expect(BASE_SPACING[token]).toBeDefined();
      expect(COMPACT[token]).toBeUndefined();
      expect(COMFORTABLE[token]).toBeUndefined();
    }
  });

  it("remaps the control ramp explicitly — shorter, but not by the spacing multiplier", () => {
    for (const token of CONTROL_HEIGHTS) {
      const base = px(BASE_ALIASES[token]);
      const compact = px(COMPACT[token]);
      const comfortable = px(COMFORTABLE[token]);

      expect(comfortable).toBe(base);
      expect(compact).toBeLessThan(base);
      // Deliberately gentler than × --density-scale: 40 × 0.75 = 30px is below a
      // usable hit target. Dense UIs tighten padding faster than controls.
      expect(compact).toBeGreaterThan(base * SCALE);
    }
  });

  it("re-declares every base alias that reads a density-scaled token", () => {
    // A `var()` inside a custom property is substituted where the property is
    // DECLARED. Any :root alias whose value reads a remapped token would freeze
    // at the base value unless the density blocks re-declare it, so this list is
    // derived from the base stylesheets rather than hand-maintained.
    const readsScaled = (value: string) =>
      /var\(--space-(?!0\b|px\b)/.test(value) || /var\(--control-height-/.test(value);

    const dependents = [
      ...Object.entries(BASE_ALIASES),
      ...Object.entries(BASE_DOC_ALIASES),
    ].filter(([, value]) => readsScaled(value));

    expect(dependents.length).toBeGreaterThan(0);
    for (const [token, value] of dependents) {
      expect(COMPACT[token]).toBe(value);
      expect(COMFORTABLE[token]).toBe(value);
    }
  });

  it("picks up the 0.8-07 rhythm aliases without anyone extending the list", () => {
    // The point of deriving `dependents` above rather than listing it: a new
    // alias composed over the spacing scale must be covered automatically. This
    // asserts the derivation DID catch the four aliases task 0.8-07 added — if
    // someone ever replaces the derivation with a literal list, the assertion
    // above still passes for the old tokens and this one fails for the new ones.
    const readsScaled = (value: string) =>
      /var\(--space-(?!0\b|px\b)/.test(value) || /var\(--control-height-/.test(value);
    const derived = new Set(
      [...Object.entries(BASE_ALIASES), ...Object.entries(BASE_DOC_ALIASES)]
        .filter(([, value]) => readsScaled(value))
        .map(([token]) => token),
    );

    for (const token of [
      "--section-gap-sm",
      "--section-gap-md",
      "--section-gap-lg",
      "--content-gutter",
    ]) {
      expect(BASE_ALIASES[token], `${token} must be declared in aliases.css`).toBeDefined();
      expect(derived.has(token), `${token} must be derived as density-dependent`).toBe(true);
      expect(COMPACT[token]).toBe(BASE_ALIASES[token]);
      expect(COMFORTABLE[token]).toBe(BASE_ALIASES[token]);
    }
  });

  it("remaps the page-rhythm steps 0.8-07 added to the top of the scale", () => {
    // SCALED_SPACE is itself derived from spacing.css, so the completeness test
    // above already covers these. Named explicitly because the scale's ceiling
    // moving from --space-24 to --space-64 is the change worth regression-pinning.
    for (const token of ["--space-32", "--space-40", "--space-48", "--space-64"]) {
      expect(SCALED_SPACE).toContain(token);
      expect(BASE_SPACING[token]).toBeDefined();
      expect(px(COMPACT[token].replace("var(--density-scale)", String(SCALE)))).toBeCloseTo(
        px(BASE_SPACING[token]) * SCALE,
        6,
      );
      expect(COMFORTABLE[token]).toBe(BASE_SPACING[token]);
    }
  });

  it("does not remap paged-media tokens — print density belongs to the theme", () => {
    const paged = Object.keys(block(read("tokens/document.css"), ":root"));
    expect(paged.length).toBeGreaterThan(0);
    for (const token of paged) {
      expect(COMPACT[token]).toBeUndefined();
      expect(COMFORTABLE[token]).toBeUndefined();
    }
  });

  it("both density blocks declare exactly the same token set", () => {
    expect(Object.keys(COMPACT).sort()).toEqual(Object.keys(COMFORTABLE).sort());
  });

  it("aliases.css defines the shared control ramp and sizes button/input from it", () => {
    for (const token of CONTROL_HEIGHTS) expect(BASE_ALIASES[token]).toMatch(/^\d+px$/);
    expect(BASE_ALIASES["--button-height-sm"]).toBe("var(--control-height-sm)");
    expect(BASE_ALIASES["--button-height-md"]).toBe("var(--control-height-md)");
    expect(BASE_ALIASES["--button-height-lg"]).toBe("var(--control-height-lg)");
    expect(BASE_ALIASES["--input-height"]).toBe("var(--control-height-md)");
  });
});

describe("density · pure CSS, and not a sixth protocol attribute", () => {
  it("is implemented entirely in tokens/density.css — no other stylesheet selects on it", () => {
    const offenders: string[] = [];
    for (const rel of [...new Glob("**/*.css").scanSync(REGISTRY)].sort()) {
      if (rel === "tokens/density.css") continue;
      if (/\[data-density/.test(stripComments(readFileSync(join(REGISTRY, rel), "utf8")))) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no engine or controller JavaScript reads, writes or observes data-density", () => {
    // No runtime behaviour anywhere: the engine, every recipe controller and every
    // plugin must be entirely unaware of it. (`packages/forms` is excluded on
    // purpose — it is an HTML *generator*, covered by its own test below.)
    const offenders: string[] = [];
    for (const dir of ["registry/core", "registry/recipes", "src"]) {
      for (const rel of [...new Glob("**/*.{js,ts,tsx,mjs}").scanSync(join(ROOT, dir))].sort()) {
        if (rel.includes("node_modules") || rel.includes("/dist/")) continue;
        const src = readFileSync(join(ROOT, dir, rel), "utf8");
        // Naming it is fine — the context generator documents the attribute for
        // agents and `theme-manifest.ts` explains the surface exclusion. What must
        // not exist is a DOM API *acting* on it.
        const touches = [
          /dataset\.density/,
          /(get|set|remove|has)Attribute\(\s*["'`]data-density/,
          /(querySelector|querySelectorAll|closest|matches)\(\s*[^)]*\[data-density/,
          /setProperty\(\s*["'`]--density-scale/,
        ];
        if (touches.some((re) => re.test(src))) offenders.push(`${dir}/${rel}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("adds no audit rule — the protocol still has exactly five attributes", () => {
    const auditSrc = [...new Glob("**/*.ts").scanSync(join(ROOT, "src/audit"))]
      .map((rel) => readFileSync(join(ROOT, "src/audit", rel), "utf8"))
      .join("\n");
    expect(auditSrc).not.toContain("density");
  });

  it("no manifest declares data-density — it is in no component contract", () => {
    // `crud-table` has a variant it *calls* density, but it is a plain
    // `data-variant` on that one pattern — a different, component-scoped
    // mechanism. What must not exist is a manifest treating `data-density`
    // itself as part of a contract.
    const offenders: string[] = [];
    for (const rel of [...new Glob("**/*.manifest.json").scanSync(REGISTRY)].sort()) {
      if (/data-density/.test(readFileSync(join(REGISTRY, rel), "utf8"))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe("density · the @faqir-ui/forms density option now resolves", () => {
  // `renderForm(schema, ui, { density })` already emitted `data-density` on the
  // <form> before this stylesheet existed — the attribute was inert. It is a
  // generator writing markup a human could have typed, not an implementation of
  // density, so it stays outside the "no JavaScript" grep. These two assertions
  // pin the join: the generator emits it, and the stylesheet gives it meaning.
  it("emits data-density on the form element", async () => {
    const { renderForm } = await import("../../packages/forms/src/index.js");
    const schema = {
      type: "object" as const,
      properties: { name: { type: "string" as const, title: "Name" } },
    };
    expect(renderForm(schema, {}, { density: "compact" })).toContain('data-density="compact"');
    expect(renderForm(schema, {}, {})).not.toContain("data-density");
  });

  it("a generated compact form resolves tighter than the same form at default density", async () => {
    const { renderForm } = await import("../../packages/forms/src/index.js");
    const schema = {
      type: "object" as const,
      properties: { name: { type: "string" as const, title: "Name" } },
    };
    const w = new Window();
    const d = w.document;
    d.head.innerHTML = `<style>${SPACING_CSS}\n${ALIASES_CSS}\n${DOC_ALIASES_CSS}\n${DENSITY_CSS}
      [data-ui="input"] { block-size: var(--input-height); }
      [data-ui="field-group"] { gap: var(--field-gap); }</style>`;
    d.body.innerHTML =
      `<div id="dense">${renderForm(schema, {}, { idPrefix: "d", density: "compact" })}</div>` +
      `<div id="base">${renderForm(schema, {}, { idPrefix: "b" })}</div>`;

    const val = (root: string, sel: string, prop: string) =>
      px(
        w
          .getComputedStyle(d.querySelector(`#${root} ${sel}`)!)
          .getPropertyValue(prop),
      );

    expect(val("dense", '[data-ui="input"]', "block-size")).toBeLessThan(
      val("base", '[data-ui="input"]', "block-size"),
    );
    expect(val("dense", '[data-ui="field-group"]', "gap")).toBeLessThan(
      val("base", '[data-ui="field-group"]', "gap"),
    );
    w.close();
  });
});

describe("density · the reference page", () => {
  const HTML = read(DENSITY_REFERENCE_REL);

  it("is audit-clean under the component rules", async () => {
    const manifests = await loadRegistryManifestMap(REGISTRY);
    expect(
      auditHtmlSource({ source: HTML, file: `registry/${DENSITY_REFERENCE_REL}`, manifests }),
    ).toEqual([]);
  });

  it("is audit-clean under the document rules (ids, heading order, landmarks)", () => {
    const doc = parseDocument(HTML, "density.html");
    expect(DOCUMENT_RULES.flatMap((rule) => rule.check(doc))).toEqual([]);
  });

  it("shows the same markup at both densities, plus the nesting reset", () => {
    expect(HTML).toContain('data-density="compact"');
    expect(HTML).toContain('data-density="comfortable"');
    // A dense form and a dense table — the acceptance criterion for this task.
    expect(HTML).toContain('data-ui="field-group"');
    expect(HTML).toContain('data-ui="table"');
  });

  it("stays out of the component × theme matrix (density is not a component)", () => {
    // No `@ui:component` HEADER — the marker the matrix keys off. (The authoring
    // comment names it in prose to say why it is absent.)
    expect(HTML).not.toMatch(/<!--\s*@ui:component\s/);
    const swept = discoverComponents().map((c) => c.htmlRel);
    expect(swept).not.toContain(`registry/${DENSITY_REFERENCE_REL}`);
  });

  it("is captured by its own spec, in more than one theme and both schemes", () => {
    expect(DENSITY_THEMES.length).toBeGreaterThanOrEqual(2);
    const themes = new Set(discoverThemes());
    for (const t of DENSITY_THEMES) expect(themes.has(t)).toBe(true);

    const spec = readFileSync(join(ROOT, "tests/visual/density.pw.ts"), "utf8");
    expect(spec).toContain("DENSITY_THEMES");
    expect(spec).toContain("SCHEMES");

    // The assembled page really carries the stylesheet and the fragment.
    for (const theme of DENSITY_THEMES) {
      for (const scheme of SCHEMES) {
        const page = buildDensityPageHtml(theme, scheme);
        expect(page).toContain(`data-theme="${scheme}"`);
        expect(page).toContain('[data-density="compact"]');
        expect(page).toContain('data-density="compact"');
      }
    }
  });
});

describe("density · shipped everywhere the token layer ships", () => {
  it("index.css imports it, and imports it last (same specificity as :root)", () => {
    const imports = [...INDEX_CSS.matchAll(/@import\s+'\.\/([\w-]+\.css)'/g)].map((m) => m[1]);
    expect(imports).toContain("density.css");
    expect(imports[imports.length - 1]).toBe("density.css");
    expect(imports.indexOf("density.css")).toBeGreaterThan(imports.indexOf("aliases.css"));
    expect(imports.indexOf("density.css")).toBeGreaterThan(imports.indexOf("doc-aliases.css"));
  });

  it("every token stylesheet is in every hand-maintained cascade-order list", () => {
    // The order lists cannot be globbed (order is load-bearing), so they are
    // asserted complete instead: a new token file must be added to all of them.
    const onDisk = [...new Glob("*.css").scanSync(TOKENS)].filter((f) => f !== "index.css").sort();
    const lists: Array<[string, string]> = [
      ["src/utils/bundler.ts", readFileSync(join(ROOT, "src/utils/bundler.ts"), "utf8")],
      ["src/commands/init.ts", readFileSync(join(ROOT, "src/commands/init.ts"), "utf8")],
      [
        "scripts/build-core-package.mjs",
        readFileSync(join(ROOT, "scripts/build-core-package.mjs"), "utf8"),
      ],
      ["tests/visual/matrix.ts", readFileSync(join(ROOT, "tests/visual/matrix.ts"), "utf8")],
    ];
    for (const [name, src] of lists) {
      for (const file of onDisk) {
        const bare = file.replace(/\.css$/, "");
        expect(
          src.includes(`"${file}"`) || src.includes(`"${bare}"`),
          `${name} is missing ${file} from its token order list`,
        ).toBe(true);
      }
    }
  });

  it("is excluded from the themeable surface (a theme cannot reach a subtree scope)", async () => {
    const { isSurfaceTokenFile } = await import("../../src/theme-manifest");
    expect(isSurfaceTokenFile("density.css")).toBe(false);
    expect(isSurfaceTokenFile("index.css")).toBe(false);
    expect(isSurfaceTokenFile("spacing.css")).toBe(true);
    expect(isSurfaceTokenFile("aliases.css")).toBe(true);
  });

  it("no theme overrides a token density remaps (the two layers stay independent)", () => {
    const remapped = new Set([...SCALED_SPACE, ...CONTROL_HEIGHTS]);
    const offenders: string[] = [];
    for (const rel of [...new Glob("*.css").scanSync(join(REGISTRY, "themes"))].sort()) {
      const css = stripComments(readFileSync(join(REGISTRY, "themes", rel), "utf8"));
      for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) {
        if (remapped.has(m[1])) offenders.push(`themes/${rel} → ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
