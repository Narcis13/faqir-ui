// ═══════════════════════════════════════════════════════════════════════════
// list — controller contract
// ═══════════════════════════════════════════════════════════════════════════
//
//   • Plain (no data-selection): list semantics are left alone; a reorderable
//     list's handle is a button with Alt+Arrow moves and a grab/move/drop mode.
//   • Selectable (single | multi): the items container becomes a labelled
//     listbox, sections become groups named by their header, items become
//     options with aria-selected and a roving tabindex. Click / Enter / Space
//     select (multi toggles), Shift extends from the anchor, Ctrl/Cmd+A selects
//     all, type-ahead moves focus, disabled options are skipped.
//   • Reorder: Alt+Arrow (option) or the handle, and pointer drag by the handle
//     with drop-before/drop-after indicators; every move emits faqir:reorder and
//     is announced in the polite live region.
//   • The root's data-state tracks idle / empty / dragging.

import { describe, it, expect, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createList } from "../../registry/recipes/list/list.js";
import { validateManifest, type Manifest } from "../../src/manifest";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";

const ROOT = join(import.meta.dir, "../..");
const DIR = join(ROOT, "registry", "recipes", "list");
const HTML = readFileSync(join(DIR, "list.html"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "list.manifest.json"), "utf8")) as Manifest;

let host: HTMLElement | null = null;

function mount(markup: string) {
  host = document.createElement("div");
  host.innerHTML = markup;
  document.body.append(host);
  const root = host.querySelector("[data-ui='list']") as HTMLElement;
  const api = createList(root);
  const items = () => [...root.querySelectorAll("[data-part='item']")] as HTMLElement[];
  const values = () => items().map((el) => el.dataset.value);
  const selected = () => items().filter((el) => el.getAttribute("aria-selected") === "true").map((el) => el.dataset.value);
  const item = (value: string) => items().find((el) => el.dataset.value === value)!;
  const live = () => root.querySelector("[data-part='live']")?.textContent?.trim() ?? "";
  return { root, api, items, values, selected, item, live };
}

afterEach(() => {
  const root = host?.querySelector("[data-ui='list']") as (HTMLElement & { _faqirList?: { destroy(): void } }) | null;
  root?._faqirList?.destroy();
  host?.remove();
  host = null;
});

function key(target: Element, k: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
}

function click(target: Element, init: MouseEventInit = {}) {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
}

const row = (value: string, title: string, extra = "") =>
  `<li data-part="item" data-value="${value}" ${extra}><span data-part="content"><span data-part="title">${title}</span></span></li>`;

const LISTBOX = (mode: "single" | "multi", extra = "") => `
  <div data-ui="list" data-selection="${mode}" ${extra}>
    <ul data-part="items" aria-label="Folders">
      ${row("inbox", "Inbox")}
      ${row("drafts", "Drafts")}
      ${row("spam", "Spam", 'aria-disabled="true"')}
      ${row("sent", "Sent")}
      ${row("archive", "Archive")}
    </ul>
  </div>`;

describe("list — plain mode", () => {
  it("keeps list semantics: no roles, no tabindex, no selection", () => {
    const { root, items, api } = mount(`
      <div data-ui="list"><ul data-part="items" aria-label="People">${row("a", "Ann")}${row("b", "Bo")}</ul></div>`);
    const list = root.querySelector("[data-part='items']")!;
    expect(list.hasAttribute("role")).toBe(false);
    for (const item of items()) {
      expect(item.hasAttribute("role")).toBe(false);
      expect(item.hasAttribute("aria-selected")).toBe(false);
      expect(item.hasAttribute("tabindex")).toBe(false);
    }
    expect(api.select("a")).toBe(false);
    expect(root.dataset.state).toBe("idle");
  });

  it("tracks the empty state as items come and go", async () => {
    const { root } = mount(`<div data-ui="list"><ul data-part="items" aria-label="Chats"></ul><p data-part="empty">Nothing here</p></div>`);
    expect(root.dataset.state).toBe("empty");
    root.querySelector("[data-part='items']")!.insertAdjacentHTML("beforeend", row("x", "Xavier"));
    await new Promise((r) => setTimeout(r, 0));
    expect(root.dataset.state).toBe("idle");
  });
});

