// Piece 4 — the renderer (docs/template.md §5, §6, §9, §11.6, §11.7, §12, §13):
// elements, attributes, text, escaping by context, control flow, the raw
// policy, limits, determinism, and an injection table in which every hostile
// string, in every context, must come out inert.
import { describe, expect, it } from "bun:test";
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";
import { codes, html, ok, renderCode } from "./helpers";

describe("elements, text and whitespace (§12.1)", () => {
  it("puts every node on its own line, text-only elements on one", () => {
    expect(html("ul\n  li a\n  li\n    | b\n    em c\n")).toBe("<ul>\n  <li>a</li>\n  <li>\n    b\n    <em>c</em>\n  </li>\n</ul>\n");
  });

  it("writes void elements without a closing tag and empty ones on one line", () => {
    expect(html("div\n  img(src='a.png' alt='')\n  br\n  span\n")).toBe('<div>\n  <img src="a.png" alt="">\n  <br>\n  <span></span>\n</div>\n');
  });

  it("adds nothing inside pre, textarea, script and style", () => {
    expect(html("pre\n  | a\n  |   b\n  code x\n")).toBe("<pre>a\n  b<code>x</code></pre>\n");
    expect(html("textarea(name='t')\n  | x\n  | y\n")).toBe('<textarea name="t">x\ny</textarea>\n');
    expect(html("style\n  | a > b { color: red }\n")).toBe("<style>a > b { color: red }</style>\n");
  });

  it("writes the doctype, then comments, then the rest", () => {
    expect(html("doctype html\n// note\nhtml\n")).toBe("<!doctype html>\n<!-- note -->\n<html></html>\n");
  });

  it("writes raw output exactly, without indentation (§12.5)", () => {
    expect(html("div\n  raw\n    <p>a</p>\n      <b>b</b>\n  raw x\n", { x: "<i>i</i>" })).toBe("<div>\n<p>a</p>\n  <b>b</b>\n<i>i</i>\n</div>\n");
  });
});

describe("attributes (§5)", () => {
  it("writes bare, literal, expression and boolean attributes", () => {
    const out = html("input(type='checkbox' checked=on disabled=off value=n data-x='a {{ s }}')", { on: true, off: false, n: 3, s: "b" });
    expect(out).toBe('<input type="checkbox" checked value="3" data-x="a b">\n');
  });

  it("passes every faqir-core attribute form through verbatim", () => {
    const src = "div(l-data='{ open: false }' l-on:click.prevent='open = !open' :data-state=\"open ? 'open' : 'closed'\" @keydown.escape.window='open = false' l-for='item in items' l-model.number='n' x-y)";
    expect(html(src)).toBe(
      '<!-- @ui:requires faqir-core.js -->\n<div l-data="{ open: false }" l-on:click.prevent="open = !open" :data-state="open ? \'open\' : \'closed\'" @keydown.escape.window="open = false" l-for="item in items" l-model.number="n" x-y></div>\n',
    );
  });

  it("refuses data in faqir-core attributes and any on* attribute", () => {
    expect(codes("span(l-text=page.x)")).toEqual(["directive-interpolation"]);
    expect(codes("span(l-text='{{ page.x }}')")).toEqual(["directive-interpolation"]);
    expect(codes("span(:title=page.x)")).toEqual(["directive-interpolation"]);
    expect(codes("button(@click=page.x)")).toEqual(["directive-interpolation"]);
    expect(codes("button(l-on:click.prevent='{{ x }}')")).toEqual(["directive-interpolation"]);
    expect(codes("button(onclick='go()')")).toEqual(["event-attr"]);
    expect(codes("img(onError=x)")).toEqual(["event-attr"]);
  });
});

