// ═══════════════════════════════════════════════════════════════════════════
// Engine runtime fixes for 1.1  [1.1 runtime fixes]
// ═══════════════════════════════════════════════════════════════════════════
//
// One regression per defect the 1.1 code evaluation reproduced in the engine
// (docs/code-evaluation-1.1.md). Every case mounts into a disposable container
// and destroys it afterwards — never `Faqir.start()` / `initTree(document.body)`,
// which would leak into every later file sharing this happy-dom realm.

import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const Faqir = require("../../registry/core/faqir-core.js");

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let container: HTMLElement | null = null;

function unmount() {
  if (!container) return;
  Faqir.destroy(container);
  container.remove();
  container = null;
}

/** Mount `markup` (one l-data root) into a fresh container and bind it. */
async function mount(markup: string) {
  unmount();
  container = document.createElement("div");
  container.innerHTML = markup;
  document.body.appendChild(container);
  Faqir.initTree(container.firstElementChild as Element);
  await tick();
  const root = container.firstElementChild as HTMLElement & { __faqirScope: any };
  return { root, scope: root.__faqirScope };
}

const realFetch = (globalThis as any).fetch;
const realWarn = console.warn;
afterEach(() => {
  unmount();
  (globalThis as any).fetch = realFetch;
  console.warn = realWarn;
});

function deferred<T = any>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function json(body: any, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? "OK" : "Error", json: () => Promise.resolve(body) };
}

// ───────────────────────────────────────────────────────────────────────────
// l-for with duplicate keys
// ───────────────────────────────────────────────────────────────────────────

