// Authoring a real site with the language (docs/template.md §5, §6.1, §10.3,
// §11.3, §11.4, §12.1): inline elements and punctuation, element names and
// entities, partial parameters, repeating fills, fill arguments, optional
// parts left out, heading levels, and the component list a page draws.
import { describe, expect, it } from "bun:test";
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";
import { components } from "../src/registry.js";
import { KNOWN_TAGS } from "../src/tags.js";
import { KNOWN_ELEMENTS } from "../../../src/audit/known-elements";
import { codes, html, memoryLoader, ok } from "./helpers";

const table = components as any;
const opts = { components: table };
const run = (src: string, data: Record<string, unknown> = {}) => html(src, data, opts);
const fails = (src: string) => codes(src, opts);
const messages = (src: string) => compile(src, opts).diagnostics.map((d) => `${d.code}: ${d.message}`);

describe("inline elements (§6.1)", () => {
  it("keeps a sentence on one line, punctuation and all", () => {
    expect(html("p Run #[code npm ci], then #[a(href='/y') read #[em more]].\n")).toBe(
      '<p>Run <code>npm ci</code>, then <a href="/y">read <em>more</em></a>.</p>\n',
    );
  });

  it("works in piped text, starting on the line's own line", () => {
    expect(html("p\n  | Pass #[code --resume] to go on.\n  | Then stop.\n")).toBe(
      "<p>\n  Pass <code>--resume</code> to go on.\n  Then stop.\n</p>\n",
    );
  });

  it("takes holes, #id and attributes, and balances brackets", () => {
    expect(html("p #[code#c(title=t) {{ x }}[0]] done\n", { t: "T", x: "a" })).toBe('<p><code id="c" title="T">a[0]</code> done</p>\n');
  });

  it("escapes \\#[ and leaves a lone # alone", () => {
    expect(html("p \\#[not] #1 and #[b yes]\n")).toBe("<p>#[not] #1 and <b>yes</b></p>\n");
  });

  it("is literal text inside pre, textarea, script and style", () => {
    expect(html("pre\n  | #[derive(Debug)]\n")).toBe("<pre>#[derive(Debug)]</pre>\n");
    expect(html("pre #[x]\n")).toBe("<pre>#[x]</pre>\n");
  });

  it("checks inline elements like element lines", () => {
    expect(codes("p a #[nope b]\n")).toEqual(["unknown-tag"]);
    expect(codes("p a #[b(onclick='x()') b]\n")).toEqual(["event-attr"]);
    expect(codes("p a #[b unclosed\n")).toEqual(["bad-line"]);
    expect(codes("p a #[img x]\n")).toEqual(["void-children"]);
    expect(html("p a #[img(src='/i.png' alt='')] b\n")).toBe('<p>a <img src="/i.png" alt=""> b</p>\n');
  });

  it("is plain JSON: glue survives a round trip", () => {
    const ast = ok("p Run #[code x], then.\n");
    expect(render(JSON.parse(JSON.stringify(ast)), {})).toBe(render(ast, {}));
  });
});

describe("punctuation joins lines (§12.1 rule 2)", () => {
  it("puts no space before closing punctuation or after opening punctuation", () => {
    expect(html("p\n  | Run\n  code npm ci\n  | , then continue (\n  a(href='/d') docs\n  | ).\n")).toBe(
      '<p>\n  Run\n  <code>npm ci</code>, then continue (<a href="/d">docs</a>).\n</p>\n',
    );
  });

  it("leaves straight quotes, dashes and words on their own lines", () => {
    expect(html("p\n  code a\n  | 'b'\n  code c\n  | — d\n")).toBe("<p>\n  <code>a</code>\n  'b'\n  <code>c</code>\n  — d\n</p>\n");
  });

  it("joins text that starts with punctuation from a hole too", () => {
    expect(html("p\n  code a\n  | {{ x }}\n", { x: "; b" })).toBe("<p>\n  <code>a</code>; b\n</p>\n");
  });

  it("adds nothing inside pre", () => {
    expect(html("pre\n  | (a\n  | ).\n")).toBe("<pre>(a\n).</pre>\n");
  });
});

