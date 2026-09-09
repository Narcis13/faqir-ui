// ═══════════════════════════════════════════════════════════════════════════
// apiSource() — the service-layer data source  [W3-1]
// ═══════════════════════════════════════════════════════════════════════════
//
// `registry/core/api-source.js` shipped with ZERO tests. 165 lines that `faqir
// init` copies into every project, that the generated skill documents, that
// `faqir context` describes three times and `faqir doctor` health-checks — and
// that no test imported. It does real `fetch`, optimistic create/update/remove
// with rollback, and `setInterval` polling; every happy path and every error
// path was unexercised.
//
// The file is a plain script that declares a global function (it is loaded with
// a <script> tag, before faqir-core.js), so it is evaluated here rather than
// imported.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "../../registry/core/api-source.js"), "utf8");

type ApiSource = {
  items: any[];
  loading: boolean;
  submitting: boolean;
  error: string | null;
  load(): Promise<void>;
  create(payload: any): Promise<any>;
  update(id: any, payload: any): Promise<any>;
  remove(id: any): Promise<void>;
  refresh(): Promise<void>;
  startPolling(interval?: number): void;
  stopPolling(): void;
  destroy(): void;
  __faqirTeardown: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const apiSource: (endpoint: string, options?: any) => ApiSource = new Function(
  `${SOURCE}\nreturn apiSource;`,
)();

// ── fetch double ────────────────────────────────────────────────────────────

interface Call { url: string; method: string; body?: string; signal?: AbortSignal }
let calls: Call[] = [];

function response(body: any, status = 200, statusText = "OK") {
  return { ok: status >= 200 && status < 300, status, statusText, json: () => Promise.resolve(body) };
}

/** Install a fetch that answers with `handler(url, opts)`; records every call. */
function installFetch(handler: (url: string, opts: any) => any) {
  calls = [];
  (globalThis as any).fetch = (url: string, opts: any) => {
    calls.push({ url, method: (opts && opts.method) || "GET", body: opts && opts.body, signal: opts && opts.signal });
    return Promise.resolve(handler(url, opts));
  };
}

function deferred<T = any>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const realFetch = (globalThis as any).fetch;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

interface FakeInterval { fn: () => void; ms: number; cleared: boolean }
let intervals: FakeInterval[] = [];
function installFakeTimers() {
  intervals = [];
  (globalThis as any).setInterval = (fn: any, ms: any) => {
    intervals.push({ fn, ms, cleared: false });
    return intervals.length; // 1-based so the id is always truthy
  };
  (globalThis as any).clearInterval = (id: any) => {
    if (intervals[id - 1]) intervals[id - 1].cleared = true;
  };
}

beforeEach(() => { calls = []; });
afterEach(() => {
  (globalThis as any).fetch = realFetch;
  (globalThis as any).setInterval = realSetInterval;
  (globalThis as any).clearInterval = realClearInterval;
});

// ═══════════════════════════════════════════════════════════════════════════
// Initial shape
// ═══════════════════════════════════════════════════════════════════════════

describe("apiSource · initial state", () => {
  it("starts empty, loading, not submitting, no error", () => {
    const s = apiSource("/api/items");
    expect(s.items).toEqual([]);
    expect(s.loading).toBe(true);   // true until the first load() settles
    expect(s.submitting).toBe(false);
    expect(s.error).toBeNull();
  });

  it("exposes the documented method surface", () => {
    const s = apiSource("/api/items");
    for (const m of ["load", "create", "update", "remove", "refresh", "startPolling", "stopPolling", "destroy"]) {
      expect(typeof (s as any)[m]).toBe("function");
    }
  });

  it("carries the engine's teardown hook as an own enumerable property", () => {
    const s = apiSource("/api/items");
    // It has to survive `{ ...apiSource(…) }`, which copies own enumerable
    // properties only — that spread is the documented way to install a source.
    expect(Object.keys(s)).toContain("__faqirTeardown");
    expect(typeof ({ ...s } as any).__faqirTeardown).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// load()
// ═══════════════════════════════════════════════════════════════════════════

describe("apiSource · load()", () => {
  it("GETs the endpoint and populates items", async () => {
    installFetch(() => response([{ id: 1 }, { id: 2 }]));
    const s = apiSource("/api/items");
    await s.load();

    expect(calls).toEqual([{ url: "/api/items", method: "GET", body: undefined, signal: calls[0].signal }]);
    expect(s.items.length).toBe(2);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("is loading while the request is in flight", async () => {
    const d = deferred();
    installFetch(() => d.promise);
    const s = apiSource("/api/items");
    s.loading = false;

    const p = s.load();
    expect(s.loading).toBe(true);
    d.resolve(response([]));
    await p;
    expect(s.loading).toBe(false);
  });

  it("records `<status> <statusText>` for a non-2xx response and keeps items", async () => {
    installFetch(() => response(null, 503, "Service Unavailable"));
    const s = apiSource("/api/items");
    s.items = [{ id: 9 }];
    await s.load();

    expect(s.error).toBe("503 Service Unavailable");
    expect(s.items).toEqual([{ id: 9 }]);
    expect(s.loading).toBe(false);
  });

  it("records the message of a rejected fetch", async () => {
    (globalThis as any).fetch = () => Promise.reject(new Error("network down"));
    const s = apiSource("/api/items");
    await s.load();

    expect(s.error).toBe("network down");
    expect(s.loading).toBe(false);
  });

  it("clears a previous error on the next successful load", async () => {
    installFetch(() => response(null, 500, "Server Error"));
    const s = apiSource("/api/items");
    await s.load();
    expect(s.error).toBe("500 Server Error");

    installFetch(() => response([{ id: 1 }]));
    await s.load();
    expect(s.error).toBeNull();
    expect(s.items.length).toBe(1);
  });

  it("refresh() is load()", async () => {
    installFetch(() => response([{ id: 1 }]));
    const s = apiSource("/api/items");
    await s.refresh();
    expect(calls.length).toBe(1);
    expect(s.items.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// create()
// ═══════════════════════════════════════════════════════════════════════════

describe("apiSource · create()", () => {
  it("POSTs JSON and replaces the optimistic row with the server's", async () => {
    installFetch(() => response({ id: 7, title: "saved" }));
    const s = apiSource("/api/items");

    const created = await s.create({ title: "draft" });

    expect(calls[0]).toMatchObject({ url: "/api/items", method: "POST", body: JSON.stringify({ title: "draft" }) });
    expect(created).toEqual({ id: 7, title: "saved" });
    expect(s.items).toEqual([{ id: 7, title: "saved" }]);
    expect(s.submitting).toBe(false);
  });

  it("shows the pending row before the server answers", async () => {
    const d = deferred();
    installFetch(() => d.promise);
    const s = apiSource("/api/items");

    const p = s.create({ title: "draft" });
    expect(s.items).toEqual([{ title: "draft", _pending: true }]);
    expect(s.submitting).toBe(true);

    d.resolve(response({ id: 1, title: "draft" }));
    await p;
    expect(s.items).toEqual([{ id: 1, title: "draft" }]);
  });

  it("rolls the optimistic row back when the server rejects it", async () => {
    installFetch(() => response(null, 422, "Unprocessable Entity"));
    const s = apiSource("/api/items");
    s.items = [{ id: 1 }];

    const created = await s.create({ title: "draft" });

    expect(created).toBeNull();
    expect(s.error).toBe("422 Unprocessable Entity");
    expect(s.items).toEqual([{ id: 1 }]);   // the temp row is gone
    expect(s.submitting).toBe(false);
  });

  it("rolls back on a rejected fetch too", async () => {
    (globalThis as any).fetch = () => Promise.reject(new Error("offline"));
    const s = apiSource("/api/items");
    const created = await s.create({ title: "draft" });

    expect(created).toBeNull();
    expect(s.error).toBe("offline");
    expect(s.items).toEqual([]);
  });

  it("with optimistic:false appends only after the server confirms", async () => {
    const d = deferred();
    installFetch(() => d.promise);
    const s = apiSource("/api/items", { optimistic: false });

    const p = s.create({ title: "draft" });
    expect(s.items).toEqual([]);            // nothing shown yet

    d.resolve(response({ id: 3 }));
    await p;
    expect(s.items).toEqual([{ id: 3 }]);
  });

  it("with optimistic:false leaves items untouched on failure", async () => {
    installFetch(() => response(null, 500, "Server Error"));
    const s = apiSource("/api/items", { optimistic: false });
    await s.create({ title: "draft" });

    expect(s.items).toEqual([]);
    expect(s.error).toBe("500 Server Error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// update()
// ═══════════════════════════════════════════════════════════════════════════

describe("apiSource · update()", () => {
  it("PATCHes <endpoint>/<id> and replaces the row", async () => {
    installFetch(() => response({ id: 2, title: "new" }));
    const s = apiSource("/api/items");
    s.items = [{ id: 1, title: "a" }, { id: 2, title: "old" }];

    const updated = await s.update(2, { title: "new" });

    expect(calls[0]).toMatchObject({ url: "/api/items/2", method: "PATCH", body: JSON.stringify({ title: "new" }) });
    expect(updated).toEqual({ id: 2, title: "new" });
    expect(s.items[1]).toEqual({ id: 2, title: "new" });
  });

  it("applies the change locally before the server answers", async () => {
    const d = deferred();
    installFetch(() => d.promise);
    const s = apiSource("/api/items");
    s.items = [{ id: 1, title: "old" }];

    const p = s.update(1, { title: "typed" });
    expect(s.items[0].title).toBe("typed");

    d.resolve(response({ id: 1, title: "typed" }));
    await p;
  });

  it("restores the snapshot when the server rejects it", async () => {
    installFetch(() => response(null, 409, "Conflict"));
    const s = apiSource("/api/items");
    s.items = [{ id: 1, title: "old", extra: true }];

    const updated = await s.update(1, { title: "typed" });

    expect(updated).toBeNull();
    expect(s.error).toBe("409 Conflict");
    expect(s.items[0]).toEqual({ id: 1, title: "old", extra: true });
  });

  it("honours a custom idKey", async () => {
    installFetch(() => response({ uuid: "u2", n: 1 }));
    const s = apiSource("/api/items", { idKey: "uuid" });
    s.items = [{ uuid: "u1" }, { uuid: "u2", n: 0 }];

    await s.update("u2", { n: 1 });
    expect(s.items[1]).toEqual({ uuid: "u2", n: 1 });
  });

  it("still calls the server for an id it does not hold", async () => {
    installFetch(() => response({ id: 99 }));
    const s = apiSource("/api/items");
    s.items = [{ id: 1 }];

    const updated = await s.update(99, { x: 1 });
    expect(calls[0].url).toBe("/api/items/99");
    expect(updated).toEqual({ id: 99 });
    expect(s.items).toEqual([{ id: 1 }]);   // nothing to replace
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// remove()
// ═══════════════════════════════════════════════════════════════════════════

describe("apiSource · remove()", () => {
  it("DELETEs <endpoint>/<id> and drops the row", async () => {
    installFetch(() => response(null, 204, "No Content"));
    const s = apiSource("/api/items");
    s.items = [{ id: 1 }, { id: 2 }];

    await s.remove(1);

    expect(calls[0]).toMatchObject({ url: "/api/items/1", method: "DELETE" });
    expect(s.items).toEqual([{ id: 2 }]);
    expect(s.error).toBeNull();
  });

  it("re-inserts the row at its old index when the server rejects", async () => {
    installFetch(() => response(null, 403, "Forbidden"));
    const s = apiSource("/api/items");
    s.items = [{ id: 1 }, { id: 2 }, { id: 3 }];

    await s.remove(2);

    expect(s.error).toBe("403 Forbidden");
    expect(s.items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);  // order preserved
  });

  it("with optimistic:false removes only after the server confirms", async () => {
    const d = deferred();
    installFetch(() => d.promise);
    const s = apiSource("/api/items", { optimistic: false });
    s.items = [{ id: 1 }, { id: 2 }];

    const p = s.remove(1);
    expect(s.items.length).toBe(2);

    d.resolve(response(null, 204, "No Content"));
    await p;
    expect(s.items).toEqual([{ id: 2 }]);
  });

  it("records a rejected fetch", async () => {
    (globalThis as any).fetch = () => Promise.reject(new Error("offline"));
    const s = apiSource("/api/items");
    s.items = [{ id: 1 }];

    await s.remove(1);
    expect(s.error).toBe("offline");
    expect(s.items).toEqual([{ id: 1 }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// polling
// ═══════════════════════════════════════════════════════════════════════════

describe("apiSource · polling", () => {
  it("startPolling() uses the constructor interval", () => {
    installFakeTimers();
    const s = apiSource("/api/items", { pollInterval: 5000 });
    s.startPolling();
    expect(intervals.length).toBe(1);
    expect(intervals[0].ms).toBe(5000);
  });

  it("an explicit argument overrides it", () => {
    installFakeTimers();
    const s = apiSource("/api/items", { pollInterval: 5000 });
    s.startPolling(250);
    expect(intervals[0].ms).toBe(250);
  });

  it("does nothing with no interval configured", () => {
    installFakeTimers();
    const s = apiSource("/api/items");
    s.startPolling();
    expect(intervals.length).toBe(0);
  });

  it("each tick loads", async () => {
    installFakeTimers();
    installFetch(() => response([{ id: 1 }]));
    const s = apiSource("/api/items", { pollInterval: 100 });
    s.startPolling();

    intervals[0].fn();
    intervals[0].fn();
    await Promise.resolve();
    expect(calls.length).toBe(2);
  });

  it("startPolling() twice clears the first timer", () => {
    installFakeTimers();
    const s = apiSource("/api/items", { pollInterval: 100 });
    s.startPolling();
    s.startPolling();
    expect(intervals[0].cleared).toBe(true);
    expect(intervals[1].cleared).toBe(false);
  });

  it("stopPolling() clears it, and is safe when nothing is running", () => {
    installFakeTimers();
    const s = apiSource("/api/items", { pollInterval: 100 });
    s.stopPolling();               // no throw
    s.startPolling();
    s.stopPolling();
    expect(intervals[0].cleared).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// destroy() — the teardown that did not exist
// ═══════════════════════════════════════════════════════════════════════════

describe("apiSource · destroy()", () => {
  it("stops the poll timer", () => {
    installFakeTimers();
    const s = apiSource("/api/items", { pollInterval: 100 });
    s.startPolling();
    s.destroy();
    expect(intervals[0].cleared).toBe(true);
  });

  it("aborts an in-flight request", async () => {
    const d = deferred();
    installFetch(() => d.promise);
    const s = apiSource("/api/items");

    const p = s.load();
    expect(calls[0].signal!.aborted).toBe(false);
    s.destroy();
    expect(calls[0].signal!.aborted).toBe(true);

    d.resolve(response([{ id: 1 }]));
    await p;
  });

  it("discards a response that lands after teardown", async () => {
    const d = deferred();
    installFetch(() => d.promise);
    const s = apiSource("/api/items");

    const p = s.load();
    s.destroy();
    d.resolve(response([{ id: 1 }]));
    await p;

    // A late write into a scope that no longer exists is the leak this closes.
    expect(s.items).toEqual([]);
    expect(s.error).toBeNull();
  });

  it("does not report an aborted request as an error", async () => {
    const err: any = new Error("The operation was aborted.");
    err.name = "AbortError";
    installFetch(() => Promise.reject(err));
    const s = apiSource("/api/items");

    const p = s.load();
    s.destroy();
    await p;
    expect(s.error).toBeNull();
  });

  it("starts no new work afterwards", async () => {
    installFetch(() => response([{ id: 1 }]));
    const s = apiSource("/api/items", { pollInterval: 100 });
    s.destroy();

    await s.load();
    await s.create({ x: 1 });
    await s.update(1, { x: 1 });
    await s.remove(1);
    installFakeTimers();
    s.startPolling();

    expect(calls.length).toBe(0);
    expect(intervals.length).toBe(0);
    expect(s.items).toEqual([]);
  });

  it("is idempotent", () => {
    installFakeTimers();
    const s = apiSource("/api/items", { pollInterval: 100 });
    s.startPolling();
    s.destroy();
    s.destroy();
    expect(intervals.filter((i) => !i.cleared).length).toBe(0);
  });

  it("__faqirTeardown is destroy(), bound", () => {
    installFakeTimers();
    const s = apiSource("/api/items", { pollInterval: 100 });
    s.startPolling();
    const teardown = s.__faqirTeardown;   // detached, as the engine calls it
    teardown();
    expect(intervals[0].cleared).toBe(true);
  });
});
