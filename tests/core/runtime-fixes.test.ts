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
import { settle } from "../helpers/settle";

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

// ───────────────────────────────────────────────────────────────────────────
// l-ref registers on the real scope root  [1.1F-01]
// ───────────────────────────────────────────────────────────────────────────

describe("l-ref registers on the scope root that $refs reads", () => {
  // `__faqirScope` also marks an `l-if` clone or an `l-for` row as initialised,
  // so `findScopeRoot` stopped there and the ref landed on the clone — never in
  // `$refs`. Teleported and stray elements had no stamped ancestor at all.

  it("finds a ref inside <template l-if>, and an l-effect can read it", async () => {
    const { scope } = await mount(`<div l-data="{ seen: '' }">
      <template l-if="true"><input l-ref="field" value="typed"></template>
      <span l-effect="seen = $refs.field ? $refs.field.value : 'none'"></span>
    </div>`);
    expect(scope.$refs.field).toBeInstanceOf(HTMLInputElement);
    expect(scope.seen).toBe("typed");
  });

  it("removes the ref when the l-if hides, and an outside effect follows it both ways", async () => {
    const { root, scope } = await mount(`<div l-data="{ open: false, seen: '' }">
      <p l-text="$refs.field ? $refs.field.value : 'none'"></p>
      <template l-if="open"><input l-ref="field" value="typed"></template>
    </div>`);
    const p = root.querySelector("p")!;
    expect(p.textContent).toBe("none");

    scope.open = true;
    await tick();
    expect(scope.$refs.field).toBe(root.querySelector("input"));
    expect(p.textContent).toBe("typed");

    scope.open = false;
    await tick();
    expect("field" in scope.$refs).toBe(false);
    expect(p.textContent).toBe("none");
  });

  it("in an l-for the last row wins, and removing that row clears it", async () => {
    const { root, scope } = await mount(`<div l-data="{ items: ['a', 'b', 'c'] }">
      <ul><template l-for="item in items"><li l-ref="row" l-text="item"></li></template></ul>
      <p l-text="$refs.row ? $refs.row.textContent : 'none'"></p>
    </div>`);
    expect(scope.$refs.row.textContent).toBe("c");
    expect(root.querySelector("p")!.textContent).toBe("c");

    scope.items.pop();
    await tick();
    expect(scope.$refs.row).toBeUndefined();
    expect(root.querySelector("p")!.textContent).toBe("none");
  });

  it("reads a row ref from inside the row's own expressions", async () => {
    const { root } = await mount(`<div l-data="{ items: ['x'] }">
      <template l-for="item in items"><b l-ref="cell" l-text="item"></b><i l-text="$refs.cell ? 'found' : 'missing'"></i></template>
    </div>`);
    expect(root.querySelector("i")!.textContent).toBe("found");
  });

  it("registers a ref under l-teleport on the scope that wrote it", async () => {
    const dest = document.createElement("div");
    dest.id = "ref-teleport-dest";
    document.body.appendChild(dest);
    try {
      const { root, scope } = await mount(`<div l-data="{}">
        <section l-teleport="#ref-teleport-dest" l-ref="panel"><input l-ref="inner"></section>
        <p l-text="$refs.inner ? 'found' : 'missing'"></p>
      </div>`);
      expect(dest.querySelector("section")).not.toBeNull();
      expect(scope.$refs.panel).toBe(dest.querySelector("section"));
      expect(scope.$refs.inner).toBe(dest.querySelector("input"));
      expect(root.querySelector("p")!.textContent).toBe("found");
    } finally {
      dest.remove();
    }
  });

  it("resolves a ref on a stray element against the document scope", async () => {
    // A stray element is only reached by bootstrap's unscoped sweep, so this
    // boots a private engine on a private window — never the shared document.
    const { Window } = await import("happy-dom");
    const win = new Window({ url: "https://faqir.test/" });
    try {
      win.document.body.innerHTML =
        `<output l-text="$refs.query ? $refs.query.value : 'none'"></output><input l-ref="query" value="hi">`;
      const source = readFileSync(join(import.meta.dir, "../../registry/core/faqir-core.js"), "utf8");
      new Function("window", "document", "globalThis", "setTimeout", "clearTimeout", source)(
        win, win.document, win, win.setTimeout.bind(win), win.clearTimeout.bind(win),
      );
      await new Promise((resolve) => win.setTimeout(resolve, 10));
      expect(win.document.querySelector("output")!.textContent).toBe("hi");
    } finally {
      await win.happyDOM.close();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 1.1F-02 — property-aware bindings + faqir:model
// ───────────────────────────────────────────────────────────────────────────

describe("1.1F-02 property-aware bindings", () => {
  it("a dirty radio follows the store after the user checked another", async () => {
    const { root, scope } = await mount(`
      <div l-data='{ "v": "a" }'>
        <input type="radio" name="g" value="a" l-model="v">
        <input type="radio" name="g" value="b" l-model="v">
      </div>`);
    const [a, b] = [...root.querySelectorAll("input")] as HTMLInputElement[];
    expect(a.checked).toBe(true);
    b.checked = true;
    b.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(scope.v).toBe("b");
    scope.v = "a";
    await tick();
    expect(a.checked).toBe(true);
    expect(b.checked).toBe(false);
  });

  it(":checked sets the property on a dirty checkbox", async () => {
    const { root, scope } = await mount(`<div l-data='{ "on": false }'><input type="checkbox" :checked="on"></div>`);
    const box = root.querySelector("input") as HTMLInputElement;
    box.checked = true; // the user's click: marks the control dirty
    scope.on = true;
    await tick();
    box.checked = false; // the user unchecks it
    scope.on = false;
    scope.on = true;
    await tick();
    expect(box.checked).toBe(true);
    scope.on = false;
    await tick();
    expect(box.checked).toBe(false);
  });

  it(":indeterminate sets the property", async () => {
    const { root, scope } = await mount(`<div l-data='{ "i": true }'><input type="checkbox" :indeterminate="i"></div>`);
    const box = root.querySelector("input") as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    scope.i = false;
    await tick();
    expect(box.indeterminate).toBe(false);
  });

  it(":value on a dirty input follows the store", async () => {
    const { root, scope } = await mount(`<div l-data='{ "t": "x" }'><input :value="t"></div>`);
    const input = root.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("x");
    input.value = "typed"; // dirty
    scope.t = "from-store";
    await tick();
    expect(input.value).toBe("from-store");
  });

  it("a store-driven l-model write announces faqir:model, not change", async () => {
    const { root, scope } = await mount(`<div l-data='{ "v": "a" }'><input type="radio" name="m" value="a" l-model="v"><input type="radio" name="m" value="b" l-model="v"></div>`);
    let model = 0, change = 0;
    root.addEventListener("faqir:model", () => model++);
    root.addEventListener("change", () => change++);
    scope.v = "b";
    await tick();
    expect(model).toBeGreaterThan(0);
    expect(change).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 1.1F-03 — inserted content starts its controllers before `l-init` and the
// first `l-effect` run, on every path: `l-if` / `l-for`, `Faqir.initTree`, and
// the MutationObserver. Order: bindings → insertion → controllers → inits.
// ───────────────────────────────────────────────────────────────────────────

// `id` is left off when the caller binds `:id`: happy-dom reads a `:id`
// attribute beside a static `id` as the same attribute (the `:style` trap).
const tgMarkup = (id: string, extra = "", staticId = true) => `
  <div data-ui="toggle-group" ${staticId ? `id="${id}"` : ""} data-mode="single" role="radiogroup" aria-label="Align" ${extra}>
    <label data-part="item"><input data-part="control" type="radio" name="${id}" value="left" l-model="align"><span data-part="label">Left</span></label>
    <label data-part="item"><input data-part="control" type="radio" name="${id}" value="center" l-model="align"><span data-part="label">Center</span></label>
  </div>`;

describe("1.1F-03 controllers start before l-init / l-effect in inserted content", () => {
  it("l-if: a toggle-group's l-init reaches $ui, and its data-state reflects the bound checked", async () => {
    const { root, scope } = await mount(`
      <div l-data='{ "show": false, "align": "center", "got": "unset", "atInit": "" }'>
        <template l-if="show">${tgMarkup("tg-if", `l-init="got = $ui('#tg-if') ? $ui('#tg-if').getValue() : null; atInit = $el.querySelector('#tg-if') ? 'in-doc' : 'detached'"`)}</template>
      </div>`);
    scope.show = true;
    await tick();
    expect(scope.got).toBe("center");
    expect(scope.atInit).toBe("in-doc");
    const items = [...root.querySelectorAll("#tg-if [data-part=item]")] as HTMLElement[];
    expect(items.map((i) => i.dataset.state)).toEqual(["off", "on"]);
  });

  it("l-if: an l-effect reading only $el.querySelector finds the content on its first run", async () => {
    const { scope } = await mount(`
      <div l-data='{ "show": false, "found": "unset" }'>
        <template l-if="show"><section l-effect="found = $el.querySelector('#x-if') ? 'yes' : 'no'"><span id="x-if"></span></section></template>
      </div>`);
    scope.show = true;
    await tick();
    expect(scope.found).toBe("yes");
  });

  it("l-for: each fresh row's l-init reaches its own controller", async () => {
    const { root, scope } = await mount(`
      <div l-data='{ "rows": [1], "align": "left", "seen": [] }'>
        <template l-for="r in rows">${tgMarkup("tg-row", `:id="'tg-row-' + r" l-init="seen.push($ui('#tg-row-' + r) ? r : 0)"`, false)}</template>
      </div>`);
    expect([...scope.seen]).toEqual([1]);
    scope.rows.push(2);
    await tick();
    expect([...scope.seen]).toEqual([1, 2]);
    expect(root.querySelectorAll("[data-ui=toggle-group]").length).toBe(2);
  });

  it("an l-if nested in an l-if runs its inits once the outer content is attached", async () => {
    const { scope } = await mount(`
      <div l-data='{ "a": false, "align": "left", "got": "unset" }'>
        <template l-if="a"><div><template l-if="true">${tgMarkup("tg-nest", `l-init="got = $ui('#tg-nest') ? 'api' : 'null'"`)}</template></div></template>
      </div>`);
    scope.a = true;
    await tick();
    expect(scope.got).toBe("api");
  });

  it("Faqir.initTree on a connected subtree starts its controllers before l-init", async () => {
    // A scope root's own `l-init` still runs before its children bind (as on a
    // static page), so the controller is there but nothing is checked yet.
    const { scope } = await mount(`
      <div l-data='{ "align": "center", "got": "unset" }' l-init="got = $ui('#tg-tree') ? 'api' : 'null'">${tgMarkup("tg-tree")}</div>`);
    expect(scope.got).toBe("api");
  });

  it("observer: content appended after boot reaches $ui in l-init", async () => {
    // No `initTree`, no `start()`: the engine auto-booted on `require`, and its
    // one MutationObserver picks the node up.
    // The appended node must be the scope root itself, in a record of its own:
    // under a plain wrapper the old descendant sweep happened to start the
    // controllers first.
    unmount();
    container = document.createElement("div");
    document.body.appendChild(container);
    await tick(); // deliver the container's own record first
    const tpl = document.createElement("div");
    tpl.innerHTML = `<div l-data='{ "align": "left", "got": "unset" }' l-init="got = $ui('#tg-obs') ? 'api' : 'null'">${tgMarkup("tg-obs")}</div>`;
    const root = tpl.firstElementChild as HTMLElement & { __faqirScope: any };
    container.appendChild(root);
    await settle(() => !!root.__faqirScope, "the observer to bind the appended scope");
    expect(root.__faqirScope.got).toBe("api");
  });
});
