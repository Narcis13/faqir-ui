// Nesting, CSS — tasks 1.1F-20 … 1.1F-23 (FAQIR-PLAN-1.1-FIXES, entry 5).
//
// `[data-ui="tabs"] [data-part="trigger"]` is a descendant selector, so it
// styles every trigger below the tabs root: a collapsible's `<summary
// data-part="trigger">` in a panel became a tab, an open collapsible rotated the
// chevron of the closed one inside it, a `sm` key-value list shrank the label of
// the progress bar in its `<dd>`. 1.1F-12/13 fixed the controllers; these tasks
// fix the stylesheets, one batch of components at a time.
//
// The strategy is the same for every file. A part is reached by child
// combinators only, and the hops in between go in `:where()` so the rule keeps
// the specificity it had — pattern overrides (`settings-page` restyles tabs)
// rely on today's ordering:
//
//     [data-ui="tabs"] > :where([data-part="list"]) > [data-part="trigger"]
//
// Three things are pinned here, in happy-dom, so the gate runs in `bun run
// test`: the converted files hold no descendant combinator before a part; no
// rule can reach into a nested component (queried on a real DOM, same-type
// nesting included); and every part of the canonical markup is still reached.
// The computed styles are pinned in Chromium by `tests/visual/nesting.pw.ts`.
//
// Add a component to `CONVERTED` when its stylesheet is converted. 1.1F-23
// turns the first check into a registry-audit gate over every component.

import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import {
  crossesIntoPart,
  descendantPartSelectors,
  partSkeletons,
  sheetSelectors,
  specificity,
  steps,
} from "../helpers/part-selectors";

const REGISTRY = join(import.meta.dir, "../..", "registry");

/** Every stylesheet converted so far, with the manifest version that records it. */
const CONVERTED = [
  ["recipes", "tabs", "1.0.2"],
  ["primitives", "collapsible", "1.0.1"],
  ["recipes", "accordion", "1.0.2"],
  ["primitives", "description-list", "1.0.2"],
  ["primitives", "progress", "1.1.1"],
  ["primitives", "key-value", "1.0.1"],
  ["primitives", "callout", "1.2.1"],
  ["primitives", "empty-state", "1.1.1"],
  // The pattern of the same name styles the same `[data-ui="empty-state"]`.
  ["patterns", "empty-state", "2.0.1"],
  // 1.1F-21: overlays and menus.
  ["recipes", "dialog", "1.0.3"],
  ["recipes", "alert-dialog", "1.0.3"],
  ["recipes", "drawer", "1.0.3"],
  ["recipes", "sheet", "1.0.3"],
  ["recipes", "popover", "1.0.2"],
  ["recipes", "tooltip", "1.0.2"],
  ["recipes", "sidebar", "1.1.3"],
  ["recipes", "carousel", "1.1.2"],
  ["recipes", "context-menu", "1.0.2"],
  ["recipes", "dropdown", "1.0.1"],
  ["recipes", "menubar", "1.0.1"],
  // 1.1F-22: table.
  ["recipes", "table", "3.2.2"],
] as const;

const read = (kind: string, name: string, ext: string) =>
  readFileSync(join(REGISTRY, kind, name, `${name}.${ext}`), "utf8");

const manifest = (kind: string, name: string) =>
  JSON.parse(read(kind, name, "manifest.json")) as Manifest;

// ── the reader ───────────────────────────────────────────────────────────────

