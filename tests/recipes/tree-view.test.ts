import { beforeEach, describe, expect, it } from "bun:test";
import { createTreeView } from "../../registry/recipes/tree-view/tree-view.js";

function treeMarkup() {
  return `
    <ul data-ui="tree-view" data-state="idle" role="tree" aria-label="Files">
      <li id="alpha" data-part="item" data-state="expanded" data-value="alpha"
          role="treeitem" tabindex="0" aria-selected="false" aria-expanded="true">
        <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>Alpha</span>
        <ul data-part="group" role="group">
          <li id="apps" data-part="item" data-state="expanded" data-value="apps"
              role="treeitem" tabindex="-1" aria-selected="false" aria-expanded="true">
            <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>Apps</span>
            <ul data-part="group" role="group">
              <li id="api" data-part="item" data-value="api" role="treeitem"
                  tabindex="-1" aria-selected="false">
                <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>API</span>
              </li>
              <li id="assets" data-part="item" data-value="assets" role="treeitem"
                  tabindex="-1" aria-disabled="true">
                <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>Assets</span>
              </li>
            </ul>
          </li>
          <li id="archive" data-part="item" data-state="collapsed" data-value="archive"
              role="treeitem" tabindex="-1" aria-selected="false" aria-expanded="false">
            <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>Archive</span>
            <ul data-part="group" role="group" hidden>
              <li id="archive-file" data-part="item" data-value="archive-file"
                  role="treeitem" tabindex="-1" aria-selected="false">
                <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>Archive file</span>
              </li>
            </ul>
          </li>
        </ul>
      </li>
      <li id="beta" data-part="item" data-state="collapsed" data-value="beta"
          role="treeitem" tabindex="-1" aria-selected="false" aria-expanded="false">
        <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>Beta</span>
        <ul data-part="group" role="group" hidden>
          <li id="beta-file" data-part="item" data-value="beta-file" role="treeitem"
              tabindex="-1" aria-selected="false">
            <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>Beta file</span>
          </li>
        </ul>
      </li>
      <li id="charlie" data-part="item" data-value="charlie" role="treeitem"
          tabindex="-1" aria-selected="false">
        <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>Charlie</span>
      </li>
    </ul>
  `;
}

function setupTree() {
  document.body.innerHTML = treeMarkup();
  const root = document.querySelector("[data-ui='tree-view']") as HTMLElement;
  const api = createTreeView(root);
  return { root, api };
}

function item(id: string) {
  return document.getElementById(id) as HTMLElement;
}

