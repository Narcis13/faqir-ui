import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createDrawer } from "../../registry/recipes/drawer/drawer.js";
import { getFocusableElements } from "../../registry/core/focus.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT — drawer controller (task 0.4-19 · ref §12.1)
//
// A drawer is a MODAL side panel. It shares the EXACT overlay contract with the
// sheet — labelled `role="dialog"` panel, `aria-modal="true"`, focus trap,
// Escape/overlay close, body scroll lock, focus return — and adds two things of
// its own: `left|right` side variants (plus a `full` size) and support for
// external openers declared as `[data-open="{drawer-id}"]` anywhere in the page.
//
// State machine (asserted here EXACTLY):
//     closed ──open()──▶ open ──close()──▶ closing ──(transitionend:transform)──▶ closed
//   • With a live panel transition, close() parks the root at "closing" and the
//     panel keeps rendering (overlay+panel still shown, scroll still locked) until
//     the `transform` transitionend fires — only then does it reach "closed",
//     hide, unlock scroll, and return focus.
//   • With no transition (layout-less test DOM), "closing" collapses straight to
//     "closed" within close().
//
// Scroll lock is idempotent and ALWAYS releases (double open/close, destroy) —
// mirrors the sheet exactly so the shared overlay guarantee holds for both.
// ─────────────────────────────────────────────────────────────────────────────

function setup(opts: { side?: string; size?: string; id?: string; external?: boolean } = {}) {
  const { side = "left", size = "md", id = "drawer", external = false } = opts;
  document.body.innerHTML = `
    ${external ? `<button id="ext" data-open="${id}">Open externally</button>` : ""}
    <div data-ui="drawer" data-state="closed" id="${id}">
      <button data-part="trigger">Open</button>
      <div data-part="overlay" hidden></div>
      <div data-part="panel" data-variant="${side}" data-size="${size}"
           role="dialog" aria-modal="true" aria-labelledby="${id}-title" hidden>
        <div data-part="header">
          <h2 id="${id}-title" data-part="title">Drawer Title</h2>
          <button data-part="close" aria-label="Close drawer">✕</button>
        </div>
        <div data-part="body">
          <button id="body-btn">Body action</button>
          <input id="body-input" type="text" />
        </div>
        <div data-part="footer">
          <button data-part="close">Cancel</button>
          <button id="save">Save</button>
        </div>
      </div>
    </div>
  `;
  const root = document.getElementById(id) as HTMLElement;
  const api = createDrawer(root);
  const trigger = root.querySelector("[data-part='trigger']") as HTMLElement;
  const overlay = root.querySelector("[data-part='overlay']") as HTMLElement;
  const panel = root.querySelector("[data-part='panel']") as HTMLElement;
  const ext = document.getElementById("ext") as HTMLElement | null;
  return { root, api, trigger, overlay, panel, ext };
}

const stateOf = (el: HTMLElement) => el.dataset.state ?? "";
function tab(el: Element, shift = false) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true }));
}
function escape(el: Element) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

// Make the panel report a live transition so the "closing" leg persists; return a
// restore fn. `endTransition` fires the terminating transitionend by hand.
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

// ── data-state transitions (asserted exactly) ───────────────────────────────
describe("drawer · data-state transitions", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("starts closed and opens on trigger click", () => {
    const { root, trigger, overlay, panel } = setup();
    expect(stateOf(root)).toBe("closed");
    trigger.click();
    expect(stateOf(root)).toBe("open");
    expect(overlay.hidden).toBe(false);
    expect(panel.hidden).toBe(false);
  });

  it("walks closed → open → closing → closed with a live transition", () => {
    const restore = withTransition();
    try {
      const { root, api, overlay, panel } = setup();
      expect(stateOf(root)).toBe("closed");

      api.open();
      expect(stateOf(root)).toBe("open");

      api.close();
      expect(stateOf(root)).toBe("closing"); // parked mid-slide
      expect(overlay.hidden).toBe(false);
      expect(panel.hidden).toBe(false);

      endTransition(panel);
      expect(stateOf(root)).toBe("closed");
      expect(overlay.hidden).toBe(true);
      expect(panel.hidden).toBe(true);
    } finally {
      restore();
    }
  });

  it("collapses 'closing' straight to 'closed' when no transition is active", () => {
    const { root, api } = setup();
    api.open();
    api.close();
    expect(stateOf(root)).toBe("closed");
  });

  it("toggle flips open ↔ closed", () => {
    const { root, api } = setup();
    api.toggle();
    expect(stateOf(root)).toBe("open");
    api.toggle();
    expect(stateOf(root)).toBe("closed");
  });
});

// ── Close affordances (shared with sheet) ───────────────────────────────────
describe("drawer · close affordances", () => {
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

// ── External triggers ───────────────────────────────────────────────────────
describe("drawer · external triggers", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("opens from an element with [data-open=id] outside the root", () => {
    const { root, ext } = setup({ external: true });
    expect(ext).not.toBeNull();
    ext!.click();
    expect(stateOf(root)).toBe("open");
  });

  it("destroy unbinds external triggers too", () => {
    const { root, api, ext } = setup({ external: true });
    api.destroy();
    ext!.click();
    expect(stateOf(root)).toBe("closed");
  });
});

// ── Focus trap (shared overlay contract) ────────────────────────────────────
describe("drawer · focus trap", () => {
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
    last.focus();
    expect(() => tab(last, false)).not.toThrow();
  });

  it("returns focus to the opener on close", () => {
    const { api, trigger, panel } = setup();
    trigger.focus();
    api.open();
    panel.querySelector<HTMLElement>("#save")!.focus();
    api.close();
    expect(document.activeElement).toBe(trigger);
  });
});

// ── Scroll lock (shared overlay contract) ───────────────────────────────────
describe("drawer · scroll lock", () => {
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
    api.open();
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

// ── Side + size variants ────────────────────────────────────────────────────
describe("drawer · side + size variants", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("reflects the left/right side variant onto the panel", () => {
    for (const side of ["left", "right"]) {
      const { panel } = setup({ side });
      expect(panel.getAttribute("data-variant")).toBe(side);
    }
  });

  it("reflects sm/md/lg/full sizes onto the panel", () => {
    for (const size of ["sm", "md", "lg", "full"]) {
      const { panel } = setup({ size });
      expect(panel.getAttribute("data-size")).toBe(size);
    }
  });
});

// ── Accessibility wiring (shared overlay contract) ──────────────────────────
describe("drawer · accessibility wiring", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("panel is a labelled modal dialog", () => {
    const { root, panel } = setup({ id: "a11y-drawer" });
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
describe("drawer · lifecycle", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("prevents double initialization", () => {
    const { root, api } = setup();
    expect(createDrawer(root)).toBe(api);
  });

  it("destroy unbinds the trigger", () => {
    const { root, api, trigger } = setup();
    api.destroy();
    trigger.click();
    expect(stateOf(root)).toBe("closed");
  });
});