describe("list — selectable roles", () => {
  it("turns the items container into a listbox and items into options with a roving tabindex", () => {
    const { root, items } = mount(LISTBOX("single"));
    const list = root.querySelector("[data-part='items']")!;
    expect(list.getAttribute("role")).toBe("listbox");
    expect(list.getAttribute("aria-multiselectable")).toBe("false");
    expect(items().map((el) => el.getAttribute("role"))).toEqual(Array(5).fill("option"));
    expect(items().map((el) => el.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    expect(items()[2].hasAttribute("aria-selected")).toBe(false);
    expect(items()[0].getAttribute("aria-selected")).toBe("false");
  });

  it("names each section's group by its header and flattens the inner list", () => {
    const { root } = mount(`
      <div data-ui="list" data-selection="multi">
        <ul data-part="items" aria-label="Contacts">
          <li data-part="section"><span data-part="header">A</span><ul data-part="items">${row("ann", "Ann")}</ul></li>
          <li data-part="section"><span data-part="header">B</span><ul data-part="items">${row("bo", "Bo")}</ul></li>
        </ul>
      </div>`);
    const outer = root.querySelector(":scope > [data-part='items']")!;
    expect(outer.getAttribute("aria-multiselectable")).toBe("true");
    for (const section of root.querySelectorAll("[data-part='section']")) {
      expect(section.getAttribute("role")).toBe("group");
      const header = section.querySelector("[data-part='header']")!;
      expect(header.getAttribute("role")).toBe("presentation");
      expect(header.id).not.toBe("");
      expect(section.getAttribute("aria-labelledby")).toBe(header.id);
      expect(section.querySelector("[data-part='items']")!.getAttribute("role")).toBe("none");
    }
  });

  it("keeps at most one authored selection in single mode", () => {
    const { selected } = mount(`
      <div data-ui="list" data-selection="single"><ul data-part="items" aria-label="X">
        ${row("a", "A", 'aria-selected="true"')}${row("b", "B", 'aria-selected="true"')}
      </ul></div>`);
    expect(selected()).toEqual(["a"]);
  });
});

describe("list — single selection", () => {
  it("click selects one option and emits faqir:select", () => {
    const { root, item, selected } = mount(LISTBOX("single"));
    const events: any[] = [];
    root.addEventListener("faqir:select", (e) => events.push((e as CustomEvent).detail));
    click(item("drafts"));
    expect(selected()).toEqual(["drafts"]);
    click(item("sent"));
    expect(selected()).toEqual(["sent"]);
    expect(events.map((d) => d.value)).toEqual(["drafts", "sent"]);
    expect(events[1].values).toEqual(["sent"]);
    expect(document.activeElement).toBe(item("sent"));
  });

  it("arrows move focus without selecting, skip disabled options, and do not wrap", () => {
    const { item, items, selected } = mount(LISTBOX("single"));
    item("inbox").focus();
    key(item("inbox"), "ArrowDown");
    expect(document.activeElement).toBe(item("drafts"));
    key(item("drafts"), "ArrowDown");
    expect(document.activeElement).toBe(item("sent"));
    key(item("sent"), "End");
    expect(document.activeElement).toBe(item("archive"));
    key(item("archive"), "ArrowDown");
    expect(document.activeElement).toBe(item("archive"));
    key(item("archive"), "Home");
    expect(document.activeElement).toBe(item("inbox"));
    key(item("inbox"), "ArrowUp");
    expect(document.activeElement).toBe(item("inbox"));
    expect(selected()).toEqual([]);
    expect(items().filter((el) => el.tabIndex === 0)).toEqual([item("inbox")]);
  });

  it("Enter and Space select the focused option", () => {
    const { item, selected } = mount(LISTBOX("single"));
    item("drafts").focus();
    key(item("drafts"), "Enter");
    expect(selected()).toEqual(["drafts"]);
    key(item("drafts"), "ArrowDown");
    key(item("sent"), " ");
    expect(selected()).toEqual(["sent"]);
  });

  it("moves the tab stop off an option that a filter hides", async () => {
    const { item, items } = mount(LISTBOX("single"));
    expect(item("inbox").tabIndex).toBe(0);
    item("inbox").hidden = true;
    item("drafts").hidden = true;
    await new Promise((r) => setTimeout(r, 0));
    expect(items().filter((el) => el.tabIndex === 0)).toEqual([item("sent")]);
    item("sent").focus();
    item("sent").dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(item("sent"));
  });

  it("disabled options cannot be selected by click or API", () => {
    const { api, item, selected } = mount(LISTBOX("single"));
    click(item("spam"));
    expect(api.select("spam")).toBe(false);
    expect(selected()).toEqual([]);
  });

  it("type-ahead moves focus to the next title with the typed prefix", async () => {
    const { item } = mount(LISTBOX("single"));
    item("inbox").focus();
    key(item("inbox"), "s");
    expect(document.activeElement).toBe(item("sent"));
    await new Promise((r) => setTimeout(r, 550));
    key(item("sent"), "a");
    expect(document.activeElement).toBe(item("archive"));
    await new Promise((r) => setTimeout(r, 550));
    key(item("archive"), "d");
    key(item("drafts"), "r");
    expect(document.activeElement).toBe(item("drafts"));
  });
});

describe("list — multi selection", () => {
  it("click and Ctrl/Cmd+click toggle; Shift+click selects the range from the anchor", () => {
    const { item, selected } = mount(LISTBOX("multi"));
    click(item("drafts"));
    click(item("archive"), { shiftKey: true });
    // The disabled option inside the range is skipped.
    expect(selected()).toEqual(["drafts", "sent", "archive"]);
    click(item("inbox"), { ctrlKey: true });
    expect(selected()).toEqual(["inbox", "drafts", "sent", "archive"]);
    click(item("inbox"));
    click(item("sent"), { metaKey: true });
    expect(selected()).toEqual(["drafts", "archive"]);
  });

  it("Space toggles; Shift+Arrow extends from the anchor; Shift+Space selects the range", () => {
    const { item, selected } = mount(LISTBOX("multi"));
    item("inbox").focus();
    key(item("inbox"), " ");
    expect(selected()).toEqual(["inbox"]);
    key(item("inbox"), "ArrowDown", { shiftKey: true });
    expect(selected()).toEqual(["inbox", "drafts"]);
    key(item("drafts"), "ArrowDown", { shiftKey: true });
    expect(selected()).toEqual(["inbox", "drafts", "sent"]);
    key(item("sent"), " ");
    expect(selected()).toEqual(["inbox", "drafts"]);
    key(item("sent"), "ArrowDown");
    key(item("archive"), " ", { shiftKey: true });
    expect(selected()).toEqual(["inbox", "drafts", "sent", "archive"]);
  });

  it("Shift+End extends to the last option", () => {
    const { item, selected } = mount(LISTBOX("multi"));
    item("drafts").focus();
    key(item("drafts"), "End", { shiftKey: true });
    expect(selected()).toEqual(["drafts", "sent", "archive"]);
  });

  it("Ctrl/Cmd+A selects every enabled option, and clears them when all are selected", () => {
    const { item, selected } = mount(LISTBOX("multi"));
    item("inbox").focus();
    key(item("inbox"), "a", { ctrlKey: true });
    expect(selected()).toEqual(["inbox", "drafts", "sent", "archive"]);
    key(item("inbox"), "a", { metaKey: true });
    expect(selected()).toEqual([]);
  });

  it("API: select adds, toggle flips, selectAll / clear / getSelected", () => {
    const { api, selected } = mount(LISTBOX("multi"));
    expect(api.select("sent")).toBe(true);
    expect(api.select("inbox")).toBe(true);
    expect(selected()).toEqual(["inbox", "sent"]);
    api.toggle("inbox");
    expect(api.getSelected()).toEqual(["sent"]);
    api.selectAll();
    expect(api.getSelected()).toEqual(["inbox", "drafts", "sent", "archive"]);
    api.clear();
    expect(api.getSelected()).toEqual([]);
  });
});

describe("list — keyboard reordering", () => {
  it("Alt+ArrowUp/Down moves the focused option, keeps focus, emits faqir:reorder and announces", () => {
    const { root, item, values, live } = mount(LISTBOX("single", "data-reorderable"));
    const events: any[] = [];
    root.addEventListener("faqir:reorder", (e) => events.push((e as CustomEvent).detail));
    item("inbox").focus();
    key(item("inbox"), "ArrowDown", { altKey: true });
    expect(values()).toEqual(["drafts", "inbox", "spam", "sent", "archive"]);
    expect(document.activeElement).toBe(item("inbox"));
    expect(events[0]).toMatchObject({ value: "inbox", from: 0, to: 1 });
    expect(events[0].values).toEqual(["drafts", "inbox", "spam", "sent", "archive"]);
    expect(live()).toBe("Moved Inbox to position 2 of 5");
    expect(root.querySelector("[data-part='live']")!.getAttribute("role")).toBe("status");

    key(item("inbox"), "ArrowUp", { altKey: true });
    key(item("inbox"), "ArrowUp", { altKey: true }); // already first: no-op
    expect(values()).toEqual(["inbox", "drafts", "spam", "sent", "archive"]);
    expect(events).toHaveLength(2);
  });

  it("does not reorder without data-reorderable", () => {
    const { item, values } = mount(LISTBOX("single"));
    item("inbox").focus();
    key(item("inbox"), "ArrowDown", { altKey: true });
    expect(values()).toEqual(["inbox", "drafts", "spam", "sent", "archive"]);
  });

  const PLAIN = `
    <div data-ui="list" data-reorderable>
      <ol data-part="items" aria-label="Tasks">
        <li data-part="item" data-value="a"><button type="button" data-part="handle"></button><span data-part="content"><span data-part="title">Alpha</span></span></li>
        <li data-part="item" data-value="b"><button type="button" data-part="handle"></button><span data-part="content"><span data-part="title">Beta</span></span></li>
        <li data-part="item" data-value="c"><button type="button" data-part="handle"></button><span data-part="content"><span data-part="title">Gamma</span></span></li>
      </ol>
    </div>`;

  it("labels unlabelled handles and moves rows with Alt+Arrow on the handle", () => {
    const { root, values, item, live } = mount(PLAIN);
    const handle = (v: string) => item(v).querySelector("[data-part='handle']") as HTMLButtonElement;
    expect(handle("a").getAttribute("aria-label")).toBe("Reorder Alpha");
    handle("a").focus();
    key(handle("a"), "ArrowDown", { altKey: true });
    expect(values()).toEqual(["b", "a", "c"]);
    expect(document.activeElement).toBe(handle("a"));
    expect(live()).toBe("Moved Alpha to position 2 of 3");
    expect(root.querySelector("[data-part='items']")!.hasAttribute("role")).toBe(false);
  });

  it("grab / move / drop from the handle, announced at every step", () => {
    const { root, values, item, live } = mount(PLAIN);
    const handle = item("a").querySelector("[data-part='handle']") as HTMLButtonElement;
    handle.focus();
    key(handle, " ");
    expect(item("a").dataset.state).toBe("dragging");
    expect(root.dataset.state).toBe("dragging");
    expect(live()).toContain("Alpha grabbed, position 1 of 3");
    key(handle, "ArrowDown");
    key(handle, "ArrowDown");
    expect(values()).toEqual(["b", "c", "a"]);
    expect(live()).toBe("Moved Alpha to position 3 of 3");
    key(handle, "Enter");
    expect(item("a").hasAttribute("data-state")).toBe(false);
    expect(root.dataset.state).toBe("idle");
    expect(live()).toBe("Alpha dropped at position 3 of 3");
  });

  it("Escape cancels a grab and puts the row back", () => {
    const { values, item, live } = mount(PLAIN);
    const handle = item("b").querySelector("[data-part='handle']") as HTMLButtonElement;
    handle.focus();
    key(handle, "Enter");
    key(handle, "ArrowUp");
    expect(values()).toEqual(["b", "a", "c"]);
    key(handle, "Escape");
    expect(values()).toEqual(["a", "b", "c"]);
    expect(live()).toBe("Reorder cancelled. Beta returned to position 2 of 3");
  });
});

describe("list — pointer reordering", () => {
  function layout(items: HTMLElement[]) {
    items.forEach((el, i) => {
      el.getBoundingClientRect = () =>
        ({ top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, right: 200, width: 200, x: 0, y: i * 40 }) as DOMRect;
    });
  }
  const pointer = (target: Element, type: string, clientY: number) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientY }));

  it("drags by the handle with a drop indicator and drops into place", () => {
    const { root, items, values, item, live } = mount(LISTBOX("single", "data-reorderable").replaceAll(
      '<span data-part="content">',
      '<span data-part="handle" aria-hidden="true"></span><span data-part="content">',
    ));
    layout(items());
    const events: any[] = [];
    root.addEventListener("faqir:reorder", (e) => events.push((e as CustomEvent).detail));
    const handle = item("inbox").querySelector("[data-part='handle']")!;
    pointer(handle, "pointerdown", 20);
    expect(item("inbox").dataset.state).toBe("dragging");
    expect(root.dataset.state).toBe("dragging");
    pointer(handle, "pointermove", 105); // past the midpoint of the 3rd row (spam: 80–120)
    expect(item("inbox").style.getPropertyValue("--list-drag-y")).toBe("85px");
    expect(item("sent").dataset.state).toBe("drop-before");
    pointer(handle, "pointerup", 105);
    expect(values()).toEqual(["drafts", "spam", "inbox", "sent", "archive"]);
    expect(items().some((el) => el.hasAttribute("data-state"))).toBe(false);
    expect(item("inbox").style.getPropertyValue("--list-drag-y")).toBe("");
    expect(events[0]).toMatchObject({ value: "inbox", from: 0, to: 2 });
    expect(live()).toBe("Moved Inbox to position 3 of 5");
    expect(root.dataset.state).toBe("idle");
  });

  it("marks drop-after past the last row; pointercancel leaves the order alone", () => {
    const { items, values, item } = mount(LISTBOX("single", "data-reorderable").replaceAll(
      '<span data-part="content">',
      '<span data-part="handle" aria-hidden="true"></span><span data-part="content">',
    ));
    layout(items());
    const handle = item("drafts").querySelector("[data-part='handle']")!;
    pointer(handle, "pointerdown", 60);
    pointer(handle, "pointermove", 400);
    expect(item("archive").dataset.state).toBe("drop-after");
    pointer(handle, "pointercancel", 400);
    expect(values()).toEqual(["inbox", "drafts", "spam", "sent", "archive"]);
    expect(items().some((el) => el.hasAttribute("data-state"))).toBe(false);
  });

  it("selectable lists mark handles decorative; a click on a handle does not select", () => {
    const { item, selected } = mount(LISTBOX("single", "data-reorderable").replaceAll(
      '<span data-part="content">',
      '<span data-part="handle"></span><span data-part="content">',
    ));
    const handle = item("drafts").querySelector("[data-part='handle']")!;
    expect(handle.getAttribute("aria-hidden")).toBe("true");
    click(handle);
    expect(selected()).toEqual([]);
  });
});

