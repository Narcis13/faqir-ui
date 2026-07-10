import { describe, it, expect, beforeEach } from "bun:test";
import { createAlertDialog } from "../../registry/recipes/alert-dialog/alert-dialog.js";

// alert-dialog ships no controller of its own — createAlertDialog delegates to
// the shared dialog controller, which switches on the panel's role="alertdialog".
// These tests exercise that alertdialog contract (task 0.4-06).

function setupAlert(
  id = "test-alert",
  opts: { confirmRequired?: boolean } = {}
) {
  const cr = opts.confirmRequired ? " data-confirm-required" : "";
  document.body.innerHTML = `
    <button id="${id}-invoker" data-part="trigger">Delete</button>
    <div data-ui="alert-dialog" data-state="closed" id="${id}"${cr}>
      <div data-part="overlay" hidden></div>
      <div data-part="panel" role="alertdialog" aria-modal="true"
           aria-labelledby="${id}-title" aria-describedby="${id}-desc"
           data-variant="destructive" data-size="sm" hidden>
        <div data-part="header">
          <h2 id="${id}-title" data-part="title">Delete this project?</h2>
        </div>
        <div data-part="body">
          <p id="${id}-desc" data-part="description">This cannot be undone.</p>
        </div>
        <div data-part="footer">
          <button data-part="cancel">Cancel</button>
          <button data-part="confirm">Delete</button>
        </div>
      </div>
    </div>
  `;
  const root = document.querySelector(`#${id}`) as HTMLElement;
  // The trigger lives outside the root and opens it via [data-part='trigger']
  // wiring — but the controller only wires triggers inside root, so move it in
  // for the setups that need a real invoker. Here we keep an external invoker to
  // model return-focus without coupling to internal trigger wiring.
  const invoker = document.getElementById(`${id}-invoker`) as HTMLElement;
  const api = createAlertDialog(root);
  const q = (sel: string) => root.querySelector(sel) as HTMLElement;
  return {
    root,
    api,
    invoker,
    overlay: q("[data-part='overlay']"),
    panel: q("[data-part='panel']"),
    cancel: q("[data-part='cancel']"),
    confirm: q("[data-part='confirm']"),
    title: q("[data-part='title']"),
    desc: q("[data-part='description']"),
  };
}

describe("alert-dialog controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("panel has role alertdialog", () => {
    const { panel } = setupAlert();
    expect(panel.getAttribute("role")).toBe("alertdialog");
  });

  it("panel has aria-modal true", () => {
    const { panel } = setupAlert();
    expect(panel.getAttribute("aria-modal")).toBe("true");
  });

  it("title is linked via aria-labelledby", () => {
    const { panel, title } = setupAlert("link-alert");
    expect(panel.getAttribute("aria-labelledby")).toBe(title.id);
  });

  it("description is linked via aria-describedby", () => {
    const { panel, desc } = setupAlert("desc-alert");
    expect(panel.getAttribute("aria-describedby")).toBe(desc.id);
  });

  it("opens with focus on the least-destructive (cancel) action", () => {
    const { api, cancel } = setupAlert();
    api.open();
    expect(document.activeElement).toBe(cancel);
  });

  it("does NOT close on overlay click", () => {
    const { root, api, overlay } = setupAlert();
    api.open();
    overlay.click();
    expect(root.dataset.state).toBe("open");
  });

  it("closes on Escape by default (WAI-ARIA allowed)", () => {
    const { root, api } = setupAlert();
    api.open();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.dataset.state).toBe("closed");
  });

  it("traps Escape when data-confirm-required is set", () => {
    const { root, api } = setupAlert("trap-alert", { confirmRequired: true });
    api.open();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.dataset.state).toBe("open");
  });

  it("focus trap cycles from the last action back to the first", () => {
    const { api, cancel, confirm } = setupAlert();
    api.open();
    confirm.focus(); // last focusable; panel-scoped trap is active
    document
      .querySelector("[data-part='panel']")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.activeElement).toBe(cancel); // wrapped to first
  });

  it("returns focus to the invoker on close", () => {
    const { root, api, invoker } = setupAlert();
    invoker.focus();
    api.open(); // captures document.activeElement (invoker) as previouslyFocused
    api.close();
    expect(document.activeElement).toBe(invoker);
  });

  it("fires a cancelable faqir:confirm event carrying the variant, then closes", () => {
    const { root, api, confirm } = setupAlert();
    let detail: any = null;
    root.addEventListener("faqir:confirm", (e) => {
      detail = (e as CustomEvent).detail;
    });
    api.open();
    confirm.click();
    expect(detail).toEqual({ variant: "destructive" });
    expect(root.dataset.state).toBe("closed");
  });

  it("fires faqir:cancel on the cancel action, then closes", () => {
    const { root, api, cancel } = setupAlert();
    let fired = false;
    root.addEventListener("faqir:cancel", () => {
      fired = true;
    });
    api.open();
    cancel.click();
    expect(fired).toBe(true);
    expect(root.dataset.state).toBe("closed");
  });

  it("keeps the dialog open when a confirm handler calls preventDefault()", () => {
    const { root, api, confirm } = setupAlert();
    root.addEventListener("faqir:confirm", (e) => e.preventDefault());
    api.open();
    confirm.click();
    expect(root.dataset.state).toBe("open");
  });

  it("fires faqir:cancel with reason=escape when dismissed via Escape", () => {
    const { root, api } = setupAlert();
    const captured: { reason?: string } = {};
    root.addEventListener("faqir:cancel", (e) => {
      captured.reason = (e as CustomEvent).detail?.reason;
    });
    api.open();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(captured.reason).toBe("escape");
  });

  it("exposes an open/close/toggle/destroy API and prevents double-init", () => {
    const { root, api } = setupAlert();
    expect(typeof api.open).toBe("function");
    expect(typeof api.close).toBe("function");
    expect(typeof api.toggle).toBe("function");
    expect(typeof api.destroy).toBe("function");
    const again = createAlertDialog(root);
    expect(again).toBe(api);
  });
});
