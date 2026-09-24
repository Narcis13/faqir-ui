/**
 * Shape and focus families — `registry/tokens/effects.css`  [1.1A-02, 1.1A-03]
 *
 * 1.0 gave a theme colour, radius and shadow; it gave it nothing for the two
 * properties a person actually reads a UI's personality from. Every edge in the
 * registry was a literal `1px` and every ring a literal `2px solid`, so
 * "brutalist" could not thicken a border and "soft" could not soften a ring —
 * the twelve themes differed in hue and in nothing else.
 *
 * Four things are pinned here:
 *
 * 1. **The families exist with the documented defaults.** They are the 1.1 theme
 *    contract (FAQIR-VISION §5.2, the `shape` and `focus` axes) and 1.1A-08
 *    derives axes from exactly these names.
 *
 * 2. **`base/reset.css` is the single owner of the default ring** and spells no
 *    value of it out: width, style, colour, offset and the glow shadow are all
 *    tokens, so a theme states its focus once.
 *
 * 3. **Nothing in the registry re-hardcodes an edge or a ring.** A literal `1px`
 *    left in a stylesheet is a component the shape axis cannot reach, which is
 *    the whole defect these two tasks exist to remove. 1.1A-02 swept
 *    `primitives/`; 1.1A-03 finished `base/`, `recipes/` and `patterns/` and
 *    widened this gate to all four layers, where it is now the standing rule
 *    for anything added to the registry.
 *
 * 4. **Nothing renders differently at defaults.** Read through real properties
 *    in happy-dom (which substitutes `var()` chains), a card, an input, a
 *    button, and one rule per recipe/pattern family resolve to the same edge and
 *    the same `2px` ring as before.
 *
 * The gate is about edge WEIGHT. `border-radius` is the `--radius-*` family and
 * a separate axis; the two literal radii left in the registry (`checkbox`'s
 * indeterminate dash, `callout`'s fallback) are drawn glyphs, not edges, and
 * this file deliberately does not judge them. The same reasoning names — rather
 * than silently skips — `table`'s four CSS-triangle rules below.
 */
import { describe, it, expect } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

const EFFECTS = read("tokens/effects.css");
/** Comments blanked, newlines kept — a reported line number is the real one. */
const stripComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

function layerStylesheets(layer: string): { rel: string; css: string }[] {
  const dir = join(REGISTRY, layer);
  return [...new Glob("**/*.css").scanSync(dir)]
    .sort()
    .map((f) => ({ rel: `${layer}/${f}`, css: readFileSync(join(dir, f), "utf8") }));
}
const PRIMITIVES = layerStylesheets("primitives");
const BASE = layerStylesheets("base");
const RECIPES = layerStylesheets("recipes");
const PATTERNS = layerStylesheets("patterns");
/** Everything a project installs. `tokens/` declares the families; `themes/` re-points them. */
const REGISTRY_SHEETS = [...PRIMITIVES, ...BASE, ...RECIPES, ...PATTERNS];

/** Top-level and `@media`-nested rules alike: any `selector { declarations }`. */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue;
    out.push({ selector, body: m[2] });
  }
  return out;
}

// ── 1. the two families, with the values 1.1 documents ─────────────────────

describe("shape & focus · effects.css declares the 1.1 contract", () => {
  const SHAPE: Record<string, string> = {
    "--border-width-sm": "1px",
    "--border-width-md": "2px",
    "--border-width-lg": "3px",
    "--border-width": "var(--border-width-sm)",
    "--border-width-strong": "var(--border-width-md)",
    "--corner-shape": "round",
  };
  const FOCUS: Record<string, string> = {
    "--focus-ring-width": "2px",
    "--focus-ring-offset": "2px",
    "--focus-ring-style": "solid",
    "--focus-ring-color": "var(--color-ring)",
    "--focus-shadow": "none",
  };

  for (const [token, value] of Object.entries({ ...SHAPE, ...FOCUS })) {
    it(`${token} defaults to ${value}`, () => {
      const m = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(stripComments(EFFECTS));
      expect(m?.[1].trim()).toBe(value);
    });
  }

  it("declares exactly eleven new tokens — the surface the theme manifests grew by", () => {
    expect(Object.keys(SHAPE).length + Object.keys(FOCUS).length).toBe(11);
  });

  it("the roles point at steps, so a theme re-points both edges with one value", () => {
    // `--border-width` and `--border-width-strong` are what components name.
    // A theme that moves the *ladder* moves every edge that reads either role.
    expect(SHAPE["--border-width"]).toMatch(/^var\(--border-width-[a-z]{2}\)$/);
    expect(SHAPE["--border-width-strong"]).toMatch(/^var\(--border-width-[a-z]{2}\)$/);
  });

  it("the component silhouette aliases resolve to the shape family [for 1.1A-05]", () => {
    const aliases = stripComments(read("tokens/aliases.css"));
    for (const alias of ["--card-border-width", "--input-border-width"]) {
      expect(new RegExp(`${alias}\\s*:\\s*var\\(--border-width\\)`).test(aliases)).toBe(true);
    }
  });
});

