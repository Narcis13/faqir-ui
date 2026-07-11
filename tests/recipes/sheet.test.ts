import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createSheet } from "../../registry/recipes/sheet/sheet.js";
import { getFocusableElements } from "../../registry/core/focus.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT — sheet controller (task 0.4-19 · ref §12.1)
//
// A sheet is a MODAL overlay that slides in from a screen edge. It shares the
// full modal contract with dialog/drawer: labelled `role="dialog"` panel,
// `aria-modal="true"`, focus trap, Escape/overlay close, and body scroll lock.
//
// State machine (data-state on the root):
//     closed ──open()──▶ open ──close()──▶ closing ──(transitionend:transform)──▶ closed
//   • open():  state="open", overlay+panel un-hidden, body scroll LOCKED, focus
//     trapped inside the panel; the pre-open active element is remembered.
//   • close(): state="closing" immediately; the panel keeps sliding until its
//     `transform` transition ends, THEN state="closed", overlay+panel hidden,
//     scroll UNLOCKED, and focus returned to the opener.
//   • When no transition is active (the default in a layout-less test DOM,
//     computed transition-duration = 0), "closing" collapses straight into
//     "closed" synchronously — close() is effectively immediate.
//
// Scroll lock is idempotent (guarded by a saved previous overflow value): it can
// never leave the body stuck at `overflow:hidden`, even across double open/close
// sequences, and destroy() always releases a held lock.
// ─────────────────────────────────────────────────────────────────────────────

function setup(opts: { side?: string; size?: string; id?: string } = {}) {
  const { side = "bottom", size = "md", id = "sheet" } = opts;
  document.body.innerHTML = `
    <div data-ui="sheet" data-state="closed" id="${id}">
      <button data-part="trigger">Open</button>
      <div data-part="overlay" hidden></div>
      <div data-part="panel" data-variant="${side}" data-size="${size}"
           role="dialog" aria-modal="true" aria-labelledby="${id}-title" hidden>
        <div data-part="header">
          <h2 id="${id}-title" data-part="title">Sheet Title</h2>
          <button data-part="close" aria-label="Close sheet">✕</button>
        </div>
        <div data-part="body">
          <button id="body-btn">Body action</button>
          <input id="body-input" type="text" />
        </div>
        <div data-part="footer">
          <button data-part="close">Cancel</button>
          <button id="confirm">Confirm</button>
        </div>
      </div>
    </div>
  `;
  const root = document.getElementById(id) as HTMLElement;
  const api = createSheet(root);
  const trigger = root.querySelector("[data-part='trigger']") as HTMLElement;
  const overlay = root.querySelector("[data-part='overlay']") as HTMLElement;
  const panel = root.querySelector("[data-part='panel']") as HTMLElement;
  return { root, api, trigger, overlay, panel };
}

const stateOf = (el: HTMLElement) => el.dataset.state ?? "";
function tab(el: Element, shift = false) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true }));
}
function escape(el: Element) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

// Force the "closing" leg of the state machine to persist by making the panel
// report a live transition, then hand-fire the terminating transitionend. Returns
// a restore fn for the patched global getComputedStyle.
function withTransition(): () => void {
  const orig = globalThis.getComputedStyle;
  (globalThis as any).getComputedStyle = () => ({ transitionDuration: "0.3s" });
  return () => {
    (globalThis as any).getComputedStyle = orig;
  };
}
function endTransition(panel: Element, propertyName = "transform") {
  const ev = new Event("transitionend", { bubbles: true });
  Object.defineProperty(ev, "propertyName", { value: propertyName });
  panel.dispatchEvent(ev);
}

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

// ── Slide-in state machine ──────────────────────────────────────────────────
describe("sheet · slide-in state machine", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("opens on trigger click", () => {
    const { root, trigger, overlay, panel } = setup();
    trigger.click();
    expect(stateOf(root)).toBe("open");
    expect(overlay.hidden).toBe(false);
    expect(panel.hidden).toBe(false);
  });

  it("open() shows overlay and panel, close() hides both (immediate path)", () => {
    const { root, api, overlay, panel } = setup();
    api.open();
    expect(stateOf(root)).toBe("open");
    api.close();
    expect(stateOf(root)).toBe("closed");
    expect(overlay.hidden).toBe(true);
    expect(panel.hidden).toBe(true);
  });

  it("toggle opens then closes", () => {
    const { root, api } = setup();
    api.toggle();
    expect(stateOf(root)).toBe("open");
    api.toggle();
    expect(stateOf(root)).toBe("closed");
  });

  it("holds at 'closing' during the slide-out, then lands on 'closed'", () => {
    const restore = withTransition();
    try {
      const { root, api, overlay, panel } = setup();
      api.open();
      expect(stateOf(root)).toBe("open");

      api.close();
      // Mid-transition: still visible, state parked at "closing".
      expect(stateOf(root)).toBe("closing");
      expect(overlay.hidden).toBe(false);
      expect(panel.hidden).toBe(false);

      endTransition(panel);
      // Transition finished: fully closed and hidden.
      expect(stateOf(root)).toBe("closed");
      expect(overlay.hidden).toBe(true);
      expect(panel.hidden).toBe(true);
    } finally {
      restore();
    }
  });
});

