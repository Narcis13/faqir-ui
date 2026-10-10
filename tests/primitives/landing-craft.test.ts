// ═══════════════════════════════════════════════════════════════════════════
// Landing-page craft: button arrow/sink, highlight foil/outline/echo,
// text display/eyebrow/dropcap, separator ornament, and the stamp primitive
// ═══════════════════════════════════════════════════════════════════════════
//
// All CSS-only. These are stylesheet assertions (happy-dom computes no cascade
// worth trusting); the rendered result was checked in Chromium by hand. What is
// pinned: the manifests validate and declare every new value and knob, the CSS
// stays token-only and logical, every movement is reduced-motion safe, the
// fallbacks (forced colours, unsupported properties) exist, and each reference
// page demonstrates each new value.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import {
  findClassSelectors,
  findHardcodedColorValues,
  findIdSelectors,
  findImportantDeclarations,
  findLogicalPropertyViolations,
  hasAnimationProperties,
  hasReducedMotionQuery,
} from "../../src/parser/css-parser";
import { extractComponents } from "../../src/parser/html-parser";

const REGISTRY = join(import.meta.dir, "../../registry");
const NAMES = ["button", "highlight", "text", "separator", "stamp"] as const;

const read = (name: string, ext: string) =>
  readFileSync(join(REGISTRY, "primitives", name, `${name}.${ext}`), "utf8");
const manifest = (name: string): Manifest => JSON.parse(read(name, "manifest.json"));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const cssOf = (name: string) => strip(read(name, "css"));
/** The body of the first `@media <query>` block, brace-balanced. */
function block(css: string, head: string): string {
  const start = css.indexOf(head);
  expect(start, `a ${head} block`).not.toBe(-1);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  throw new Error(`unbalanced ${head}`);
}
const minor = (v: string) => Number(v.split(".")[1]);

