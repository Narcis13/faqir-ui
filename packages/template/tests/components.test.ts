// Piece 6 — component calls (docs/template.md §11): arguments, values, slots,
// ids, @ui:requires, passthrough, and every component diagnostic code.
import { describe, expect, it } from "bun:test";
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";
import { components } from "../src/registry.js";
import { codes, html, ok, renderCode } from "./helpers";

const table = components as any;
const opts = { components: table };
const run = (src: string, data: Record<string, unknown> = {}, renderOptions = {}) => html(src, data, opts, renderOptions);
const fails = (src: string) => codes(src, opts);

describe("calls render the reference tree (§11.2)", () => {
  it("fills named slots and keeps the contract attributes", () => {
    const out = run("+callout(variant='warning' role='alert')\n  @content\n    p Mind the gap.\n");
    // The icon part's reference content was a sample: unfilled, it is left out.
    expect(out).toBe('<div data-ui="callout" role="alert" data-variant="warning">\n  <div data-part="content">\n    <p>Mind the gap.</p>\n  </div>\n</div>\n');
  });

  it("takes default content for inline, text and block components", () => {
    expect(run("+button(variant='primary' size='sm') Save")).toBe('<button data-ui="button" data-variant="primary" data-size="sm">Save</button>\n');
    expect(run("+stack(gap='4')\n  p a\n  p b\n")).toBe('<div data-ui="stack" data-gap="4">\n  <p>a</p>\n  <p>b</p>\n</div>\n');
  });

  it("writes no attribute for a default variant, literal or dynamic", () => {
    expect(run("+button(variant='default') x")).toBe('<button data-ui="button">x</button>\n');
    expect(run("+button(variant=v) x", { v: "default" })).toBe('<button data-ui="button">x</button>\n');
    expect(run("+button(variant=v) x", { v: "ghost" })).toBe('<button data-ui="button" data-variant="ghost">x</button>\n');
  });

  it("names responsive variants by their attribute", () => {
    expect(run("+grid(cols='1' cols-md='3' gap='4')\n  p a\n")).toBe('<div data-ui="grid" data-gap="4" data-cols-md="3">\n  <p>a</p>\n</div>\n');
  });

  it("writes states: value, presence and aria kinds, literal or dynamic", () => {
    expect(run("+button(loading disabled) x")).toBe('<button data-ui="button" disabled data-state="loading">x</button>\n');
    expect(run("+button(disabled=busy pressed=on) x", { busy: false, on: false })).toBe('<button data-ui="button" aria-pressed="false">x</button>\n');
    expect(run("+button(disabled=busy pressed=on) x", { busy: true, on: true })).toBe('<button data-ui="button" disabled aria-pressed="true">x</button>\n');
    expect(run("+dialog(open=o title='T')\n  @body\n    p b\n", { o: false })).toContain('data-state="closed"');
    expect(run("+dialog(open=o title='T')\n  @body\n    p b\n", { o: true })).toContain('data-state="open"');
  });

  it("puts string props where the reference uses them, defaults otherwise", () => {
    const out = run("+dialog(id='confirm' title=t triggerText='Delete…')\n  @body\n    p Sure?\n", { t: "Delete <the> flow" });
    expect(out).toContain('<button data-part="trigger">Delete…</button>');
    expect(out).toContain('<h2 id="confirm-title" data-part="title">Delete &lt;the&gt; flow</h2>');
    expect(out).toContain('aria-labelledby="confirm-title"');
    expect(run("+dialog(title='T')\n  @body\n    p b\n")).toContain('<button data-part="trigger">Open</button>');
  });

  it("passes aria-*, data-*, class and faqir-core attributes onto the root", () => {
    const out = run("+card(class='x' aria-label='Plan' data-flex='1' l-data=json(s) @click='go()')\n  @body\n    p b\n", { s: { n: 1 } });
    expect(out).toContain('<div data-ui="card" class="x" aria-label="Plan" data-flex="1" l-data="{&quot;n&quot;:1}" @click="go()">');
    expect(fails("+card(l-text=x)\n  @body\n    p b\n")).toEqual(["directive-interpolation"]);
  });

  it("expands calls inside fills, loops and partial-free nesting", () => {
    const out = run("+card\n  @body\n    each b in bs\n      +badge(variant='success') {{ b }}\n", { bs: ["a"] });
    expect(out).toContain('<span data-ui="badge" data-variant="success">a</span>');
  });
});

