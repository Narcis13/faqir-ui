import { describe, it, expect, beforeEach } from "bun:test";
import { createDropdown } from "../../registry/recipes/dropdown/dropdown.js";

function setupDropdown() {
  document.body.innerHTML = `
    <div data-ui="dropdown" data-state="closed">
      <button data-part="trigger" aria-haspopup="true" aria-expanded="false">Options</button>
      <div data-part="menu" role="menu" hidden>
        <button data-part="item" role="menuitem">Edit</button>
        <button data-part="item" role="menuitem">Duplicate</button>
        <hr data-part="separator">
        <button data-part="item" role="menuitem">Delete</button>
      </div>
    </div>
  `;
  const root = document.querySelector("[data-ui='dropdown']") as HTMLElement;
  const api = createDropdown(root);
  return { root, api };
}

describe("dropdown controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens on trigger click", () => {
    const { root } = setupDropdown();
    const trigger = root.querySelector("[data-part='trigger']") as HTMLElement;
    trigger.click();
    expect(root.dataset.state).toBe("open");
  });

  it("sets data-state open when opened", () => {
    const { root, api } = setupDropdown();
    api.open();
    expect(root.dataset.state).toBe("open");
  });

  it("sets data-state closed when closed", () => {
    const { root, api } = setupDropdown();
    api.open();
    api.close();
    expect(root.dataset.state).toBe("closed");
  });

  it("shows menu when opened", () => {
    const { root, api } = setupDropdown();
    const menu = root.querySelector("[data-part='menu']") as HTMLElement;
    api.open();
    expect(menu.hidden).toBe(false);
  });

  it("hides menu when closed", () => {
    const { root, api } = setupDropdown();
    const menu = root.querySelector("[data-part='menu']") as HTMLElement;
    api.open();
    api.close();
    expect(menu.hidden).toBe(true);
  });

  it("closes on escape", () => {
    const { root, api } = setupDropdown();
    const menu = root.querySelector("[data-part='menu']") as HTMLElement;
    api.open();

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.dataset.state).toBe("closed");
  });

  it("closes on item click", () => {
    const { root, api } = setupDropdown();
    const menu = root.querySelector("[data-part='menu']") as HTMLElement;
    const item = root.querySelector("[data-part='item']") as HTMLElement;
    api.open();

    item.click();
    expect(root.dataset.state).toBe("closed");
  });

  it("trigger has aria-expanded false when closed", () => {
    const { root } = setupDropdown();
    const trigger = root.querySelector("[data-part='trigger']");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });

  it("trigger has aria-expanded true when open", () => {
    const { root, api } = setupDropdown();
    const trigger = root.querySelector("[data-part='trigger']");
    api.open();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  });

  it("trigger has aria-haspopup", () => {
    const { root } = setupDropdown();
    const trigger = root.querySelector("[data-part='trigger']");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("true");
  });

  it("menu has role menu", () => {
    const { root } = setupDropdown();
    const menu = root.querySelector("[data-part='menu']");
    expect(menu?.getAttribute("role")).toBe("menu");
  });

  it("items have role menuitem", () => {
    const { root } = setupDropdown();
    const items = root.querySelectorAll("[data-part='item']");
    items.forEach((item) => expect(item.getAttribute("role")).toBe("menuitem"));
  });

  it("arrow down focuses next item", () => {
    const { root, api } = setupDropdown();
    const menu = root.querySelector("[data-part='menu']") as HTMLElement;
    api.open();

    // First item should be focused after open
    const items = root.querySelectorAll("[data-part='item']");
    (items[0] as HTMLElement).focus();

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
  });

  it("arrow up focuses previous item", () => {
    const { root, api } = setupDropdown();
    const menu = root.querySelector("[data-part='menu']") as HTMLElement;
    api.open();

    const items = root.querySelectorAll("[data-part='item']");
    (items[1] as HTMLElement).focus();

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
  });

  it("home focuses first item", () => {
    const { root, api } = setupDropdown();
    const menu = root.querySelector("[data-part='menu']") as HTMLElement;
    api.open();

    const items = root.querySelectorAll("[data-part='item']");
    (items[2] as HTMLElement).focus();

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
  });

  it("end focuses last item", () => {
    const { root, api } = setupDropdown();
    const menu = root.querySelector("[data-part='menu']") as HTMLElement;
    api.open();

    const items = root.querySelectorAll("[data-part='item']");
    (items[0] as HTMLElement).focus();

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(items[2]);
  });

  it("toggle opens then closes", () => {
    const { root, api } = setupDropdown();
    api.toggle();
    expect(root.dataset.state).toBe("open");
    api.toggle();
    expect(root.dataset.state).toBe("closed");
  });

  it("prevents double initialization", () => {
    const { root, api } = setupDropdown();
    const api2 = createDropdown(root);
    expect(api2).toBe(api);
  });

  it("destroy removes event listeners", () => {
    const { root, api } = setupDropdown();
    api.destroy();

    const trigger = root.querySelector("[data-part='trigger']") as HTMLElement;
    trigger.click();
    expect(root.dataset.state).toBe("closed");
  });

  it("menu is hidden when closed", () => {
    const { root } = setupDropdown();
    const menu = root.querySelector("[data-part='menu']") as HTMLElement;
    expect(menu.hidden).toBe(true);
  });
});
