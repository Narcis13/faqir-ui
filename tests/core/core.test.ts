import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { $, $$, closest, create } from "../../registry/core/dom.js";
import { delegate, onOutsideClick, once } from "../../registry/core/events.js";
import { getFocusableElements, releaseFocus, trapFocus } from "../../registry/core/focus.js";
import { prefersReducedMotion, waitForTransition } from "../../registry/core/motion.js";
import { createStore } from "../../registry/core/store.js";
import { clamp, debounce, uid } from "../../registry/core/utils.js";

class FakeTarget {
  listeners = new Map();

  addEventListener(type, listener, options) {
    const list = this.listeners.get(type) ?? [];
    list.push({ listener, once: !!options?.once });
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((entry) => entry.listener !== listener));
  }

  dispatch(type, event = {}) {
    for (const entry of [...(this.listeners.get(type) ?? [])]) {
      event.type = type;
      entry.listener(event);
      if (entry.once) {
        this.removeEventListener(type, entry.listener);
      }
    }
  }
}

function withDocument(documentLike, run) {
  const previous = globalThis.document;
  globalThis.document = documentLike;
  try {
    return run();
  } finally {
    globalThis.document = previous;
  }
}

function focusable(name, documentLike, options = {}) {
  return {
    name,
    hidden: false,
    disabled: false,
    focus() {
      documentLike.activeElement = this;
    },
    ...options,
  };
}

describe("core modules", () => {
  test("stays under 3KB total", async () => {
    const root = process.cwd();
    const files = [
      "registry/core/dom.js",
      "registry/core/events.js",
      "registry/core/focus.js",
      "registry/core/motion.js",
      "registry/core/store.js",
      "registry/core/utils.js",
    ];
    const source = Buffer.concat(await Promise.all(files.map((file) => readFile(join(root, file)))));

    expect(gzipSync(source).byteLength).toBeLessThan(3072);
  });

  test("dom helpers query, match closest nodes, and create elements", () => {
    const item = { id: "a" };
    const root = {
      querySelector: (selector) => selector === ".item" ? item : null,
      querySelectorAll: () => [item, { id: "b" }],
    };
    const parent = { matched: true };
    const node = { closest: (selector) => selector === "[data-ui='x']" ? parent : null };
    const created = {
      tagName: "",
      attrs: {},
      children: [],
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
      append(...children) {
        this.children.push(...children);
      },
    };

    expect($(".item", root)).toBe(item);
    expect($$(".item", root)).toHaveLength(2);
    expect(closest(node, "[data-ui='x']")).toBe(parent);

    const element = withDocument({
      createElement(tagName) {
        created.tagName = tagName;
        return created;
      },
    }, () => create("button", { type: "button", disabled: true, title: null }, ["Label"]));

    expect(element).toBe(created);
    expect(created.tagName).toBe("button");
    expect(created.attrs).toEqual({ type: "button", disabled: "" });
    expect(created.children).toEqual(["Label"]);
  });

  test("event helpers support once, delegate, and outside click", () => {
    const target = new FakeTarget();
    const calls = [];
    const button = { id: "button" };

    const stopOnce = once(target, "click", (event) => calls.push(`once:${event.type}`));
    delegate(target, "click", "[data-part='trigger']", (event, match) => {
      calls.push(`${event.type}:${match.id}`);
    });
    onOutsideClick(target, { contains: (node) => node === button }, () => calls.push("outside"));

    target.contains = (node) => node === button;
    target.dispatch("click", {
      target: {
        closest: () => button,
      },
    });
    target.dispatch("click", {
      target: {
        closest: () => null,
      },
    });

    stopOnce();
    expect(calls).toEqual(["once:click", "click:button", "outside", "outside"]);
  });

  test("focus helpers filter hidden elements and cycle tab focus", () => {
    const documentLike = { activeElement: null };
    const first = focusable("first", documentLike);
    const hidden = focusable("hidden", documentLike, { hidden: true });
    const last = focusable("last", documentLike);
    const container = new FakeTarget();
    container.querySelectorAll = () => [first, hidden, last];

    withDocument(documentLike, () => {
      expect(getFocusableElements(container)).toEqual([first, last]);

      const stop = trapFocus(container);
      expect(documentLike.activeElement).toBe(first);

      documentLike.activeElement = last;
      const forward = { key: "Tab", shiftKey: false, prevented: false, preventDefault() { this.prevented = true; } };
      container.dispatch("keydown", forward);
      expect(forward.prevented).toBe(true);
      expect(documentLike.activeElement).toBe(first);

      documentLike.activeElement = first;
      const backward = { key: "Tab", shiftKey: true, prevented: false, preventDefault() { this.prevented = true; } };
      container.dispatch("keydown", backward);
      expect(backward.prevented).toBe(true);
      expect(documentLike.activeElement).toBe(last);

      stop();
      releaseFocus(container);
      expect(container.listeners.get("keydown")).toEqual([]);
    });
  });

  test("motion helpers detect reduced motion and settle on event or timeout", async () => {
    const previous = globalThis.matchMedia;

    globalThis.matchMedia = () => ({ matches: false });
    expect(prefersReducedMotion()).toBe(false);

    const target = new FakeTarget();
    const eventPromise = waitForTransition(target, 25);
    setTimeout(() => target.dispatch("transitionend"), 5);
    await expect(eventPromise).resolves.toBeUndefined();

    const timeoutPromise = waitForTransition(new FakeTarget(), 5);
    await expect(timeoutPromise).resolves.toBeUndefined();

    globalThis.matchMedia = () => ({ matches: true });
    expect(prefersReducedMotion()).toBe(true);
    await expect(waitForTransition(null)).resolves.toBeUndefined();

    globalThis.matchMedia = previous;
  });

  test("store exposes get, set, updater functions, and unsubscribe", () => {
    const store = createStore({ count: 1 });
    const seen = [];
    const unsubscribe = store.subscribe((state) => seen.push(state.count));

    expect(store.get()).toEqual({ count: 1 });
    expect(store.set((state) => ({ count: state.count + 1 }))).toEqual({ count: 2 });
    expect(store.get()).toEqual({ count: 2 });

    unsubscribe();
    store.set({ count: 3 });
    expect(seen).toEqual([2]);
  });

  test("utils clamp values, debounce calls, and mint ids", async () => {
    const values = [];
    const fn = debounce((value) => values.push(value), 10);

    fn("a");
    fn("b");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(values).toEqual(["b"]);
    expect(clamp(12, 0, 10)).toBe(10);
    expect(uid("dialog")).toMatch(/^dialog-\d+$/);
  });
});
