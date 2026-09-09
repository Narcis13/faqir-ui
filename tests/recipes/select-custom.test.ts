// ═══════════════════════════════════════════════════════════════════════════
// select-custom — controller contract  [task 0.4-20 · Controller tests C]
// ═══════════════════════════════════════════════════════════════════════════
//
// CONTRACT (current behavior — these tests codify it; a future enhancement flips
// the two guard tests at the bottom)
//   • Closed by default: data-state="closed", listbox [hidden], trigger
//     aria-expanded="false".
//   • open()/close()/toggle() flip data-state, listbox.hidden and aria-expanded.
//     open() with a search field clears + focuses it; close() returns focus to
//     the trigger and tears down the outside-click listener.
//   • Trigger keyboard: ArrowDown / Enter / Space open; Escape closes.
//   • Listbox keyboard: ArrowDown / ArrowUp move the highlight (wrapping) via the
//     `data-highlighted` attribute; Home / End jump to first / last VISIBLE option;
//     Enter selects the highlighted option; Escape closes.
//   • Typeahead is the optional search input: typing filters options by
//     substring (non-matches get `data-hidden`), toggles the `empty` element, and
//     navigation only visits visible options.
//   • Selecting (click or Enter) sets aria-selected="true" on the chosen option
//     and "false" on the rest, writes its label into [data-part='value'], fires a
//     bubbling `select-change` CustomEvent { value, label }, and closes.
//   • getValue() returns the selected data-value; select(value) accepts a
//     data-value or, as a fallback, the option's text.
//   • Double init returns the same api; destroy() unbinds every listener.
//
// CLOSED GAPS (0.4-27 / 0.4-28, fixed in W3-4 — the two tests at the foot of
// this file used to assert the defect and now assert the fix)
//   • `aria-activedescendant` IS maintained. The trigger publishes
//     `role="combobox"`, which is the APG contract; tracking the active option
//     only in `data-highlighted`, on options with no `id`, meant a screen-reader
//     user got no announcement on any arrow key. Options are given ids on demand
//     and the owner (the search field when there is one, else the trigger)
//     points at the active one. → 0.4-27.
//   • A hidden <input> carries the value, so the widget submits inside a native
//     form. It is created when the root names itself (`data-name` / `name`) and
//     the markup does not already provide one. A `<select>` replacement that
//     drops its value on submit is a silent data loss. → 0.4-28.

import { describe, it, expect, beforeEach } from "bun:test";
import { createSelectCustom } from "../../registry/recipes/select-custom/select-custom.js";

function setup({ search = false }: { search?: boolean } = {}) {
  document.body.innerHTML = `
    <div data-ui="select-custom" data-state="closed" data-size="md">
      <button
        data-part="trigger"
        role="combobox"
        aria-expanded="false"
        aria-haspopup="listbox"
        aria-controls="lb-1"
      >
        <span data-part="value">Select an option</span>
        <span data-part="chevron" aria-hidden="true">&#x25BE;</span>
      </button>
      <div data-part="listbox" role="listbox" id="lb-1" hidden>
        ${search ? '<input data-part="search" type="text" placeholder="Search..." aria-label="Filter options">' : ""}
        <div data-part="option" role="option" aria-selected="false" data-value="apple">Apple</div>
        <div data-part="option" role="option" aria-selected="false" data-value="banana">Banana</div>
        <div data-part="option" role="option" aria-selected="false" data-value="cherry">Cherry</div>
        ${search ? '<div data-part="empty" hidden>No options found</div>' : ""}
      </div>
    </div>`;
  const root = document.querySelector("[data-ui='select-custom']") as HTMLElement;
  const api = createSelectCustom(root);
  const trigger = root.querySelector("[data-part='trigger']") as HTMLButtonElement;
  const listbox = root.querySelector("[data-part='listbox']") as HTMLElement;
  const options = () => [...root.querySelectorAll("[data-part='option']")] as HTMLElement[];
  const search_ = () => root.querySelector("[data-part='search']") as HTMLInputElement | null;
  const empty = () => root.querySelector("[data-part='empty']") as HTMLElement | null;
  const highlighted = () => root.querySelector("[data-part='option'][data-highlighted]") as HTMLElement | null;
  // Compare highlight by data-value (a string): a failing DOM-node `toBe` diff is
  // pathologically slow to format under happy-dom.
  const highlightedValue = () => highlighted()?.dataset.value ?? null;
  const key = (target: HTMLElement, k: string) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  return { root, api, trigger, listbox, options, search: search_, empty, highlighted, highlightedValue, key };
}

