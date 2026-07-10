import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createSidebar } from "../../registry/recipes/sidebar/sidebar.js";
import { getFocusableElements } from "../../registry/core/focus.js";

// The controller reads `window.matchMedia` once at init, so the breakpoint mock
// must be installed BEFORE createSidebar. `setup()` does that. The mock returns a
// single controllable MediaQueryList whose `.matches` we can flip and re-emit to
// simulate the viewport crossing the breakpoint.

const origMatchMedia = (globalThis as any).window?.matchMedia;

type MockMql = {
  matches: boolean;
  media: string;
  addEventListener: (t: string, cb: (e: any) => void) => void;
  removeEventListener: (t: string, cb: (e: any) => void) => void;
  addListener: (cb: (e: any) => void) => void;
  removeListener: (cb: (e: any) => void) => void;
  _emit: (next: boolean) => void;
};

function installMatchMedia(mobile: boolean): MockMql {
  const listeners = new Set<(e: any) => void>();
  const mql: MockMql = {
    matches: mobile,
    media: "(max-width: 768px)",
    addEventListener: (t, cb) => {
      if (t === "change") listeners.add(cb);
    },
    removeEventListener: (_t, cb) => {
      listeners.delete(cb);
    },
    addListener: (cb) => listeners.add(cb),
    removeListener: (cb) => listeners.delete(cb),
    _emit(next) {
      mql.matches = next;
      for (const cb of [...listeners]) cb({ matches: next, media: mql.media });
    },
  };
  (window as any).matchMedia = () => mql;
  return mql;
}

function markup(initialState: string, withExternal: boolean) {
  return `
    <div style="display:flex">
      ${withExternal ? `<button id="ext" data-sidebar-toggle="sb" aria-controls="sb" aria-expanded="true" aria-label="Toggle">≡</button>` : ""}
      <div data-ui="sidebar" data-state="${initialState}" id="sb">
        <div data-part="overlay" hidden></div>
        <aside data-part="panel" aria-label="Primary">
          <div data-part="header">
            <a data-part="brand" href="#"><span data-part="brand-icon">◆</span><span data-part="brand-label">Acme</span></a>
            <button data-part="trigger" aria-label="Toggle sidebar" aria-expanded="true" aria-controls="sb">‹</button>
          </div>
          <nav data-part="nav" aria-label="Main">
            <a data-part="item" href="#" aria-current="page"><span data-part="icon">▦</span><span data-part="label">Dashboard</span></a>
            <a data-part="item" href="#"><span data-part="icon">☰</span><span data-part="label">Orders</span></a>
          </nav>
          <div data-part="footer"><button data-part="item" id="foot">Settings</button></div>
        </aside>
      </div>
    </div>`;
}

function setup(opts: { mobile?: boolean; state?: string; external?: boolean } = {}) {
  const { mobile = false, state = "expanded", external = false } = opts;
  const mql = installMatchMedia(mobile);
  document.body.innerHTML = markup(state, external);
  const root = document.querySelector("[data-ui='sidebar']") as HTMLElement;
  const api = createSidebar(root);
  const panel = root.querySelector("[data-part='panel']") as HTMLElement;
  const overlay = root.querySelector("[data-part='overlay']") as HTMLElement;
  const trigger = root.querySelector("[data-part='trigger']") as HTMLElement;
  const ext = document.getElementById("ext") as HTMLElement | null;
  return { root, api, panel, overlay, trigger, ext, mql };
}

const stateOf = (root: HTMLElement): string => root.dataset.state ?? "";
const expandedOf = (el: HTMLElement) => el.getAttribute("aria-expanded");
function tab(el: HTMLElement, shift = false) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  (window as any).matchMedia = origMatchMedia;
});

// ── Desktop state machine ──────────────────────────────────────────────────────

describe("sidebar · desktop state machine", () => {
  it("toggle transitions expanded → rail", () => {
    const { root, api } = setup({ mobile: false, state: "expanded" });
    expect(stateOf(root)).toBe("expanded");
    api.toggle();
    expect(stateOf(root)).toBe("rail");
  });

  it("toggle transitions rail → expanded", () => {
    const { root, api } = setup({ mobile: false, state: "rail" });
    expect(stateOf(root)).toBe("rail");
    api.toggle();
    expect(stateOf(root)).toBe("expanded");
  });

  it("expand() and collapse() set the desktop state directly", () => {
    const { root, api } = setup({ mobile: false, state: "expanded" });
    api.collapse();
    expect(stateOf(root)).toBe("rail");
    api.expand();
    expect(stateOf(root)).toBe("expanded");
  });

  it("does not become a drawer on desktop", () => {
    const { root, api } = setup({ mobile: false, state: "expanded" });
    api.toggle();
    api.toggle();
    expect(["expanded", "rail"]).toContain(stateOf(root));
  });
});

// ── aria-expanded tracking ─────────────────────────────────────────────────────

