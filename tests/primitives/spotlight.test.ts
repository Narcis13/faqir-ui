// ═══════════════════════════════════════════════════════════════════════════
// spotlight — a CSS-only hover light (docs/landing-craft.md)
// ═══════════════════════════════════════════════════════════════════════════
//
// It began as a recipe with a pointer controller. The controller cost the engine
// bundle more than its size budget had left, so the light became CSS: it fades
// in on :hover and :focus-within at --spotlight-x / --spotlight-y, and a page
// that wants it to follow the pointer feeds those two properties from one
// @pointermove directive. What is pinned here:
//   • the stylesheet: tokens only, a pointer-events-none decoration behind the
//     media conditions that make it appropriate, gone in reduced motion, forced
//     colours and print, the border ring;
//   • the manifest: a primitive with no controller, every knob declared;
//   • the follow template: it writes the two position properties and nothing else.

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
} from "../../src/parser/css-parser";

const DIR = join(import.meta.dir, "../../registry/primitives/spotlight");
const read = (ext: string) => readFileSync(join(DIR, `spotlight.${ext}`), "utf8");
const css = read("css").replace(/\/\*[\s\S]*?\*\//g, "");
const manifest = JSON.parse(read("manifest.json")) as Manifest & Record<string, any>;
const html = read("html");

/** The body of the first @media block whose prelude contains `needle`. */
function block(needle: string): string {
  const at = css.indexOf(needle);
  expect(at, needle).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("unbalanced");
}

describe("spotlight.css", () => {
  it("has no hardcoded colours, classes, ids or !important, and is logical", () => {
    expect(findHardcodedColorValues(css)).toEqual([]);
    expect(findClassSelectors(css)).toEqual([]);
    expect(findIdSelectors(css)).toEqual([]);
    expect(findImportantDeclarations(css)).toEqual([]);
    expect(findLogicalPropertyViolations(css)).toEqual([]);
  });

  it("paints nothing outside the effect's media conditions", () => {
    const outside = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    expect(outside).not.toContain("::after");
    expect(outside).not.toContain("background");
  });

  const effect = block("prefers-reduced-motion: no-preference");

  it("runs only for a fine, hovering pointer with no reduced-motion request, outside forced colours", () => {
    const prelude = css.slice(css.indexOf("@media screen"), css.indexOf("{", css.indexOf("@media screen")));
    for (const condition of ["prefers-reduced-motion: no-preference", "hover: hover", "pointer: fine", "forced-colors: none"]) {
      expect(prelude).toContain(condition);
    }
  });

  it("is a pointer-events-none pseudo-element, invisible until hover or focus-within", () => {
    const after = /\[data-ui="spotlight"\]::after \{([^}]*)\}/.exec(effect)![1];
    expect(after).toContain("pointer-events: none;");
    expect(after).toContain("opacity: 0;");
    expect(after).toContain("var(--spotlight-x, 50%) var(--spotlight-y, 0%)");
    expect(after).toContain("var(--faqir-spotlight-color)");
    expect(effect).toMatch(/\[data-ui="spotlight"\]:hover::after,\s*\[data-ui="spotlight"\]:focus-within::after \{\s*opacity: var\(--spotlight-opacity, 0\.18\);/);
  });

  it("the colour defaults to the primary token", () => {
    expect(css).toContain("--faqir-spotlight-color: var(--spotlight-color, var(--color-primary));");
  });

  it("border variant masks the light down to a ring, lit more strongly", () => {
    expect(effect).toContain('[data-ui="spotlight"][data-variant="border"]::after');
    expect(effect).toContain("mask: linear-gradient(black 0 0) content-box exclude, linear-gradient(black 0 0);");
    expect(effect).toContain("opacity: min(1, calc(var(--spotlight-opacity, 0.18) * 5));");
  });

  it("reduced motion, forced colours and print drop the light", () => {
    const off = block("(prefers-reduced-motion: reduce), (forced-colors: active), print");
    expect(off).toMatch(/\[data-ui="spotlight"\]::after \{[^}]*display: none;/);
  });

  it("every knob it reads is a declared prop with a default", () => {
    const knobs = new Set([...css.matchAll(/var\(\s*(--spotlight-[a-z-]+)/g)].map((m) => m[1]));
    for (const knob of knobs) {
      expect(manifest.props?.[knob], knob).toBeDefined();
      expect(manifest.props?.[knob]?.default, knob).toBeDefined();
    }
  });
});

describe("spotlight.manifest.json", () => {
  it("passes validateManifest", () => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it("is a CSS-only marketing primitive", () => {
    expect(manifest.kind).toBe("primitive");
    expect(manifest.category).toBe("marketing");
    expect(manifest.files.js).toBeUndefined();
    expect(manifest.api).toBeUndefined();
  });

  it("declares the two effects, light by default", () => {
    expect(manifest.variants.effect.values).toEqual(["light", "border"]);
    expect(manifest.variants.effect.default).toBe("light");
  });

  it("is truthful about a11y: decoration, focus-within, the contrast cost, what turns it off", () => {
    const notes = (manifest.a11y as { notes?: string }).notes as string;
    for (const phrase of ["Decoration only", ":focus-within", "contrast", "prefers-reduced-motion: reduce", "forced colours"]) {
      expect(notes).toContain(phrase);
    }
  });

  it("the follow template writes only the two position properties, on the wrapper", () => {
    const follow = manifest.templates.html_follow as string;
    const handler = /@pointermove="([^"]*)"/.exec(follow)![1];
    const written = [...handler.matchAll(/setProperty\('([^']+)'/g)].map((m) => m[1]);
    expect(written).toEqual(["--spotlight-x", "--spotlight-y"]);
    expect(handler).not.toMatch(/preventDefault|stopPropagation|focus\(|tabindex/);
    expect(handler.match(/\$this/g)!.length).toBe(3);
  });
});

describe("spotlight.html", () => {
  it("demonstrates both effects, the follow directive, and a grid lit as one surface", () => {
    expect(html).toContain('<div data-ui="spotlight">');
    expect(html).toContain('data-variant="border"');
    expect(html).toContain("@pointermove=\"const r = $this.getBoundingClientRect();");
    expect(html).toMatch(/data-ui="spotlight"[^>]*--spotlight-radius: 0[\s\S]*?data-ui="grid"/);
    expect(html).not.toContain("tilt");
  });
});