describe("select-custom controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // ── open / close ─────────────────────────────────────────────────────────
  it("is closed by default", () => {
    const { root, listbox, trigger } = setup();
    expect(root.dataset.state).toBe("closed");
    expect(listbox.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("open() opens the listbox and reflects aria-expanded", () => {
    const { root, api, listbox, trigger } = setup();
    api.open();
    expect(root.dataset.state).toBe("open");
    expect(listbox.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("close() closes the listbox and resets aria-expanded", () => {
    const { root, api, listbox, trigger } = setup();
    api.open();
    api.close();
    expect(root.dataset.state).toBe("closed");
    expect(listbox.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking the trigger toggles open/closed", () => {
    const { root, trigger } = setup();
    trigger.click();
    expect(root.dataset.state).toBe("open");
    trigger.click();
    expect(root.dataset.state).toBe("closed");
  });

  it("clicking outside (pointerdown) closes an open select", () => {
    const { root, api } = setup();
    api.open();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(root.dataset.state).toBe("closed");
  });

  // ── trigger keyboard ─────────────────────────────────────────────────────
  it("ArrowDown / Enter / Space on the trigger open the listbox", () => {
    for (const k of ["ArrowDown", "Enter", " "]) {
      const { root, trigger, key } = setup();
      key(trigger, k);
      expect(root.dataset.state).toBe("open");
    }
  });

  it("Escape on the trigger closes an open listbox", () => {
    const { root, api, trigger, key } = setup();
    api.open();
    key(trigger, "Escape");
    expect(root.dataset.state).toBe("closed");
  });

  // ── listbox keyboard navigation ──────────────────────────────────────────
  it("ArrowDown highlights the first option, then advances", () => {
    const { api, listbox, highlightedValue, key } = setup();
    api.open();
    key(listbox, "ArrowDown");
    expect(highlightedValue()).toBe("apple");
    key(listbox, "ArrowDown");
    expect(highlightedValue()).toBe("banana");
  });

  it("ArrowUp from the top wraps to the last option", () => {
    const { api, listbox, highlightedValue, key } = setup();
    api.open();
    key(listbox, "ArrowUp");
    expect(highlightedValue()).toBe("cherry");
  });

  it("ArrowDown past the end wraps back to the first option", () => {
    const { api, listbox, highlightedValue, key } = setup();
    api.open();
    key(listbox, "End"); // highlight last
    expect(highlightedValue()).toBe("cherry");
    key(listbox, "ArrowDown"); // wrap
    expect(highlightedValue()).toBe("apple");
  });

  it("Home / End jump to the first / last option", () => {
    const { api, listbox, highlightedValue, key } = setup();
    api.open();
    key(listbox, "End");
    expect(highlightedValue()).toBe("cherry");
    key(listbox, "Home");
    expect(highlightedValue()).toBe("apple");
  });

  it("Enter selects the highlighted option and closes", () => {
    const { root, api, listbox, options, key } = setup();
    api.open();
    key(listbox, "ArrowDown"); // highlight Apple
    key(listbox, "ArrowDown"); // highlight Banana
    key(listbox, "Enter");
    expect(options()[1].getAttribute("aria-selected")).toBe("true");
    expect(api.getValue()).toBe("banana");
    expect(root.dataset.state).toBe("closed");
  });

  it("Enter with nothing highlighted does not select", () => {
    const { api, listbox, options, key } = setup();
    api.open();
    key(listbox, "Enter");
    expect(options().every((o) => o.getAttribute("aria-selected") === "false")).toBe(true);
    expect(api.getValue()).toBe("");
  });

  it("Escape inside the listbox closes it", () => {
    const { root, api, listbox, key } = setup();
    api.open();
    key(listbox, "Escape");
    expect(root.dataset.state).toBe("closed");
  });

  // ── selection ────────────────────────────────────────────────────────────
  it("clicking an option selects it, updates the value label, and closes", () => {
    const { root, api, options } = setup();
    api.open();
    options()[2].click(); // Cherry
    expect(options()[2].getAttribute("aria-selected")).toBe("true");
    expect((root.querySelector("[data-part='value']") as HTMLElement).textContent).toBe("Cherry");
    expect(api.getValue()).toBe("cherry");
    expect(root.dataset.state).toBe("closed");
  });

  it("selecting one option deselects the previously selected one", () => {
    const { api, options } = setup();
    api.select("apple");
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
    api.select("cherry");
    expect(options()[0].getAttribute("aria-selected")).toBe("false");
    expect(options()[2].getAttribute("aria-selected")).toBe("true");
  });

  it("fires a bubbling select-change event carrying { value, label }", () => {
    const { api, options } = setup();
    const seen: Array<{ value: string; label: string }> = [];
    document.addEventListener(
      "select-change",
      (e) => seen.push((e as CustomEvent).detail),
      { once: true },
    );
    api.open();
    options()[1].click(); // Banana
    expect(seen).toEqual([{ value: "banana", label: "Banana" }]);
  });

  it("select(value) accepts a data-value", () => {
    const { api, options } = setup();
    api.select("banana");
    expect(options()[1].getAttribute("aria-selected")).toBe("true");
    expect(api.getValue()).toBe("banana");
  });

  it("select(value) falls back to matching the option text", () => {
    const { api, options } = setup();
    api.select("Cherry"); // by visible text, not data-value
    expect(options()[2].getAttribute("aria-selected")).toBe("true");
    expect(api.getValue()).toBe("cherry");
  });

  it("select(value) ignores an unknown value", () => {
    const { api, options } = setup();
    api.select("kiwi");
    expect(options().every((o) => o.getAttribute("aria-selected") === "false")).toBe(true);
    expect(api.getValue()).toBe("");
  });

  // ── typeahead / search filter ────────────────────────────────────────────
  it("typing in the search field filters options by substring", () => {
    const { api, options, search } = setup({ search: true });
    api.open();
    const s = search()!;
    s.value = "an"; // matches "Banana"
    s.dispatchEvent(new Event("input", { bubbles: true }));
    expect(options()[0].hasAttribute("data-hidden")).toBe(true); // Apple
    expect(options()[1].hasAttribute("data-hidden")).toBe(false); // Banana
    expect(options()[2].hasAttribute("data-hidden")).toBe(true); // Cherry
  });

  it("shows the empty element when nothing matches, hides it otherwise", () => {
    const { api, search, empty } = setup({ search: true });
    api.open();
    const s = search()!;
    s.value = "zzz";
    s.dispatchEvent(new Event("input", { bubbles: true }));
    expect(empty()!.hidden).toBe(false);
    s.value = "a";
    s.dispatchEvent(new Event("input", { bubbles: true }));
    expect(empty()!.hidden).toBe(true);
  });

  it("keyboard navigation only visits visible (unfiltered) options", () => {
    const { api, listbox, options, search, highlightedValue, key } = setup({ search: true });
    api.open();
    const s = search()!;
    s.value = "err"; // matches "Cherry" only
    s.dispatchEvent(new Event("input", { bubbles: true }));
    expect(options()[0].hasAttribute("data-hidden")).toBe(true); // Apple hidden
    expect(options()[1].hasAttribute("data-hidden")).toBe(true); // Banana hidden
    key(listbox, "ArrowDown");
    // Only Cherry is visible → it is the sole navigable target.
    expect(highlightedValue()).toBe("cherry");
    key(listbox, "ArrowDown"); // wrap over the single visible option
    expect(highlightedValue()).toBe("cherry");
  });

  // ── lifecycle ────────────────────────────────────────────────────────────
  it("prevents double initialization", () => {
    const { root, api } = setup();
    expect(createSelectCustom(root)).toBe(api);
  });

  it("destroy unbinds the trigger listener", () => {
    const { root, api, trigger } = setup();
    api.destroy();
    trigger.click();
    expect(root.dataset.state).toBe("closed"); // no controller left to toggle
    expect((root as any)._faqirSelectCustom).toBeUndefined();
  });

  // ── the APG contract the markup declares  [W3-4 · 0.4-27] ────────────────
  it("points aria-activedescendant at the highlighted option", () => {
    const { api, listbox, trigger, options, key } = setup();
    api.open();
    key(listbox, "ArrowDown");

    const active = options().find((o) => o.hasAttribute("data-highlighted"))!;
    expect(active).toBeDefined();
    expect(active.id).toBeTruthy();
    expect(trigger.getAttribute("aria-activedescendant")).toBe(active.id);
  });

  it("moves it with the highlight", () => {
    const { api, listbox, trigger, options, key } = setup();
    api.open();
    key(listbox, "ArrowDown");
    const first = trigger.getAttribute("aria-activedescendant");
    key(listbox, "ArrowDown");
    const second = trigger.getAttribute("aria-activedescendant");

    expect(second).not.toBe(first);
    expect(options().find((o) => o.hasAttribute("data-highlighted"))!.id).toBe(second ?? "");
  });

  it("drops it when nothing is highlighted", () => {
    const { api, listbox, trigger, key } = setup();
    api.open();
    key(listbox, "ArrowDown");
    expect(trigger.hasAttribute("aria-activedescendant")).toBe(true);
    api.close();
    expect(trigger.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("keeps an authored id rather than replacing it", () => {
    const { api, listbox, trigger, options, key } = setup();
    options()[0].id = "authored-apple";
    api.open();
    key(listbox, "ArrowDown");
    expect(trigger.getAttribute("aria-activedescendant")).toBe("authored-apple");
  });

  it("names the search field when the listbox has one — that is where focus is", () => {
    const { api, listbox, root, key } = setup({ search: true });
    api.open();
    key(listbox, "ArrowDown");
    const search = root.querySelector("[data-part='search']")!;
    expect(search.getAttribute("aria-activedescendant")).toBeTruthy();
  });

  // ── the value a form submits  [W3-4 · 0.4-28] ────────────────────────────
  it("carries the selection in a hidden input when the root is named", () => {
    document.body.innerHTML = `
      <form>
        <div data-ui="select-custom" data-state="closed" data-name="fruit">
          <button data-part="trigger" role="combobox" aria-expanded="false" aria-haspopup="listbox">
            <span data-part="value">Choose</span>
          </button>
          <div data-part="listbox" role="listbox" hidden>
            <div data-part="option" role="option" data-value="apple">Apple</div>
            <div data-part="option" role="option" data-value="banana">Banana</div>
          </div>
        </div>
      </form>`;
    const el = document.querySelector("[data-ui='select-custom']") as HTMLElement;
    const controller = createSelectCustom(el);
    controller.select("apple");

    const hidden = el.querySelector("input[data-part='input']") as HTMLInputElement;
    expect(hidden).not.toBeNull();
    expect(hidden.type).toBe("hidden");
    expect(hidden.name).toBe("fruit");
    // The whole point: a `<select>` replacement that submits nothing is a silent
    // data loss, because a missing field looks like an empty one on the server.
    expect(new FormData(document.querySelector("form")!).get("fruit")).toBe("apple");
  });

  it("invents no input for a root with no name to submit under", () => {
    const { root, api } = setup();
    api.select("apple");
    expect(root.querySelector("input[data-part='input']")).toBeNull();
  });

  it("uses an authored hidden input rather than adding a second", () => {
    document.body.innerHTML = `
      <div data-ui="select-custom" data-state="closed" data-name="fruit">
        <button data-part="trigger" role="combobox" aria-expanded="false"><span data-part="value">Choose</span></button>
        <div data-part="listbox" role="listbox" hidden>
          <div data-part="option" role="option" data-value="apple">Apple</div>
        </div>
        <input data-part="input" type="hidden" name="authored">
      </div>`;
    const el = document.querySelector("[data-ui='select-custom']") as HTMLElement;
    createSelectCustom(el).select("apple");

    expect(el.querySelectorAll("input[data-part='input']").length).toBe(1);
    expect((el.querySelector("input[data-part='input']") as HTMLInputElement).name).toBe("authored");
  });
});
