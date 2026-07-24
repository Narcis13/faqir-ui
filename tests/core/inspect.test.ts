/**
 * `Faqir.inspect()` and the `window.__FAQIR_DEVTOOLS__` handle.  [task 0.7-12]
 *
 * Both ship in the PRODUCTION engine — they are the documented surface an agent
 * reads to answer "what is Faqir doing to this element?", not a debug extra.
 * This file therefore loads `registry/core/faqir-core.js` and nothing else; the
 * development build's extra diagnostics are covered by dev-build.test.ts.
 */
import { describe, it, expect, beforeEach } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");
// THIS engine's handle. `window.__FAQIR_DEVTOOLS__` is the same object in a
// browser, but the test suite shares one realm across files, so the global may
// belong to whichever build a sibling file loaded last. Faqir.devtools is the
// instance-bound name and is what these assertions use; that the global is
// installed at all is asserted separately below (and against a freshly
// evaluated engine in tests/build/core-package.test.ts).
const DEVTOOLS = Faqir.devtools;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The fixture page every case below inspects. */
const PAGE = `
  <main l-data="{ title: 'Cart', items: [{ sku: 'a', qty: 2 }], open: false }"
        data-prop-currency='"EUR"' id="cart">
    <h1 l-text="title" data-part="heading"></h1>
    <button id="toggle" @click.prevent="open = !open" :disabled="items.length === 0">go</button>
    <input id="field" l-model.number="items[0].qty">
    <div data-ui="tabs" data-variant="underline" data-size="sm" data-state="ready">
      <div data-part="list" role="tablist">
        <button data-part="trigger" role="tab" id="t1" aria-controls="p1" aria-selected="true">One</button>
        <button data-part="trigger" role="tab" id="t2" aria-controls="p2" aria-selected="false" tabindex="-1">Two</button>
      </div>
      <div data-part="panel" role="tabpanel" id="p1" aria-labelledby="t1">first</div>
      <div data-part="panel" role="tabpanel" id="p2" aria-labelledby="t2" hidden>second</div>
    </div>
  </main>
`;

beforeEach(async () => {
  document.body.innerHTML = "";
  await tick();
  document.body.innerHTML = PAGE;
  Faqir.start();
  await tick();
});

describe("Faqir.inspect() — resolution", () => {
  it("is exposed on the public API", () => {
    expect(typeof Faqir.inspect).toBe("function");
  });

  it("accepts a selector string as well as an element", () => {
    const byNode = Faqir.inspect(document.querySelector("#cart"));
    const bySelector = Faqir.inspect("#cart");
    expect(bySelector.el).toBe(byNode.el);
    expect(bySelector.scope).toEqual(byNode.scope);
  });

  it("returns null for a miss, for null, and for a non-element node", () => {
    expect(Faqir.inspect("#nothing-here")).toBeNull();
    expect(Faqir.inspect(null)).toBeNull();
    expect(Faqir.inspect(document.createTextNode("x"))).toBeNull();
  });

  it("reports no scope for an element outside every scope", () => {
    const orphan = document.createElement("p");
    document.body.appendChild(orphan);
    const snap = Faqir.inspect(orphan);
    expect(snap.scopeRoot).toBeNull();
    expect(snap.scopeId).toBeNull();
    expect(snap.scope).toBeNull();
  });
});

