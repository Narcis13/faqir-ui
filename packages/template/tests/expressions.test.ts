// Piece 3 — expressions (docs/template.md §8): paths, literals, operators,
// helpers, safe property access, and a table of hostile inputs, each of which
// must end in a diagnostic or a render error — never in code running, a
// prototype read, or a hang.
import { describe, expect, it } from "bun:test";
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";
import { html, ok, renderCode } from "./helpers";

const show = (expr: string, data: Record<string, unknown> = {}, helpers: Record<string, (...a: any[]) => unknown> = {}) =>
  html(`p {{ ${expr} }}`, data, { helpers: Object.keys(helpers) }, { helpers }).replace(/^<p>|<\/p>\n$/g, "");

describe("values and operators", () => {
  it("reads paths, indexes and computed keys", () => {
    const data = { page: { steps: [{ title: "One" }, { title: "Two" }], key: "title", n: 1 } };
    expect(show("page.steps[0].title", data)).toBe("One");
    expect(show("page.steps[page.n][page.key]", data)).toBe("Two");
    expect(show("page.steps.length", data)).toBe("2");
    expect(show("s[1]", { s: "abc" })).toBe("b");
  });

  it("evaluates literals and arithmetic", () => {
    expect(show("1 + 2 * 3 - 4 / 2 % 3")).toBe("5");
    expect(show("-(2) + 1.5e1")).toBe("13");
    expect(show("'a' + 1 + 2")).toBe("a12");
    expect(show("1 + 2 + 'a'")).toBe("3a");
    expect(show("true")).toBe("true");
  });

  it("compares strictly", () => {
    expect(show("1 == 1 && 'a' != 'b' && 2 >= 2 && 'a' < 'b'")).toBe("true");
    expect(show("1 == '1'")).toBe("false");
  });

  it("short-circuits || && and the ternary", () => {
    expect(show("x || 'd'", { x: "" })).toBe("d");
    expect(show("x && missing.thing", { x: 0 })).toBe("0");
    expect(show("x ? 'y' : missing", { x: 1 })).toBe("y");
  });

  it("?? asks for an optional value", () => {
    expect(show("page.subtitle ?? 'none'", { page: {} })).toBe("none");
    expect(show("page.a.b.c ?? 'deep'", { page: {} })).toBe("deep");
    expect(show("x ?? 'null'", { x: null })).toBe("null");
    expect(show("x ?? 'no'", { x: 0 })).toBe("0");
    expect(show("nothing ?? 'free'")).toBe("free");
  });

  it("calls registered helpers with evaluated arguments", () => {
    expect(show("upper(a, '!')", { a: "hi" }, { upper: (s: string, t: string) => s.toUpperCase() + t })).toBe("HI!");
  });

  it("reports unknown helpers at compile time and missing or failing ones at render time", () => {
    expect(compile("p {{ nope(1) }}").diagnostics[0].code).toBe("unknown-helper");
    expect(renderCode("p {{ f(1) }}", {}, { helpers: ["f"] })).toBe("helper-error");
    const boom = () => { throw new Error("boom"); };
    expect(() => render(ok("p {{ f() }}", { helpers: ["f"] }), {}, { helpers: { f: boom } })).toThrow(/boom/);
  });
});

describe("render errors name the path and the line", () => {
  it("missing", () => {
    try {
      render(ok("div\n  p {{ page.steps[0].title }}", { file: "x.faqir" }), { page: { steps: [] } });
      throw new Error("rendered");
    } catch (error: any) {
      expect(error.code).toBe("missing");
      expect(error.path).toBe("page.steps[0].title");
      expect([error.file, error.line]).toEqual(["x.faqir", 2]);
    }
  });

  const cases: [string, string, Record<string, unknown>][] = [
    ["missing", "p {{ nope }}", {}],
    ["type", "p {{ x.y }}", { x: null }],
    ["type", "p {{ x.y }}", { x: 5 }],
    ["type", "p {{ 1 < 'a' }}", {}],
    ["type", "p {{ x + 1 }}", { x: [1] }],
    ["type", "p {{ 1 / 0 }}", {}],
    ["type", "p {{ -x }}", { x: "a" }],
    ["type", "p {{ x[k] }}", { x: {}, k: true }],
    ["not-text", "p {{ x }}", { x: { a: 1 } }],
    ["not-text", "p {{ x }}", { x: null }],
    ["not-text", "a(href=x)", { x: [] }],
  ];
  for (const [code, source, data] of cases) {
    it(`${code}: ${source} with ${JSON.stringify(data)}`, () => expect(renderCode(source, data)).toBe(code));
  }
});

