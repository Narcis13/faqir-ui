// @ui:controller table
// @ui:provides sort selectRow selectAll deselectAll getSelected destroy

export function createTable(root) {
  // Prevent double-init
  if (root._loomTable) return root._loomTable;

  const table = root.querySelector("[data-part='table']");
  const thead = root.querySelector("[data-part='thead']");
  const tbody = root.querySelector("[data-part='tbody']");
  const headerCheckbox = thead?.querySelector("[data-part='checkbox']");
  const sortableHeaders = () =>
    [...root.querySelectorAll("[data-part='th'][data-sortable]")];
  const bodyRows = () =>
    [...(tbody?.querySelectorAll("[data-part='tr']") || [])];

  let lastSelectedIndex = -1;

  function sort(columnIndex, direction) {
    const rows = bodyRows();
    if (rows.length === 0) return;

    const allHeaders = [...(thead?.querySelectorAll("[data-part='th']") || [])];

    // Reset all sort indicators
    sortableHeaders().forEach((th) => {
      th.setAttribute("aria-sort", "none");
    });

    // Set current sort indicator
    if (allHeaders[columnIndex]?.hasAttribute("data-sortable")) {
      allHeaders[columnIndex].setAttribute("aria-sort", direction);
    }

    // Sort the rows
    const sortedRows = rows.sort((a, b) => {
      const aCells = [...a.querySelectorAll("[data-part='td']")];
      const bCells = [...b.querySelectorAll("[data-part='td']")];
      const aVal = aCells[columnIndex]?.textContent.trim() || "";
      const bVal = bCells[columnIndex]?.textContent.trim() || "";

      // Try numeric comparison first
      const aNum = parseFloat(aVal.replace(/[^0-9.-]/g, ""));
      const bNum = parseFloat(bVal.replace(/[^0-9.-]/g, ""));

      let result;
      if (!isNaN(aNum) && !isNaN(bNum)) {
        result = aNum - bNum;
      } else {
        result = aVal.localeCompare(bVal);
      }

      return direction === "ascending" ? result : -result;
    });

    // Re-append sorted rows
    sortedRows.forEach((row) => tbody.appendChild(row));
  }

  function selectRow(index) {
    const rows = bodyRows();
    if (index < 0 || index >= rows.length) return;

    const row = rows[index];
    const isSelected = row.hasAttribute("data-selected");

    if (isSelected) {
      row.removeAttribute("data-selected");
      const checkbox = row.querySelector("[data-part='checkbox']");
      if (checkbox) checkbox.checked = false;
    } else {
      row.setAttribute("data-selected", "");
      const checkbox = row.querySelector("[data-part='checkbox']");
      if (checkbox) checkbox.checked = true;
    }

    lastSelectedIndex = index;
    updateHeaderCheckbox();
  }

  function selectAll() {
    bodyRows().forEach((row) => {
      row.setAttribute("data-selected", "");
      const checkbox = row.querySelector("[data-part='checkbox']");
      if (checkbox) checkbox.checked = true;
    });
    updateHeaderCheckbox();
  }

  function deselectAll() {
    bodyRows().forEach((row) => {
      row.removeAttribute("data-selected");
      const checkbox = row.querySelector("[data-part='checkbox']");
      if (checkbox) checkbox.checked = false;
    });
    lastSelectedIndex = -1;
    updateHeaderCheckbox();
  }

  function getSelected() {
    return bodyRows()
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.hasAttribute("data-selected"))
      .map(({ index }) => index);
  }

  function updateHeaderCheckbox() {
    if (!headerCheckbox) return;
    const rows = bodyRows();
    const selected = rows.filter((r) => r.hasAttribute("data-selected"));

    if (selected.length === 0) {
      headerCheckbox.checked = false;
      headerCheckbox.indeterminate = false;
    } else if (selected.length === rows.length) {
      headerCheckbox.checked = true;
      headerCheckbox.indeterminate = false;
    } else {
      headerCheckbox.checked = false;
      headerCheckbox.indeterminate = true;
    }
  }

  function selectRange(fromIndex, toIndex) {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const rows = bodyRows();

    for (let i = start; i <= end; i++) {
      if (i >= 0 && i < rows.length) {
        rows[i].setAttribute("data-selected", "");
        const checkbox = rows[i].querySelector("[data-part='checkbox']");
        if (checkbox) checkbox.checked = true;
      }
    }

    updateHeaderCheckbox();
  }

  // ── Event Handlers ──

  function onHeaderClick(e) {
    const th = e.target.closest("[data-part='th'][data-sortable]");
    if (!th) return;

    const allHeaders = [...(thead?.querySelectorAll("[data-part='th']") || [])];
    const columnIndex = allHeaders.indexOf(th);
    if (columnIndex < 0) return;

    const currentSort = th.getAttribute("aria-sort");
    let nextDirection;

    if (currentSort === "ascending") {
      nextDirection = "descending";
    } else {
      nextDirection = "ascending";
    }

    sort(columnIndex, nextDirection);
  }

  function onHeaderCheckboxChange() {
    if (headerCheckbox.checked) {
      selectAll();
    } else {
      deselectAll();
    }
  }

  function onRowCheckboxChange(e) {
    const checkbox = e.target.closest("[data-part='checkbox']");
    if (!checkbox || checkbox === headerCheckbox) return;

    const row = checkbox.closest("[data-part='tr']");
    if (!row || !tbody?.contains(row)) return;

    const rows = bodyRows();
    const index = rows.indexOf(row);
    if (index < 0) return;

    // Shift+click for range selection
    if (e.shiftKey && lastSelectedIndex >= 0) {
      e.preventDefault();
      selectRange(lastSelectedIndex, index);
      return;
    }

    if (checkbox.checked) {
      row.setAttribute("data-selected", "");
    } else {
      row.removeAttribute("data-selected");
    }

    lastSelectedIndex = index;
    updateHeaderCheckbox();
  }

  function onRowClick(e) {
    // Don't handle if clicking on a checkbox (handled separately)
    if (e.target.closest("[data-part='checkbox']")) return;

    const row = e.target.closest("[data-part='tr']");
    if (!row || !tbody?.contains(row)) return;

    const rows = bodyRows();
    const index = rows.indexOf(row);
    if (index < 0) return;

    // Shift+click for range selection
    if (e.shiftKey && lastSelectedIndex >= 0) {
      selectRange(lastSelectedIndex, index);
      return;
    }
  }

  thead?.addEventListener("click", onHeaderClick);
  headerCheckbox?.addEventListener("change", onHeaderCheckboxChange);
  tbody?.addEventListener("change", onRowCheckboxChange);
  tbody?.addEventListener("click", onRowClick);

  function destroy() {
    thead?.removeEventListener("click", onHeaderClick);
    headerCheckbox?.removeEventListener("change", onHeaderCheckboxChange);
    tbody?.removeEventListener("change", onRowCheckboxChange);
    tbody?.removeEventListener("click", onRowClick);
    delete root._loomTable;
  }

  const api = { sort, selectRow, selectAll, deselectAll, getSelected, destroy };
  root._loomTable = api;
  return api;
}