describe("landing craft · manifests validate and declare what the CSS selects", () => {
  for (const name of NAMES) {
    it(`${name}.manifest.json passes validateManifest`, () => {
      expect(validateManifest(manifest(name))).toEqual([]);
    });
  }

  it("versions were bumped by a minor with a changes entry for it", () => {
    for (const [name, version] of [["button", "1.4.0"], ["highlight", "1.1.0"], ["text", "1.3.0"], ["separator", "1.2.0"], ["stamp", "1.0.0"]] as const) {
      const m = manifest(name);
      expect(m.version).toBe(version);
      if (name !== "stamp") {
        expect(m.changes?.[0].version).toBe(version);
        expect(m.changes?.[0].breaking).toBe(false);
        expect(minor(version)).toBeGreaterThan(0);
      }
    }
  });

  it("every custom-property knob read with a fallback is declared with a default", () => {
    for (const name of NAMES) {
      const m = manifest(name);
      for (const hit of cssOf(name).matchAll(/var\(\s*(--(?:sink|stamp|highlight)-[a-z-]+)\s*,/g)) {
        expect(m.props?.[hit[1]], `${name}: ${hit[1]}`).toBeDefined();
        expect(m.props?.[hit[1]]?.default, `${name}: ${hit[1]} default`).toBeDefined();
      }
    }
  });

  it("declares the new values", () => {
    expect(manifest("button").props?.effect.values).toEqual(["shine", "pulse", "press", "arrow", "sink"]);
    expect(manifest("highlight").variants?.style.values).toEqual(
      ["gradient", "shimmer", "marker", "underline", "foil", "outline", "echo"],
    );
    const text = manifest("text");
    expect(text.variants?.size.values).toContain("display");
    expect(text.variants?.variant.values).toContain("eyebrow");
    expect(text.props?.dropcap?.attr).toBe("data-dropcap");
    expect(manifest("separator").variants?.style.values).toContain("ornament");
    expect(manifest("button").props?.["--sink-distance"]?.default).toBeDefined();
    expect(manifest("highlight").props?.["--highlight-echo"]?.default).toBe("var(--color-warning)");
  });
});

describe("landing craft · CSS is token-only, logical and motion-safe", () => {
  for (const name of NAMES) {
    const css = read(name, "css");
    it(`${name}.css has no hardcoded colours, classes, ids or !important`, () => {
      expect(findHardcodedColorValues(css)).toEqual([]);
      expect(findClassSelectors(css)).toEqual([]);
      expect(findIdSelectors(css)).toEqual([]);
      expect(findImportantDeclarations(css)).toEqual([]);
    });
    it(`${name}.css is logical and gates motion on reduced motion`, () => {
      expect(findLogicalPropertyViolations(css)).toEqual([]);
      if (hasAnimationProperties(css)) expect(hasReducedMotionQuery(css)).toBe(true);
    });
  }
});

describe("button · arrow", () => {
  const css = cssOf("button");
  const motion = block(css, "@media (prefers-reduced-motion: no-preference)");

  it("leans the trailing icon toward the inline end, only under no-preference", () => {
    expect(motion).toContain('[data-ui="button"][data-effect="arrow"] > [data-part="icon"]:last-child');
    expect(motion).toContain("translate: var(--faqir-button-nudge) 0;");
    expect(motion).toContain(':focus-visible > [data-part="icon"]:last-child');
    // Nothing outside the query moves the icon. (Mirroring the glyph for
    // right-to-left is not movement, and must hold under reduced motion too.)
    expect(css.replace(motion, "")).not.toMatch(/data-effect="arrow"\][^{]*>\s*\[data-part="icon"\][^{]*\{[^}]*translate/);
    expect(css.replace(motion, "")).toContain('[data-ui="button"][data-effect="arrow"]:dir(rtl) > [data-part="icon"]:last-child {\n  scale: -1 1;');
  });

  it("is one --space-1 and flips in right-to-left", () => {
    expect(css).toContain("--faqir-button-nudge: var(--space-1);");
    expect(css).toContain('[data-ui="button"][data-effect="arrow"]:dir(rtl) {\n  --faqir-button-nudge: calc(var(--space-1) * -1);');
  });

  it("the reference page gives it a decorative arrow-right icon as the last child", () => {
    const html = read("button", "html");
    expect(html).toContain('data-effect="arrow"');
    expect(html).toContain('data-icon="arrow-right" data-part="icon" aria-hidden="true"');
  });
});

describe("button · sink", () => {
  const css = cssOf("button");

  it("rests on the theme's shadow, lifts on hover, collapses and travels on :active", () => {
    expect(css).toContain('[data-ui="button"][data-effect="sink"] {\n  --faqir-button-sink: var(--sink-distance, calc(var(--space-1) / 2));\n  box-shadow: var(--sink-shadow, var(--shadow-md));');
    const hover = /\[data-effect="sink"\]:hover \{([^}]*)\}/.exec(css)![1];
    expect(hover).toContain("var(--shadow-lg)");
    expect(hover).toMatch(/translate: calc\(var\(--faqir-button-sink\) \* -1\) calc\(var\(--faqir-button-sink\) \* -1\)/);
    const active = /\[data-effect="sink"\]:active \{([^}]*)\}/.exec(css)![1];
    expect(active).toContain("box-shadow: var(--shadow-xs);");
    expect(active).toContain("translate: var(--faqir-button-sink) var(--faqir-button-sink);");
  });

  it("states the shadow from tokens, never a literal one", () => {
    const sink = css.slice(css.indexOf('[data-effect="sink"] {'));
    expect(sink).not.toMatch(/\d+px\s+\d+px/);
  });

  it("adds no transition of its own: the base rule's, which reduced motion drops, applies", () => {
    const sink = css.slice(css.indexOf('[data-ui="button"][data-effect="sink"] {'));
    expect(sink).not.toContain("transition");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\[data-ui="button"\] \{\s*transition: none;/);
  });

  it("the reference page shows it", () => {
    expect(read("button", "html")).toContain('data-effect="sink"');
  });
});

