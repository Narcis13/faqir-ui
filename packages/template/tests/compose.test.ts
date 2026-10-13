// Piece 5 — composition (docs/template.md §10): layout and blocks, include
// with parameters, the loader interface, cycles and the depth limit, and the
// /node file loader confined to one root.
import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";
import { createFileLoader } from "../src/node.js";
import { codes, html, memoryLoader, ok } from "./helpers";

const layout = "doctype html\nhtml\n  head\n    title\n      block title\n        | Untitled\n  body\n    block content\n      p empty\n    footer\n      block footer\n";

describe("layout and block (§10.2)", () => {
  const loader = memoryLoader({ "layouts/base.faqir": layout });

  it("replaces the layout's blocks and keeps the defaults of the rest", () => {
    const src = 'layout "layouts/base.faqir"\n\nblock title\n  | {{ page.title }}\nblock content\n  p {{ page.body }}\n';
    expect(html(src, { page: { title: "T", body: "B" } }, { loader })).toBe(
      "<!doctype html>\n<html>\n  <head>\n    <title>T</title>\n  </head>\n  <body>\n    <p>B</p>\n    <footer></footer>\n  </body>\n</html>\n",
    );
  });

  it("renders a layout on its own with its defaults", () => {
    expect(html(layout)).toContain("<title>Untitled</title>");
  });

  it("reports layout mistakes", () => {
    expect(codes('layout "layouts/base.faqir"\nblock nope\n  | x\n', { loader })).toEqual(["unknown-block"]);
    expect(codes('layout "layouts/base.faqir"\nblock title\n  | a\nblock title\n  | b\n', { loader })).toEqual(["duplicate-block"]);
    expect(codes('layout "layouts/base.faqir"\np stray\n', { loader })).toEqual(["misplaced"]);
    expect(codes('p first\nlayout "layouts/base.faqir"\n', { loader })).toEqual(["misplaced"]);
    expect(codes('layout "layouts/base.faqir"\nblock content\n  block title\n    | x\n', { loader })).toEqual(["misplaced"]);
    expect(codes("block a\n  | 1\nblock a\n  | 2\n", { loader })).toEqual([]);
    const nested = memoryLoader({ "a.faqir": 'layout "b.faqir"\n', "b.faqir": "p b\n" });
    expect(codes('layout "a.faqir"\n', { loader: nested })).toEqual(["nested-layout"]);
    const dup = memoryLoader({ "d.faqir": "block x\n  | 1\nblock x\n  | 2\n" });
    expect(codes('layout "d.faqir"\n', { loader: dup })).toEqual(["duplicate-block"]);
  });
});

