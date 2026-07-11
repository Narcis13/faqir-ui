import { describe, it, expect, beforeEach } from "bun:test";
import { createTable } from "../../registry/recipes/table/table.js";

// Task 0.4-22 · table behavior contract. Covers the sort toggle (asc/desc with
// aria-sort, none as the reset indicator), numeric-aware sorting across string /
// number / currency / date columns, row selection (API + checkbox + shift range),
// tfoot isolation, the format-attribute rendering contract, and the empty state.

// ── Setup ────────────────────────────────────────────────────────────────────

function setup(html: string) {
  document.body.innerHTML = html;
  const root = document.querySelector("[data-ui='table']") as HTMLElement;
  const api = createTable(root);
  return { root, api };
}

/** Text of every body row's cell at column `i` (live — re-read after each sort). */
const col = (root: HTMLElement, i: number) =>
  [...root.querySelectorAll("[data-part='tbody'] [data-part='tr']")].map((tr) =>
    (tr.querySelectorAll("[data-part='td']")[i]?.textContent ?? "").trim()
  );

const th = (root: HTMLElement, i: number) =>
  root.querySelectorAll("[data-part='thead'] [data-part='th']")[i] as HTMLElement;

const clickHeader = (root: HTMLElement, i: number) =>
  th(root, i).dispatchEvent(new MouseEvent("click", { bubbles: true }));

const bodyRows = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-part='tbody'] [data-part='tr']")] as HTMLElement[];

const change = (el: Element) => el.dispatchEvent(new Event("change", { bubbles: true }));

// A four-column, unsorted grid: string / currency / ISO-date / plain-number.
// Row order is deliberately shuffled so every column sorts to a distinct result.
const SORT_TABLE = `
  <div data-ui="table" data-size="md">
    <table data-part="table">
      <thead data-part="thead">
        <tr data-part="tr">
          <th data-part="th" scope="col" data-sortable aria-sort="none">Name</th>
          <th data-part="th" scope="col" data-sortable aria-sort="none" data-align="right" data-format="currency">Price</th>
          <th data-part="th" scope="col" data-sortable aria-sort="none">Joined</th>
          <th data-part="th" scope="col" data-sortable aria-sort="none" data-align="right" data-format="number">Rank</th>
        </tr>
      </thead>
      <tbody data-part="tbody">
        <tr data-part="tr"><td data-part="td">Charlie</td><td data-part="td" data-format="currency">$19.99</td><td data-part="td">2024-05-01</td><td data-part="td" data-format="number">30</td></tr>
        <tr data-part="tr"><td data-part="td">Alice</td><td data-part="td" data-format="currency">$9.99</td><td data-part="td">2022-11-15</td><td data-part="td" data-format="number">10</td></tr>
        <tr data-part="tr"><td data-part="td">Bob</td><td data-part="td" data-format="currency">$29.99</td><td data-part="td">2023-08-20</td><td data-part="td" data-format="number">20</td></tr>
      </tbody>
    </table>
  </div>`;

// Selection grid: leading checkbox column, one sortable column, one plain column.
const SELECT_TABLE = `
  <div data-ui="table" data-size="md">
    <table data-part="table">
      <thead data-part="thead">
        <tr data-part="tr">
          <th data-part="th" scope="col"><input data-part="checkbox" type="checkbox" aria-label="Select all rows"></th>
          <th data-part="th" scope="col" data-sortable aria-sort="none">Name</th>
          <th data-part="th" scope="col">Actions</th>
        </tr>
      </thead>
      <tbody data-part="tbody">
        <tr data-part="tr"><td data-part="td"><input data-part="checkbox" type="checkbox" aria-label="Select row"></td><td data-part="td">Alice</td><td data-part="td">Edit</td></tr>
        <tr data-part="tr"><td data-part="td"><input data-part="checkbox" type="checkbox" aria-label="Select row"></td><td data-part="td">Bob</td><td data-part="td">Edit</td></tr>
        <tr data-part="tr"><td data-part="td"><input data-part="checkbox" type="checkbox" aria-label="Select row"></td><td data-part="td">Carol</td><td data-part="td">Edit</td></tr>
      </tbody>
    </table>
  </div>`;

const rowCheckbox = (root: HTMLElement, i: number) =>
  bodyRows(root)[i].querySelector("[data-part='checkbox']") as HTMLInputElement;
const headerCheckbox = (root: HTMLElement) =>
  root.querySelector("[data-part='thead'] [data-part='checkbox']") as HTMLInputElement;

beforeEach(() => {
  document.body.innerHTML = "";
});

// ── Sort toggling & aria-sort ─────────────────────────────────────────────────

