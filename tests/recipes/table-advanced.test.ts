import { describe, it, expect, beforeEach } from "bun:test";
import { createTable } from "../../registry/recipes/table/table.js";

// Table 2.0 behavior contract — everything beyond the 1.x surface covered by
// tests/recipes/table.test.ts: multi/tristate sorting, filtering (global +
// per-column operators), collapsible groups and tree data with aggregates,
// inline editing with Intl formatting, row/column reordering, column
// resize/hide/pin, CSV export, state persistence, responsive stack labels,
// detail rows, keyboard grid navigation, and the mutation-observer refresh.

// ── Helpers ──────────────────────────────────────────────────────────────────

function setup(html: string) {
  document.body.innerHTML = html;
  const root = document.querySelector("[data-ui='table']") as HTMLElement;
  const api = createTable(root);
  return { root, api };
}

const bodyRows = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-part='tbody'] [data-part='tr']")] as HTMLElement[];

const col = (root: HTMLElement, i: number) =>
  bodyRows(root).map((tr) => (tr.querySelectorAll("[data-part='td']")[i]?.textContent ?? "").trim());

const visibleCol = (root: HTMLElement, i: number) =>
  bodyRows(root)
    .filter((tr) => !tr.hasAttribute("data-filtered") && !tr.hasAttribute("data-collapsed"))
    .map((tr) => (tr.querySelectorAll("[data-part='td']")[i]?.textContent ?? "").trim());

const th = (root: HTMLElement, i: number) =>
  root.querySelectorAll("[data-part='thead'] [data-part='th']")[i] as HTMLElement;