describe("element names (§5)", () => {
  it("refuses a name that is no element, with the missing pipe as the hint", () => {
    expect(messages("p\n  Open the app now\n")).toEqual([
      "unknown-tag: <Open> is not an HTML, SVG or MathML element, and a custom element needs a hyphen; if this is text, pipe it: \"| Open the app now\"",
    ]);
  });

  it("takes HTML, SVG and MathML names in any case, and custom elements", () => {
    expect(codes("svg\n  linearGradient\n  foreignObject\nmath\n  mi x\nx-card ok\nDIV ok\ncenter old\n")).toEqual([]);
  });

  it("holds the same list as the audit's unknown-element rule", () => {
    expect([...KNOWN_TAGS].sort()).toEqual([...KNOWN_ELEMENTS].sort());
  });
});

describe("entities in literal text (§6)", () => {
  it("refuses them in text and literal attributes, naming the character", () => {
    expect(messages("code claude --resume &lt;id&gt;\n")[0]).toContain('write "<" itself');
    expect(fails("p(title='a &amp; b') x\n")).toEqual(["literal-entity"]);
    expect(fails("p &#169; 2026\n")).toEqual(["literal-entity"]);
    expect(fails("p &mdash;\n")).toEqual(["literal-entity"]);
  });

  it("leaves a lone ampersand, holes and script content alone", () => {
    expect(html("p R&D; Q&A {{ e }}\n", { e: "&lt;" })).toBe("<p>R&amp;D; Q&amp;A &amp;lt;</p>\n");
    expect(codes("script\n  | var a = '&amp;';\n")).toEqual([]);
  });
});

describe("partial parameters (§10.3)", () => {
  const files = {
    "shot.faqir": 'params src phone=false caption="" width=phone ? "390" : "1280"\nfigure\n  img(src=src alt="" width=width)\n  if caption\n    figcaption {{ caption }}\n',
  };
  const loader = memoryLoader(files);

  it("fills defaults in order, each seeing the parameters before it", () => {
    expect(html('include "shot.faqir" (src="/a.png")\n', {}, { loader })).toBe('<figure>\n  <img src="/a.png" alt="" width="1280">\n</figure>\n');
    expect(html('include "shot.faqir" (src="/a.png" phone caption="Pairing")\n', {}, { loader })).toBe(
      '<figure>\n  <img src="/a.png" alt="" width="390">\n  <figcaption>Pairing</figcaption>\n</figure>\n',
    );
  });

  it("refuses an unknown parameter and a missing one at compile time", () => {
    expect(codes('include "shot.faqir" (src="/a" bogus=1)\n', { loader })).toEqual(["unknown-param"]);
    expect(codes('include "shot.faqir"\n', { loader })).toEqual(["missing-param"]);
  });

  it("belongs to a partial's first statement only", () => {
    expect(codes("params a\np x\n")).toEqual(["misplaced"]);
    expect(codes("p x\nparams a\n")).toEqual(["misplaced"]);
    expect(codes('include "p.faqir"\n', { loader: memoryLoader({ "p.faqir": "div\n  params a\n" }) })).toEqual(["misplaced"]);
    expect(codes("params\n")).toEqual(["bad-line"]);
    expect(codes("params constructor\n")).toEqual(["forbidden-name"]);
  });

  it("keeps working for a partial without params", () => {
    expect(html('include "p.faqir" (x="1")\n', {}, { loader: memoryLoader({ "p.faqir": "p {{ x }}\n" }) })).toBe("<p>1</p>\n");
  });
});

