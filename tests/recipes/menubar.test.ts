import { beforeEach, describe, expect, it } from "bun:test";
import { createMenubar } from "../../registry/recipes/menubar/menubar.js";

function setupMenubar() {
  document.body.innerHTML = `
    <div data-ui="menubar" data-state="closed" role="menubar" aria-label="Application menu">
      <div data-part="group" role="none">
        <button type="button" data-part="trigger" id="file" role="menuitem"
                tabindex="0" aria-haspopup="menu" aria-expanded="false"
                aria-controls="file-menu">File</button>
        <div data-part="submenu" id="file-menu" role="menu" aria-labelledby="file" hidden>
          <button type="button" data-part="item" role="menuitem" tabindex="-1">New</button>
          <button type="button" data-part="item" role="menuitem" tabindex="-1"
                  aria-disabled="true">Save</button>
          <hr data-part="separator" role="separator">
          <button type="button" data-part="item" role="menuitem" tabindex="-1">Exit</button>
        </div>
      </div>
      <div data-part="group" role="none">
        <button type="button" data-part="trigger" id="edit" role="menuitem"
                tabindex="-1" aria-haspopup="menu" aria-expanded="false"
                aria-controls="edit-menu">Edit</button>
        <div data-part="submenu" id="edit-menu" role="menu" aria-labelledby="edit" hidden>
          <button type="button" data-part="item" role="menuitem" tabindex="-1">Undo</button>
          <button type="button" data-part="item" role="menuitem" tabindex="-1">Redo</button>
        </div>
      </div>
      <div data-part="group" role="none">
        <button type="button" data-part="trigger" id="view" role="menuitem"
                tabindex="-1" aria-haspopup="menu" aria-expanded="false"
                aria-controls="view-menu">View</button>
        <div data-part="submenu" id="view-menu" role="menu" aria-labelledby="view" hidden>
          <button type="button" data-part="item" role="menuitem" tabindex="-1">Zoom In</button>
          <button type="button" data-part="item" role="menuitem" tabindex="-1">Zoom Out</button>
        </div>
      </div>
      <button type="button" data-part="trigger" role="menuitem" tabindex="-1">Help</button>
    </div>
  `;

  const root = document.querySelector("[data-ui='menubar']") as HTMLElement;
  const api = createMenubar(root);
  return { root, api };
}

function triggers(root: HTMLElement) {
  return [...root.querySelectorAll("[data-part='trigger']")] as HTMLElement[];
}

function submenus(root: HTMLElement) {
  return [...root.querySelectorAll("[data-part='submenu']")] as HTMLElement[];
}

function menuItems(menu: HTMLElement) {
  return [...menu.querySelectorAll("[data-part='item']")] as HTMLElement[];
}