const click = (el: Element, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
const dblclick = (el: Element) => el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function capture(root: HTMLElement, event: string) {
  const seen: any[] = [];
  root.addEventListener(event, (e: any) => seen.push(e.detail));
  return seen;
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LEDGER = (rootAttrs = "") => `
  <div data-ui="table" ${rootAttrs} data-locale="en-US" data-currency="USD">
    <table data-part="table">
      <thead data-part="thead">
        <tr data-part="tr">
          <th data-part="th" scope="col" data-sortable aria-sort="none">Account</th>
          <th data-part="th" scope="col" data-sortable aria-sort="none" data-format="currency">Amount</th>
          <th data-part="th" scope="col" data-sortable aria-sort="none">Date</th>
        </tr>
      </thead>
      <tbody data-part="tbody">
        <tr data-part="tr"><td data-part="td">Rent</td><td data-part="td" data-format="currency" data-value="2150">$2,150.00</td><td data-part="td">2026-06-12</td></tr>
        <tr data-part="tr"><td data-part="td">Consulting</td><td data-part="td" data-format="currency" data-value="8400">$8,400.00</td><td data-part="td">2026-06-05</td></tr>
        <tr data-part="tr"><td data-part="td">Adjustment</td><td data-part="td" data-format="currency" data-value="-350">($350.00)</td><td data-part="td">2026-06-18</td></tr>
        <tr data-part="tr"><td data-part="td">Hosting</td><td data-part="td" data-format="currency" data-value="1240">$1,240.00</td><td data-part="td">2026-06-01</td></tr>
      </tbody>
      <tfoot data-part="tfoot">
        <tr data-part="tr">
          <td data-part="td">Total</td>
          <td data-part="td" data-format="currency" data-aggregate="sum"></td>
          <td data-part="td" data-aggregate="count"></td>
        </tr>
      </tfoot>
    </table>
  </div>`;

const TREE = `
  <div data-ui="table" data-tree data-locale="en-US" data-currency="USD">
    <table data-part="table">
      <thead data-part="thead">
        <tr data-part="tr">
          <th data-part="th" scope="col">Account</th>
          <th data-part="th" scope="col" data-format="currency">Balance</th>
        </tr>
      </thead>
      <tbody data-part="tbody">
        <tr data-part="tr" data-level="0" data-row-id="assets"><td data-part="td">Assets</td><td data-part="td" data-format="currency" data-aggregate="sum"></td></tr>
        <tr data-part="tr" data-level="1" data-row-id="cash"><td data-part="td">Cash</td><td data-part="td" data-format="currency" data-aggregate="sum"></td></tr>
        <tr data-part="tr" data-level="2" data-row-id="checking"><td data-part="td">Checking</td><td data-part="td" data-format="currency" data-value="21980"></td></tr>
        <tr data-part="tr" data-level="2" data-row-id="savings"><td data-part="td">Savings</td><td data-part="td" data-format="currency" data-value="5500"></td></tr>
        <tr data-part="tr" data-level="1" data-row-id="ar"><td data-part="td">Receivable</td><td data-part="td" data-format="currency" data-value="34250"></td></tr>
        <tr data-part="tr" data-level="0" data-row-id="liabilities"><td data-part="td">Liabilities</td><td data-part="td" data-format="currency" data-value="12900"></td></tr>
      </tbody>
    </table>
  </div>`;

const GROUPED = `
  <div data-ui="table" data-groupable data-locale="en-US" data-currency="USD">
    <table data-part="table">
      <thead data-part="thead">
        <tr data-part="tr">
          <th data-part="th" scope="col">Team</th>
          <th data-part="th" scope="col" data-format="currency">Spend</th>
        </tr>
      </thead>
      <tbody data-part="tbody">
        <tr data-part="group-header"><td data-part="td">Engineering</td><td data-part="td" data-format="currency" data-aggregate="sum" data-col="1"></td></tr>
        <tr data-part="tr"><td data-part="td">Platform</td><td data-part="td" data-format="currency" data-value="3400"></td></tr>
        <tr data-part="tr"><td data-part="td">Mobile</td><td data-part="td" data-format="currency" data-value="3420"></td></tr>
        <tr data-part="group-header"><td data-part="td">Design</td><td data-part="td" data-format="currency" data-aggregate="sum" data-col="1"></td></tr>
        <tr data-part="tr"><td data-part="td">Brand</td><td data-part="td" data-format="currency" data-value="2625"></td></tr>
      </tbody>
    </table>
  </div>`;

// ── Multi-sort & tristate ────────────────────────────────────────────────────

describe("table 2.0 · sorting", () => {
  it("tristate cycle: third click restores the original order", () => {
    const { root } = setup(LEDGER('data-sort-cycle="tristate"'));
    const original = col(root, 0);
    click(th(root, 0));
    expect(col(root, 0)).toEqual(["Adjustment", "Consulting", "Hosting", "Rent"]);
    click(th(root, 0));
    expect(col(root, 0)).toEqual(["Rent", "Hosting", "Consulting", "Adjustment"]);
    click(th(root, 0));
    expect(th(root, 0).getAttribute("aria-sort")).toBe("none");
    expect(col(root, 0)).toEqual(original);
  });

  it("shift+click adds a secondary sort with order badges (data-multi-sort)", () => {
    const { root } = setup(`
      <div data-ui="table" data-multi-sort>
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr">
            <th data-part="th" data-sortable aria-sort="none">Group</th>
            <th data-part="th" data-sortable aria-sort="none">Name</th>
          </tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td">B</td><td data-part="td">Zoe</td></tr>
            <tr data-part="tr"><td data-part="td">A</td><td data-part="td">Ana</td></tr>
            <tr data-part="tr"><td data-part="td">B</td><td data-part="td">Ana</td></tr>
            <tr data-part="tr"><td data-part="td">A</td><td data-part="td">Zoe</td></tr>
          </tbody>
        </table>
      </div>`);
    click(th(root, 0));
    click(th(root, 1), { shiftKey: true });
    expect(th(root, 0).getAttribute("aria-sort")).toBe("ascending");
    expect(th(root, 1).getAttribute("aria-sort")).toBe("ascending");
    expect(th(root, 0).getAttribute("data-sort-order")).toBe("1");
    expect(th(root, 1).getAttribute("data-sort-order")).toBe("2");
    expect(col(root, 0)).toEqual(["A", "A", "B", "B"]);
    expect(col(root, 1)).toEqual(["Ana", "Zoe", "Ana", "Zoe"]);
    // A plain click collapses back to a single sort.
    click(th(root, 1));
    expect(th(root, 0).getAttribute("aria-sort")).toBe("none");
    expect(th(root, 0).hasAttribute("data-sort-order")).toBe(false);
  });

  it("data-sort-value overrides the cell text for ordering", () => {
    const { root, api } = setup(`
      <div data-ui="table">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr"><th data-part="th" data-sortable aria-sort="none">Status</th></tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td" data-sort-value="3">Overdue</td></tr>
            <tr data-part="tr"><td data-part="td" data-sort-value="1">Draft</td></tr>
            <tr data-part="tr"><td data-part="td" data-sort-value="2">Sent</td></tr>
          </tbody>
        </table>
      </div>`);
    api.sort(0, "ascending");
    expect(col(root, 0)).toEqual(["Draft", "Sent", "Overdue"]);
  });

  it("accounting parentheses parse as negative for sorting and flags", () => {
    const { root, api } = setup(LEDGER());
    api.sort(1, "ascending");
    expect(col(root, 0)).toEqual(["Adjustment", "Hosting", "Rent", "Consulting"]);
    const negCell = bodyRows(root)[0].querySelectorAll("[data-part='td']")[1]!;
    expect(negCell.hasAttribute("data-negative")).toBe(true);
  });

  it("sortBy applies multiple specs and clearSort restores original order", () => {
    const { root, api } = setup(LEDGER());
    const original = col(root, 0);
    api.sortBy([{ column: 1, direction: "descending" }]);
    expect(col(root, 0)).toEqual(["Consulting", "Rent", "Hosting", "Adjustment"]);
    api.clearSort();
    expect(col(root, 0)).toEqual(original);
  });

  it("emits faqir:sort with the active sort specs", () => {
    const { root } = setup(LEDGER());
    const events = capture(root, "faqir:sort");
    click(th(root, 2));
    expect(events).toEqual([{ sorts: [{ column: 2, direction: "ascending" }] }]);
  });

  it("Enter on a focused sortable header sorts (keyboard activation)", () => {
    const { root } = setup(LEDGER());
    expect(th(root, 0).getAttribute("tabindex")).toBe("0");
    key(th(root, 0), "Enter");
    expect(th(root, 0).getAttribute("aria-sort")).toBe("ascending");
    expect(col(root, 0)).toEqual(["Adjustment", "Consulting", "Hosting", "Rent"]);
  });
});

// ── Filtering ────────────────────────────────────────────────────────────────

describe("table 2.0 · filtering", () => {
  it("setFilter hides non-matching rows and emits faqir:filter", () => {
    const { root, api } = setup(LEDGER());
    const events = capture(root, "faqir:filter");
    api.setFilter("consult");
    expect(visibleCol(root, 0)).toEqual(["Consulting"]);
    expect(bodyRows(root)[0].hasAttribute("data-filtered")).toBe(true);
    expect(events[0]).toEqual({ query: "consult", visible: 1, total: 4 });
    api.clearFilters();
    expect(visibleCol(root, 0).length).toBe(4);
  });

  it("column filters support numeric operators and ranges", () => {
    const { root, api } = setup(LEDGER());
    api.setColumnFilter(1, ">=2000");
    expect(visibleCol(root, 0)).toEqual(["Rent", "Consulting"]);
    api.setColumnFilter(1, "1000..3000");
    expect(visibleCol(root, 0)).toEqual(["Rent", "Hosting"]);
    api.setColumnFilter(1, "<0");
    expect(visibleCol(root, 0)).toEqual(["Adjustment"]);
    api.setColumnFilter(1, null);
    expect(visibleCol(root, 0).length).toBe(4);
  });

  it("filter-row inputs auto-bind per column (debounced)", async () => {
    const { root } = setup(`
      <div data-ui="table">
        <table data-part="table">
          <thead data-part="thead">
            <tr data-part="tr">
              <th data-part="th" data-sortable aria-sort="none">Name</th>
              <th data-part="th" data-format="number">Qty</th>
            </tr>
            <tr data-part="filter-row">
              <td data-part="td"><input data-part="filter-input" aria-label="Filter Name"></td>
              <td data-part="td"><input data-part="filter-input" aria-label="Filter Qty"></td>
            </tr>
          </thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td">Alpha</td><td data-part="td">5</td></tr>
            <tr data-part="tr"><td data-part="td">Beta</td><td data-part="td">12</td></tr>
          </tbody>
        </table>
      </div>`);
    const input = root.querySelectorAll("[data-part='filter-input']")[1] as HTMLInputElement;
    input.value = ">10";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick(200);
    expect(visibleCol(root, 0)).toEqual(["Beta"]);
  });

  it("a global [data-part='filter'] input binds to the quick filter", async () => {
    const { root } = setup(`
      <div data-ui="table">
        <input data-part="filter" aria-label="Quick filter">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr"><th data-part="th">Name</th></tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td">Alpha</td></tr>
            <tr data-part="tr"><td data-part="td">Beta</td></tr>
          </tbody>
        </table>
      </div>`);
    const input = root.querySelector("[data-part='filter']") as HTMLInputElement;
    input.value = "bet";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick(200);
    expect(visibleCol(root, 0)).toEqual(["Beta"]);
  });

  it("shows the empty-state row when everything is filtered out", () => {
    const { root, api } = setup(`
      <div data-ui="table">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr"><th data-part="th">Name</th></tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td">Alpha</td></tr>
            <tr data-part="empty" hidden><td data-part="td">Nothing here</td></tr>
          </tbody>
        </table>
      </div>`);
    const empty = root.querySelector("[data-part='empty']")!;
    expect(empty.hasAttribute("hidden")).toBe(true);
    api.setFilter("zzz");
    expect(empty.hasAttribute("hidden")).toBe(false);
    api.clearFilters();
    expect(empty.hasAttribute("hidden")).toBe(true);
  });

  it("aggregates recompute over visible rows; selectAll skips filtered rows", () => {
    const { root, api } = setup(LEDGER());
    const sumCell = root.querySelector("[data-part='tfoot'] [data-aggregate='sum']")!;
    const countCell = root.querySelector("[data-part='tfoot'] [data-aggregate='count']")!;
    expect(sumCell.getAttribute("data-value")).toBe("11440");
    expect(countCell.textContent).toBe("4");
    api.setColumnFilter(1, ">2000");
    expect(sumCell.getAttribute("data-value")).toBe("10550");
    expect(countCell.textContent).toBe("2");
    api.selectAll();
    expect(api.getSelected()).toEqual([0, 1]); // Rent + Consulting only
  });
});

// ── Groups ───────────────────────────────────────────────────────────────────

describe("table 2.0 · collapsible groups", () => {
  it("injects expanders, computes group aggregates, toggles members", () => {
    const { root, api } = setup(GROUPED);
    const headers = [...root.querySelectorAll("[data-part='group-header']")] as HTMLElement[];
    const btn = headers[0].querySelector("button[data-part='expander']")!;
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(headers[0].getAttribute("data-state")).toBe("expanded");
    // Per-group sums (Intl-formatted, raw value on data-value).
    const sums = headers.map((h) => h.querySelector("[data-aggregate]")!.getAttribute("data-value"));
    expect(sums).toEqual(["6820", "2625"]);
    expect(headers[0].querySelector("[data-aggregate]")!.textContent).toBe("$6,820.00");

    const events = capture(root, "faqir:group-toggle");
    api.toggleGroup(0);
    expect(headers[0].getAttribute("data-state")).toBe("collapsed");
    expect(bodyRows(root)[0].hasAttribute("data-collapsed")).toBe(true);
    expect(bodyRows(root)[1].hasAttribute("data-collapsed")).toBe(true);
    expect(bodyRows(root)[2].hasAttribute("data-collapsed")).toBe(false); // Design row untouched
    expect(events[0].expanded).toBe(false);
  });

  it("clicking a group header row toggles it (data-groupable)", () => {
    const { root } = setup(GROUPED);
    const gh = root.querySelector("[data-part='group-header']") as HTMLElement;
    click(gh.querySelector("[data-part='td']")!);
    expect(gh.getAttribute("data-state")).toBe("collapsed");
    click(gh.querySelector("[data-part='td']")!);
    expect(gh.getAttribute("data-state")).toBe("expanded");
  });

  it("collapseAll / expandAll drive every group", () => {
    const { root, api } = setup(GROUPED);
    api.collapseAll();
    expect(bodyRows(root).every((r) => r.hasAttribute("data-collapsed"))).toBe(true);
    api.expandAll();
    expect(bodyRows(root).every((r) => !r.hasAttribute("data-collapsed"))).toBe(true);
  });
});

// ── Tree data ────────────────────────────────────────────────────────────────

describe("table 2.0 · tree data", () => {
  it("sets treegrid semantics: role, aria-level, expanders and leaf placeholders", () => {
    const { root } = setup(TREE);
    expect(root.querySelector("[data-part='table']")!.getAttribute("role")).toBe("treegrid");
    const rows = bodyRows(root);
    expect(rows.map((r) => r.getAttribute("aria-level"))).toEqual(["1", "2", "3", "3", "2", "1"]);
    expect(rows[0].querySelector("button[data-part='expander']")).toBeTruthy();
    expect(rows[0].getAttribute("aria-expanded")).toBe("true");
    expect(rows[2].querySelector("span[data-part='expander'][data-leaf]")).toBeTruthy();
    expect(rows[2].hasAttribute("aria-expanded")).toBe(false);
    const treeCell = rows[2].querySelector("[data-tree-cell]") as HTMLElement;
    expect(treeCell.style.getPropertyValue("--table-level")).toBe("2");
  });

  it("collapse hides all descendants; expand restores nested collapsed state", () => {
    const { root, api } = setup(TREE);
    const rows = bodyRows(root);
    // Collapse "Cash" (level 1), then collapse "Assets" (level 0).
    api.toggleRow(rows[1], false);
    expect(rows[2].hasAttribute("data-collapsed")).toBe(true);
    expect(rows[3].hasAttribute("data-collapsed")).toBe(true);
    api.toggleRow(rows[0], false);
    expect(rows[1].hasAttribute("data-collapsed")).toBe(true);
    expect(rows[4].hasAttribute("data-collapsed")).toBe(true);
    // Expanding Assets reveals its children but keeps Cash's subtree closed.
    api.toggleRow(rows[0], true);
    expect(rows[1].hasAttribute("data-collapsed")).toBe(false);
    expect(rows[4].hasAttribute("data-collapsed")).toBe(false);
    expect(rows[2].hasAttribute("data-collapsed")).toBe(true);
    expect(rows[3].hasAttribute("data-collapsed")).toBe(true);
  });

  it("clicking an expander toggles and emits faqir:tree-toggle", () => {
    const { root } = setup(TREE);
    const events = capture(root, "faqir:tree-toggle");
    const btn = bodyRows(root)[0].querySelector("button[data-part='expander']")!;
    click(btn);
    expect(bodyRows(root)[0].getAttribute("aria-expanded")).toBe("false");
    expect(events[0].expanded).toBe(false);
  });

  it("sorting stays within siblings — children never leave their parent", () => {
    const { root, api } = setup(TREE);
    api.sort(0, "ascending");
    // Top level: Assets < Liabilities. Under Assets: Cash < Receivable.
    // Under Cash: Checking < Savings. Hierarchy intact.
    expect(col(root, 0)).toEqual(["Assets", "Cash", "Checking", "Savings", "Receivable", "Liabilities"]);
    api.sort(0, "descending");
    expect(col(root, 0)).toEqual(["Liabilities", "Assets", "Receivable", "Cash", "Savings", "Checking"]);
  });

  it("parent aggregate cells roll up their descendants", () => {
    const { root } = setup(TREE);
    const rows = bodyRows(root);
    const assets = rows[0].querySelectorAll("[data-part='td']")[1]!;
    const cash = rows[1].querySelectorAll("[data-part='td']")[1]!;
    expect(cash.getAttribute("data-value")).toBe("27480"); // 21980 + 5500
    expect(assets.getAttribute("data-value")).toBe("61730"); // 27480 + 34250 (leaves only summed)
    expect(assets.textContent).toBe("$61,730.00");
  });

  it("filtering keeps the ancestor path of a match visible", () => {
    const { root, api } = setup(TREE);
    api.setFilter("savings");
    expect(visibleCol(root, 0)).toEqual(["Assets", "Cash", "Savings"]);
  });
});

// ── Inline editing ───────────────────────────────────────────────────────────

const EDITABLE = `
  <div data-ui="table" data-editable data-locale="en-US" data-currency="USD">
    <table data-part="table">
      <thead data-part="thead">
        <tr data-part="tr">
          <th data-part="th" scope="col" data-readonly>Item</th>
          <th data-part="th" scope="col" data-format="currency" data-editable>Price</th>
          <th data-part="th" scope="col" data-format="number" data-editable>Qty</th>
        </tr>
      </thead>
      <tbody data-part="tbody">
        <tr data-part="tr"><td data-part="td">Hosting</td><td data-part="td" data-format="currency" data-value="1240">$1,240.00</td><td data-part="td" data-format="number" data-value="2">2</td></tr>
        <tr data-part="tr"><td data-part="td">Support</td><td data-part="td" data-format="currency" data-value="800">$800.00</td><td data-part="td" data-format="number" data-value="1">1</td></tr>
      </tbody>
      <tfoot data-part="tfoot">
        <tr data-part="tr"><td data-part="td">Total</td><td data-part="td" data-format="currency" data-aggregate="sum"></td><td data-part="td" data-format="number" data-aggregate="sum"></td></tr>
      </tfoot>
    </table>
  </div>`;

const cellAt = (root: HTMLElement, r: number, c: number) =>
  bodyRows(root)[r].querySelectorAll("[data-part='td']")[c] as HTMLElement;
const editor = (root: HTMLElement) => root.querySelector("[data-part='cell-input']") as HTMLInputElement;

describe("table 2.0 · inline editing", () => {
  it("dblclick opens an editor; Enter commits with Intl currency formatting", () => {
    const { root } = setup(EDITABLE);
    const events = capture(root, "faqir:cell-edit");
    const cell = cellAt(root, 0, 1);
    dblclick(cell);
    expect(cell.hasAttribute("data-editing")).toBe(true);
    const input = editor(root);
    expect(input.value).toBe("1240");
    input.value = "1399.5";
    key(input, "Enter");
    expect(cell.hasAttribute("data-editing")).toBe(false);
    expect(cell.getAttribute("data-value")).toBe("1399.5");
    expect(cell.textContent).toBe("$1,399.50");
    expect(events[0]).toMatchObject({ rowIndex: 0, colIndex: 1, oldValue: "1240", value: "1399.5" });
  });

  it("Escape cancels and restores the original content", () => {
    const { root } = setup(EDITABLE);
    const events = capture(root, "faqir:edit-cancel");
    const cell = cellAt(root, 0, 2);
    dblclick(cell);
    editor(root).value = "999";
    key(editor(root), "Escape");
    expect(cell.textContent).toBe("2");
    expect(cell.getAttribute("data-value")).toBe("2");
    expect(events.length).toBe(1);
  });

  it("rejects invalid numbers in numeric columns (stays editing, data-invalid)", () => {
    const { root } = setup(EDITABLE);
    const cell = cellAt(root, 0, 1);
    dblclick(cell);
    const input = editor(root);
    input.value = "not a number";
    key(input, "Enter");
    expect(cell.hasAttribute("data-editing")).toBe(true);
    expect(input.hasAttribute("data-invalid")).toBe(true);
  });

  it("readonly column cells and interactive cells are not editable", () => {
    const { root, api } = setup(EDITABLE);
    dblclick(cellAt(root, 0, 0)); // th is data-readonly
    expect(root.querySelector("[data-part='cell-input']")).toBeNull();
    expect(api.startEdit(0, 0)).toBe(false);
  });

  it("Tab commits and moves to the next editable cell", () => {
    const { root } = setup(EDITABLE);
    dblclick(cellAt(root, 0, 1));
    editor(root).value = "1500";
    key(editor(root), "Tab");
    // Commit landed, editor moved to the Qty cell of the same row.
    expect(cellAt(root, 0, 1).textContent).toBe("$1,500.00");
    expect(cellAt(root, 0, 2).hasAttribute("data-editing")).toBe(true);
  });

  it("edits update footer aggregates immediately", () => {
    const { root } = setup(EDITABLE);
    const sum = root.querySelector("[data-part='tfoot'] [data-aggregate='sum']")!;
    expect(sum.getAttribute("data-value")).toBe("2040");
    dblclick(cellAt(root, 1, 1));
    editor(root).value = "1000";
    key(editor(root), "Enter");
    expect(sum.getAttribute("data-value")).toBe("2240");
  });

  it("startEdit / commitEdit are exposed on the API", () => {
    const { root, api } = setup(EDITABLE);
    expect(api.startEdit(1, 2)).toBe(true);
    editor(root).value = "7";
    expect(api.commitEdit()).toBe(true);
    expect(cellAt(root, 1, 2).getAttribute("data-value")).toBe("7");
  });
});

// ── Row reordering ───────────────────────────────────────────────────────────

const REORDER = `
  <div data-ui="table" data-reorderable>
    <table data-part="table">
      <thead data-part="thead">
        <tr data-part="tr">
          <th data-part="th" scope="col" aria-label="Order"></th>
          <th data-part="th" scope="col">Name</th>
        </tr>
      </thead>
      <tbody data-part="tbody">
        <tr data-part="tr"><td data-part="td"><button type="button" data-part="drag-handle" aria-label="Reorder"></button></td><td data-part="td">One</td></tr>
        <tr data-part="detail-row" hidden><td data-part="td" colspan="2">One details</td></tr>
        <tr data-part="tr"><td data-part="td"><button type="button" data-part="drag-handle" aria-label="Reorder"></button></td><td data-part="td">Two</td></tr>
        <tr data-part="tr"><td data-part="td"><button type="button" data-part="drag-handle" aria-label="Reorder"></button></td><td data-part="td">Three</td></tr>
      </tbody>
    </table>
  </div>`;

describe("table 2.0 · row reordering", () => {
  it("moveRow reorders rows and emits faqir:row-reorder", () => {
    const { root, api } = setup(REORDER);
    const events = capture(root, "faqir:row-reorder");
    expect(api.moveRow(0, 2)).toBe(true);
    expect(col(root, 1)).toEqual(["Two", "Three", "One"]);
    expect(events[0]).toMatchObject({ from: 0, to: 2 });
  });

  it("detail rows travel with their master row", () => {
    const { root, api } = setup(REORDER);
    api.moveRow(0, 1);
    const parts = [...root.querySelectorAll("[data-part='tbody'] > tr")].map(
      (r) => r.getAttribute("data-part") + ":" + (r.textContent ?? "").trim().split(" ")[0]
    );
    expect(parts).toEqual(["tr:Two", "tr:One", "detail-row:One", "tr:Three"]);
  });

  it("ArrowDown on a drag handle moves the row down one sibling", () => {
    const { root } = setup(REORDER);
    const handle = bodyRows(root)[0].querySelector("[data-part='drag-handle']")!;
    key(handle, "ArrowDown");
    expect(col(root, 1)).toEqual(["Two", "One", "Three"]);
  });

  it("pointer drag over another row reorders on pointerup", () => {
    const { root } = setup(REORDER);
    const events = capture(root, "faqir:row-reorder");
    const handle = bodyRows(root)[0].querySelector("[data-part='drag-handle']")!;
    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: 0 }));
    const target = bodyRows(root)[2];
    target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientY: 40 }));
    expect(bodyRows(root)[0].hasAttribute("data-dragging")).toBe(true);
    expect(target.hasAttribute("data-drop-target")).toBe(true);
    document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(col(root, 1)).toEqual(["Two", "Three", "One"]);
    expect(bodyRows(root).every((r) => !r.hasAttribute("data-dragging"))).toBe(true);
    expect(events.length).toBe(1);
  });

  it("tree mode: a parent's subtree moves with it, and only among siblings", () => {
    const { root } = setup(`
      <div data-ui="table" data-tree data-reorderable>
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr"><th data-part="th" aria-label="Order"></th><th data-part="th">Name</th></tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr" data-level="0"><td data-part="td"><button type="button" data-part="drag-handle" aria-label="Reorder"></button></td><td data-part="td">A</td></tr>
            <tr data-part="tr" data-level="1"><td data-part="td"><button type="button" data-part="drag-handle" aria-label="Reorder"></button></td><td data-part="td">A1</td></tr>
            <tr data-part="tr" data-level="0"><td data-part="td"><button type="button" data-part="drag-handle" aria-label="Reorder"></button></td><td data-part="td">B</td></tr>
          </tbody>
        </table>
      </div>`);
    const handle = bodyRows(root)[0].querySelector("[data-part='drag-handle']")!;
    key(handle, "ArrowDown"); // A moves past its sibling B, dragging A1 along
    expect(col(root, 1)).toEqual(["B", "A", "A1"]);
    // A1 has no siblings — ArrowDown is a no-op.
    const a1Handle = bodyRows(root)[2].querySelector("[data-part='drag-handle']")!;
    key(a1Handle, "ArrowDown");
    expect(col(root, 1)).toEqual(["B", "A", "A1"]);
  });
});