// ── 2. reset.css owns the default ring, and spells out none of it ──────────

describe("shape & focus · base/reset.css is the single owner of the default ring", () => {
  const focusRule = rules(read("base/reset.css")).find((r) => r.selector === ":focus-visible");

  it("the rule exists (the gate is not vacuously green)", () => {
    expect(focusRule).toBeDefined();
  });

  it("contains no literal length and no literal colour", () => {
    const body = focusRule!.body;
    // Any bare number-with-unit, or a hex / colour function, is a value a theme
    // cannot reach. Every legitimate value here arrives through var().
    expect(body).not.toMatch(/(^|[\s:(,])-?[0-9.]+(px|rem|em)\b/);
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(|hsl\(/i);
  });

  it("reads all five focus tokens", () => {
    for (const token of [
      "--focus-ring-width",
      "--focus-ring-style",
      "--focus-ring-color",
      "--focus-ring-offset",
    ]) {
      expect(focusRule!.body).toContain(`var(${token})`);
    }
    // The glow sits at zero specificity, apart from the ring: `box-shadow` is
    // also where an element's RESTING shadow lives, and at (0,1,0) the default
    // `none` wiped it on every keyboard focus. Under `:where()` any rule that
    // sets a shadow outranks it.
    const glow = rules(read("base/reset.css")).find((r) => r.selector === ":where(:focus-visible)");
    expect(glow?.body).toContain("box-shadow: var(--focus-shadow)");
    expect(focusRule!.body).not.toContain("box-shadow");
  });

  it("no other base stylesheet draws a competing default ring", () => {
    for (const { rel, css } of layerStylesheets("base")) {
      if (rel === "base/reset.css") continue;
      expect({ [rel]: /:focus-visible/.test(css) }).toEqual({ [rel]: false });
    }
  });
});

// ── 3. nothing in the registry re-hardcodes an edge or a ring ──────────────

/**
 * The width slot of a `border` / `border-<side>` shorthand, or any
 * `*-width` longhand, given as a literal length. `border-radius` is excluded by
 * construction — a different family (`--radius-*`), judged elsewhere.
 *
 * Allow-listed by value, with the reason:
 *   • `0` / `none` — an edge being REMOVED needs no token; there is nothing for
 *     a theme to scale.
 *   • `var(--space-px)` — the hairline rule, which is a spacing decision.
 */
const LITERAL_BORDER =
  /border(?!-radius)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width)?\s*:\s*(-?[0-9.]+(?:px|rem|em))/g;
const LITERAL_OUTLINE = /outline\s*:\s*(-?[0-9.]+(?:px|rem|em))/g;
const LITERAL_OUTLINE_OFFSET = /outline-offset\s*:\s*(-?[0-9.]+(?:px|rem|em))/g;

/**
 * The CSS-triangle idiom: a zero-sized box whose three border legs ARE the
 * shape — `table`'s sort arrow and its expander caret. A theme's shape axis must
 * not reach these: scaling a leg does not thicken a rule, it deforms a glyph.
 * They are named here, by rule, rather than skipped by a value threshold, so
 * the exclusion cannot quietly grow.
 */
const GLYPH_RULES = new Set([
  `recipes/table/table.css [data-ui="table"] [data-part="th"][data-sortable]::after`,
  `recipes/table/table.css [data-ui="table"] [data-part="th"][aria-sort="ascending"]::after`,
  `recipes/table/table.css [data-ui="table"] [data-part="th"][aria-sort="descending"]::after`,
  `recipes/table/table.css [data-ui="table"] [data-part="expander"]::before, [data-ui="table"] [data-part="row-toggle"]::before`,
]);

/** Every `selector { … }` in a sheet, with the offset its body starts at. */
function ruleSpans(css: string) {
  const src = stripComments(css);
  const out: { selector: string; body: string; at: number; src: string }[] = [];
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue;
    out.push({ selector, body: m[2], at: m.index! + m[1].length + 1, src });
  }
  return out;
}