describe("keyed l-for with duplicate keys", () => {
  // oldMap.set(key, entry) overwrote the first of two rows sharing a key; that
  // row was then neither reused nor removed, so each render leaked one <li>.
  it("does not leak rows across re-renders and clears completely", async () => {
    const { root, scope } = await mount(`
      <div l-data="{ rows: [{ id: 1, t: 'a' }, { id: 1, t: 'b' }] }">
        <ul><template l-for="r in rows" l-key="r.id"><li l-text="r.t"></li></template></ul>
      </div>`);
    const lis = () => [...root.querySelectorAll("li")].map((li) => li.textContent);
    expect(lis()).toEqual(["a", "b"]);

    scope.rows = [{ id: 1, t: "c" }, { id: 1, t: "d" }];
    await tick();
    scope.rows = [{ id: 1, t: "e" }, { id: 1, t: "f" }];
    await tick();
    expect(lis()).toEqual(["e", "f"]);

    scope.rows = [];
    await tick();
    expect(lis()).toEqual([]);
  });

  it("reuses duplicate-key rows in order and removes only the surplus", async () => {
    const { root, scope } = await mount(`
      <div l-data="{ rows: [{ id: 1, t: 'a' }, { id: 1, t: 'b' }, { id: 2, t: 'c' }] }">
        <ul><template l-for="r in rows" l-key="r.id"><li l-text="r.t"></li></template></ul>
      </div>`);
    const before = [...root.querySelectorAll("li")];

    scope.rows = [{ id: 2, t: "C" }, { id: 1, t: "A" }];
    await tick();
    const after = [...root.querySelectorAll("li")];
    expect(after.map((li) => li.textContent)).toEqual(["C", "A"]);
    expect(after[0]).toBe(before[2]);
    expect(after[1]).toBe(before[0]);
    expect(before[1].isConnected).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// l-model.number.trim
// ───────────────────────────────────────────────────────────────────────────

describe("l-model modifier order", () => {
  it(".number.trim writes a number instead of throwing on trim()", async () => {
    const { root, scope } = await mount(`
      <div l-data="{ n: 0 }"><input l-model.number.trim="n" /></div>`);
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => errors.push(e.error);
    window.addEventListener("error", onError);
    try {
      const input = root.querySelector("input") as HTMLInputElement;
      input.value = "  42.5  ";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();
      expect(scope.n).toBe(42.5);
      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener("error", onError);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// l-source: id encoding and identity-based optimistic rollback
// ───────────────────────────────────────────────────────────────────────────

describe("l-source", () => {
  it("encodes the id path segment for update and remove", async () => {
    const urls: string[] = [];
    (globalThis as any).fetch = (url: string) => {
      urls.push(url);
      return Promise.resolve(json({ id: "a/b?c" }));
    };
    const { scope } = await mount(`<div l-data="{}" l-source:items.lazy="/api/items"></div>`);
    await scope.$items.update("a/b?c", { t: 1 });
    await scope.$items.remove("a/b?c");
    expect(urls).toEqual(["/api/items/a%2Fb%3Fc", "/api/items/a%2Fb%3Fc"]);
  });

  // create() saved the temp row's INDEX and spliced it on failure. A load()
  // that landed while the POST was in flight replaced the list, so that index
  // pointed at a real row — which was deleted.
  it("a failed optimistic create after an interleaved load() deletes no real row", async () => {
    const post = deferred<any>();
    (globalThis as any).fetch = (_url: string, opts: any) =>
      opts && opts.method === "POST"
        ? post.promise
        : Promise.resolve(json([{ id: 1, t: "a" }, { id: 2, t: "b" }]));
    const { scope } = await mount(`<div l-data="{}" l-source:items.lazy.optimistic="/api/items"></div>`);
    scope.items = [{ id: 1, t: "a" }];

    const done = scope.$items.create({ t: "new" });
    expect(scope.items.length).toBe(2); // temp row at index 1
    await scope.$items.load(); // replaces the list: index 1 is now a real row
    post.resolve(json(null, 500));
    await done;

    expect(scope.items.map((r: any) => r.id)).toEqual([1, 2]);
    expect(scope.itemsError).toBe("500 Error");
  });

  it("a failed optimistic create after an interleaved remove() drops only its own temp row", async () => {
    const post = deferred<any>();
    (globalThis as any).fetch = (_url: string, opts: any) =>
      opts && opts.method === "POST" ? post.promise : Promise.resolve(json({}));
    const { scope } = await mount(`<div l-data="{}" l-source:items.lazy.optimistic="/api/items"></div>`);
    scope.items = [{ id: 1 }, { id: 2 }];

    const done = scope.$items.create({ t: "new" }); // temp at index 2
    await scope.$items.remove(1); // temp shifts to index 1
    scope.items.push({ id: 3 }); // index 2 is now a real row
    post.resolve(json(null, 500));
    await done;

    expect(scope.items.map((r: any) => r.id)).toEqual([2, 3]);
  });

  it("a successful optimistic create replaces its temp row wherever it moved", async () => {
    const post = deferred<any>();
    (globalThis as any).fetch = (_url: string, opts: any) =>
      opts && opts.method === "POST" ? post.promise : Promise.resolve(json({}));
    const { scope } = await mount(`<div l-data="{}" l-source:items.lazy.optimistic="/api/items"></div>`);
    scope.items = [{ id: 1 }, { id: 2 }];

    const done = scope.$items.create({ t: "new" });
    await scope.$items.remove(1);
    post.resolve(json({ id: 9, t: "new" }));
    await done;

    expect(scope.items.map((r: any) => r.id)).toEqual([2, 9]);
    expect(scope.items.some((r: any) => r._pending)).toBe(false);
  });

  it("a non-optimistic remove splices the row by id at resolution, not its old index", async () => {
    const del = deferred<any>();
    (globalThis as any).fetch = (_url: string, opts: any) =>
      opts && opts.method === "DELETE" ? del.promise : Promise.resolve(json({}));
    const { scope } = await mount(`<div l-data="{}" l-source:items.lazy="/api/items"></div>`);
    scope.items = [{ id: 1 }, { id: 2 }, { id: 3 }];

    const done = scope.$items.remove(2); // index 1 at call time
    scope.items.splice(0, 1); // row 2 is now index 0; index 1 is row 3
    del.resolve(json({}));
    await done;

    expect(scope.items.map((r: any) => r.id)).toEqual([3]);
  });
});

// apiSource spread into a reactive scope: `this.items` is a proxy there, and a
// raw-object identity search would never find the temp row. The temp handle is
// read back through the list so it compares against what the list returns.
describe("apiSource inside a reactive scope", () => {
  const SOURCE = readFileSync(join(import.meta.dir, "../../registry/core/api-source.js"), "utf8");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const apiSource = new Function(`${SOURCE}\nreturn apiSource;`)();

  it("locates its temp row by identity through the reactive proxy", async () => {
    const post = deferred<any>();
    (globalThis as any).fetch = (_url: string, opts: any) =>
      opts && opts.method === "POST" ? post.promise : Promise.resolve(json({}));
    const scope = Faqir.reactive({ ...apiSource("/api/items") });
    scope.items = [{ id: 1 }, { id: 2 }];

    const done = scope.create({ t: "new" });
    await scope.remove(1);
    post.resolve(json({ id: 9, t: "new" }));
    await done;
    expect(scope.items.map((r: any) => r.id)).toEqual([2, 9]);

    const failing = deferred<any>();
    (globalThis as any).fetch = () => failing.promise;
    const again = scope.create({ t: "x" });
    scope.items.unshift({ id: 0 });
    failing.resolve(json(null, 500));
    await again;
    expect(scope.items.map((r: any) => r.id)).toEqual([0, 2, 9]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Effect-loop cap
// ───────────────────────────────────────────────────────────────────────────

describe("effect flush cap", () => {
  // Past 100 flush iterations the engine cleared the pending set and returned
  // with no trace. The cap stays; dropping work must be reported.
  it("warns when it drops effects that keep re-triggering each other", async () => {
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); };
    const s = Faqir.reactive({ a: 0, b: 0 });
    const stopA = Faqir.effect(() => { s.b = s.a + 1; });
    const stopB = Faqir.effect(() => { s.a = s.b + 1; });
    try {
      s.a = 100;
      await tick();
      expect(warnings.some((w) => w.includes("Effect loop") && w.includes("100 flushes"))).toBe(true);
    } finally {
      stopA();
      stopB();
    }
  });
});