// ── Column operations ────────────────────────────────────────────────────────

describe("table 2.0 · column operations", () => {
  it("moveColumn reorders header + body cells and remaps the active sort", () => {
    const { root, api } = setup(LEDGER());
    api.sort(1, "ascending"); // Amount
    api.moveColumn(1, 2);
    expect(th(root, 2).textContent).toContain("Amount");
    expect(th(root, 2).getAttribute("aria-sort")).toBe("ascending");
    // Default currencySign is "standard" — the authored parens text was
    // re-rendered from data-value at init (parens require data-negatives).
    expect(col(root, 2)).toEqual(["-$350.00", "$1,240.00", "$2,150.00", "$8,400.00"]);
    expect(col(root, 1)).toEqual(["2026-06-18", "2026-06-01", "2026-06-12", "2026-06-05"]);
  });

  it("hideColumn / showColumn / toggleColumn stamp data-col-hidden down the column", () => {
    const { root, api } = setup(LEDGER());
    const events = capture(root, "faqir:col-visibility");
    api.hideColumn(2);
    expect(th(root, 2).hasAttribute("data-col-hidden")).toBe(true);
    for (const row of bodyRows(root)) {
      expect(row.querySelectorAll("[data-part='td']")[2]!.hasAttribute("data-col-hidden")).toBe(true);
    }
    api.toggleColumn(2);
    expect(th(root, 2).hasAttribute("data-col-hidden")).toBe(false);
    expect(events.map((e) => e.hidden)).toEqual([true, false]);
  });

  it("setColumnWidth clamps to data-min/max-width, freezes layout, emits", () => {
    const { root, api } = setup(`
      <div data-ui="table" data-resizable>
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr">
            <th data-part="th" data-min-width="80" data-max-width="300">Name</th>
            <th data-part="th">Other</th>
          </tr></thead>
          <tbody data-part="tbody"><tr data-part="tr"><td data-part="td">x</td><td data-part="td">y</td></tr></tbody>
        </table>
      </div>`);
    const events = capture(root, "faqir:col-resize");
    api.setColumnWidth(0, 20);
    expect(th(root, 0).style.width).toBe("80px");
    api.setColumnWidth(0, 500);
    expect(th(root, 0).style.width).toBe("300px");
    expect(root.hasAttribute("data-resized")).toBe(true);
    expect(events.map((e) => e.width)).toEqual([80, 300]);
    // Handles were injected for resizable roots (opt-out honored via data-no-resize).
    expect(th(root, 0).querySelector("[data-part='resize-handle']")).toBeTruthy();
  });

  it("pinned columns receive sticky attributes and offsets on every cell", () => {
    const { root } = setup(`
      <div data-ui="table">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr">
            <th data-part="th" data-pin="start">Id</th>
            <th data-part="th">Name</th>
          </tr></thead>
          <tbody data-part="tbody"><tr data-part="tr"><td data-part="td">1</td><td data-part="td">Alpha</td></tr></tbody>
        </table>
      </div>`);
    const cell = bodyRows(root)[0].querySelector("[data-part='td']") as HTMLElement;
    expect(cell.getAttribute("data-pin")).toBe("start");
    expect(cell.style.getPropertyValue("--table-pin-offset")).toBe("0px");
    expect(cell.hasAttribute("data-pin-edge")).toBe(true);
  });
});

