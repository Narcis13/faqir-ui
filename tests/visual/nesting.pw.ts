/**
 * Nested components keep their own styles — tasks 1.1F-20 … 1.1F-23
 * (FAQIR-PLAN-1.1-FIXES, entry 5).
 *
 * A component's part rules used to be descendant selectors, so they reached
 * every part of that name below the root: an open collapsible rotated the
 * chevron of the closed one inside it, a collapsible's `<summary
 * data-part="trigger">` in a tabs panel was laid out as a tab. No reference
 * page shows it — a reference page nests nothing — so the fixtures here are
 * synthetic: the smallest nesting that reproduces each case.
 *
 * Every fixture renders the inner component twice, once nested and once
 * standing alone, and asks for the same computed style on both. That is the
 * whole claim: where a component sits does not change how its parts look.
 * (Inherited properties legitimately differ, so each fixture names the
 * properties its component sets itself.)
 *
 * `tests/registry/nesting-css.test.ts` pins the selectors' shape in happy-dom;
 * this file pins what the browser makes of them.
 */

import { test, expect, type Page } from "@playwright/test";
import { frameworkCss } from "./matrix";

interface Fixture {
  name: string;
  /** The nesting. The element under test carries `data-probe`. */
  nested: string;
  /** The inner component alone. The same element carries `data-ref`. */
  alone: string;
  /** Measure a pseudo-element of the probe instead of the probe. */
  pseudo?: string;
  /** Properties the inner component declares for that element. */
  props: readonly string[];
  /**
   * The descendant rule that used to leak, injected after the framework CSS to
   * prove the fixture catches it. Absent for a guard that never failed.
   */
  revert?: string;
}

const collapsible = (attrs: string, mark: string, body = "Closed by default.") =>
  `<details data-ui="collapsible" ${attrs}>
  <summary data-part="trigger" ${mark}>Advanced</summary>
  <div data-part="content">${body}</div>
</details>`;

const progress = (mark: string) =>
  `<div data-ui="progress" role="progressbar" aria-label="Quota" aria-valuenow="40" aria-valuemin="0" aria-valuemax="100">
  <div data-part="track"><div data-part="fill" style="width: 40%"></div></div>
  <span data-part="label" ${mark}>40%</span>
</div>`;

const tabs = (variant: string, id: string, mark: string, panel: string) =>
  `<div data-ui="tabs" data-variant="${variant}">
  <div data-part="list" role="tablist">
    <button data-part="trigger" role="tab" id="${id}-t1" aria-controls="${id}-p1" aria-selected="true" ${mark}>General</button>
    <button data-part="trigger" role="tab" id="${id}-t2" aria-controls="${id}-p2" aria-selected="false" tabindex="-1">Billing</button>
  </div>
  <div data-part="panel" role="tabpanel" id="${id}-p1" aria-labelledby="${id}-t1">${panel}</div>
  <div data-part="panel" role="tabpanel" id="${id}-p2" aria-labelledby="${id}-t2" hidden></div>
</div>`;

const accordion = (id: string, state: "expanded" | "collapsed", mark: string, body: string) =>
  `<div data-ui="accordion" data-variant="multiple">
  <div data-part="item" data-state="${state}">
    <button data-part="trigger" id="${id}-t" aria-expanded="${state === "expanded"}" aria-controls="${id}-c">
      <span>Section</span><span data-part="icon" aria-hidden="true" ${mark}>&#x25BE;</span>
    </button>
    <div data-part="content" id="${id}-c" role="region" aria-labelledby="${id}-t"${state === "collapsed" ? " hidden" : ""}>${body}</div>
  </div>
</div>`;

/** `mark` goes on the icon, or on the title when `on` says so. */
const callout = (variant: string, mark: string, body = "", on: "icon" | "title" = "icon") =>
  `<div data-ui="callout" data-variant="${variant}" role="note">
  <span data-part="icon" ${on === "icon" ? mark : ""}>i</span>
  <div data-part="content">
    <strong data-part="title" ${on === "title" ? mark : ""}>Heads up</strong>
    <p>One paragraph.</p>
    ${body}
  </div>
</div>`;

const descriptionList = (attrs: string, mark: string, details: string) =>
  `<dl data-ui="description-list" ${attrs}>
  <dt data-part="term" ${mark}>Owner</dt>
  <dd data-part="details">${details}</dd>
</dl>`;