describe("list — lifecycle", () => {
  it("returns the same API on double init", () => {
    const { root, api } = mount(LISTBOX("single"));
    expect(createList(root)).toBe(api);
  });

  it("destroy removes listeners and the live region it created", () => {
    const { root, api, item, selected } = mount(LISTBOX("single", "data-reorderable"));
    item("inbox").focus();
    key(item("inbox"), "ArrowDown", { altKey: true });
    expect(root.querySelector("[data-part='live']")).not.toBeNull();
    api.destroy();
    expect(root.querySelector("[data-part='live']")).toBeNull();
    click(item("sent"));
    expect(selected()).toEqual([]);
    expect((root as any)._faqirList).toBeUndefined();
  });
});

describe("list — reference and manifest", () => {
  it("manifest validates", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
  });

  it("reference page is audit-clean", async () => {
    const manifests = await loadRegistryManifestMap(join(ROOT, "registry"));
    expect(auditHtmlSource({ source: HTML, file: "registry/recipes/list/list.html", manifests })).toEqual([]);
  });

  it("every part the reference uses is declared", () => {
    const used = new Set([...HTML.matchAll(/data-part="([a-z-]+)"/g)].map((m) => m[1]));
    const declared = new Set(Object.keys(MANIFEST.slots));
    // Parts of nested components (avatar's image/fallback) are theirs, not the list's.
    const foreign = new Set(["image", "fallback"]);
    expect([...used].filter((p) => !declared.has(p) && !foreign.has(p))).toEqual([]);
  });

  it("selectable options in the reference hold no interactive content", () => {
    host = document.createElement("div");
    host.innerHTML = HTML;
    for (const option of host.querySelectorAll("[role='option']")) {
      expect(option.querySelector("a, button, input, select, textarea, [tabindex='0']")).toBeNull();
    }
  });
});