// ── CSV export & data extraction ─────────────────────────────────────────────

describe("table 2.0 · export & data", () => {
  it("exportCsv writes headers + raw values, escapes, and skips control columns", () => {
    const { api } = setup(`
      <div data-ui="table">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr">
            <th data-part="th"><input data-part="checkbox" type="checkbox" aria-label="Select all rows"></th>
            <th data-part="th">Name</th>
            <th data-part="th" data-format="currency">Amount</th>
          </tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td"><input data-part="checkbox" type="checkbox" aria-label="Select row"></td><td data-part="td">Acme, Inc.</td><td data-part="td" data-value="1200">$1,200.00</td></tr>
            <tr data-part="tr"><td data-part="td"><input data-part="checkbox" type="checkbox" aria-label="Select row"></td><td data-part="td">Say "hi"</td><td data-part="td" data-value="80">$80.00</td></tr>
          </tbody>
        </table>
      </div>`);
    expect(api.exportCsv()).toBe('Name,Amount\n"Acme, Inc.",1200\n"Say ""hi""",80');
  });

  it("exportCsv respects filters unless all:true", () => {
    const { api } = setup(LEDGER());
    api.setFilter("hosting");
    expect(api.exportCsv().split("\n").length).toBe(2); // header + 1 row
    expect(api.exportCsv({ all: true }).split("\n").length).toBe(5);
  });

  it("getData returns keyed objects (data-key wins over header text)", () => {
    const { api } = setup(`
      <div data-ui="table">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr">
            <th data-part="th" data-key="name">Full name</th>
            <th data-part="th" data-key="amount" data-format="currency">Amount</th>
          </tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr" data-row-id="r1"><td data-part="td">Ana</td><td data-part="td" data-value="42">$42.00</td></tr>
          </tbody>
        </table>
      </div>`);
    expect(api.getData()).toEqual([{ name: "Ana", amount: "42", _id: "r1" }]);
  });

  it("getSelectedData returns only selected rows", () => {
    const { api } = setup(LEDGER());
    api.selectRow(1);
    expect(api.getSelectedData().map((d: any) => d.Account)).toEqual(["Consulting"]);
  });
});