describe("highlight · foil, outline, echo", () => {
  const css = cssOf("highlight");

  it("foil is a primary-ramp banded gradient in em, painted and clipped to the text only where supported", () => {
    // Outside the guard: plain primary text and nothing else, so an engine
    // without background-clip never shows the bands as a stripe behind words.
    const plain = /\[data-variant="foil"\] \{([^}]*)\}/.exec(css)![1];
    expect(plain.trim()).toBe("color: var(--color-primary);");
    const guard = block(css, "@supports ((-webkit-background-clip: text) or (background-clip: text))");
    const foil = /\[data-variant="foil"\] \{([^}]*)\}/.exec(guard)![1];
    expect(foil).toContain("repeating-linear-gradient(");
    for (const t of ["--color-primary-active", "--color-primary-hover", "--color-primary", "--color-bg"]) {
      expect(foil).toContain(`var(${t})`);
    }
    expect(foil).not.toContain("light-dark(");
    expect(foil).toContain("em");
    expect(foil).toContain("background-clip: text;");
    expect(foil).toContain("-webkit-text-fill-color: transparent;");
  });

  it("the glint exists only under no-preference, from the ambient tokens", () => {
    const motion = block(css, "@media (prefers-reduced-motion: no-preference)");
    expect(motion).toContain('[data-variant="foil"]');
    expect(motion).toContain("var(--motion-ambient-duration)");
    expect(motion).toContain("animation-play-state: var(--motion-ambient-play);");
    expect(css.replace(motion, "")).not.toMatch(/\[data-variant="foil"\][^{]*\{[^}]*animation: faqir/);
  });

  it("outline is a text-stroke inside an @supports guard, with a transparent fill", () => {
    const guard = block(css, "@supports (-webkit-text-stroke: 1px)");
    expect(guard).toContain('[data-variant="outline"]');
    expect(guard).toContain("-webkit-text-stroke: var(--border-width-strong) var(--faqir-highlight-ink);");
    expect(guard).toContain("-webkit-text-fill-color: transparent;");
    // No stroke anywhere outside the guard, so an unsupporting browser renders solid text.
    expect(css.replace(guard, "")).not.toMatch(/text-stroke:\s*var/);
  });

  it("echo is two em-relative hard shadows, in the ink and --highlight-echo", () => {
    const echo = /\[data-variant="echo"\] \{([^}]*)\}/.exec(css)![1];
    expect(echo).toContain("0.04em 0.04em 0 var(--faqir-highlight-ink)");
    expect(echo).toContain("0.08em 0.08em 0 var(--highlight-echo, var(--color-warning))");
    expect(echo).not.toContain("blur");
  });

  it("forced colours hand all three back as plain text", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    for (const v of ["foil", "outline", "echo"]) expect(forced).toContain(`[data-variant="${v}"]`);
    expect(forced).toContain("-webkit-text-stroke: 0;");
    expect(forced).toContain("text-shadow: none;");
    expect(forced).toContain("-webkit-text-fill-color: currentColor;");
  });

  it("the reference page demonstrates each, on real, childless text", () => {
    const html = read("highlight", "html");
    for (const v of ["foil", "outline", "echo"]) expect(html).toContain(`data-variant="${v}"`);
    for (const root of extractComponents(html, "fragment.html").filter((c) => c.name === "highlight")) {
      expect(root.root.children).toHaveLength(0);
      expect(root.root.attrs["aria-hidden"]).toBeUndefined();
    }
    expect((manifest("highlight").a11y as { notes?: string } | undefined)?.notes).toContain("real text");
  });
});

