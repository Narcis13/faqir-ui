// Piece 2 — the lexer and parser (docs/template.md §3–§7, §9 syntax): every
// construct, positions, and every syntax diagnostic code.
import { describe, expect, it } from "bun:test";
import { compile } from "../src/index.js";
import { codes, html, ok } from "./helpers";

describe("constructs", () => {
  it("parses elements with #id, attributes and inline text", () => {
    const ast = ok('a#home(href="/" data-x=page.x, disabled) Home {{ page.name }}');
    const a = ast.body[0] as any;
    expect(a.type).toBe("Element");
    expect(a.tag).toBe("a");
    expect(a.attrs.map((x: any) => x.name)).toEqual(["id", "href", "data-x", "disabled"]);
    expect(a.attrs[0].value).toEqual({ parts: ["home"] });
    expect(a.attrs[2].value.expr).toEqual({ type: "Path", root: "page", keys: ["x"] });
    expect(a.attrs[3].value).toBe(true);
    expect(a.children[0].parts[0]).toBe("Home ");
    expect(a.children[0].parts[1].expr.root).toBe("page");
    expect(a.loc).toEqual([0, 1, 1]);
  });

  it("parses piped text, a doctype and both comment kinds", () => {
    const ast = ok("doctype html\n//- hidden\n  also hidden\n// shown\np\n  | one\n  |\n");
    expect((ast.body as any[]).map((n) => n.type)).toEqual(["Doctype", "Comment", "Element"]);
    expect((ast.body[1] as any).text).toBe(" shown ");
    expect((ast.body[2] as any).children.map((t: any) => t.parts)).toEqual([["one"], []]);
  });

  it("keeps comment and raw blocks verbatim, blank lines included", () => {
    const ast = ok("//\n  a\n\n    b\nraw\n  <p>x</p>\n\n  <i>\nraw page.html\n");
    expect((ast.body[0] as any).text).toBe("\na\n\n  b\n");
    expect((ast.body[1] as any).text).toBe("<p>x</p>\n\n<i>");
    expect((ast.body[2] as any).expr).toEqual({ type: "Path", root: "page", keys: ["html"] });
  });

  it("groups if / else if / else and each / else", () => {
    const ast = ok("if a\n  | 1\nelse if b\n  | 2\nelse\n  | 3\neach x, i in xs\n  | {{ x }}\nelse\n  | none\neach k in o\n  | {{ k }}\n");
    const [iff, each, each2] = ast.body as any[];
    expect(iff.branches.map((b: any) => b.test && b.test.root)).toEqual(["a", "b", null]);
    expect(each.names).toEqual(["x", "i"]);
    expect(each.else).toHaveLength(1);
    expect(each2.names).toEqual(["k"]);
  });

  it("parses `\\{{` as a literal and `}}` inside a hole's string", () => {
    expect(html('p \\{{ x }} {{ "}}" }}')).toBe("<p>{{ x }} }}</p>\n");
  });

  it("accepts CRLF line ends and any consistent step", () => {
    expect(html("ul\r\n    li a\r\n    li b\r\n")).toBe("<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>\n");
  });

  it("parses expressions with precedence, ternary, ?? and calls", () => {
    const ast = ok("p {{ a + b * c ?? d ? e : f(g, h[0]) }}", { helpers: ["f"] });
    const expr = (ast.body[0] as any).children[0].parts[0].expr;
    expect(expr.type).toBe("Cond");
    expect(expr.test.op).toBe("??");
    expect(expr.test.left.op).toBe("+");
    expect(expr.test.left.right.op).toBe("*");
    expect(expr.else).toEqual({ type: "Call", name: "f", args: [{ type: "Path", root: "g", keys: [] }, { type: "Path", root: "h", keys: [{ type: "Literal", value: 0 }] }] });
  });
});

describe("syntax diagnostics", () => {
  const cases: [string, string][] = [
    ["tab-indent", "div\n\tp x\n"],
    ["tab-indent", "raw\n \t<p>\n"],
    ["bad-indent", "div\n  p\n   span\n"],
    ["bad-indent", "div\n  p\n      span\n"],
    ["bad-indent", "raw\n    a\n  b\n"],
    ["too-deep", Array.from({ length: 70 }, (_, i) => `${" ".repeat(i)}div`).join("\n")],
    ["bad-line", "<p>hi</p>\n"],
    ["bad-line", "p\n  |x\n"],
    ["bad-line", "a(href='x')b\n"],
    ["bad-line", "each in xs\n"],
    ["bad-line", "else when\n"],
    ["bad-line", "+\n"],
    ["bad-line", "block\n"],
    ["bad-line", 'layout x.faqir\n'],
    ["bad-attr", "a(href='x'\n"],
    ["bad-attr", "a(=x)\n"],
    ["duplicate-attr", "a(href='x' href='y')\n"],
    ["duplicate-attr", "a#x(id='y')\n"],
    ["bad-string", 'p {{ "abc }}\n'],
    ["bad-string", "a(title='x\n"],
    ["bad-string", 'p {{ "a\\q" }}\n'],
    ["bad-hole", "p {{ }}\n"],
    ["bad-hole", "p {{ x\n"],
    ["bad-expr", "p {{ a b }}\n"],
    ["bad-expr", "if\n  | x\n"],
    ["bad-expr", "if a b\n  | x\n"],
    ["bad-expr", "p {{ 1e999 }}\n"],
    ["bad-expr", "p {{ xs.0 }}\n"],
    ["bad-expr", "p {{ (a }}\n"],
    ["expr-too-deep", `p {{ ${"(".repeat(40)}1${")".repeat(40)} }}\n`],
    ["expr-too-deep", `p {{ ${"!".repeat(40)}a }}\n`],
    ["forbidden-name", "p {{ a.__proto__ }}\n"],
    ["forbidden-name", "p {{ constructor }}\n"],
    ["forbidden-name", "each prototype in xs\n  | x\n"],
    ["forbidden-name", 'include "a.faqir" (__proto__=1)\n'],
    ["orphan-else", "else\n  | x\n"],
    ["orphan-else", "if a\n  | x\nelse\n  | y\nelse\n  | z\n"],
    ["orphan-else", "each x in xs\n  | x\nelse if a\n  | y\n"],
    ["void-children", "img(src='a.png') caption\n"],
    ["void-children", "br\n  | x\n"],
    ["bad-doctype", "doctype xml\n"],
    ["misplaced", "p\ndoctype html\n"],
    ["misplaced", "div\n  doctype html\n"],
    ["misplaced", "@title x\n"],
    ["misplaced", "p\n  | x\n    | y\n"],
    ["misplaced", 'include "a.faqir"\n  p x\n'],
    ["bad-comment", "// a -- b\n"],
    ["bad-comment", "// {{ x }}\n"],
    ["bad-comment", "// >x\n"],
    ["bad-comment", "//\n  x --> y\n"],
  ];
  for (const [code, source] of cases) {
    it(`${code}: ${JSON.stringify(source).slice(0, 50)}`, () => {
      expect(codes(source)).toContain(code);
    });
  }

  it("reports file, line and column", () => {
    const { diagnostics } = compile("div\n  p {{ a b }}\n", { file: "pages/x.faqir" });
    expect(diagnostics).toEqual([{ code: "bad-expr", message: expect.any(String), file: "pages/x.faqir", line: 2, col: 10 }]);
  });

  it("keeps going after an error and returns no ast", () => {
    const result = compile("<p>\nimg x\n");
    expect(result.ast).toBeNull();
    expect(result.diagnostics.map((d) => d.code)).toEqual(["bad-line", "void-children"]);
  });
});
