import { describe, it, expect, beforeEach } from "bun:test";
import { getFocusableElements, focusFirst, trapFocus, releaseFocus } from "../../registry/core/focus.js";

describe("focus", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("getFocusableElements", () => {
    it("finds buttons, inputs, links, and tabindex elements", () => {
      document.body.innerHTML = `
        <div id="container">
          <button>Btn</button>
          <input type="text" />
          <a href="#">Link</a>
          <div tabindex="0">Focusable div</div>
          <div>Not focusable</div>
        </div>
      `;
      const container = document.getElementById("container")!;
      const focusable = getFocusableElements(container);
      expect(focusable.length).toBe(4);
    });

    it("excludes disabled elements", () => {
      document.body.innerHTML = `
        <div id="container">
          <button disabled>Disabled</button>
          <input type="text" disabled />
          <button>Enabled</button>
        </div>
      `;
      const container = document.getElementById("container")!;
      const focusable = getFocusableElements(container);
      expect(focusable.length).toBe(1);
    });

    it("excludes elements with tabindex=-1", () => {
      document.body.innerHTML = `
        <div id="container">
          <button tabindex="-1">Skip</button>
          <button>Keep</button>
        </div>
      `;
      const container = document.getElementById("container")!;
      const focusable = getFocusableElements(container);
      expect(focusable.length).toBe(1);
    });

    it("returns empty array for container with no focusable elements", () => {
      document.body.innerHTML = `<div id="container"><p>Text only</p></div>`;
      const container = document.getElementById("container")!;
      expect(getFocusableElements(container)).toEqual([]);
    });
  });

  describe("focusFirst", () => {
    it("focuses the first focusable element", () => {
      document.body.innerHTML = `
        <div id="container">
          <button id="first">First</button>
          <button id="second">Second</button>
        </div>
      `;
      const container = document.getElementById("container")!;
      const result = focusFirst(container);
      expect(result).toBe(true);
      expect(document.activeElement?.id).toBe("first");
    });

    it("returns false when no focusable elements", () => {
      document.body.innerHTML = `<div id="container"><p>Nothing</p></div>`;
      const container = document.getElementById("container")!;
      expect(focusFirst(container)).toBe(false);
    });
  });

  describe("trapFocus", () => {
    it("returns a cleanup function", () => {
      document.body.innerHTML = `<div id="trap"><button>A</button></div>`;
      const trap = document.getElementById("trap")!;
      const release = trapFocus(trap);
      expect(typeof release).toBe("function");
      release();
    });

    it("wraps Tab from last to first element", () => {
      document.body.innerHTML = `
        <div id="trap">
          <button id="a">A</button>
          <button id="b">B</button>
        </div>
      `;
      const trap = document.getElementById("trap")!;
      const cleanup = trapFocus(trap);

      // Focus last element
      const b = document.getElementById("b")!;
      b.focus();

      // Simulate Tab key
      let prevented = false;
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
      Object.defineProperty(event, "preventDefault", {
        value: () => { prevented = true; },
      });
      trap.dispatchEvent(event);

      expect(prevented).toBe(true);
      expect(document.activeElement?.id).toBe("a");

      cleanup();
    });

    it("wraps Shift+Tab from first to last element", () => {
      document.body.innerHTML = `
        <div id="trap">
          <button id="a">A</button>
          <button id="b">B</button>
        </div>
      `;
      const trap = document.getElementById("trap")!;
      const cleanup = trapFocus(trap);

      // Focus first element
      const a = document.getElementById("a")!;
      a.focus();

      // Simulate Shift+Tab key
      let prevented = false;
      const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true });
      Object.defineProperty(event, "preventDefault", {
        value: () => { prevented = true; },
      });
      trap.dispatchEvent(event);

      expect(prevented).toBe(true);
      expect(document.activeElement?.id).toBe("b");

      cleanup();
    });
  });

  describe("releaseFocus", () => {
    it("calls the cleanup function", () => {
      let called = false;
      releaseFocus(() => { called = true; });
      expect(called).toBe(true);
    });

    it("handles non-function input gracefully", () => {
      expect(() => releaseFocus(null as any)).not.toThrow();
    });
  });
});