describe("text · display, eyebrow, drop cap", () => {
  const css = cssOf("text");

  it("display is fluid from the type scale, in the heading voice, on both roots", () => {
    const rule = /\[data-ui="text"\]\[data-size="display"\],\s*\[data-ui="heading"\]\[data-size="display"\] \{([^}]*)\}/.exec(css)![1];
    expect(rule).toContain("clamp(min(var(--text-4xl), 11vw), 1rem + 6vw, calc(var(--text-4xl) * 2.25))");
    for (const t of ["--font-heading", "--heading-weight", "--heading-tracking", "--heading-transform", "--heading-caps"]) {
      expect(rule).toContain(`var(${t})`);
    }
    expect(rule).toContain("line-height: 1;");
    expect(rule).toContain("text-wrap: balance;");
    expect(rule).toContain("overflow-wrap: anywhere;");
  });

  it("display sits before weight and leading so they can still adjust it", () => {
    const at = css.indexOf('[data-size="display"]');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(css.indexOf('[data-weight="normal"]'));
    expect(at).toBeLessThan(css.indexOf('[data-leading="tight"]'));
  });

  it("eyebrow is a tracked, uppercase, semibold primary kicker whose size stays settable", () => {
    const rule = /\[data-ui="text"\]\[data-variant="eyebrow"\] \{([^}]*)\}/.exec(css)![1];
    expect(rule).toContain("font-family: var(--font-ui);");
    expect(rule).toContain("font-weight: var(--weight-semibold);");
    expect(rule).toContain("letter-spacing: 0.14em;");
    expect(rule).toContain("text-transform: uppercase;");
    expect(rule).toContain("color: var(--color-primary);");
    // The default size is in :where(), so a data-size on the element still wins.
    expect(css).toContain('[data-ui="text"]:where([data-variant="eyebrow"]) {\n  font-size: var(--text-xs);');
  });

  it("the drop cap sinks three lines with initial-letter and falls back to a float", () => {
    const base = /\[data-ui="text"\]\[data-dropcap\]::first-letter \{([^}]*)\}/.exec(css)![1];
    expect(base).toContain("float: inline-start;");
    expect(base).toContain("font-family: var(--font-heading);");
    expect(base).toContain("color: var(--color-primary);");
    const guard = block(css, "@supports (initial-letter: 3)");
    expect(guard).toContain("initial-letter: 3;");
    expect(guard).toContain("float: none;");
  });

  it("the reference page shows all three", () => {
    const html = read("text", "html");
    expect(html).toContain('data-size="display"');
    expect(html).toContain('data-variant="eyebrow"');
    expect(html).toContain("data-dropcap");
  });
});

describe("separator · ornament", () => {
  const css = cssOf("separator");

  it("every ornament rule excludes the vertical variant, which keeps its solid line", () => {
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => s.includes('[data-style="ornament"]'));
    expect(selectors.length).toBeGreaterThan(6);
    for (const list of selectors) {
      for (const s of list.split(/,\s*\n?/)) expect(s, s).toContain(':not([data-variant="vertical"])');
    }
  });

  it("an hr is two fading rules and a primary diamond drawn by ::before", () => {
    const root = /hr\[data-ui="separator"\]\[data-style="ornament"\]:not\(\[data-variant="vertical"\]\) \{([^}]*)\}/.exec(css)![1];
    expect(root).toContain("linear-gradient(to right, transparent, var(--color-border))");
    expect(root).toContain("linear-gradient(to left, transparent, var(--color-border))");
    const diamond = /hr\[data-ui="separator"\]\[data-style="ornament"\]:not\(\[data-variant="vertical"\]\)::before \{([^}]*)\}/.exec(css)![1];
    expect(diamond).toContain('content: "";');
    expect(diamond).toContain("background: var(--color-primary);");
    expect(diamond).toContain("rotate: 45deg;");
  });

  it("a labelled div keeps the label in the middle; the diamond version needs :has(label) to be absent", () => {
    expect(css).toContain(':not(:has(> [data-part="label"]))::before');
    expect(css).toContain(':not(:has(> [data-part="label"]))::after {\n  display: none;');
    // The label-version fades are the div's own ::before / ::after, mirrored for rtl.
    expect(css).toContain(":dir(rtl)::before");
    // :has() is never in a selector list with the hr: one unparseable selector would drop it.
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      if (m[1].includes(":has(")) expect(m[1].includes(","), m[1]).toBe(false);
    }
  });

  it("forced colours reduce it to system-colour rules", () => {
    const forced = block(css, "@media (forced-colors: active)");
    expect(forced).toContain("CanvasText");
    expect(forced).toContain("background-image: none;");
  });

  it("the reference page shows an hr, a labelled div, a label-less div and the vertical fallback", () => {
    const html = read("separator", "html");
    const roots = extractComponents(html, "fragment.html").filter((c) => c.name === "separator" && c.root.attrs["data-style"] === "ornament");
    expect(roots.length).toBe(4);
    expect(roots.some((r) => r.root.tag === "hr" && !r.root.attrs["data-variant"])).toBe(true);
    expect(roots.some((r) => r.root.tag === "div" && r.root.children.some((c) => c.attrs["data-part"] === "label"))).toBe(true);
    expect(roots.some((r) => r.root.attrs["data-variant"] === "vertical")).toBe(true);
    // No text content on the unlabelled ornaments.
    expect(html).toContain('role="separator"></div>');
  });
});