describe("include (§10.3)", () => {
  const files = {
    "partials/item.faqir": "li(class=cls)\n  a(href=href) {{ label }}\n",
    "partials/list.faqir": 'ul\n  each item in items\n    include "partials/item.faqir" (href=item.href label=item.label cls="i-{{ item.label }}")\n',
    "partials/peek.faqir": "p {{ secret }}\n",
    "partials/flag.faqir": "p {{ on }}\n",
  };
  const loader = memoryLoader(files);

  it("renders a partial with its parameters", () => {
    const out = html('include "partials/list.faqir" (items=nav)', { nav: [{ href: "/a", label: "A" }] }, { loader });
    expect(out).toBe('<ul>\n  <li class="i-A">\n    <a href="/a">A</a>\n  </li>\n</ul>\n');
  });

  it("gives a partial only its parameters", () => {
    expect(() => render(ok('include "partials/peek.faqir"', { loader }), { secret: "s" })).toThrow(expect.objectContaining({ code: "missing", file: "partials/peek.faqir" }));
    expect(html('include "partials/flag.faqir" (on)', {}, { loader })).toBe("<p>true</p>\n");
  });

  it("stores each partial once in the AST", () => {
    const ast = ok('include "partials/item.faqir" (href="/" label="x" cls="c")\ninclude "partials/item.faqir" (href="/" label="y" cls="c")', { loader });
    expect(Object.keys(ast.partials)).toEqual(["partials/item.faqir"]);
    expect(ast.files).toEqual(["template.faqir", "partials/item.faqir"]);
  });

  it("checks names and the loader", () => {
    expect(codes('include "a.faqir"')).toEqual(["no-loader"]);
    expect(codes('include "missing.faqir"', { loader })).toEqual(["not-found"]);
    for (const bad of ["../x.faqir", "/abs.faqir", "a/./b.faqir", "a//b.faqir", "a\\\\b.faqir", "x.html", "a/../b.faqir"]) {
      expect(codes(`include "${bad}"`, { loader })).toEqual(["bad-path"]);
    }
    expect(() => compile('include "a.faqir"', { loader: () => 42 as unknown as string })).toThrow(TypeError);
  });

  it("finds include cycles at compile time", () => {
    const cyc = memoryLoader({ "a.faqir": 'include "b.faqir"\n', "b.faqir": 'include "a.faqir"\n', "self.faqir": 'include "self.faqir"\n' });
    expect(codes('include "a.faqir"', { loader: cyc })).toEqual(["include-cycle"]);
    expect(codes('include "self.faqir"', { loader: cyc })).toEqual(["include-cycle"]);
    expect(codes('include "x.faqir"', { file: "x.faqir", loader: memoryLoader({ "x.faqir": "p" }) })).toEqual(["include-cycle"]);
  });

  it("limits the include chain to 16", () => {
    const chain: Record<string, string> = {};
    for (let i = 0; i < 20; i++) chain[`p${i}.faqir`] = `include "p${i + 1}.faqir"\n`;
    chain["p20.faqir"] = "p end\n";
    expect(codes('include "p0.faqir"', { loader: memoryLoader(chain) })).toContain("include-depth");
    const short: Record<string, string> = {};
    for (let i = 0; i < 15; i++) short[`p${i}.faqir`] = `include "p${i + 1}.faqir"\n`;
    short["p15.faqir"] = "p end\n";
    expect(html('include "p0.faqir"', {}, { loader: memoryLoader(short) })).toBe("<p>end</p>\n");
  });

  it("enforces the include depth at render time on a hand-made AST", () => {
    const ast = ok('include "loop.faqir"', { loader: memoryLoader({ "loop.faqir": "p x\n" }) });
    ast.partials["loop.faqir"] = [{ type: "Include", name: "loop.faqir", params: [], loc: [1, 1, 1] }];
    expect(() => render(ast)).toThrow(expect.objectContaining({ code: "include-depth" }));
  });

  it("keeps layout and block out of partials", () => {
    const bad = memoryLoader({ "p.faqir": "block x\n  | y\n", "q.faqir": 'layout "p.faqir"\n' });
    expect(codes('include "p.faqir"', { loader: bad })).toEqual(["misplaced"]);
    expect(codes('include "q.faqir"', { loader: bad })).toEqual(["misplaced"]);
  });
});

describe("the /node file loader (§15.2)", () => {
  const root = mkdtempSync(join(tmpdir(), "faqir-template-"));
  const outside = mkdtempSync(join(tmpdir(), "faqir-outside-"));
  mkdirSync(join(root, "partials"));
  mkdirSync(join(root, "dir.faqir"));
  writeFileSync(join(root, "page.faqir"), 'include "partials/a.faqir"\n');
  writeFileSync(join(root, "partials", "a.faqir"), "p from disk\n");
  writeFileSync(join(outside, "secret.faqir"), "p secret\n");
  symlinkSync(join(outside, "secret.faqir"), join(root, "partials", "link.faqir"));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("reads files under its root", () => {
    const loader = createFileLoader(root);
    expect(html(loader("page.faqir") as string, {}, { loader })).toBe("<p>from disk</p>\n");
  });

  it("returns null for anything else", () => {
    const loader = createFileLoader(root);
    expect(loader("partials/link.faqir")).toBeNull();
    expect(loader("../" + outside.split("/").pop() + "/secret.faqir")).toBeNull();
    expect(loader("missing.faqir")).toBeNull();
    expect(loader("dir.faqir")).toBeNull();
    expect(loader(join(outside, "secret.faqir"))).toBeNull();
  });
});