function offenders(
  files: readonly { rel: string; css: string }[],
  re: RegExp,
  skip: ReadonlySet<string> = GLYPH_RULES,
): string[] {
  const found: string[] = [];
  for (const { rel, css } of files) {
    for (const rule of ruleSpans(css)) {
      if (skip.has(`${rel} ${rule.selector}`)) continue;
      for (const m of rule.body.matchAll(new RegExp(re.source, "g"))) {
        const line = rule.src.slice(0, rule.at + m.index!).split("\n").length;
        found.push(`${rel}:${line}  ${m[0].trim()}`);
      }
    }
  }
  return found;
}

/** The value of one declaration, as the stylesheet writes it. */
function declaration(rel: string, selector: string, prop: string): string {
  const rule = ruleSpans(read(rel)).find((r) => r.selector === selector);
  expect({ [`${rel} ${selector}`]: Boolean(rule) }).toEqual({ [`${rel} ${selector}`]: true });
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(rule!.body);
  expect({ [`${selector} ${prop}`]: Boolean(m) }).toEqual({ [`${selector} ${prop}`]: true });
  return m![1].trim();
}

describe("shape & focus · the registry consumes the families, never a literal", () => {
  it("no literal border width anywhere in the registry", () => {
    expect(offenders(REGISTRY_SHEETS, LITERAL_BORDER)).toEqual([]);
  });

  it("no literal outline anywhere in the registry", () => {
    expect(offenders(REGISTRY_SHEETS, LITERAL_OUTLINE)).toEqual([]);
  });

  it("no literal outline offset anywhere in the registry", () => {
    // An inset ring is `calc(-1 * var(…))` of the thing it covers, so it keeps
    // covering it when a theme moves that thing.
    expect(offenders(REGISTRY_SHEETS, LITERAL_OUTLINE_OFFSET)).toEqual([]);
  });

  it("scans every layer a project installs (the sweep is not vacuously green)", () => {
    const sizes = {
      primitives: PRIMITIVES.length,
      base: BASE.length,
      recipes: RECIPES.length,
      patterns: PATTERNS.length,
    };
    expect(sizes.primitives).toBeGreaterThanOrEqual(40);
    expect(sizes.base).toBeGreaterThanOrEqual(4);
    expect(sizes.recipes).toBeGreaterThanOrEqual(29);
    expect(sizes.patterns).toBeGreaterThanOrEqual(15);
  });

  it("the gate has teeth — a planted literal is reported with file and line", () => {
    const planted = [{ rel: "recipes/probe/probe.css", css: "[data-ui=probe]{border:1px solid red}" }];
    expect(offenders(planted, LITERAL_BORDER)).toEqual(["recipes/probe/probe.css:1  border:1px"]);
    const ring = [{ rel: "patterns/probe/probe.css", css: "a:focus-visible{outline:2px solid red}" }];
    expect(offenders(ring, LITERAL_OUTLINE)).toEqual(["patterns/probe/probe.css:1  outline:2px"]);
  });

  it("a planted literal is reported at its real line, comments and all", () => {
    const planted = [
      {
        rel: "recipes/probe/probe.css",
        css: "/* a\n   two-line note\n*/\n[data-ui=probe] {\n  border-bottom: 2px solid red;\n}",
      },
    ];
    expect(offenders(planted, LITERAL_BORDER)).toEqual([
      "recipes/probe/probe.css:5  border-bottom: 2px",
    ]);
  });

  it("removing an edge stays literal — `0` and `none` need no token", () => {
    // Deliberate: there is nothing for a theme to scale about an absent border,
    // and `var(--border-width)` of nothing would read as a mistake.
    const zeroes = REGISTRY_SHEETS.filter(({ css }) => /border[a-z-]*:\s*(0|none)\s*;/.test(css));
    expect(zeroes.length).toBeGreaterThan(0);
    expect(offenders(zeroes, LITERAL_BORDER)).toEqual([]);
  });

  it("the only rules the sweep skips are the four drawn glyphs", () => {
    const skipped = offenders(REGISTRY_SHEETS, LITERAL_BORDER, new Set());
    // Eight legs across the four rules — and nothing outside table.css.
    expect(skipped.length).toBe(8);
    expect(skipped.filter((s) => !s.startsWith("recipes/table/table.css"))).toEqual([]);
    expect([...new Set(skipped.map((s) => /(\d+px)/.exec(s)![1]))].sort()).toEqual(["4px", "5px"]);
  });

  it("each skipped rule really is a glyph, not an edge", () => {
    // The two base rules size the box to nothing and let the legs be the shape;
    // the two `aria-sort` rules only swap which leg is drawn.
    for (const selector of [
      `[data-ui="table"] [data-part="th"][data-sortable]::after`,
      `[data-ui="table"] [data-part="expander"]::before, [data-ui="table"] [data-part="row-toggle"]::before`,
    ]) {
      const body = ruleSpans(read("recipes/table/table.css")).find((r) => r.selector === selector)!.body;
      expect({ [selector]: /width:\s*0;/.test(body) && /height:\s*0;/.test(body) }).toEqual({
        [selector]: true,
      });
    }
    for (const rel of [...GLYPH_RULES]) {
      expect(rel.startsWith("recipes/table/table.css ")).toBe(true);
    }
  });

  it("the emphasis role is consumed where the design leans on a thicker rule", () => {
    // A `heavy` shape theme must thicken these together with everything else.
    const EMPHASIS = [
      "primitives/kbd/kbd.css", // the keycap's bottom edge
      "primitives/nav/nav.css", // the active tab's indicator
      "primitives/separator/separator.css", // data-weight="thick"
      "primitives/collapsible/collapsible.css", // the chevron
      "primitives/spinner/spinner.css", // the ring it spins
    ];
    const strong = REGISTRY_SHEETS.filter(({ css }) =>
      css.includes("var(--border-width-strong)"),
    ).map((f) => f.rel);
    expect(EMPHASIS.filter((rel) => !strong.includes(rel))).toEqual([]);
  });

  it("the emphasis rules 1.1A-03 names read the emphasis role, by selector", () => {
    const NAMED: [string, string, string][] = [
      // The featured tier's second edge — the one thing that separates it.
      [
        "patterns/pricing/pricing.css",
        `[data-ui="pricing"] [data-part="tier"][data-state="featured"]`,
        "outline",
      ],
      // The active tab's underline.
      [
        "recipes/tabs/tabs.css",
        `[data-ui="tabs"][data-variant="underline"] [data-part="trigger"]`,
        "border-bottom",
      ],
      // The stepper's markers: the rule between two steps is a rule, drawn as a
      // box because it has to carry its own colour.
      ["primitives/stepper/stepper.css", `[data-ui="stepper"] [data-part="connector"]`, "height"],
      // The table's header rule, and the footer rule that answers it.
      ["recipes/table/table.css", `[data-ui="table"] [data-part="th"]`, "border-bottom"],
      [
        "recipes/table/table.css",
        `[data-ui="table"] [data-part="tfoot"] [data-part="td"]`,
        "border-top",
      ],
      // The settings rail's start-edge marker, and the slider thumb's ring.
      [
        "patterns/settings-page/settings-page.css",
        `[data-ui="settings-page"][data-variant="horizontal"] [data-ui="tabs"] [data-part="trigger"]`,
        "border-inline-start",
      ],
      ["recipes/slider/slider.css", `[data-ui="slider"] [data-part="thumb"]`, "border"],
    ];
    for (const [rel, selector, prop] of NAMED) {
      const value = declaration(rel, selector, prop);
      expect({ [`${rel} ${selector}`]: value }).toEqual({
        [`${rel} ${selector}`]: expect.stringContaining("var(--border-width-strong)"),
      });
    }
  });

  it("every ring in the registry is drawn with the focus family", () => {
    // A ring is an outline inside a `:focus` rule. Width and style always come
    // from the family; the colour comes from it too, unless the rule is a
    // forced-colors one, where the OS colour is the point.
    const SYSTEM_COLOR = /\b(Highlight|HighlightText|ButtonText|CanvasText|LinkText|SelectedItem)\b/;
    let rings = 0;
    for (const { rel, css } of REGISTRY_SHEETS) {
      for (const rule of ruleSpans(css)) {
        if (!rule.selector.includes(":focus")) continue;
        for (const m of rule.body.matchAll(/(?:^|;)\s*outline\s*:\s*([^;]+)/g)) {
          const value = m[1].trim();
          if (/^(none|0)$/.test(value)) continue;
          rings++;
          const missing = ["--focus-ring-width", "--focus-ring-style"].filter(
            (t) => !value.includes(`var(${t})`),
          );
          if (!value.includes("var(--focus-ring-color)") && !SYSTEM_COLOR.test(value)) {
            missing.push("a ring colour");
          }
          expect({ [`${rel} ${rule.selector}`]: missing }).toEqual({
            [`${rel} ${rule.selector}`]: [],
          });
        }
      }
    }
    expect(rings).toBeGreaterThanOrEqual(40);
  });

  it("an outline that is NOT a ring is an edge, and reads the shape family", () => {
    // `pricing`'s featured tier and `tabs`' forced-colors selection both draw an
    // outline to avoid moving the layout. They are edges: a heavy theme should
    // thicken them, and a soft focus theme should not touch them.
    for (const { rel, css } of REGISTRY_SHEETS) {
      for (const rule of ruleSpans(css)) {
        if (rule.selector.includes(":focus")) continue;
        for (const m of rule.body.matchAll(/(?:^|;)\s*outline\s*:\s*([^;]+)/g)) {
          const value = m[1].trim();
          if (/^(none|0)$/.test(value)) continue;
          expect({ [`${rel} ${rule.selector}`]: value }).toEqual({
            [`${rel} ${rule.selector}`]: expect.stringContaining("var(--border-width"),
          });
        }
      }
    }
  });

  it("the glow axis reaches controls, not just bare elements", () => {
    // `--focus-shadow` is `none` today; a theme that sets it must land on the
    // button and the input, whose own :focus rules would otherwise win.
    for (const rel of ["primitives/button/button.css", "primitives/input/input.css"]) {
      const css = PRIMITIVES.find((f) => f.rel === rel)!.css;
      expect({ [rel]: css.includes("box-shadow: var(--focus-shadow);") }).toEqual({ [rel]: true });
    }
  });

  it("corner-shape is offered on the six surfaces that carry a radius", () => {
    const SURFACES = ["button", "card", "surface", "input", "badge"];
    for (const name of SURFACES) {
      const css = read(`primitives/${name}/${name}.css`);
      expect({ [name]: css.includes("corner-shape: var(--corner-shape);") }).toEqual({
        [name]: true,
      });
    }
    expect(read("recipes/dialog/dialog.css")).toContain("corner-shape: var(--corner-shape);");
  });
});