describe("stamp · the rubber-stamp mark", () => {
  const css = cssOf("stamp");
  const m = manifest("stamp");
  const html = read("stamp", "html");

  it("is a marketing primitive with no controller", () => {
    expect(m.kind).toBe("primitive");
    expect(m.category).toBe("marketing");
    expect(m.files.js).toBeUndefined();
  });

  it("declares its variants, sizes, shape and angle", () => {
    expect(m.variants?.visual.values).toEqual(["default", "primary", "destructive", "success"]);
    expect(m.variants?.size.values).toEqual(["sm", "md", "lg"]);
    expect(m.variants?.size.default).toBe("md");
    expect(m.props?.shape.values).toEqual(["rect", "round"]);
    expect(m.props?.shape.default).toBe("rect");
    expect(m.props?.["--stamp-rotate"]?.default).toBe("-6deg");
  });

  it("is uppercase, wide-tracked, bold, in a double rule and rotated by the knob", () => {
    const root = /\[data-ui="stamp"\] \{([^}]*)\}/.exec(css)![1];
    // Block-level, as wide as its word: the rhythm layer treats an atomic inline root
    // as a separate case (src/utils/layout.ts), and a stamp always sits on its own line.
    expect(root).toContain("display: flex;");
    expect(root).toContain("inline-size: fit-content;");
    expect(root).toContain("text-transform: uppercase;");
    expect(root).toContain("font-weight: var(--weight-bold);");
    expect(root).toContain("border: var(--border-width-lg) double var(--faqir-stamp-ink);");
    expect(root).toContain("rotate: var(--stamp-rotate, -6deg);");
    expect(root).toContain("border-radius: var(--radius-sm);");
  });

  it("the variants only set the ink, from the semantic colour tokens", () => {
    expect(css).toContain('[data-variant="primary"] {\n  --faqir-stamp-ink: var(--color-primary);');
    expect(css).toContain('[data-variant="destructive"] {\n  --faqir-stamp-ink: var(--color-destructive);');
    expect(css).toContain('[data-variant="success"] {\n  --faqir-stamp-ink: var(--color-success);');
  });

  it("round is a square disc that wraps its text", () => {
    const round = /\[data-shape="round"\] \{([^}]*)\}/.exec(css)![1];
    expect(round).toContain("aspect-ratio: 1;");
    expect(round).toContain("border-radius: var(--radius-full);");
    expect(round).toContain("white-space: normal;");
  });

  it("has no animation, so nothing needs a reduced-motion twin", () => {
    expect(hasAnimationProperties(read("stamp", "css"))).toBe(false);
  });

  it("the reference page demonstrates every variant, size and shape, as real text", () => {
    const roots = extractComponents(html, "fragment.html").filter((c) => c.name === "stamp");
    const seen = (attr: string) => new Set(roots.map((r) => r.root.attrs[attr]));
    for (const v of m.variants!.visual.values.filter((v) => v !== "default")) expect(seen("data-variant").has(v)).toBe(true);
    for (const s of ["sm", "lg"]) expect(seen("data-size").has(s)).toBe(true);
    expect(seen("data-shape").has("round")).toBe(true);
    for (const root of roots) {
      expect(root.root.tag).toBe("span");
      expect(root.root.children).toHaveLength(0);
    }
    expect(html).toContain("Sold out");
  });
});