describe("control flow (§9)", () => {
  it("renders if / else if / else", () => {
    const src = "if n > 1\n  | many\nelse if n == 1\n  | one\nelse\n  | none\n";
    expect([2, 1, 0].map((n) => html(src, { n }))).toEqual(["many\n", "one\n", "none\n"]);
  });

  it("renders each over arrays and objects, with else for empty", () => {
    const src = "each x, i in xs\n  | {{ i }}={{ x }}\nelse\n  | empty\n";
    expect(html(src, { xs: ["a", "b"] })).toBe("0=a\n1=b\n");
    expect(html(src, { xs: [] })).toBe("empty\n");
    expect(html("each k, v in o\n  | {{ k }}:{{ v }}\n", { o: { b: 1, a: 2 } })).toBe("b:1\na:2\n");
    expect(html("each k, v in o\n  | x\nelse\n  | none\n", { o: {} })).toBe("none\n");
  });

  it("scopes loop names to the loop body", () => {
    expect(html("each x in xs\n  | {{ x }}\n| {{ x }}\n", { xs: [1], x: "outer" })).toBe("1\nouter\n");
  });
});

describe("the l-data island (§11.7)", () => {
  it("writes JSON escaped for the attribute", () => {
    const out = html("div(l-data=json(state))", { state: { n: 1, s: '"</div><script>x</script>&' } });
    expect(out).toBe('<!-- @ui:requires faqir-core.js -->\n<div l-data="{&quot;n&quot;:1,&quot;s&quot;:&quot;\\&quot;</div><script>x</script>&amp;&quot;}"></div>\n');
  });

  it("refuses values that are not JSON data", () => {
    for (const state of [{ f: () => 1 }, { d: new Date(0) }, { n: NaN }, JSON.parse('{"__proto__": {"x": 1}}'), Object.defineProperty({}, "g", { get: () => 1, enumerable: true })]) {
      expect(renderCode("div(l-data=json(state))", { state })).toBe("json-value");
    }
    let deep: unknown = 1;
    for (let i = 0; i < 70; i++) deep = [deep];
    expect(renderCode("div(l-data=json(state))", { state: deep })).toBe("json-value");
  });

  it("keeps json() for the island only", () => {
    expect(codes("p {{ json(x) }}")).toEqual(["json-misplaced"]);
    expect(codes("div(data-x=json(x))")).toEqual(["json-misplaced"]);
    expect(codes("div(l-text=json(x))")).toEqual(["directive-interpolation"]);
  });
});

describe("script, style and raw (§12.3, §12.5)", () => {
  it("refuses holes and early closes in script and style", () => {
    expect(codes("script\n  | var x = {{ y }}\n")).toEqual(["script-content"]);
    expect(codes("style {{ css }}\n")).toEqual(["script-content"]);
    expect(codes("script\n  | a</script><b>\n")).toEqual(["script-content"]);
    expect(codes("script\n  p x\n")).toEqual(["script-content"]);
    expect(html("script(type='module')\n  | import './a.js';\n")).toBe("<script type=\"module\">import './a.js';</script>\n");
  });

  it("refuses raw under { raw: false }, in both forms", () => {
    expect(codes("raw x\n", { raw: false })).toEqual(["raw-refused"]);
    expect(codes("raw\n  <p>x</p>\n", { raw: false })).toEqual(["raw-refused"]);
    expect(renderCode("raw x\n", { x: 1 })).toBe("type");
  });
});

describe("limits (§13)", () => {
  it("stops at the output limit", () => {
    expect(renderCode("each x in xs\n  p {{ x }}\n", { xs: Array(100).fill("abcdefghij") }, {}, { maxOutput: 500 })).toBe("output-limit");
  });

  it("stops at the step limit, even with no output", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i);
    const src = "each a in xs\n  each b in xs\n    each c in xs\n      if false\n        | x\n";
    expect(renderCode(src, { xs }, {}, { maxSteps: 50_000 })).toBe("step-limit");
  });

  it("rejects an AST it does not know", () => {
    const ast = ok("p x");
    (ast.body as any[]).push({ type: "Script", code: "process.exit()" });
    expect(() => render(ast)).toThrow(expect.objectContaining({ code: "bad-ast" }));
  });
});