describe("Faqir.inspect() — scope", () => {
  it("reports the nearest scope root and its id for a descendant", () => {
    const root = document.querySelector("#cart")!;
    const snap = Faqir.inspect("#toggle");
    expect(snap.scopeRoot).toBe(root);
    expect(typeof snap.scopeId).toBe("number");
    expect(snap.scopeId).toBe((root as any).__scopeId);
  });

  it("snapshots l-data values and data-prop-* together", () => {
    const snap = Faqir.inspect("#cart");
    expect(snap.scope).toEqual({
      title: "Cart",
      items: [{ sku: "a", qty: 2 }],
      open: false,
      currency: "EUR",
    });
  });

  it("omits magics — the snapshot is author data only", () => {
    const keys = Object.keys(Faqir.inspect("#cart").scope);
    for (const magic of ["$el", "$refs", "$store", "$state", "$variant", "$ui", "$dispatch"]) {
      expect(keys).not.toContain(magic);
    }
  });

  it("tracks live values — a later inspect sees the new state", async () => {
    expect(Faqir.inspect("#cart").scope.open).toBe(false);
    (document.querySelector("#toggle") as HTMLElement).click();
    await tick();
    expect(Faqir.inspect("#cart").scope.open).toBe(true);
  });

  it("is a copy: mutating the snapshot leaves the live scope alone", async () => {
    const snap = Faqir.inspect("#cart");
    snap.scope.items[0].qty = 999;
    snap.scope.title = "tampered";
    await tick();
    expect(Faqir.inspect("#cart").scope.items[0].qty).toBe(2);
    expect(document.querySelector("h1")!.textContent).toBe("Cart");
  });

  it("registers no reactive dependency (inspecting never re-runs effects)", async () => {
    let runs = 0;
    const state = Faqir.reactive({ n: 0 });
    Faqir.effect(() => {
      runs++;
      void state.n;
    });
    expect(runs).toBe(1);
    Faqir.inspect("#cart");
    state.n = 1;
    await tick();
    expect(runs).toBe(2); // the effect's own dep only — inspect added none
  });

  it("collapses functions, elements, cycles and over-deep values", () => {
    const cyclic: any = { name: "loop" };
    cyclic.self = cyclic;
    document.body.innerHTML = `<div id="odd" l-data="{}"></div>`;
    Faqir.start();
    const scope = (document.querySelector("#odd") as any).__faqirScope;
    scope.fn = function namedFn() {};
    scope.node = document.body;
    scope.cyclic = cyclic;
    scope.deep = { a: { b: { c: { d: { e: 1 } } } } };
    scope.when = new Date("2026-07-25T00:00:00.000Z");

    const snap = Faqir.inspect("#odd").scope;
    expect(snap.fn).toBe("[Function namedFn]");
    expect(snap.node).toBe("[Element <body>]");
    expect(snap.cyclic).toEqual({ name: "loop", self: "[Circular]" });
    // deep=0, a=1, b=2, c=3 — the fourth level down is where the walk stops.
    expect(snap.deep.a.b.c).toEqual({ d: "[Depth]" });
    expect(snap.when).toBe("2026-07-25T00:00:00.000Z");
  });
});

describe("Faqir.inspect() — directives", () => {
  it("lists every directive form on the element, normalized", () => {
    const dirs = Faqir.inspect("#toggle").directives;
    expect(dirs).toEqual([
      { type: "on", arg: "click", expression: "open = !open", modifiers: ["prevent"], raw: "@click.prevent" },
      { type: "bind", arg: "disabled", expression: "items.length === 0", modifiers: [], raw: ":disabled" },
    ]);
  });

  it("reports `arg: null` for argument-less directives and keeps modifiers", () => {
    expect(Faqir.inspect("#field").directives).toEqual([
      { type: "model", arg: null, expression: "items[0].qty", modifiers: ["number"], raw: "l-model.number" },
    ]);
    expect(Faqir.inspect("h1").directives).toEqual([
      { type: "text", arg: null, expression: "title", modifiers: [], raw: "l-text" },
    ]);
  });

  it("returns an empty list for an element with no directives", () => {
    expect(Faqir.inspect("#p1").directives).toEqual([]);
  });
});