// ── Close affordances ───────────────────────────────────────────────────────
describe("sheet · close affordances", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("closes on Escape when open", () => {
    const { root, api } = setup();
    api.open();
    escape(root);
    expect(stateOf(root)).toBe("closed");
  });

  it("ignores Escape while closed", () => {
    const { root } = setup();
    escape(root);
    expect(stateOf(root)).toBe("closed");
  });

  it("closes on overlay click", () => {
    const { root, api, overlay } = setup();
    api.open();
    overlay.click();
    expect(stateOf(root)).toBe("closed");
  });

  it("closes on any close-button click (header and footer)", () => {
    const { root, api } = setup();
    const closeButtons = root.querySelectorAll<HTMLElement>("[data-part='close']");
    expect(closeButtons.length).toBe(2);
    api.open();
    closeButtons[0].click();
    expect(stateOf(root)).toBe("closed");
    api.open();
    closeButtons[1].click();
    expect(stateOf(root)).toBe("closed");
  });
});

// ── Focus trap ──────────────────────────────────────────────────────────────
describe("sheet · focus trap", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("cycles Tab from the last focusable to the first", () => {
    const { api, panel } = setup();
    api.open();
    const focusable = getFocusableElements(panel) as HTMLElement[];
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();
    tab(last, false);
    expect(document.activeElement).toBe(first);
  });

  it("reverses Shift+Tab from the first focusable to the last", () => {
    const { api, panel } = setup();
    api.open();
    const focusable = getFocusableElements(panel) as HTMLElement[];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();
    tab(first, true);
    expect(document.activeElement).toBe(last);
  });

  it("releases the trap after close (Tab no longer wraps)", () => {
    const { api, panel } = setup();
    api.open();
    const focusable = getFocusableElements(panel) as HTMLElement[];
    const last = focusable[focusable.length - 1];
    api.close();
    // Trap listener removed: dispatching Tab at the (now hidden) panel is inert.
    last.focus();
    expect(() => tab(last, false)).not.toThrow();
  });

  it("returns focus to the opener on close", () => {
    const { api, trigger, panel } = setup();
    trigger.focus();
    api.open();
    // Simulate the user moving focus inside the panel.
    panel.querySelector<HTMLElement>("#confirm")!.focus();
    api.close();
    expect(document.activeElement).toBe(trigger);
  });
});

// ── Scroll lock ─────────────────────────────────────────────────────────────
describe("sheet · scroll lock", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("locks body scroll on open and restores the prior value on close", () => {
    document.body.style.overflow = "scroll";
    const { api } = setup();
    api.open();
    expect(document.body.style.overflow).toBe("hidden");
    api.close();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("keeps the lock held while parked at 'closing', releases it at transition end", () => {
    const restore = withTransition();
    try {
      const { api, panel } = setup();
      api.open();
      expect(document.body.style.overflow).toBe("hidden");
      api.close();
      // Still animating out → still locked.
      expect(document.body.style.overflow).toBe("hidden");
      endTransition(panel);
      expect(document.body.style.overflow).toBe("");
    } finally {
      restore();
    }
  });

  it("ALWAYS unlocks across a double open/close sequence", () => {
    document.body.style.overflow = "auto";
    const { api } = setup();
    api.open();
    api.close();
    api.open();
    api.close();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("a redundant open (double open) still leaves a single, releasable lock", () => {
    document.body.style.overflow = "auto";
    const { api } = setup();
    api.open();
    api.open(); // no-op for the lock — guard prevents clobbering the saved value
    expect(document.body.style.overflow).toBe("hidden");
    api.close();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("destroy releases a held scroll lock", () => {
    document.body.style.overflow = "scroll";
    const { api } = setup();
    api.open();
    expect(document.body.style.overflow).toBe("hidden");
    api.destroy();
    expect(document.body.style.overflow).toBe("scroll");
  });
});

// ── Variants ────────────────────────────────────────────────────────────────
describe("sheet · side + size variants", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("reflects the side variant onto the panel", () => {
    for (const side of ["bottom", "top", "left", "right"]) {
      const { panel } = setup({ side });
      expect(panel.getAttribute("data-variant")).toBe(side);
    }
  });

  it("reflects the size onto the panel", () => {
    for (const size of ["sm", "md", "lg"]) {
      const { panel } = setup({ size });
      expect(panel.getAttribute("data-size")).toBe(size);
    }
  });
});

// ── Accessibility wiring ────────────────────────────────────────────────────
describe("sheet · accessibility wiring", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("panel is a labelled modal dialog", () => {
    const { root, panel } = setup({ id: "a11y-sheet" });
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    const title = root.querySelector("[data-part='title']") as HTMLElement;
    expect(panel.getAttribute("aria-labelledby")).toBe(title.id);
  });

  it("close button has an accessible label", () => {
    const { root } = setup();
    const closeBtn = root.querySelector("[data-part='close']") as HTMLElement;
    expect(closeBtn.getAttribute("aria-label")).toBeTruthy();
  });

  it("overlay and panel are hidden while closed", () => {
    const { overlay, panel } = setup();
    expect(overlay.hidden).toBe(true);
    expect(panel.hidden).toBe(true);
  });
});

// ── Lifecycle ───────────────────────────────────────────────────────────────
describe("sheet · lifecycle", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("prevents double initialization", () => {
    const { root, api } = setup();
    expect(createSheet(root)).toBe(api);
  });

  it("destroy unbinds the trigger", () => {
    const { root, api, trigger } = setup();
    api.destroy();
    trigger.click();
    expect(stateOf(root)).toBe("closed");
  });
});