describe("determinism (§15.1)", () => {
  const src = "doctype html\nhtml\n  body(class=cls)\n    each x, i in xs\n      a(href=x.href l-text='label') {{ i }} {{ x.label }}\n    div(l-data=json(state))\n";
  const data = { cls: "c", xs: [{ href: "/a", label: "A" }, { href: "/b", label: "B&" }], state: { k: [1, 2] } };

  it("renders the same bytes twice", () => {
    const ast = ok(src);
    expect(render(ast, data)).toBe(render(ast, data));
  });

  it("renders the same bytes from a JSON round-tripped AST", () => {
    const ast = ok(src);
    expect(render(JSON.parse(JSON.stringify(ast)), data)).toBe(render(ast, data));
  });

  it("compiles to the same AST twice", () => {
    expect(JSON.stringify(compile(src))).toBe(JSON.stringify(compile(src)));
  });
});

describe("injection table: hostile strings are inert in every context", () => {
  const hostile = [
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "'><svg onload=alert(1)>",
    "{{ constructor }}",
    "&lt;b&gt;",
    "</textarea><script>x</script>",
    "--><script>x</script><!--",
    "`${x}`",
  ];
  // Each context renders one element; parsed back by an HTML parser, the
  // output must still be exactly that one element, holding the hostile string
  // as plain text or as an attribute value.
  const contexts: [string, string, (el: Element) => string | null, (v: string) => string][] = [
    ["text", "p {{ v }}", (el) => el.textContent, (v) => v],
    ["attribute expression", "a(title=v)", (el) => el.getAttribute("title"), (v) => v],
    ["attribute literal hole", "a(title='x {{ v }} y')", (el) => el.getAttribute("title"), (v) => `x ${v} y`],
    ["pre", "pre {{ v }}", (el) => el.textContent, (v) => v],
    ["textarea", "textarea {{ v }}", (el) => el.textContent, (v) => v],
  ];
  for (const value of hostile) {
    for (const [label, src, read, expected] of contexts) {
      it(`${label}: ${value}`, () => {
        const template = document.createElement("template");
        template.innerHTML = html(src, { v: value });
        const elements = template.content.querySelectorAll("*");
        expect(elements.length).toBe(1);
        expect(read(elements[0])).toBe(expected(value));
      });
    }
  }

  it("a hole's value is never parsed as a hole", () => {
    expect(html("p {{ v }}", { v: "{{ secret }}" })).toBe("<p>{{ secret }}</p>\n");
  });

  const urls: [string, boolean][] = [
    ["javascript:alert(1)", false],
    ["JaVaScRiPt:alert(1)", false],
    [" javascript:alert(1)", false],
    ["java\tscript:alert(1)", false],
    ["java\nscript:alert(1)", false],
    ["\u0001javascript:alert(1)", false],
    ["data:text/html,<script>x</script>", false],
    ["vbscript:msgbox", false],
    ["https://example.com/a?b=1&c=2", true],
    ["http://x", true],
    ["mailto:a@b.c", true],
    ["tel:+40", true],
    ["/relative/path:with-colon", true],
    ["#anchor", true],
    ["page.html", true],
  ];
  for (const [url, safe] of urls) {
    for (const attr of ["href", "src", "action", "formaction"]) {
      it(`${attr}=${JSON.stringify(url)} is ${safe ? "written" : "refused"}`, () => {
        expect(renderCode(`a(${attr}=u)`, { u: url })).toBe(safe ? "" : "unsafe-url");
        expect(renderCode(`a(${attr}='{{ u }}')`, { u: url })).toBe(safe ? "" : "unsafe-url");
      });
    }
  }

  it("a literal javascript: href is refused too", () => {
    expect(renderCode("a(href='javascript:void(0)') x")).toBe("unsafe-url");
  });
});
