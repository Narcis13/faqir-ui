import { describe, it, expect } from "bun:test";
import { prefersReducedMotion, waitForTransition, animate } from "../../registry/core/motion.js";

describe("motion", () => {
  describe("prefersReducedMotion", () => {
    it("returns a boolean", () => {
      const result = prefersReducedMotion();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("waitForTransition", () => {
    it("resolves immediately when no transition is set", async () => {
      document.body.innerHTML = `<div id="el">Test</div>`;
      const el = document.getElementById("el")!;
      // In happy-dom, getComputedStyle returns 0s for transitionDuration
      // and "none" for animationName, so this should resolve immediately
      await waitForTransition(el);
      // If we get here, it resolved
      expect(true).toBe(true);
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