describe("table · sort toggling & aria-sort", () => {
  it("sortable headers start unsorted (aria-sort=none)", () => {
    const { root } = setup(SORT_TABLE);
    for (let i = 0; i < 4; i++) {
      expect(th(root, i).getAttribute("aria-sort")).toBe("none");
    }
  });

  it("clicking a header cycles ascending → descending, reflected in aria-sort", () => {
    const { root } = setup(SORT_TABLE);

    clickHeader(root, 0);
    expect(th(root, 0).getAttribute("aria-sort")).toBe("ascending");
    expect(col(root, 0)).toEqual(["Alice", "Bob", "Charlie"]);

    clickHeader(root, 0);
    expect(th(root, 0).getAttribute("aria-sort")).toBe("descending");
    expect(col(root, 0)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("sorting a second column resets the first back to none (only one active sort)", () => {
    const { root } = setup(SORT_TABLE);
    clickHeader(root, 0);
    expect(th(root, 0).getAttribute("aria-sort")).toBe("ascending");

    clickHeader(root, 3);
    expect(th(root, 0).getAttribute("aria-sort")).toBe("none");
    expect(th(root, 3).getAttribute("aria-sort")).toBe("ascending");
    expect(col(root, 3)).toEqual(["10", "20", "30"]);
  });

  it("sort() API sorts with an explicit direction and sets aria-sort", () => {
    const { root, api } = setup(SORT_TABLE);
    api.sort(0, "descending");
    expect(th(root, 0).getAttribute("aria-sort")).toBe("descending");
    expect(col(root, 0)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("clicking a non-sortable header does nothing", () => {
    const { root } = setup(SELECT_TABLE);
    const actions = th(root, 2); // no data-sortable
    expect(actions.hasAttribute("aria-sort")).toBe(false);
    clickHeader(root, 2);
    // The sortable Name column is untouched, order preserved
    expect(th(root, 1).getAttribute("aria-sort")).toBe("none");
    expect(col(root, 1)).toEqual(["Alice", "Bob", "Carol"]);
  });
});

// ── Sorting columns by type ───────────────────────────────────────────────────

describe("table · sorting columns by type", () => {
  it("string column sorts alphabetically (asc/desc)", () => {
    const { root, api } = setup(SORT_TABLE);
    api.sort(0, "ascending");
    expect(col(root, 0)).toEqual(["Alice", "Bob", "Charlie"]);
    api.sort(0, "descending");
    expect(col(root, 0)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("number column sorts numerically (asc/desc)", () => {
    const { root, api } = setup(SORT_TABLE);
    api.sort(3, "ascending");
    expect(col(root, 3)).toEqual(["10", "20", "30"]);
    api.sort(3, "descending");
    expect(col(root, 3)).toEqual(["30", "20", "10"]);
  });

  it("currency column sorts by numeric value, not lexically", () => {
    const { root, api } = setup(SORT_TABLE);
    api.sort(1, "ascending");
    // Lexical order would be ["$19.99","$29.99","$9.99"]; numeric proves the
    // controller strips the currency formatting before comparing.
    expect(col(root, 1)).toEqual(["$9.99", "$19.99", "$29.99"]);
    api.sort(1, "descending");
    expect(col(root, 1)).toEqual(["$29.99", "$19.99", "$9.99"]);
  });

  it("date column sorts chronologically (asc/desc)", () => {
    const { root, api } = setup(SORT_TABLE);
    api.sort(2, "ascending");
    expect(col(root, 2)).toEqual(["2022-11-15", "2023-08-20", "2024-05-01"]);
    api.sort(2, "descending");
    expect(col(root, 2)).toEqual(["2024-05-01", "2023-08-20", "2022-11-15"]);
  });

  it("known limitation: same-year ISO dates are left in place (numeric year parse)", () => {
    // The comparator parses cells with parseFloat, so an ISO date collapses to
    // its year — same-year rows compare equal and keep their original order.
    // This test pins that behavior; a future proper date parser should flip it.
    const { root, api } = setup(`
      <div data-ui="table">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr">
            <th data-part="th" data-sortable aria-sort="none">Date</th>
          </tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td">2026-03-10</td></tr>
            <tr data-part="tr"><td data-part="td">2026-01-05</td></tr>
            <tr data-part="tr"><td data-part="td">2026-11-20</td></tr>
          </tbody>
        </table>
      </div>`);
    api.sort(0, "ascending");
    expect(col(root, 0)).toEqual(["2026-03-10", "2026-01-05", "2026-11-20"]);
  });
});

// ── Number / currency format rendering ────────────────────────────────────────

describe("table · number/currency format rendering", () => {
  it("format cells carry their data-format attribute (rendering is markup + CSS)", () => {
    const { root } = setup(SORT_TABLE);
    const priceCells = root.querySelectorAll("[data-part='tbody'] [data-part='td'][data-format='currency']");
    expect(priceCells.length).toBe(3);
    const numberCells = root.querySelectorAll("[data-part='tbody'] [data-part='td'][data-format='number']");
    expect(numberCells.length).toBe(3);
  });

  it("sorting preserves the exact formatted text of each cell", () => {
    const { root, api } = setup(SORT_TABLE);
    api.sort(1, "ascending");
    // Cells move with their rows and are never rewritten: after a price sort the
    // Rank cells follow their rows ($9.99→10, $19.99→30, $29.99→20).
    expect(col(root, 1)).toEqual(["$9.99", "$19.99", "$29.99"]);
    expect(col(root, 3)).toEqual(["10", "30", "20"]);
  });
});

// ── Row selection ─────────────────────────────────────────────────────────────

describe("table · row selection", () => {
  it("selectRow toggles data-selected and the row checkbox", () => {
    const { root, api } = setup(SELECT_TABLE);
    api.selectRow(1);
    expect(bodyRows(root)[1].hasAttribute("data-selected")).toBe(true);
    expect(rowCheckbox(root, 1).checked).toBe(true);
    expect(headerCheckbox(root).indeterminate).toBe(true);

    api.selectRow(1);
    expect(bodyRows(root)[1].hasAttribute("data-selected")).toBe(false);
    expect(rowCheckbox(root, 1).checked).toBe(false);
  });

  it("selectRow ignores out-of-range indices", () => {
    const { root, api } = setup(SELECT_TABLE);
    api.selectRow(-1);
    api.selectRow(99);
    expect(api.getSelected()).toEqual([]);
  });

  it("selectAll / deselectAll and getSelected report indices", () => {
    const { root, api } = setup(SELECT_TABLE);
    api.selectAll();
    expect(api.getSelected()).toEqual([0, 1, 2]);
    expect(headerCheckbox(root).checked).toBe(true);
    expect(headerCheckbox(root).indeterminate).toBe(false);

    api.deselectAll();
    expect(api.getSelected()).toEqual([]);
    expect(headerCheckbox(root).checked).toBe(false);
    expect(headerCheckbox(root).indeterminate).toBe(false);
  });

  it("header checkbox change selects and deselects every row", () => {
    const { root, api } = setup(SELECT_TABLE);
    const hc = headerCheckbox(root);
    hc.checked = true;
    change(hc);
    expect(api.getSelected()).toEqual([0, 1, 2]);
    hc.checked = false;
    change(hc);
    expect(api.getSelected()).toEqual([]);
  });

  it("a row checkbox change toggles its row and drives the header indeterminate state", () => {
    const { root, api } = setup(SELECT_TABLE);
    const cb = rowCheckbox(root, 0);
    cb.checked = true;
    change(cb);
    expect(bodyRows(root)[0].hasAttribute("data-selected")).toBe(true);
    expect(api.getSelected()).toEqual([0]);
    expect(headerCheckbox(root).indeterminate).toBe(true);

    cb.checked = false;
    change(cb);
    expect(api.getSelected()).toEqual([]);
    expect(headerCheckbox(root).indeterminate).toBe(false);
  });

  it("shift-click on a row extends the selection as a range", () => {
    const { root, api } = setup(SELECT_TABLE);
    api.selectRow(0); // anchor
    const nameCell = bodyRows(root)[2].querySelectorAll("[data-part='td']")[1];
    nameCell.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    expect(api.getSelected()).toEqual([0, 1, 2]);
  });

  it("shift+change on a row checkbox extends the selection as a range", () => {
    const { root, api } = setup(SELECT_TABLE);
    const cb0 = rowCheckbox(root, 0);
    cb0.checked = true;
    change(cb0); // anchor at index 0
    const cb2 = rowCheckbox(root, 2);
    cb2.checked = true;
    cb2.dispatchEvent(new MouseEvent("change", { bubbles: true, shiftKey: true }));
    expect(api.getSelected()).toEqual([0, 1, 2]);
  });
});

// ── tfoot behavior ────────────────────────────────────────────────────────────

const FOOTER_TABLE = `
  <div data-ui="table" data-variant="bordered" data-size="md">
    <table data-part="table">
      <thead data-part="thead">
        <tr data-part="tr">
          <th data-part="th" scope="col" data-sortable aria-sort="none">Item</th>
          <th data-part="th" scope="col" data-align="right" data-format="currency">Total</th>
        </tr>
      </thead>
      <tbody data-part="tbody">
        <tr data-part="tr"><td data-part="td">Web Development</td><td data-part="td" data-format="currency">1,500.00</td></tr>
        <tr data-part="tr"><td data-part="td">Design Services</td><td data-part="td" data-format="currency">1,000.00</td></tr>
      </tbody>
      <tfoot data-part="tfoot">
        <tr data-part="tr"><td data-part="td" data-align="right">Subtotal</td><td data-part="td" data-format="currency">2,500.00</td></tr>
        <tr data-part="tr"><td data-part="td" data-align="right">Total</td><td data-part="td" data-format="currency">2,975.00</td></tr>
      </tfoot>
    </table>
  </div>`;

const tfootTexts = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-part='tfoot'] [data-part='tr']")].map((tr) =>
    tr.querySelector("[data-part='td']")!.textContent!.trim()
  );

describe("table · tfoot behavior", () => {
  it("sorting reorders only tbody rows, leaving tfoot totals in place", () => {
    const { root, api } = setup(FOOTER_TABLE);
    api.sort(0, "descending");
    expect(col(root, 0)).toEqual(["Web Development", "Design Services"]);
    // Footer rows never move and keep their formatted totals.
    expect(tfootTexts(root)).toEqual(["Subtotal", "Total"]);
    expect(
      [...root.querySelectorAll("[data-part='tfoot'] [data-part='td'][data-format='currency']")].map(
        (td) => td.textContent!.trim()
      )
    ).toEqual(["2,500.00", "2,975.00"]);
  });

  it("selectAll never selects tfoot rows", () => {
    const { root, api } = setup(FOOTER_TABLE);
    api.selectAll();
    expect(api.getSelected()).toEqual([0, 1]);
    for (const tr of root.querySelectorAll("[data-part='tfoot'] [data-part='tr']")) {
      expect(tr.hasAttribute("data-selected")).toBe(false);
    }
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

const EMPTY_TABLE = `
  <div data-ui="table" data-size="md">
    <table data-part="table">
      <thead data-part="thead">
        <tr data-part="tr">
          <th data-part="th" scope="col"><input data-part="checkbox" type="checkbox" aria-label="Select all rows"></th>
          <th data-part="th" scope="col" data-sortable aria-sort="none">Name</th>
        </tr>
      </thead>
      <tbody data-part="tbody"></tbody>
    </table>
  </div>`;

describe("table · empty state", () => {
  it("sorting an empty table is a no-op and leaves aria-sort untouched", () => {
    const { root, api } = setup(EMPTY_TABLE);
    expect(() => api.sort(1, "ascending")).not.toThrow();
    expect(th(root, 1).getAttribute("aria-sort")).toBe("none");
  });

  it("clicking a header on an empty table does not throw", () => {
    const { root } = setup(EMPTY_TABLE);
    expect(() => clickHeader(root, 1)).not.toThrow();
    expect(th(root, 1).getAttribute("aria-sort")).toBe("none");
  });

  it("selectAll / getSelected are safe with no rows", () => {
    const { root, api } = setup(EMPTY_TABLE);
    expect(() => api.selectAll()).not.toThrow();
    expect(api.getSelected()).toEqual([]);
    expect(headerCheckbox(root).checked).toBe(false);
    expect(headerCheckbox(root).indeterminate).toBe(false);
  });
});

// ── Grouped rows ──────────────────────────────────────────────────────────────

describe("table · grouped rows", () => {
  it("group-header rows are neither sorted nor selected", () => {
    const { root, api } = setup(`
      <div data-ui="table">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr">
            <th data-part="th" data-sortable aria-sort="none">Name</th>
          </tr></thead>
          <tbody data-part="tbody">
            <tr data-part="group-header"><td data-part="td">Engineering</td></tr>
            <tr data-part="tr"><td data-part="td">Charlie</td></tr>
            <tr data-part="tr"><td data-part="td">Alice</td></tr>
          </tbody>
        </table>
      </div>`);
    api.selectAll();
    // Only the two [data-part='tr'] rows are addressable.
    expect(api.getSelected()).toEqual([0, 1]);
    const groupHeader = root.querySelector("[data-part='group-header']")!;
    expect(groupHeader.hasAttribute("data-selected")).toBe(false);

    api.sort(0, "ascending");
    expect(col(root, 0)).toEqual(["Alice", "Charlie"]);
    // The group header stays put at the top of the body.
    expect(root.querySelector("[data-part='tbody'] tr")!.getAttribute("data-part")).toBe("group-header");
  });
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

describe("table · lifecycle", () => {
  it("double init returns the same API", () => {
    const { root, api } = setup(SORT_TABLE);
    expect(createTable(root)).toBe(api);
  });

  it("destroy removes handlers and the private handle", () => {
    const { root, api } = setup(SORT_TABLE);
    api.destroy();
    expect((root as any)._faqirTable).toBeUndefined();
    // With listeners gone, a header click no longer sorts.
    clickHeader(root, 0);
    expect(th(root, 0).getAttribute("aria-sort")).toBe("none");
    expect(col(root, 0)).toEqual(["Charlie", "Alice", "Bob"]);
  });
});
