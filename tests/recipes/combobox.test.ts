// ═══════════════════════════════════════════════════════════════════════════
// combobox — controller contract  [task 0.4-21 · Controller tests D]
// ═══════════════════════════════════════════════════════════════════════════
//
// CONTRACT (current behavior — these tests codify it; the GAP tests at the
// bottom flip when their filed follow-up lands)
//   • Closed by default: data-state="closed", listbox [hidden], input
//     aria-expanded="false". The input is the APG combobox anchor
//     (role="combobox", aria-autocomplete="list", aria-controls → listbox id).
//   • open()/close() flip data-state, listbox.hidden and input aria-expanded.
//     open() wires an outside-click (pointerdown) listener; close() tears it
//     down and clears the active highlight.
//   • Typing (input event) opens if closed, then filters options by
//     case-insensitive substring: non-matches get `data-hidden`, the `empty`
//     element toggles on visibleCount, and the active highlight resets.
//   • Keyboard on the input: ArrowDown/ArrowUp move the highlight (wrapping)
//     over VISIBLE options only via `data-highlighted`; Home/End jump to the
//     first/last visible option (only while open with visible options); Enter
//     selects the highlighted option; Escape closes.
//   • Selecting (click or Enter) writes the option's trimmed text into
//     input.value, updates getValue(), and closes. select is by VISIBLE index.
//   • getValue() returns the last committed value; setValue(v) writes the input
//     and in-memory value without touching option markup.
//   • Double init returns the same api; destroy() unbinds every listener.
//
// KNOWN GAPS (asserted as current behavior; filed as follow-ups)
//   • 0.4-30 — APG activedescendant: the active option is tracked only via
//     `data-highlighted`, options carry no `id`, the input never gets
//     `aria-activedescendant`, AND the highlight is mirrored onto the option's
//     `aria-selected` (conflating "active" with "selected").
//   • 0.4-31 — selection marker is not persisted: selectOption sets
//     aria-selected="true" then immediately close()→clearHighlight() wipes it
//     back to "false", so after a selection NO option carries aria-selected
//     (unlike select-custom). The value survives only in input.value / getValue.
//   • 0.4-32 — no blur/outside-click commit-or-revert: there is no blur
//     handler. Outside-click closes the popup but leaves the typed text in the
//     input as-is — it is neither committed as a selection nor reverted to the
//     last committed value.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createCombobox } from "../../registry/recipes/combobox/combobox.js";

const mounted: Array<{ destroy: () => void }> = [];

