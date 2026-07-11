/**
 * ─── Accordion controller contract ────────────────────────────────────────────
 *
 * Factory:   createAccordion(root) → { toggle, expand, collapse, expandAll,
 *                                       collapseAll, destroy }
 *            Idempotent per element: a second call returns the api stored on
 *            `root._faqirAccordion`.
 *
 * Structure: root contains `[data-part="item"]` blocks, each with a
 *            `[data-part="trigger"]` (<button>) and a `[data-part="content"]`.
 *            Items are addressed by their zero-based index in document order.
 *
 * Modes (root data-variant):
 *   • "single"   — expanding an item collapses every other item.
 *   • otherwise  — "multiple": items expand/collapse independently.
 *   (Both modes allow the all-collapsed state — toggling the open item shut is fine.)
 *
 * State per item, kept in lockstep by expandItem/collapseItem:
 *   expanded  → item.dataset.state="expanded", trigger[aria-expanded]="true",
 *               content.hidden=false
 *   collapsed → item.dataset.state="collapsed", trigger[aria-expanded]="false",
 *               content.hidden=true
 *   These are set synchronously — there is no dependence on transitionend, so a
 *   CSS collapse animation cannot desync the ARIA/visibility state.
 *
 * Interaction:
 *   • Click on (or within) a trigger toggles that item.
 *   • Enter / Space on a trigger toggles it (keydown, with preventDefault).
 *   • toggle/expand/collapse ignore out-of-range indices.
 *   • expandAll / collapseAll act on every item (expandAll ignores single-mode
 *     exclusivity — it is an explicit imperative escape hatch).
 *
 * ARIA wiring (authored markup, read but not mutated by the controller):
 *   trigger[aria-controls] → content id; content[role]="region";
 *   content[aria-labelledby] → trigger id.
 *
 * NOT IMPLEMENTED (documented gaps, see FAQIR-PLAN follow-ups):
 *   • WAI-APG roving-focus arrow keys (Down/Up/Home/End move focus between
 *     headers) — these are OPTIONAL in the APG and are absent here. Codified as
 *     "no-op" below. Filed as follow-up 0.4-25.
 *   • The keydown Enter/Space handler runs *in addition to* a native <button>
 *     click, which can double-activate in a real browser (happy-dom does not
 *     synthesize the click, so it is invisible here). Filed as follow-up 0.4-26.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { createAccordion } from "../../registry/recipes/accordion/accordion.js";

function item(html: string, id: string, expanded = false) {
  const state = expanded ? "expanded" : "collapsed";
  const hidden = expanded ? "" : "hidden";
  return `
    <div data-part="item" data-state="${state}">
      <button data-part="trigger" id="trigger-${id}" aria-expanded="${expanded}"
              aria-controls="content-${id}"><span>Header ${id}</span>
        <span data-part="icon" aria-hidden="true">▾</span></button>
      <div data-part="content" id="content-${id}" role="region"
           aria-labelledby="trigger-${id}" ${hidden}>Body ${id}</div>
    </div>`;
}

function setupAccordion(variant = "single", expandedIndex = -1) {
  document.body.innerHTML = `
    <div data-ui="accordion" data-variant="${variant}">
      ${item("1", "1", expandedIndex === 0)}
      ${item("2", "2", expandedIndex === 1)}
      ${item("3", "3", expandedIndex === 2)}
    </div>
  `;
  const root = document.querySelector("[data-ui='accordion']") as HTMLElement;
  const api = createAccordion(root);
  return { root, api };
}

const items = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-part='item']")] as HTMLElement[];
const triggers = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-part='trigger']")] as HTMLElement[];
const contents = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-part='content']")] as HTMLElement[];

function assertExpanded(root: HTMLElement, index: number, expanded: boolean) {
  expect(items(root)[index].dataset.state).toBe(expanded ? "expanded" : "collapsed");
  expect(triggers(root)[index].getAttribute("aria-expanded")).toBe(String(expanded));
  expect(contents(root)[index].hidden).toBe(!expanded);
}

describe("accordion controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // ── Initialization ──────────────────────────────────────────────────────────

  it("prevents double initialization", () => {
    const { root, api } = setupAccordion();
    const api2 = createAccordion(root);
    expect(api2).toBe(api);
  });

  it("respects the initial expanded/collapsed markup", () => {
    const { root } = setupAccordion("multiple", 0);
    assertExpanded(root, 0, true);
    assertExpanded(root, 1, false);
    assertExpanded(root, 2, false);
  });

  // ── Click toggling ────────────────────────────────────────────────────────────

  it("clicking a trigger expands its item", () => {
    const { root } = setupAccordion();
    triggers(root)[0].click();
    assertExpanded(root, 0, true);
  });

  it("clicking an expanded trigger collapses it again", () => {
    const { root } = setupAccordion();
    triggers(root)[0].click();
    triggers(root)[0].click();
    assertExpanded(root, 0, false);
  });

  it("clicking a child element inside the trigger still toggles", () => {
    const { root } = setupAccordion();
    const icon = triggers(root)[0].querySelector("[data-part='icon']") as HTMLElement;
    icon.click();
    assertExpanded(root, 0, true);
  });

  // ── Single vs multiple modes ──────────────────────────────────────────────────

  it("single mode: expanding one item collapses the others", () => {
    const { root } = setupAccordion("single");
    triggers(root)[0].click();
    assertExpanded(root, 0, true);

    triggers(root)[1].click();
    assertExpanded(root, 0, false);
    assertExpanded(root, 1, true);
    assertExpanded(root, 2, false);
  });

  it("multiple mode: items expand independently", () => {
    const { root } = setupAccordion("multiple");
    triggers(root)[0].click();
    triggers(root)[1].click();
    assertExpanded(root, 0, true);
    assertExpanded(root, 1, true);
  });

  it("single mode still allows collapsing the open item (all-collapsed)", () => {
    const { root } = setupAccordion("single");
    triggers(root)[0].click();
    triggers(root)[0].click();
    items(root).forEach((_, i) => assertExpanded(root, i, false));
  });

  // ── Imperative API ────────────────────────────────────────────────────────────

  it("expand(index) / collapse(index) drive a single item", () => {
    const { root, api } = setupAccordion("multiple");
    api.expand(1);
    assertExpanded(root, 1, true);
    api.collapse(1);
    assertExpanded(root, 1, false);
  });

  it("toggle(index) flips the addressed item", () => {
    const { root, api } = setupAccordion("multiple");
    api.toggle(2);
    assertExpanded(root, 2, true);
    api.toggle(2);
    assertExpanded(root, 2, false);
  });

  it("expand(index) in single mode collapses the others", () => {
    const { root, api } = setupAccordion("single");
    api.expand(0);
    api.expand(2);
    assertExpanded(root, 0, false);
    assertExpanded(root, 2, true);
  });

  it("ignores out-of-range indices", () => {
    const { root, api } = setupAccordion("multiple");
    expect(() => {
      api.expand(-1);
      api.expand(99);
      api.collapse(-1);
      api.toggle(99);
    }).not.toThrow();
    items(root).forEach((_, i) => assertExpanded(root, i, false));
  });

  it("expandAll expands every item; collapseAll collapses every item", () => {
    const { root, api } = setupAccordion("multiple");
    api.expandAll();
    items(root).forEach((_, i) => assertExpanded(root, i, true));
    api.collapseAll();
    items(root).forEach((_, i) => assertExpanded(root, i, false));
  });

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  it("Enter on a trigger toggles the item", () => {
    const { root } = setupAccordion("multiple");
    triggers(root)[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    assertExpanded(root, 1, true);
  });

  it("Space on a trigger toggles the item and prevents default", () => {
    const { root } = setupAccordion("multiple");
    const ev = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    triggers(root)[1].dispatchEvent(ev);
    assertExpanded(root, 1, true);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("arrow keys and Home/End are currently no-ops (gap → 0.4-25)", () => {
    const { root } = setupAccordion("multiple");
    const before = document.activeElement;
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      triggers(root)[0].dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true })
      );
    }
    // No state change and no roving focus movement.
    items(root).forEach((_, i) => assertExpanded(root, i, false));
    expect(document.activeElement).toBe(before);
  });

  // ── ARIA wiring (authored markup) ──────────────────────────────────────────────

  it("aria-controls links each trigger to its content", () => {
    const { root } = setupAccordion();
    triggers(root).forEach((t, i) => {
      expect(t.getAttribute("aria-controls")).toBe(contents(root)[i].id);
    });
  });

  it("content regions are labelled by their trigger", () => {
    const { root } = setupAccordion();
    contents(root).forEach((c, i) => {
      expect(c.getAttribute("role")).toBe("region");
      expect(c.getAttribute("aria-labelledby")).toBe(triggers(root)[i].id);
    });
  });

  // ── Animation-hook safety ─────────────────────────────────────────────────────

  it("state stays consistent through rapid toggles (no transitionend dependency)", () => {
    const { root, api } = setupAccordion("multiple");
    for (let i = 0; i < 5; i++) api.toggle(0);
    // Odd number of toggles ends expanded, fully consistent — no half-open state.
    assertExpanded(root, 0, true);
    api.toggle(0);
    assertExpanded(root, 0, false);
  });

  // ── Teardown ──────────────────────────────────────────────────────────────────

  it("destroy() removes click and keyboard listeners", () => {
    const { root, api } = setupAccordion("multiple");
    api.destroy();
    triggers(root)[0].click();
    triggers(root)[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    assertExpanded(root, 0, false);
  });

  it("destroy() detaches the api so re-init returns a fresh instance", () => {
    const { root, api } = setupAccordion();
    api.destroy();
    const api2 = createAccordion(root);
    expect(api2).not.toBe(api);
  });
});
