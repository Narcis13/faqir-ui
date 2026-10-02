import { afterEach, describe, expect, it } from "bun:test";
import { createTabs } from "../../registry/recipes/tabs/tabs.js";
import { createAccordion } from "../../registry/recipes/accordion/accordion.js";
import { createDialog } from "../../registry/recipes/dialog/dialog.js";
import { createDrawer } from "../../registry/recipes/drawer/drawer.js";
import { createSheet } from "../../registry/recipes/sheet/sheet.js";
import { createSidebar } from "../../registry/recipes/sidebar/sidebar.js";
import { createContextMenu } from "../../registry/recipes/context-menu/context-menu.js";
import { createDropdown } from "../../registry/recipes/dropdown/dropdown.js";
import { createPopover } from "../../registry/recipes/popover/popover.js";

const Faqir = require("../../registry/core/faqir-core.js");

// Nesting matrix (1.1F-12): one row per outer × inner pair. In every row the
// inner component keeps its own state, ARIA and tabindex, and the outer ignores
// the inner's parts. Each row mounts into a disposable container — never
// `document.body` — and destroys every controller it started.

let box: HTMLElement | null = null;
const apis: { destroy(): void }[] = [];

function mount(html: string): HTMLElement {
  box = document.createElement("div");
  box.innerHTML = html;
  document.body.appendChild(box);
  return box;
}

function start<T extends { destroy(): void }>(api: T): T {
  apis.push(api);
  return api;
}

const q = <T extends Element = HTMLElement>(sel: string) => box!.querySelector(sel) as unknown as T;
const key = (el: Element, k: string) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};

afterEach(() => {
  while (apis.length) apis.pop()!.destroy();
  if (box) {
    Faqir.destroy(box);
    box.remove();
    box = null;
  }
});

const dropdown = (id: string) => `
  <div data-ui="dropdown" data-state="closed" id="${id}">
    <button data-part="trigger" aria-haspopup="true" aria-expanded="false">More</button>
    <div data-part="menu" role="menu" hidden>
      <button data-part="item" role="menuitem">Edit</button>
    </div>
  </div>`;

