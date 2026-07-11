import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPopover } from "../../registry/recipes/popover/popover.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT — popover controller (task 0.4-19 · ref §12.1)
//
// A popover is a lightweight, NON-modal anchored popup. Unlike the sheet/drawer
// overlays it does not trap focus, lock scroll, or dim the page; it closes on a
// click anywhere outside its own subtree.
//
//   • Trigger click TOGGLES: closed → open → closed. `aria-expanded` on the
//     trigger mirrors the state ("true"/"false"); content `hidden` mirrors it too.
//   • Outside click (a document-level `pointerdown` whose target is NOT inside
//     the popover root) closes. A pointerdown INSIDE the root never closes it.
//   • Escape closes AND returns focus to the trigger (the one path that restores
//     focus — outside-click and the close button do not move focus).
//   • The optional close button closes and stops the click from propagating out
//     as an "outside" click.
//   • Positioning is declarative: `data-variant` (position) + `data-align` live on
//     the content element; the controller never computes coordinates.
//   • Nested sanity: an inner popover living inside an outer popover's content is
//     independent — a pointerdown inside the inner subtree closes neither; a
//     pointerdown in the outer content but outside the inner closes only the inner.
//   • Idempotent init (second createPopover returns the same api) and a destroy()
//     that unbinds every listener, including the document-level outside-click one.
// ─────────────────────────────────────────────────────────────────────────────

function setup(variant = "bottom", align = "start", id = "pop") {
  document.body.innerHTML = `
    <button id="before">before</button>
    <div data-ui="popover" data-state="closed" id="${id}">
      <button data-part="trigger" aria-haspopup="true" aria-expanded="false">Show</button>
      <div data-part="content" data-variant="${variant}" data-align="${align}" hidden>
        <p id="${id}-text">Popover body</p>
        <button data-part="close" aria-label="Close popover">✕</button>
      </div>
    </div>
    <button id="outside">outside</button>
  `;
  const root = document.getElementById(id) as HTMLElement;
  const api = createPopover(root);
  const trigger = root.querySelector("[data-part='trigger']") as HTMLElement;
  const content = root.querySelector("[data-part='content']") as HTMLElement;
  const closeBtn = root.querySelector("[data-part='close']") as HTMLElement;
  return { root, api, trigger, content, closeBtn };
}

const stateOf = (el: HTMLElement) => el.dataset.state ?? "";
const expandedOf = (el: HTMLElement) => el.getAttribute("aria-expanded");

// Outside-click is wired via document-level `pointerdown`. Dispatch a bubbling
// pointerdown from a concrete node so `el.contains(e.target)` sees the real target.
function pointerdown(el: Element) {
  el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
}
function escape(el: Element) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

// ── Open / close via trigger ────────────────────────────────────────────────
describe("popover · trigger toggle", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("opens on trigger click", () => {
    const { root, trigger, content } = setup();
    trigger.click();
    expect(stateOf(root)).toBe("open");
    expect(content.hidden).toBe(false);
    expect(expandedOf(trigger)).toBe("true");
  });

  it("closes on a second trigger click (toggle)", () => {
    const { root, trigger, content } = setup();
    trigger.click();
    trigger.click();
    expect(stateOf(root)).toBe("closed");
    expect(content.hidden).toBe(true);
    expect(expandedOf(trigger)).toBe("false");
  });

  it("api open/close/toggle drive the same state", () => {
    const { root, api } = setup();
    api.open();
    expect(stateOf(root)).toBe("open");
    api.close();
    expect(stateOf(root)).toBe("closed");
    api.toggle();
    expect(stateOf(root)).toBe("open");
    api.toggle();
    expect(stateOf(root)).toBe("closed");
  });

  it("content is hidden while closed and shown while open", () => {
    const { api, content } = setup();
    expect(content.hidden).toBe(true);
    api.open();
    expect(content.hidden).toBe(false);
    api.close();
    expect(content.hidden).toBe(true);
  });
});

// ── Outside click ───────────────────────────────────────────────────────────
describe("popover · outside-click close", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("closes on a pointerdown outside the root", () => {
    const { root, api } = setup();
    api.open();
    pointerdown(document.getElementById("outside")!);
    expect(stateOf(root)).toBe("closed");
  });

  it("does NOT close on a pointerdown inside the content", () => {
    const { root, api, content } = setup();
    api.open();
    pointerdown(content.querySelector("#pop-text")!);
    expect(stateOf(root)).toBe("open");
  });

  it("stops listening for outside clicks once closed", () => {
    const { root, api } = setup();
    api.open();
    api.close();
    // A stray outside pointerdown after close must not throw or re-toggle.
    pointerdown(document.getElementById("outside")!);
    expect(stateOf(root)).toBe("closed");
  });
});

