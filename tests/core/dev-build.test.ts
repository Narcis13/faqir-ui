/**
 * The development engine's diagnostics.  [task 0.7-12]
 *
 * This file loads ONLY `registry/core/faqir-core.dev.js`. Each warning class
 * below has a parallel "…and the production engine stays silent" assertion on
 * the same fixture in tests/core/faqir-core.test.ts — the two engines are kept
 * in separate files because each one bootstraps a MutationObserver over the
 * shared document, and two live engines would double-initialize every scope.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.dev.js");
// This engine's own handle — see the note in tests/core/inspect.test.ts about
// the shared realm. In a browser it is `window.__FAQIR_DEVTOOLS__`.
const DEVTOOLS = Faqir.devtools;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let warnings: string[] = [];
let originalWarn: typeof console.warn;
// The engine keeps ONE diagnostics log for the page's lifetime, so each test
// asserts on the tail recorded after it started rather than clearing shared
// state (the dedupe memory is deliberately not resettable from the handle).
let baseline = 0;

beforeEach(async () => {
  document.body.innerHTML = "";
  await tick();
  warnings = [];
  originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    warnings.push(args.join(" "));
  };
  baseline = DEVTOOLS.warnings().length;
});

afterEach(() => {
  console.warn = originalWarn;
});

/** Diagnostics recorded since the current test began, optionally by kind. */
function fresh(kind?: string) {
  const all = DEVTOOLS.warnings().slice(baseline);
  return kind ? all.filter((w: any) => w.kind === kind) : all;
}

describe("dev build identity", () => {
  it("reports dev: true on the devtools handle", () => {
    expect(DEVTOOLS.dev).toBe(true);
    expect(DEVTOOLS.faqir).toBe(Faqir);
  });

  it("carries the same inspect() surface as production", () => {
    document.body.innerHTML = `<div id="s" l-data="{ n: 1 }"></div>`;
    Faqir.start();
    expect(Faqir.inspect("#s").scope).toEqual({ n: 1 });
    expect(DEVTOOLS.inspect).toBe(Faqir.inspect);
  });

  it("returns copies from warnings() — callers cannot corrupt the log", async () => {
    document.body.innerHTML = `<div l-data="{}"><p l-text="nope.deep"></p></div>`;
    Faqir.start();
    await tick();
    const first = DEVTOOLS.warnings();
    first.length = 0;
    expect(DEVTOOLS.warnings().length).toBeGreaterThan(0);
  });
});

describe("warning class: expression errors", () => {
  it("reports a failed l-* expression with the offending element's outerHTML", async () => {
    document.body.innerHTML = `
      <div l-data="{ user: null }">
        <p id="boom" l-text="user.name.first"></p>
      </div>`;
    Faqir.start();
    await tick();

    const entries = fresh("expression");
    expect(entries.length).toBeGreaterThan(0);
    const entry = entries[0];
    expect(entry.expression).toBe("user.name.first");
    expect(entry.element).toBe("p#boom");
    expect(entry.html).toContain('<p id="boom" l-text="user.name.first">');
    expect(entry.message).toContain("Expression error");
    expect(warnings.some((w) => w.startsWith("[Faqir dev]"))).toBe(true);
    expect(warnings.some((w) => w.includes('<p id="boom"'))).toBe(true);
  });

  it("reports a failed statement (event handler / l-init body) as kind expression", async () => {
    document.body.innerHTML = `
      <div l-data="{ n: 0 }">
        <button id="go" @click="missingFn()">go</button>
      </div>`;
    Faqir.start();
    await tick();
    (document.querySelector("#go") as HTMLElement).click();
    await tick();

    const entry = fresh("expression").find((e: any) => e.expression === "missingFn()");
    expect(entry).toBeDefined();
    expect(entry.message).toContain("Statement error");
    expect(entry.html).toContain('id="go"');
  });

  it("truncates a huge offending element instead of logging the whole page", async () => {
    const filler = "<span>x</span>".repeat(400);
    document.body.innerHTML = `
      <div l-data="{}">
        <section id="big" l-text="nope.deep">${filler}</section>
      </div>`;
    Faqir.start();
    await tick();

    const entry = fresh("expression")[0];
    expect(entry.html.length).toBeLessThan(500);
    expect(entry.html).toContain('<section id="big"'); // the identifying head survives
    expect(entry.html).toContain("…");
  });
});

