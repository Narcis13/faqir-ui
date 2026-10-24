// tree-view 1.1 — the behaviour the upgrade adds, driven through the controller
// in happy-dom: tri-state checkboxes, lazy loading (success, failure, retry,
// app-supplied children), type-ahead, filtering, multi-select keys and mouse
// modifiers, and keyboard drag-and-drop. Pointer drag-and-drop needs layout, so
// it is covered in Chromium by tests/browser/tree-view.pw.ts.

import { afterEach, describe, expect, it } from "bun:test";
import { createTreeView } from "../../registry/recipes/tree-view/tree-view.js";

type Api = ReturnType<typeof createTreeView>;
let mounted: { root: HTMLElement; api: Api }[] = [];

function mount(html: string) {
  document.body.innerHTML = html;
  const root = document.querySelector("[data-ui='tree-view']") as HTMLElement;
  const api = createTreeView(root);
  mounted.push({ root, api });
  return { root, api };
}

afterEach(() => {
  for (const { api } of mounted) api.destroy();
  mounted = [];
  document.body.innerHTML = "";
});

const $ = (value: string) =>
  document.querySelector(`[data-part='item'][data-value='${value}']`) as HTMLElement;

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function click(target: Element, init: MouseEventInit = {}) {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
}

const labelOf = (value: string) => $(value).querySelector(":scope > [data-part='label']") as HTMLElement;
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function li(value: string, label: string, attrs = "", children?: string) {
  const group = children === undefined
    ? ""
    : `<ul data-part="group" role="group"${attrs.includes('aria-expanded="false"') ? " hidden" : ""}>${children}</ul>`;
  return `<li data-part="item" data-value="${value}" role="treeitem" ${attrs}>
    <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>${label}</span>${group}</li>`;
}

function status(root: HTMLElement) {
  const own = root.querySelector("[data-part='status']");
  return (own ?? root.nextElementSibling) as HTMLElement;
}

// ── Tri-state checkboxes ──────────────────────────────────────────────────────

function checkboxTree() {
  return mount(`<ul data-ui="tree-view" data-mode="checkbox" role="tree" aria-label="Backup">
    ${li("docs", "Documents", 'tabindex="0" aria-expanded="true"',
      li("invoices", "Invoices", 'aria-checked="true"') +
      li("taxes", "Taxes", 'aria-expanded="true"',
        li("t24", "2024", 'aria-checked="true"') + li("t25", "2025", 'aria-checked="false"')) +
      li("drafts", "Drafts", 'aria-checked="false"'))}
    ${li("photos", "Photos", 'aria-checked="true" aria-expanded="false"',
      li("holidays", "Holidays") + li("family", "Family"))}
    ${li("system", "System", 'aria-disabled="true" aria-expanded="true"',
      li("kernel", "Kernel", 'aria-checked="false" aria-disabled="true"') + li("logs", "Logs", 'aria-checked="false"'))}
  </ul>`);
}

