import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { runCli } from "../../src/index";

async function makeTempProject(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "loom-phase4-"));
}

async function importFromProject<T>(cwd: string, relativePath: string): Promise<T> {
  return await import(`${pathToFileURL(join(cwd, relativePath)).href}?t=${Date.now()}`) as T;
}

class FakeEventTarget {
  listeners = new Map<string, Array<{ listener: (event: any) => void; once: boolean }>>();

  addEventListener(type: string, listener: (event: any) => void, options?: { once?: boolean }) {
    const list = this.listeners.get(type) ?? [];
    list.push({ listener, once: !!options?.once });
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((entry) => entry.listener !== listener));
  }

  dispatch(type: string, event: Record<string, unknown> = {}) {
    for (const entry of [...(this.listeners.get(type) ?? [])]) {
      entry.listener({ type, ...event });

      if (entry.once) {
        this.removeEventListener(type, entry.listener);
      }
    }
  }
}

class FakeElement extends FakeEventTarget {
  nodeType = 1;
  tagName: string;
  ownerDocument: FakeDocument;
  parent: FakeElement | null = null;
  children: FakeElement[] = [];
  hidden = false;
  disabled = false;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  id = "";

  constructor(ownerDocument: FakeDocument, tagName: string, attributes: Record<string, string> = {}) {
    super();
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toLowerCase();

    for (const [name, value] of Object.entries(attributes)) {
      this.setAttribute(name, value);
    }
  }

  append(...children: FakeElement[]) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  contains(node: FakeElement | null): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.descendants().filter((node) => node.matches(selector));
  }

  closest(selector: string): FakeElement | null {
    let current: FakeElement | null = this;

    while (current) {
      if (current.matches(selector)) {
        return current;
      }

      current = current.parent;
    }

    return null;
  }

  matches(selector: string): boolean {
    if (selector.includes("button:not([disabled])")) {
      return this.isFocusable();
    }

    const match = selector.match(/^\[([^=\]]+)=['"]?([^'"\]]+)['"]?\]$/);

    if (!match) {
      return false;
    }

    return this.getAttribute(match[1]) === match[2];
  }

  getAttribute(name: string): string | null {
    if (name === "id") {
      return this.id || null;
    }

    if (name === "hidden") {
      return this.hidden ? "" : null;
    }

    if (name.startsWith("data-")) {
      const key = toDatasetKey(name);
      return Object.hasOwn(this.dataset, key) ? this.dataset[key] : null;
    }

    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    if (name === "id") {
      this.id = value;
      return;
    }

    if (name === "hidden") {
      this.hidden = true;
      return;
    }

    if (name.startsWith("data-")) {
      this.dataset[toDatasetKey(name)] = value;
      return;
    }

    this.attributes.set(name, value);
  }

  descendants(): FakeElement[] {
    const nodes: FakeElement[] = [];

    for (const child of this.children) {
      nodes.push(child, ...child.descendants());
    }

    return nodes;
  }

  isFocusable(): boolean {
    const tabindex = this.getAttribute("tabindex");

    if (tabindex !== null) {
      return tabindex !== "-1" && !this.hidden && !this.disabled;
    }

    return ["button", "input", "select", "textarea", "a"].includes(this.tagName) && !this.hidden && !this.disabled;
  }
}

class FakeDocument extends FakeEventTarget {
  readyState: "loading" | "complete";
  activeElement: FakeElement | null = null;
  body: FakeElement;

  constructor(readyState: "loading" | "complete" = "complete") {
    super();
    this.readyState = readyState;
    this.body = new FakeElement(this, "body");
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.body.querySelectorAll(selector);
  }
}

class FakeMutationObserver {
  static last: FakeMutationObserver | null = null;

  callback: (mutations: Array<{ addedNodes: FakeElement[] }>) => void;

  constructor(callback: (mutations: Array<{ addedNodes: FakeElement[] }>) => void) {
    this.callback = callback;
    FakeMutationObserver.last = this;
  }

  observe() {}

  disconnect() {}

  flush(addedNodes: FakeElement[]) {
    this.callback([{ addedNodes }]);
  }
}

