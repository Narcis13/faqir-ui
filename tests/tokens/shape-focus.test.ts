/**
 * Shape and focus families — `registry/tokens/effects.css`  [1.1A-02]
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
 * 3. **No primitive re-hardcodes an edge or a ring.** A literal `1px` left in a
 *    stylesheet is a component the shape axis cannot reach, which is the whole
 *    defect this task exists to remove. Scoped to `primitives/` here; 1.1A-03
 *    widens the same gate to recipes, patterns and base.
 *
 * 4. **Nothing renders differently at defaults.** Read through real properties
 *    in happy-dom (which substitutes `var()` chains), a card, an input and a
 *    button resolve to the same `1px` edge and the same `2px` ring as before.
 *
 * The gate is about edge WEIGHT. `border-radius` is the `--radius-*` family and
 * a separate axis; the two literal radii left in the registry (`checkbox`'s
 * indeterminate dash, `callout`'s fallback) are drawn glyphs, not edges, and
 * this file deliberately does not judge them.
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
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function layerStylesheets(layer: string): { rel: string; css: string }[] {
  const dir = join(REGISTRY, layer);
  return [...new Glob("**/*.css").scanSync(dir)]
    .sort()
    .map((f) => ({ rel: `${layer}/${f}`, css: readFileSync(join(dir, f), "utf8") }));
}
const PRIMITIVES = layerStylesheets("primitives");

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
      "--focus-shadow",
    ]) {
      expect(focusRule!.body).toContain(`var(${token})`);
    }
  });

  it("no other base stylesheet draws a competing default ring", () => {
    for (const { rel, css } of layerStylesheets("base")) {
      if (rel === "base/reset.css") continue;
      expect({ [rel]: /:focus-visible/.test(css) }).toEqual({ [rel]: false });
    }
  });
});

// ── 3. no primitive re-hardcodes an edge or a ring ─────────────────────────

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

function offenders(files: readonly { rel: string; css: string }[], re: RegExp): string[] {
  const found: string[] = [];
  for (const { rel, css } of files) {
    for (const [i, line] of stripComments(css).split("\n").entries()) {
      for (const m of line.matchAll(new RegExp(re.source, "g"))) {
        found.push(`${rel}:${i + 1}  ${m[0].trim()}`);
      }
    }
  }
  return found;
}

describe("shape & focus · primitives consume the families, never a literal", () => {
  it("no literal border width in registry/primitives", () => {
    expect(offenders(PRIMITIVES, LITERAL_BORDER)).toEqual([]);
  });

  it("no literal outline in registry/primitives", () => {
    expect(offenders(PRIMITIVES, LITERAL_OUTLINE)).toEqual([]);
  });

  it("scans every primitive stylesheet (the sweep is not vacuously green)", () => {
    expect(PRIMITIVES.length).toBeGreaterThanOrEqual(40);
  });

  it("the gate has teeth — a planted literal is reported with file and line", () => {
    const planted = [{ rel: "primitives/probe/probe.css", css: "[data-ui=probe]{border:1px solid red}" }];
    expect(offenders(planted, LITERAL_BORDER)).toEqual(["primitives/probe/probe.css:1  border:1px"]);
    const ring = [{ rel: "primitives/probe/probe.css", css: "a:focus-visible{outline:2px solid red}" }];
    expect(offenders(ring, LITERAL_OUTLINE)).toEqual(["primitives/probe/probe.css:1  outline:2px"]);
  });

  it("removing an edge stays literal — `0` and `none` need no token", () => {
    // Deliberate: there is nothing for a theme to scale about an absent border,
    // and `var(--border-width)` of nothing would read as a mistake.
    const zeroes = PRIMITIVES.filter(({ css }) => /border[a-z-]*:\s*(0|none)\s*;/.test(css));
    expect(zeroes.length).toBeGreaterThan(0);
    expect(offenders(zeroes, LITERAL_BORDER)).toEqual([]);
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
    const strong = PRIMITIVES.filter(({ css }) => css.includes("var(--border-width-strong)")).map(
      (f) => f.rel,
    );
    expect(EMPHASIS.filter((rel) => !strong.includes(rel))).toEqual([]);
  });

  it("every primitive that draws its own ring reads the focus tokens", () => {
    const ringed = PRIMITIVES.filter(({ css }) => /outline\s*:/.test(stripComments(css)));
    expect(ringed.length).toBeGreaterThanOrEqual(13);
    for (const { rel, css } of ringed) {
      const missing = ["--focus-ring-width", "--focus-ring-style", "--focus-ring-color"].filter(
        (t) => !css.includes(`var(${t})`),
      );
      expect({ [rel]: missing }).toEqual({ [rel]: [] });
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
