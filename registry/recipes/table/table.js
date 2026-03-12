// @ui:controller table
// @ui:provides sort destroy

const KEY = "__loomTable";

export function createTable(root) {
  if (root[KEY]) return root[KEY];
  const table = root.querySelector("[data-part='table']");
  const body = table?.querySelector("tbody");
  const status = root.querySelector("[data-part='status']");
  const sortButtons = [...root.querySelectorAll("[data-part='sort']")];
  const rowSelects = [...root.querySelectorAll("[data-part='row-select']")];
  function syncSelection() {
    const count = rowSelects.filter((input) => input.checked).length;
    if (status) status.textContent = String(count) + " selected";
  }
  function sort(key, direction = "asc") {
    if (!body) return api;
    const rows = [...body.querySelectorAll("[data-part='row']")];
    rows.sort((left, right) => {
      const a = left.querySelector('[data-column="' + key + '"]')?.textContent?.trim() || "";
      const b = right.querySelector('[data-column="' + key + '"]')?.textContent?.trim() || "";
      return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
    });
    rows.forEach((row) => body.append(row));
    sortButtons.forEach((button) => {
      const active = button.dataset.sortKey === key;
      button.setAttribute("aria-sort", active ? (direction === "asc" ? "ascending" : "descending") : "none");
      button.dataset.direction = active ? direction : "asc";
    });
    return api;
  }
  const sortListeners = sortButtons.map((button) => {
    const onClick = () => {
      const next = button.dataset.direction === "asc" ? "desc" : "asc";
      sort(button.dataset.sortKey || "", next);
    };
    button.addEventListener("click", onClick);
    return { button, onClick };
  });
  rowSelects.forEach((input) => input.addEventListener("change", syncSelection));
  syncSelection();
  function destroy() {
    sortListeners.forEach(({ button, onClick }) => button.removeEventListener("click", onClick));
    rowSelects.forEach((input) => input.removeEventListener("change", syncSelection));
    delete root[KEY];
  }
  const api = { sort, destroy };
  root[KEY] = api;
  return api;
}