describe("tree-view · checkbox mode", () => {
  it("derives parents from children and inherits a definite parent state", () => {
    const { root } = checkboxTree();
    expect(root.getAttribute("aria-multiselectable")).toBe("true");
    expect($("taxes").getAttribute("aria-checked")).toBe("mixed");
    expect($("docs").getAttribute("aria-checked")).toBe("mixed");
    // Children without a state take their parent's definite one.
    expect($("holidays").getAttribute("aria-checked")).toBe("true");
    expect($("family").getAttribute("aria-checked")).toBe("true");
    expect($("photos").getAttribute("aria-checked")).toBe("true");
    // No item carries aria-selected next to aria-checked.
    expect(root.querySelectorAll("[aria-selected]")).toHaveLength(0);
    // Every label got an aria-hidden checkbox part after its toggle.
    const box = labelOf("docs").children[1] as HTMLElement;
    expect(box.dataset.part).toBe("checkbox");
    expect(box.getAttribute("aria-hidden")).toBe("true");
    expect(root.dataset.state).toBe("selected");
  });

  it("checking a parent checks every enabled descendant; the change propagates up", () => {
    const { root, api } = checkboxTree();
    const events: CustomEvent[] = [];
    root.addEventListener("faqir:check", (e) => events.push(e as CustomEvent));

    $("taxes").focus();
    expect(press($("taxes"), " ").defaultPrevented).toBe(true);
    expect($("t25").getAttribute("aria-checked")).toBe("true");
    expect($("taxes").getAttribute("aria-checked")).toBe("true");
    expect($("docs").getAttribute("aria-checked")).toBe("mixed"); // drafts still off
    expect(events[0].detail).toMatchObject({ value: "taxes", checked: true });

    click(labelOf("drafts"));
    expect($("docs").getAttribute("aria-checked")).toBe("true");
    expect(events[1].detail.values).toContain("docs");

    // Enter toggles too: all on → all off.
    $("docs").focus();
    press($("docs"), "Enter");
    for (const value of ["docs", "invoices", "taxes", "t24", "t25", "drafts"]) {
      expect($(value).getAttribute("aria-checked"), value).toBe("false");
    }
    expect(api.getSelection().map((item: Element) => (item as HTMLElement).dataset.value)).toEqual(["photos", "holidays", "family"]);
  });

  it("unchecking a leaf makes its parent mixed, and a mixed parent checks fully", () => {
    const { api } = checkboxTree();
    api.check("holidays", false);
    expect($("photos").getAttribute("aria-checked")).toBe("mixed");
    api.check("photos");
    expect($("holidays").getAttribute("aria-checked")).toBe("true");
    expect($("photos").getAttribute("aria-checked")).toBe("true");
  });

  it("a disabled child keeps its state and its parent never sticks on mixed", () => {
    const { api } = checkboxTree();
    // `system` itself is disabled; check its enabled child through the API.
    expect(api.check("system")).toBe(false);
    api.check("logs", true);
    expect($("kernel").getAttribute("aria-checked")).toBe("false");
    expect($("system").getAttribute("aria-checked")).toBe("mixed");
    // Toggling the enabled leaf again turns it off: the parent goes back to off.
    api.check("logs");
    expect($("system").getAttribute("aria-checked")).toBe("false");
  });

  it("selectAll and Ctrl+A check every visible enabled item", () => {
    const { api } = checkboxTree();
    $("docs").focus();
    expect(press($("docs"), "a", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect($("drafts").getAttribute("aria-checked")).toBe("true");
    expect($("docs").getAttribute("aria-checked")).toBe("true");
    expect($("kernel").getAttribute("aria-checked")).toBe("false");
    expect(api.selectAll()).toBe(true);
  });
});

// ── Lazy loading ──────────────────────────────────────────────────────────────

function lazyTree(extra = "") {
  return mount(`<ul data-ui="tree-view" role="tree" aria-label="Drive" ${extra}>
    ${li("remote", '<span data-part="icon" aria-hidden="true"></span>Remote', 'tabindex="0" data-lazy="true"')}
    ${li("local", "Local")}
  </ul>`);
}

describe("tree-view · lazy children", () => {
  it("expands into a busy state, inserts the children respond() supplies, and announces", async () => {
    const { root } = lazyTree();
    const loaded: CustomEvent[] = [];
    let release!: (value: unknown) => void;
    root.addEventListener("faqir:load", (event) => {
      const { detail } = event as CustomEvent;
      expect(detail).toMatchObject({ value: "remote", label: "Remote", attempt: 1 });
      detail.respond(new Promise((resolve) => { release = resolve; }));
    });
    root.addEventListener("faqir:loaded", (e) => loaded.push(e as CustomEvent));

    $("remote").focus();
    press($("remote"), "ArrowRight");
    expect($("remote").getAttribute("aria-busy")).toBe("true");
    expect($("remote").dataset.state).toBe("loading");
    expect($("remote").getAttribute("aria-expanded")).toBe("true");
    const spinner = labelOf("remote").querySelector("[data-part='spinner']") as HTMLElement;
    expect(spinner.dataset.ui).toBe("spinner");
    expect(spinner.getAttribute("aria-hidden")).toBe("true");
    expect(status(root).getAttribute("role")).toBe("status");
    expect(status(root).textContent).toBe("Loading Remote");

    release([
      { label: "Inbox", value: "inbox" },
      { label: "Archive", value: "archive", lazy: true },
      { label: "Shared", value: "shared", children: [{ label: "Notes", value: "notes" }] },
    ]);
    await wait();

    expect($("remote").hasAttribute("aria-busy")).toBe(false);
    expect($("remote").dataset.state).toBe("expanded");
    expect(labelOf("remote").querySelector("[data-part='spinner']")).toBeNull();
    expect($("inbox").getAttribute("aria-level")).toBe("2");
    expect($("inbox").getAttribute("aria-setsize")).toBe("3");
    expect($("archive").dataset.lazy).toBe("true");
    expect($("archive").getAttribute("aria-expanded")).toBe("false");
    expect($("shared").getAttribute("aria-expanded")).toBe("false");
    expect($("notes").getAttribute("aria-level")).toBe("3");
    // The tree draws icons, so built items get an icon part too.
    expect(labelOf("inbox").querySelector("[data-part='icon']")).not.toBeNull();
    expect(status(root).textContent).toBe("Remote loaded, 3 items");
    expect(loaded[0].detail).toMatchObject({ value: "remote", count: 3, error: null });

    press($("remote"), "ArrowRight");
    expect(document.activeElement).toBe($("inbox"));
  });

  it("a failed load shows the error state and Retry; expanding again retries", async () => {
    const { root } = lazyTree();
    const attempts: number[] = [];
    root.addEventListener("faqir:load", (event) => {
      const { detail } = event as CustomEvent;
      attempts.push(detail.attempt);
      detail.respond(detail.attempt === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve('<li data-part="item" data-value="late"><span data-part="label">Late</span></li>'));
    });
    const loaded: CustomEvent[] = [];
    root.addEventListener("faqir:loaded", (e) => loaded.push(e as CustomEvent));

    $("remote").focus();
    press($("remote"), "ArrowRight");
    await wait();
    expect($("remote").dataset.state).toBe("error");
    expect($("remote").getAttribute("aria-expanded")).toBe("false");
    expect($("remote").hasAttribute("aria-busy")).toBe(false);
    const retry = labelOf("remote").querySelector("[data-part='retry']") as HTMLButtonElement;
    expect(retry.textContent).toBe("Retry");
    expect(retry.tabIndex).toBe(-1);
    expect(status(root).textContent).toBe("Couldn't load Remote. Press Right Arrow to try again.");
    expect(loaded[0].detail.error).toBeInstanceOf(Error);

    // Retry by pointer, through the button.
    click(retry);
    await wait();
    expect(attempts).toEqual([1, 2]);
    expect($("remote").dataset.state).toBe("expanded");
    expect(labelOf("remote").querySelector("[data-part='retry']")).toBeNull();
    expect($("late").getAttribute("role")).toBe("treeitem");
  });

  it("Right Arrow on a failed item retries from the keyboard", async () => {
    const { root } = lazyTree();
    let attempt = 0;
    root.addEventListener("faqir:load", (event) => {
      attempt = (event as CustomEvent).detail.attempt;
      (event as CustomEvent).detail.respond(attempt === 1 ? Promise.reject(new Error("x")) : [{ label: "Ok", value: "ok" }]);
    });
    $("remote").focus();
    press($("remote"), "ArrowRight");
    await wait();
    press($("remote"), "ArrowRight");
    await wait();
    expect(attempt).toBe(2);
    expect($("ok")).not.toBeNull();
  });

  it("setLoader supplies children when no listener responds", async () => {
    const { api } = lazyTree();
    api.setLoader(({ value }: { value: string }) => Promise.resolve([{ label: `${value} child`, value: "child" }]));
    api.expand("remote");
    await wait();
    expect($("child").getAttribute("aria-level")).toBe("2");
  });

  it("a load also ends when the app appends a group itself", async () => {
    const { root, api } = lazyTree();
    const loaded: CustomEvent[] = [];
    root.addEventListener("faqir:loaded", (e) => loaded.push(e as CustomEvent));
    api.expand("remote");
    expect($("remote").dataset.state).toBe("loading");

    const group = document.createElement("ul");
    group.dataset.part = "group";
    group.innerHTML = li("rendered", "Rendered");
    $("remote").append(group);
    await wait();
    await wait();

    expect($("remote").hasAttribute("aria-busy")).toBe(false);
    expect($("remote").dataset.state).toBe("expanded");
    expect($("rendered").getAttribute("aria-level")).toBe("2");
    expect(loaded).toHaveLength(1);
  });
});

// ── Type-ahead ────────────────────────────────────────────────────────────────

describe("tree-view · type-ahead", () => {
  function typeTree() {
    return mount(`<ul data-ui="tree-view" role="tree" aria-label="Files">
      ${li("readme", "README.md", 'tabindex="0"')}
      ${li("recipes", "recipes", 'aria-expanded="false"', li("hidden-r", "rest.js"))}
      ${li("registry", "registry")}
      ${li("src", "src")}
    </ul>`);
  }

  it("a multi-character buffer moves to the next visible label starting with it", () => {
    typeTree();
    $("readme").focus();
    press($("readme"), "r");
    expect(document.activeElement).toBe($("recipes"));
    press($("recipes"), "e");
    press(document.activeElement!, "g");
    expect(document.activeElement).toBe($("registry"));
    // Collapsed children are never matched.
    expect(document.activeElement).not.toBe($("hidden-r"));
  });

  it("the buffer resets after a pause", async () => {
    typeTree();
    $("readme").focus();
    press($("readme"), "s");
    expect(document.activeElement).toBe($("src"));
    await wait(550);
    press($("src"), "r");
    expect(document.activeElement).toBe($("readme"));
  });
});

// ── Filtering ─────────────────────────────────────────────────────────────────

function filterTree() {
  return mount(`<div data-ui="tree-view">
    <input data-part="filter" type="search" aria-label="Filter">
    <ul data-part="tree" role="tree" aria-label="Components">
      ${li("prim", "Primitives", 'tabindex="0" aria-expanded="true"',
        li("button", "Button") + li("stepper", "Stepper"))}
      ${li("recipes", "Recipes", 'aria-expanded="false"',
        li("tabs", "Tabs") + li("table", "Table") + li("toast", "Toast"))}
      ${li("patterns", "Patterns", 'aria-expanded="false"', li("wizard", "Wizard"))}
    </ul>
    <p data-part="empty" hidden>No match</p>
    <p data-part="status" role="status"></p>
  </div>`);
}

describe("tree-view · filter", () => {
  it("wires the wrapper form: role on the tree part, aria-controls on the input", () => {
    const { root } = filterTree();
    const tree = root.querySelector("[data-part='tree']") as HTMLElement;
    expect(root.hasAttribute("role")).toBe(false);
    expect(tree.getAttribute("role")).toBe("tree");
    expect(tree.getAttribute("aria-multiselectable")).toBe("false");
    expect(tree.id).not.toBe("");
    expect(root.querySelector("[data-part='filter']")!.getAttribute("aria-controls")).toBe(tree.id);
    expect($("button").getAttribute("aria-level")).toBe("2");
  });

  it("hides non-matches, opens ancestors of matches, and restores expansion when cleared", async () => {
    const { root } = filterTree();
    const input = root.querySelector("[data-part='filter']") as HTMLInputElement;
    const events: CustomEvent[] = [];
    root.addEventListener("faqir:filter", (e) => events.push(e as CustomEvent));

    input.value = "ta";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect($("tabs").hidden).toBe(false);
    expect($("table").hidden).toBe(false);
    expect($("toast").hidden).toBe(true);
    expect($("recipes").getAttribute("aria-expanded")).toBe("true");
    expect($("prim").hidden).toBe(true);
    expect($("patterns").hidden).toBe(true);
    expect(events.at(-1)!.detail).toEqual({ query: "ta", count: 2 });
    // Polite and debounced: one count once typing pauses.
    expect(status(root).textContent).toBe("");
    await wait(450);
    expect(status(root).textContent).toBe("2 items match ta");

    // Arrow keys only see what is shown.
    $("tabs").focus();
    press($("tabs"), "ArrowUp");
    expect(document.activeElement).toBe($("recipes"));

    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    for (const value of ["prim", "patterns", "toast"]) expect($(value).hidden, value).toBe(false);
    expect($("recipes").getAttribute("aria-expanded")).toBe("false");
    expect($("prim").getAttribute("aria-expanded")).toBe("true");
  });

  it("a matching parent keeps its children; no match shows the empty part", () => {
    const { root, api } = filterTree();
    const empty = root.querySelector("[data-part='empty']") as HTMLElement;
    expect(api.filter("primit")).toBe(1);
    expect($("button").hidden).toBe(false);
    expect(status(root).textContent).toBe("1 item matches primit");
    expect(empty.hidden).toBe(true);

    expect(api.filter("zzz")).toBe(0);
    expect(empty.hidden).toBe(false);
    expect(status(root).textContent).toBe("No items match zzz");
    expect((root.querySelector("[data-part='filter']") as HTMLInputElement).value).toBe("zzz");
  });

  it("Down Arrow moves from the input into the tree; Escape clears", () => {
    const { root } = filterTree();
    const input = root.querySelector("[data-part='filter']") as HTMLInputElement;
    input.value = "wiz";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    expect(press(input, "ArrowDown").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe($("patterns"));

    input.focus();
    expect(press(input, "Escape").defaultPrevented).toBe(true);
    expect(input.value).toBe("");
    expect($("prim").hidden).toBe(false);
    expect(status(root).textContent).toBe("Filter cleared");
  });
});

// ── Multi-select ──────────────────────────────────────────────────────────────

function multiTree() {
  return mount(`<ul data-ui="tree-view" data-mode="multiple" role="tree" aria-label="Outline">
    ${li("a", "Alpha", 'tabindex="0"')}
    ${li("b", "Bravo")}
    ${li("c", "Charlie", 'aria-expanded="true"', li("c1", "Child one") + li("c2", "Child two"))}
    ${li("d", "Delta", 'aria-disabled="true"')}
    ${li("e", "Echo")}
  </ul>`);
}

const selected = () =>
  [...document.querySelectorAll("[aria-selected='true']")].map((el) => (el as HTMLElement).dataset.value);

describe("tree-view · multiple mode", () => {
  it("click replaces, Ctrl/Cmd+click toggles, Shift+click selects a range", () => {
    const { root, api } = multiTree();
    const events: CustomEvent[] = [];
    root.addEventListener("faqir:select", (e) => events.push(e as CustomEvent));
    expect(root.getAttribute("aria-multiselectable")).toBe("true");

    click(labelOf("b"));
    expect(selected()).toEqual(["b"]);
    click(labelOf("c1"), { ctrlKey: true });
    expect(selected()).toEqual(["b", "c1"]);
    click(labelOf("b"), { metaKey: true });
    expect(selected()).toEqual(["c1"]);
    // Ctrl+click moves the anchor even when it deselects, as file managers do.
    click(labelOf("e"), { shiftKey: true });
    // From the anchor (Bravo) to Echo, skipping the disabled Delta.
    expect(selected()).toEqual(["b", "c", "c1", "c2", "e"]);
    expect(events.at(-1)!.detail.values).toEqual(["b", "c", "c1", "c2", "e"]);
    // Ctrl+Shift+click adds a range to what is selected.
    click(labelOf("c1"));
    click(labelOf("a"), { shiftKey: true, ctrlKey: true });
    expect(selected()).toEqual(["a", "b", "c", "c1"]);
    expect(api.getSelection()).toHaveLength(4);
    expect(root.dataset.state).toBe("selected");
  });

  it("Shift+Arrow extends from the anchor, Space toggles, Ctrl+A selects all", () => {
    multiTree();
    $("a").focus();
    press($("a"), " ");
    expect(selected()).toEqual(["a"]);
    press($("a"), "ArrowDown", { shiftKey: true });
    press(document.activeElement!, "ArrowDown", { shiftKey: true });
    expect(document.activeElement).toBe($("c"));
    expect(selected()).toEqual(["a", "b", "c"]);
    // Plain arrows move focus without touching the selection.
    press($("c"), "ArrowDown");
    expect(selected()).toEqual(["a", "b", "c"]);
    press($("c1"), " ");
    expect(selected()).toEqual(["a", "b", "c", "c1"]);
    press($("c1"), " ");
    expect(selected()).toEqual(["a", "b", "c"]);

    expect(press($("c1"), "a", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(selected()).toEqual(["a", "b", "c", "c1", "c2", "e"]);
    expect($("d").hasAttribute("aria-selected")).toBe(false);
  });

  it("Ctrl+Shift+End selects from the focused item to the last", () => {
    multiTree();
    $("c2").focus();
    press($("c2"), "End", { ctrlKey: true, shiftKey: true });
    expect(document.activeElement).toBe($("e"));
    expect(selected()).toEqual(["c2", "e"]);
  });

  it("single mode ignores the modifiers and keeps one selection", () => {
    mount(`<ul data-ui="tree-view" role="tree" aria-label="One">
      ${li("x", "X", 'tabindex="0"')}${li("y", "Y")}</ul>`);
    click(labelOf("x"));
    click(labelOf("y"), { ctrlKey: true });
    expect(selected()).toEqual(["y"]);
  });
});

// ── Moving: keyboard drag-and-drop and move() ─────────────────────────────────

function dndTree(extra = "") {
  return mount(`<ul data-ui="tree-view" data-draggable="true" role="tree" aria-label="Course" ${extra}>
    ${li("w1", "Week one", 'tabindex="0" aria-expanded="true"',
      li("tokens", "Tokens") + li("themes", "Themes"))}
    ${li("w2", "Week two", 'aria-expanded="true"',
      li("prims", "Primitives") + li("recipes", "Recipes", 'aria-expanded="true"', li("tabs", "Tabs")))}
    ${li("notes", "Notes")}
  </ul>`);
}

const values = (container: Element) =>
  [...container.children].filter((el) => el.matches("[data-part='item']")).map((el) => (el as HTMLElement).dataset.value);

describe("tree-view · keyboard move", () => {
  it("makes enabled items draggable and keeps a live region beside a list root", () => {
    const { root } = dndTree();
    expect($("tokens").draggable).toBe(true);
    expect(status(root).getAttribute("role")).toBe("status");
    expect(status(root).dataset.ui).toBe("visually-hidden");
  });

  it("Alt+Enter picks up, arrows announce each place, Enter drops and renumbers", () => {
    const { root } = dndTree();
    const moves: CustomEvent[] = [];
    root.addEventListener("faqir:move", (e) => moves.push(e as CustomEvent));

    $("tokens").focus();
    expect(press($("tokens"), "Enter", { altKey: true }).defaultPrevented).toBe(true);
    expect($("tokens").dataset.state).toBe("grabbed");
    expect(status(root).textContent).toContain("Picked up Tokens");

    // Down from where it sits: before Themes would not move it, so after Themes.
    press($("tokens"), "ArrowDown");
    expect(status(root).textContent).toBe("After Themes, level 2");
    expect(root.querySelector("[data-part='drop-indicator']")!.getAttribute("data-state")).toBe("after");
    press($("tokens"), "ArrowDown");
    expect(status(root).textContent).toBe("Before Week two, level 1");
    press($("tokens"), "ArrowDown");
    expect(status(root).textContent).toBe("Inside Week two, level 2");
    press($("tokens"), "ArrowDown");
    expect(status(root).textContent).toBe("Before Primitives, level 2");
    press($("tokens"), "ArrowUp");
    expect(status(root).textContent).toBe("Inside Week two, level 2");

    expect(press($("tokens"), "Enter").defaultPrevented).toBe(true);
    expect(values($("w2").querySelector("[data-part='group']")!)).toEqual(["prims", "recipes", "tokens"]);
    expect($("tokens").getAttribute("aria-level")).toBe("2");
    expect($("tokens").getAttribute("aria-posinset")).toBe("3");
    expect($("tokens").getAttribute("aria-setsize")).toBe("3");
    expect($("themes").getAttribute("aria-setsize")).toBe("1");
    expect($("tokens").dataset.state).toBeUndefined();
    expect(document.activeElement).toBe($("tokens"));
    expect(root.querySelector("[data-part='drop-indicator']")).toBeNull();
    expect(status(root).textContent).toBe("Moved Tokens into Week two");
    expect(moves[0].detail).toMatchObject({
      value: "tokens", targetValue: "w2", position: "inside", parentValue: "w2", index: 2,
    });
  });

  it("never offers a place inside the item's own subtree", () => {
    const { root } = dndTree();
    $("w2").focus();
    press($("w2"), "Enter", { altKey: true });
    const heard: string[] = [];
    for (let i = 0; i < 8; i++) {
      press($("w2"), "ArrowDown");
      heard.push(status(root).textContent!);
    }
    expect(heard.some((text) => /Primitives|Recipes|Tabs/.test(text))).toBe(false);
    // "Before Notes" is where it already is, so the first place down is after it.
    expect(heard[0]).toBe("After Notes, level 1");
    expect(heard[1]).toBe("End of the tree");

    // Upwards it can go into, or around, everything in Week one.
    const up: string[] = [];
    for (let i = 0; i < 7; i++) {
      press($("w2"), "ArrowUp");
      up.push(status(root).textContent!.trim());
    }
    expect(up.slice(0, 6)).toEqual([
      "After Themes, level 2",
      "Before Themes, level 2",
      "Before Tokens, level 2",
      "Inside Week one, level 2",
      "Before Week one, level 1",
      "Top of the tree",
    ]);
  });

  it("Escape cancels and the item stays put", () => {
    const { root } = dndTree();
    $("notes").focus();
    press($("notes"), "Enter", { altKey: true });
    press($("notes"), "ArrowUp");
    expect(press($("notes"), "Escape").defaultPrevented).toBe(true);
    expect(values(root)).toEqual(["w1", "w2", "notes"]);
    expect($("notes").dataset.state).toBeUndefined();
    expect(status(root).textContent).toBe("Move cancelled. Notes stays where it was.");
    // Out of move mode, arrows navigate again.
    press($("notes"), "ArrowUp");
    expect(document.activeElement).toBe($("tabs"));
  });

  it("faqir:move is cancelable", () => {
    const { root, api } = dndTree();
    root.addEventListener("faqir:move", (e) => e.preventDefault());
    expect(api.move("notes", "w1", "before")).toBe(false);
    expect(values(root)).toEqual(["w1", "w2", "notes"]);
  });

  it("move() places before, after or inside, creating a group for an empty parent", () => {
    const { root, api } = dndTree();
    expect(api.move("notes", "w1", "before")).toBe(true);
    expect(values(root)).toEqual(["notes", "w1", "w2"]);
    expect($("notes").getAttribute("aria-posinset")).toBe("1");

    expect(api.move("tabs", "themes", "after")).toBe(true);
    expect(values($("w1").querySelector("[data-part='group']")!)).toEqual(["tokens", "themes", "tabs"]);
    // Recipes lost its only child but stays a parent with an empty group.
    expect($("recipes").getAttribute("aria-expanded")).toBe("true");

    // A leaf accepts no children; an item never moves into its own subtree.
    expect(api.move("prims", "notes", "inside")).toBe(false);
    expect(api.move("w1", "tabs", "after")).toBe(false);

    // An empty folder (aria-expanded, no group) takes children.
    const folder = document.createElement("li");
    folder.dataset.part = "item";
    folder.dataset.value = "empty";
    folder.setAttribute("aria-expanded", "false");
    folder.innerHTML = '<span data-part="label">Empty</span>';
    root.append(folder);
    expect(api.move("prims", "empty", "inside")).toBe(true);
    expect($("prims").getAttribute("aria-level")).toBe("2");
    expect($("empty").getAttribute("aria-expanded")).toBe("true");
  });

  it("destroy removes the sibling live region it created", () => {
    const { root, api } = dndTree();
    const region = status(root);
    api.destroy();
    mounted = [];
    expect(region.isConnected).toBe(false);
  });
});

describe("tree-view · filter and page-hidden items", () => {
  it("neither matches nor reveals an item the page had hidden", () => {
    const { api } = filterTree();
    $("toast").hidden = true;
    api.filter("t");
    expect($("toast").hidden).toBe(true);
    api.filter("");
    expect($("toast").hidden).toBe(true);
    expect($("tabs").hidden).toBe(false);
  });
});
