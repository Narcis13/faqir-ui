import { afterEach, describe, expect, test } from "bun:test";
import { createMenuNavigation } from "../../registry/core/menu-navigation.js";

function key(target: Element, value: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function menu(markup = "") {
  document.body.innerHTML = `<div role="menu">${markup}</div>`;
  return document.querySelector('[role="menu"]') as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shared menu navigation", () => {
  test("moves vertically, wraps, and handles Home/End", () => {
    const root = menu(`
      <button role="menuitem">One</button>
      <button role="menuitem">Two</button>
      <button role="menuitem">Three</button>`);
    const items = [...root.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
    const nav = createMenuNavigation(root);

    items[0].focus();
    expect(key(items[0], "ArrowDown").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[1]);
    key(items[1], "End");
    expect(document.activeElement).toBe(items[2]);
    key(items[2], "ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    key(items[0], "ArrowUp");
    expect(document.activeElement).toBe(items[2]);
    key(items[2], "Home");
    expect(document.activeElement).toBe(items[0]);

    nav.destroy();
  });

  test("maps horizontal arrows and maintains one roving tab stop", () => {
    document.body.innerHTML = `
      <div role="menubar">
        <button role="menuitem" tabindex="0">File</button>
        <button role="menuitem" tabindex="0">Edit</button>
        <button role="menuitem">View</button>
      </div>`;
    const root = document.querySelector('[role="menubar"]') as HTMLElement;
    const items = [...root.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
    const nav = createMenuNavigation(root, { orientation: "horizontal", roving: true });

    expect(items.map((item) => item.tabIndex)).toEqual([0, -1, -1]);
    items[0].focus();
    key(items[0], "ArrowRight");
    expect(document.activeElement).toBe(items[1]);
    expect(items.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
    key(items[1], "ArrowLeft");
    expect(document.activeElement).toBe(items[0]);
    key(items[0], "ArrowLeft");
    expect(document.activeElement).toBe(items[2]);
    expect(items.map((item) => item.tabIndex)).toEqual([-1, -1, 0]);

    nav.destroy();
  });

  test("focusin synchronizes the roving item after pointer-style focus", () => {
    document.body.innerHTML = `
      <div role="menubar">
        <button role="menuitem" tabindex="0">File</button>
        <button role="menuitem" tabindex="-1">Edit</button>
      </div>`;
    const root = document.querySelector('[role="menubar"]') as HTMLElement;
    const items = [...root.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
    const nav = createMenuNavigation(root, { orientation: "horizontal", roving: true });

    items[1].focus();
    expect(items.map((item) => item.tabIndex)).toEqual([-1, 0]);

    nav.destroy();
  });

  test("skips native disabled controls but keeps aria-disabled items focusable", () => {
    const root = menu(`
      <button role="menuitem">One</button>
      <button role="menuitem" disabled>Native disabled</button>
      <button role="menuitem" aria-disabled="true">ARIA disabled</button>
      <button role="menuitem">Four</button>`);
    const items = [...root.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
    let activations = 0;
    const nav = createMenuNavigation(root, { onActivate: () => activations++ });

    items[0].focus();
    key(items[0], "ArrowDown");
    expect(document.activeElement).toBe(items[2]);
    expect(key(items[2], "Enter").defaultPrevented).toBe(true);
    expect(activations).toBe(0);
    key(items[2], "ArrowDown");
    key(items[3], "Enter");
    expect(activations).toBe(1);

    nav.destroy();
  });

  test("re-queries dynamic items and safely handles an empty menu", () => {
    const root = menu();
    const nav = createMenuNavigation(root);

    expect(nav.focusFirst()).toBeNull();
    expect(() => key(root, "ArrowDown")).not.toThrow();

    const item = document.createElement("button");
    item.setAttribute("role", "menuitem");
    root.append(item);
    expect(nav.focusFirst()).toBe(item);
    expect(document.activeElement).toBe(item);

    nav.destroy();
  });

  test("the nearest menu owns nested menu events", () => {
    document.body.innerHTML = `
      <div role="menubar">
        <button role="menuitem" tabindex="0">File</button>
        <div role="menu">
          <button role="menuitem" tabindex="-1">New</button>
          <button role="menuitem" tabindex="-1">Open</button>
        </div>
        <button role="menuitem" tabindex="-1">Help</button>
      </div>`;
    const bar = document.querySelector('[role="menubar"]') as HTMLElement;
    const submenu = bar.querySelector('[role="menu"]') as HTMLElement;
    const top = [...bar.querySelectorAll(':scope > [role="menuitem"]')] as HTMLElement[];
    const sub = [...submenu.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
    const topNav = createMenuNavigation(bar, {
      orientation: "horizontal",
      roving: true,
    });
    const subNav = createMenuNavigation(submenu);

    sub[1].focus();
    key(sub[1], "Home");
    expect(document.activeElement).toBe(sub[0]);
    expect(top.map((item) => item.tabIndex)).toEqual([0, -1]);

    subNav.destroy();
    topNav.destroy();
  });

  test("Escape is consumed while Tab is allowed to leave", () => {
    const root = menu(`<button role="menuitem">One</button>`);
    const item = root.querySelector('[role="menuitem"]') as HTMLElement;
    let escaped = 0;
    let tabbed = 0;
    const nav = createMenuNavigation(root, {
      onEscape: () => escaped++,
      onTab: () => tabbed++,
    });

    item.focus();
    expect(key(item, "Escape").defaultPrevented).toBe(true);
    expect(escaped).toBe(1);
    expect(key(item, "Tab").defaultPrevented).toBe(false);
    expect(tabbed).toBe(1);

    nav.destroy();
  });

  test("destroy removes keyboard and roving-focus listeners", () => {
    document.body.innerHTML = `
      <div role="menubar">
        <button role="menuitem" tabindex="0">One</button>
        <button role="menuitem" tabindex="-1">Two</button>
      </div>`;
    const root = document.querySelector('[role="menubar"]') as HTMLElement;
    const items = [...root.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
    const nav = createMenuNavigation(root, { orientation: "horizontal", roving: true });
    nav.destroy();

    items[0].focus();
    key(items[0], "ArrowRight");
    expect(document.activeElement).toBe(items[0]);
    items[1].focus();
    expect(items.map((item) => item.tabIndex)).toEqual([0, -1]);
  });
});