// ── Escape + focus return ───────────────────────────────────────────────────
describe("popover · escape and focus return", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("closes on Escape when open", () => {
    const { root, api } = setup();
    api.open();
    escape(root);
    expect(stateOf(root)).toBe("closed");
  });

  it("returns focus to the trigger on Escape", () => {
    const { root, api, trigger, content } = setup();
    api.open();
    // Move focus into the content, then Escape must restore it to the trigger.
    content.querySelector<HTMLElement>("[data-part='close']")!.focus();
    escape(root);
    expect(document.activeElement).toBe(trigger);
  });

  it("ignores Escape while closed (no throw, stays closed)", () => {
    const { root } = setup();
    expect(() => escape(root)).not.toThrow();
    expect(stateOf(root)).toBe("closed");
  });
});

// ── Close button ────────────────────────────────────────────────────────────
describe("popover · close button", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("closes on close-button click", () => {
    const { root, api, closeBtn } = setup();
    api.open();
    closeBtn.click();
    expect(stateOf(root)).toBe("closed");
  });
});

// ── Positioning attributes ──────────────────────────────────────────────────
describe("popover · positioning attributes", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("reflects the requested position/align onto the content", () => {
    const { content } = setup("top", "end");
    expect(content.getAttribute("data-variant")).toBe("top");
    expect(content.getAttribute("data-align")).toBe("end");
  });

  it("preserves positioning attributes across open/close", () => {
    const { api, content } = setup("right", "center");
    api.open();
    api.close();
    expect(content.getAttribute("data-variant")).toBe("right");
    expect(content.getAttribute("data-align")).toBe("center");
  });

  it("trigger carries aria-haspopup", () => {
    const { trigger } = setup();
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");
  });
});

// ── Nested popover sanity ───────────────────────────────────────────────────
describe("popover · nested sanity", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  function setupNested() {
    document.body.innerHTML = `
      <div data-ui="popover" data-state="closed" id="outer">
        <button data-part="trigger" aria-haspopup="true" aria-expanded="false">Outer</button>
        <div data-part="content" data-variant="bottom" data-align="start" hidden>
          <p id="outer-text">Outer body</p>
          <div data-ui="popover" data-state="closed" id="inner">
            <button data-part="trigger" aria-haspopup="true" aria-expanded="false">Inner</button>
            <div data-part="content" data-variant="top" data-align="end" hidden>
              <p id="inner-text">Inner body</p>
            </div>
          </div>
        </div>
      </div>
      <button id="outside">outside</button>
    `;
    const outer = document.getElementById("outer") as HTMLElement;
    const inner = document.getElementById("inner") as HTMLElement;
    const outerApi = createPopover(outer);
    const innerApi = createPopover(inner);
    return { outer, inner, outerApi, innerApi };
  }

  it("each popover resolves its OWN trigger/content, not a descendant's", () => {
    const { outer, inner } = setupNested();
    const outerTrigger = outer.querySelector("[data-part='trigger']") as HTMLElement;
    const innerTrigger = inner.querySelector("[data-part='trigger']") as HTMLElement;
    expect(outerTrigger.textContent).toBe("Outer");
    expect(innerTrigger.textContent).toBe("Inner");
    expect(innerTrigger).not.toBe(outerTrigger);
  });

  it("a pointerdown inside the inner subtree closes neither popover", () => {
    const { outer, inner, outerApi, innerApi } = setupNested();
    outerApi.open();
    innerApi.open();
    pointerdown(document.getElementById("inner-text")!);
    expect(stateOf(outer)).toBe("open");
    expect(stateOf(inner)).toBe("open");
  });

  it("a pointerdown in the outer content (outside inner) closes only the inner", () => {
    const { outer, inner, outerApi, innerApi } = setupNested();
    outerApi.open();
    innerApi.open();
    pointerdown(document.getElementById("outer-text")!);
    expect(stateOf(inner)).toBe("closed");
    expect(stateOf(outer)).toBe("open");
  });

  it("a pointerdown fully outside closes the still-open outer", () => {
    const { outer, outerApi } = setupNested();
    outerApi.open();
    pointerdown(document.getElementById("outside")!);
    expect(stateOf(outer)).toBe("closed");
  });
});

// ── Lifecycle ───────────────────────────────────────────────────────────────
describe("popover · lifecycle", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("prevents double initialization", () => {
    const { root, api } = setup();
    expect(createPopover(root)).toBe(api);
  });

  it("destroy unbinds the trigger toggle", () => {
    const { root, api, trigger } = setup();
    api.destroy();
    trigger.click();
    expect(stateOf(root)).toBe("closed");
  });

  it("destroy tears down the open-state outside-click listener", () => {
    const { root, api } = setup();
    api.open();
    api.destroy();
    // The document-level pointerdown listener must be gone: no throw, no re-entry.
    expect(() => pointerdown(document.getElementById("outside")!)).not.toThrow();
  });
});
