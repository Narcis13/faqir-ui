// ═══════════════════════════════════════════════════════════════════════════
// command-palette — controller contract  [task 0.4-21 · Controller tests D]
// ═══════════════════════════════════════════════════════════════════════════
//
// CONTRACT (current behavior — these tests codify it; the GAP tests at the
// bottom flip when their filed follow-up lands)
//   • Closed by default: data-state="closed", overlay + panel [hidden]. The
//     panel is role="dialog" aria-modal="true"; the search input is the APG
//     combobox anchor (role="combobox", aria-autocomplete="list",
//     aria-controls → list id, aria-expanded stays "true").
//   • A document-level Cmd/Ctrl+K shortcut toggles open ⇄ closed.
//   • open() records the previously-focused element, shows overlay+panel, resets
//     the search to "" (filter("")), clears the highlight, traps focus in the
//     panel, and focuses the search input. close() hides overlay+panel, releases
//     the trap, and restores focus to the previously-focused element.
//   • Typing filters items by case-insensitive SUBSTRING of the item's
//     item-label text: non-matches get `data-hidden`, a group with zero visible
//     items gets `data-hidden`, and the `empty` element toggles on the total.
//   • Keyboard on search: ArrowDown/ArrowUp move the highlight (wrapping) across
//     the flat list of VISIBLE items (ignoring group boundaries) via
//     `data-highlighted`; Home/End jump to first/last visible; Enter executes
//     the highlighted item; Escape closes.
//   • Executing an item (Enter or click) fires a bubbling `command-select`
//     CustomEvent { item, label }, runs any registerCommand()'d action whose
//     label matches, then closes.
//   • Double init returns the same api; destroy() unbinds every listener,
//     including the document-level shortcut.
//
// KNOWN GAPS (asserted as current behavior; filed as follow-ups)
//   • 0.4-33 — Escape does not layer: it closes immediately regardless of the
//     current filter text, instead of first clearing a non-empty filter and only
//     closing on the second press.
//   • 0.4-34 — APG activedescendant: the active item is tracked only via
//     `data-highlighted`, items carry no `id`, the search input never gets
//     `aria-activedescendant`, AND the highlight is mirrored onto the item's
//     `aria-selected` (conflating "active" with "selected").

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createCommandPalette } from "../../registry/recipes/command-palette/command-palette.js";

const mounted: Array<{ destroy: () => void }> = [];