// ── State persistence ────────────────────────────────────────────────────────

describe("table 2.0 · state persistence", () => {
  it("getState/setState round-trips sorts, filters, widths, and visibility", () => {
    const first = setup(LEDGER());
    first.api.sort(1, "descending");
    first.api.setFilter("o"); // Consulting / Hosting / Adjustment... anything with o
    first.api.setColumnWidth(0, 220);
    first.api.hideColumn(2);
    const state = first.api.getState();

    const second = setup(LEDGER());
    second.api.setState(state);
    expect(th(second.root, 0).style.width).toBe("220px");
    expect(th(second.root, 2).hasAttribute("data-col-hidden")).toBe(true);
    expect(th(second.root, 1).getAttribute("aria-sort")).toBe("descending");
    expect(visibleCol(second.root, 0)).toEqual(visibleCol(first.root, 0));
  });

  it("data-persist saves to localStorage and restores on re-init", async () => {
    const { root, api } = setup(LEDGER('data-persist="ledger-demo"'));
    api.sort(0, "ascending");
    await tick(250); // debounced save
    const raw = localStorage.getItem("faqir-table:ledger-demo");
    expect(raw).toBeTruthy();
    api.destroy();

    // Fresh table with the same persist key picks the sort back up.
    const again = setup(LEDGER('data-persist="ledger-demo"'));
    expect(th(again.root, 0).getAttribute("aria-sort")).toBe("ascending");
    expect(col(again.root, 0)).toEqual(["Adjustment", "Consulting", "Hosting", "Rent"]);
  });
});