describe("hostile inputs", () => {
  // Data a host might pass on from somewhere else.
  const proto = JSON.parse('{"__proto__": {"polluted": "yes"}, "a": 1}');
  const getter = Object.defineProperty({}, "secret", { get: () => { throw new Error("getter ran"); }, enumerable: true });
  class Thing { method() { return "ran"; } }

  const renderCases: [string, string, Record<string, unknown>, string][] = [
    ["computed __proto__ key", "p {{ x[k] }}", { x: {}, k: "__proto__" }, "type"],
    ["computed constructor key", "p {{ x[k] }}", { x: {}, k: "constructor" }, "type"],
    ["computed prototype key", "p {{ x[k] }}", { x: () => 1, k: "prototype" }, "type"],
    ["inherited property", "p {{ x.toString }}", { x: {} }, "missing"],
    ["inherited via JSON __proto__", "p {{ x.polluted }}", { x: proto }, "missing"],
    ["getter is never run", "p {{ x.secret }}", { x: getter }, "type"],
    ["class method is not data", "p {{ x.method }}", { x: new Thing() }, "missing"],
    ["function value", "p {{ f }}", { f: () => "ran" }, "not-text"],
    ["reading a function's property", "p {{ f.name }}", { f: () => "ran" }, "type"],
    ["string index out of range", "p {{ s[10] }}", { s: "abc" }, "missing"],
    ["non-plain object in each", "each x in m\n  | x", { m: new Map([["a", 1]]) }, "type"],
    ["string in each", "each x in s\n  | x", { s: "abc" }, "type"],
  ];
  for (const [label, source, data, code] of renderCases) {
    it(`render: ${label}`, () => expect(renderCode(source, data)).toBe(code));
  }

  const compileCases: [string, string, string][] = [
    ["__proto__ path step", "p {{ a.__proto__.x }}", "forbidden-name"],
    ["prototype path step", "p {{ a.prototype }}", "forbidden-name"],
    ["constructor root", "p {{ constructor.name }}", "forbidden-name"],
    ["constructor helper", "p {{ constructor(1) }}", "forbidden-name"],
    ["giant number", "p {{ 1e400 }}", "bad-expr"],
    ["giant digit run", `p {{ ${"9".repeat(400)} }}`, "bad-expr"],
    ["deep parens", `p {{ ${"(".repeat(1000)}1${")".repeat(1000)} }}`, "expr-too-deep"],
    ["deep unary", `p {{ ${"-".repeat(1000)}1 }}`, "expr-too-deep"],
    ["deep ternary", `p {{ ${"a ? ".repeat(100)}1${" : 2".repeat(100)} }}`, "expr-too-deep"],
    ["unterminated hole", "p {{ a", "bad-hole"],
    ["unterminated hole at end", "p a {{", "bad-hole"],
    ["unterminated string in hole", "p {{ 'abc }}", "bad-string"],
    ["eval is just an unknown helper", "p {{ eval('1') }}", "unknown-helper"],
    ["Function is just an unknown helper", "p {{ Function('x') }}", "unknown-helper"],
    ["no member calls", "p {{ a.b() }}", "bad-expr"],
    ["no assignment", "p {{ a = 1 }}", "bad-expr"],
    ["no object literal", "p {{ {} }}", "bad-expr"],
    ["no array literal", "p {{ [1] }}", "bad-expr"],
    ["no template literal", "p {{ `x` }}", "bad-expr"],
    ["no code line", "- var x = 1", "bad-line"],
  ];
  for (const [label, source, code] of compileCases) {
    it(`compile: ${label}`, () => expect(compile(source).diagnostics.map((d) => d.code)).toContain(code));
  }

  it("a computed key read never touches Object.prototype", () => {
    const before = Object.keys(Object.prototype).length;
    expect(renderCode("p {{ x[k] ?? 'safe' }}", { x: {}, k: "__proto__" })).toBe("type");
    expect(Object.keys(Object.prototype).length).toBe(before);
  });
});