describe("ids (§11.5)", () => {
  const src = "+dialog(title='A')\n  @body\n    p a\n+dialog(title='B')\n  @body\n    p b\n";

  it("counts per render, in render order, with a prefix", () => {
    const out = run(src);
    expect(out).toContain('id="t-1"');
    expect(out).toContain('aria-labelledby="t-2-title"');
    expect(run(src, {}, { idPrefix: "docs" })).toContain('id="docs-1"');
  });

  it("is deterministic and restarts with every render", () => {
    const ast = ok(src, opts);
    expect(render(ast)).toBe(render(ast));
    expect(render(JSON.parse(JSON.stringify(ast)))).toBe(render(ast));
  });

  it("uses the author's id, even from data", () => {
    expect(run("+dialog(id=k title='A')\n  @body\n    p a\n", { k: "x" })).toContain('aria-labelledby="x-title"');
    expect(run("+badge(id='b1') x")).toBe('<span data-ui="badge" id="b1">x</span>\n');
    expect(renderCode("+dialog(id=k title='A')\n  @body\n    p a\n", { k: { a: 1 } }, opts)).toBe("not-text");
  });
});

describe("@ui:requires (§11.6)", () => {
  it("names faqir-core, plugins and controllers, with the controllers they import", () => {
    const out = run("+alert-dialog(title='T' description='D' confirmText='OK')\n  @trigger Delete\n  @body\n    p b\nform(l-validate)\ndiv(data-ui='tabs')\ndiv(data-ui='table')\n");
    expect(out.split("\n")[0]).toBe("<!-- @ui:requires faqir-core.js faqir-validate.js alert-dialog.js dialog.js table.js tabs.js -->");
  });

  it("goes after the doctype and is absent when nothing is needed", () => {
    expect(run("doctype html\nhtml\n  +tabs\n    @trigger A\n    @panel a\n").split("\n").slice(0, 2)).toEqual(["<!doctype html>", "<!-- @ui:requires faqir-core.js tabs.js -->"]);
    expect(run("+badge x")).not.toContain("@ui:requires");
  });
});

describe("component diagnostics", () => {
  const cases: [string, string][] = [
    ["unknown-component", "+bogus\n"],
    ["unknown-arg", "+button(colour='red') x\n"],
    ["protocol-attr", "+button(data-variant='primary') x\n"],
    ["protocol-attr", "+button(data-ui='x') x\n"],
    ["bad-value", "+button(variant='huge') x\n"],
    ["bad-value", "+button(variant) x\n"],
    ["bad-value", "+button(variant='a{{ b }}') x\n"],
    ["bad-value", "+button(loading='yes') x\n"],
    ["bad-value", "+dialog(title)\n  @body\n    p b\n"],
    ["bad-value", "+badge(id) x\n"],
    ["unknown-slot", "+card\n  @body\n    p b\n  @nope x\n"],
    ["duplicate-slot", "+dialog\n  @title A\n  @title B\n  @body\n    p b\n"],
    ["no-default-slot", "+card\n  p loose\n"],
    ["missing-slot", "+card\n"],
    ["missing-slot", "+dialog\n  @body\n    p b\n"],
  ];
  for (const [code, source] of cases) {
    it(`${code}: ${JSON.stringify(source)}`, () => expect(fails(source)).toContain(code));
  }

  it("refuses default content beside named fills", () => {
    // No registry component has both a default slot and a fillable slot, so a
    // one-entry table stands in for a project-made one.
    const box = { defaultSlot: true, slots: { head: { required: false } }, variants: {}, states: {}, props: {}, bools: [],
      tree: { tag: "div", attrs: [["data-ui", ["box"]]], children: [{ tag: "h2", attrs: [["data-part", ["head"]]], slot: "head", children: [] }] } };
    const own = { version: 1, plugins: {}, controllers: {}, unavailable: {}, components: { box } };
    expect(codes("+box\n  @head H\n  p loose\n", { components: own })).toEqual(["slot-conflict"]);
    expect(html("+box\n  @head H\n", {}, { components: own })).toBe('<div data-ui="box">\n  <h2 data-part="head">H</h2>\n</div>\n');
  });

  it("suggests near names", () => {
    expect(compile("+buton x\n", opts).diagnostics[0].message).toContain("button");
  });

  it("knows no components without a table", () => {
    expect(codes("+button x\n")).toEqual(["unknown-component"]);
  });

  it("satisfies a required slot with its prop", () => {
    expect(fails("+dialog(title='T')\n  @body\n    p b\n")).toEqual([]);
  });

  it("checks dynamic variant values at render time", () => {
    expect(renderCode("+button(variant=v) x", { v: "huge" }, opts)).toBe("bad-value");
    expect(renderCode("+button(variant=v) x", { v: null }, opts)).toBe("bad-value");
  });
});
