import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createContextMenu } from "../../registry/recipes/context-menu/context-menu.js";

type ContextMenuApi = ReturnType<typeof createContextMenu>;

const controllers: ContextMenuApi[] = [];

function setupContextMenu() {
  document.body.innerHTML = `
    <button data-test="outside" type="button">Outside</button>
    <div data-ui="context-menu" data-state="closed">
      <div data-part="target" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false" aria-controls="test-context-menu">
        Right-click here
      </div>
      <div data-part="menu" id="test-context-menu" role="menu" aria-label="Test actions" hidden>
        <button data-part="item" type="button" role="menuitem" tabindex="-1">Edit</button>
        <button data-part="item" type="button" role="menuitem" tabindex="-1" disabled>Disabled native</button>
        <button data-part="item" type="button" role="menuitem" tabindex="-1" aria-disabled="true">Unavailable</button>
        <hr data-part="separator" role="separator" aria-orientation="horizontal">
        <button data-part="item" type="button" role="menuitem" tabindex="-1">Delete</button>
      </div>
    </div>
  `;

  const root = document.querySelector("[data-ui='context-menu']") as HTMLElement;
  const target = root.querySelector("[data-part='target']") as HTMLElement;
  const menu = root.querySelector("[data-part='menu']") as HTMLElement;
  const allItems = [...menu.querySelectorAll("[data-part='item']")] as HTMLButtonElement[];
  const outside = document.querySelector("[data-test='outside']") as HTMLButtonElement;
  const api = createContextMenu(root);
  controllers.push(api);

  return { root, target, menu, allItems, outside, api };
}

function contextmenu(target: Element, x = 120, y = 84) {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(event);
  return event;
}

function keydown(target: Element, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

describe("context-menu controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    for (const controller of controllers.splice(0)) controller.destroy();
    document.body.innerHTML = "";
  });

  it("prevents the native menu and opens at pointer coordinates", () => {
    const { root, target, menu, allItems } = setupContextMenu();

    const event = contextmenu(target, 147, 93);

    expect(event.defaultPrevented).toBe(true);
    expect(root.dataset.state).toBe("open");
    expect(menu.hidden).toBe(false);
    expect(menu.style.left).toBe("147px");
    expect(menu.style.top).toBe("93px");
    expect(target.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(allItems[0]);
  });

  it("opens near the target with the ContextMenu key", () => {
    const { root, target, menu, allItems } = setupContextMenu();
    target.getBoundingClientRect = () =>
      ({ left: 38, bottom: 71, top: 41, right: 138, width: 100, height: 30, x: 38, y: 41, toJSON() {} }) as DOMRect;
    target.focus();

    const event = keydown(target, "ContextMenu");

    expect(event.defaultPrevented).toBe(true);
    expect(root.dataset.state).toBe("open");
    expect(menu.style.left).toBe("38px");
    expect(menu.style.top).toBe("71px");
    expect(document.activeElement).toBe(allItems[0]);
  });

  it("opens near the target with Shift+F10", () => {
    const { root, target, menu } = setupContextMenu();
    target.getBoundingClientRect = () =>
      ({ left: 22, bottom: 64, top: 24, right: 122, width: 100, height: 40, x: 22, y: 24, toJSON() {} }) as DOMRect;

    const event = keydown(target, "F10", { shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(root.dataset.state).toBe("open");
    expect(menu.style.left).toBe("22px");
    expect(menu.style.top).toBe("64px");
  });

  it("supports vertical arrows, wraparound, Home, and End", () => {
    const { target, allItems } = setupContextMenu();
    contextmenu(target);

    keydown(allItems[0], "ArrowDown");
    expect(document.activeElement).toBe(allItems[2]);
    keydown(allItems[2], "ArrowDown");
    expect(document.activeElement).toBe(allItems[3]);
    keydown(allItems[3], "ArrowDown");
    expect(document.activeElement).toBe(allItems[0]);
    keydown(allItems[0], "ArrowUp");
    expect(document.activeElement).toBe(allItems[3]);
    keydown(allItems[3], "Home");
    expect(document.activeElement).toBe(allItems[0]);
    keydown(allItems[0], "End");
    expect(document.activeElement).toBe(allItems[3]);
  });

  it("keeps aria-disabled items focusable but suppresses their activation", () => {
    const { root, target, allItems } = setupContextMenu();
    let clicks = 0;
    allItems[2].addEventListener("click", () => clicks++);
    contextmenu(target);

    keydown(allItems[0], "ArrowDown");
    expect(document.activeElement).toBe(allItems[2]);
    keydown(allItems[2], "Enter");

    expect(clicks).toBe(0);
    expect(root.dataset.state).toBe("open");
  });

  it("activates an item with Enter and closes with focus restored", () => {
    const { root, target, menu, allItems } = setupContextMenu();
    let clicks = 0;
    allItems[3].addEventListener("click", () => clicks++);
    contextmenu(target);
    keydown(allItems[0], "End");

    keydown(allItems[3], "Enter");

    expect(clicks).toBe(1);
    expect(root.dataset.state).toBe("closed");
    expect(menu.hidden).toBe(true);
    expect(target.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(target);
  });

  it("closes on pointer item activation", () => {
    const { root, target, allItems } = setupContextMenu();
    contextmenu(target);

    allItems[0].click();

    expect(root.dataset.state).toBe("closed");
    expect(document.activeElement).toBe(target);
  });

  it("closes on Escape and returns focus to the target", () => {
    const { root, target, menu, allItems } = setupContextMenu();
    contextmenu(target);

    const event = keydown(allItems[0], "Escape");

    expect(event.defaultPrevented).toBe(true);
    expect(root.dataset.state).toBe("closed");
    expect(menu.hidden).toBe(true);
    expect(target.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(target);
  });

  it("closes on Tab without restoring focus to the target", () => {
    const { root, target, menu, allItems } = setupContextMenu();
    contextmenu(target);

    const event = keydown(allItems[0], "Tab");

    expect(event.defaultPrevented).toBe(false);
    expect(root.dataset.state).toBe("closed");
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).not.toBe(target);
  });

  it("closes on outside pointerdown without stealing outside focus", () => {
    const { root, target, menu, outside } = setupContextMenu();
    contextmenu(target);
    outside.focus();

    outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(root.dataset.state).toBe("closed");
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(outside);
  });

  it("repositions an already-open menu without duplicating initialization", () => {
    const { root, target, menu, api } = setupContextMenu();
    contextmenu(target, 10, 20);
    contextmenu(target, 70, 90);

    expect(root.dataset.state).toBe("open");
    expect(menu.style.left).toBe("70px");
    expect(menu.style.top).toBe("90px");
    expect(createContextMenu(root)).toBe(api);
  });

  it("exposes open and close methods", () => {
    const { root, target, menu, api } = setupContextMenu();

    api.open(16, 32);
    expect(root.dataset.state).toBe("open");
    expect(menu.style.left).toBe("16px");
    expect(menu.style.top).toBe("32px");

    api.close();
    expect(root.dataset.state).toBe("closed");
    expect(target.getAttribute("aria-expanded")).toBe("false");
  });

  it("destroy closes the menu and removes every listener", () => {
    const { root, target, menu, api } = setupContextMenu();
    contextmenu(target);

    api.destroy();
    const event = contextmenu(target, 200, 150);

    expect(event.defaultPrevented).toBe(false);
    expect(root.dataset.state).toBe("closed");
    expect(menu.hidden).toBe(true);
    expect(target.getAttribute("aria-expanded")).toBe("false");
    expect((root as any)._faqirContextMenu).toBeUndefined();
  });
});
