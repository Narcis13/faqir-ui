import { describe, it, expect } from "bun:test";
import { $, $$, closest, create, owns, ownParts } from "../../registry/core/dom.js";

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

  describe("owns / ownParts", () => {
    const markup = `
      <div data-ui="dialog" id="root">
        <button data-part="close" id="direct"></button>
        <div data-ui="stack"><div data-ui="cluster">
          <button data-ui="button" data-part="close" id="wrapped"></button>
        </div></div>
        <div data-ui="popover"><button data-part="close" id="nested"></button></div>
        <div data-ui="card"><button data-part="close" id="in-card"></button></div>
      </div>
      <button data-part="close" id="outside"></button>`;

    it("owns a part directly inside, or inside layout primitives", () => {
      document.body.innerHTML = markup;
      const root = document.getElementById("root")!;
      expect(owns(root, document.getElementById("direct")!)).toBe(true);
      // The part carries data-ui itself: ownership starts at its parent.
      expect(owns(root, document.getElementById("wrapped")!)).toBe(true);
    });

    it("does not own a nested component's part, or one outside it", () => {
      document.body.innerHTML = markup;
      const root = document.getElementById("root")!;
      expect(owns(root, document.getElementById("nested")!)).toBe(false);
      expect(owns(root, document.getElementById("in-card")!)).toBe(false);
      expect(owns(root, document.getElementById("outside")!)).toBe(false);
    });

    it("ownParts lists only the owned parts, in document order", () => {
      document.body.innerHTML = markup;
      const root = document.getElementById("root")!;
      expect(ownParts(root, "close").map((el) => el.id)).toEqual(["direct", "wrapped"]);
      expect(ownParts(root, "trigger")).toEqual([]);
    });
  });
});