// ── Responsive stack, detail rows, striping ──────────────────────────────────

describe("table 2.0 · responsive & structure extras", () => {
  it("stack mode labels every cell from its column header", () => {
    const { root } = setup(`
      <div data-ui="table" data-responsive="stack">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr">
            <th data-part="th">Expense</th>
            <th data-part="th" data-format="currency">Amount</th>
          </tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td">Catering</td><td data-part="td" data-value="482.9">$482.90</td></tr>
          </tbody>
        </table>
      </div>`);
    const cells = bodyRows(root)[0].querySelectorAll("[data-part='td']");
    expect(cells[0]!.getAttribute("data-label")).toBe("Expense");
    expect(cells[1]!.getAttribute("data-label")).toBe("Amount");
  });

  it("row-toggle shows/hides the detail row and emits faqir:row-expand", () => {
    const { root } = setup(`
      <div data-ui="table">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr"><th data-part="th">Invoice</th><th data-part="th">Details</th></tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td">INV-1</td><td data-part="td"><button type="button" data-part="row-toggle" aria-expanded="false" aria-label="Toggle details"></button></td></tr>
            <tr data-part="detail-row"><td data-part="td" colspan="2">Line items…</td></tr>
          </tbody>
        </table>
      </div>`);
    const detail = root.querySelector("[data-part='detail-row']")!;
    const toggle = root.querySelector("[data-part='row-toggle']")!;
    expect(detail.hasAttribute("hidden")).toBe(true); // synced from aria-expanded="false"
    const events = capture(root, "faqir:row-expand");
    click(toggle);
    expect(detail.hasAttribute("hidden")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    click(toggle);
    expect(detail.hasAttribute("hidden")).toBe(true);
    expect(events.map((e) => e.expanded)).toEqual([true, false]);
  });

  it("striped tables restripe visible rows after filtering", () => {
    const { root, api } = setup(`
      <div data-ui="table" data-variant="striped">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr"><th data-part="th">N</th></tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td">match-1</td></tr>
            <tr data-part="tr"><td data-part="td">skip</td></tr>
            <tr data-part="tr"><td data-part="td">match-2</td></tr>
          </tbody>
        </table>
      </div>`);
    api.setFilter("match");
    const stripes = bodyRows(root).map((r) => r.getAttribute("data-stripe"));
    expect(stripes).toEqual(["odd", null, "even"]);
  });
});

// ── Intl formatting modes ────────────────────────────────────────────────────

describe("table 2.0 · Intl formatting", () => {
  it("data-negatives='parens' renders accounting-style negatives", () => {
    const { root } = setup(`
      <div data-ui="table" data-locale="en-US" data-currency="USD" data-negatives="parens">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr"><th data-part="th" data-format="currency">Amount</th></tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td" data-format="currency" data-value="-350"></td></tr>
          </tbody>
        </table>
      </div>`);
    const cell = bodyRows(root)[0].querySelector("[data-part='td']")!;
    expect(cell.textContent).toBe("($350.00)");
    expect(cell.hasAttribute("data-negative")).toBe(true);
  });

  it("percent format renders data-value percent points via Intl", () => {
    const { root } = setup(`
      <div data-ui="table" data-locale="en-US">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr"><th data-part="th" data-format="percent">VAT</th></tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td" data-format="percent" data-value="19"></td></tr>
          </tbody>
        </table>
      </div>`);
    expect(bodyRows(root)[0].querySelector("[data-part='td']")!.textContent).toBe("19%");
  });
});

// ── Selection extras & keyboard navigation ───────────────────────────────────

describe("table 2.0 · selection & keyboard navigation", () => {
  it("row click toggles selection with data-selectable; single mode is exclusive", () => {
    const single = setup(LEDGER('data-selectable="single"'));
    const cells = (r: number) => bodyRows(single.root)[r].querySelector("[data-part='td']")!;
    click(cells(0));
    expect(single.api.getSelected()).toEqual([0]);
    click(cells(2));
    expect(single.api.getSelected()).toEqual([2]);
    click(cells(2));
    expect(single.api.getSelected()).toEqual([]);

    const multi = setup(LEDGER("data-selectable"));
    const mcells = (r: number) => bodyRows(multi.root)[r].querySelector("[data-part='td']")!;
    click(mcells(0));
    click(mcells(2));
    expect(multi.api.getSelected()).toEqual([0, 2]);
  });

  it("selection changes emit faqir:selection-change", () => {
    const { root, api } = setup(LEDGER());
    const events = capture(root, "faqir:selection-change");
    api.selectRow(1);
    api.deselectAll();
    expect(events.map((e) => e.selected)).toEqual([[1], []]);
  });

  it("navigable grids rove focus with arrow keys", () => {
    const { root } = setup(LEDGER("data-navigable"));
    const firstHeader = th(root, 0);
    expect(firstHeader.getAttribute("tabindex")).toBe("0");
    firstHeader.focus();
    key(firstHeader, "ArrowDown");
    const firstCell = bodyRows(root)[0].querySelector("[data-part='td']") as HTMLElement;
    expect(document.activeElement).toBe(firstCell);
    expect(firstCell.getAttribute("tabindex")).toBe("0");
    expect(firstHeader.getAttribute("tabindex")).toBe("-1");
    key(firstCell, "ArrowRight");
    expect(document.activeElement).toBe(bodyRows(root)[0].querySelectorAll("[data-part='td']")[1]);
    key(document.activeElement!, "End");
    expect(document.activeElement).toBe(bodyRows(root)[0].querySelectorAll("[data-part='td']")[2]);
  });

  it("Space on a focused row cell toggles selection in selectable grids", () => {
    const { root, api } = setup(LEDGER("data-selectable data-navigable"));
    const cell = bodyRows(root)[1].querySelector("[data-part='td']") as HTMLElement;
    cell.focus();
    key(cell, " ");
    expect(api.getSelected()).toEqual([1]);
  });

  it("Enter on a focused editable cell starts editing", () => {
    const { root } = setup(EDITABLE);
    const cell = cellAt(root, 0, 1);
    cell.focus();
    key(cell, "Enter");
    expect(cell.hasAttribute("data-editing")).toBe(true);
  });
});

// ── Mutation-observer refresh ────────────────────────────────────────────────

describe("table 2.0 · auto-refresh on external row changes", () => {
  it("appending a row updates aggregates, labels, and stripes automatically", async () => {
    const { root } = setup(`
      <div data-ui="table" data-variant="striped" data-responsive="stack" data-locale="en-US" data-currency="USD">
        <table data-part="table">
          <thead data-part="thead"><tr data-part="tr">
            <th data-part="th">Name</th>
            <th data-part="th" data-format="currency">Amount</th>
          </tr></thead>
          <tbody data-part="tbody">
            <tr data-part="tr"><td data-part="td">Seed</td><td data-part="td" data-format="currency" data-value="100">$100.00</td></tr>
          </tbody>
          <tfoot data-part="tfoot">
            <tr data-part="tr"><td data-part="td">Total</td><td data-part="td" data-format="currency" data-aggregate="sum"></td></tr>
          </tfoot>
        </table>
      </div>`);
    const sum = root.querySelector("[data-aggregate='sum']")!;
    expect(sum.getAttribute("data-value")).toBe("100");

    const tbody = root.querySelector("[data-part='tbody']")!;
    const row = document.createElement("tr");
    row.setAttribute("data-part", "tr");
    row.innerHTML = `<td data-part="td">New</td><td data-part="td" data-format="currency" data-value="50"></td>`;
    tbody.appendChild(row);
    await tick(60); // mutation observer + rAF refresh

    expect(sum.getAttribute("data-value")).toBe("150");
    expect(row.querySelectorAll("[data-part='td']")[1]!.textContent).toBe("$50.00");
    expect(row.getAttribute("data-label") ?? row.querySelector("[data-part='td']")!.getAttribute("data-label")).toBe("Name");
    expect(bodyRows(root).map((r) => r.getAttribute("data-stripe"))).toEqual(["odd", "even"]);
  });
});
