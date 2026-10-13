// Regressions for the final review's findings (docs/template.md §4, §8.2,
// §10.2, §11.7, §12, §14.2, §15.1): attribute names by case and by character,
// URL attributes by prefix, attributes that take no data, raw-text parents,
// array reads in `each`, the island's arrays, comments in script, nested
// layout blocks, damaged ASTs and render options.
import { describe, expect, it } from "bun:test";
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";
import { codes, html, memoryLoader, ok, renderCode } from "./helpers";

describe("attribute names", () => {
  it("treats faqir-core and on* attributes case-insensitively", () => {
    expect(codes("span(L-TEXT=page.x)")).toEqual(["directive-interpolation"]);
    expect(codes("span(:Title=page.x)")).toEqual(["directive-interpolation"]);
    expect(codes("img(ONERROR='x')")).toEqual(["event-attr"]);
    expect(html("span(L-TEXT='count')")).toContain("@ui:requires faqir-core.js");
    expect(codes("a(href='x' HREF='y')")).toEqual(["duplicate-attr"]);
  });

  it("allows only name characters, so no name can hide another", () => {
    for (const src of ["div(x/onclick='a()')", "div(x/l-html=v)", "div(x><i=v)", "div(a`b='c')"]) {
      expect(codes(src)).toContain("bad-attr");
    }
    expect(html("div(l-on:click.prevent='go()' @keydown.enter='go()' data-x_y='1')")).toContain('l-on:click.prevent="go()"');
  });

  it("checks URL attributes whatever their case or namespace prefix", () => {
    for (const attr of ["HREF", "Src", "xlink:href", "FormAction"]) {
      expect(renderCode(`a(${attr}=u)`, { u: "javascript:alert(1)" })).toBe("unsafe-url");
    }
  });

  it("refuses data in srcdoc, style and SVG animation values", () => {
    for (const attr of ["srcdoc", "style", "to", "from", "values", "by", "SRCDOC"]) {
      expect(codes(`x(${attr}=v)`)).toEqual(["unsafe-attr"]);
      expect(codes(`x(${attr}='a {{ v }}')`)).toEqual(["unsafe-attr"]);
    }
    expect(html("div(style='color: red')")).toBe('<div style="color: red"></div>\n');
  });

  it("escapes < and > in attributes, so a raw-text parent cannot be closed", () => {
    const out = html("noscript\n  a(title=v)", { v: "</noscript><img src=x onerror=alert(1)>" });
    const template = document.createElement("template");
    template.innerHTML = out;
    expect(template.content.querySelectorAll("img")).toHaveLength(0);
    expect(out).toContain("&lt;/noscript&gt;");
  });
});

describe("each reads own data only", () => {
  it("never runs an index getter", () => {
    let ran = false;
    const xs = ["a"];
    Object.defineProperty(xs, 1, { get: () => { ran = true; return "b"; }, enumerable: true });
    expect(renderCode("each x in xs\n  | {{ x }}", { xs })).toBe("type");
    expect(ran).toBe(false);
  });

  it("reports a hole in a sparse array as missing", () => {
    expect(renderCode("each x in xs\n  | {{ x }}", { xs: [1, , 3] })).toBe("missing");
  });
});

describe("the island", () => {
  it("refuses an array whose prototype is not Array.prototype", () => {
    let ran = false;
    const xs = Object.setPrototypeOf([1], Object.assign(Object.create(Array.prototype), { toJSON: () => { ran = true; return []; } }));
    expect(renderCode("div(l-data=json(s))", { s: { xs } })).toBe("json-value");
    expect(ran).toBe(false);
  });
});

describe("compile never throws for a template", () => {
  it("reports a comment inside script instead of throwing", () => {
    expect(codes("script\n  // hi\n")).toEqual(["script-content"]);
  });

  it("finds a block nested inside a block the page also replaces", () => {
    const loader = memoryLoader({ "l.faqir": "block outer\n  div\n    block inner\n      | default\n" });
    expect(codes('layout "l.faqir"\nblock outer\n  p o\nblock inner\n  p i\n', { loader })).toEqual([]);
    const dup = memoryLoader({ "d.faqir": "block outer\n  block outer\n    | x\n" });
    expect(codes('layout "d.faqir"\nblock outer\n  p o\n', { loader: dup })).toEqual(["duplicate-block"]);
  });

  it("compiles a line of many attributes in linear time", () => {
    const attrs = Array.from({ length: 40000 }, (_, i) => `a${i}`).join(" ");
    const start = Date.now();
    expect(compile(`div(${attrs})`).diagnostics).toEqual([]);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});

describe("render refuses damaged input with codes, not crashes", () => {
  it("names a damaged AST bad-ast", () => {
    const ast = ok("p x");
    expect(() => render({ ...ast, partials: undefined } as any)).toThrow(expect.objectContaining({ code: "bad-ast" }));
    expect(() => render({ ...ast, requires: undefined } as any)).toThrow(expect.objectContaining({ code: "bad-ast" }));
    let deep: any = { type: "Literal", value: "x" };
    for (let i = 0; i < 100000; i++) deep = { type: "Unary", op: "!", arg: deep };
    const bad = { ...ast, body: [{ type: "Text", parts: [{ expr: deep }], loc: [0, 1, 1] }] };
    expect(() => render(bad as any)).toThrow(expect.objectContaining({ code: "bad-ast" }));
  });

  it("validates its options", () => {
    const ast = ok("p x");
    for (const options of [{ maxOutput: NaN }, { maxOutput: "1" }, { maxSteps: 0 }, { maxSteps: 1.5 }, { idPrefix: 3 }, { helpers: null }]) {
      expect(() => render(ast, {}, options as any)).toThrow(TypeError);
    }
  });
});