describe("sidebar · aria-expanded tracks state", () => {
  it("trigger aria-expanded follows expanded ↔ rail", () => {
    const { api, trigger } = setup({ mobile: false, state: "expanded" });
    expect(expandedOf(trigger)).toBe("true");
    api.toggle();
    expect(expandedOf(trigger)).toBe("false");
    api.toggle();
    expect(expandedOf(trigger)).toBe("true");
  });

  it("external trigger toggles the sidebar and its aria-expanded tracks too", () => {
    const { root, api, trigger, ext } = setup({ mobile: false, state: "expanded", external: true });
    expect(ext).not.toBeNull();
    ext!.click();
    expect(stateOf(root)).toBe("rail");
    expect(expandedOf(ext!)).toBe("false");
    expect(expandedOf(trigger)).toBe("false");
    // and driving via the API keeps the external button in sync
    api.expand();
    expect(expandedOf(ext!)).toBe("true");
  });
});

// ── Mobile drawer ──────────────────────────────────────────────────────────────

describe("sidebar · mobile drawer", () => {
  it("reconciles a declared desktop state to a closed drawer on init", () => {
    const { root, overlay, trigger } = setup({ mobile: true, state: "expanded" });
    expect(stateOf(root)).toBe("drawer");
    expect(overlay.hidden).toBe(true);
    expect(expandedOf(trigger)).toBe("false");
  });

  it("toggle opens then closes the drawer", () => {
    const { root, api, overlay } = setup({ mobile: true, state: "expanded" });
    api.toggle();
    expect(stateOf(root)).toBe("drawer-open");
    expect(overlay.hidden).toBe(false);
    api.toggle();
    expect(stateOf(root)).toBe("drawer");
    expect(overlay.hidden).toBe(true);
  });

  it("Escape closes the open drawer", () => {
    const { root, api } = setup({ mobile: true });
    api.open();
    expect(stateOf(root)).toBe("drawer-open");
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(stateOf(root)).toBe("drawer");
  });

  it("overlay click closes the open drawer", () => {
    const { root, api, overlay } = setup({ mobile: true });
    api.open();
    overlay.click();
    expect(stateOf(root)).toBe("drawer");
  });

  it("keeps the closed off-screen panel inert and out of the a11y tree", () => {
    const { api, panel } = setup({ mobile: true });
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    api.open();
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(panel.hasAttribute("aria-hidden")).toBe(false);
  });

  it("traps focus within the panel while open", () => {
    const { api, panel } = setup({ mobile: true });
    api.open();
    const focusable = getFocusableElements(panel) as HTMLElement[];
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // Opening focuses into the panel.
    expect(panel.contains(document.activeElement)).toBe(true);
    // Tab at the last element wraps to the first.
    last.focus();
    tab(last, false);
    expect(document.activeElement).toBe(first);
    // Shift+Tab at the first element wraps to the last.
    first.focus();
    tab(first, true);
    expect(document.activeElement).toBe(last);
  });

  it("locks body scroll while open and restores it on close", () => {
    document.body.style.overflow = "scroll";
    const { api } = setup({ mobile: true });
    api.open();
    expect(document.body.style.overflow).toBe("hidden");
    api.close();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("returns focus to the opener when closed", () => {
    const { api, ext } = setup({ mobile: true, external: true });
    ext!.focus();
    expect(document.activeElement).toBe(ext);
    api.open();
    expect(document.activeElement).not.toBe(ext); // moved into the panel
    api.close();
    expect(document.activeElement).toBe(ext);
  });
});

// ── Responsive breakpoint crossing ─────────────────────────────────────────────

describe("sidebar · breakpoint switching", () => {
  it("desktop → mobile collapses into a closed drawer", () => {
    const { root, mql } = setup({ mobile: false, state: "expanded" });
    expect(stateOf(root)).toBe("expanded");
    mql._emit(true);
    expect(stateOf(root)).toBe("drawer");
  });

  it("restores the persisted desktop state after a trip through mobile", () => {
    const { root, api, mql } = setup({ mobile: false, state: "expanded" });
    api.toggle(); // desktop preference becomes rail
    expect(stateOf(root)).toBe("rail");
    mql._emit(true); // to mobile
    expect(stateOf(root)).toBe("drawer");
    mql._emit(false); // back to desktop
    expect(stateOf(root)).toBe("rail"); // preference preserved
  });

  it("tears down an open drawer when the viewport widens to desktop", () => {
    document.body.style.overflow = "";
    const { root, api, mql } = setup({ mobile: true, state: "expanded" });
    api.open();
    expect(document.body.style.overflow).toBe("hidden");
    mql._emit(false); // widen to desktop
    expect(stateOf(root)).toBe("expanded");
    expect(document.body.style.overflow).toBe(""); // scroll lock released
  });
});

// ── Lifecycle ──────────────────────────────────────────────────────────────────

describe("sidebar · lifecycle", () => {
  it("prevents double initialization", () => {
    const { root, api } = setup();
    const again = createSidebar(root);
    expect(again).toBe(api);
  });

  it("destroy removes listeners", () => {
    const { root, api, trigger } = setup({ mobile: false, state: "expanded" });
    api.destroy();
    trigger.click();
    expect(stateOf(root)).toBe("expanded"); // no change after destroy
  });

  it("destroy releases a held scroll lock", () => {
    document.body.style.overflow = "auto";
    const { api } = setup({ mobile: true });
    api.open();
    expect(document.body.style.overflow).toBe("hidden");
    api.destroy();
    expect(document.body.style.overflow).toBe("auto");
  });
});