// ── 4. nothing renders differently at defaults ─────────────────────────────

/**
 * happy-dom's shorthand parser does not understand `oklch()` and drops any
 * `border: <width> <style> <colour>` declaration that resolves to one — the
 * whole shorthand, width included. That is a shim limitation, not a rendering
 * one, and it predates this task; the colours are swapped for a hex the shim
 * can read so the WIDTH slot — the only thing 1.1A-02 touches — is measurable.
 *
 * The same parser is also why the width slot of a shorthand names its alias at
 * one level (`var(--input-border-width)`) rather than with a fallback: given
 * `var(--a, var(--b))` it splits on the comma inside the fallback and assigns
 * the wrong value. The alias is declared in `tokens/aliases.css`, which every
 * project installs, so the fallback bought nothing and cost the measurement.
 */
const shimColors = (css: string) => css.replace(/oklch\([^()]*\)/g, "#cccccc");

const TOKEN_FILES = [
  "tokens/palette.css",
  "tokens/spacing.css",
  "tokens/typography.css",
  "tokens/effects.css",
  "tokens/motion.css",
  "tokens/semantic.css",
  "tokens/aliases.css",
];

function render(extra: string, sheets: readonly string[]): {
  style: (id: string, prop: string) => string;
  close: () => void;
} {
  const w = new Window();
  const d = w.document;
  d.head.innerHTML = `<style>
    ${TOKEN_FILES.map(read).map(shimColors).join("\n")}
    ${sheets.map(read).map(shimColors).join("\n")}
    ${extra}
  </style>`;
  d.body.innerHTML = `
    <div id="card" data-ui="card"></div>
    <input id="input" data-ui="input">
    <button id="button" data-ui="button">Save</button>
    <kbd id="kbd" data-ui="kbd">⌘K</kbd>
    <span id="spinner" data-ui="spinner"></span>
    <span id="spinner-lg" data-ui="spinner" data-size="lg"></span>`;
  return {
    style: (id, prop) => w.getComputedStyle(d.getElementById(id)!).getPropertyValue(prop),
    close: () => w.close(),
  };
}