// ── 1.1F-21: overlays and menus ──

const CLOSE = `<button data-part="close" aria-label="Close">&#x2715;</button>`;

/** An open dialog; `sections` is the panel's content, header first. */
const dialog = (sections: string) =>
  `<div data-ui="dialog" data-state="open">
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-label="Settings" data-size="md">${sections}</div>
</div>`;

const header = (inner: string) => `<div data-part="header">${inner}</div>`;
const dialogBody = (inner: string) => `<div data-part="body">${inner}</div>`;

const popover = (mark: string) =>
  `<div data-ui="popover" data-state="open">
  <button data-part="trigger" aria-expanded="true">Info</button>
  <div data-part="content" data-variant="bottom" role="dialog" aria-label="Info">
    <button data-part="close" aria-label="Close" ${mark}>&#x2715;</button>
    <p>Details.</p>
  </div>
</div>`;

const card = (on: "header" | "body", mark: string) =>
  `<div data-ui="card">
  <div data-part="header" ${on === "header" ? mark : ""}><h3 data-part="title">Plan</h3></div>
  <div data-part="body" ${on === "body" ? mark : ""}><p>Team, billed yearly.</p></div>
</div>`;

const dropdown = (on: "trigger" | "menu" | "item", mark: string) =>
  `<div data-ui="dropdown" data-state="open">
  <button data-part="trigger" aria-haspopup="true" aria-expanded="true" ${on === "trigger" ? mark : ""}>Account</button>
  <div data-part="menu" role="menu" ${on === "menu" ? mark : ""}>
    <button data-part="item" role="menuitem" ${on === "item" ? mark : ""}>Sign out</button>
  </div>
</div>`;

const sidebar = (footer: string, outside = "", head = "") =>
  `<div data-ui="sidebar" data-state="expanded">${outside}
  <aside data-part="panel" aria-label="Main">
    <div data-part="header">${head}</div>
    <nav data-part="nav" aria-label="Sections"><a data-part="item" href="#"><span data-part="label">Home</span></a></nav>
    <div data-part="footer">${footer}</div>
  </aside>
</div>`;

const toggle = (mark: string) => `<button data-part="trigger" aria-label="Toggle sidebar" aria-expanded="true" ${mark}>&#x2039;</button>`;

const menubar = (grouped: boolean, mark: string) => {
  const pair = `<button type="button" data-part="trigger" id="mb-${grouped}" role="menuitem" aria-haspopup="menu" aria-expanded="true" aria-controls="mb-${grouped}-m">File</button>
    <div data-part="submenu" id="mb-${grouped}-m" role="menu" aria-labelledby="mb-${grouped}">
      <button type="button" data-part="item" role="menuitem" tabindex="-1" ${mark}>New</button>
    </div>`;
  return `<div data-ui="menubar" data-state="open" role="menubar" aria-label="App">
  ${grouped ? `<div data-part="group" role="none">${pair}</div>` : pair}
</div>`;
};

// ── 1.1F-22: table ──

/** A table: `attrs` on the root, `rows` its body rows, `before` ahead of the <table>. */
const table = (attrs: string, rows: string, before = "") =>
  `<div data-ui="table" ${attrs}>${before}
  <table data-part="table">
    <thead data-part="thead"><tr data-part="tr"><th data-part="th" scope="col">Line</th><th data-part="th" scope="col">Qty</th></tr></thead>
    <tbody data-part="tbody">${rows}</tbody>
  </table>
</div>`;

const row = (a: string, b: string, attrs = "") =>
  `<tr data-part="tr" ${attrs}><td data-part="td">${a}</td><td data-part="td">${b}</td></tr>`;

/** Two lines; `mark` goes on the second line's first cell (an even row), `cell` on both its cells. */
const lines = (mark: string, cell = "", attrs = "") =>
  table(attrs, row("Widget", "2") + `<tr data-part="tr"><td data-part="td" ${cell} ${mark}>Gadget</td><td data-part="td" ${cell}>1</td></tr>`);

/** An outer table whose first row opens a detail row holding `inner`. */
const master = (attrs: string, inner: string, rowAttrs = "") =>
  table(
    attrs,
    row("INV-1", "3", rowAttrs) +
      `<tr data-part="detail-row"><td data-part="td" colspan="2">${inner}</td></tr>` +
      row("INV-2", "1") +
      row("INV-3", "4"),
  );

