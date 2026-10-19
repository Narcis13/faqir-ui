// ═══════════════════════════════════════════════════════════════════════════
// A directive registered after the boot binds the tree already bound  [forecraft #28]
// ═══════════════════════════════════════════════════════════════════════════
//
// A plugin that arrives after the engine booted — a slow `defer` script, an
// on-demand `import()` — registered `l-rules` against a tree the engine had
// already walked, and every element carrying it stayed inert with no error.
// `Faqir.directive()` now applies what the walk held for that name, once, in
// the scope each element was bound in.
//
// Every case mounts into its own container and tears it down: booting the
// shared realm's <body> would leak into every later file.

import { afterEach, describe, expect, it } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let mounted: HTMLElement[] = [];
function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  const root = host.firstElementChild as HTMLElement;
  document.body.appendChild(host);
  mounted.push(host);
  Faqir.initTree(root);
  return root;
}

afterEach(() => {
  for (const host of mounted) {
    Faqir.destroy(host);
    host.remove();
  }
  mounted = [];
});

let n = 0;
const uniqueName = () => `forecraft-late-${++n}`;

describe("a directive registered after its elements were bound", () => {
  it("binds an element already in a bound scope, against that scope", () => {
    const name = uniqueName();
    const root = mount(`<div l-data="{ msg: 'hi' }"><span l-${name}="msg"></span></div>`);
    const calls: Array<{ el: Element; value: unknown }> = [];

    Faqir.directive(name, (el: Element, dir: any, scope: any) => {
      calls.push({ el, value: Faqir.evaluate(dir.expression, scope, el) });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].el).toBe(root.querySelector("span")!);
    expect(calls[0].value).toBe("hi");
  });

  it("binds the scope root itself, and a nested scope against its own data", () => {
    const name = uniqueName();
    const root = mount(`
      <div l-data="{ who: 'outer' }" l-${name}="who">
        <section l-data="{ who: 'inner' }"><b l-${name}="who"></b></section>
      </div>`);
    const seen: unknown[] = [];

    Faqir.directive(name, (el: Element, dir: any, scope: any) => {
      seen.push([el.tagName, Faqir.evaluate(dir.expression, scope, el)]);
    });

    expect(seen).toEqual([["DIV", "outer"], ["B", "inner"]]);
    expect(root.tagName).toBe("DIV");
  });

  it("applies once: registering again, or binding later, never re-applies", () => {
    const name = uniqueName();
    const root = mount(`<div l-data="{}"><i l-${name}></i></div>`);
    let first = 0;
    let second = 0;

    Faqir.directive(name, () => { first++; });
    expect(first).toBe(1);

    // A second registration finds nothing held for the element bound before.
    Faqir.directive(name, () => { second++; });
    expect(first).toBe(1);
    expect(second).toBe(0);

    // Markup bound after the registration is applied directly, exactly once.
    const late = document.createElement("div");
    late.setAttribute("l-data", "{}");
    late.innerHTML = `<i l-${name}></i>`;
    root.appendChild(late);
    Faqir.initTree(late, (root as any).__faqirScope);
    expect(second).toBe(1);
  });

  it("binds the l-for rows that are still there, each with its row scope", async () => {
    const name = uniqueName();
    const root = mount(`
      <ul l-data="{ items: ['a', 'b', 'c'] }">
        <template l-for="item in items"><li l-${name}="item"></li></template>
      </ul>`);
    // A row torn down before the plugin arrives drops out of what was held.
    (root as any).__faqirScope.items = ["a", "c"];
    await tick();
    expect(root.querySelectorAll("li")).toHaveLength(2);

    const seen: unknown[] = [];
    Faqir.directive(name, (el: Element, dir: any, scope: any) => {
      seen.push(Faqir.evaluate(dir.expression, scope, el));
    });
    expect(seen).toEqual(["a", "c"]);
  });

  it("registers the cleanup a late handler returns", () => {
    const name = uniqueName();
    const root = mount(`<div l-data="{}"><p l-${name}></p></div>`);
    let cleaned = 0;

    Faqir.directive(name, () => () => { cleaned++; });
    expect(cleaned).toBe(0);
    Faqir.destroy(root);
    expect(cleaned).toBe(1);
  });

  it("leaves a destroyed subtree alone", () => {
    const name = uniqueName();
    const root = mount(`<div l-data="{}"><p l-${name}></p></div>`);
    Faqir.destroy(root);
    let calls = 0;

    Faqir.directive(name, () => { calls++; });
    expect(calls).toBe(0);
  });
});
