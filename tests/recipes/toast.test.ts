/**
 * ─── Toast controller contract ────────────────────────────────────────────────
 *
 * Factory:   createToastContainer(root) → { add, dismiss, dismissAll, destroy }
 *            Idempotent per element: a second call on the same root returns the
 *            already-attached api (stored on `root._faqirToast`).
 *
 * add(options) → id (string)
 *   options: { message="", tone="default", icon="", actionLabel="", onAction=null,
 *              duration=5000 }
 *   • Appends a `[data-part="toast"]` element to `root`. Toasts STACK in insertion
 *     order (DOM order = call order).
 *   • Each toast is its own live region: role="status", aria-live="polite", plus
 *     data-variant=<tone>, data-toast-id=<id>.
 *   • Renders: optional `[data-part="icon"]` (aria-hidden), a `[data-part="message"]`,
 *     an optional `[data-part="action"]` button, and an always-present
 *     `[data-part="close"]` button (aria-label="Dismiss notification").
 *   • Starts at data-state="entering"; a double-rAF flips it to "visible".
 *   • Auto-dismiss: schedules dismiss(id) after `duration` ms. duration<=0 disables it.
 *   • The action button fires onAction() then dismisses; the close button dismisses.
 *
 * dismiss(id)      Sets data-state="exiting", then removes the node — waiting for
 *                  transitionend only when a CSS transition is actually running
 *                  (none under happy-dom, so removal is synchronous). Unknown id is
 *                  a no-op. Clears that toast's auto-dismiss timer.
 * dismissAll()     Dismisses every live toast.
 * destroy()        Clears all timers + listeners, removes every toast node
 *                  immediately (no exit animation) and detaches the api.
 *
 * NOT IMPLEMENTED (documented gaps, see FAQIR-PLAN follow-ups):
 *   • pause-on-hover — the timer does not pause while the pointer is over a toast.
 *     Filed as follow-up 0.4-25.
 *
 * Timer-based behavior below is exercised with fake timers (no real waits). The
 * entering→visible transition is frame-based (rAF), so its one test uses real
 * frames with `duration: 0` to keep the auto-dismiss timer out of the picture.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import { createToastContainer } from "../../registry/recipes/toast/toast.js";

function setupToast() {
  document.body.innerHTML = `
    <div data-ui="toast" data-variant="top-right" data-part="container"
         role="region" aria-label="Notifications" id="toast-container"></div>
  `;
  const root = document.querySelector("[data-ui='toast']") as HTMLElement;
  const api = createToastContainer(root);
  return { root, api };
}

const toasts = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-part='toast']")] as HTMLElement[];

describe("toast controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Initialization ──────────────────────────────────────────────────────────

  it("prevents double initialization", () => {
    const { root, api } = setupToast();
    const api2 = createToastContainer(root);
    expect(api2).toBe(api);
  });

  it("add() returns a string id and appends one toast", () => {
    const { root, api } = setupToast();
    const id = api.add({ message: "Saved" });
    expect(typeof id).toBe("string");
    expect(toasts(root).length).toBe(1);
    expect(toasts(root)[0].dataset.toastId).toBe(id);
  });

  // ── Content & markup ─────────────────────────────────────────────────────────

  it("renders the message text", () => {
    const { root, api } = setupToast();
    api.add({ message: "Changes saved" });
    const msg = root.querySelector("[data-part='message']");
    expect(msg?.textContent).toBe("Changes saved");
  });

  it("sets data-variant from the tone option", () => {
    const { root, api } = setupToast();
    api.add({ message: "Oops", tone: "error" });
    expect(toasts(root)[0].dataset.variant).toBe("error");
  });

  it("defaults tone to 'default' when omitted", () => {
    const { root, api } = setupToast();
    api.add({ message: "Hi" });
    expect(toasts(root)[0].dataset.variant).toBe("default");
  });

  it("renders an aria-hidden icon only when an icon is supplied", () => {
    const { root, api } = setupToast();
    api.add({ message: "With icon", icon: "★" });
    const icon = root.querySelector("[data-part='icon']");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");

    document.body.innerHTML = "";
    const second = setupToast();
    second.api.add({ message: "No icon" });
    expect(second.root.querySelector("[data-part='icon']")).toBeNull();
  });

  it("renders an action button only when actionLabel is supplied", () => {
    const { root, api } = setupToast();
    api.add({ message: "Deleted", actionLabel: "Undo" });
    const action = root.querySelector("[data-part='action']");
    expect(action?.textContent).toBe("Undo");

    document.body.innerHTML = "";
    const second = setupToast();
    second.api.add({ message: "No action" });
    expect(second.root.querySelector("[data-part='action']")).toBeNull();
  });

  it("always renders a labelled close button", () => {
    const { root, api } = setupToast();
    api.add({ message: "Anything" });
    const close = root.querySelector("[data-part='close']");
    expect(close).not.toBeNull();
    expect(close?.getAttribute("aria-label")).toBe("Dismiss notification");
  });

  // ── ARIA live region ──────────────────────────────────────────────────────────

  it("each toast is a polite status live region", () => {
    const { root, api } = setupToast();
    api.add({ message: "Announce me" });
    const el = toasts(root)[0];
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });

  // ── Stacking ──────────────────────────────────────────────────────────────────

  it("stacks multiple toasts in insertion order", () => {
    const { root, api } = setupToast();
    api.add({ message: "first", duration: 0 });
    api.add({ message: "second", duration: 0 });
    api.add({ message: "third", duration: 0 });
    const messages = [...root.querySelectorAll("[data-part='message']")].map(
      (m) => m.textContent
    );
    expect(messages).toEqual(["first", "second", "third"]);
  });

  // ── Auto-dismiss timers (fake timers) ──────────────────────────────────────────

  it("auto-dismisses after the given duration", () => {
    const { root, api } = setupToast();
    api.add({ message: "temp", duration: 3000 });
    expect(toasts(root).length).toBe(1);

    jest.advanceTimersByTime(2999);
    expect(toasts(root).length).toBe(1);

    jest.advanceTimersByTime(1);
    expect(toasts(root).length).toBe(0);
  });

  it("uses a default duration of 5000ms", () => {
    const { root, api } = setupToast();
    api.add({ message: "default duration" });

    jest.advanceTimersByTime(4999);
    expect(toasts(root).length).toBe(1);

    jest.advanceTimersByTime(1);
    expect(toasts(root).length).toBe(0);
  });

  it("duration of 0 disables auto-dismiss", () => {
    const { root, api } = setupToast();
    api.add({ message: "sticky", duration: 0 });

    jest.advanceTimersByTime(60_000);
    expect(toasts(root).length).toBe(1);
  });

  it("does not pause the auto-dismiss timer on hover (documented gap → 0.4-25)", () => {
    const { root, api } = setupToast();
    api.add({ message: "hover me", duration: 3000 });
    const el = toasts(root)[0];

    // Hovering should not stop the clock under the current implementation.
    el.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    jest.advanceTimersByTime(3000);
    expect(toasts(root).length).toBe(0);
  });

  // ── Manual dismissal ────────────────────────────────────────────────────────

  it("close button dismisses its toast", () => {
    const { root, api } = setupToast();
    api.add({ message: "close me", duration: 0 });
    (root.querySelector("[data-part='close']") as HTMLElement).click();
    expect(toasts(root).length).toBe(0);
  });

  it("action button invokes onAction and dismisses", () => {
    const { root, api } = setupToast();
    let called = 0;
    api.add({
      message: "act",
      actionLabel: "Undo",
      onAction: () => {
        called++;
      },
      duration: 0,
    });
    (root.querySelector("[data-part='action']") as HTMLElement).click();
    expect(called).toBe(1);
    expect(toasts(root).length).toBe(0);
  });

  it("dismiss(id) removes exactly that toast", () => {
    const { root, api } = setupToast();
    const a = api.add({ message: "a", duration: 0 });
    api.add({ message: "b", duration: 0 });
    api.dismiss(a);
    const remaining = [...root.querySelectorAll("[data-part='message']")].map(
      (m) => m.textContent
    );
    expect(remaining).toEqual(["b"]);
  });

  it("dismiss() with an unknown id is a no-op", () => {
    const { root, api } = setupToast();
    api.add({ message: "a", duration: 0 });
    expect(() => api.dismiss("nope")).not.toThrow();
    expect(toasts(root).length).toBe(1);
  });

  it("dismissAll() removes every toast", () => {
    const { root, api } = setupToast();
    api.add({ message: "a", duration: 0 });
    api.add({ message: "b", duration: 0 });
    api.add({ message: "c", duration: 0 });
    api.dismissAll();
    expect(toasts(root).length).toBe(0);
  });

  it("dismissing a toast clears its pending auto-dismiss timer", () => {
    const { root, api } = setupToast();
    const id = api.add({ message: "a", duration: 3000 });
    api.dismiss(id);
    expect(toasts(root).length).toBe(0);
    // Advancing past the original duration must not throw or resurrect anything.
    expect(() => jest.advanceTimersByTime(3000)).not.toThrow();
    expect(toasts(root).length).toBe(0);
  });

  // ── Teardown ──────────────────────────────────────────────────────────────────

  it("destroy() removes all toasts and clears timers", () => {
    const { root, api } = setupToast();
    api.add({ message: "a", duration: 3000 });
    api.add({ message: "b", duration: 3000 });
    api.destroy();
    expect(toasts(root).length).toBe(0);
    expect(() => jest.advanceTimersByTime(3000)).not.toThrow();
    expect(toasts(root).length).toBe(0);
  });

  it("destroy() detaches the api so re-init returns a fresh instance", () => {
    const { root, api } = setupToast();
    api.destroy();
    const api2 = createToastContainer(root);
    expect(api2).not.toBe(api);
  });
});

describe("toast enter transition (real frames)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("transitions from entering to visible across two frames", async () => {
    const { root, api } = setupToast();
    api.add({ message: "frame", duration: 0 });
    const el = toasts(root)[0];
    expect(el.dataset.state).toBe("entering");

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    expect(el.dataset.state).toBe("visible");
    api.destroy();
  });
});