function toDatasetKey(attributeName: string): string {
  return attributeName
    .slice(5)
    .split("-")
    .map((part, index) => index === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}

async function withGlobals<T>(documentLike: FakeDocument, run: () => Promise<T> | T): Promise<T> {
  const previousDocument = globalThis.document;
  const previousMutationObserver = globalThis.MutationObserver;
  const previousMatchMedia = globalThis.matchMedia;

  globalThis.document = documentLike as unknown as Document;
  globalThis.MutationObserver = FakeMutationObserver as unknown as typeof MutationObserver;
  globalThis.matchMedia = () => ({ matches: true }) as MediaQueryList;

  try {
    return await run();
  } finally {
    globalThis.document = previousDocument;
    globalThis.MutationObserver = previousMutationObserver;
    globalThis.matchMedia = previousMatchMedia;
    FakeMutationObserver.last = null;
  }
}

function button(documentLike: FakeDocument, attributes: Record<string, string> = {}) {
  return new FakeElement(documentLike, "button", attributes);
}

function div(documentLike: FakeDocument, attributes: Record<string, string> = {}) {
  return new FakeElement(documentLike, "div", attributes);
}

function section(documentLike: FakeDocument, attributes: Record<string, string> = {}) {
  return new FakeElement(documentLike, "section", attributes);
}

function buildDialogFixture(documentLike: FakeDocument) {
  const root = div(documentLike, { "data-ui": "dialog", "data-state": "closed", id: "dialog-test" });
  const externalTrigger = button(documentLike, { "data-open": "dialog-test" });
  const trigger = button(documentLike, { "data-part": "trigger" });
  const overlay = div(documentLike, { "data-part": "overlay" });
  const panel = div(documentLike, { "data-part": "panel", tabindex: "-1" });
  const headerClose = button(documentLike, { "data-part": "close" });
  const footerClose = button(documentLike, { "data-part": "close" });
  const title = new FakeElement(documentLike, "h2", { "data-part": "title" });
  const description = new FakeElement(documentLike, "p", { "data-part": "description" });
  const confirm = button(documentLike);

  overlay.hidden = true;
  panel.hidden = true;
  panel.append(title, description, headerClose, footerClose, confirm);
  root.append(trigger, overlay, panel);
  documentLike.body.append(externalTrigger, root);

  return { root, externalTrigger, trigger, overlay, panel, headerClose, footerClose };
}

function buildTabsFixture(documentLike: FakeDocument) {
  const root = div(documentLike, { "data-ui": "tabs", "data-state": "ready", "data-orientation": "horizontal" });
  const list = div(documentLike, { "data-part": "list", role: "tablist" });
  const overviewTab = button(documentLike, {
    "data-part": "trigger",
    "data-value": "overview",
    "aria-selected": "true",
  });
  const activityTab = button(documentLike, {
    "data-part": "trigger",
    "data-value": "activity",
    "aria-selected": "false",
  });
  const settingsTab = button(documentLike, {
    "data-part": "trigger",
    "data-value": "settings",
    "aria-selected": "false",
  });
  const overviewPanel = section(documentLike, { "data-part": "panel", "data-value": "overview" });
  const activityPanel = section(documentLike, { "data-part": "panel", "data-value": "activity" });
  const settingsPanel = section(documentLike, { "data-part": "panel", "data-value": "settings" });

  activityPanel.hidden = true;
  settingsPanel.hidden = true;
  list.append(overviewTab, activityTab, settingsTab);
  root.append(list, overviewPanel, activityPanel, settingsPanel);
  documentLike.body.append(root);

  return { root, overviewTab, activityTab, settingsTab, overviewPanel, activityPanel, settingsPanel };
}

function buildDropdownFixture(documentLike: FakeDocument) {
  const root = div(documentLike, { "data-ui": "dropdown", "data-state": "closed" });
  const trigger = button(documentLike, { "data-part": "trigger" });
  const menu = div(documentLike, { "data-part": "menu" });
  const first = button(documentLike, { "data-part": "item" });
  const second = button(documentLike, { "data-part": "item" });
  const third = button(documentLike, { "data-part": "item" });
  const outside = div(documentLike);

  menu.hidden = true;
  menu.append(first, second, third);
  root.append(trigger, menu);
  documentLike.body.append(root, outside);

  return { root, trigger, menu, first, second, third, outside };
}

describe("loom recipes", () => {
  test("loom add installs recipes, enables core, writes auto-init, and passes doctor", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init", "--no-core"], cwd)).toBe(0);
      expect(await runCli(["add", "dialog", "tabs", "dropdown"], cwd)).toBe(0);
      expect(await runCli(["doctor"], cwd)).toBe(0);

      const config = JSON.parse(await readFile(join(cwd, "loom.config.json"), "utf8"));
      const loomScript = await readFile(join(cwd, "ui", "loom.js"), "utf8");

      expect(config.include_core).toBe(true);
      expect(config.installed).toEqual({
        primitives: ["button"],
        recipes: ["dialog", "dropdown", "tabs"],
        patterns: [],
      });
      expect(loomScript).toContain('import { createDialog } from "./recipes/dialog/dialog.js";');
      expect(loomScript).toContain('import { createDropdown } from "./recipes/dropdown/dropdown.js";');
      expect(loomScript).toContain('"tabs": createTabs');
      await expect(stat(join(cwd, "ui", "recipes", "dialog", "dialog.js"))).resolves.toBeDefined();
      await expect(stat(join(cwd, "ui", "recipes", "tabs", "tabs.js"))).resolves.toBeDefined();
      await expect(stat(join(cwd, "ui", "recipes", "dropdown", "dropdown.js"))).resolves.toBeDefined();
      await expect(stat(join(cwd, "ui", "core", "focus.js"))).resolves.toBeDefined();
      await expect(stat(join(cwd, "ui", "core", "events.js"))).resolves.toBeDefined();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("installed recipe controllers behave as expected", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "dialog", "tabs", "dropdown"], cwd)).toBe(0);

      await withGlobals(new FakeDocument(), async () => {
        const [{ createDialog }, { createTabs }, { createDropdown }] = await Promise.all([
          importFromProject<{ createDialog: (root: FakeElement) => any }>(cwd, "ui/recipes/dialog/dialog.js"),
          importFromProject<{ createTabs: (root: FakeElement) => any }>(cwd, "ui/recipes/tabs/tabs.js"),
          importFromProject<{ createDropdown: (root: FakeElement) => any }>(cwd, "ui/recipes/dropdown/dropdown.js"),
        ]);

        const documentLike = globalThis.document as unknown as FakeDocument;

        const dialog = buildDialogFixture(documentLike);
        dialog.trigger.focus();
        const dialogApi = createDialog(dialog.root);

        expect(createDialog(dialog.root)).toBe(dialogApi);

        dialog.trigger.dispatch("click", { target: dialog.trigger });
        expect(dialog.root.dataset.state).toBe("open");
        expect(dialog.overlay.hidden).toBe(false);
        expect(dialog.panel.hidden).toBe(false);

        dialog.root.dispatch("keydown", {
          key: "Escape",
          target: dialog.panel,
          preventDefault() {},
        });
        await Promise.resolve();
        expect(dialog.root.dataset.state).toBe("closed");
        expect(dialog.overlay.hidden).toBe(true);
        expect(dialog.panel.hidden).toBe(true);
        expect(documentLike.activeElement).toBe(dialog.trigger);

        dialog.externalTrigger.dispatch("click", { target: dialog.externalTrigger });
        expect(dialog.root.dataset.state).toBe("open");
        await dialogApi.close();

        const tabs = buildTabsFixture(documentLike);
        const tabsApi = createTabs(tabs.root);
        tabs.activityTab.dispatch("click", { target: tabs.activityTab });
        expect(tabs.activityTab.getAttribute("aria-selected")).toBe("true");
        expect(tabs.activityPanel.hidden).toBe(false);
        expect(tabs.overviewPanel.hidden).toBe(true);

        tabs.activityTab.dispatch("keydown", {
          key: "ArrowRight",
          target: tabs.activityTab,
          preventDefault() {},
        });
        expect(tabs.settingsTab.getAttribute("aria-selected")).toBe("true");
        expect(documentLike.activeElement).toBe(tabs.settingsTab);
        tabsApi.activate("overview");
        expect(tabs.overviewPanel.hidden).toBe(false);

        const dropdown = buildDropdownFixture(documentLike);
        const dropdownApi = createDropdown(dropdown.root);
        dropdown.trigger.dispatch("keydown", {
          key: "ArrowDown",
          target: dropdown.trigger,
          preventDefault() {},
        });
        expect(dropdown.root.dataset.state).toBe("open");
        expect(dropdown.menu.hidden).toBe(false);
        expect(documentLike.activeElement).toBe(dropdown.first);

        dropdown.first.dispatch("keydown", {
          key: "ArrowDown",
          target: dropdown.first,
          preventDefault() {},
        });
        expect(documentLike.activeElement).toBe(dropdown.second);

        documentLike.dispatch("click", { target: dropdown.outside });
        expect(dropdown.root.dataset.state).toBe("closed");
        expect(dropdown.menu.hidden).toBe(true);

        dropdownApi.open({ focus: "last" });
        expect(documentLike.activeElement).toBe(dropdown.third);
        dropdown.third.dispatch("click", { target: dropdown.third });
        expect(dropdown.root.dataset.state).toBe("closed");
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("generated loom.js auto-initializes installed recipes and observes new nodes", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "dialog", "tabs", "dropdown"], cwd)).toBe(0);

      await withGlobals(new FakeDocument("complete"), async () => {
        const documentLike = globalThis.document as unknown as FakeDocument;
        const dialog = buildDialogFixture(documentLike).root;
        const tabs = buildTabsFixture(documentLike).root;
        const dropdown = buildDropdownFixture(documentLike).root;

        const module = await importFromProject<{ controllers: Record<string, Function> }>(cwd, "ui/loom.js");

        expect(Object.keys(module.controllers)).toEqual(["dialog", "dropdown", "tabs"]);
        expect(dialog["__loomDialog"]).toBeDefined();
        expect(tabs["__loomTabs"]).toBeDefined();
        expect(dropdown["__loomDropdown"]).toBeDefined();

        const nextDropdown = buildDropdownFixture(documentLike).root;
        FakeMutationObserver.last?.flush([nextDropdown]);
        expect(nextDropdown["__loomDropdown"]).toBeDefined();
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