describe("repeating fills (§11.4)", () => {
  it("repeats a part once per fill, with fills of its own parts", () => {
    expect(run("+timeline\n  @item\n    @title Install\n  @item\n    @title Pair\n    @description Scan it.\n")).toBe(
      '<ol data-ui="timeline">\n  <li data-part="item">\n    <span data-part="marker" aria-hidden="true"></span>\n    <div data-part="content">\n      <p data-part="title">Install</p>\n    </div>\n  </li>\n' +
        '  <li data-part="item">\n    <span data-part="marker" aria-hidden="true"></span>\n    <div data-part="content">\n      <p data-part="title">Pair</p>\n      <p data-part="description">Scan it.</p>\n    </div>\n  </li>\n</ol>\n',
    );
  });

  it("numbers paired ids per copy, through each, selecting the first", () => {
    const out = run("+tabs(id='tb')\n  each t in tabs\n    @trigger {{ t }}\n    @panel\n      p {{ t }}\n", { tabs: ["A", "B", "C"] });
    expect(out).toContain('<button data-part="trigger" role="tab" id="tb-tab-1" aria-controls="tb-panel-1" aria-selected="true">A</button>');
    expect(out).toContain('<button data-part="trigger" role="tab" id="tb-tab-3" aria-controls="tb-panel-3" aria-selected="false" tabindex="-1">C</button>');
    expect(out).toContain('<div data-part="panel" role="tabpanel" id="tb-panel-1" aria-labelledby="tb-tab-1">');
    expect(out).toContain('<div data-part="panel" role="tabpanel" id="tb-panel-3" aria-labelledby="tb-tab-3" hidden>');
    expect(out.match(/data-part="trigger"/g)).toHaveLength(3);
    expect(out.match(/data-part="panel"/g)).toHaveLength(3);
  });

  it("numbers copies only for those an if lets through", () => {
    const out = run("+tabs(id='t')\n  @trigger A\n  @panel a\n  if more\n    @trigger B\n    @panel b\n", { more: true });
    expect(out).toContain('id="t-tab-2"');
    expect(run("+tabs(id='t')\n  @trigger A\n  @panel a\n  if more\n    @trigger B\n    @panel b\n", { more: false })).not.toContain("t-tab-2");
  });

  it("refuses paired parts filled a different number of times", () => {
    expect(fails("+tabs\n  @trigger A\n  @trigger B\n  @panel a\n")).toEqual(["fill-count"]);
  });

  it("repeats a unit's wrapper and the separator after it", () => {
    expect(run("+breadcrumb\n  @item(href='/') Home\n  @item(href='/docs') Docs\n  @current Page\n")).toBe(
      '<nav data-ui="breadcrumb" aria-label="Breadcrumb">\n  <ol data-part="list">\n' +
        '    <li>\n      <a data-part="item" href="/">Home</a>\n    </li>\n    <li data-part="separator" aria-hidden="true"></li>\n' +
        '    <li>\n      <a data-part="item" href="/docs">Docs</a>\n    </li>\n    <li data-part="separator" aria-hidden="true"></li>\n' +
        '    <li>\n      <span data-part="current" aria-current="page">Page</span>\n    </li>\n  </ol>\n</nav>\n',
    );
  });

  it("lays out the copies that share a parent in written order", () => {
    expect(run("+description-list\n  @term A\n  @details a\n  @term B\n  @details b\n")).toBe(
      '<dl data-ui="description-list">\n  <dt data-part="term">A</dt>\n  <dd data-part="details">a</dd>\n  <dt data-part="term">B</dt>\n  <dd data-part="details">b</dd>\n</dl>\n',
    );
  });

  it("fills a part's sample element and keeps its structure (accordion)", () => {
    const out = run("+accordion(id='ac')\n  @item\n    @trigger First\n    @content\n      p one\n");
    expect(out).toContain('<button data-part="trigger" id="ac-trigger-1" aria-expanded="false" aria-controls="ac-content-1">\n      <span>First</span>\n      <span data-part="icon" aria-hidden="true">▾</span>\n    </button>');
    expect(out.match(/data-part="item"/g)).toHaveLength(1);
  });

  it("sends a slot in a repeating part to that part's fill", () => {
    expect(messages("+accordion\n  @trigger x\n  @content y\n")).toContain('nested-slot: "trigger" repeats with the part that holds it; fill it inside @item');
    expect(fails("+timeline\n  @item\n    @title a\n  @title b\n")).toEqual(["nested-slot"]);
    expect(fails("+accordion\n")).toEqual(["missing-slot"]);
    expect(fails("+accordion\n  @item\n    @trigger x\n")).toEqual(["missing-slot"]);
  });

  it("refuses to write a fixed id twice", () => {
    expect(fails("+dialog\n  @title A\n  @title B\n  @body\n    p b\n")).toEqual(["duplicate-slot"]);
  });

  it("keeps content and fills apart", () => {
    expect(fails("+timeline\n  @item\n    p loose\n    @title a\n")).toEqual(["slot-conflict"]);
    expect(fails("+timeline\n  if x\n    @title a\n    p loose\n")).toEqual(["slot-conflict"]);
  });

  it("survives a JSON round trip", () => {
    const ast = ok("+tabs\n  each t in tabs\n    @trigger {{ t }}\n    @panel {{ t }}\n", opts);
    const data = { tabs: ["A", "B"] };
    expect(render(JSON.parse(JSON.stringify(ast)), data)).toBe(render(ast, data));
  });
});