const SHEETS = [
  "primitives/card/card.css",
  "primitives/input/input.css",
  "primitives/button/button.css",
  "primitives/kbd/kbd.css",
  "primitives/spinner/spinner.css",
];

describe("shape & focus · the default chain still resolves to the same edge", () => {
  /**
   * Every number below is the literal the stylesheet carried before the
   * re-pointing pass — the "before" side of the comparison, measured on the
   * baseline tree, not copied out of the token file.
   */
  const BEFORE: [string, string, string][] = [
    ["card", "border-top-width", "1px"],
    ["input", "border-top-width", "1px"],
    ["button", "border-top-width", "1px"],
    ["kbd", "border-top-width", "1px"],
    ["kbd", "border-bottom-width", "2px"], // the keycap's weighted edge
    ["spinner", "border-top-width", "2px"],
    ["spinner-lg", "border-top-width", "3px"],
  ];

  for (const [id, prop, expected] of BEFORE) {
    it(`${id} · ${prop} is still ${expected}`, () => {
      const dom = render("", SHEETS);
      try {
        expect(dom.style(id, prop)).toBe(expected);
      } finally {
        dom.close();
      }
    });
  }

  it("a shape theme re-points every edge that reads the role", () => {
    // The one declaration a 1.0 theme could not make: a heavier silhouette.
    const dom = render(`:root { --border-width-sm: 4px; }`, SHEETS);
    try {
      for (const id of ["card", "input", "button", "kbd"]) {
        expect({ [id]: dom.style(id, "border-top-width") }).toEqual({ [id]: "4px" });
      }
      // …and the emphasis role moves with it, one step above.
      expect(dom.style("kbd", "border-bottom-width")).toBe("2px");
    } finally {
      dom.close();
    }
  });

  it("a theme that thickens only the emphasis step leaves the default edge alone", () => {
    const dom = render(`:root { --border-width-md: 6px; }`, SHEETS);
    try {
      expect(dom.style("kbd", "border-bottom-width")).toBe("6px");
      expect(dom.style("spinner", "border-top-width")).toBe("6px");
      expect(dom.style("card", "border-top-width")).toBe("1px");
    } finally {
      dom.close();
    }
  });

  it("the component silhouette alias overrides the role for that component only", () => {
    // What 1.1A-05 aims at: a control-shape axis that does not move the card.
    const dom = render(`:root { --input-border-width: 5px; }`, SHEETS);
    try {
      expect(dom.style("input", "border-top-width")).toBe("5px");
      expect(dom.style("card", "border-top-width")).toBe("1px");
    } finally {
      dom.close();
    }
  });

  it("the focus ring still resolves to the 2px chain reset owns", () => {
    const w = new Window();
    const d = w.document;
    d.head.innerHTML = `<style>
      ${shimColors(read("tokens/effects.css"))}
      ${shimColors(read("tokens/semantic.css"))}
      ${read("base/reset.css")}
      :root { --probe-width: var(--focus-ring-width); --probe-offset: var(--focus-ring-offset); }
    </style>`;
    try {
      const root = w.getComputedStyle(d.documentElement);
      expect(root.getPropertyValue("--probe-width").trim()).toBe("2px");
      expect(root.getPropertyValue("--probe-offset").trim()).toBe("2px");
      expect(root.getPropertyValue("--focus-shadow").trim()).toBe("none");
    } finally {
      w.close();
    }
  });
});