describe("nesting matrix", () => {
  it("tabs ⊃ collapsible: the summary is not a tab, End stops at the last tab", () => {
    mount(`
      <div data-ui="tabs" id="outer">
        <div data-part="list" role="tablist">
          <button data-part="trigger" role="tab" id="t1" aria-selected="true">One</button>
          <button data-part="trigger" role="tab" id="t2" aria-selected="false" tabindex="-1">Two</button>
        </div>
        <div data-part="panel" role="tabpanel" id="p1">
          <details data-ui="collapsible">
            <summary data-part="trigger" id="sum">More</summary>
            <div data-part="content">Body</div>
          </details>
        </div>
        <div data-part="panel" role="tabpanel" id="p2" hidden>Two</div>
      </div>`);
    const tabs = start(createTabs(q("#outer")));

    key(q("#t1"), "End");
    expect(document.activeElement).toBe(q("#t2"));
    expect(tabs.getActiveIndex()).toBe(1);
    expect(q("#p2").hidden).toBe(false);
    expect(q("#p1").hidden).toBe(true);

    // The summary keeps its own state: no tab ARIA, no roving tabindex.
    const summary = q("#sum");
    expect(summary.hasAttribute("aria-selected")).toBe(false);
    expect(summary.hasAttribute("tabindex")).toBe(false);

    tabs.activate(2); // there is no third tab
    expect(tabs.getActiveIndex()).toBe(1);
  });

  it("tabs ⊃ tabs: the outer pairs its own triggers and panels, the inner is untouched", () => {
    mount(`
      <div data-ui="tabs" id="outer">
        <div data-part="list" role="tablist">
          <button data-part="trigger" role="tab" id="o1" aria-selected="true">Outer 1</button>
          <button data-part="trigger" role="tab" id="o2" aria-selected="false" tabindex="-1">Outer 2</button>
        </div>
        <div data-part="panel" role="tabpanel" id="op1">
          <div data-ui="tabs" id="inner">
            <div data-part="list" role="tablist">
              <button data-part="trigger" role="tab" id="i1" aria-selected="true">Inner 1</button>
              <button data-part="trigger" role="tab" id="i2" aria-selected="false" tabindex="-1">Inner 2</button>
            </div>
            <div data-part="panel" role="tabpanel" id="ip1">Inner 1</div>
            <div data-part="panel" role="tabpanel" id="ip2" hidden>Inner 2</div>
          </div>
        </div>
        <div data-part="panel" role="tabpanel" id="op2" hidden>Outer 2</div>
      </div>`);
    const outer = start(createTabs(q("#outer")));
    const inner = start(createTabs(q("#inner")));

    outer.activate(1);
    expect(q("#op2").hidden).toBe(false);
    expect(q("#op1").hidden).toBe(true);
    // The inner's panels and triggers are not the outer's to toggle.
    expect(q("#ip1").hidden).toBe(false);
    expect(q("#ip2").hidden).toBe(true);
    expect(q("#i1").getAttribute("aria-selected")).toBe("true");
    expect(q("#i1").hasAttribute("tabindex")).toBe(false);

    outer.activate(0);
    q("#i2").click();
    expect(inner.getActiveIndex()).toBe(1);
    expect(q("#ip2").hidden).toBe(false);
    expect(outer.getActiveIndex()).toBe(0);
    expect(q("#op1").hidden).toBe(false);
    expect(q("#op2").hidden).toBe(true);
  });

  it("accordion ⊃ dropdown: the dropdown's trigger opens the dropdown, not the section", () => {
    mount(`
      <div data-ui="accordion" data-variant="multiple" id="acc">
        <div data-part="item" data-state="expanded" id="item">
          <button data-part="trigger" aria-expanded="true">Section</button>
          <div data-part="content">${dropdown("dd")}</div>
        </div>
      </div>`);
    start(createAccordion(q("#acc")));
    const dd = start(createDropdown(q("#dd")));
    const ddTrigger = q("#dd [data-part='trigger']");

    ddTrigger.click();
    expect(q("#item").dataset.state).toBe("expanded");
    expect(q("#dd").dataset.state).toBe("open");
    dd.close();

    // Enter on the dropdown trigger is the dropdown's key, not the accordion's.
    key(ddTrigger, "Enter");
    expect(q("#item").dataset.state).toBe("expanded");
    expect(q("#item [data-part='trigger']").getAttribute("aria-expanded")).toBe("true");

    // The section's own trigger still works.
    (q("#item > [data-part='trigger']") as HTMLElement).click();
    expect(q("#item").dataset.state).toBe("collapsed");
  });

  it("accordion ⊃ accordion: one click toggles the inner item once, the outer stays put", () => {
    mount(`
      <div data-ui="accordion" data-variant="single" id="outer">
        <div data-part="item" data-state="expanded" id="o1">
          <button data-part="trigger" aria-expanded="true">Outer 1</button>
          <div data-part="content">
            <div data-ui="accordion" data-variant="multiple" id="inner">
              <div data-part="item" data-state="collapsed" id="i1">
                <button data-part="trigger" id="i1t" aria-expanded="false">Inner 1</button>
                <div data-part="content" hidden>Inner body</div>
              </div>
            </div>
          </div>
        </div>
        <div data-part="item" data-state="collapsed" id="o2">
          <button data-part="trigger" aria-expanded="false">Outer 2</button>
          <div data-part="content" hidden>Outer body</div>
        </div>
      </div>`);
    const outer = start(createAccordion(q("#outer")));
    start(createAccordion(q("#inner")));

    q("#i1t").click();
    expect(q("#i1").dataset.state).toBe("expanded");
    expect(q("#i1t").getAttribute("aria-expanded")).toBe("true");
    expect(q("#o1").dataset.state).toBe("expanded");

    key(q("#i1t"), "Enter");
    expect(q("#i1").dataset.state).toBe("collapsed");
    expect(q("#o1").dataset.state).toBe("expanded");

    // Index 1 is the outer's second item, not the nested one.
    outer.expand(1);
    expect(q("#o2").dataset.state).toBe("expanded");
    expect(q("#o1").dataset.state).toBe("collapsed"); // single mode
    outer.expandAll();
    expect(q("#i1").dataset.state).toBe("collapsed");
  });

  for (const [name, create] of [
    ["dialog", createDialog],
    ["drawer", createDrawer],
    ["sheet", createSheet],
  ] as const) {
    it(`${name} ⊃ popover-with-close: the popover's close closes the popover only`, () => {
      mount(`
        <div data-ui="${name}" data-state="closed" id="outer">
          <div data-part="overlay" hidden></div>
          <div data-part="panel" role="dialog" aria-modal="true" hidden>
            <div data-ui="popover" data-state="closed" id="pop">
              <button data-part="trigger" aria-expanded="false">Info</button>
              <div data-part="content" hidden>
                <p>Details</p>
                <button data-part="close" id="pop-close">✕</button>
              </div>
            </div>
            <button data-part="close" id="own-close">Close</button>
          </div>
        </div>`);
      const outer = start((create as (r: HTMLElement) => any)(q("#outer")));
      const pop = start(createPopover(q("#pop")));

      outer.open();
      pop.open();
      q("#pop-close").click();
      expect(q("#pop").dataset.state).toBe("closed");
      expect(q("#outer").dataset.state).toBe("open");

      q("#own-close").click();
      expect(q("#outer").dataset.state).toBe("closed");
    });

    it(`${name}: the popover's trigger is not taken for the ${name}'s own`, () => {
      // No own trigger (opened through the API): the first trigger in document
      // order is the popover's, and clicking it must not reopen a closing panel.
      mount(`
        <div data-ui="${name}" data-state="closed" id="outer">
          <div data-part="overlay" hidden></div>
          <div data-part="panel" role="dialog" aria-modal="true" hidden>
            <div data-ui="popover" data-state="closed" id="pop">
              <button data-part="trigger" id="pop-trigger" aria-expanded="false">Info</button>
              <div data-part="content" hidden><p>Details</p></div>
            </div>
          </div>
        </div>`);
      const outer = start((create as (r: HTMLElement) => any)(q("#outer")));
      outer.open();
      outer.close();
      q("#pop-trigger").click();
      expect(q("#outer").dataset.state).toBe("closed");
    });
  }

  it("a close button wrapped in layout primitives still closes the dialog", () => {
    mount(`
      <div data-ui="dialog" data-state="closed" id="outer">
        <div data-part="overlay" hidden></div>
        <div data-part="panel" role="dialog" aria-modal="true" hidden>
          <div data-part="footer">
            <div data-ui="stack">
              <div data-ui="cluster">
                <button data-ui="button" data-part="close" id="wrapped">Done</button>
              </div>
            </div>
          </div>
        </div>
      </div>`);
    const dialog = start(createDialog(q("#outer")));
    dialog.open();
    q("#wrapped").click();
    expect(q("#outer").dataset.state).toBe("closed");
  });

  it("alert-dialog: wrapped confirm/cancel are its own; a nested popover's close is not", () => {
    mount(`
      <div data-ui="alert-dialog" data-state="closed" id="outer">
        <div data-part="overlay" hidden></div>
        <div data-part="panel" role="alertdialog" aria-modal="true" hidden>
          <div data-ui="popover" data-state="closed" id="pop">
            <button data-part="trigger" aria-expanded="false">Why?</button>
            <div data-part="content" hidden><button data-part="close" id="pop-close">✕</button></div>
          </div>
          <div data-part="footer">
            <div data-ui="cluster">
              <button data-part="cancel" id="cancel">Cancel</button>
              <button data-part="confirm" id="confirm">Delete</button>
            </div>
          </div>
        </div>
      </div>`);
    const root = q("#outer");
    const dialog = start(createDialog(root));
    const events: string[] = [];
    root.addEventListener("faqir:cancel", () => events.push("cancel"));
    root.addEventListener("faqir:confirm", () => events.push("confirm"));

    dialog.open();
    // Initial focus goes to its own cancel, which a nested close does not outrank.
    expect(document.activeElement).toBe(q("#cancel"));
    q("#pop-close").click();
    expect(root.dataset.state).toBe("open");
    expect(events).toEqual([]);

    q("#confirm").click();
    expect(events).toEqual(["confirm"]);
    expect(root.dataset.state).toBe("closed");
  });

  it("sidebar ⊃ dropdown: the footer dropdown keeps its aria-expanded and does not rail the sidebar", () => {
    mount(`
      <div data-ui="sidebar" data-state="expanded" id="sb">
        <div data-part="overlay" hidden></div>
        <aside data-part="panel" aria-label="Primary">
          <div data-part="header">
            <button data-part="trigger" id="sb-trigger" aria-label="Toggle sidebar" aria-expanded="true">‹</button>
          </div>
          <div data-part="footer">${dropdown("dd")}</div>
        </aside>
      </div>`);
    const sidebar = start(createSidebar(q("#sb")));
    start(createDropdown(q("#dd")));
    const ddTrigger = q("#dd [data-part='trigger']");

    expect(ddTrigger.getAttribute("aria-expanded")).toBe("false");
    ddTrigger.click();
    expect(sidebar.getState()).toBe("expanded");
    expect(q("#dd").dataset.state).toBe("open");
    expect(ddTrigger.getAttribute("aria-expanded")).toBe("true");

    q("#sb-trigger").click();
    expect(sidebar.getState()).toBe("rail");
    expect(q("#sb-trigger").getAttribute("aria-expanded")).toBe("false");
    // The sidebar's render pass leaves the dropdown's own state alone.
    expect(ddTrigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("context-menu target ⊃ dropdown: the context menu opens its own menu", () => {
    mount(`
      <div data-ui="context-menu" data-state="closed" id="cm">
        <div data-part="target" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false">
          Right-click here ${dropdown("dd")}
        </div>
        <div data-part="menu" id="cm-menu" role="menu" hidden>
          <button data-part="item" type="button" role="menuitem" tabindex="-1">Copy</button>
        </div>
      </div>`);
    start(createContextMenu(q("#cm")));
    start(createDropdown(q("#dd")));

    const target = q("#cm > [data-part='target']");
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect(q("#cm").dataset.state).toBe("open");
    expect(q("#cm-menu").hidden).toBe(false);
    expect(q("#dd [data-part='menu']").hidden).toBe(true);
    expect(q("#dd").dataset.state).toBe("closed");
  });
});

describe("nesting in the built engine", () => {
  // The bundled engine carries its own copy of `ownParts` (engine.js §6), so the
  // guard is exercised through the inlined controllers too.
  it("an inlined dialog ignores a nested popover's close, and honours a wrapped one", async () => {
    mount(`
      <div data-ui="dialog" data-state="closed" id="outer">
        <div data-part="overlay" hidden></div>
        <div data-part="panel" role="dialog" aria-modal="true" hidden>
          <div data-ui="popover" data-state="closed" id="pop">
            <button data-part="trigger" aria-expanded="false">Info</button>
            <div data-part="content" hidden><button data-part="close" id="pop-close">✕</button></div>
          </div>
          <div data-ui="cluster"><button data-part="close" id="own-close">Close</button></div>
        </div>
      </div>`);
    Faqir.initTree(box!);
    const root = q("#outer") as any;
    root._faqirDialog.open();
    q("#pop-close").click();
    expect(root.dataset.state).toBe("open");
    q("#own-close").click();
    expect(root.dataset.state).toBe("closed");
  });
});
