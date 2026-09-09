import { describe, it, expect, afterEach } from "bun:test";
import { prefersReducedMotion, waitForTransition, animate } from "../../registry/core/motion.js";

describe("motion", () => {
  describe("prefersReducedMotion", () => {
    // "returns a boolean" was the whole assertion — true of `() => false`, and
    // of a function that reads the wrong media query. What matters is that it
    // reports what the media query says, and that is what is asserted. [W3-5]
    const realMatchMedia = window.matchMedia;
    afterEach(() => {
      (window as any).matchMedia = realMatchMedia;
    });

    it("reports what the reduce query says", () => {
      const asked: string[] = [];
      (window as any).matchMedia = (query: string) => {
        asked.push(query);
        return { matches: true };
      };
      expect(prefersReducedMotion()).toBe(true);
      expect(asked).toEqual(["(prefers-reduced-motion: reduce)"]);

      (window as any).matchMedia = () => ({ matches: false });
      expect(prefersReducedMotion()).toBe(false);
    });
  });

  describe("waitForTransition", () => {
    it("resolves immediately when no transition is set", async () => {
      // `expect(true).toBe(true)` used to close this: a test that passes whether
      // or not the promise ever settles, because an un-settled `await` in bun is
      // a timeout with a different message rather than a failed assertion. The
      // race says what "immediately" means — within a microtask, before any
      // timer. [W3-5]
      document.body.innerHTML = `<div id="el">Test</div>`;
      const el = document.getElementById("el")!;

      const raced = await Promise.race([
        waitForTransition(el).then(() => "resolved"),
        new Promise((r) => setTimeout(() => r("still waiting"), 0)),
      ]);
      expect(raced).toBe("resolved");
    });

    it("returns a promise", () => {
      document.body.innerHTML = `<div id="el">Test</div>`;
      const el = document.getElementById("el")!;
      const result = waitForTransition(el);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("animate", () => {
    it("adds and removes a class", async () => {
      document.body.innerHTML = `<div id="el">Test</div>`;
      const el = document.getElementById("el")!;
      // With no actual transitions in happy-dom, it should resolve immediately
      await animate(el, "entering");
      expect(el.classList.contains("entering")).toBe(false);
    });

    it("returns a promise", () => {
      document.body.innerHTML = `<div id="el">Test</div>`;
      const el = document.getElementById("el")!;
      const result = animate(el, "fade-in");
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