// ── 5. every re-pointed family still draws the edge it drew ────────────────

/**
 * One case per recipe/pattern family that 1.1A-03 re-pointed, measured rather
 * than argued: the declaration is read from the stylesheet exactly as it ships
 * and resolved through happy-dom, and the number it produces is the literal the
 * sheet carried before the sweep.
 *
 * Six of these rules are logical (`border-inline-start`, `border-block-end`),
 * and happy-dom implements no logical border longhand — `border-inline-start`
 * parses, but both `border-inline-start-width` and the `border-left-width` it
 * should map to compute to "". So the value is re-declared on `border-top`,
 * which the shim does implement. What is measured is the component's own var()
 * chain, character for character; only the side differs, and a side cannot
 * change a width.
 */
function widthSlot(value: string): string {
  // The first top-level component of a `border` / `outline` shorthand, paren
  // aware: `var(--border-width-lg) solid var(--color-success, oklch(…))` is a
  // width, a style and a colour, and only the width is this file's business.
  // (It also sidesteps the shim bug 1.1A-02 documented: given a var() with a
  // fallback in the width slot, happy-dom splits on the comma inside it.)
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (/\s/.test(c) && depth === 0) return value.slice(0, i);
  }
  return value;
}

function widthOf(value: string, prop: "border" | "outline" = "border"): string {
  const w = new Window();
  const d = w.document;
  d.head.innerHTML = `<style>
    ${TOKEN_FILES.map(read).map(shimColors).join("\n")}
    #probe { ${prop === "border" ? "border-top" : "outline"}: ${widthSlot(value)} solid #cccccc; }
  </style>`;
  d.body.innerHTML = `<i id="probe"></i>`;
  try {
    return w
      .getComputedStyle(d.getElementById("probe")!)
      .getPropertyValue(prop === "border" ? "border-top-width" : "outline-width");
  } finally {
    w.close();
  }
}