function setup() {
  document.body.innerHTML = `
    <div data-ui="combobox" data-state="closed" data-size="md">
      <input
        data-part="input"
        type="text"
        role="combobox"
        aria-expanded="false"
        aria-autocomplete="list"
        aria-controls="combobox-listbox-1"
        placeholder="Search..."
      >
      <ul data-part="listbox" role="listbox" id="combobox-listbox-1" hidden>
        <li data-part="option" role="option" aria-selected="false">Apple</li>
        <li data-part="option" role="option" aria-selected="false">Banana</li>
        <li data-part="option" role="option" aria-selected="false">Cherry</li>
        <li data-part="option" role="option" aria-selected="false">Grape</li>
        <li data-part="option" role="option" aria-selected="false">Orange</li>
        <li data-part="empty" hidden>No results found</li>
      </ul>
    </div>`;
  const root = document.querySelector("[data-ui='combobox']") as HTMLElement;
  const api = createCombobox(root);
  mounted.push(api);
  const input = root.querySelector("[data-part='input']") as HTMLInputElement;
  const listbox = root.querySelector("[data-part='listbox']") as HTMLElement;
  const options = () => [...root.querySelectorAll("[data-part='option']")] as HTMLElement[];
  const empty = () => root.querySelector("[data-part='empty']") as HTMLElement;
  const highlighted = () =>
    root.querySelector("[data-part='option'][data-highlighted]") as HTMLElement | null;
  // Compare by text, not DOM node: a failing DOM-node `toBe` diff is
  // pathologically slow to format under happy-dom.
  const highlightedText = () => highlighted()?.textContent?.trim() ?? null;
  const visibleText = () =>
    options()
      .filter((o) => !o.hasAttribute("data-hidden"))
      .map((o) => o.textContent?.trim());
  const type = (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const key = (k: string) =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  return { root, api, input, listbox, options, empty, highlighted, highlightedText, visibleText, type, key };
}

// The static APG combobox attributes + the one dynamic one (aria-expanded).
// Called at every interaction step per the acceptance criteria.
function assertComboboxAria(input: HTMLInputElement, expanded: boolean) {
  expect(input.getAttribute("role")).toBe("combobox");
  expect(input.getAttribute("aria-autocomplete")).toBe("list");
  expect(input.hasAttribute("aria-controls")).toBe(true);
  expect(input.getAttribute("aria-expanded")).toBe(String(expanded));
}

describe("combobox controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    while (mounted.length) mounted.pop()!.destroy();
  });

  // ── open / close ───────────────────────────────────────────────────────────
  it("is closed by default with the full APG combobox attribute set", () => {
    const { root, listbox, input } = setup();
    expect(root.dataset.state).toBe("closed");
    expect(listbox.hidden).toBe(true);
    assertComboboxAria(input, false);
  });

  it("open() opens the listbox and reflects aria-expanded", () => {
    const { root, api, listbox, input } = setup();
    api.open();
    expect(root.dataset.state).toBe("open");
    expect(listbox.hidden).toBe(false);
    assertComboboxAria(input, true);
  });

  it("close() closes the listbox and resets aria-expanded", () => {
    const { root, api, listbox, input } = setup();
    api.open();
    api.close();
    expect(root.dataset.state).toBe("closed");
    expect(listbox.hidden).toBe(true);
    assertComboboxAria(input, false);
  });

  it("focusing the input opens the listbox", () => {
    const { root, input } = setup();
    input.dispatchEvent(new Event("focus"));
    expect(root.dataset.state).toBe("open");
  });

  it("clicking outside (pointerdown) closes an open combobox", () => {
    const { root, api, input } = setup();
    api.open();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(root.dataset.state).toBe("closed");
    assertComboboxAria(input, false);
  });

  // ── filter-as-you-type ─────────────────────────────────────────────────────
  it("typing opens the combobox and filters options by substring", () => {
    const { root, input, visibleText, type } = setup();
    type("an"); // matches Banana, Orange
    expect(root.dataset.state).toBe("open");
    assertComboboxAria(input, true);
    expect(visibleText()).toEqual(["Banana", "Orange"]);
  });

  it("filtering is case-insensitive", () => {
    const { visibleText, type } = setup();
    type("CHER");
    expect(visibleText()).toEqual(["Cherry"]);
  });

  it("filter() returns the visible count and hides non-matches", () => {
    const { api, options } = setup();
    api.open();
    expect(api.filter("gr")).toBe(1); // Grape
    expect(options().filter((o) => o.hasAttribute("data-hidden")).length).toBe(4);
  });

  it("narrowing then widening the query restores options", () => {
    const { visibleText, type } = setup();
    type("ap"); // Apple, Grape
    expect(visibleText()).toEqual(["Apple", "Grape"]);
    type("a"); // Apple, Banana, Grape, Orange
    expect(visibleText()).toEqual(["Apple", "Banana", "Grape", "Orange"]);
  });

  it("filtering resets any active highlight", () => {
    const { key, type, highlighted } = setup();
    key("ArrowDown"); // opens + highlights Apple
    expect(highlighted()).not.toBeNull();
    type("a");
    expect(highlighted()).toBeNull();
  });

  // ── no-results / empty state ────────────────────────────────────────────────
  it("shows the empty element when nothing matches, hides it when something does", () => {
    const { empty, visibleText, type } = setup();
    type("zzz");
    expect(empty().hidden).toBe(false);
    expect(visibleText()).toEqual([]);
    type("app");
    expect(empty().hidden).toBe(true);
    expect(visibleText()).toEqual(["Apple"]);
  });

  it("keyboard nav is a no-op in the no-results state", () => {
    const { key, type, highlighted } = setup();
    type("zzz");
    key("ArrowDown");
    key("Enter");
    expect(highlighted()).toBeNull();
  });

  // ── keyboard navigation ─────────────────────────────────────────────────────
  it("ArrowDown highlights the first option, then advances", () => {
    const { api, input, key, highlightedText } = setup();
    api.open();
    key("ArrowDown");
    expect(highlightedText()).toBe("Apple");
    assertComboboxAria(input, true);
    key("ArrowDown");
    expect(highlightedText()).toBe("Banana");
  });

  it("ArrowDown while closed opens then highlights", () => {
    const { root, key, highlightedText } = setup();
    key("ArrowDown");
    expect(root.dataset.state).toBe("open");
    expect(highlightedText()).toBe("Apple");
  });

  it("ArrowUp from the top wraps to the last option", () => {
    const { api, key, highlightedText } = setup();
    api.open();
    key("ArrowUp");
    expect(highlightedText()).toBe("Orange");
  });

  it("ArrowDown past the end wraps back to the first option", () => {
    const { api, key, highlightedText } = setup();
    api.open();
    key("End");
    expect(highlightedText()).toBe("Orange");
    key("ArrowDown");
    expect(highlightedText()).toBe("Apple");
  });

  it("Home / End jump to the first / last VISIBLE option", () => {
    const { api, key, highlightedText } = setup();
    api.open();
    key("End");
    expect(highlightedText()).toBe("Orange");
    key("Home");
    expect(highlightedText()).toBe("Apple");
  });

  it("navigation only visits VISIBLE (unfiltered) options and wraps within them", () => {
    const { type, key, highlightedText } = setup();
    type("an"); // Banana, Orange visible
    key("ArrowDown");
    expect(highlightedText()).toBe("Banana");
    key("ArrowDown");
    expect(highlightedText()).toBe("Orange");
    key("ArrowDown"); // wrap over the 2 visible options
    expect(highlightedText()).toBe("Banana");
  });

  // ── selection ───────────────────────────────────────────────────────────────
  it("Enter selects the highlighted option, writes input.value, and closes", () => {
    const { root, api, input, key } = setup();
    api.open();
    key("ArrowDown"); // Apple
    key("ArrowDown"); // Banana
    key("Enter");
    expect(input.value).toBe("Banana");
    expect(api.getValue()).toBe("Banana");
    expect(root.dataset.state).toBe("closed");
    assertComboboxAria(input, false);
  });

  it("Enter with nothing highlighted does not select", () => {
    const { api, input, key } = setup();
    api.open();
    key("Enter");
    expect(input.value).toBe("");
    expect(api.getValue()).toBe("");
  });

  it("clicking an option selects it (by visible index) and closes", () => {
    const { root, api, input, options } = setup();
    api.open();
    options()[2].click(); // Cherry
    expect(input.value).toBe("Cherry");
    expect(api.getValue()).toBe("Cherry");
    expect(root.dataset.state).toBe("closed");
  });

  it("selecting after a filter maps the visible index to the right option", () => {
    const { api, input, options, type } = setup();
    type("an"); // Banana(index0 visible), Orange(index1 visible)
    // click the second visible option → Orange
    options().find((o) => o.textContent?.trim() === "Orange")!.click();
    expect(input.value).toBe("Orange");
    expect(api.getValue()).toBe("Orange");
  });

  it("Escape closes without committing a value", () => {
    const { root, api, input, key } = setup();
    api.open();
    key("ArrowDown"); // highlight Apple
    key("Escape");
    expect(root.dataset.state).toBe("closed");
    expect(api.getValue()).toBe("");
    assertComboboxAria(input, false);
  });

  // ── getValue / setValue ─────────────────────────────────────────────────────
  it("setValue writes the input and getValue without altering option markup", () => {
    const { api, input, options } = setup();
    api.setValue("Kiwi");
    expect(input.value).toBe("Kiwi");
    expect(api.getValue()).toBe("Kiwi");
    expect(options().every((o) => o.getAttribute("aria-selected") === "false")).toBe(true);
  });

  // ── lifecycle ───────────────────────────────────────────────────────────────
  it("prevents double initialization", () => {
    const { root, api } = setup();
    expect(createCombobox(root)).toBe(api);
  });

  it("destroy() unbinds listeners and drops the instance", () => {
    const { root, api, input } = setup();
    api.destroy();
    input.dispatchEvent(new Event("focus"));
    expect(root.dataset.state).toBe("closed"); // no controller left to open
    expect((root as any)._faqirCombobox).toBeUndefined();
  });

  // ── known gaps: codified as current behavior (flip on the filed follow-up) ──
  it("GAP (0.4-30): tracks the active option via data-highlighted, not aria-activedescendant", () => {
    const { api, input, options, key } = setup();
    api.open();
    key("ArrowDown");
    // Active option is data-highlighted; the input never links to it.
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    // …and options carry no id to point an activedescendant at yet.
    expect(options().every((o) => !o.id)).toBe(true);
    // The highlight is *also* mirrored onto aria-selected (active vs selected
    // are conflated — APG wants aria-selected only on the chosen option).
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
  });

  it("GAP (0.4-31): a committed selection leaves no option marked aria-selected", () => {
    const { api, input, options } = setup();
    api.open();
    options()[1].click(); // Banana — selectOption sets aria-selected then close() wipes it
    expect(input.value).toBe("Banana");
    expect(api.getValue()).toBe("Banana");
    // Regression witness: close()→clearHighlight() resets every option to false.
    expect(options().every((o) => o.getAttribute("aria-selected") === "false")).toBe(true);
  });

  it("GAP (0.4-32): outside-click closes but neither commits nor reverts the typed text", () => {
    const { api, input, type } = setup();
    api.setValue("Apple"); // last committed value
    type("Banan"); // user types a new, uncommitted query
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    // No blur/commit handler: the raw typed text survives, value is unchanged.
    expect(input.value).toBe("Banan"); // NOT reverted to "Apple"
    expect(api.getValue()).toBe("Apple"); // NOT committed to "Banan"
  });
});
