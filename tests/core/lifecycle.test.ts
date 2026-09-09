// ═══════════════════════════════════════════════════════════════════════════
// Engine lifecycle — teardown, ownership and re-entry  [W3-1]
// ═══════════════════════════════════════════════════════════════════════════
//
// Every case here is a leak that shipped, and each one failed silently: the
// page kept working, so nothing pointed at it until the same page had been
// mounted and torn down a few hundred times.
//
// The unifying cause is cleanup OWNERSHIP. `addCleanup` resolved an owner by
// walking up from the element the directive sat on, and three directives move
// that element before they register anything: `l-if` and `l-for` detach their
// own `<template>` (leaving nothing to walk up from), and `l-teleport` moves its
// subtree out of the scope root entirely. In all three cases the disposer was
// pushed onto nobody and dropped, with no error — `faqir-core.d.ts` says
// `destroy()` runs "the cleanups registered on `el` and its descendants", and
// for these three there were none to run.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A fresh <body>, so no earlier test's MutationObserver can see these nodes. */
beforeEach(async () => {
  const freshBody = document.createElement("body");
  document.documentElement.replaceChild(freshBody, document.body);
  await tick();
});

const realFetch = (globalThis as any).fetch;
afterEach(() => {
  (globalThis as any).fetch = realFetch;
});

const scopeOf = (sel = "[l-data]"): any => (document.querySelector(sel) as any).__faqirScope;

// ───────────────────────────────────────────────────────────────────────────
// l-if / l-for disposers reach Faqir.destroy()
// ───────────────────────────────────────────────────────────────────────────

