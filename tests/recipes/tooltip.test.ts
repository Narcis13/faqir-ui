/**
 * ─── Tooltip controller contract ──────────────────────────────────────────────
 *
 * Factory:   createTooltip(root) → { show, hide, destroy }
 *            Idempotent per element: a second call returns the api stored on
 *            `root._faqirTooltip`.
 *
 * Structure: root holds `[data-part="trigger"]` and `[data-part="content"]`.
 *
 * show()     Immediately reveals: root.dataset.state="visible", content.hidden=false.
 * hide()     Immediately hides:   root.dataset.state="hidden",  content.hidden=true.
 *
 * Pointer / focus intent (delayed, so a passing cursor doesn't flicker the tip):
 *   • mouseenter / focusin  → schedule show after 200ms.
 *   • mouseleave / focusout → schedule hide after 100ms.
 *   • Scheduling a show cancels a pending hide and vice-versa, so re-entering
 *     before the hide fires keeps the tooltip up, and leaving before the show
 *     fires means it never appears (no stuck tooltip).
 *
 * Keyboard:  Escape while visible hides immediately and stops propagation.
 *            Escape while hidden is ignored (event bubbles normally).
 *
 * ARIA:      aria-describedby wiring (trigger → content id) and role="tooltip" on
 *            the content are authored in the markup; the controller reads the
 *            parts but does not mutate these attributes.
 *
 * destroy()  Clears pending timers, removes all listeners, detaches the api.
 *
 * Delay-based behavior below uses fake timers (no real waits).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import { createTooltip } from "../../registry/recipes/tooltip/tooltip.js";

const SHOW_DELAY = 200;
const HIDE_DELAY = 100;

function setupTooltip() {
  document.body.innerHTML = `
    <div data-ui="tooltip" data-variant="top" data-state="hidden">
      <button data-part="trigger" aria-describedby="tt-content">Hover me</button>
      <div data-part="content" id="tt-content" role="tooltip" hidden>Helpful hint</div>
    </div>
  `;
  const root = document.querySelector("[data-ui='tooltip']") as HTMLElement;
  const trigger = root.querySelector("[data-part='trigger']") as HTMLElement;
  const content = root.querySelector("[data-part='content']") as HTMLElement;
  const api = createTooltip(root);
  return { root, trigger, content, api };
}

const isVisible = (root: HTMLElement, content: HTMLElement) =>
  root.dataset.state === "visible" && content.hidden === false;

describe("tooltip controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Initialization ──────────────────────────────────────────────────────────

  it("prevents double initialization", () => {
    const { root, api } = setupTooltip();
    const api2 = createTooltip(root);
    expect(api2).toBe(api);
  });

  it("starts hidden", () => {
    const { root, content } = setupTooltip();
    expect(root.dataset.state).toBe("hidden");
    expect(content.hidden).toBe(true);
  });

  // ── Imperative API ────────────────────────────────────────────────────────────

  it("show() reveals immediately", () => {
    const { root, content, api } = setupTooltip();
    api.show();
    expect(isVisible(root, content)).toBe(true);
  });

  it("hide() conceals immediately", () => {
    const { root, content, api } = setupTooltip();
    api.show();
    api.hide();
    expect(root.dataset.state).toBe("hidden");
    expect(content.hidden).toBe(true);
  });

  // ── Hover intent (fake timers) ─────────────────────────────────────────────────

  it("shows on hover after the show delay, not before", () => {
    const { root, trigger, content } = setupTooltip();
    trigger.dispatchEvent(new Event("mouseenter", { bubbles: true }));

    jest.advanceTimersByTime(SHOW_DELAY - 1);
    expect(isVisible(root, content)).toBe(false);

    jest.advanceTimersByTime(1);
    expect(isVisible(root, content)).toBe(true);
  });

  it("hides on pointer leave after the hide delay, not before", () => {
    const { root, trigger, content } = setupTooltip();
    trigger.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    jest.advanceTimersByTime(SHOW_DELAY);
    expect(isVisible(root, content)).toBe(true);

    trigger.dispatchEvent(new Event("mouseleave", { bubbles: true }));
    jest.advanceTimersByTime(HIDE_DELAY - 1);
    expect(isVisible(root, content)).toBe(true);

    jest.advanceTimersByTime(1);
    expect(isVisible(root, content)).toBe(false);
  });

  it("does not get stuck: enter then leave fully hides", () => {
    const { root, trigger, content } = setupTooltip();
    trigger.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    jest.advanceTimersByTime(SHOW_DELAY);
    trigger.dispatchEvent(new Event("mouseleave", { bubbles: true }));
    jest.advanceTimersByTime(HIDE_DELAY);
    expect(root.dataset.state).toBe("hidden");
    expect(content.hidden).toBe(true);
  });

  it("leaving before the show delay elapses cancels the show", () => {
    const { root, trigger, content } = setupTooltip();
    trigger.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    jest.advanceTimersByTime(SHOW_DELAY - 50); // still pending
    trigger.dispatchEvent(new Event("mouseleave", { bubbles: true }));
    jest.advanceTimersByTime(1000); // let every timer drain
    expect(isVisible(root, content)).toBe(false);
  });

  it("re-entering before the hide delay keeps the tooltip visible", () => {
    const { root, trigger, content } = setupTooltip();
    trigger.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    jest.advanceTimersByTime(SHOW_DELAY);
    trigger.dispatchEvent(new Event("mouseleave", { bubbles: true }));
    jest.advanceTimersByTime(HIDE_DELAY - 50); // hide still pending
    trigger.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    jest.advanceTimersByTime(1000);
    expect(isVisible(root, content)).toBe(true);
  });

  // ── Focus intent (fake timers) ─────────────────────────────────────────────────

  it("shows on focus after the show delay", () => {
    const { root, trigger, content } = setupTooltip();
    trigger.dispatchEvent(new Event("focusin", { bubbles: true }));
    jest.advanceTimersByTime(SHOW_DELAY);
    expect(isVisible(root, content)).toBe(true);
  });

  it("hides on blur after the hide delay", () => {
    const { root, trigger, content } = setupTooltip();
    trigger.dispatchEvent(new Event("focusin", { bubbles: true }));
    jest.advanceTimersByTime(SHOW_DELAY);
    trigger.dispatchEvent(new Event("focusout", { bubbles: true }));
    jest.advanceTimersByTime(HIDE_DELAY);
    expect(isVisible(root, content)).toBe(false);
  });

  // ── Escape ──────────────────────────────────────────────────────────────────

  it("Escape hides immediately when visible", () => {
    const { root, content, api } = setupTooltip();
    api.show();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.dataset.state).toBe("hidden");
    expect(content.hidden).toBe(true);
  });

  it("Escape is ignored when already hidden", () => {
    const { root } = setupTooltip();
    let bubbledPast = false;
    const onDocKeydown = () => {
      bubbledPast = true;
    };
    document.addEventListener("keydown", onDocKeydown);
    try {
      root.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      expect(root.dataset.state).toBe("hidden");
      // When hidden, the handler does not stopPropagation, so the event bubbles on.
      expect(bubbledPast).toBe(true);
    } finally {
      document.removeEventListener("keydown", onDocKeydown);
    }
  });

  // ── ARIA wiring (authored markup) ──────────────────────────────────────────────

  it("wires aria-describedby from trigger to the content id", () => {
    const { trigger, content } = setupTooltip();
    expect(trigger.getAttribute("aria-describedby")).toBe(content.id);
    expect(content.getAttribute("role")).toBe("tooltip");
  });

  // ── Teardown ──────────────────────────────────────────────────────────────────

  it("destroy() removes hover listeners", () => {
    const { root, trigger, content, api } = setupTooltip();
    api.destroy();
    trigger.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    jest.advanceTimersByTime(SHOW_DELAY);
    expect(isVisible(root, content)).toBe(false);
  });

  it("destroy() clears a pending show timer", () => {
    const { root, trigger, content, api } = setupTooltip();
    trigger.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    api.destroy();
    jest.advanceTimersByTime(SHOW_DELAY);
    expect(isVisible(root, content)).toBe(false);
  });

  it("destroy() detaches the api so re-init returns a fresh instance", () => {
    const { root, api } = setupTooltip();
    api.destroy();
    const api2 = createTooltip(root);
    expect(api2).not.toBe(api);
  });
});
