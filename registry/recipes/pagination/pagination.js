// @ui:controller pagination
// @ui:provides goTo destroy

const KEY = "__loomPagination";

export function createPagination(root) {
  if (root[KEY]) return root[KEY];
  const prev = root.querySelector("[data-part='prev']");
  const next = root.querySelector("[data-part='next']");
  const items = [...root.querySelectorAll("[data-part='item']")];
  function sync() {
    const page = Number(root.dataset.page || items[0]?.dataset.value || 1);
    items.forEach((item) => {
      const active = Number(item.dataset.value || item.textContent || 0) === page;
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= items.length;
  }
  function goTo(value) {
    const nextPage = Math.min(Math.max(Number(value) || 1, 1), items.length || 1);
    root.dataset.page = String(nextPage);
    sync();
    return api;
  }
  prev?.addEventListener("click", () => goTo(Number(root.dataset.page || 1) - 1));
  next?.addEventListener("click", () => goTo(Number(root.dataset.page || 1) + 1));
  items.forEach((item) => item.addEventListener("click", () => goTo(item.dataset.value || item.textContent || "1")));
  sync();
  function destroy() { delete root[KEY]; }
  const api = { goTo, destroy };
  root[KEY] = api;
  return api;
}

