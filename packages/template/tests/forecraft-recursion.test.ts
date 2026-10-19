// Bounded recursion (docs/template.md §10.3): an include with a `depth=N`
// budget may reach back to a partial on its chain, and render stops it at the
// budget; an include cycle without a budget is still `include-cycle`.
import { describe, expect, it } from "bun:test";
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";
import { codes, memoryLoader } from "./helpers";

const BLOCK = [
  "params block",
  "section",
  "  h2 {{ block.title }}",
  "  each child in block.children",
  '    include "block.faqir" (block=child) depth=3',
].join("\n");

const loader = memoryLoader({ "block.faqir": BLOCK });
const page = 'include "block.faqir" (block=report)\n';

/** A chain of `levels` nested blocks. */
function tree(levels: number): Record<string, unknown> {
  let block: Record<string, unknown> = { title: `L${levels}`, children: [] };
  for (let n = levels - 1; n >= 1; n--) block = { title: `L${n}`, children: [block] };
  return block;
}

function renderError(source: string, data: Record<string, unknown>, opts: Record<string, unknown> = {}) {
  const { ast, diagnostics } = compile(source, { loader });
  expect(diagnostics).toEqual([]);
  try {
    render(ast!, data, opts);
  } catch (error) {
    return error as { code: string; file: string; line: number; col: number; message: string };
  }
  throw new Error("rendered without an error");
}