describe("Faqir.inspect() — controller", () => {
  it("reports the controller of the owning [data-ui], by identity", () => {
    const uiEl = document.querySelector('[data-ui="tabs"]') as any;
    const snap = Faqir.inspect("#t2"); // a part deep inside the component
    expect(snap.controller).not.toBeNull();
    expect(snap.controller.ui).toBe("tabs");
    expect(snap.controller.el).toBe(uiEl);
    expect(snap.controller.api).toBe(uiEl._faqirTabs);
  });

  it("lists the controller's methods, sorted", () => {
    expect(Faqir.inspect('[data-ui="tabs"]').controller.methods).toEqual([
      "activate",
      "destroy",
      "getActiveIndex",
    ]);
  });

  it("is null when the element has no component ancestor", () => {
    expect(Faqir.inspect("#toggle").controller).toBeNull();
  });
});

describe("Faqir.inspect() — protocol state", () => {
  it("reports the five protocol attributes, ui-scoped ones from the [data-ui]", () => {
    expect(Faqir.inspect("#t1").state).toEqual({
      ui: "tabs",
      part: "trigger",
      variant: "underline",
      size: "sm",
      state: "ready",
    });
  });

  it("follows live data-state changes", () => {
    const uiEl = document.querySelector('[data-ui="tabs"]')!;
    uiEl.setAttribute("data-state", "busy");
    expect(Faqir.inspect("#t1").state.state).toBe("busy");
  });

  it("reports nulls, not undefined, outside any component", () => {
    expect(Faqir.inspect("#toggle").state).toEqual({
      ui: null,
      part: null,
      variant: null,
      size: null,
      state: null,
    });
  });
});

describe("window.__FAQIR_DEVTOOLS__", () => {
  it("is installed with the documented stable keys", () => {
    expect(Object.keys(DEVTOOLS).sort()).toEqual([
      "components",
      "dev",
      "faqir",
      "inspect",
      "scopes",
      "stores",
      "version",
      "warnings",
    ]);
    expect(DEVTOOLS.version).toBe(1);
  });

  it("points at this engine — same inspect, same Faqir", () => {
    expect(DEVTOOLS.inspect).toBe(Faqir.inspect);
    expect(DEVTOOLS.faqir).toBe(Faqir);
  });

  it("is installed on window with the same documented shape", () => {
    const global = (globalThis as any).window.__FAQIR_DEVTOOLS__;
    expect(global).toBeDefined();
    expect(Object.keys(global).sort()).toEqual(Object.keys(DEVTOOLS).sort());
    expect(global.version).toBe(DEVTOOLS.version);
    expect(typeof global.inspect).toBe("function");
  });

  it("reports dev: false for the production engine", () => {
    expect(DEVTOOLS.dev).toBe(false);
  });

  it("lists declared scope roots with their data", () => {
    const scopes = DEVTOOLS.scopes();
    expect(scopes.length).toBeGreaterThan(0);
    const cart = scopes.find((s: any) => s.el.id === "cart");
    expect(cart.label).toBe('main#cart');
    expect(cart.id).toBe((document.querySelector("#cart") as any).__scopeId);
    expect(cart.scope.title).toBe("Cart");
  });

  it("lists mounted components with protocol attributes and their own parts", () => {
    const tabs = DEVTOOLS.components().find((c: any) => c.ui === "tabs");
    expect(tabs.variant).toBe("underline");
    expect(tabs.size).toBe("sm");
    expect(tabs.state).toBe("ready");
    expect(tabs.parts).toEqual(["list", "panel", "trigger"]);
    expect(tabs.controller).toBe(true);
    expect(tabs.label).toBe('div[data-ui="tabs"]');
  });

  it("snapshots global stores", () => {
    Faqir.store("session", { user: "ada", roles: ["admin"] });
    expect(DEVTOOLS.stores().session).toEqual({ user: "ada", roles: ["admin"] });
  });

  it("returns an empty warnings list — the production engine records none", () => {
    expect(DEVTOOLS.warnings()).toEqual([]);
  });

  it("scopes()/components() accept a subtree to search", () => {
    const ui = document.querySelector('[data-ui="tabs"]')!;
    expect(DEVTOOLS.components(ui).length).toBe(0); // querySelectorAll excludes self
    expect(DEVTOOLS.components(document.querySelector("#cart")!).length).toBe(1);
  });
});
