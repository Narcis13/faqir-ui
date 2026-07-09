import { describe, it, expect } from "bun:test";
import { uid, clamp, debounce, throttle } from "../../registry/core/utils.js";

describe("utils", () => {
  describe("uid", () => {
    it("generates unique IDs", () => {
      const a = uid();
      const b = uid();
      expect(a).not.toBe(b);
    });

    it("uses default prefix", () => {
      const id = uid();
      expect(id.startsWith("faqir-")).toBe(true);
    });

    it("uses custom prefix", () => {
      const id = uid("dialog");
      expect(id.startsWith("dialog-")).toBe(true);
    });
  });

  describe("clamp", () => {
    it("returns value when within range", () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it("clamps to min when below range", () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it("clamps to max when above range", () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it("handles equal min and max", () => {
      expect(clamp(5, 3, 3)).toBe(3);
    });

    it("handles negative ranges", () => {
      expect(clamp(0, -10, -5)).toBe(-5);
    });
  });

  describe("debounce", () => {
    it("delays execution", async () => {
      let count = 0;
      const fn = debounce(() => { count++; }, 10);

      fn();
      fn();
      fn();

      expect(count).toBe(0);
      await new Promise((r) => setTimeout(r, 20));
      expect(count).toBe(1);
    });

    it("resets timer on each call", async () => {
      let count = 0;
      const fn = debounce(() => { count++; }, 30);

      fn();
      await new Promise((r) => setTimeout(r, 15));
      fn(); // reset timer
      await new Promise((r) => setTimeout(r, 15));
      expect(count).toBe(0); // still waiting

      await new Promise((r) => setTimeout(r, 25));
      expect(count).toBe(1);
    });
  });

  describe("throttle", () => {
    it("executes immediately on first call", () => {
      let count = 0;
      const fn = throttle(() => { count++; }, 100);
      fn();
      expect(count).toBe(1);
    });

    it("blocks rapid subsequent calls", () => {
      let count = 0;
      const fn = throttle(() => { count++; }, 100);
      fn();
      fn();
      fn();
      expect(count).toBe(1);
    });

    it("allows calls after throttle period", async () => {
      let count = 0;
      const fn = throttle(() => { count++; }, 10);
      fn();
      expect(count).toBe(1);

      await new Promise((r) => setTimeout(r, 20));
      fn();
      expect(count).toBe(2);
    });
  });
});