// ── 1.1F-23: the long tail ──

const radioGroup = (mark: string) =>
  `<div data-ui="radio-group" role="radiogroup" aria-label="Plan">
  <label data-ui="radio-label"><input data-ui="radio" type="radio" name="plan-${mark ? "p" : "r"}" value="free"><span data-part="label" ${mark}>Free</span></label>
</div>`;

const fieldGroup = (inner: string) =>
  `<div data-ui="field-group" data-state="invalid">
  <span data-part="label">Plan</span>
  <div data-part="input">${inner}</div>
  <p data-part="error">Pick a plan.</p>
</div>`;

const iconButton = (mark: string) =>
  `<button data-ui="button" data-variant="ghost" data-size="sm" type="button"><span data-part="icon" aria-hidden="true" ${mark}>&#x2605;</span>Star</button>`;

const toastWith = (inner: string) =>
  `<div data-ui="toast" data-part="container" data-variant="top-right" role="region" aria-label="Notifications">
  <div data-part="toast" data-variant="default" data-state="visible" role="status">
    <span data-part="icon" aria-hidden="true">i</span><span data-part="message">Saved.</span>${inner}
  </div>
</div>`;

const chip = (mark: string) => `<span data-ui="chip"><span data-part="label" ${mark}>new</span></span>`;

const treeWith = (label: string) =>
  `<ul data-ui="tree-view" role="tree" aria-label="Files">
  <li data-part="item" role="treeitem" aria-level="1" aria-selected="false" tabindex="0"><span data-part="label">Projects ${label}</span></li>
</ul>`;

/** A toggle-group item; `extra` goes inside it, after its own (unchecked) control. */
const toggleItem = (mark: string, extra = "") =>
  `<div data-ui="toggle-group" data-mode="multiple" role="group" aria-label="Format">
  <label data-part="item" ${mark}><input data-part="control" type="checkbox" value="b"><span data-part="label">Bold</span>${extra}</label>
</div>`;

/** A command palette; `list` is the list's content. Open, so its panel lays out. */
const palette = (list: string) =>
  `<div data-ui="command-palette" data-state="open">
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-label="Commands">
    <input data-part="search" type="text" aria-label="Search commands">
    <div data-part="list" role="listbox">${list}</div>
  </div>
</div>`;

const paletteItem = (mark: string) => `<div data-part="item" role="option" ${mark}><span data-part="item-label">Open file</span></div>`;

