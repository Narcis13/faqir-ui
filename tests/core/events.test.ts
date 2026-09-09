import { describe, it, expect, beforeEach } from "bun:test";
import { delegate, once, onOutsideClick } from "../../registry/core/events.js";

describe("events", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("delegate", () => {
    it("calls handler when matching descendant is clicked", () => {
      document.body.innerHTML = `
        <div id="root">
          <button data-part="trigger">Click</button>
          <span>Other</span>
        </div>
      `;
      const root = document.getElementById("root")!;
      let called = false;
      let targetEl: Element | null = null;

      delegate(root, "click", "[data-part='trigger']", (_e: Event, target: Element) => {
        called = true;
        targetEl = target;
      });

      root.querySelector("[data-part='trigger']")!.dispatchEvent(
        new Event("click", { bubbles: true })
      );

      expect(called).toBe(true);
      expect(targetEl!.getAttribute("data-part")).toBe("trigger");
    });

    it("does not call handler for non-matching elements", () => {
      document.body.innerHTML = `
        <div id="root">
          <button data-part="trigger">Click</button>
          <span id="other">Other</span>
        </div>
      `;
      const root = document.getElementById("root")!;
      let called = false;

      delegate(root, "click", "[data-part='trigger']", () => {
        called = true;
      });

      document.getElementById("other")!.dispatchEvent(
        new Event("click", { bubbles: true })
      );

      expect(called).toBe(false);
    });

    it("returns a cleanup function", () => {
      document.body.innerHTML = `<div id="root"><button data-part="trigger">X</button></div>`;
      const root = document.getElementById("root")!;
      let count = 0;

      const cleanup = delegate(root, "click", "[data-part='trigger']", () => {
        count++;
      });

      const btn = root.querySelector("[data-part='trigger']")!;
      btn.dispatchEvent(new Event("click", { bubbles: true }));
      expect(count).toBe(1);

      cleanup();
      btn.dispatchEvent(new Event("click", { bubbles: true }));
      expect(count).toBe(1);
    });
  });

  describe("once", () => {
    it("fires handler only once", () => {
      document.body.innerHTML = `<button id="btn">X</button>`;
      const btn = document.getElementById("btn")!;
      let count = 0;

      once(btn, "click", () => { count++; });

      btn.dispatchEvent(new Event("click"));
      btn.dispatchEvent(new Event("click"));
      btn.dispatchEvent(new Event("click"));

      expect(count).toBe(1);
    });

    it("returns a cleanup that cancels before firing", () => {
      document.body.innerHTML = `<button id="btn">X</button>`;
      const btn = document.getElementById("btn")!;
      let count = 0;

      const cancel = once(btn, "click", () => { count++; });
      cancel();

      btn.dispatchEvent(new Event("click"));
      expect(count).toBe(0);
    });
  });

  describe("onOutsideClick", () => {
    it("fires when clicking outside the element", () => {
      document.body.innerHTML = `<div id="inside">In</div><div id="outside">Out</div>`;
      const inside = document.getElementById("inside")!;
      let called = false;

      onOutsideClick(inside, () => { called = true; });

      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect(called).toBe(true);
    });

    it("does not fire when clicking inside the element", () => {
      // `expect(typeof called).toBe("boolean")` used to stand here — an
      // assertion that cannot fail, on the one case this function exists to get
      // right. The handler listens on `document` and asks `el.contains(target)`,
      // so the event has to REACH document from the child for the question to be
      // asked at all: the assertion below is preceded by the check that it did.
      // [W3-5]
      document.body.innerHTML = `<div id="target"><span id="child">In</span></div>`;
      const target = document.getElementById("target")!;
      const child = target.querySelector("#child")!;
      let called = false;
      let reachedDocument = false;

      const witness = () => { reachedDocument = true; };
      document.addEventListener("pointerdown", witness);
      onOutsideClick(target, () => { called = true; });

      child.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      document.removeEventListener("pointerdown", witness);

      expect(reachedDocument, "the event never reached document — the case was not exercised").toBe(true);
      expect(called).toBe(false);
    });

    it("returns a cleanup function", () => {
      document.body.innerHTML = `<div id="target">X</div>`;
      const target = document.getElementById("target")!;
      let count = 0;

      const cleanup = onOutsideClick(target, () => { count++; });
      cleanup();

      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect(count).toBe(0);
    });
  });
});