describe("part-selectors — the reader the gate is built on", () => {
  it("splits a complex selector into compounds and combinators", () => {
    expect(steps('[data-ui="a"][open] > :where([data-part="b"], div)  [data-part="c"]:hover')).toEqual([
      { combinator: null, compound: '[data-ui="a"][open]' },
      { combinator: ">", compound: ':where([data-part="b"], div)' },
      { combinator: " ", compound: '[data-part="c"]:hover' },
    ]);
  });

  it("flags a descendant combinator before a part, and nothing else", () => {
    expect(crossesIntoPart('[data-ui="x"] [data-part="y"]')).toBe(true);
    expect(crossesIntoPart('[data-ui="x"][open] [data-part="y"]::after')).toBe(true);
    expect(crossesIntoPart('[data-ui="x"] > [data-part="y"] [data-part="z"]')).toBe(true);
    expect(crossesIntoPart('[data-ui="x"] :where([data-part="y"]) > [data-part="z"]')).toBe(true);
    // Hidden inside a functional pseudo-class.
    expect(crossesIntoPart(':where([data-ui="x"] [data-part="y"]) > p')).toBe(true);

    expect(crossesIntoPart('[data-ui="x"] > [data-part="y"]')).toBe(false);
    expect(crossesIntoPart('[data-ui="x"] > :where([data-part="y"]) > [data-part="z"]')).toBe(false);
    expect(crossesIntoPart('[data-ui="x"] > [data-part="y"] + [data-part="z"]')).toBe(false);
    // A descendant combinator before something that is not a part is not this gate's business.
    expect(crossesIntoPart('[data-ui="x"] > [data-part="y"] p')).toBe(false);
    expect(crossesIntoPart('[data-ui="x"][data-part="y"]')).toBe(false);
  });

  it("reads rules inside conditional blocks, with their source line", () => {
    const sheet = [
      "/* [data-ui=\"c\"] [data-part=\"comment\"] { } */",
      '[data-ui="x"] > [data-part="y"] { color: red; }',
      "@keyframes spin { from { rotate: 0deg; } to { rotate: 1turn; } }",
      "@media (forced-colors: active) {",
      '  [data-ui="x"] [data-part="y"],',
      '  [data-ui="x"] > [data-part="z"] {',
      "    color: Highlight;",
      "  }",
      "}",
    ].join("\n");
    expect(sheetSelectors(sheet).map((s) => s.selector)).toEqual([
      '[data-ui="x"] > [data-part="y"]',
      '[data-ui="x"] [data-part="y"]',
      '[data-ui="x"] > [data-part="z"]',
    ]);
    expect(descendantPartSelectors(sheet)).toEqual([
      { selector: '[data-ui="x"] [data-part="y"]', line: 5 },
    ]);
  });

  it("weighs a :where() hop at zero", () => {
    expect(specificity('[data-ui="tabs"] [data-part="trigger"]')).toEqual([0, 2, 0]);
    expect(specificity('[data-ui="tabs"] > :where([data-part="list"]) > [data-part="trigger"]')).toEqual([0, 2, 0]);
    expect(specificity('[data-ui="x"]:not([data-variant]) > :where(div:not([data-ui])) > dt:last-child::after')).toEqual([0, 3, 2]);
  });

  it("reduces a part rule to its structural path", () => {
    expect(
      partSkeletons(
        `[data-ui="a"][data-variant="pill"] > :where([data-part="list"]) > [data-part="trigger"][aria-selected="true"]:hover { }
         [data-ui="a"] > :where(div:not([data-ui])) > [data-part="term"]::after { }
         [data-ui="a"] > :where([data-part="item"]) > :where(h2, h3) > [data-part="trigger"] { }
         [data-ui="a"] > :where([data-part="head"]) > :where(div:not([data-ui]), [data-ui="stack"]) > [data-part="title"] { }
         [data-ui="a"] [data-part="label"] { }
         [data-ui="a"] > [data-part="content"] p { }
         [data-ui="a"][open] { }`,
        "ROOT",
      ),
    ).toEqual([
      'ROOT > [data-part="list"] > [data-part="trigger"]',
      'ROOT > div:not([data-ui]) > [data-part="term"]',
      'ROOT > [data-part="item"] > :is(h2, h3) > [data-part="trigger"]',
      'ROOT > [data-part="head"] > :is(div:not([data-ui]), [data-ui="stack"]) > [data-part="title"]',
      'ROOT [data-part="label"]',
    ]);
  });
});

