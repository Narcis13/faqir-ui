import { describe, it, expect } from "bun:test";
import { createStore } from "../../registry/core/store.js";

describe("store", () => {
  describe("createStore", () => {
    it("returns initial value via get()", () => {
      const store = createStore(42);
      expect(store.get()).toBe(42);
    });

    it("updates value via set()", () => {
      const store = createStore("hello");
      store.set("world");
      expect(store.get()).toBe("world");
    });

    it("notifies subscribers on set()", () => {
      const store = createStore(0);
      const values: number[] = [];

      store.subscribe((v) => values.push(v));
      store.set(1);
      store.set(2);
      store.set(3);

      expect(values).toEqual([1, 2, 3]);
    });

    it("supports multiple subscribers", () => {
      const store = createStore("a");
      let sub1 = "";
      let sub2 = "";

      store.subscribe((v) => { sub1 = v; });
      store.subscribe((v) => { sub2 = v; });
      store.set("b");

      expect(sub1).toBe("b");
      expect(sub2).toBe("b");
    });

    it("unsubscribe stops notifications", () => {
      const store = createStore(0);
      const values: number[] = [];

      const unsub = store.subscribe((v) => values.push(v));
      store.set(1);
      unsub();
      store.set(2);

      expect(values).toEqual([1]);
    });

    it("works with object values", () => {
      const store = createStore({ count: 0, name: "test" });
      store.set({ count: 1, name: "updated" });
      expect(store.get()).toEqual({ count: 1, name: "updated" });
    });

    it("handles null and undefined", () => {
      const store = createStore<string | null>(null);
      expect(store.get()).toBeNull();
      store.set("value");
      expect(store.get()).toBe("value");
      store.set(null);
      expect(store.get()).toBeNull();
    });
  });
});
