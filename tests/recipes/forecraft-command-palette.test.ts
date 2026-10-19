// forecraft #13: command-palette items declared no target. An item's
// `data-value` was an unknown attribute and `command-select` carried only the
// element and its label. Items now declare `data-value` (as `detail.value`),
// and an item may be an `<a href>` the controller follows on Enter or click —
// in a documented order: command-select first (cancelable; preventDefault()
// cancels only the navigation), then the registered command, then close, then
// the link.
//
// Links use fragment hrefs so following one never navigates the test realm.

import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import { join } from "node:path";
import { createCommandPalette } from "../../registry/recipes/command-palette/command-palette.js";
import { auditHtmlSource } from "../../src/audit/html-audit";
import { loadRegistryManifestMap, loadRegistryStylesheetMap } from "../../src/utils/components";

const REGISTRY = join(import.meta.dir, "../../registry");

const MARKUP = `<div data-ui="command-palette" data-state="closed" data-no-shortcut>
  <div data-part="overlay" hidden></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-label="Commands" data-size="md" hidden>
    <div data-part="search-wrapper">
      <input data-part="search" type="text" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="fc-list">
    </div>
    <div data-part="list" role="listbox" id="fc-list">
      <div data-part="group">
        <div data-part="group-label">Go to</div>
        <a data-part="item" role="option" aria-selected="false" href="#invoices" data-value="nav.invoices">
          <span data-part="item-label">Invoices</span>
        </a>
        <a data-part="item" role="option" aria-selected="false" href="#clients" tabindex="0">
          <span data-part="item-label">Clients</span>
        </a>
      </div>
      <div data-part="group">
        <div data-part="group-label">Actions</div>
        <div data-part="item" role="option" aria-selected="false" data-value="invoice.new">
          <span data-part="item-label">New invoice</span>
        </div>
      </div>
      <div data-part="empty" hidden>No commands found</div>
    </div>
  </div>
</div>`;

type Api = ReturnType<typeof createCommandPalette>;
let box: HTMLElement | null = null;
let api: Api | null = null;
const listeners: Array<[string, EventListener]> = [];

afterEach(() => {
  api?.destroy();
  api = null;
  box?.remove();
  box = null;
  for (const [type, fn] of listeners.splice(0)) document.removeEventListener(type, fn);
});

function on(type: string, fn: (e: CustomEvent) => void) {
  const l = fn as unknown as EventListener;
  listeners.push([type, l]);
  document.addEventListener(type, l);
}

function setup() {
  box = document.createElement("div");
  box.innerHTML = MARKUP;
  document.body.appendChild(box);
  const root = box.querySelector("[data-ui='command-palette']") as HTMLElement;
  api = createCommandPalette(root);
  const search = root.querySelector("[data-part='search']") as HTMLInputElement;
  const item = (label: string) =>
    [...root.querySelectorAll("[data-part='item']")].find((el) =>
      el.textContent!.includes(label),
    ) as HTMLElement;
  const key = (k: string) =>
    search.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  /** Record clicks reaching a link — the navigation the browser would run. */
  const clicks = (el: HTMLElement) => {
    const seen: MouseEvent[] = [];
    el.addEventListener("click", (e) => seen.push(e as MouseEvent));
    return seen;
  };
  return { root, search, item, key, clicks };
}

describe("command-palette item targets (forecraft #13)", () => {
  it("passes data-value as detail.value (null when absent)", () => {
    const { item } = setup();
    const details: any[] = [];
    on("command-select", (e) => details.push(e.detail));
    api!.open();
    item("New invoice").click();
    api!.open();
    item("Clients").click();
    expect(details[0].value).toBe("invoice.new");
    expect(details[0].href).toBeNull();
    expect(details[1].value).toBeNull();
    expect(details[1].href).toMatch(/#clients$/);
  });

  it("Enter on a link item fires command-select, closes, then follows the link", () => {
    const { root, item, key, clicks } = setup();
    const link = item("Invoices");
    const followed = clicks(link);
    const order: string[] = [];
    on("command-select", (e) => {
      order.push("select:" + e.detail.value);
      expect(e.cancelable).toBe(true);
      expect(root.dataset.state).toBe("open");
    });
    link.addEventListener("click", () => order.push("follow:" + root.dataset.state));
    api!.open();
    key("ArrowDown");
    key("Enter");
    expect(followed).toHaveLength(1);
    expect(order).toEqual(["select:nav.invoices", "follow:closed"]);
  });

  it("the controller's own click on a link is not a second selection", () => {
    const { item, key } = setup();
    let selects = 0;
    on("command-select", () => selects++);
    api!.open();
    key("ArrowDown");
    key("Enter");
    expect(selects).toBe(1);
  });

  it("preventDefault() on command-select stops the navigation, not the close", () => {
    const { root, item, key, clicks } = setup();
    const followed = clicks(item("Invoices"));
    on("command-select", (e) => e.preventDefault());
    api!.open();
    key("ArrowDown");
    key("Enter");
    expect(followed).toHaveLength(0);
    expect(root.dataset.state).toBe("closed");
  });

  it("a click on a link item keeps its native navigation unless command-select is prevented", () => {
    const { item } = setup();
    const link = item("Invoices");
    api!.open();
    const free = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);

    on("command-select", (e) => e.preventDefault());
    api!.open();
    const held = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
  });

  it("Enter on a non-link item still only selects (no click, no navigation)", () => {
    const { item, key, clicks, root } = setup();
    const clicked = clicks(item("New invoice"));
    let value = null as string | null;
    on("command-select", (e) => (value = e.detail.value));
    api!.open();
    key("End");
    key("Enter");
    expect(value).toBe("invoice.new");
    expect(clicked).toHaveLength(0);
    expect(root.dataset.state).toBe("closed");
  });

  it("takes link items out of the Tab order when it opens, leaving an author's tabindex alone", () => {
    const { item } = setup();
    expect(item("Invoices").hasAttribute("tabindex")).toBe(false);
    api!.open();
    expect(item("Invoices").getAttribute("tabindex")).toBe("-1");
    expect(item("Clients").getAttribute("tabindex")).toBe("0");
    expect(item("New invoice").hasAttribute("tabindex")).toBe(false);
  });
});

describe("command-palette item targets audit clean (forecraft #13)", () => {
  let manifests: Awaited<ReturnType<typeof loadRegistryManifestMap>>;
  let styles: Awaited<ReturnType<typeof loadRegistryStylesheetMap>>;
  beforeAll(async () => {
    manifests = await loadRegistryManifestMap(REGISTRY);
    styles = await loadRegistryStylesheetMap(REGISTRY);
  });

  it("data-value on an item and an <a href> item raise no finding, strict included", () => {
    const findings = auditHtmlSource({ source: MARKUP, file: "palette.html", manifests, styles, strict: true });
    expect(findings.map((f) => `${f.rule_id}: ${f.message}`)).toEqual([]);
  });
});