// ── the gate ─────────────────────────────────────────────────────────────────

let box: HTMLElement | null = null;

afterEach(() => {
  box?.remove();
  box = null;
});

/** The component's reference page in a disposable container. */
function mountReference(kind: string, name: string): HTMLElement[] {
  box = document.createElement("div");
  box.innerHTML = read(kind, name, "html").replace(/<!--[^]*?-->/g, "");
  document.body.appendChild(box);
  return [...box.querySelectorAll<HTMLElement>(`[data-ui="${name}"]`)];
}

/**
 * A copy of `root` that is some other component with the same parts: the worst
 * case for a part rule, and what same-type nesting looks like to the outer
 * root. `tag` swaps the root element, for the shapes a grouping `<div>` allows.
 */
function impostor(root: HTMLElement, tag = root.tagName): HTMLElement {
  const copy = document.createElement(tag);
  copy.innerHTML = root.innerHTML;
  copy.setAttribute("data-ui", "inner");
  for (const el of copy.querySelectorAll("[id]")) el.removeAttribute("id");
  return copy;
}

describe("nesting, CSS — a component's part rules stop at its own parts", () => {
  for (const [kind, name] of CONVERTED) {
    describe(name, () => {
      const sheet = read(kind, name, "css");

      it("reaches no part across a descendant combinator", () => {
        expect(descendantPartSelectors(sheet)).toEqual([]);
      });

      it("has no rule that reaches into a nested component", () => {
        const [outer] = mountReference(kind, name);
        const parts = [...outer.querySelectorAll<HTMLElement>("[data-part]")];
        // The nested component goes everywhere it could: inside every part, and
        // straight under the root — as itself and as a <div>.
        const pristine = impostor(outer);
        for (const host of [outer, ...parts]) host.appendChild(pristine.cloneNode(true));
        outer.appendChild(impostor(outer, "div"));
        outer.setAttribute("data-outer", "");

        const leaks: string[] = [];
        for (const path of partSkeletons(sheet, "[data-outer]")) {
          const hit = [...box!.querySelectorAll(path)].some((el) => el.closest('[data-ui="inner"]'));
          if (hit) leaks.push(path);
        }
        expect(leaks).toEqual([]);
      });

      it("still reaches every part of its own reference markup", () => {
        const roots = mountReference(kind, name);
        for (const root of roots) root.setAttribute("data-outer", "");
        const reached = new Set<Element>();
        const skeletons = partSkeletons(sheet, "[data-outer]");
        for (const path of skeletons) {
          for (const el of box!.querySelectorAll(path)) reached.add(el);
        }
        // Only the parts the sheet styles at all: a dialog's trigger is a
        // `button` and an alert-dialog's cancel/confirm are styled by theirs.
        // (table's hidden-rows rule ends in `tr[data-part]`, which names no part.)
        const styled = new Set(skeletons.map((p) => /\[data-part="([^"]+)"\]$/.exec(p)?.[1]).filter(Boolean));
        expect(styled.size).toBeGreaterThan(0);
        const orphans = [...box!.querySelectorAll("[data-part]")]
          .filter((el) => styled.has(el.getAttribute("data-part")!))
          .filter((el) => !reached.has(el))
          .map((el) => `${el.tagName.toLowerCase()}[data-part="${el.getAttribute("data-part")}"]`);
        expect(box!.querySelectorAll("[data-part]").length).toBeGreaterThan(0);
        expect(orphans).toEqual([]);
      });
    });
  }
});

// ── the shapes that are not direct children ─────────────────────────────────

/** Is `target` reached by any part rule of the sheet, from `root`? */
function reaches(sheet: string, root: HTMLElement, target: Element): boolean {
  root.setAttribute("data-outer", "");
  return partSkeletons(sheet, "[data-outer]").some((path) =>
    [...root.parentElement!.querySelectorAll(path)].includes(target),
  );
}

function mount(html: string): HTMLElement {
  box = document.createElement("div");
  box.innerHTML = html;
  document.body.appendChild(box);
  return box.firstElementChild as HTMLElement;
}

describe("nesting, CSS — markup HTML and APG sanction beyond direct children", () => {
  it("description-list and key-value style a term inside a grouping <div>", () => {
    // `<dl>` may wrap each name–value group in a <div> (HTML §4.4.9).
    for (const [name, term, details] of [
      ["description-list", "term", "details"],
      ["key-value", "label", "value"],
    ] as const) {
      const sheet = read("primitives", name, "css");
      const root = mount(
        `<dl data-ui="${name}"><div><dt data-part="${term}">Plan</dt><dd data-part="${details}">Team</dd></div></dl>`,
      );
      expect(reaches(sheet, root, root.querySelector("dt")!), name).toBe(true);
      expect(reaches(sheet, root, root.querySelector("dd")!), name).toBe(true);
      box!.remove();
    }
  });

  it("…but not through a <div> that is a component of its own", () => {
    const sheet = read("primitives", "key-value", "css");
    const root = mount(
      `<dl data-ui="key-value"><div data-ui="progress"><span data-part="label">40%</span></div></dl>`,
    );
    expect(reaches(sheet, root, root.querySelector("span")!)).toBe(false);
  });

  it("accordion styles a trigger wrapped in a heading, the APG shape", () => {
    const sheet = read("recipes", "accordion", "css");
    const root = mount(
      `<div data-ui="accordion"><div data-part="item" data-state="expanded">
         <h3><button data-part="trigger">Billing <span data-part="icon"></span></button></h3>
         <div data-part="content">…</div>
       </div></div>`,
    );
    expect(reaches(sheet, root, root.querySelector("button")!)).toBe(true);
    expect(reaches(sheet, root, root.querySelector("span")!)).toBe(true);
  });
});

describe("nesting, CSS — overlay and menu shapes beyond direct children (1.1F-21)", () => {
  const FAMILY = ["dialog", "alert-dialog", "drawer", "sheet"] as const;

  it("the dialog family styles header, body and footer inside a <form> in the panel", () => {
    // A form dialog: <div data-part="panel"><form> header body footer </form>.
    for (const name of FAMILY) {
      const sheet = read("recipes", name, "css");
      const root = mount(
        `<div data-ui="${name}"><div data-part="panel"><form>
           <div data-part="header"><h2 data-part="title">Edit</h2></div>
           <div data-part="body">…</div>
           <div data-part="footer">…</div>
         </form></div></div>`,
      );
      // A sheet has no footer part.
      for (const part of ["header", "body", "title", ...(name === "sheet" ? [] : ["footer"])]) {
        expect(reaches(sheet, root, root.querySelector(`[data-part="${part}"]`)!), `${name} ${part}`).toBe(true);
      }
      box!.remove();
    }
  });

  it("…and a title in one plain div, stack or cluster inside the header", () => {
    for (const name of FAMILY) {
      const sheet = read("recipes", name, "css");
      for (const wrapper of ["<div>", '<div data-ui="stack">', '<div data-ui="cluster">']) {
        const root = mount(
          `<div data-ui="${name}"><div data-part="panel"><div data-part="header">
             ${wrapper}<span>In Backlog</span><h2 data-part="title">Fix login</h2></div>
           </div></div></div>`,
        );
        expect(reaches(sheet, root, root.querySelector("h2")!), `${name} ${wrapper}`).toBe(true);
        box!.remove();
      }
    }
  });

  it("…but not in a component that has parts of its own, nor two wrappers deep", () => {
    for (const name of FAMILY) {
      const sheet = read("recipes", name, "css");
      for (const inner of [
        '<div data-ui="card"><h3 data-part="title">Plan</h3></div>',
        '<div data-ui="stack"><div data-ui="stack"><h3 data-part="title">Plan</h3></div></div>',
      ]) {
        const root = mount(
          `<div data-ui="${name}"><div data-part="panel"><div data-part="header">${inner}</div></div></div>`,
        );
        expect(reaches(sheet, root, root.querySelector("h3")!), `${name} ${inner}`).toBe(false);
        box!.remove();
      }
    }
  });

  it("dialog, drawer and sheet style a close button in the panel, or wrapped in the header or footer", () => {
    for (const name of ["dialog", "drawer", "sheet"]) {
      const sheet = read("recipes", name, "css");
      for (const [where, html] of [
        ["panel", `<button data-part="close">x</button>`],
        ["cluster in header", `<div data-part="header"><div data-ui="cluster"><button data-part="close">x</button></div></div>`],
        ["form footer", `<form><div data-part="footer"><button data-part="close">x</button></div></form>`],
      ]) {
        const root = mount(`<div data-ui="${name}"><div data-part="panel">${html}</div></div>`);
        expect(reaches(sheet, root, root.querySelector("button")!), `${name}: ${where}`).toBe(true);
        box!.remove();
      }
      // A popover's close in the body is the popover's.
      const root = mount(
        `<div data-ui="${name}"><div data-part="panel"><div data-part="body">
           <div data-ui="popover"><div data-part="content"><button data-part="close">x</button></div></div>
         </div></div></div>`,
      );
      expect(reaches(sheet, root, root.querySelector("button")!), name).toBe(false);
      box!.remove();
    }
  });

  it("sidebar styles a trigger outside the panel — an off-canvas drawer is opened from there", () => {
    const sheet = read("recipes", "sidebar", "css");
    const root = mount(
      `<div data-ui="sidebar"><button data-part="trigger"><svg></svg></button><aside data-part="panel"></aside></div>`,
    );
    expect(reaches(sheet, root, root.querySelector("button")!)).toBe(true);
  });

  it("sidebar does not style a dropdown's trigger and items in its footer", () => {
    const sheet = read("recipes", "sidebar", "css");
    const root = mount(
      `<div data-ui="sidebar"><aside data-part="panel"><div data-part="footer">
         <div data-ui="dropdown"><button data-part="trigger">Me</button>
           <div data-part="menu"><a data-part="item"><span data-part="label">Out</span></a></div></div>
       </div></aside></div>`,
    );
    for (const el of root.querySelectorAll('[data-ui="dropdown"] [data-part]')) {
      expect(reaches(sheet, root, el), el.getAttribute("data-part")!).toBe(false);
    }
  });

  it("menubar styles a trigger, its submenu and items with or without a group", () => {
    const sheet = read("recipes", "menubar", "css");
    const pair = `<button data-part="trigger" role="menuitem" aria-disabled="true">File</button>
      <div data-part="submenu" role="menu"><button data-part="item" role="menuitem">New</button><hr data-part="separator"></div>`;
    for (const markup of [pair, `<div data-part="group">${pair}</div>`]) {
      const root = mount(`<div data-ui="menubar">${markup}</div>`);
      for (const el of root.querySelectorAll("[data-part]")) {
        expect(reaches(sheet, root, el), `${el.getAttribute("data-part")} in ${markup.slice(0, 20)}`).toBe(true);
      }
      box!.remove();
    }
  });

  it("menubar's disabled-menuitem rule stops at its own menuitems", () => {
    const sheet = read("recipes", "menubar", "css");
    const disabled = sheetSelectors(sheet)
      .map((s) => s.selector)
      .filter((s) => s.includes('[role="menuitem"][aria-disabled="true"]'));
    expect(disabled.length).toBe(4);
    const root = mount(
      `<div data-ui="menubar"><div data-part="group"><div data-part="submenu">
         <div data-ui="dropdown"><div data-part="menu"><button role="menuitem" aria-disabled="true">x</button></div></div>
       </div></div></div>`,
    );
    const nested = root.querySelector("button")!;
    expect(disabled.some((s) => nested.matches(s))).toBe(false);
    for (const s of disabled) expect(specificity(s), s).toEqual([0, 3, 0]);
  });
});

describe("nesting, CSS — a table in a table (1.1F-22)", () => {
  const sheet = read("recipes", "table", "css");
  /** Every selector of the sheet, with the states a DOM query cannot hold dropped. */
  const queries = sheetSelectors(sheet)
    .map((s) => s.selector)
    .filter((s) => !s.includes(":has("))
    .map((s) => s.replace(/::?(before|after|hover|focus-visible|focus|active)\b/g, ""));

  // Every flag the outer root can carry, and every state its rows and cells can.
  const OUTER = `data-variant="striped" data-size="sm" data-responsive="stack" data-stacked data-negatives="red"
    data-selectable data-editable data-resized data-groupable data-sticky-header data-sticky-footer`;
  const STATES = `<tr data-part="tr" data-stripe="even" data-selected data-pin="top" data-dragging data-drop-target data-drop-pos="before" data-collapsed>
      <td data-part="td" data-align="right" data-format="currency" data-negative data-pin="start" data-pin-edge data-hide-below="md"
          data-col-hidden data-tree-cell data-editing data-label="Qty"><input data-part="cell-input" data-invalid></td>
      <td data-part="td"><input data-part="checkbox" type="checkbox"><button data-part="expander" aria-expanded="true"></button>
        <button data-part="row-toggle" aria-expanded="true"></button><button data-part="drag-handle"></button></td>
    </tr>`;
  const inner = `<div data-ui="table" id="inner">
    <input data-part="filter">
    <table data-part="table">
      <thead data-part="thead"><tr data-part="tr"><th data-part="th" data-sortable aria-sort="ascending" data-sort-order="1"
        data-pin="end" data-dragging>Line<span data-part="resize-handle"></span></th><th data-part="th">Qty</th></tr>
        <tr data-part="filter-row"><td data-part="td"><input data-part="filter-input"></td><td data-part="td"></td></tr></thead>
      <tbody data-part="tbody">
        <tr data-part="group-header"><td colspan="2">Group</td></tr>
        <tr data-part="tr"><td data-part="td">A</td><td data-part="td">1</td></tr>
        ${STATES}
        <tr data-part="detail-row"><td data-part="td" colspan="2">Notes</td></tr>
        <tr data-part="empty" hidden><td data-part="td" colspan="2">None</td></tr>
      </tbody>
      <tfoot data-part="tfoot"><tr data-part="tr"><td data-part="td">Total</td><td data-part="td">2</td></tr></tfoot>
    </table>
  </div>`;

  /** For each selector, the indices of the inner table's elements it matches. */
  function matched(inner: Element): string[] {
    const all = [inner, ...inner.querySelectorAll("*")];
    return queries.map((q) => {
      const hits = new Set(inner.ownerDocument.querySelectorAll(q));
      return all.map((el, i) => (hits.has(el) ? i : -1)).filter((i) => i >= 0).join(",");
    });
  }

  it("a table in a detail row matches the same rules nested as it does alone", () => {
    // Nested: in the detail row of a table that has every flag set, inside a
    // row that has every state. Alone: the same inner table, standing apart.
    const root = mount(
      `<div data-ui="table" ${OUTER}><table data-part="table"><tbody data-part="tbody">
         ${STATES.replace("</tr>", "")}<td data-part="td" data-align="center">${inner}</td></tr>
         <tr data-part="detail-row"><td data-part="td" colspan="2">${inner}</td></tr>
       </tbody></table></div>`,
    );
    const nested = root.querySelectorAll("#inner");
    expect(nested.length).toBe(2);
    const alone = document.createElement("div");
    alone.innerHTML = inner;
    box!.appendChild(alone);
    const own = matched(alone.firstElementChild!);
    // Not vacuous: given the outer root's flags, the same inner table matches
    // differently — so those flags are what the nested copies must not see.
    const flagged = document.createElement("div");
    flagged.innerHTML = inner.replace('id="inner"', OUTER);
    box!.appendChild(flagged);
    expect(matched(flagged.firstElementChild!).filter((m, i) => m !== own[i]).length).toBeGreaterThan(30);
    for (const el of nested) {
      const diff = queries.filter((q, i) => matched(el)[i] !== own[i]);
      expect(diff).toEqual([]);
    }
  });

  it("reads the cell attributes on its own cells only — a stack's data-align is the stack's", () => {
    const root = mount(
      `<div data-ui="table" data-responsive="stack" data-negatives="red"><table data-part="table"><tbody data-part="tbody">
         <tr data-part="tr"><td data-part="td"><span data-ui="stack" data-align="center" data-hide-below="md" data-pin="start"
           data-col-hidden data-negative data-format="number">Alice</span></td></tr>
       </tbody></table></div>`,
    );
    const stack = root.querySelector('[data-ui="stack"]')!;
    expect(queries.filter((q) => stack.matches(q))).toEqual([]);
    // …while the same attributes on a cell are read.
    const td = root.querySelector("td")!;
    for (const attr of ["data-align", "data-hide-below", "data-pin", "data-col-hidden", "data-negative", "data-format"]) {
      td.setAttribute(attr, stack.getAttribute(attr)!);
    }
    const read = queries.filter((q) => td.matches(q)).join(" ");
    for (const attr of ["data-align", "data-hide-below", "data-pin", "data-col-hidden", "data-negative", "data-format"]) {
      expect(read, attr).toContain(`[${attr}`);
    }
  });

  it("the drag guard asks only about its own rows and header cells", () => {
    // The one rule happy-dom cannot parse: a relative :has(). Its arguments are child chains.
    const has = sheetSelectors(sheet).filter((s) => s.selector.includes(":has("));
    expect(has.map((s) => s.selector)).toEqual([
      '[data-ui="table"]:has(> :where([data-part="table"]) > :where(thead, tbody, tfoot) > [data-dragging], > :where([data-part="table"]) > :where(thead, tbody, tfoot) > :where(tr) > [data-dragging])',
    ]);
    expect(specificity(has[0].selector)).toEqual([0, 2, 0]);
  });

  it("styles the quick filter as the root's child or in one plain div, stack or cluster", () => {
    for (const wrap of ["", "<div>", '<div data-ui="stack">', '<div data-ui="cluster">']) {
      const root = mount(`<div data-ui="table">${wrap}<input data-part="filter">${wrap ? "</div>" : ""}</div>`);
      expect(reaches(sheet, root, root.querySelector("input")!), wrap || "bare").toBe(true);
      box!.remove();
    }
    for (const wrap of ['<div data-ui="card">', "<div><div>"]) {
      const root = mount(`<div data-ui="table">${wrap}<input data-part="filter"></div>${wrap === "<div><div>" ? "</div>" : ""}</div>`);
      expect(reaches(sheet, root, root.querySelector("input")!), wrap).toBe(false);
      box!.remove();
    }
  });
});

// ── the cascade does not move ────────────────────────────────────────────────

describe("nesting, CSS — the conversion moves no rule in the cascade", () => {
  it("keeps the hops weightless, so pattern overrides still win", () => {
    const tabs = sheetSelectors(read("recipes", "tabs", "css")).map((s) => s.selector);
    const trigger = '[data-ui="tabs"] > :where([data-part="list"]) > [data-part="trigger"]';
    expect(tabs).toContain(trigger);
    expect(specificity(trigger)).toEqual([0, 2, 0]);

    // settings-page restyles the tabs it composes. Each override has to stay
    // strictly above every tabs rule for the same part in the same state — a
    // weighted hop would have tied them and left the winner to source order.
    const subject = (s: string) => steps(s).at(-1)!.compound;
    const overrides = sheetSelectors(read("patterns", "settings-page", "css"))
      .map((s) => s.selector)
      .filter((s) => s.includes('[data-ui="tabs"] [data-part='));
    expect(overrides.length).toBeGreaterThan(0);
    for (const override of overrides) {
      const rivals = tabs.filter((s) => subject(s) === subject(override));
      expect(rivals.length, override).toBeGreaterThan(0);
      for (const rival of rivals) {
        expect(specificity(override)[1], `${override} vs ${rival}`).toBeGreaterThan(specificity(rival)[1]);
      }
    }
  });

  it("gives a grouped, wrapped or form-held part the same weight as a direct one", () => {
    for (const [kind, name, direct, wrapped] of [
      [
        "primitives",
        "description-list",
        '[data-ui="description-list"] > [data-part="term"]',
        '[data-ui="description-list"] > :where(div:not([data-ui])) > [data-part="term"]',
      ],
      [
        "primitives",
        "key-value",
        '[data-ui="key-value"] > [data-part="label"]',
        '[data-ui="key-value"] > :where(div:not([data-ui])) > [data-part="label"]',
      ],
      [
        "recipes",
        "dialog",
        '[data-ui="dialog"] > :where([data-part="panel"]) > :where([data-part="header"]) > [data-part="title"]',
        '[data-ui="dialog"] > :where([data-part="panel"]) > :where(form) > :where([data-part="header"]) > :where(div:not([data-ui]), [data-ui="stack"], [data-ui="cluster"]) > [data-part="title"]',
      ],
      [
        "recipes",
        "sidebar",
        '[data-ui="sidebar"] > [data-part="trigger"]',
        '[data-ui="sidebar"] > :where([data-part="panel"]) > :where([data-part="header"]) > [data-part="trigger"]',
      ],
      [
        "recipes",
        "menubar",
        '[data-ui="menubar"] > :where([data-part="submenu"]) > [data-part="item"]',
        '[data-ui="menubar"] > :where([data-part="group"]) > :where([data-part="submenu"]) > [data-part="item"]',
      ],
      [
        "recipes",
        "table",
        '[data-ui="table"] > [data-part="filter"]',
        '[data-ui="table"] > :where(div:not([data-ui]), [data-ui="stack"], [data-ui="cluster"]) > [data-part="filter"]',
      ],
      [
        "recipes",
        "accordion",
        '[data-ui="accordion"] > :where([data-part="item"]) > [data-part="trigger"]',
        '[data-ui="accordion"] > :where([data-part="item"]) > :where(h1, h2, h3, h4, h5, h6) > [data-part="trigger"]',
      ],
    ] as const) {
      const selectors = sheetSelectors(read(kind, name, "css")).map((s) => s.selector);
      expect(selectors, name).toContain(direct);
      expect(selectors, name).toContain(wrapped);
      expect(specificity(wrapped), name).toEqual(specificity(direct));
    }
  });
});

// ── the record ───────────────────────────────────────────────────────────────

describe("nesting, CSS — manifests", () => {
  it("records the change in each manifest", () => {
    for (const [kind, name, version] of CONVERTED) {
      const m = manifest(kind, name);
      expect(validateManifest(m), name).toEqual([]);
      // The entry, not the current version: a later change bumps the manifest
      // past this one and the record must stay.
      const entry = (m.changes ?? []).find((c) => c.version === version);
      expect(entry?.breaking, name).toBe(false);
      expect(entry?.note, name).toContain("Nested components keep their own parts");
    }
  });

  it("tells a description-list author how a nested text keeps the list's size (D6)", () => {
    // `sm` maps to --text-xs by registry-wide convention; a nested `text` with
    // its own data-size overrides it, which reads as the list ignoring its size.
    // A variant carries no prose in the manifest schema, so the note lives on
    // the slot the nested text goes in — which the skill and the docs print.
    const m = manifest("primitives", "description-list");
    expect(m.slots.details.description).toContain("omit data-size");
  });
});