describe("an include with a depth budget", () => {
  it("renders a three-level tree with one recursive partial", () => {
    const { ast, diagnostics } = compile(page, { loader });
    expect(diagnostics).toEqual([]);
    expect(ast!.partials["block.faqir"][1]).toBeDefined();
    const report = { title: "Report", children: [{ title: "A", children: [{ title: "A1", children: [] }] }, { title: "B", children: [] }] };
    expect(render(ast!, { report })).toBe(
      [
        "<section>",
        "  <h2>Report</h2>",
        "  <section>",
        "    <h2>A</h2>",
        "    <section>",
        "      <h2>A1</h2>",
        "    </section>",
        "  </section>",
        "  <section>",
        "    <h2>B</h2>",
        "  </section>",
        "</section>",
        "",
      ].join("\n"),
    );
  });

  it("keeps the budget in the AST, which survives JSON", () => {
    const { ast } = compile(page, { loader });
    const inner = JSON.stringify(ast!.partials["block.faqir"]);
    expect(inner).toContain('"depth":3');
    const copy = JSON.parse(JSON.stringify(ast));
    expect(render(copy, { report: tree(3) })).toBe(render(ast!, { report: tree(3) }));
  });

  it("is include-depth at render, with the include's line and column, past the budget", () => {
    const error = renderError(page, { report: tree(4) });
    expect(error.code).toBe("include-depth");
    expect(error.file).toBe("block.faqir");
    expect(error.line).toBe(5);
    expect(error.col).toBe(5);
    expect(error.message).toContain("depth=3");
  });

  it("counts the partial on the chain however it was opened", () => {
    // The page opens the partial with its own budget of 1: the partial is then
    // already open once when its own include (budget 3) asks for more.
    const { ast } = compile('include "block.faqir" (block=report) depth=1\n', { loader });
    expect(render(ast!, { report: tree(3) })).toContain("<h2>L3</h2>");
    expect(renderError('include "block.faqir" (block=report) depth=1\n', { report: tree(4) }).code).toBe("include-depth");
  });

  it("recurses through another partial when the include closing the cycle has the budget", () => {
    const files = memoryLoader({
      "a.faqir": "params n\nul\n  li {{ n }}\n  if n > 1\n    include \"b.faqir\" (n=n - 1)",
      "b.faqir": "params n\ninclude \"a.faqir\" (n=n) depth=2",
    });
    const { ast, diagnostics } = compile('include "a.faqir" (n=2)\n', { loader: files });
    expect(diagnostics).toEqual([]);
    expect(render(ast!, {})).toBe("<ul>\n  <li>2</li>\n  <ul>\n    <li>1</li>\n  </ul>\n</ul>\n");
    expect(() => render(compile('include "a.faqir" (n=3)\n', { loader: files }).ast!, {})).toThrow(/depth=2/);
  });

  it("is still bounded by the include chain of 16, whatever the budget", () => {
    const deep = memoryLoader({ "d.faqir": 'params n\ni {{ n }}\nif n > 0\n  include "d.faqir" (n=n - 1) depth=16' });
    const { ast, diagnostics } = compile('include "d.faqir" (n=15)\n', { loader: deep });
    expect(diagnostics).toEqual([]);
    expect(render(ast!, {})).toContain("<i>0</i>");
    let code = "";
    try {
      render(compile('include "d.faqir" (n=16)\n', { loader: deep }).ast!, {});
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("include-depth");
  });

  it("is still bounded by the step and output limits", () => {
    // Two recursive includes per level: 2^16 partials, cut off by the limits.
    const wide = memoryLoader({ "w.faqir": 'params n\nb x\nif n > 0\n  include "w.faqir" (n=n - 1) depth=16\n  include "w.faqir" (n=n - 1) depth=16' });
    const { ast, diagnostics } = compile('include "w.faqir" (n=15)\n', { loader: wide });
    expect(diagnostics).toEqual([]);
    const code = (opts: Record<string, number>) => {
      try {
        render(ast!, {}, opts);
        return "";
      } catch (error) {
        return (error as { code: string }).code;
      }
    };
    expect(code({ maxSteps: 1000 })).toBe("step-limit");
    expect(code({ maxOutput: 1000 })).toBe("output-limit");
  });

  it("checks the parameters of the partial it reaches back to", () => {
    const bad = memoryLoader({ "s.faqir": 'params n\nif n > 0\n  include "s.faqir" (n=n - 1 extra=1) depth=2' });
    expect(codes('include "s.faqir" (n=1)\n', { loader: bad })).toEqual(["unknown-param"]);
  });
});

describe("an include cycle without a budget", () => {
  it("is still include-cycle at compile time", () => {
    const cyc = memoryLoader({ "self.faqir": 'include "self.faqir"', "a.faqir": 'include "b.faqir"', "b.faqir": 'include "a.faqir"' });
    expect(codes('include "self.faqir"', { loader: cyc })).toEqual(["include-cycle"]);
    expect(codes('include "a.faqir"', { loader: cyc })).toEqual(["include-cycle"]);
    const unbudgeted = memoryLoader({ "block.faqir": BLOCK.replace(" depth=3", "") });
    expect(codes(page, { loader: unbudgeted })).toEqual(["include-cycle"]);
  });

  it("is include-cycle when only an include that does not close the cycle has a budget", () => {
    const files = memoryLoader({ "a.faqir": 'include "b.faqir" depth=4', "b.faqir": 'include "a.faqir"' });
    expect(codes('include "a.faqir"', { loader: files })).toEqual(["include-cycle"]);
  });

  it("is include-cycle for the file being compiled, budget or not", () => {
    const self = memoryLoader({ "x.faqir": "p" });
    expect(codes('include "x.faqir" depth=2', { file: "x.faqir", loader: self })).toEqual(["include-cycle"]);
  });
});

describe("the depth budget's syntax", () => {
  const files = memoryLoader({ "p.faqir": "p" });
  it("follows the parameters, or the name when there are none", () => {
    expect(codes('include "p.faqir" (a=1) depth=2', { loader: files })).toEqual([]);
    expect(codes('include "p.faqir" depth=16', { loader: files })).toEqual([]);
  });

  it("is a whole number from 1 to 16", () => {
    for (const bad of ["depth=0", "depth=17", "depth=x", "depth=1.5", "depth = 2", "depth", "depth=-1"]) {
      expect(codes(`include "p.faqir" ${bad}`, { loader: files })).toEqual(["bad-line"]);
    }
  });

  it("is the last thing on the line", () => {
    expect(codes('include "p.faqir" depth=2 (a=1)', { loader: files })).toEqual(["bad-line"]);
    expect(codes('include "p.faqir" depths=2', { loader: files })).toEqual(["bad-line"]);
  });

  it("is refused by render when a hand-made AST carries a bad one", () => {
    const { ast } = compile('include "p.faqir"', { loader: files });
    (ast!.body[0] as any).depth = 0;
    let code = "";
    try {
      render(ast!, {});
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("bad-ast");
  });
});