function press(target: EventTarget, key: string) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function expectFocus(id: string) {
  expect(document.activeElement).toBe(item(id));
  const treeItems = [
    ...document.querySelectorAll("[data-ui='tree-view'] [data-part='item']"),
  ] as HTMLElement[];
  for (const candidate of treeItems) {
    expect(candidate.tabIndex).toBe(candidate === item(id) ? 0 : -1);
  }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("tree-view controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("is idempotent and initializes one roving tab stop", () => {
    const { root, api } = setupTree();
    const again = createTreeView(root);

    expect(again).toBe(api);
    expect(root.getAttribute("role")).toBe("tree");
    expect(root.getAttribute("aria-multiselectable")).toBe("false");
    expect(root.dataset.state).toBe("idle");
    expect(item("alpha").tabIndex).toBe(0);
    expect(
      root.querySelectorAll("[data-part='item'][tabindex='0']").length,
    ).toBe(1);
  });

  it("computes roles and positional ARIA at every level", () => {
    const { root } = setupTree();
    const expected = {
      alpha: ["1", "3", "1"],
      apps: ["2", "2", "1"],
      api: ["3", "2", "1"],
      assets: ["3", "2", "2"],
      archive: ["2", "2", "2"],
      "archive-file": ["3", "1", "1"],
      beta: ["1", "3", "2"],
      "beta-file": ["2", "1", "1"],
      charlie: ["1", "3", "3"],
    } as const;

    for (const [id, [level, setSize, position]] of Object.entries(expected)) {
      const node = item(id);
      expect(node.getAttribute("role"), id).toBe("treeitem");
      expect(node.getAttribute("aria-level"), id).toBe(level);
      expect(node.getAttribute("aria-setsize"), id).toBe(setSize);
      expect(node.getAttribute("aria-posinset"), id).toBe(position);
    }

    for (const group of root.querySelectorAll("[data-part='group']")) {
      expect(group.getAttribute("role")).toBe("group");
    }
    expect(item("alpha").getAttribute("aria-expanded")).toBe("true");
    expect(item("archive").getAttribute("aria-expanded")).toBe("false");
    expect(item("api").hasAttribute("aria-expanded")).toBe(false);
    expect(item("charlie").hasAttribute("aria-expanded")).toBe(false);
    expect(item("assets").hasAttribute("aria-selected")).toBe(false);
    expect(item("api").getAttribute("aria-selected")).toBe("false");
  });

  it("ArrowDown and ArrowUp traverse every visible enabled item without wrapping", () => {
    setupTree();
    item("alpha").focus();

    const down = ["apps", "api", "archive", "beta", "charlie"];
    for (const id of down) {
      expect(press(document.activeElement!, "ArrowDown").defaultPrevented).toBe(true);
      expectFocus(id);
    }
    expect(press(item("charlie"), "ArrowDown").defaultPrevented).toBe(true);
    expectFocus("charlie");

    const up = ["beta", "archive", "api", "apps", "alpha"];
    for (const id of up) {
      expect(press(document.activeElement!, "ArrowUp").defaultPrevented).toBe(true);
      expectFocus(id);
    }
    expect(press(item("alpha"), "ArrowUp").defaultPrevented).toBe(true);
    expectFocus("alpha");
  });

  it("Home and End reach the visible boundaries without changing expansion", () => {
    setupTree();
    item("api").focus();

    expect(press(item("api"), "End").defaultPrevented).toBe(true);
    expectFocus("charlie");
    expect(press(item("charlie"), "Home").defaultPrevented).toBe(true);
    expectFocus("alpha");
    expect(item("archive").getAttribute("aria-expanded")).toBe("false");
    expect(item("beta").getAttribute("aria-expanded")).toBe("false");
  });

  it("Right and Left implement the complete parent/child contract", () => {
    setupTree();

    item("alpha").focus();
    expect(press(item("alpha"), "ArrowRight").defaultPrevented).toBe(true);
    expectFocus("apps");

    item("api").focus();
    press(item("api"), "ArrowRight");
    expectFocus("api");

    item("archive").focus();
    press(item("archive"), "ArrowRight");
    expectFocus("archive");
    expect(item("archive").getAttribute("aria-expanded")).toBe("true");
    expect(item("archive").dataset.state).toBe("expanded");
    expect((item("archive").querySelector("[data-part='group']") as HTMLElement).hidden).toBe(false);

    press(item("archive"), "ArrowRight");
    expectFocus("archive-file");
    press(item("archive-file"), "ArrowLeft");
    expectFocus("archive");
    press(item("archive"), "ArrowLeft");
    expectFocus("archive");
    expect(item("archive").getAttribute("aria-expanded")).toBe("false");
    expect(item("archive").dataset.state).toBe("collapsed");
    press(item("archive"), "ArrowLeft");
    expectFocus("alpha");

    press(item("alpha"), "ArrowLeft");
    expectFocus("alpha");
    expect(item("alpha").getAttribute("aria-expanded")).toBe("false");
    press(item("alpha"), "ArrowLeft");
    expectFocus("alpha");

    // Reopening an ancestor preserves the nested branch's own expanded state.
    press(item("alpha"), "ArrowRight");
    press(item("alpha"), "ArrowRight");
    expectFocus("apps");
    expect(item("apps").getAttribute("aria-expanded")).toBe("true");
  });

  it("typeahead wraps, matches prefixes, and skips disabled items", () => {
    setupTree();
    item("alpha").focus();

    expect(press(item("alpha"), "A").defaultPrevented).toBe(true);
    expectFocus("apps");
    expect(press(item("apps"), "p").defaultPrevented).toBe(true);
    expectFocus("api");

    setupTree();
    item("beta").focus();
    press(item("beta"), "a");
    expectFocus("alpha");
  });

  it("asterisk expands all enabled sibling parents", () => {
    setupTree();
    item("apps").focus();

    expect(item("archive").getAttribute("aria-expanded")).toBe("false");
    expect(press(item("apps"), "*").defaultPrevented).toBe(true);
    expect(item("apps").getAttribute("aria-expanded")).toBe("true");
    expect(item("archive").getAttribute("aria-expanded")).toBe("true");
    expectFocus("apps");
  });

  it("click, Enter, and Space emit single-selection events", () => {
    const { root } = setupTree();
    const events: CustomEvent[] = [];
    root.addEventListener("faqir:select", (event) => {
      events.push(event as CustomEvent);
    });

    item("apps").click();
    expect(item("apps").getAttribute("aria-selected")).toBe("true");
    expect(item("alpha").getAttribute("aria-selected")).toBe("false");
    expect(events[0].detail.value).toBe("apps");
    expect(events[0].detail.label).toBe("Apps");
    expect(root.dataset.state).toBe("selected");

    item("charlie").focus();
    expect(press(item("charlie"), "Enter").defaultPrevented).toBe(true);
    expect(item("charlie").getAttribute("aria-selected")).toBe("true");
    expect(item("apps").getAttribute("aria-selected")).toBe("false");
    expect(events[1].detail.previousValue).toBe("apps");

    item("alpha").focus();
    expect(press(item("alpha"), " ").defaultPrevented).toBe(true);
    expect(item("alpha").getAttribute("aria-selected")).toBe("true");
    expect(events).toHaveLength(3);

    item("assets").click();
    press(item("assets"), "Enter");
    expect(item("assets").hasAttribute("aria-selected")).toBe(false);
    expect(events).toHaveLength(3);
  });

  it("expand/collapse round-trips ARIA, hidden state, and event detail", () => {
    const { root, api } = setupTree();
    const events: CustomEvent[] = [];
    root.addEventListener("faqir:expand", (event) => events.push(event as CustomEvent));

    expect(api.expand("archive")).toBe(true);
    expect(item("archive").getAttribute("aria-expanded")).toBe("true");
    expect((item("archive").querySelector("[data-part='group']") as HTMLElement).hidden).toBe(false);
    expect(events[0].detail).toMatchObject({ value: "archive", expanded: true, lazy: false });

    expect(api.collapse(item("archive"))).toBe(true);
    expect(item("archive").getAttribute("aria-expanded")).toBe("false");
    expect((item("archive").querySelector("[data-part='group']") as HTMLElement).hidden).toBe(true);
    expect(events[1].detail).toMatchObject({ value: "archive", expanded: false, lazy: false });
    expect(api.expand("api")).toBe(false);
  });

  it("lazy expansion emits a hook and normalizes children supplied by the app", async () => {
    document.body.innerHTML = `
      <ul data-ui="tree-view" role="tree" aria-label="Remote files">
        <li id="remote" data-part="item" data-value="remote" data-lazy="true"
            role="treeitem" tabindex="0" aria-selected="false" aria-expanded="false">
          <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>Remote</span>
        </li>
      </ul>
    `;
    const root = document.querySelector("[data-ui='tree-view']") as HTMLElement;
    const api = createTreeView(root);
    const events: CustomEvent[] = [];

    root.addEventListener("faqir:expand", (event) => {
      const custom = event as CustomEvent;
      events.push(custom);
      if (!custom.detail.expanded || !custom.detail.lazy) return;
      const group = document.createElement("ul");
      group.dataset.part = "group";
      group.innerHTML = `
        <li id="remote-child" data-part="item" data-value="remote-child">
          <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span>Remote child</span>
        </li>
      `;
      custom.detail.item.append(group);
    });

    expect(api.expand("remote")).toBe(true);
    await tick();

    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({ value: "remote", expanded: true, lazy: true });
    expect(item("remote-child").getAttribute("role")).toBe("treeitem");
    expect(item("remote-child").getAttribute("aria-level")).toBe("2");
    expect(item("remote-child").getAttribute("aria-setsize")).toBe("1");
    expect(item("remote-child").getAttribute("aria-posinset")).toBe("1");
    expect((item("remote").querySelector("[data-part='group']") as HTMLElement).hidden).toBe(false);

    item("remote").focus();
    press(item("remote"), "ArrowRight");
    expectFocus("remote-child");
  });

  it("destroy removes delegated behavior and allows a fresh controller", async () => {
    const host = document.createElement("div");
    host.innerHTML = treeMarkup();
    const root = host.querySelector("[data-ui='tree-view']") as HTMLElement;
    const api = createTreeView(root);
    const apps = root.querySelector("#apps") as HTMLElement;
    let selections = 0;
    root.addEventListener("faqir:select", () => selections++);

    api.destroy();
    apps.click();
    press(apps, "Enter");
    expect(selections).toBe(0);

    const added = document.createElement("li");
    added.dataset.part = "item";
    root.append(added);
    await tick();
    expect(added.hasAttribute("role")).toBe(false);

    const fresh = createTreeView(root);
    expect(fresh).not.toBe(api);
    expect(added.getAttribute("role")).toBe("treeitem");
  });
});