describe("shape & focus · recipes and patterns resolve to the same edge", () => {
  /**
   * `[rel, selector, property, the literal this rule carried at 375d247]`.
   * The expected numbers are the "before" side of the comparison, read off the
   * baseline tree — not copied out of the token file.
   */
  const BEFORE: [string, string, string, string][] = [
    // recipes
    [
      "recipes/accordion/accordion.css",
      `[data-ui="accordion"] [data-part="item"]`,
      "border-bottom",
      "1px",
    ],
    ["recipes/dialog/dialog.css", `[data-ui="dialog"] [data-part="panel"]`, "border", "1px"],
    [
      "recipes/drawer/drawer.css",
      `[data-ui="drawer"] [data-part="panel"][data-variant="left"]`,
      "border-inline-end",
      "1px",
    ],
    ["recipes/table/table.css", `[data-ui="table"] [data-part="th"]`, "border-bottom", "2px"],
    ["recipes/table/table.css", `[data-ui="table"] [data-part="td"]`, "border-bottom", "1px"],
    [
      "recipes/tabs/tabs.css",
      `[data-ui="tabs"][data-variant="underline"] [data-part="trigger"]`,
      "border-bottom",
      "2px",
    ],
    [
      "recipes/toast/toast.css",
      `[data-ui="toast"] [data-part="toast"][data-variant="success"]`,
      "border-inline-start",
      "3px",
    ],
    ["recipes/slider/slider.css", `[data-ui="slider"] [data-part="thumb"]`, "border", "2px"],
    [
      "recipes/sidebar/sidebar.css",
      `[data-ui="sidebar"] [data-part="panel"]`,
      "border-inline-end",
      "1px",
    ],
    // patterns
    [
      "patterns/dashboard-shell/dashboard-shell.css",
      `[data-ui="dashboard-shell"] > [data-part="sidebar"]`,
      "border-inline-end",
      "1px",
    ],
    [
      "patterns/document/document.css",
      `[data-ui="document"] > [data-part="doc-header"], [data-ui="document"] > [data-part="header"]`,
      "border-block-end",
      "1px",
    ],
    [
      "patterns/settings-page/settings-page.css",
      `[data-ui="settings-page"][data-variant="horizontal"] [data-ui="tabs"] [data-part="trigger"]`,
      "border-inline-start",
      "2px",
    ],
    [
      "patterns/search-results/search-results.css",
      `[data-ui="search-results"] [data-part="results-header"]`,
      "border-bottom",
      "1px",
    ],
    [
      "patterns/crud-table/crud-table.css",
      `[data-ui="crud-table"] [data-part="empty-state"]`,
      "border",
      "1px",
    ],
    // base
    ["base/prose.css", `[data-ui="prose"] blockquote`, "border-inline-start", "3px"],
    ["base/prose.css", `[data-ui="prose"] th`, "border-block-end", "2px"],
    ["base/prose.css", `[data-ui="prose"] hr`, "border-block-start", "1px"],
    ["base/prose.css", `[data-ui="prose"] td`, "border-block-end", "1px"],
  ];

  for (const [rel, selector, prop, expected] of BEFORE) {
    it(`${rel.split("/")[1]} · ${prop} on \`${selector}\` is still ${expected}`, () => {
      expect(widthOf(declaration(rel, selector, prop))).toBe(expected);
    });
  }

  it("the featured pricing tier is the one edge that changed, deliberately", () => {
    // It drew `var(--space-px, 1px)`: a hairline, thinner than every other
    // emphasis rule in the registry, and unreachable by a shape theme. On the
    // emphasis role it is 2px — the weight `kbd`'s keycap and the table's header
    // rule already carry, and a heavy theme now moves all three together.
    const value = declaration(
      "patterns/pricing/pricing.css",
      `[data-ui="pricing"] [data-part="tier"][data-state="featured"]`,
      "outline",
    );
    expect(widthOf(value, "outline")).toBe("2px");
  });

  it("a shape theme moves every family at once", () => {
    // The proof that the sweep bought something: one declaration, and the
    // accordion, the table header, the toast accent and the blockquote all move.
    const w = new Window();
    const d = w.document;
    d.head.innerHTML = `<style>
      ${TOKEN_FILES.map(read).map(shimColors).join("\n")}
      :root { --border-width-sm: 4px; --border-width-md: 6px; --border-width-lg: 8px; }
      #a { border-top: ${widthSlot(declaration("recipes/accordion/accordion.css", `[data-ui="accordion"] [data-part="item"]`, "border-bottom"))} solid #cccccc; }
      #b { border-top: ${widthSlot(declaration("recipes/table/table.css", `[data-ui="table"] [data-part="th"]`, "border-bottom"))} solid #cccccc; }
      #c { border-top: ${widthSlot(declaration("recipes/toast/toast.css", `[data-ui="toast"] [data-part="toast"][data-variant="success"]`, "border-inline-start"))} solid #cccccc; }
      #d { border-top: ${widthSlot(declaration("base/prose.css", `[data-ui="prose"] blockquote`, "border-inline-start"))} solid #cccccc; }
    </style>`;
    d.body.innerHTML = `<i id="a"></i><i id="b"></i><i id="c"></i><i id="d"></i>`;
    try {
      const width = (id: string) =>
        w.getComputedStyle(d.getElementById(id)!).getPropertyValue("border-top-width");
      expect({ accordion: width("a"), header: width("b"), toast: width("c"), quote: width("d") }).toEqual(
        { accordion: "4px", header: "6px", toast: "8px", quote: "8px" },
      );
    } finally {
      w.close();
    }
  });

  it("a focus theme moves every ring at once, including the ones that were hairlines", () => {
    // `context-menu`, `tree-view` and `file-upload` drew their rings out of the
    // SPACING family (`var(--space-px)`), which is how three components ended up
    // with a 1px ring while every other control had 2px. They are on the focus
    // family now — which is both why they match and why they are reachable.
    const RINGS = [
      ["recipes/context-menu/context-menu.css", `[data-ui="context-menu"] [data-part="target"]:focus-visible`],
      [
        "recipes/tree-view/tree-view.css",
        `[data-ui="tree-view"] [data-part="item"]:focus-visible > [data-part="label"]`,
      ],
      ["recipes/accordion/accordion.css", `[data-ui="accordion"] [data-part="trigger"]:focus-visible`],
    ] as const;
    for (const [rel, selector] of RINGS) {
      const value = declaration(rel, selector, "outline");
      expect({ [rel]: widthOf(value, "outline") }).toEqual({ [rel]: "2px" });
    }
  });
});
