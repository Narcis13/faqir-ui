// ═══════════════════════════════════════════════════════════════════════════
// l-source — declarative server-data directive · test suite  [task 0.3-07]
// ═══════════════════════════════════════════════════════════════════════════
//
// `l-source` shipped with zero tests. This suite is authored against the
// SHIPPED behavior of registry/core/faqir-core.js (assembled from
// src/core-src/engine.js §3.5). It codifies what the directive *does* today;
// where that diverges from what the docs promise, the divergence is asserted
// as current-behavior and filed as a note for task 0.3-08 (see DEFECTS below).
//
// ───────────────────────────────────────────────────────────────────────────
// CONTRACT (as shipped) — the reference
// ───────────────────────────────────────────────────────────────────────────
// Syntax:  l-source:<name>[.<modifier>...]="<endpoint>"  on an l-data (scope) el.
//
// Injects into the scope, for `l-source:items="/api/items"`:
//   items          Array    the fetched rows (starts as [])
//   itemsLoading   boolean  true while a load() is in flight (starts false)
//   itemsError     string   error message, or null (starts null)
//   $items         object   the CRUD controller (see below)
//
//   NOTE: state is exposed as FLAT scope vars (items / itemsLoading /
//   itemsError), NOT as properties of the controller. `$items.loading`,
//   `$items.error`, `$items.submitting` do NOT exist on the shipped controller.
//
// Controller ($items):
//   load()              GET <endpoint>; sets Loading, populates rows, sets Error
//   create(payload)     POST <endpoint>; appends created row; returns created|null
//   update(id, payload) PATCH <endpoint>/<id>; replaces matched row; returns updated|null
//   remove(id)          DELETE <endpoint>/<id>; splices matched row
//   refresh()           alias for load()
//   startPolling(ms?)   setInterval(load, ms || pollInterval || 30000)
//   stopPolling()       clearInterval
//
// State transitions:
//   load():   Loading=true, Error=null → fetch
//             ok:   rows = Array.isArray(body) ? body : [body];  then Loading=false
//             !ok:  throw `${status} ${statusText}` → Error=message; rows unchanged; Loading=false
//             rej:  Error = err.message; rows unchanged; Loading=false
//   A non-array JSON body is wrapped: `{...}` becomes `[{...}]`.
//   Row lookup for update/remove is by opts.idKey (default "id").
//
// Modifiers:
//   .lazy            do NOT auto-load on init (rows stay [] until load() called)
//   .optimistic      create/update/remove mutate rows locally BEFORE the server
//                    confirms, and roll back on failure
//   .poll            auto-load AND start a 30000ms poll timer
//   .poll.<n>        …with an <n>-millisecond interval
//   .key.<field>     use <field> as the id key for update/remove (default "id")
//
// Auto behavior on init: unless .lazy, load() fires immediately; if a poll
// interval > 0, startPolling() fires; a scope cleanup is registered that calls
// stopPolling().
//
// ───────────────────────────────────────────────────────────────────────────
// DEFECTS — surfaced by 0.3-07, RESOLVED in 0.3-08 (`l-source` teardown + audit)
// ───────────────────────────────────────────────────────────────────────────
// D1. Docs/impl API mismatch — RESOLVED (docs corrected). docs/data-driven-
//     rendering.md promised `$items.loading`/`.error`/`.submitting` and a
//     `.method` modifier that never shipped (the `.method="…"` syntax is even
//     incompatible with the directive, whose value slot is the endpoint).
//     Reconciled by correcting the docs to the shipped flat-var contract
//     (`itemsLoading`/`itemsError` + a methods-only `$items` controller) —
//     which is what the playground already used. Pinned by the "reconciled
//     contract [D1]" block below.
// D2. No request sequencing — RESOLVED (AbortController supersede). A newer
//     load() now aborts the previous in-flight read and a monotonic seq guard
//     discards any stale response, so the latest CALL wins regardless of
//     resolution order. See the "rapid re-trigger" block.
// D3. No teardown of in-flight requests / no post-destroy write guard —
//     RESOLVED. Scope teardown (l-if hide, keyed l-for removal, or the new
//     public `Faqir.destroy` hook) latches a `destroyed` flag, stops `.poll`
//     timers, and aborts every in-flight AbortController; async write-backs are
//     gated so a late resolution cannot touch a dead scope. See "teardown &
//     abort [D3]".
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";

