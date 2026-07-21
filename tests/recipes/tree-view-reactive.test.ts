import { beforeEach, describe, expect, it } from "bun:test";
import { createTreeView } from "../../registry/recipes/tree-view/tree-view.js";

const Faqir = require("../../registry/core/faqir-core.js");

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

function byValue(root: HTMLElement, value: string) {
  return root.querySelector(`[data-part="item"][data-value="${value}"]`) as HTMLElement;
}

function directValues(container: Element) {
  return [...container.children]
    .filter((child) => child.matches("[data-part='item']"))
    .map((child) => (child as HTMLElement).dataset.value);
}

describe("tree-view with keyed l-for nodes", () => {
  beforeEach(async () => {
    document.body.innerHTML = "";
    await tick();
  });

  it("initializes before render, preserves keyed branches, and refreshes ARIA after reconciliation", async () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <ul id="reactive-tree" data-ui="tree-view" role="tree" aria-label="Reactive files"
          l-data="{ nodes: [
            { id: 'alpha', label: 'Alpha', children: [
              { id: 'apps', label: 'Apps', children: [
                { id: 'api', label: 'API' },
                { id: 'assets', label: 'Assets' }
              ] },
              { id: 'archive', label: 'Archive', children: [
                { id: 'archive-file', label: 'Archive file' }
              ] }
            ] },
            { id: 'beta', label: 'Beta', children: [
              { id: 'build', label: 'Build', children: [
                { id: 'bundle', label: 'Bundle' }
              ] }
            ] },
            { id: 'charlie', label: 'Charlie', children: [
              { id: 'config', label: 'Config', children: [
                { id: 'codex', label: 'Codex' }
              ] }
            ] }
          ] }">
        <template l-for="node in nodes" l-key="node.id">
          <li data-part="item" role="treeitem" tabindex="-1" aria-selected="false"
              aria-expanded="false" :data-value="node.id">
            <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span><span l-text="node.label"></span></span>
            <ul data-part="group" role="group" hidden>
              <template l-for="child in node.children" l-key="child.id">
                <li data-part="item" role="treeitem" tabindex="-1" aria-selected="false"
                    aria-expanded="false" :data-value="child.id">
                  <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span><span l-text="child.label"></span></span>
                  <ul data-part="group" role="group" hidden>
                    <template l-for="leaf in child.children" l-key="leaf.id">
                      <li data-part="item" role="treeitem" tabindex="-1" aria-selected="false"
                          :data-value="leaf.id">
                        <span data-part="label"><span data-part="toggle" aria-hidden="true">›</span><span l-text="leaf.label"></span></span>
                      </li>
                    </template>
                  </ul>
                </li>
              </template>
            </ul>
          </li>
        </template>
      </ul>
    `;

    const root = host.querySelector("#reactive-tree") as HTMLElement & {
      _faqirTreeView: any;
      __faqirScope: { nodes: any[] };
    };

    // Match bootstrap ordering exactly: the controller sees an empty l-for
    // root first, initTree renders keyed nodes, and the idempotent second call
    // performs the synchronous post-render refresh.
    const api = createTreeView(root);
    expect(root.querySelectorAll("[data-part='item']")).toHaveLength(0);
    Faqir.initTree(root, null);
    expect(createTreeView(root)).toBe(api);
    await tick();

    expect(api).toBeDefined();
    expect(root.querySelectorAll("template[l-for]")).toHaveLength(0);
    expect(root.querySelectorAll("[data-part='item']")).toHaveLength(12);
    expect(root.querySelectorAll("[data-part='item'][tabindex='0']")).toHaveLength(1);

    const alpha = byValue(root, "alpha");
    const apps = byValue(root, "apps");
    const apiLeaf = byValue(root, "api");
    const archive = byValue(root, "archive");
    expect(alpha.getAttribute("aria-level")).toBe("1");
    expect(apps.getAttribute("aria-level")).toBe("2");
    expect(apiLeaf.getAttribute("aria-level")).toBe("3");

    api.expand("alpha");
    api.expand("apps");
    api.select("api");
    expect(alpha.getAttribute("aria-expanded")).toBe("true");
    expect(apps.getAttribute("aria-expanded")).toBe("true");
    expect(apiLeaf.getAttribute("aria-selected")).toBe("true");

    const originalNodes = [...root.__faqirScope.nodes];
    root.__faqirScope.nodes = [originalNodes[1], originalNodes[0], originalNodes[2]];
    await tick();

    expect(directValues(root)).toEqual(["beta", "alpha", "charlie"]);
    expect(byValue(root, "alpha")).toBe(alpha);
    expect(byValue(root, "apps")).toBe(apps);
    expect(byValue(root, "api")).toBe(apiLeaf);
    expect(alpha.getAttribute("aria-expanded")).toBe("true");
    expect(apps.getAttribute("aria-expanded")).toBe("true");
    expect(apiLeaf.getAttribute("aria-selected")).toBe("true");
    expect(alpha.getAttribute("aria-posinset")).toBe("2");
    expect(alpha.getAttribute("aria-setsize")).toBe("3");

    const alphaData = root.__faqirScope.nodes.find((node) => node.id === "alpha");
    alphaData.children = [alphaData.children[1], alphaData.children[0]];
    await tick();
    // happy-dom loses an ancestor's subtree observation after moving that
    // ancestor. The browser path is observer-driven; refresh() is the explicit
    // deterministic hook for non-browser DOM reconcilers.
    api.refresh();

    const alphaGroup = alpha.querySelector(":scope > [data-part='group']")!;
    expect(directValues(alphaGroup)).toEqual(["archive", "apps"]);
    expect(byValue(root, "archive")).toBe(archive);
    expect(byValue(root, "apps")).toBe(apps);
    expect(archive.getAttribute("aria-posinset")).toBe("1");
    expect(apps.getAttribute("aria-posinset")).toBe("2");
    expect(apiLeaf.getAttribute("aria-selected")).toBe("true");

    // Navigation follows the reconciled DOM order rather than the original arrays.
    const beta = byValue(root, "beta");
    expect(press(beta, "ArrowDown").defaultPrevented).toBe(true);
    expect(alpha.tabIndex).toBe(0);
    press(alpha, "ArrowDown");
    expect(archive.tabIndex).toBe(0);

    root.__faqirScope.nodes.push({
      id: "delta",
      label: "Delta",
      children: [{
        id: "docs",
        label: "Docs",
        children: [{ id: "draft", label: "Draft" }],
      }],
    });
    await tick();
    api.refresh();

    const delta = byValue(root, "delta");
    expect(delta.getAttribute("role")).toBe("treeitem");
    expect(delta.getAttribute("aria-level")).toBe("1");
    expect(delta.getAttribute("aria-posinset")).toBe("4");
    expect(delta.getAttribute("aria-setsize")).toBe("4");
    expect(byValue(root, "draft").getAttribute("aria-level")).toBe("3");
    expect(api.getSelected()).toBe(apiLeaf);

    api.destroy();
    Faqir.destroy(root);
  });
});