describe("fill arguments (§11.4)", () => {
  it("writes the part's states and attributes", () => {
    const out = run("+stepper\n  @step(completed)\n    @indicator 1\n  @step(active=on)\n    @indicator 2\n", { on: true });
    expect(out).toContain('<div data-part="step" data-state="completed">');
    expect(out).toContain('<div data-part="step" data-state="active">');
  });

  it("checks them like any attribute", () => {
    expect(fails("+breadcrumb\n  @item(href=u) Home\n  @current x\n")).toEqual([]);
    expect(fails("+stepper\n  @step(data-state='x')\n    @indicator 1\n")).toEqual(["protocol-attr"]);
    expect(fails("+stepper\n  @step(completed='yes')\n    @indicator 1\n")).toEqual(["bad-value"]);
    expect(fails("+stepper\n  @step(onclick='x()')\n    @indicator 1\n")).toEqual(["event-attr"]);
  });
});

describe("optional parts left out (§11.4)", () => {
  it("drops an unset prop part, a sample part and a header left empty", () => {
    expect(run("+card\n  @body\n    p b\n")).toBe('<div data-ui="card">\n  <div data-part="body">\n    <p>b</p>\n  </div>\n</div>\n');
    expect(run("+card(title='T')\n  @body\n    p b\n")).toBe(
      '<div data-ui="card">\n  <div data-part="header">\n    <h3 data-part="title">T</h3>\n  </div>\n  <div data-part="body">\n    <p>b</p>\n  </div>\n</div>\n',
    );
  });

  it("keeps a part with an id, and structure", () => {
    const out = run("+dialog(title='T')\n  @body\n    p b\n");
    expect(out).toContain('data-part="title"');
    expect(run("+timeline\n  @title a\n")).toContain('<span data-part="marker" aria-hidden="true"></span>');
  });
});

describe("heading levels (§11.3)", () => {
  it("changes the reference tree's headings", () => {
    expect(run("+card(title='T' heading='h2')\n  @body\n    p b\n")).toContain('<h2 data-part="title">T</h2>');
  });

  it("takes a literal h1–h6 on components that have headings", () => {
    expect(fails("+card(heading='h7')\n  @body\n    p b\n")).toEqual(["bad-value"]);
    expect(fails("+card(heading=h)\n  @body\n    p b\n")).toEqual(["bad-value"]);
    expect(fails("+button(heading='h2') x\n")).toEqual(["unknown-arg"]);
  });
});

describe("the components a page draws (§16.1 uses)", () => {
  it("lists calls, the components inside them and plain data-ui elements, sorted", () => {
    const ast = ok("+card\n  @body\n    +button x\ndiv(data-ui='prose')\n  +badge y\n", opts);
    expect(ast.uses).toEqual(["badge", "button", "card", "prose"]);
  });
});
