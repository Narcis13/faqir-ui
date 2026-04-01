import { describe, it, expect, beforeEach } from "bun:test";
import { createDialog } from "../../registry/recipes/dialog/dialog.js";

function setupDialog(id = "test-dialog") {
  document.body.innerHTML = `
    <div data-ui="dialog" data-state="closed" id="${id}">
      <button data-part="trigger">Open</button>
      <div data-part="overlay" hidden></div>
      <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="${id}-title" data-size="md" hidden>
        <div data-part="header">
          <h2 id="${id}-title" data-part="title">Test Dialog</h2>
          <button data-part="close" aria-label="Close dialog">✕</button>
        </div>
        <div data-part="body"><p>Body content</p></div>
        <div data-part="footer">
          <button data-part="close">Cancel</button>
          <button>Confirm</button>
        </div>
      </div>
    </div>
  `;
  const root = document.querySelector(`#${id}`) as HTMLElement;
  const api = createDialog(root);
  return { root, api };
}

describe("dialog controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens on trigger click", () => {
    const { root } = setupDialog();
    const trigger = root.querySelector("[data-part='trigger']") as HTMLElement;
    trigger.click();
    expect(root.dataset.state).toBe("open");
  });

  it("sets data-state to open when opened", () => {
    const { root, api } = setupDialog();
    api.open();
    expect(root.dataset.state).toBe("open");
  });

  it("sets data-state to closed when closed", () => {
    const { root, api } = setupDialog();
    api.open();
    api.close();
    // Without CSS transitions, close is immediate
    expect(root.dataset.state).toBe("closed");
  });

  it("shows overlay and panel when opened", () => {
    const { root, api } = setupDialog();
    const overlay = root.querySelector("[data-part='overlay']") as HTMLElement;
    const panel = root.querySelector("[data-part='panel']") as HTMLElement;

    api.open();
    expect(overlay.hidden).toBe(false);
    expect(panel.hidden).toBe(false);
  });

  it("hides overlay and panel when closed", () => {
    const { root, api } = setupDialog();
    const overlay = root.querySelector("[data-part='overlay']") as HTMLElement;
    const panel = root.querySelector("[data-part='panel']") as HTMLElement;

    api.open();
    api.close();
    expect(overlay.hidden).toBe(true);
    expect(panel.hidden).toBe(true);
  });

  it("closes on escape key", () => {
    const { root, api } = setupDialog();
    api.open();

    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.dataset.state).toBe("closed");
  });

  it("closes on overlay click", () => {
    const { root, api } = setupDialog();
    const overlay = root.querySelector("[data-part='overlay']") as HTMLElement;

    api.open();
    overlay.click();
    expect(root.dataset.state).toBe("closed");
  });

  it("closes on close button click", () => {
    const { root, api } = setupDialog();
    const closeBtn = root.querySelector("[data-part='close']") as HTMLElement;

    api.open();
    closeBtn.click();
    expect(root.dataset.state).toBe("closed");
  });

  it("toggle opens then closes", () => {
    const { root, api } = setupDialog();
    api.toggle();
    expect(root.dataset.state).toBe("open");
    api.toggle();
    expect(root.dataset.state).toBe("closed");
  });

  it("prevents double initialization", () => {
    const { root, api } = setupDialog();
    const api2 = createDialog(root);
    expect(api2).toBe(api);
  });

  it("destroy removes event listeners", () => {
    const { root, api } = setupDialog();
    api.destroy();

    const trigger = root.querySelector("[data-part='trigger']") as HTMLElement;
    trigger.click();
    // State should NOT change since listeners are removed
    expect(root.dataset.state).toBe("closed");
  });

  it("panel has role dialog", () => {
    const { root } = setupDialog();
    const panel = root.querySelector("[data-part='panel']");
    expect(panel?.getAttribute("role")).toBe("dialog");
  });

  it("panel has aria-modal true", () => {
    const { root } = setupDialog();
    const panel = root.querySelector("[data-part='panel']");
    expect(panel?.getAttribute("aria-modal")).toBe("true");
  });

  it("title is linked via aria-labelledby", () => {
    const { root } = setupDialog("link-test");
    const panel = root.querySelector("[data-part='panel']");
    const title = root.querySelector("[data-part='title']");
    expect(panel?.getAttribute("aria-labelledby")).toBe(title?.id);
  });

  it("close button has aria-label", () => {
    const { root } = setupDialog();
    const closeBtn = root.querySelector("[data-part='close']");
    expect(closeBtn?.getAttribute("aria-label")).toBeTruthy();
  });
});