describe("warning class: unknown directives", () => {
  it("flags an l-* attribute no built-in and no plugin handles", async () => {
    document.body.innerHTML = `
      <div l-data="{ n: 1 }">
        <p id="typo" l-txet="n"></p>
      </div>`;
    Faqir.start();
    await tick();

    const entry = fresh("directive")[0];
    expect(entry).toBeDefined();
    expect(entry.directive).toBe("l-txet");
    expect(entry.element).toBe("p#typo");
    expect(entry.message).toContain('Unknown directive "l-txet"');
    expect(entry.html).toContain('l-txet="n"');
  });

  it("stays quiet once a plugin registers that directive", async () => {
    Faqir.directive("gadget", () => {});
    document.body.innerHTML = `
      <div l-data="{ n: 1 }">
        <p l-gadget="n"></p>
      </div>`;
    Faqir.start();
    await tick();
    expect(fresh("directive")).toEqual([]);
  });

  it("does not flag any directive of the real vocabulary", async () => {
    document.body.innerHTML = `
      <div l-data="{ items: ['a','b'], on: true, txt: 'x', html: '<b>y</b>', n: 1 }"
           l-init="n = 2" l-cloak>
        <template l-for="item in items" l-key="item"><li l-text="item"></li></template>
        <template l-if="on"><p>yes</p></template>
        <input l-model="txt">
        <p l-text="txt" l-ref="para"></p>
        <p l-html="html"></p>
        <p l-show="on" l-transition="fade"></p>
        <button :disabled="!on" @click.prevent="on = !on" l-bind:title="txt" l-on:focus="n++">b</button>
        <p l-effect="void n"></p>
        <template l-teleport="body"><i>t</i></template>
      </div>`;
    Faqir.start();
    await tick();
    expect(fresh("directive")).toEqual([]);
  });

  it("reports one entry per element+attribute, however often the effect re-runs", async () => {
    document.body.innerHTML = `
      <div l-data="{ n: 0 }">
        <p id="dupe" l-nope="n"></p>
        <button id="bump" @click="n++">+</button>
      </div>`;
    Faqir.start();
    await tick();
    for (let i = 0; i < 5; i++) {
      (document.querySelector("#bump") as HTMLElement).click();
      await tick();
    }
    expect(fresh("directive").length).toBe(1);
  });
});

describe("warning class: unkeyed l-for reorder", () => {
  const REORDER = `
    <div l-data="{ items: ['a','b','c'] }">
      <ul><template l-for="item in items"><li l-text="item"></li></template></ul>
      <button @click="items = [items[2], items[0], items[1]]">reorder</button>
    </div>`;

  it("logs the hint exactly once when an unkeyed list reorders", async () => {
    document.body.innerHTML = REORDER;
    Faqir.start();
    await tick();
    expect(fresh("reorder").length).toBe(0); // silent until an actual reorder

    (document.querySelector("button") as HTMLElement).click();
    await tick();
    expect(fresh("reorder").length).toBe(1);
    expect(fresh("reorder")[0].message).toContain("reordered without l-key");

    (document.querySelector("button") as HTMLElement).click();
    await tick();
    expect(fresh("reorder").length).toBe(1); // still exactly once per list
  });

  it("stays silent when a keyed list reorders", async () => {
    document.body.innerHTML = `
      <div l-data="{ items: [{id:1,t:'a'},{id:2,t:'b'},{id:3,t:'c'}] }">
        <ul><template l-for="item in items" l-key="item.id"><li l-text="item.t"></li></template></ul>
        <button @click="items = [items[2], items[0], items[1]]">reorder</button>
      </div>`;
    Faqir.start();
    await tick();
    (document.querySelector("button") as HTMLElement).click();
    await tick();
    expect(fresh("reorder")).toEqual([]);
  });

  it("stays silent for an unkeyed in-place update (not a reorder)", async () => {
    document.body.innerHTML = `
      <div l-data="{ items: ['a','b','c'] }">
        <ul><template l-for="item in items"><li l-text="item"></li></template></ul>
        <button @click="items = ['x','b','c']">update</button>
      </div>`;
    Faqir.start();
    await tick();
    (document.querySelector("button") as HTMLElement).click();
    await tick();
    expect(fresh("reorder")).toEqual([]);
  });
});

describe("warning class: l-html notices", () => {
  it("notes that l-html is unsanitized, once per element", async () => {
    document.body.innerHTML = `
      <div l-data="{ body: '<b>hi</b>', n: 0 }">
        <article id="rich" l-html="body"></article>
        <button id="bump" @click="n++; body = '<i>' + n + '</i>'">+</button>
      </div>`;
    Faqir.start();
    await tick();

    const entry = fresh("html")[0];
    expect(entry).toBeDefined();
    expect(entry.expression).toBe("body");
    expect(entry.element).toBe("article#rich");
    expect(entry.message).toContain("unsanitized");

    for (let i = 0; i < 3; i++) {
      (document.querySelector("#bump") as HTMLElement).click();
      await tick();
    }
    expect(fresh("html").length).toBe(1);
  });

  it("says nothing for l-text", async () => {
    document.body.innerHTML = `<div l-data="{ t: 'x' }"><p l-text="t"></p></div>`;
    Faqir.start();
    await tick();
    expect(fresh("html")).toEqual([]);
  });
});

describe("recorded diagnostics", () => {
  it("every entry carries the documented keys", async () => {
    document.body.innerHTML = `<div l-data="{}"><p id="e" l-text="a.b"></p></div>`;
    Faqir.start();
    await tick();
    const entry = fresh("expression")[0];
    for (const key of ["kind", "message", "element", "html"]) {
      expect(Object.keys(entry)).toContain(key);
    }
  });

  it("is readable through the installed devtools handle", async () => {
    document.body.innerHTML = `<div l-data="{}"><p l-text="a.b"></p></div>`;
    Faqir.start();
    await tick();
    expect(DEVTOOLS.warnings().length).toBeGreaterThan(0);
    expect(DEVTOOLS.dev).toBe(true);
  });
});