function setup() {
  document.body.innerHTML = `
    <button id="opener">Open palette</button>
    <div data-ui="command-palette" data-state="closed">
      <div data-part="overlay" hidden></div>
      <div data-part="panel" role="dialog" aria-modal="true" aria-label="Command palette" data-size="md" hidden>
        <div data-part="search-wrapper">
          <input
            data-part="search"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="cmd-palette-list-1"
            placeholder="Type a command or search..."
          >
        </div>
        <div data-part="list" role="listbox" id="cmd-palette-list-1">
          <div data-part="group">
            <div data-part="group-label">Navigation</div>
            <div data-part="item" role="option" aria-selected="false">
              <span data-part="item-label">Go to Dashboard</span>
              <kbd data-part="kbd">G D</kbd>
            </div>
            <div data-part="item" role="option" aria-selected="false">
              <span data-part="item-label">Go to Settings</span>
              <kbd data-part="kbd">G S</kbd>
            </div>
          </div>
          <div data-part="group">
            <div data-part="group-label">Actions</div>
            <div data-part="item" role="option" aria-selected="false">
              <span data-part="item-label">Create New Project</span>
              <kbd data-part="kbd">C P</kbd>
            </div>
            <div data-part="item" role="option" aria-selected="false">
              <span data-part="item-label">Toggle Dark Mode</span>
              <kbd data-part="kbd">T D</kbd>
            </div>
            <div data-part="item" role="option" aria-selected="false">
              <span data-part="item-label">Open File</span>
              <kbd data-part="kbd">O</kbd>
            </div>
          </div>
          <div data-part="empty" hidden>No commands found</div>
        </div>
      </div>
    </div>`;
  const root = document.querySelector("[data-ui='command-palette']") as HTMLElement;
  const api = createCommandPalette(root);
  mounted.push(api);
  const opener = document.getElementById("opener") as HTMLButtonElement;
  const overlay = root.querySelector("[data-part='overlay']") as HTMLElement;
  const panel = root.querySelector("[data-part='panel']") as HTMLElement;
  const search = root.querySelector("[data-part='search']") as HTMLInputElement;
  const list = root.querySelector("[data-part='list']") as HTMLElement;
  const empty = () => root.querySelector("[data-part='empty']") as HTMLElement;
  const items = () => [...root.querySelectorAll("[data-part='item']")] as HTMLElement[];
  const groups = () => [...root.querySelectorAll("[data-part='group']")] as HTMLElement[];
  const labelOf = (el: HTMLElement) =>
    (el.querySelector("[data-part='item-label']") as HTMLElement)?.textContent?.trim();
  const highlighted = () =>
    root.querySelector("[data-part='item'][data-highlighted]") as HTMLElement | null;
  const highlightedText = () => (highlighted() ? labelOf(highlighted()!) : null);
  const visibleText = () =>
    items()
      .filter((i) => !i.hasAttribute("data-hidden"))
      .map(labelOf);
  const type = (value: string) => {
    search.value = value;
    search.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const searchKey = (k: string) =>
    search.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  return {
    root, api, opener, overlay, panel, search, list, empty, items, groups,
    labelOf, highlighted, highlightedText, visibleText, type, searchKey,
  };
}

// Fire the global open/close shortcut on document.
function shortcut(mod: "meta" | "ctrl") {
  const e = new KeyboardEvent("keydown", {
    key: "k",
    bubbles: true,
    cancelable: true,
    metaKey: mod === "meta",
    ctrlKey: mod === "ctrl",
  });
  document.dispatchEvent(e);
  return e;
}

function assertSearchAria(search: HTMLInputElement) {
  expect(search.getAttribute("role")).toBe("combobox");
  expect(search.getAttribute("aria-autocomplete")).toBe("list");
  expect(search.hasAttribute("aria-controls")).toBe(true);
  expect(search.getAttribute("aria-expanded")).toBe("true");
}

describe("command-palette controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    // Destroy tears down the document-level Cmd/Ctrl+K listener so it can't leak
    // into the next test.
    while (mounted.length) mounted.pop()!.destroy();
  });

  // ── open / close ───────────────────────────────────────────────────────────
  it("is closed by default with overlay + panel hidden and APG search attrs", () => {
    const { root, overlay, panel, search } = setup();
    expect(root.dataset.state).toBe("closed");
    expect(overlay.hidden).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    assertSearchAria(search);
  });

  it("open() shows overlay + panel and focuses the search input", () => {
    const { root, api, overlay, panel, search } = setup();
    api.open();
    expect(root.dataset.state).toBe("open");
    expect(overlay.hidden).toBe(false);
    expect(panel.hidden).toBe(false);
    expect(document.activeElement).toBe(search);
    assertSearchAria(search);
  });

  it("close() hides overlay + panel", () => {
    const { root, api, overlay, panel } = setup();
    api.open();
    api.close();
    expect(root.dataset.state).toBe("closed");
    expect(overlay.hidden).toBe(true);
    expect(panel.hidden).toBe(true);
  });

  it("open() clears any prior search text and shows all items", () => {
    const { api, search, type, visibleText } = setup();
    api.open();
    type("go");
    expect(visibleText().length).toBe(2);
    api.close();
    api.open();
    expect(search.value).toBe("");
    expect(visibleText().length).toBe(5);
  });

  // ── focus management ────────────────────────────────────────────────────────
  it("close() restores focus to the element focused before open()", () => {
    const { api, opener } = setup();
    opener.focus();
    expect(document.activeElement).toBe(opener);
    api.open();
    expect(document.activeElement).not.toBe(opener); // moved into the panel
    api.close();
    expect(document.activeElement).toBe(opener);
  });

  // ── open shortcut (Cmd/Ctrl+K) ──────────────────────────────────────────────
  it("Cmd+K opens the palette (and prevents default)", () => {
    const { root } = setup();
    const e = shortcut("meta");
    expect(root.dataset.state).toBe("open");
    expect(e.defaultPrevented).toBe(true);
  });

  it("Ctrl+K opens the palette", () => {
    const { root } = setup();
    shortcut("ctrl");
    expect(root.dataset.state).toBe("open");
  });

  it("the shortcut toggles: a second press closes", () => {
    const { root } = setup();
    shortcut("meta");
    expect(root.dataset.state).toBe("open");
    shortcut("meta");
    expect(root.dataset.state).toBe("closed");
  });

  it("plain 'k' without a modifier does nothing", () => {
    const { root } = setup();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(root.dataset.state).toBe("closed");
  });

  // ── filter (substring, grouped) ─────────────────────────────────────────────
  it("typing filters items by case-insensitive substring of the label", () => {
    const { api, type, visibleText } = setup();
    api.open();
    type("go");
    expect(visibleText()).toEqual(["Go to Dashboard", "Go to Settings"]);
  });

  it("hides a group when none of its items match", () => {
    const { api, groups, type } = setup();
    api.open();
    type("go"); // only Navigation-group items match
    const [nav, actions] = groups();
    expect(nav.hasAttribute("data-hidden")).toBe(false);
    expect(actions.hasAttribute("data-hidden")).toBe(true);
  });

  it("re-shows a group when the query widens to match it again", () => {
    const { api, groups, type } = setup();
    api.open();
    type("go");
    expect(groups()[1].hasAttribute("data-hidden")).toBe(true);
    type(""); // reset
    expect(groups()[1].hasAttribute("data-hidden")).toBe(false);
  });

  it("filter matches by SUBSTRING, not fuzzy subsequence", () => {
    const { api, visibleText, type } = setup();
    api.open();
    // "gd" is a subsequence of "Go to Dashboard" but not a substring → no match.
    type("gd");
    expect(visibleText()).toEqual([]);
  });

  it("filter() returns the visible count", () => {
    const { api } = setup();
    api.open();
    expect(api.filter("toggle")).toBe(1);
    expect(api.filter("")).toBe(5);
  });

  // ── empty state ─────────────────────────────────────────────────────────────
  it("shows the empty element when nothing matches, hides it otherwise", () => {
    const { api, empty, type } = setup();
    api.open();
    type("zzzzz");
    expect(empty().hidden).toBe(false);
    type("open");
    expect(empty().hidden).toBe(true);
  });

  // ── grouped keyboard navigation ─────────────────────────────────────────────
  it("ArrowDown walks the flat visible list across group boundaries", () => {
    const { api, searchKey, highlightedText } = setup();
    api.open();
    searchKey("ArrowDown");
    expect(highlightedText()).toBe("Go to Dashboard");
    searchKey("ArrowDown");
    expect(highlightedText()).toBe("Go to Settings");
    searchKey("ArrowDown"); // cross from Navigation into Actions
    expect(highlightedText()).toBe("Create New Project");
  });

  it("ArrowUp from the top wraps to the last visible item", () => {
    const { api, searchKey, highlightedText } = setup();
    api.open();
    searchKey("ArrowUp");
    expect(highlightedText()).toBe("Open File");
  });

  it("Home / End jump to the first / last visible item", () => {
    const { api, searchKey, highlightedText } = setup();
    api.open();
    searchKey("End");
    expect(highlightedText()).toBe("Open File");
    searchKey("Home");
    expect(highlightedText()).toBe("Go to Dashboard");
  });

  it("navigation skips items hidden by the filter", () => {
    const { api, type, searchKey, highlightedText } = setup();
    api.open();
    type("go"); // Go to Dashboard, Go to Settings visible
    searchKey("ArrowDown");
    expect(highlightedText()).toBe("Go to Dashboard");
    searchKey("ArrowDown");
    expect(highlightedText()).toBe("Go to Settings");
    searchKey("ArrowDown"); // wrap within the 2 visible
    expect(highlightedText()).toBe("Go to Dashboard");
  });

  it("reopening clears a stale highlight", () => {
    const { api, searchKey, highlighted } = setup();
    api.open();
    searchKey("ArrowDown");
    expect(highlighted()).not.toBeNull();
    api.close();
    api.open();
    expect(highlighted()).toBeNull();
  });

  // ── execute ─────────────────────────────────────────────────────────────────
  it("Enter fires a bubbling command-select { item, label } and closes", () => {
    const { root, api, searchKey } = setup();
    const seen: Array<{ label: string }> = [];
    document.addEventListener(
      "command-select",
      (e) => seen.push((e as CustomEvent).detail),
      { once: true },
    );
    api.open();
    searchKey("ArrowDown"); // Go to Dashboard
    searchKey("ArrowDown"); // Go to Settings
    searchKey("Enter");
    expect(seen.length).toBe(1);
    expect(seen[0].label).toBe("Go to Settings");
    expect(root.dataset.state).toBe("closed");
  });

  it("Enter with nothing highlighted does not execute or close", () => {
    const { root, api, searchKey } = setup();
    let fired = false;
    document.addEventListener("command-select", () => (fired = true), { once: true });
    api.open();
    searchKey("Enter");
    expect(fired).toBe(false);
    expect(root.dataset.state).toBe("open");
  });

  it("clicking an item executes it and closes", () => {
    const { root, api, items, labelOf } = setup();
    const seen: string[] = [];
    document.addEventListener(
      "command-select",
      (e) => seen.push((e as CustomEvent).detail.label),
      { once: true },
    );
    api.open();
    const openFile = items().find((i) => labelOf(i) === "Open File")!;
    openFile.click();
    expect(seen).toEqual(["Open File"]);
    expect(root.dataset.state).toBe("closed");
  });

  it("registerCommand runs the matching label's action on execute", () => {
    const { api, searchKey } = setup();
    let ran = 0;
    api.registerCommand({ label: "Go to Dashboard", action: () => (ran += 1) });
    api.open();
    searchKey("ArrowDown"); // Go to Dashboard
    searchKey("Enter");
    expect(ran).toBe(1);
  });

  // ── overlay / escape ────────────────────────────────────────────────────────
  it("clicking the overlay closes the palette", () => {
    const { root, api, overlay } = setup();
    api.open();
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(root.dataset.state).toBe("closed");
  });

  it("Escape closes the palette", () => {
    const { root, api, searchKey } = setup();
    api.open();
    searchKey("Escape");
    expect(root.dataset.state).toBe("closed");
  });

  // ── recent / static-markup groups ───────────────────────────────────────────
  it("a 'Recent' group is just markup — the controller gives it no special logic", () => {
    // "recent" is presentation only: it filters and navigates like any group.
    document.body.innerHTML = `
      <div data-ui="command-palette" data-state="closed">
        <div data-part="overlay" hidden></div>
        <div data-part="panel" role="dialog" aria-modal="true" data-size="sm" hidden>
          <div data-part="search-wrapper">
            <input data-part="search" role="combobox" aria-expanded="true"
                   aria-autocomplete="list" aria-controls="cp-recent">
          </div>
          <div data-part="list" role="listbox" id="cp-recent">
            <div data-part="group">
              <div data-part="group-label">Recent</div>
              <div data-part="item" role="option" aria-selected="false">
                <span data-part="item-label">Undo</span>
              </div>
              <div data-part="item" role="option" aria-selected="false">
                <span data-part="item-label">Redo</span>
              </div>
            </div>
            <div data-part="empty" hidden>No commands found</div>
          </div>
        </div>
      </div>`;
    const root = document.querySelector("[data-ui='command-palette']") as HTMLElement;
    const api = createCommandPalette(root);
    mounted.push(api);
    const search = root.querySelector("[data-part='search']") as HTMLInputElement;
    api.open();
    search.value = "red";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const visible = [...root.querySelectorAll("[data-part='item']")].filter(
      (i) => !i.hasAttribute("data-hidden"),
    );
    expect(visible.length).toBe(1);
    expect(visible[0].textContent?.trim()).toBe("Redo");
  });

  // ── lifecycle ───────────────────────────────────────────────────────────────
  it("prevents double initialization", () => {
    const { root, api } = setup();
    expect(createCommandPalette(root)).toBe(api);
  });

  it("destroy() unbinds the document shortcut and drops the instance", () => {
    const { root, api } = setup();
    api.destroy();
    mounted.pop(); // already destroyed; don't double-destroy in afterEach
    shortcut("meta");
    expect(root.dataset.state).toBe("closed"); // shortcut no longer wired
    expect((root as any)._faqirCommandPalette).toBeUndefined();
  });

  // ── known gaps: codified as current behavior (flip on the filed follow-up) ──
  it("GAP (0.4-33): Escape closes immediately instead of first clearing the filter", () => {
    const { root, api, search, searchKey } = setup();
    api.open();
    search.value = "go";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    searchKey("Escape");
    // APG layering would clear the filter first and stay open; it closes instead.
    expect(root.dataset.state).toBe("closed");
    // …and the filter text was not cleared as a distinct first layer.
    expect(search.value).toBe("go");
  });

  it("GAP (0.4-34): active item tracked via data-highlighted, not aria-activedescendant", () => {
    const { api, search, items, searchKey } = setup();
    api.open();
    searchKey("ArrowDown");
    expect(search.hasAttribute("aria-activedescendant")).toBe(false);
    expect(items().every((i) => !i.id)).toBe(true);
    // Highlight is mirrored onto aria-selected (active vs selected conflated).
    expect(items()[0].getAttribute("aria-selected")).toBe("true");
  });
});
