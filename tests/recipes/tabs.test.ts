import { describe, it, expect, beforeEach } from "bun:test";
import { createTabs } from "../../registry/recipes/tabs/tabs.js";

function setupTabs() {
  document.body.innerHTML = `
    <div data-ui="tabs" data-variant="underline">
      <div data-part="list" role="tablist">
        <button data-part="trigger" role="tab" id="t-tab-1" aria-controls="t-panel-1" aria-selected="true">Tab 1</button>
        <button data-part="trigger" role="tab" id="t-tab-2" aria-controls="t-panel-2" aria-selected="false" tabindex="-1">Tab 2</button>
        <button data-part="trigger" role="tab" id="t-tab-3" aria-controls="t-panel-3" aria-selected="false" tabindex="-1">Tab 3</button>
      </div>
      <div data-part="panel" role="tabpanel" id="t-panel-1" aria-labelledby="t-tab-1">Panel 1</div>
      <div data-part="panel" role="tabpanel" id="t-panel-2" aria-labelledby="t-tab-2" hidden>Panel 2</div>
      <div data-part="panel" role="tabpanel" id="t-panel-3" aria-labelledby="t-tab-3" hidden>Panel 3</div>
    </div>
  `;
  const root = document.querySelector("[data-ui='tabs']") as HTMLElement;
  const api = createTabs(root);
  return { root, api };
}

describe("tabs controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("first tab is selected by default", () => {
    const { root } = setupTabs();
    const triggers = root.querySelectorAll("[data-part='trigger']");
    expect(triggers[0].getAttribute("aria-selected")).toBe("true");
    expect(triggers[1].getAttribute("aria-selected")).toBe("false");
    expect(triggers[2].getAttribute("aria-selected")).toBe("false");
  });

  it("clicking tab shows its panel", () => {
    const { root } = setupTabs();
    const triggers = root.querySelectorAll("[data-part='trigger']");
    const panels = root.querySelectorAll("[data-part='panel']");

    (triggers[1] as HTMLElement).click();
    expect((panels[1] as HTMLElement).hidden).toBe(false);
  });

  it("clicking tab hides other panels", () => {
    const { root } = setupTabs();
    const triggers = root.querySelectorAll("[data-part='trigger']");
    const panels = root.querySelectorAll("[data-part='panel']");

    (triggers[1] as HTMLElement).click();
    expect((panels[0] as HTMLElement).hidden).toBe(true);
    expect((panels[2] as HTMLElement).hidden).toBe(true);
  });

  it("active trigger has aria-selected true", () => {
    const { root } = setupTabs();
    const triggers = root.querySelectorAll("[data-part='trigger']");

    (triggers[2] as HTMLElement).click();
    expect(triggers[2].getAttribute("aria-selected")).toBe("true");
  });

  it("inactive triggers have aria-selected false", () => {
    const { root } = setupTabs();
    const triggers = root.querySelectorAll("[data-part='trigger']");

    (triggers[2] as HTMLElement).click();
    expect(triggers[0].getAttribute("aria-selected")).toBe("false");
    expect(triggers[1].getAttribute("aria-selected")).toBe("false");
  });

  it("activate() switches to the specified index", () => {
    const { root, api } = setupTabs();
    const panels = root.querySelectorAll("[data-part='panel']");
    const triggers = root.querySelectorAll("[data-part='trigger']");

    api.activate(2);
    expect(triggers[2].getAttribute("aria-selected")).toBe("true");
    expect((panels[2] as HTMLElement).hidden).toBe(false);
    expect((panels[0] as HTMLElement).hidden).toBe(true);
  });

  it("arrow right activates next tab", () => {
    const { root } = setupTabs();
    const list = root.querySelector("[data-part='list']") as HTMLElement;

    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    const triggers = root.querySelectorAll("[data-part='trigger']");
    expect(triggers[1].getAttribute("aria-selected")).toBe("true");
  });

  it("arrow left wraps to last tab", () => {
    const { root } = setupTabs();
    const list = root.querySelector("[data-part='list']") as HTMLElement;

    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));

    const triggers = root.querySelectorAll("[data-part='trigger']");
    expect(triggers[2].getAttribute("aria-selected")).toBe("true");
  });

  it("home activates first tab", () => {
    const { root, api } = setupTabs();
    const list = root.querySelector("[data-part='list']") as HTMLElement;

    api.activate(2);
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));

    const triggers = root.querySelectorAll("[data-part='trigger']");
    expect(triggers[0].getAttribute("aria-selected")).toBe("true");
  });

  it("end activates last tab", () => {
    const { root } = setupTabs();
    const list = root.querySelector("[data-part='list']") as HTMLElement;

    list.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));

    const triggers = root.querySelectorAll("[data-part='trigger']");
    expect(triggers[2].getAttribute("aria-selected")).toBe("true");
  });

  it("triggers have role tab", () => {
    const { root } = setupTabs();
    const triggers = root.querySelectorAll("[data-part='trigger']");
    triggers.forEach((t) => expect(t.getAttribute("role")).toBe("tab"));
  });

  it("panels have role tabpanel", () => {
    const { root } = setupTabs();
    const panels = root.querySelectorAll("[data-part='panel']");
    panels.forEach((p) => expect(p.getAttribute("role")).toBe("tabpanel"));
  });

  it("list has role tablist", () => {
    const { root } = setupTabs();
    const list = root.querySelector("[data-part='list']");
    expect(list?.getAttribute("role")).toBe("tablist");
  });

  it("aria-controls links to panel id", () => {
    const { root } = setupTabs();
    const triggers = root.querySelectorAll("[data-part='trigger']");
    const panels = root.querySelectorAll("[data-part='panel']");

    triggers.forEach((t, i) => {
      expect(t.getAttribute("aria-controls")).toBe(panels[i].id);
    });
  });

  it("aria-labelledby links to trigger id", () => {
    const { root } = setupTabs();
    const triggers = root.querySelectorAll("[data-part='trigger']");
    const panels = root.querySelectorAll("[data-part='panel']");

    panels.forEach((p, i) => {
      expect(p.getAttribute("aria-labelledby")).toBe(triggers[i].id);
    });
  });

  it("prevents double initialization", () => {
    const { root, api } = setupTabs();
    const api2 = createTabs(root);
    expect(api2).toBe(api);
  });

  it("destroy removes event listeners", () => {
    const { root, api } = setupTabs();
    api.destroy();

    const list = root.querySelector("[data-part='list']") as HTMLElement;
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    // First tab should still be selected since listeners were removed
    const triggers = root.querySelectorAll("[data-part='trigger']");
    expect(triggers[0].getAttribute("aria-selected")).toBe("true");
  });
});