const FIXTURES: readonly Fixture[] = [
  {
    name: "an open collapsible holding a closed one keeps the inner chevron unrotated",
    nested: collapsible("open", "", collapsible("", "data-probe")),
    alone: collapsible("", "data-ref"),
    pseudo: "::after",
    props: ["transform"],
    revert: `[data-ui="collapsible"][open] [data-part="trigger"]::after { transform: rotate(-135deg); }`,
  },
  {
    name: "a collapsible inside a tabs panel is not styled as a tab",
    nested: tabs("underline", "outer", "", collapsible("", "data-probe")),
    alone: collapsible("", "data-ref"),
    props: [
      "display",
      "justify-content",
      "padding-top",
      "padding-left",
      "color",
      "font-size",
      "white-space",
      "border-bottom-width",
      "margin-bottom",
    ],
    revert: `[data-ui="tabs"] [data-part="trigger"] { display: inline-flex; justify-content: center; padding: var(--space-2) var(--space-4); color: var(--color-fg-muted); font-size: var(--text-sm); white-space: nowrap; }`,
  },
  {
    // A guard: description-list has no `label` part, so this never failed. It
    // is the layout the downstream report asked about, and it stays covered.
    name: "a progress inside a description-list <dd> keeps its own label",
    nested: descriptionList('data-variant="horizontal" data-size="sm"', "", progress("data-probe")),
    alone: progress("data-ref"),
    props: ["font-size", "font-weight", "color", "padding-right", "margin-top", "text-align", "flex-shrink"],
  },
  {
    name: "a progress inside a small key-value list keeps its own label",
    nested: `<dl data-ui="key-value" data-size="sm">
  <dt data-part="label">Quota</dt>
  <dd data-part="value">${progress("data-probe")}</dd>
</dl>`,
    alone: progress("data-ref"),
    props: ["font-size", "font-weight", "color", "padding-right", "margin-top", "text-align", "flex-shrink"],
    revert: `[data-ui="key-value"][data-size="sm"] [data-part="label"] { font-size: var(--text-xs); }`,
  },
  {
    name: "an accordion in an expanded section keeps its collapsed chevron unrotated",
    nested: accordion("outer", "expanded", "", accordion("inner", "collapsed", "data-probe", "…")),
    alone: accordion("alone", "collapsed", "data-ref", "…"),
    props: ["transform"],
    revert: `[data-ui="accordion"] [data-part="item"][data-state="expanded"] [data-part="icon"] { transform: rotate(180deg); }`,
  },
  {
    name: "a callout inside a warning callout keeps its own icon colour",
    nested: callout("warning", "", callout("info", "data-probe")),
    alone: callout("info", "data-ref"),
    props: ["color", "font-size", "padding-top"],
    revert: `[data-ui="callout"][data-variant="warning"] [data-part="icon"] { color: var(--color-warning); }`,
  },
  {
    name: "underline tabs inside a pill tabs panel keep their own variant",
    nested: tabs("pill", "outer", "", tabs("underline", "inner", "data-probe", "…")),
    alone: tabs("underline", "alone", "data-ref", "…"),
    props: [
      "border-top-left-radius",
      "padding-top",
      "padding-left",
      "background-color",
      "box-shadow",
      "color",
      "border-bottom-width",
    ],
    revert: `[data-ui="tabs"][data-variant="pill"] [data-part="trigger"] { border-radius: var(--radius-md); padding: var(--space-1) var(--space-3); }`,
  },
  {
    name: "a description-list inside a small one keeps its own size",
    nested: descriptionList('data-size="sm"', "", descriptionList("", "data-probe", "Platform")),
    alone: descriptionList("", "data-ref", "Platform"),
    props: ["font-size", "font-weight", "color", "margin-bottom"],
    revert: `[data-ui="description-list"][data-size="sm"] [data-part="term"] { font-size: var(--text-xs); }`,
  },
  {
    name: "a callout inside an empty-state keeps its own title",
    nested: `<div data-ui="empty-state">
  <h3 data-part="title">No runs yet</h3>
  <p data-part="description">Nothing has been imported.</p>
  ${callout("info", "data-probe", "", "title")}
</div>`,
    alone: callout("info", "data-ref", "", "title"),
    props: ["font-size", "font-weight", "font-family", "color", "display", "margin-bottom"],
    revert: `[data-ui="empty-state"] [data-part="title"] { font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-fg); }`,
  },
  // ── 1.1F-21: overlays and menus ──
  {
    name: "a popover inside a dialog keeps its own close button",
    nested: dialog(header(`<h2 data-part="title">Settings</h2>${CLOSE}`) + dialogBody(popover("data-probe"))),
    alone: popover("data-ref"),
    props: ["width", "height", "font-size", "position", "top"],
    revert: `[data-ui="dialog"] [data-part="close"]:not([data-ui]) { width: 32px; height: 32px; font-size: var(--text-base); }`,
  },
  {
    name: "a card inside a dialog keeps its own header",
    nested: dialog(header(`<h2 data-part="title">Settings</h2>${CLOSE}`) + dialogBody(card("header", "data-probe"))),
    alone: card("header", "data-ref"),
    props: ["display", "justify-content", "align-items", "padding-top", "padding-left", "padding-bottom"],
    revert: `[data-ui="dialog"] [data-part="header"] { display: flex; align-items: center; justify-content: space-between; padding: var(--space-6); padding-bottom: 0; }`,
  },
  {
    name: "a dropdown inside the sidebar footer keeps its item styles",
    nested: sidebar(dropdown("item", "data-probe")),
    alone: dropdown("item", "data-ref"),
    props: ["display", "gap", "padding-top", "padding-left", "color", "font-size", "font-weight", "border-top-left-radius"],
    revert: `[data-ui="sidebar"] [data-part="item"] { display: flex; gap: var(--space-3); padding: var(--space-2) var(--space-3); color: var(--color-fg-muted); font-size: var(--text-sm); font-weight: var(--weight-medium); }`,
  },
  {
    name: "a dropdown inside the sidebar footer keeps its own trigger",
    nested: sidebar(dropdown("trigger", "data-probe")),
    alone: dropdown("trigger", "data-ref"),
    props: ["width", "height", "padding-left", "border-top-width", "background-color"],
    revert: `[data-ui="sidebar"] [data-part="trigger"] { inline-size: 2rem; block-size: 2rem; padding: 0; border: none; background: transparent; }`,
  },
  {
    // The trigger of a tooltip may be a component; its own content is not the tip.
    name: "a collapsible used as a tooltip's trigger keeps its own content",
    nested: `<div data-ui="tooltip" data-state="hidden">
  <details data-ui="collapsible" data-part="trigger" open aria-describedby="tip">
    <summary data-part="trigger">Advanced</summary>
    <div data-part="content" data-probe>More detail.</div>
  </details>
  <div data-part="content" id="tip" role="tooltip" hidden>Tip</div>
</div>`,
    alone: `<details data-ui="collapsible" open>
  <summary data-part="trigger">Advanced</summary>
  <div data-part="content" data-ref>More detail.</div>
</details>`,
    props: ["position", "opacity", "white-space", "font-size", "pointer-events"],
    revert: `[data-ui="tooltip"] [data-part="content"] { position: absolute; opacity: 0; white-space: nowrap; font-size: var(--text-xs); pointer-events: none; }`,
  },
  {
    // A guard: the old rule weighed the same as dropdown's, which comes later in
    // the bundle and won the tie. Now it is out of reach, whatever the order.
    name: "a dropdown inside a context-menu target keeps its own menu",
    nested: `<div data-ui="context-menu" data-state="closed">
  <div data-part="target" tabindex="0">${dropdown("menu", "data-probe")}</div>
  <div data-part="menu" role="menu" aria-label="Row" hidden><button data-part="item" role="menuitem">Copy</button></div>
</div>`,
    alone: dropdown("menu", "data-ref"),
    props: ["position", "min-width", "padding-top", "border-top-left-radius"],
    revert: `[data-ui="context-menu"] [data-part="menu"] { position: fixed; min-inline-size: calc(var(--space-20) * 2); }`,
  },
  // ── 1.1F-22: table ──
  {
    name: "a table in the detail row of a striped table does not take its stripes",
    nested: master('data-variant="striped"', lines("data-probe")),
    alone: lines("data-ref"),
    props: ["background-color"],
    revert: `[data-ui="table"][data-variant="striped"] [data-part="tbody"] [data-part="tr"]:not([data-stripe]):nth-child(even):not([data-selected]) [data-part="td"] { background: var(--stripe-bg); }`,
  },
  {
    // A detail row is not a data row, so the table sits in a cell of a selected one here.
    name: "a table in a selected row's cell does not take the selection",
    nested: table("data-selectable", `<tr data-part="tr" data-selected><td data-part="td" colspan="2">${lines("data-probe")}</td></tr>`),
    alone: lines("data-ref"),
    props: ["background-color"],
    revert: `[data-ui="table"] [data-part="tr"][data-selected] [data-part="td"] { background: var(--color-primary-subtle); }`,
  },
  {
    name: "a table in a pinned row's cell does not stick with it",
    nested: table("data-sticky-header", `<tr data-part="tr" data-pin="top"><td data-part="td" colspan="2">${lines("data-probe")}</td></tr>`),
    alone: lines("data-ref"),
    props: ["position", "z-index", "background-color"],
    revert: `[data-ui="table"] [data-part="tbody"] [data-part="tr"][data-pin="top"] [data-part="td"] { position: sticky; z-index: 2; background: var(--color-bg-subtle); }`,
  },
  {
    name: "a table in the detail row of a stacked table keeps its rows and pinned column",
    nested: master('data-responsive="stack" data-stacked', lines("data-probe", 'data-pin="start"')),
    alone: lines("data-ref", 'data-pin="start"'),
    props: ["display", "position", "border-bottom-width"],
    revert: `[data-ui="table"][data-stacked] [data-part="td"] { display: flex; } [data-ui="table"][data-stacked] [data-pin] { position: static; }`,
  },
  {
    // The outer table measures itself as a container; the inner one is not responsive.
    name: "a table in the detail row of a responsive table keeps its prioritised column",
    nested: `<div style="inline-size: 20rem">${master('data-responsive="scroll"', lines("data-probe", 'data-hide-below="lg"'))}</div>`,
    alone: lines("data-ref", 'data-hide-below="lg"'),
    props: ["display"],
    revert: `[data-ui="table"][data-responsive] [data-hide-below] { display: none; }`,
  },
  {
    name: "a stack in a table cell is not text-aligned by its data-align",
    nested: table("", row(`<span data-ui="stack" data-align="center" data-probe><span>Alice</span><span>admin</span></span>`, "2")),
    alone: `<div><span data-ui="stack" data-align="center" data-ref><span>Alice</span><span>admin</span></span></div>`,
    props: ["text-align"],
    revert: `[data-ui="table"] [data-align="center"] { text-align: center; }`,
  },
  // ── shapes that are not direct children, and must keep working ──
  {
    // HTML lets a <dl> wrap each pair in a <div>; the child chain allows it.
    name: "a description-list pair grouped in a <div> is styled like an ungrouped one",
    nested: `<dl data-ui="description-list" data-divided data-size="lg">
  <div><dt data-part="term" data-probe>Owner</dt><dd data-part="details">Platform</dd></div>
  <div><dt data-part="term">Region</dt><dd data-part="details">eu-west-1</dd></div>
</dl>`,
    alone: descriptionList('data-divided data-size="lg"', "data-ref", "Platform"),
    props: ["font-size", "font-weight", "color", "margin-bottom", "padding-top"],
  },
  {
    name: "a key-value pair grouped in a <div> is styled like an ungrouped one",
    nested: `<dl data-ui="key-value" data-variant="inline" data-size="sm">
  <div><dt data-part="label" data-probe>Status</dt><dd data-part="value">Active</dd></div>
</dl>`,
    alone: `<dl data-ui="key-value" data-variant="inline" data-size="sm">
  <dt data-part="label" data-ref>Status</dt><dd data-part="value">Active</dd>
</dl>`,
    props: ["font-size", "font-weight", "color", "margin-top", "flex-shrink"],
  },
  {
    // The APG accordion wraps each header button in a heading.
    name: "an accordion trigger wrapped in a heading is styled like a bare one",
    nested: `<div data-ui="accordion" data-variant="multiple">
  <div data-part="item" data-state="collapsed">
    <h3 style="margin: 0; font: inherit"><button data-part="trigger" id="h-t" aria-expanded="false" aria-controls="h-c" data-probe>
      <span>Section</span><span data-part="icon" aria-hidden="true">&#x25BE;</span>
    </button></h3>
    <div data-part="content" id="h-c" role="region" aria-labelledby="h-t" hidden>…</div>
  </div>
</div>`,
    alone: `<div data-ui="accordion" data-variant="multiple">
  <div data-part="item" data-state="collapsed">
    <button data-part="trigger" id="b-t" aria-expanded="false" aria-controls="b-c" data-ref>
      <span>Section</span><span data-part="icon" aria-hidden="true">&#x25BE;</span>
    </button>
    <div data-part="content" id="b-c" role="region" aria-labelledby="b-t" hidden>…</div>
  </div>
</div>`,
    props: [
      "display",
      "justify-content",
      "padding-top",
      "padding-left",
      "font-size",
      "font-weight",
      "border-top-width",
      "background-color",
      "cursor",
    ],
  },  {
    // A form dialog: the sections sit in a <form> that is the panel's child.
    name: "a dialog header inside a <form> is styled like a bare one",
    nested: dialog(`<form>${header(`<h2 data-part="title">Edit</h2>${CLOSE}`).replace('data-part="header"', 'data-part="header" data-probe')}${dialogBody("…")}</form>`),
    alone: dialog(header(`<h2 data-part="title">Edit</h2>${CLOSE}`).replace('data-part="header"', 'data-part="header" data-ref') + dialogBody("…")),
    props: ["display", "justify-content", "align-items", "padding-top", "padding-left", "padding-bottom"],
  },
  {
    // An eyebrow above the title needs a column inside the header's row.
    name: "a dialog title in a stack inside the header is styled like a bare one",
    nested: dialog(header(`<div data-ui="stack" data-gap="1"><span>In Backlog</span><h2 data-part="title" data-probe>Fix login</h2></div>${CLOSE}`)),
    alone: dialog(header(`<h2 data-part="title" data-ref>Fix login</h2>${CLOSE}`)),
    props: ["font-size", "font-weight", "font-family", "margin-top", "margin-bottom", "color"],
  },
  {
    name: "a dialog close button in a cluster inside the header is styled like a bare one",
    nested: dialog(header(`<h2 data-part="title">Settings</h2><div data-ui="cluster"><button data-ui="button" data-variant="ghost">Help</button>${CLOSE.replace("<button", "<button data-probe")}</div>`)),
    alone: dialog(header(`<h2 data-part="title">Settings</h2>${CLOSE.replace("<button", "<button data-ref")}`)),
    props: ["width", "height", "padding-left", "border-top-width", "background-color", "font-size"],
  },
  {
    // A drawer that is off-canvas is opened from outside its panel.
    name: "a sidebar trigger outside the panel is styled like one in its header",
    nested: sidebar("", toggle("data-probe")),
    alone: sidebar("", "", toggle("data-ref")),
    props: ["width", "height", "padding-left", "border-top-width", "background-color", "color"],
  },
  {
    // The menubar's group is optional.
    name: "a menubar item without a group is styled like a grouped one",
    nested: menubar(false, "data-probe"),
    alone: menubar(true, "data-ref"),
    props: ["display", "padding-top", "padding-left", "font-size", "width", "white-space"],
  },
  {
    // The quick filter may sit in a toolbar inside the root.
    name: "a table quick filter in a toolbar is styled like a bare one",
    nested: table("", row("Widget", "2"), `<div data-ui="cluster"><input data-part="filter" aria-label="Filter" data-probe></div>`),
    alone: table("", row("Widget", "2"), `<input data-part="filter" aria-label="Filter" data-ref>`),
    props: ["width", "padding-top", "padding-left", "font-size", "border-top-width", "border-top-left-radius"],
  },
  // ── 1.1F-23 ──
  {
    // The shape @faqir-ui/forms renders: options in the field-group's input slot.
    name: "a radio option in an invalid field-group keeps its own label",
    nested: fieldGroup(radioGroup("data-probe")),
    alone: radioGroup("data-ref"),
    props: ["font-size", "font-weight", "color", "line-height"],
    revert: `[data-ui="field-group"] [data-part="label"] { font-weight: var(--field-label-weight); line-height: 1.4; }
      [data-ui="field-group"][data-state="invalid"] [data-part="label"] { color: var(--field-error-color); }`,
  },
  {
    name: "a progress bar in a stat keeps its own label",
    nested: `<div data-ui="stat"><span data-part="label">Quota</span><span data-part="value">40%</span>${progress("data-probe")}</div>`,
    alone: progress("data-ref"),
    props: ["font-size", "font-weight", "color", "line-height", "order"],
    revert: `[data-ui="stat"] [data-part="label"] { font-size: var(--stat-label-size); font-weight: var(--weight-semibold); color: var(--stat-label-color); line-height: 1.2; order: -1; }`,
  },
  {
    name: "a button in a toast keeps its own icon",
    nested: toastWith(iconButton("data-probe")),
    alone: iconButton("data-ref"),
    props: ["width", "height", "color", "font-size"],
    revert: `[data-ui="toast"] [data-part="icon"] { width: 20px; height: 20px; font-size: var(--text-sm); color: var(--color-fg-muted); }`,
  },
  {
    name: "a chip in a tree item's label keeps its own label",
    nested: treeWith(chip("data-probe")),
    alone: chip("data-ref"),
    props: ["display", "padding-left", "padding-top", "border-top-left-radius"],
    revert: `[data-ui="tree-view"] [data-part="label"] { display: flex; padding-block: var(--space-1); padding-inline: var(--space-2); border-radius: var(--radius-md); }`,
  },
  {
    // :has([data-part="control"]:checked) asked about every control below the item.
    name: "a toggle-group item is not on because a nested component's control is checked",
    nested: toggleItem("data-probe", `<span data-ui="nested"><input data-part="control" type="checkbox" checked aria-label="Other"></span>`),
    alone: toggleItem("data-ref"),
    props: ["background-color", "color"],
    revert: `[data-ui="toggle-group"] > [data-part="item"]:has([data-part="control"]:checked) { background: var(--color-primary-subtle); color: var(--color-primary); }`,
  },
  {
    // Groups are optional in a command palette.
    name: "a command-palette item without a group is styled like a grouped one",
    nested: palette(paletteItem("data-probe")),
    alone: palette(`<div data-part="group" role="group">${paletteItem("data-ref")}</div>`),
    props: ["display", "padding-top", "padding-left", "font-size", "border-top-left-radius", "cursor"],
  },
  {
    // The header is optional in a calendar.
    name: "a calendar's month navigation without a header is styled like one in it",
    nested: `<div data-ui="calendar"><button data-part="nav-prev" type="button" aria-label="Previous month" data-probe>&lsaquo;</button><span data-part="month-label">July</span></div>`,
    alone: `<div data-ui="calendar"><div data-part="header"><button data-part="nav-prev" type="button" aria-label="Previous month" data-ref>&lsaquo;</button><span data-part="month-label">July</span></div></div>`,
    props: ["width", "height", "border-top-width", "border-top-left-radius", "font-size", "cursor"],
  },
];

