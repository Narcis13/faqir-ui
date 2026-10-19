// ═══════════════════════════════════════════════════════════════════════════
// The strict-CSP engine build, end to end  [forecraft #50]
// ═══════════════════════════════════════════════════════════════════════════
//
// Loads ONLY `registry/core/faqir-core.csp.js`, so `scripts/test.mjs` runs this
// file in the strict-CSP partition beside the parameterised suites. Every case
// runs with the `Function` constructor and `eval` replaced by stubs that throw
// the EvalError a `script-src 'self'` page throws: anything that still reached
// for either would fail here, not quietly in a browser.
//
// Each case mounts into its own container and tears it down — the realm is
// shared with every other file in the partition.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { settle } from "../helpers/settle";

const Faqir = require("../../registry/core/faqir-core.csp.js");

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const realFunction = globalThis.Function;
const realEval = globalThis.eval;
let blocked: string[] = [];
let warnings: string[] = [];
let realWarn: typeof console.warn;
let mounted: HTMLElement[] = [];

beforeEach(() => {
  blocked = [];
  warnings = [];
  const refuse = (what: string) =>
    function () {
      blocked.push(what);
      throw new EvalError(`Refused to evaluate a string as JavaScript (${what})`);
    };
  (globalThis as any).Function = refuse("Function");
  (globalThis as any).eval = refuse("eval");
  realWarn = console.warn;
  console.warn = (...args: any[]) => {
    warnings.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" "));
  };
});

afterEach(() => {
  (globalThis as any).Function = realFunction;
  (globalThis as any).eval = realEval;
  console.warn = realWarn;
  for (const host of mounted) {
    Faqir.destroy(host);
    host.remove();
  }
  mounted = [];
});

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  mounted.push(host);
  for (const root of Array.from(host.children)) Faqir.initTree(root as HTMLElement);
  return host;
}

const text = (host: HTMLElement, sel: string) => host.querySelector(sel)!.textContent;
const click = (host: HTMLElement, sel: string) => (host.querySelector(sel) as HTMLElement).click();

describe("the strict-CSP build", () => {
  it("is the CSP build, and its code never constructs a function from a string", () => {
    const source = readFileSync(join(ROOT, "registry", "core", "faqir-core.csp.js"), "utf8");
    expect(source).toContain("// ── strict-CSP evaluator ── (src/core-src/csp-evaluator.js)");
    const code = source
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    expect(code).not.toMatch(/\bnew Function\s*\(/);
    expect(code).not.toMatch(/\beval\s*\(/);
    expect(Faqir.version).toBe(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version);
  });

  it("runs l-data, l-text, :bind, @click, l-for, l-if and l-model with no eval", async () => {
    const host = mount(`
      <div l-data="{ count: 1, name: 'Ada', items: ['a', 'b'], open: false,
                     get label() { return this.name + ' x' + this.count },
                     inc(by) { this.count += by } }">
        <p id="label" l-text="label"></p>
        <button id="inc" :aria-pressed="String(count > 1)" @click="inc(2); open = !open">+</button>
        <ul><template l-for="(it, i) in items" l-key="it"><li l-text="i + ':' + it.toUpperCase()"></li></template></ul>
        <template l-if="open"><em id="shown" l-text="\`open with \${items.length}\`"></em></template>
        <input id="name" l-model="name">
      </div>`);
    expect(text(host, "#label")).toBe("Ada x1");
    expect([...host.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["0:A", "1:B"]);
    expect(host.querySelector("#inc")!.getAttribute("aria-pressed")).toBe("false");

    click(host, "#inc");
    await tick();
    expect(text(host, "#label")).toBe("Ada x3");
    expect(host.querySelector("#inc")!.getAttribute("aria-pressed")).toBe("true");
    expect(text(host, "#shown")).toBe("open with 2");

    const input = host.querySelector("#name") as HTMLInputElement;
    input.value = "Grace 'quoted' \\ value";
    input.dispatchEvent(new Event("input"));
    await tick();
    expect(text(host, "#label")).toBe("Grace 'quoted' \\ value x3");
    expect(blocked).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("resolves the magics: $el, $this, $refs, $id, $dispatch, $event, $nextTick, $watch, $store", async () => {
    Faqir.store("cspStore", { unit: "C" });
    const host = mount(`
      <section id="root" l-data="{ seen: '', heard: '', ticks: 0, watched: 0 }"
               l-init="$watch('ticks', function (now) { watched = now })"
               @csp-ping="heard = $event.detail.from">
        <p id="ids" l-text="$el.id + '|' + $this.tagName + '|' + $id('x')"></p>
        <input l-ref="field" value="r">
        <button id="go" @click="seen = $refs.field.value + $store.cspStore.unit; $dispatch('csp-ping', { from: $this.id }); $nextTick(() => { ticks++ })">go</button>
      </section>`);
    expect(text(host, "#ids")).toMatch(/^root\|P\|faqir-\d+-x$/);
    click(host, "#go");
    const scopeOf = () => Faqir.inspect(host.querySelector("#root")).scope;
    await settle(() => scopeOf().watched === 1, "the $nextTick write to reach the $watch callback");
    const scope = scopeOf();
    expect(scope.seen).toBe("rC");
    expect(scope.heard).toBe("go");
    expect(scope.ticks).toBe(1);
    expect(scope.watched).toBe(1);
    expect(blocked).toEqual([]);
  });

  it("drives a recipe controller through $ui, and $state follows it", async () => {
    const host = mount(`
      <div data-ui="dialog" data-state="closed" l-data="{}">
        <button id="open" @click="$ui.open()">Open</button>
        <p id="state" l-text="$state"></p>
        <div data-part="overlay" hidden></div>
        <div data-part="panel" tabindex="-1" role="dialog" aria-modal="true" hidden>
          <button id="close" data-part="close" @click="$ui.close()">x</button>
        </div>
      </div>`);
    const root = host.querySelector('[data-ui="dialog"]') as HTMLElement;
    click(host, "#open");
    await tick();
    expect(root.dataset.state).toBe("open");
    expect(text(host, "#state")).toBe("open");
    expect(blocked).toEqual([]);
  });

  it("an expression outside the subset fails like any other expression error, naming it", async () => {
    const host = mount(`<div l-data="{ n: 1 }"><p id="p" l-text="class Nope {}"></p><p id="q" l-text="n + 1"></p></div>`);
    await tick();
    expect(text(host, "#q")).toBe("2");
    expect(text(host, "#p")).toBe("");
    const hit = warnings.find((w) => w.includes('"class Nope {}"'));
    expect(hit).toBeDefined();
    expect(hit).toContain("SyntaxError");
    expect(hit).toContain('Unsupported syntax "class"');
  });

  it("refuses the forbidden members at run time", async () => {
    const host = mount(`<div l-data="{ s: 'x', k: 'constr' + 'uctor' }"><p id="p" l-text="s[k]"></p></div>`);
    await tick();
    expect(text(host, "#p")).toBe("");
    expect(warnings.some((w) => w.includes('"s[k]"') && w.includes('Access to "constructor" is forbidden'))).toBe(true);
  });

  it("serves Faqir.evaluate and Faqir.evaluateAssignment to plugins, under the block", () => {
    const scope = Faqir.reactive({ a: { b: 2 }, out: 0 });
    expect(Faqir.evaluate("a?.b * 3", scope, null)).toBe(6);
    Faqir.evaluateAssignment("out = " + JSON.stringify({ v: [1, "two", null] }), scope, null);
    expect(scope.out).toEqual({ v: [1, "two", null] });
    expect(blocked).toEqual([]);
  });
});
