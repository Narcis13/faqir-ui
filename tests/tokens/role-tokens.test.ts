/**
 * Type role tokens + heading voice — `registry/tokens/typography.css`  [1.1A-01]
 *
 * The reason twelve themes read as one page: components consumed *family*
 * tokens (`--font-sans`), so a theme had nothing to set when it wanted serif
 * headings on a sans body. 1.1 splits the palette (`--font-sans/-serif/-mono`)
 * from the ROLES components read (`--font-heading/-body/-ui`) and adds the four
 * knobs that give a heading a voice (weight, tracking, case, leading).
 *
 * Four things are pinned here:
 *
 * 1. **The seven tokens exist with the documented defaults** — they are the 1.1
 *    theme contract (FAQIR-VISION §5.2, the `type.pairing` and `type.voice`
 *    axes), and the generator in 1.1A-10 derives axes from exactly these names.
 *
 * 2. **No component may reach past a role for a family.** A single
 *    `var(--font-sans)` left in a stylesheet is a component the theme system
 *    cannot re-point, which is the whole defect this task exists to remove.
 *    `--font-mono` stays readable by name: "this is code" is a semantic choice,
 *    not a stylistic one, and no theme wants its code blocks re-faced by the
 *    body role.
 *
 * 3. **Headings actually consume the heading role** — in `base/prose.css` and in
 *    every pattern headline/title, so a theme's type pairing reaches the surfaces
 *    a reader looks at first.
 *
 * 4. **Nothing renders differently at defaults.** Read through a real property in
 *    happy-dom (which substitutes `var()` chains), a control and a prose heading
 *    resolve to byte-identical font-family strings before and after the
 *    re-pointing pass. The literal below was measured against the pre-1.1A-01
 *    tree (`git show 50e64d5:registry/…`), not copied from the token file.
 */
import { describe, it, expect } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

const TYPOGRAPHY = read("tokens/typography.css");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every stylesheet a project installs as a component or a base layer. */
const COMPONENT_LAYERS = ["primitives", "recipes", "patterns", "base"] as const;
function layerStylesheets(layer: string): { rel: string; css: string }[] {
  const dir = join(REGISTRY, layer);
  return [...new Glob("**/*.css").scanSync(dir)]
    .sort()
    .map((f) => ({ rel: `${layer}/${f}`, css: readFileSync(join(dir, f), "utf8") }));
}
const ALL_COMPONENT_CSS = COMPONENT_LAYERS.flatMap(layerStylesheets);

/** Top-level and `@media`-nested rules alike: any `selector { declarations }`. */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of stripComments(css).matchAll(re)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue;
    out.push({ selector, body: m[2] });
  }
  return out;
}

const declaration = (body: string, prop: string): string | undefined => {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
  return m?.[1].trim();
};

// ── 1. the seven tokens, with the values 1.1 documents ──────────────────────

describe("role tokens · typography.css declares the 1.1 type contract", () => {
  const EXPECTED: Record<string, string> = {
    // Roles — default to today's family so nothing renders differently.
    "--font-heading": "var(--font-sans)",
    "--font-body": "var(--font-sans)",
    "--font-ui": "var(--font-sans)",
    // Voice — the primary heading's own values, promoted to tokens.
    "--heading-weight": "var(--weight-bold)",
    "--heading-tracking": "0em",
    "--heading-transform": "none",
    "--heading-leading": "var(--leading-tight)",
  };

  for (const [token, value] of Object.entries(EXPECTED)) {
    it(`${token} defaults to ${value}`, () => {
      const m = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(stripComments(TYPOGRAPHY));
      expect(m?.[1].trim()).toBe(value);
    });
  }

  it("declares exactly seven new tokens — the surface the theme manifests grew by", () => {
    expect(Object.keys(EXPECTED).length).toBe(7);
  });

  it("--heading-tracking carries a unit, so it composes inside calc()", () => {
    // `calc(-0.01em + 0)` is invalid CSS (a length plus a number), which would
    // silently drop the heading primitive's optical tightening. `0em` keeps the
    // token addable to a literal em value — see primitives/text/text.css.
    expect(EXPECTED["--heading-tracking"]).toMatch(/^0[a-z]+$/);
    expect(read("primitives/text/text.css")).toContain(
      "calc(-0.01em + var(--heading-tracking))",
    );
  });

  it("keeps the three families as the palette the roles point at", () => {
    for (const family of ["--font-sans:", "--font-serif:", "--font-mono:"]) {
      expect(TYPOGRAPHY).toContain(family);
    }
  });
});

// ── 2. no component reaches past a role for a family ────────────────────────

