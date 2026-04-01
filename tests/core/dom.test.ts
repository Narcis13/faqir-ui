import { describe, it, expect } from "bun:test";
import { $, $$, closest, create } from "../../registry/core/dom.js";

describe("dom", () => {
  describe("$", () => {
    it("finds a single element", () => {
      document.body.innerHTML = `<div data-ui="button"><span data-part="icon">x</span></div>`;
      const el = $("[data-ui='button']");
      expect(el).not.toBeNull();
      expect(el!.getAttribute("data-ui")).toBe("button");
    });

    it("returns null when no match", () => {
      document.body.innerHTML = `<div></div>`;
      expect($("[data-ui='missing']")).toBeNull();
    });

    it("scopes queries to a parent", () => {
      document.body.innerHTML = `
        <div id="a"><span class="target">A</span></div>
        <div id="b"><span class="target">B</span></div>
      `;
      const scope = document.getElementById("b")!;
      const el = $(".target", scope);
      expect(el!.textContent).toBe("B");
    });
  });

  describe("$$", () => {
    it("returns all matching elements as an array", () => {
      document.body.innerHTML = `
        <button data-ui="button">1</button>
        <button data-ui="button">2</button>
        <button data-ui="button">3</button>
      `;
      const els = $$("[data-ui='button']");
      expect(Array.isArray(els)).toBe(true);
      expect(els.length).toBe(3);
    });

    it("returns empty array when no match", () => {
      document.body.innerHTML = `<div></div>`;
      expect($$("[data-ui='missing']")).toEqual([]);
    });
  });

  describe("closest", () => {
    it("finds ancestor matching selector", () => {
      document.body.innerHTML = `<div data-ui="card"><div data-part="body"><span id="inner">hi</span></div></div>`;
      const inner = document.getElementById("inner")!;
      const card = closest(inner, "[data-ui='card']");
      expect(card).not.toBeNull();
      expect(card!.getAttribute("data-ui")).toBe("card");
    });

    it("returns null when no ancestor matches", () => {
      document.body.innerHTML = `<div><span id="inner">hi</span></div>`;
      const inner = document.getElementById("inner")!;
      expect(closest(inner, "[data-ui='card']")).toBeNull();
    });
  });

  describe("create", () => {
    it("creates an element with tag", () => {
      const el = create("div");
      expect(el.tagName.toLowerCase()).toBe("div");
    });

    it("sets attributes", () => {
      const el = create("button", { "data-ui": "button", "data-variant": "primary" });
      expect(el.getAttribute("data-ui")).toBe("button");
      expect(el.getAttribute("data-variant")).toBe("primary");
    });

    it("appends text children", () => {
      const el = create("span", {}, "Hello");
      expect(el.textContent).toBe("Hello");
    });

    it("appends element children", () => {
      const child = create("span", {}, "inner");
      const parent = create("div", {}, child);
      expect(parent.children.length).toBe(1);
      expect(parent.children[0].textContent).toBe("inner");
    });

    it("appends mixed children", () => {
      const icon = create("span", { "data-part": "icon" }, "*");
      const el = create("button", { "data-ui": "button" }, icon, "Click me");
      expect(el.childNodes.length).toBe(2);
      expect(el.textContent).toBe("*Click me");
    });
  });
});