describe("structural directives register a disposer the scope owns", () => {
  it("Faqir.destroy() stops an l-for from re-rendering", async () => {
    document.body.innerHTML = `
      <div id="root" l-data="{ items: [1, 2] }">
        <template l-for="n in items"><span class="row" l-text="n"></span></template>
      </div>`;
    Faqir.start();
    await tick();

    const root = document.getElementById("root")!;
    expect(root.querySelectorAll(".row").length).toBe(2);

    Faqir.destroy(root);
    scopeOf("#root").items = [1, 2, 3, 4, 5];
    await tick();

    // Before the fix the list effect was still subscribed and grew the DOM of a
    // destroyed scope — the "list kept growing in the live document" case.
    expect(root.querySelectorAll(".row").length).toBe(2);
  });

  it("Faqir.destroy() stops an l-if from toggling", async () => {
    document.body.innerHTML = `
      <div id="root" l-data="{ open: false }">
        <template l-if="open"><p class="panel">hi</p></template>
      </div>`;
    Faqir.start();
    await tick();

    const root = document.getElementById("root")!;
    expect(root.querySelectorAll(".panel").length).toBe(0);

    Faqir.destroy(root);
    scopeOf("#root").open = true;
    await tick();

    expect(root.querySelectorAll(".panel").length).toBe(0);
  });

  it("destroys a nested l-for inside an l-if branch", async () => {
    document.body.innerHTML = `
      <div id="root" l-data="{ open: true, items: [1] }">
        <template l-if="open">
          <div class="branch">
            <template l-for="n in items"><i class="row" l-text="n"></i></template>
          </div>
        </template>
      </div>`;
    Faqir.start();
    await tick();

    const root = document.getElementById("root")!;
    expect(root.querySelectorAll(".row").length).toBe(1);

    Faqir.destroy(root);
    scopeOf("#root").items = [1, 2, 3];
    await tick();

    // The nested list's anchor lives inside the branch element, so the recursive
    // walk has to reach it — an element-only walk cannot see a comment node.
    expect(root.querySelectorAll(".row").length).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// l-data on a cloned top node
// ───────────────────────────────────────────────────────────────────────────

describe("l-data on a structural directive's top node creates a scope", () => {
  it("evaluates the literal on an l-if branch", async () => {
    document.body.innerHTML = `
      <div id="root" l-data="{ open: true }">
        <template l-if="open">
          <div id="inner" l-data="{ label: 'from inner' }"><span l-text="label"></span></div>
        </template>
      </div>`;
    Faqir.start();
    await tick();

    const inner = document.getElementById("inner")!;
    // Previously the node was stamped with the PARENT scope, `label` resolved to
    // undefined and l-text rendered "".
    expect(inner.querySelector("span")!.textContent).toBe("from inner");
    expect((inner as any).__faqirScope).not.toBe(scopeOf("#root"));
  });

  it("issues the l-source fetch for a source declared inside an l-if", async () => {
    const urls: string[] = [];
    (globalThis as any).fetch = (url: string) => {
      urls.push(url);
      return Promise.resolve({ ok: true, status: 200, statusText: "OK", json: () => Promise.resolve([{ id: 1 }]) });
    };

    document.body.innerHTML = `
      <div id="root" l-data="{ open: true }">
        <template l-if="open">
          <div id="inner" l-data="{}" l-source:rows="/api/rows"></div>
        </template>
      </div>`;
    Faqir.start();
    await tick();

    // Zero fetches before the fix: nothing built a scope, so
    // processSourceDirectives never ran.
    expect(urls).toEqual(["/api/rows"]);
    expect((document.getElementById("inner") as any).__faqirScope.rows.length).toBe(1);
  });

  it("evaluates the literal on each l-for row", async () => {
    document.body.innerHTML = `
      <div id="root" l-data="{ items: ['a', 'b'] }">
        <template l-for="item in items">
          <div class="row" l-data="{ local: item }"><span l-text="local"></span></div>
        </template>
      </div>`;
    Faqir.start();
    await tick();

    // The row's `l-data` literal is evaluated against the ROW scope, so `item`
    // resolves — which it could not when the node was stamped with the row
    // scope and its literal never read at all.
    const spans = [...document.querySelectorAll(".row span")].map((s) => s.textContent);
    expect(spans).toEqual(["a", "b"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// l-model listeners
// ───────────────────────────────────────────────────────────────────────────

describe("l-model unbinds its DOM listener on destroy", () => {
  const cases: Array<[string, string, (el: any) => void, (s: any) => unknown, unknown]> = [
    ["text input", `<input l-model="v">`, (el) => { el.value = "typed"; el.dispatchEvent(new Event("input")); }, (s) => s.v, "seed"],
    ["checkbox", `<input type="checkbox" l-model="v">`, (el) => { el.checked = true; el.dispatchEvent(new Event("change")); }, (s) => s.v, "seed"],
    ["radio", `<input type="radio" value="r" l-model="v">`, (el) => { el.checked = true; el.dispatchEvent(new Event("change")); }, (s) => s.v, "seed"],
    ["select", `<select l-model="v"><option value="one">one</option></select>`, (el) => { el.value = "one"; el.dispatchEvent(new Event("change")); }, (s) => s.v, "seed"],
    ["faqir switch", `<input type="checkbox" data-ui="switch" l-model="v">`, (el) => { el.checked = true; el.dispatchEvent(new Event("change")); }, (s) => s.v, "seed"],
  ];

  for (const [name, markup, act, read, expected] of cases) {
    it(`${name}: a destroyed scope stops receiving input`, async () => {
      document.body.innerHTML = `<div id="root" l-data="{ v: 'seed' }">${markup}</div>`;
      Faqir.start();
      await tick();

      const root = document.getElementById("root")!;
      const scope = scopeOf("#root");
      Faqir.destroy(root);

      act(root.firstElementChild as any);
      await tick();

      // The effect was disposed and the listener was not, so every keystroke
      // after teardown still wrote into the dead scope.
      expect(read(scope)).toBe(expected);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// l-if node accounting
// ───────────────────────────────────────────────────────────────────────────

describe("l-if removes everything it inserted", () => {
  it("leaves no residue after ten toggles", async () => {
    document.body.innerHTML = `
      <div id="root" l-data="{ open: false }"><template l-if="open">
        <p class="a">one</p>
        <p class="b">two</p>
      </template></div>`;
    Faqir.start();
    await tick();

    const root = document.getElementById("root")!;
    const scope = scopeOf("#root");
    const baseline = root.childNodes.length; // the anchor comment (+ whitespace)

    for (let i = 0; i < 10; i++) {
      scope.open = true;
      await tick();
      scope.open = false;
      await tick();
    }

    // The template's whitespace text nodes were never in `insertedNodes` (it was
    // filtered to nodeType === 1), so each cycle left two more behind: 34 child
    // nodes where 2 were expected.
    expect(root.childNodes.length).toBe(baseline);
    expect(root.querySelectorAll("p").length).toBe(0);
  });

  it("still renders correctly after the toggles", async () => {
    document.body.innerHTML = `<div id="root" l-data="{ open: false }"><template l-if="open"><p class="a">one</p></template></div>`;
    Faqir.start();
    await tick();

    const scope = scopeOf("#root");
    for (let i = 0; i < 3; i++) {
      scope.open = true;
      await tick();
      scope.open = false;
      await tick();
    }
    scope.open = true;
    await tick();

    expect(document.querySelectorAll("#root .a").length).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// $watch
// ───────────────────────────────────────────────────────────────────────────

describe("$watch is disposed with its scope", () => {
  it("stops firing after Faqir.destroy()", async () => {
    let fired = 0;
    (globalThis as any).__watchSpy = () => { fired++; };

    document.body.innerHTML = `<div id="root" l-data="{ n: 0 }" l-init="$watch('n', () => __watchSpy())"></div>`;
    Faqir.start();
    await tick();

    const scope = scopeOf("#root");
    scope.n = 1;
    await tick();
    expect(fired).toBe(1);

    Faqir.destroy(document.getElementById("root")!);
    scope.n = 2;
    await tick();

    expect(fired).toBe(1);
    delete (globalThis as any).__watchSpy;
  });

  it("still returns the disposer for manual use", async () => {
    document.body.innerHTML = `<div id="root" l-data="{ n: 0 }"></div>`;
    Faqir.start();
    await tick();

    const scope = scopeOf("#root");
    let fired = 0;
    const dispose = scope.$watch("n", () => { fired++; });
    expect(typeof dispose).toBe("function");

    scope.n = 1;
    await tick();
    expect(fired).toBe(1);

    dispose();
    scope.n = 2;
    await tick();
    expect(fired).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// l-teleport
// ───────────────────────────────────────────────────────────────────────────

describe("l-teleport keeps its subtree's teardown", () => {
  it("disposes effects bound below the teleported node", async () => {
    document.body.innerHTML = `
      <div id="dest"></div>
      <div id="root" l-data="{ label: 'a' }">
        <div id="moved" l-teleport="#dest"><span id="probe" l-text="label"></span></div>
      </div>`;
    Faqir.start();
    await tick();

    const moved = document.getElementById("moved")!;
    expect(moved.parentElement!.id).toBe("dest");
    expect(document.getElementById("probe")!.textContent).toBe("a");

    // The teleported subtree is no longer a descendant of #root, so destroying
    // the scope has to reach it through the handle handleTeleport left behind.
    Faqir.destroy(document.getElementById("root")!);
    expect(document.getElementById("moved")).toBeNull();

    scopeOf("#root").label = "b";
    await tick();
    expect((moved.querySelector("#probe") as HTMLElement).textContent).toBe("a");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// l-cloak
// ───────────────────────────────────────────────────────────────────────────

describe("l-cloak is removed from content that arrives later", () => {
  it("uncloaks content rendered by l-if", async () => {
    document.body.innerHTML = `
      <div id="root" l-data="{ open: false }">
        <template l-if="open"><p id="branch" l-cloak>hi</p></template>
      </div>`;
    Faqir.start();
    await tick();

    (document.getElementById("root") as any).__faqirScope.open = true;
    await tick();

    // Bound before it was ever inserted, so this path does not go through the
    // observer at all.
    expect(document.getElementById("branch")!.hasAttribute("l-cloak")).toBe(false);
  });

  it("uncloaks a node appended after bootstrap", async () => {
    document.body.innerHTML = `<div id="host"></div>`;
    Faqir.start();
    await tick();

    const host = document.getElementById("host")!;
    host.innerHTML = `<div id="late" l-cloak><span id="deep" l-cloak>x</span></div>`;
    // Two turns: the observer delivers on a microtask, and a queue left by an
    // earlier test file can push this one turn further out.
    await tick();
    await tick();

    // The sweep used to run once, at the end of bootstrap. Anything inserted
    // afterwards kept the attribute — and the injected
    // `[l-cloak] { display: none !important }` rule then hid it forever.
    expect(document.getElementById("late")!.hasAttribute("l-cloak")).toBe(false);
    expect(document.getElementById("deep")!.hasAttribute("l-cloak")).toBe(false);
  });

  it("injects the cloak style exactly once across repeated starts", async () => {
    Faqir.start();
    Faqir.start();
    await tick();
    expect(document.querySelectorAll("style[data-faqir-cloak]").length).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Faqir.start() twice
// ───────────────────────────────────────────────────────────────────────────

describe("Faqir.start() is safe to call again", () => {
  it("does not double-bind a handler on an already-initialized scope", async () => {
    let clicks = 0;
    (globalThis as any).__clickSpy = () => { clicks++; };

    document.body.innerHTML = `<div id="root" l-data="{}"><button id="btn" @click="__clickSpy()">go</button></div>`;
    Faqir.start();
    Faqir.start();
    await tick();

    document.getElementById("btn")!.dispatchEvent(new Event("click"));
    expect(clicks).toBe(1);
    delete (globalThis as any).__clickSpy;
  });

  it("does not double-bind a handler outside every scope root", async () => {
    let clicks = 0;
    (globalThis as any).__straySpy = () => { clicks++; };

    document.body.innerHTML = `<button id="stray" @click="__straySpy()">go</button>`;
    Faqir.start();
    Faqir.start();
    await tick();

    document.getElementById("stray")!.dispatchEvent(new Event("click"));
    expect(clicks).toBe(1);
    delete (globalThis as any).__straySpy;
  });

  it("still initializes markup added since the previous start()", async () => {
    document.body.innerHTML = `<div id="first" l-data="{ v: 'one' }"><span l-text="v"></span></div>`;
    Faqir.start();
    await tick();

    document.body.insertAdjacentHTML("beforeend", `<div id="second" l-data="{ v: 'two' }"><em l-text="v"></em></div>`);
    Faqir.start();
    await tick();

    expect(document.querySelector("#first span")!.textContent).toBe("one");
    expect(document.querySelector("#second em")!.textContent).toBe("two");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// A data source spread into l-data
// ───────────────────────────────────────────────────────────────────────────

describe("scope data can declare its own teardown", () => {
  it("runs __faqirTeardown when the scope is destroyed", async () => {
    let torn = 0;
    (globalThis as any).__makeSource = () => ({
      rows: [] as any[],
      __faqirTeardown: () => { torn++; },
    });

    document.body.innerHTML = `<div id="root" l-data="{ ...__makeSource() }"></div>`;
    Faqir.start();
    await tick();
    expect(torn).toBe(0);

    Faqir.destroy(document.getElementById("root")!);
    // This is what stops `apiSource()`'s setInterval poll and its in-flight
    // fetches: without it a page kept one live poller per route ever visited.
    expect(torn).toBe(1);

    delete (globalThis as any).__makeSource;
  });

  it("keeps the hook out of the devtools scope snapshot", async () => {
    (globalThis as any).__makeSource = () => ({ rows: [], __faqirTeardown: () => {} });
    document.body.innerHTML = `<div id="root" l-data="{ ...__makeSource() }"></div>`;
    Faqir.start();
    await tick();

    const snapshot = Faqir.inspect("#root").scope;
    expect(Object.keys(snapshot)).toEqual(["rows"]);
    delete (globalThis as any).__makeSource;
  });
});