/** The shipped stylesheet around the two renders, with an optional override after it. */
function documentFor(nested: string, alone: string, css = ""): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>nesting</title>
<style>${frameworkCss()}</style>
<style>${css}</style>
</head>
<body>
<main>
<section>${nested}</section>
<section>${alone}</section>
</main>
</body>
</html>`;
}

async function mount(page: Page, html: string): Promise<void> {
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

type Styles = Record<string, string>;

/** The named properties of the nested element and of the one standing alone. */
function measure(
  page: Page,
  props: readonly string[],
  pseudo: string | null = null,
): Promise<{ nested: Styles; alone: Styles }> {
  return page.evaluate(
    ({ pseudo, props }) => {
      const read = (attr: string): Record<string, string> => {
        const el = document.querySelector(`[${attr}]`);
        if (!el) throw new Error(`no [${attr}] in the fixture`);
        const style = getComputedStyle(el, pseudo);
        return Object.fromEntries(props.map((p) => [p, style.getPropertyValue(p)]));
      };
      return { nested: read("data-probe"), alone: read("data-ref") };
    },
    { pseudo, props: [...props] },
  );
}

// ── the wall ─────────────────────────────────────────────────────────────────

for (const fixture of FIXTURES) {
  test(fixture.name, async ({ page }) => {
    await mount(page, documentFor(fixture.nested, fixture.alone));
    const { nested, alone } = await measure(page, fixture.props, fixture.pseudo);
    expect(nested).toEqual(alone);
  });
}

// The conversion must not cost a component its own state rule: the fixtures
// above would pass just as well if no chevron ever rotated.
test.describe("the outer component's own state rule still applies", () => {
  test("an open collapsible rotates its own chevron", async ({ page }) => {
    await mount(page, documentFor(collapsible("open", "data-probe"), collapsible("", "data-ref")));
    const { nested, alone } = await measure(page, ["transform"], "::after");
    expect(nested.transform).not.toBe(alone.transform);
  });

  test("an expanded accordion section rotates its own chevron", async ({ page }) => {
    await mount(
      page,
      documentFor(
        accordion("open", "expanded", "data-probe", "…"),
        accordion("shut", "collapsed", "data-ref", "…"),
      ),
    );
    const { nested, alone } = await measure(page, ["transform"]);
    expect(nested.transform).not.toBe(alone.transform);
  });

  test("a striped table stripes its own even rows", async ({ page }) => {
    await mount(page, documentFor(lines("data-probe", "", 'data-variant="striped"'), lines("data-ref")));
    const { nested, alone } = await measure(page, ["background-color"]);
    expect(nested["background-color"]).not.toBe(alone["background-color"]);
  });
});

// ── the wall must bite ───────────────────────────────────────────────────────

test.describe("each leak is caught when its descendant rule comes back", () => {
  for (const fixture of FIXTURES) {
    if (!fixture.revert) continue;
    test(fixture.name, async ({ page }) => {
      await mount(page, documentFor(fixture.nested, fixture.alone, fixture.revert));
      const { nested, alone } = await measure(page, fixture.props, fixture.pseudo);
      expect(nested, "the descendant rule should have restyled the nested part").not.toEqual(alone);
    });
  }
});
