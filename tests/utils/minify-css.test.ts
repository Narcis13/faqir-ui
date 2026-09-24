/**
 * `minifyCSS` — the `bundle.minify` path of `faqir bundle`.
 *
 * The first version was a chain of regexes that stripped the space around
 * `+` wherever it stood, so `calc(-0.01em + var(--heading-tracking))` in
 * `text.css` came out as `calc(-0.01em+var(--heading-tracking))` — invalid, so
 * the browser dropped the heading's letter-spacing in every minified bundle. It
 * also glued a descendant `:hover` onto its compound (`a :hover` → `a:hover`)
 * and edited the inside of strings. Pinned here: the cases, and a sweep that
 * minifies every stylesheet the registry ships and checks every math function
 * kept its operators spaced.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { minifyCSS } from "../../src/utils/bundler";

const REGISTRY = join(import.meta.dir, "../../registry");

describe("minifyCSS", () => {
  it("keeps the spaces a math function's + and - require", () => {
    expect(minifyCSS("h1 { letter-spacing: calc(-0.01em + var(--x)); }")).toBe(
      "h1{letter-spacing:calc(-0.01em + var(--x))}",
    );
    expect(minifyCSS("a { width: min(10px + 1em, max(2px - 1px, 3px)); }")).toBe(
      "a{width:min(10px + 1em,max(2px - 1px,3px))}",
    );
    expect(minifyCSS("a { width: calc( 100% - ( 2 * var(--g) ) ); }")).toBe("a{width:calc(100% - (2 * var(--g)))}");
  });

  it("still tightens the + > ~ combinators outside a math function", () => {
    expect(minifyCSS("a > b + c ~ d , e { margin: 0 }")).toBe("a>b+c~d,e{margin:0}");
    expect(minifyCSS(":is(a + b) { x: y }")).toBe(":is(a+b){x:y}");
  });

  it("keeps a descendant combinator in front of a pseudo-class", () => {
    expect(minifyCSS("[data-ui] :focus-visible { outline: 0 }")).toBe("[data-ui] :focus-visible{outline:0}");
  });

  it("copies strings verbatim and drops comments", () => {
    expect(minifyCSS('/* c */ .x { content: "a  ;  b /* c */"; }  /* d */')).toBe('.x{content:"a  ;  b /* c */"}');
  });

  it("keeps the space a media query's `and (` needs", () => {
    expect(minifyCSS("@media screen and (min-width: 600px) { a { color: red; } }")).toBe(
      "@media screen and (min-width:600px){a{color:red}}",
    );
  });

  it("every math function in every registry stylesheet survives minification", () => {
    const files = [...new Bun.Glob("**/*.css").scanSync({ cwd: REGISTRY })].filter((f) => !f.startsWith("themes/"));
    expect(files.length).toBeGreaterThan(80);
    let checked = 0;
    for (const file of files) {
      const out = minifyCSS(readFileSync(join(REGISTRY, file), "utf8"));
      for (const m of out.matchAll(/\b(?:calc|min|max|clamp)\(/g)) {
        // The balanced extent of this call.
        let depth = 0;
        let end = m.index! + m[0].length - 1;
        for (; end < out.length; end++) {
          if (out[end] === "(") depth++;
          else if (out[end] === ")" && --depth === 0) break;
        }
        const call = out.slice(m.index!, end + 1);
        // A binary + always has a space on both sides; a `-` in a name or a
        // negative literal is not an operator, so only `+` is checkable.
        expect(call, `${file}: ${call}`).not.toMatch(/[^\s(]\+|\+[^\s\d.(]/);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