describe("role tokens · components consume roles, never families", () => {
  it("no stylesheet under primitives/recipes/patterns/base references a family token", () => {
    const offenders: string[] = [];
    for (const { rel, css } of ALL_COMPONENT_CSS) {
      for (const [i, line] of css.split("\n").entries()) {
        if (/var\(\s*--font-(sans|serif)\b/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("scans the whole component surface (the sweep is not vacuously green)", () => {
    expect(ALL_COMPONENT_CSS.length).toBeGreaterThan(80);
  });

  it("--font-mono stays readable by name — code faces are semantic, not stylistic", () => {
    const monoUsers = ALL_COMPONENT_CSS.filter(({ css }) => /var\(\s*--font-mono\b/.test(css));
    expect(monoUsers.map((f) => f.rel)).toContain("primitives/kbd/kbd.css");
    expect(monoUsers.length).toBeGreaterThanOrEqual(4);
  });

  it("the control aliases resolve to the UI role", () => {
    const aliases = stripComments(read("tokens/aliases.css"));
    for (const alias of ["--button-font", "--input-font", "--badge-font"]) {
      expect(new RegExp(`${alias}\\s*:\\s*var\\(--font-ui\\)`).test(aliases)).toBe(true);
    }
  });

  it("the document face resolves to the body and heading roles", () => {
    const doc = stripComments(read("tokens/document.css"));
    expect(/--doc-font\s*:\s*var\(--font-body\)/.test(doc)).toBe(true);
    expect(/--doc-heading-font\s*:\s*var\(--font-heading\)/.test(doc)).toBe(true);
  });
});

// ── 3. headings consume the heading role ────────────────────────────────────

describe("role tokens · every heading surface reads --font-heading", () => {
  for (const base of ["base/prose.css", "base/rhythm.css"]) {
    it(`${base}: every h1–h6 rule reads --font-heading`, () => {
      const headings = rules(read(base)).filter((r) =>
        r.selector.split(",").some((s) => /\bh[1-6]\s*$/.test(s.trim())),
      );
      const missing = headings
        .filter((r) => declaration(r.body, "font-family") !== "var(--font-heading)")
        .map((r) => r.selector);
      expect(missing).toEqual([]);
    });
  }

  it("base/prose.css actually has heading rules to gate", () => {
    const headings = rules(read("base/prose.css")).filter((r) => /\bh[1-6]\s*$/.test(r.selector));
    expect(headings.length).toBeGreaterThanOrEqual(4);
  });

  const HEADLINE = /\[data-part="(headline|title)"\]\s*$/;
  const patternFiles = layerStylesheets("patterns");

  for (const { rel, css } of patternFiles) {
    const headlines = rules(css).filter((r) =>
      r.selector.split(",").some((s) => HEADLINE.test(s.trim())),
    );
    if (headlines.length === 0) continue;

    it(`${rel}: its headline/title reads --font-heading`, () => {
      // A size variant that only re-scales the type need not restate the family;
      // a rule that DOES name a family must name the role.
      const named = headlines.filter((r) => declaration(r.body, "font-family") !== undefined);
      expect(named.length).toBeGreaterThanOrEqual(1);
      for (const r of named) {
        expect(declaration(r.body, "font-family")).toBe("var(--font-heading)");
      }
    });
  }

  it("gates every pattern that has a headline (no pattern silently skipped)", () => {
    const withHeadline = patternFiles.filter(({ css }) =>
      rules(css).some((r) => r.selector.split(",").some((s) => HEADLINE.test(s.trim()))),
    );
    expect(withHeadline.length).toBeGreaterThanOrEqual(6);
  });
});

// ── 4. nothing renders differently at defaults ──────────────────────────────

/**
 * The computed `font-family` of a control and of a prose heading in the tree as
 * it stood at 1.1A-01's baseline commit. Both sides of the re-pointing pass were
 * measured; this is the "before".
 */
const SYSTEM_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';

describe("role tokens · the default chain still resolves to the same stack", () => {
  function probe() {
    const w = new Window();
    const d = w.document;
    d.head.innerHTML = `<style>
      ${read("tokens/typography.css")}
      ${read("tokens/aliases.css")}
      ${read("tokens/document.css")}
      ${read("base/prose.css")}
      ${read("primitives/button/button.css")}
      ${read("primitives/text/text.css")}
    </style>`;
    d.body.innerHTML = `
      <button id="control" data-ui="button">Save</button>
      <div data-ui="prose"><h1 id="h1">Title</h1><h2 id="h2">Section</h2></div>
      <h3 id="heading" data-ui="heading" data-size="3">Heading</h3>`;
    const style = (id: string, prop: string) =>
      w.getComputedStyle(d.getElementById(id)!).getPropertyValue(prop);
    return { style, close: () => w.close() };
  }

  it("a button, a prose h1/h2 and the heading primitive all resolve to the system stack", () => {
    const dom = probe();
    try {
      for (const id of ["control", "h1", "h2", "heading"]) {
        expect(dom.style(id, "font-family")).toBe(SYSTEM_STACK);
      }
    } finally {
      dom.close();
    }
  });

  it("the heading hierarchy is unchanged — h1 bold/tight, h2 a semibold step below", () => {
    const dom = probe();
    try {
      expect(dom.style("h1", "font-weight")).toBe("700");
      expect(dom.style("h2", "font-weight")).toBe("600");
      expect(dom.style("h1", "line-height")).toBe("1.25");
      expect(dom.style("h2", "line-height")).toBe("1.25");
    } finally {
      dom.close();
    }
  });

  it("re-pointing a role re-faces every surface that reads it", () => {
    const w = new Window();
    const d = w.document;
    d.head.innerHTML = `<style>
      ${read("tokens/typography.css")}
      ${read("tokens/aliases.css")}
      ${read("base/prose.css")}
      ${read("primitives/button/button.css")}
      :root[data-theme="probe"] { --font-heading: Georgia, serif; }
    </style>`;
    d.documentElement.setAttribute("data-theme", "probe");
    d.body.innerHTML = `
      <button id="control" data-ui="button">Save</button>
      <div data-ui="prose"><h2 id="h2">Section</h2></div>`;
    const style = (id: string) =>
      w.getComputedStyle(d.getElementById(id)!).getPropertyValue("font-family");
    try {
      // The one declaration a 1.0 theme could not make: serif headings, sans body.
      expect(style("h2")).toBe("Georgia, serif");
      expect(style("control")).toBe(SYSTEM_STACK);
    } finally {
      w.close();
    }
  });
});