function press(
  target: EventTarget,
  key: string,
  init: Partial<KeyboardEventInit> = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function expectOnlyTopTabStop(root: HTMLElement, expected: HTMLElement) {
  for (const trigger of triggers(root)) {
    expect(trigger.tabIndex).toBe(trigger === expected ? 0 : -1);
  }
}

function expectAllSubmenuItemsUntabbable(root: HTMLElement) {
  for (const menu of submenus(root)) {
    for (const item of menuItems(menu)) expect(item.tabIndex).toBe(-1);
  }
}

describe("menubar controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("initializes a closed, labelled menubar with one top-level tab stop", () => {
    const { root } = setupMenubar();
    const top = triggers(root);

    expect(root.getAttribute("role")).toBe("menubar");
    expect(root.getAttribute("aria-label")).toBe("Application menu");
    expect(root.dataset.state).toBe("closed");
    expectOnlyTopTabStop(root, top[0]);
    expectAllSubmenuItemsUntabbable(root);

    for (const menu of submenus(root)) expect(menu.hidden).toBe(true);
    for (const trigger of top.slice(0, 3)) {
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(document.getElementById(trigger.getAttribute("aria-controls")!)).not.toBeNull();
    }
  });

  it("ArrowRight and ArrowLeft move top-level focus and update the rover", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    top[0].focus();

    expect(press(top[0], "ArrowRight").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(top[1]);
    expectOnlyTopTabStop(root, top[1]);

    press(top[1], "ArrowLeft");
    expect(document.activeElement).toBe(top[0]);
    expectOnlyTopTabStop(root, top[0]);
  });

  it("horizontal arrows wrap at both ends", () => {
    const { root } = setupMenubar();
    const top = triggers(root);

    top[0].focus();
    press(top[0], "ArrowLeft");
    expect(document.activeElement).toBe(top[3]);

    press(top[3], "ArrowRight");
    expect(document.activeElement).toBe(top[0]);
    expectOnlyTopTabStop(root, top[0]);
  });

  it("Home and End move to the first and last top-level items", () => {
    const { root } = setupMenubar();
    const top = triggers(root);

    top[1].focus();
    press(top[1], "End");
    expect(document.activeElement).toBe(top[3]);
    expectOnlyTopTabStop(root, top[3]);

    press(top[3], "Home");
    expect(document.activeElement).toBe(top[0]);
    expectOnlyTopTabStop(root, top[0]);
  });

  it("ArrowDown opens a submenu and focuses its first item", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menus = submenus(root);
    const items = menuItems(menus[0]);

    top[0].focus();
    expect(press(top[0], "ArrowDown").defaultPrevented).toBe(true);

    expect(root.dataset.state).toBe("open");
    expect(menus[0].hidden).toBe(false);
    expect(top[0].getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items[0]);
    expectOnlyTopTabStop(root, top[0]);
    expectAllSubmenuItemsUntabbable(root);
  });

  it("Enter and Space open a top-level submenu at its first item", () => {
    for (const key of ["Enter", " "]) {
      const { root } = setupMenubar();
      const top = triggers(root);
      const menu = submenus(root)[1];

      top[1].focus();
      expect(press(top[1], key).defaultPrevented).toBe(true);
      expect(menu.hidden).toBe(false);
      expect(document.activeElement).toBe(menuItems(menu)[0]);
      expectOnlyTopTabStop(root, top[1]);
    }
  });

  it("Enter activates a top-level leaf exactly once", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    let activations = 0;
    top[3].addEventListener("click", () => activations++);

    top[3].focus();
    press(top[3], "Enter");

    expect(activations).toBe(1);
    expect(root.dataset.state).toBe("closed");
    expect(document.activeElement).toBe(top[3]);
    expectOnlyTopTabStop(root, top[3]);
  });

  it("ArrowUp opens a submenu and focuses its last item", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menu = submenus(root)[1];
    const items = menuItems(menu);

    top[1].focus();
    press(top[1], "ArrowUp");
    expect(menu.hidden).toBe(false);
    expect(document.activeElement).toBe(items[items.length - 1]);
    expectAllSubmenuItemsUntabbable(root);
  });

  it("ArrowDown and ArrowUp move vertically and wrap inside a submenu", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menu = submenus(root)[0];
    const items = menuItems(menu);

    top[0].focus();
    press(top[0], "ArrowDown");
    press(items[0], "ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    press(items[1], "ArrowDown");
    expect(document.activeElement).toBe(items[2]);
    press(items[2], "ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    press(items[0], "ArrowUp");
    expect(document.activeElement).toBe(items[2]);
    expectAllSubmenuItemsUntabbable(root);
  });

  it("Home and End move within the active submenu", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menu = submenus(root)[0];
    const items = menuItems(menu);

    top[0].focus();
    press(top[0], "ArrowDown");
    press(items[0], "End");
    expect(document.activeElement).toBe(items[2]);
    press(items[2], "Home");
    expect(document.activeElement).toBe(items[0]);
    expectAllSubmenuItemsUntabbable(root);
  });

  it("Escape closes the submenu and restores its parent menuitem focus", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menu = submenus(root)[0];

    top[0].focus();
    press(top[0], "ArrowDown");
    const event = press(document.activeElement!, "Escape");

    expect(event.defaultPrevented).toBe(true);
    expect(root.dataset.state).toBe("closed");
    expect(menu.hidden).toBe(true);
    expect(top[0].getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(top[0]);
    expectOnlyTopTabStop(root, top[0]);
  });

  it("Escape closes an open submenu when focus is already on its parent", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menu = submenus(root)[0];

    top[0].click();
    const event = press(top[0], "Escape");

    expect(event.defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(root.dataset.state).toBe("closed");
    expect(document.activeElement).toBe(top[0]);
    expectOnlyTopTabStop(root, top[0]);
  });

  it("ArrowRight from a submenu switches to the next menu and keeps top-level focus", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menus = submenus(root);

    top[0].focus();
    press(top[0], "ArrowDown");
    const event = press(document.activeElement!, "ArrowRight");

    expect(event.defaultPrevented).toBe(true);
    expect(menus[0].hidden).toBe(true);
    expect(menus[1].hidden).toBe(false);
    expect(top[0].getAttribute("aria-expanded")).toBe("false");
    expect(top[1].getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(top[1]);
    expectOnlyTopTabStop(root, top[1]);
  });

  it("ArrowLeft from a submenu switches to the previous menu and wraps", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menus = submenus(root);

    top[0].focus();
    press(top[0], "ArrowDown");
    press(document.activeElement!, "ArrowLeft");

    // The previous top-level item is the Help leaf, so no submenu remains open.
    expect(root.dataset.state).toBe("closed");
    expect(menus.every((menu) => menu.hidden)).toBe(true);
    expect(document.activeElement).toBe(top[3]);
    expectOnlyTopTabStop(root, top[3]);

    top[1].focus();
    press(top[1], "ArrowDown");
    press(document.activeElement!, "ArrowLeft");
    expect(menus[0].hidden).toBe(false);
    expect(document.activeElement).toBe(top[0]);
  });

  it("horizontal movement switches an open submenu when focus is on its parent", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menus = submenus(root);

    top[0].click();
    expect(menus[0].hidden).toBe(false);
    press(top[0], "ArrowRight");

    expect(menus[0].hidden).toBe(true);
    expect(menus[1].hidden).toBe(false);
    expect(document.activeElement).toBe(top[1]);
    expectOnlyTopTabStop(root, top[1]);
  });

  it("keeps at most one submenu open", () => {
    const { root, api } = setupMenubar();
    const top = triggers(root);
    const menus = submenus(root);

    api.open(0, "first");
    api.open(2, "first");

    expect(menus.map((menu) => !menu.hidden)).toEqual([false, false, true]);
    expect(top.map((item) => item.getAttribute("aria-expanded"))).toEqual([
      "false",
      "false",
      "true",
      null,
    ]);
    expectOnlyTopTabStop(root, top[2]);
  });

  it("Tab and Shift+Tab close all submenus without preventing native focus movement", () => {
    for (const shiftKey of [false, true]) {
      const { root } = setupMenubar();
      const top = triggers(root);

      top[0].focus();
      press(top[0], "ArrowDown");
      const event = press(document.activeElement!, "Tab", { shiftKey });

      expect(event.defaultPrevented).toBe(false);
      expect(root.dataset.state).toBe("closed");
      expect(submenus(root).every((menu) => menu.hidden)).toBe(true);
    }
  });

  it("aria-disabled submenu items remain focusable but do not activate", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menu = submenus(root)[0];
    const items = menuItems(menu);
    let activations = 0;
    items[1].addEventListener("click", () => activations++);

    top[0].focus();
    press(top[0], "ArrowDown");
    press(items[0], "ArrowDown");
    expect(document.activeElement).toBe(items[1]);

    const event = press(items[1], "Enter");
    expect(event.defaultPrevented).toBe(true);
    expect(activations).toBe(0);
    expect(menu.hidden).toBe(false);
    expect(document.activeElement).toBe(items[1]);
  });

  it("Enter and Space activate an enabled submenu item once and close", () => {
    for (const key of ["Enter", " "]) {
      const { root } = setupMenubar();
      const top = triggers(root);
      const menu = submenus(root)[1];
      const item = menuItems(menu)[0];
      let activations = 0;
      item.addEventListener("click", () => activations++);

      top[1].focus();
      press(top[1], "ArrowDown");
      press(item, key);

      expect(activations).toBe(1);
      expect(root.dataset.state).toBe("closed");
      expect(menu.hidden).toBe(true);
      expect(document.activeElement).toBe(top[1]);
      expectOnlyTopTabStop(root, top[1]);
    }
  });

  it("clicking a parent toggles its submenu and keeps focus on the parent", () => {
    const { root } = setupMenubar();
    const top = triggers(root);
    const menu = submenus(root)[0];

    top[0].click();
    expect(menu.hidden).toBe(false);
    expect(root.dataset.state).toBe("open");
    expect(document.activeElement).toBe(top[0]);

    top[0].click();
    expect(menu.hidden).toBe(true);
    expect(root.dataset.state).toBe("closed");
    expect(document.activeElement).toBe(top[0]);
  });

  it("imperative close restores focus to the open submenu parent", () => {
    const { root, api } = setupMenubar();
    const top = triggers(root);

    api.open(2, "last");
    expect(document.activeElement).toBe(menuItems(submenus(root)[2])[1]);
    api.close();

    expect(root.dataset.state).toBe("closed");
    expect(document.activeElement).toBe(top[2]);
    expectOnlyTopTabStop(root, top[2]);
  });

  it("is idempotent and destroy removes keyboard and click behavior", () => {
    const { root, api } = setupMenubar();
    expect(createMenubar(root)).toBe(api);

    const top = triggers(root);
    api.destroy();
    top[0].focus();
    press(top[0], "ArrowDown");
    top[0].click();

    expect(root.dataset.state).toBe("closed");
    expect(submenus(root)[0].hidden).toBe(true);
  });
});