// faqir-core.js is a UMD module that attaches Faqir to globalThis on require.
const Faqir = require("../../registry/core/faqir-core.js");

// setTimeout(0) resolves after the microtask queue (incl. the reactive flush
// and the whole fetch().then() chain) drains — one tick settles a full load().
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// A Response-like object; the engine only touches .ok/.status/.statusText/.json.
function jsonResponse(body: any, status = 200, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  };
}
function okJson(body: any) {
  return Promise.resolve(jsonResponse(body));
}
function errStatus(status: number, statusText: string) {
  return Promise.resolve(jsonResponse(null, status, statusText));
}

// A promise whose settlement we control, to observe in-flight (loading) state.
function deferred<T = any>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// The scope lives on the l-data element after init; this is how markup-driven
// state is inspected and how controller methods ($items.*) are invoked.
function scopeOf(sel = "[l-data]"): any {
  return (document.querySelector(sel) as any).__faqirScope;
}

// Records fetch calls so endpoint/method/body can be asserted.
interface FetchCall { url: string; method: string; body?: string; }
function installFetch(handler: (url: string, opts: any) => Promise<any>) {
  const calls: FetchCall[] = [];
  (globalThis as any).fetch = (url: string, opts: any) => {
    calls.push({ url, method: (opts && opts.method) || "GET", body: opts && opts.body });
    return handler(url, opts);
  };
  return calls;
}

// ── Timer control (deterministic stand-in for fake timers) ──────────────────
// The engine calls the global setInterval/clearInterval at call time, so
// replacing them lets us assert the interval value, drive a "tick" by hand, and
// confirm teardown clears the timer — without real wall-clock waits.
interface FakeInterval { fn: () => void; ms: number; cleared: boolean; }
let fakeIntervals: FakeInterval[] = [];
let realSetInterval: any;
let realClearInterval: any;
function installFakeTimers() {
  fakeIntervals = [];
  realSetInterval = globalThis.setInterval;
  realClearInterval = globalThis.clearInterval;
  (globalThis as any).setInterval = (fn: any, ms: any) => {
    fakeIntervals.push({ fn, ms, cleared: false });
    return fakeIntervals.length; // 1-based, truthy id — real setInterval never returns 0
  };
  (globalThis as any).clearInterval = (id: any) => {
    if (fakeIntervals[id - 1]) fakeIntervals[id - 1].cleared = true;
  };
}
function restoreFakeTimers() {
  if (realSetInterval) (globalThis as any).setInterval = realSetInterval;
  if (realClearInterval) (globalThis as any).clearInterval = realClearInterval;
  realSetInterval = realClearInterval = undefined;
}

const realFetch = (globalThis as any).fetch;

// Guard: nothing in this suite should surface an unhandled rejection — every
// error path is caught inside the controller. (D-check for the error tests.)
const unhandled: any[] = [];
const onUnhandled = (e: any) => unhandled.push(e && e.reason ? e.reason : e);
beforeAll(() => { (process as any).on?.("unhandledRejection", onUnhandled); });
afterAll(() => { (process as any).off?.("unhandledRejection", onUnhandled); });

// ── Isolate from cross-test MutationObserver contamination ──────────────────
// faqir-core auto-bootstraps at require and on every Faqir.start(), each time
// attaching a MutationObserver to document.body that is never disconnected.
// Left alive, an observer from an earlier test (or an earlier test *file*)
// re-initializes the freshly inserted l-data node — re-running setupSource,
// double-firing fetch/timers and swapping out __faqirScope, which corrupts the
// call-count assertions here. We can't enumerate observers created before this
// module loaded, so instead we swap in a brand-new <body> before each test:
// every stale observer is left watching the old, detached body and can no
// longer see our nodes, while this test's own Faqir.start() observes the fresh
// one. Each test therefore gets exactly one clean init.
beforeEach(async () => {
  unhandled.length = 0;
  const freshBody = document.createElement("body");
  document.documentElement.replaceChild(freshBody, document.body);
  await tick();
});

afterEach(() => {
  restoreFakeTimers();
  (globalThis as any).fetch = realFetch;
});

// ═══════════════════════════════════════════════════════════════════════════
// Scope contract — what l-source injects
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · scope contract", () => {
  it("injects rows / loading / error / controller under the source name", async () => {
    installFetch(() => okJson([{ id: 1 }]));
    document.body.innerHTML = `<div l-data="{}" l-source:items="/api/items"></div>`;
    Faqir.start();
    await tick();

    const scope = scopeOf();
    expect(Array.isArray(scope.items)).toBe(true);          // `items`
    expect(scope).toHaveProperty("itemsLoading");            // `itemsLoading`
    expect(scope).toHaveProperty("itemsError");              // `itemsError`
    expect(typeof scope.$items).toBe("object");              // `$items` controller
  });

  it("exposes the full controller method surface on $name", async () => {
    installFetch(() => okJson([]));
    document.body.innerHTML = `<div l-data="{}" l-source:items="/api/items"></div>`;
    Faqir.start();
    await tick();

    const ctrl = scopeOf().$items;
    for (const m of ["load", "create", "update", "remove", "refresh", "startPolling", "stopPolling"]) {
      expect(typeof ctrl[m]).toBe("function");
    }
  });

  it("supports two independent sources on one scope", async () => {
    const calls = installFetch((url) =>
      url === "/api/tasks" ? okJson([{ id: 1 }, { id: 2 }]) : okJson([{ id: 9 }]));
    document.body.innerHTML =
      `<div l-data="{}" l-source:tasks="/api/tasks" l-source:categories="/api/categories"></div>`;
    Faqir.start();
    await tick();

    const scope = scopeOf();
    expect(scope.tasks.length).toBe(2);
    expect(scope.categories.length).toBe(1);
    expect(scope.$tasks).not.toBe(scope.$categories);
    expect(calls.map((c) => c.url).sort()).toEqual(["/api/categories", "/api/tasks"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Success path — loading lifecycle, data population, dependent re-render
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · success path", () => {
  it("drives the loading flag true→false across a full load and re-renders bindings", async () => {
    const d = deferred();
    installFetch(() => d.promise);
    document.body.innerHTML = `
      <div l-data="{}" l-source:items="/api/items">
        <span id="flag" l-text="itemsLoading"></span>
      </div>`;
    Faqir.start();
    await tick();

    const scope = scopeOf();
    const flag = document.querySelector("#flag")!;
    // load() ran during init and set Loading=true before the fetch settled.
    expect(scope.itemsLoading).toBe(true);
    expect(flag.textContent).toBe("true");   // dependent binding reflects loading

    d.resolve(jsonResponse([{ id: 1 }, { id: 2 }]));
    await tick();

    expect(scope.itemsLoading).toBe(false);
    expect(scope.itemsError).toBeNull();
    expect(scope.items).toEqual([{ id: 1 }, { id: 2 }]); // data populated
    expect(flag.textContent).toBe("false");             // binding re-rendered
  });

  it("wraps a single non-array JSON object into a one-element array", async () => {
    installFetch(() => okJson({ id: 1, name: "solo" }));
    document.body.innerHTML = `<div l-data="{}" l-source:items="/api/items"></div>`;
    Faqir.start();
    await tick();

    expect(scopeOf().items).toEqual([{ id: 1, name: "solo" }]);
  });

  it("refresh() re-fetches and replaces the rows", async () => {
    let payload = [{ id: 1 }];
    installFetch(() => okJson(payload));
    document.body.innerHTML = `<div l-data="{}" l-source:items="/api/items"></div>`;
    Faqir.start();
    await tick();
    expect(scopeOf().items).toEqual([{ id: 1 }]);

    payload = [{ id: 7 }, { id: 8 }];
    await scopeOf().$items.refresh();
    await tick();
    expect(scopeOf().items).toEqual([{ id: 7 }, { id: 8 }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Error path — non-2xx, network rejection, no unhandled rejection
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · error path", () => {
  it("maps a non-2xx response to `${status} ${statusText}` and clears loading", async () => {
    installFetch(() => errStatus(404, "Not Found"));
    document.body.innerHTML = `<div l-data="{}" l-source:items="/api/items">
        <span id="err" l-text="itemsError"></span>
      </div>`;
    Faqir.start();
    await tick();

    const scope = scopeOf();
    expect(scope.itemsError).toBe("404 Not Found");
    expect(scope.itemsLoading).toBe(false);
    expect(scope.items).toEqual([]);                       // rows untouched
    expect(document.querySelector("#err")!.textContent).toBe("404 Not Found");
    expect(unhandled).toHaveLength(0);
  });

  it("maps a network rejection to the error message and settles (no unhandled rejection)", async () => {
    installFetch(() => Promise.reject(new Error("Network down")));
    document.body.innerHTML = `<div l-data="{}" l-source:items.lazy="/api/items"></div>`;
    Faqir.start();
    await tick();

    // The returned promise RESOLVES (the controller catches internally) —
    // this is the deterministic proof there is no unhandled rejection.
    await expect(scopeOf().$items.load()).resolves.toBeUndefined();
    await tick();

    expect(scopeOf().itemsError).toBe("Network down");
    expect(scopeOf().itemsLoading).toBe(false);
    expect(unhandled).toHaveLength(0);
  });

  it("clears a prior error on the next successful load", async () => {
    let mode: "err" | "ok" = "err";
    installFetch(() => (mode === "err" ? errStatus(500, "Server Error") : okJson([{ id: 1 }])));
    document.body.innerHTML = `<div l-data="{}" l-source:items="/api/items"></div>`;
    Faqir.start();
    await tick();
    expect(scopeOf().itemsError).toBe("500 Server Error");

    mode = "ok";
    await scopeOf().$items.load();
    await tick();
    expect(scopeOf().itemsError).toBeNull();
    expect(scopeOf().items).toEqual([{ id: 1 }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Modifier · .lazy — no fetch until explicitly triggered
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · .lazy", () => {
  it("does not fetch on init and only loads when load() is called", async () => {
    const calls = installFetch(() => okJson([{ id: 1 }]));
    document.body.innerHTML = `<div l-data="{}" l-source:items.lazy="/api/items"></div>`;
    Faqir.start();
    await tick();

    expect(calls).toHaveLength(0);            // nothing fetched
    expect(scopeOf().items).toEqual([]);      // rows empty

    await scopeOf().$items.load();
    await tick();

    expect(calls).toHaveLength(1);            // fetched on demand
    expect(scopeOf().items).toEqual([{ id: 1 }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Modifier · .poll — auto-refresh on an interval (timers controlled by hand)
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · .poll", () => {
  it("auto-loads once and arms a timer at the given interval", async () => {
    installFakeTimers();
    const calls = installFetch(() => okJson([]));
    document.body.innerHTML = `<div l-data="{}" l-source:items.poll.5000="/api/items"></div>`;
    Faqir.start();
    await tick();

    expect(calls).toHaveLength(1);            // initial auto-load
    expect(fakeIntervals).toHaveLength(1);    // one poll timer
    expect(fakeIntervals[0].ms).toBe(5000);   // honored the .poll.<n> interval
  });

  it("re-fetches each time the interval fires", async () => {
    installFakeTimers();
    const calls = installFetch(() => okJson([]));
    document.body.innerHTML = `<div l-data="{}" l-source:items.poll.1000="/api/items"></div>`;
    Faqir.start();
    await tick();
    expect(calls).toHaveLength(1);

    fakeIntervals[0].fn();                    // advance one interval
    await tick();
    expect(calls).toHaveLength(2);

    fakeIntervals[0].fn();                    // and another
    await tick();
    expect(calls).toHaveLength(3);
  });

  it("defaults to a 30000ms interval when .poll carries no number", async () => {
    installFakeTimers();
    installFetch(() => okJson([]));
    document.body.innerHTML = `<div l-data="{}" l-source:items.poll="/api/items"></div>`;
    Faqir.start();
    await tick();

    expect(fakeIntervals).toHaveLength(1);
    expect(fakeIntervals[0].ms).toBe(30000);
  });

  it("stopPolling() clears the timer, and a scope cleanup is registered to do so on destroy", async () => {
    installFakeTimers();
    installFetch(() => okJson([]));
    document.body.innerHTML = `<div l-data="{}" l-source:items.poll.1000="/api/items"></div>`;
    Faqir.start();
    await tick();

    // A cleanup is registered on the scope root (fires on scope destruction).
    const root = document.querySelector("[l-data]") as any;
    expect(root.__faqirCleanups.length).toBeGreaterThan(0);

    scopeOf().$items.stopPolling();
    expect(fakeIntervals[0].cleared).toBe(true);

    // Running the registered cleanups is idempotent (no throw) and keeps it cleared.
    root.__faqirCleanups.forEach((fn: any) => fn());
    expect(fakeIntervals[0].cleared).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Modifier · .optimistic — local mutation before the server confirms
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · .optimistic", () => {
  async function seeded(modifiers: string, rows: any[]) {
    installFetch(() => okJson(rows));
    document.body.innerHTML = `<div l-data="{}" l-source:items${modifiers}="/api/items"></div>`;
    Faqir.start();
    await tick();
    return scopeOf();
  }

  it("create() shows a _pending row immediately, then swaps in the server row", async () => {
    const scope = await seeded(".optimistic", [{ id: 1, name: "a" }]);

    const d = deferred();
    installFetch(() => d.promise);                     // POST is held open
    const p = scope.$items.create({ name: "b" });

    // Applied locally before the server confirms.
    expect(scope.items.length).toBe(2);
    expect(scope.items[1]).toMatchObject({ name: "b", _pending: true });

    d.resolve(jsonResponse({ id: 2, name: "b" }));
    await p;
    await tick();

    expect(scope.items[1]).toEqual({ id: 2, name: "b" });   // temp replaced
    expect(scope.items[1]._pending).toBeUndefined();
  });

  it("create() rolls the optimistic row back out when the POST fails", async () => {
    const scope = await seeded(".optimistic", [{ id: 1, name: "a" }]);

    installFetch(() => errStatus(422, "Unprocessable"));
    const result = await scope.$items.create({ name: "bad" });
    await tick();

    expect(result).toBeNull();                          // create resolves null on failure
    expect(scope.items).toEqual([{ id: 1, name: "a" }]); // rolled back
    expect(scope.itemsError).toBe("422 Unprocessable");
  });

  it("update() applies the patch locally at once, then reconciles with the server row", async () => {
    const scope = await seeded(".optimistic", [{ id: 1, name: "a" }, { id: 2, name: "b" }]);

    const d = deferred();
    const calls = installFetch(() => d.promise);
    const p = scope.$items.update(2, { name: "B-local" });

    expect(scope.items[1]).toMatchObject({ id: 2, name: "B-local" }); // immediate
    expect(calls[0].url).toBe("/api/items/2");                        // PATCH endpoint/id
    expect(calls[0].method).toBe("PATCH");

    d.resolve(jsonResponse({ id: 2, name: "B-server" }));
    await p;
    await tick();
    expect(scope.items[1]).toEqual({ id: 2, name: "B-server" });      // server wins
  });

  it("update() rolls back to the snapshot when the PATCH fails", async () => {
    const scope = await seeded(".optimistic", [{ id: 1, name: "a" }]);

    installFetch(() => errStatus(500, "Boom"));
    await scope.$items.update(1, { name: "changed" });
    await tick();

    expect(scope.items[0]).toEqual({ id: 1, name: "a" });  // restored
    expect(scope.itemsError).toBe("500 Boom");
  });

  it("remove() splices immediately and re-inserts on failure", async () => {
    const scope = await seeded(".optimistic", [{ id: 1 }, { id: 2 }, { id: 3 }]);

    // Success: gone immediately, stays gone.
    const okCalls = installFetch(() => okJson({}));
    await scope.$items.remove(2);
    await tick();
    expect(scope.items.map((r: any) => r.id)).toEqual([1, 3]);
    expect(okCalls[0].url).toBe("/api/items/2");
    expect(okCalls[0].method).toBe("DELETE");

    // Failure: removed row is restored at its original index.
    installFetch(() => errStatus(500, "Nope"));
    await scope.$items.remove(1);
    await tick();
    expect(scope.items.map((r: any) => r.id)).toEqual([1, 3]);
    expect(scope.itemsError).toBe("500 Nope");
  });

  it("without .optimistic, create() does NOT touch rows until the server responds", async () => {
    const scope = await seeded("", [{ id: 1, name: "a" }]);

    const d = deferred();
    installFetch(() => d.promise);
    const p = scope.$items.create({ name: "b" });

    expect(scope.items.length).toBe(1);                 // no local row yet
    d.resolve(jsonResponse({ id: 2, name: "b" }));
    await p;
    await tick();
    expect(scope.items).toEqual([{ id: 1, name: "a" }, { id: 2, name: "b" }]); // appended on success
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Modifier · .key — custom id field for update / remove
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · .key", () => {
  it("uses the custom key to locate rows for update", async () => {
    installFetch(() => okJson([{ slug: "a", name: "A" }, { slug: "b", name: "B" }]));
    document.body.innerHTML =
      `<div l-data="{}" l-source:items.optimistic.key.slug="/api/items"></div>`;
    Faqir.start();
    await tick();
    const scope = scopeOf();

    const calls = installFetch(() => okJson({ slug: "b", name: "B2" }));
    await scope.$items.update("b", { name: "B2" });
    await tick();

    expect(calls[0].url).toBe("/api/items/b");          // endpoint/<slug>
    expect(scope.items[1]).toEqual({ slug: "b", name: "B2" });
  });

  it("uses the custom key to locate rows for optimistic remove", async () => {
    installFetch(() => okJson([{ slug: "x" }, { slug: "y" }]));
    document.body.innerHTML =
      `<div l-data="{}" l-source:items.optimistic.key.slug="/api/items"></div>`;
    Faqir.start();
    await tick();
    const scope = scopeOf();

    installFetch(() => okJson({}));
    await scope.$items.remove("x");
    await tick();
    expect(scope.items.map((r: any) => r.slug)).toEqual(["y"]);
  });

  it("with the default key, an optimistic update on a keyless row is a no-op locally", async () => {
    // Rows have `slug` but no `id`; the default idKey ("id") matches nothing, so
    // the optimistic path finds no index and applies nothing before the server.
    installFetch(() => okJson([{ slug: "a", name: "A" }]));
    document.body.innerHTML = `<div l-data="{}" l-source:items.optimistic="/api/items"></div>`;
    Faqir.start();
    await tick();
    const scope = scopeOf();

    const d = deferred();
    installFetch(() => d.promise);
    scope.$items.update("a", { name: "A2" });
    expect(scope.items[0]).toEqual({ slug: "a", name: "A" }); // unchanged — key didn't match
    d.resolve(jsonResponse({ slug: "a", name: "A2" }));
    await tick();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Interaction with l-for over fetched arrays
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · l-for integration", () => {
  it("renders one node per fetched row once the load resolves", async () => {
    const d = deferred();
    installFetch(() => d.promise);
    document.body.innerHTML = `
      <div l-data="{}" l-source:items="/api/items">
        <ul><template l-for="it in items"><li l-text="it.name"></li></template></ul>
      </div>`;
    Faqir.start();
    await tick();
    expect(document.querySelectorAll("li").length).toBe(0);   // empty while loading

    d.resolve(jsonResponse([{ name: "x" }, { name: "y" }, { name: "z" }]));
    await tick();

    const lis = Array.from(document.querySelectorAll("li"));
    expect(lis.length).toBe(3);
    expect(lis.map((n) => n.textContent)).toEqual(["x", "y", "z"]);
  });

  it("a single-object response renders exactly one row (wrap applies to l-for too)", async () => {
    installFetch(() => okJson({ name: "only" }));
    document.body.innerHTML = `
      <div l-data="{}" l-source:items="/api/items">
        <ul><template l-for="it in items"><li l-text="it.name"></li></template></ul>
      </div>`;
    Faqir.start();
    await tick();

    const lis = document.querySelectorAll("li");
    expect(lis.length).toBe(1);
    expect(lis[0].textContent).toBe("only");
  });

  it("an optimistic create appends a rendered row before the server confirms", async () => {
    installFetch(() => okJson([{ id: 1, name: "a" }]));
    document.body.innerHTML = `
      <div l-data="{}" l-source:items.optimistic="/api/items">
        <ul><template l-for="it in items"><li l-text="it.name"></li></template></ul>
      </div>`;
    Faqir.start();
    await tick();
    expect(document.querySelectorAll("li").length).toBe(1);

    const d = deferred();
    installFetch(() => d.promise);
    scopeOf().$items.create({ name: "b" });
    await tick();
    // Pending row is on screen before the POST settles.
    expect(Array.from(document.querySelectorAll("li")).map((n) => n.textContent)).toEqual(["a", "b"]);

    d.resolve(jsonResponse({ id: 2, name: "b" }));
    await tick();
    expect(document.querySelectorAll("li").length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Rapid re-trigger — request sequencing via AbortController supersede [D2 · 0.3-08]
// The 0.3-07 suite pinned the OLD racy semantics ("resolves last wins") and
// filed the fix as a todo. 0.3-08 landed the AbortController supersede, so both
// tests below now assert the FIXED contract: the latest CALL wins, regardless
// of resolution order, and the superseded request is aborted.
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · rapid re-trigger", () => {
  it("aborts the superseded (older) request and ignores its late resolution [D2]", async () => {
    document.body.innerHTML = `<div l-data="{}" l-source:items.lazy="/api/items"></div>`;
    Faqir.start();
    await tick();
    const scope = scopeOf();

    const first = deferred();   // returned to call #1 (the older request)
    const second = deferred();  // returned to call #2 (the newer request)
    let n = 0;
    const signals: any[] = [];
    (globalThis as any).fetch = (_url: string, opts: any) => {
      signals.push(opts && opts.signal);
      return ++n === 1 ? first.promise : second.promise;
    };

    const pOld = scope.$items.load();  // call #1
    const pNew = scope.$items.load();  // call #2 supersedes #1

    // The newer call aborts the older request's signal at call time.
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    // Settle the NEWER request first, then the OLDER one.
    second.resolve(jsonResponse([{ id: "new" }]));
    await tick();
    expect(scope.items).toEqual([{ id: "new" }]);

    // The stale older response, resolving last, is discarded — it does not
    // clobber the fresh data, nor does it re-arm the loading flag.
    first.resolve(jsonResponse([{ id: "old" }]));
    await Promise.all([pOld, pNew]);
    await tick();

    expect(scope.items).toEqual([{ id: "new" }]);
    expect(scope.itemsLoading).toBe(false);
    expect(unhandled).toHaveLength(0);
  });

  it("the latest CALL wins even when an older request resolves later [D2]", async () => {
    document.body.innerHTML = `<div l-data="{}" l-source:items.lazy="/api/items"></div>`;
    Faqir.start();
    await tick();
    const scope = scopeOf();

    const first = deferred();   // call #1
    const second = deferred();  // call #2 (the latest)
    let n = 0;
    (globalThis as any).fetch = () => (++n === 1 ? first.promise : second.promise);

    scope.$items.load();  // call #1 (older)
    scope.$items.load();  // call #2 (newer)

    // Resolve the OLDER request LAST — under the old racy semantics this would
    // win; with supersede sequencing the NEWER call's data is what lands.
    second.resolve(jsonResponse([{ id: "new" }]));
    await tick();
    first.resolve(jsonResponse([{ id: "old" }]));
    await tick();

    expect(scope.items).toEqual([{ id: "new" }]);
    expect(scope.itemsLoading).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Teardown & abort — no fetch or timer outlives its scope [D3 · 0.3-08]
// Teardown is driven the realistic way (l-if toggle, keyed l-for removal) and
// via the public Faqir.destroy hook. Each asserts the AbortController signal
// fires and that a late resolution cannot write into the dead scope.
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · teardown & abort [D3]", () => {
  // Second [l-data] in the tree is the inner, l-source-bearing scope.
  function innerScope(): any {
    return (document.querySelectorAll("[l-data]")[1] as any).__faqirScope;
  }
  function outerScope(): any {
    return (document.querySelectorAll("[l-data]")[0] as any).__faqirScope;
  }

  it("aborts an in-flight fetch on l-if hide and ignores its late resolution", async () => {
    const d = deferred();
    let signal: AbortSignal | undefined;
    (globalThis as any).fetch = (_url: string, opts: any) => {
      signal = opts && opts.signal;
      return d.promise;
    };
    document.body.innerHTML = `
      <div l-data="{ show: true }">
        <template l-if="show">
          <section><div l-data="{}" l-source:items="/api/items"></div></section>
        </template>
      </div>`;
    Faqir.start();
    await tick();

    const inner = innerScope();
    expect(inner.itemsLoading).toBe(true);      // auto-load is in flight
    expect(signal).toBeDefined();
    expect(signal!.aborted).toBe(false);

    // Toggle the l-if false — destroys the inner scope, runs its cleanup.
    outerScope().show = false;
    await tick();

    expect(signal!.aborted).toBe(true);         // the in-flight fetch is aborted

    // A resolution that lands after destruction must not write into the scope.
    d.resolve(jsonResponse([{ id: 1 }, { id: 2 }]));
    await tick();
    expect(inner.items).toEqual([]);            // dead scope never populated
    expect(unhandled).toHaveLength(0);
  });

  it("aborts the removed row's in-flight fetch on keyed l-for removal", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    (globalThis as any).fetch = (_url: string, opts: any) => {
      signals.push(opts && opts.signal);
      return new Promise(() => {});           // never settles — stays in flight
    };
    document.body.innerHTML = `
      <div l-data="{ rows: [{ id: 1 }, { id: 2 }] }">
        <template l-for="r in rows" l-key="r.id">
          <section><div l-data="{}" l-source:items="/api/items"></div></section>
        </template>
      </div>`;
    Faqir.start();
    await tick();

    expect(signals).toHaveLength(2);            // one in-flight fetch per row
    expect(signals[0]!.aborted).toBe(false);
    expect(signals[1]!.aborted).toBe(false);

    // Remove the first keyed row — its scope is destroyed, the surviving row is reused.
    outerScope().rows = [{ id: 2 }];
    await tick();

    expect(signals[0]!.aborted).toBe(true);     // removed row's fetch aborted
    expect(signals[1]!.aborted).toBe(false);    // surviving row untouched
    expect(signals).toHaveLength(2);            // reuse did not spawn a new fetch
  });

  it("clears the poll timer on teardown, and no fetch fires afterward", async () => {
    installFakeTimers();
    const calls = installFetch(() => okJson([]));
    document.body.innerHTML = `
      <div l-data="{ show: true }">
        <template l-if="show">
          <section><div l-data="{}" l-source:items.poll.1000="/api/items"></div></section>
        </template>
      </div>`;
    Faqir.start();
    await tick();

    expect(calls).toHaveLength(1);              // initial auto-load
    expect(fakeIntervals).toHaveLength(1);      // poll armed

    outerScope().show = false;                  // teardown via l-if
    await tick();
    expect(fakeIntervals[0].cleared).toBe(true); // timer stopped

    // Even if the (now-dead) timer callback fired, the destroyed source refuses
    // to fetch — no request outlives the scope.
    const before = calls.length;
    fakeIntervals[0].fn();
    await tick();
    expect(calls.length).toBe(before);
  });

  it("Faqir.destroy(el) aborts in-flight requests and blocks post-destroy loads", async () => {
    const d = deferred();
    let signal: AbortSignal | undefined;
    (globalThis as any).fetch = (_url: string, opts: any) => {
      signal = opts && opts.signal;
      return d.promise;
    };
    document.body.innerHTML = `<div l-data="{}" l-source:items="/api/items"></div>`;
    Faqir.start();
    await tick();

    const root = document.querySelector("[l-data]") as any;
    const scope = root.__faqirScope;
    expect(scope.itemsLoading).toBe(true);

    Faqir.destroy(root);                        // imperative teardown
    expect(signal!.aborted).toBe(true);

    // Late resolution is ignored, and a fresh load() is a no-op (no new fetch).
    d.resolve(jsonResponse([{ id: 1 }]));
    await scope.$items.load();
    await tick();
    expect(scope.items).toEqual([]);
    expect(unhandled).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Reconciled contract [D1] — docs corrected to match the shipped flat-var API.
// The 0.3-07 suite flagged the divergence between docs (which promised
// $items.loading/.error/.submitting and a `.method` modifier) and the shipped
// impl (flat scope vars, no `.method`). 0.3-08 reconciled by correcting
// docs/data-driven-rendering.md to the shipped contract — matching the
// playground, which already used the flat vars. These tests pin that contract:
// state is flat scope vars, the controller carries methods only, and unknown
// modifiers are ignored.
// ═══════════════════════════════════════════════════════════════════════════

describe("l-source · reconciled contract [D1]", () => {
  it("controller carries methods only — no loading/error/submitting state", async () => {
    installFetch(() => okJson([]));
    document.body.innerHTML = `<div l-data="{}" l-source:items="/api/items"></div>`;
    Faqir.start();
    await tick();

    const ctrl = scopeOf().$items;
    // State lives on the flat scope vars (itemsLoading / itemsError), never on
    // the controller. The removed docs promised $items.loading/.error/.submitting.
    expect(ctrl.loading).toBeUndefined();
    expect(ctrl.error).toBeUndefined();
    expect(ctrl.submitting).toBeUndefined();
    expect(scopeOf()).toHaveProperty("itemsLoading");
    expect(scopeOf()).toHaveProperty("itemsError");
  });

  it("unknown modifiers are ignored — the source still auto-loads via GET", async () => {
    const calls = installFetch(() => okJson([]));
    document.body.innerHTML = `<div l-data="{}" l-source:items.method="/api/items"></div>`;
    Faqir.start();
    await tick();

    // The former `.method` docs are corrected away; parseSourceModifiers ignores
    // unrecognized modifiers, so the source auto-loads via GET as usual.
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("/api/items");
  });
});
