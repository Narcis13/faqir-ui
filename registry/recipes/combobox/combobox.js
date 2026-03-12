// @ui:controller combobox
// @ui:provides open close select destroy

import { onOutsideClick } from "../../core/events.js";

const KEY = "__loomCombobox";

export function createCombobox(root) {
  if (root[KEY]) return root[KEY];
  const input = root.querySelector("[data-part='input']");
  const list = root.querySelector("[data-part='list']");
  const options = [...root.querySelectorAll("[data-part='option']")];
  let activeIndex = -1;
  let stopOutsideClick = () => {};

  function visibleOptions() { return options.filter((option) => !option.hidden); }
  function sync() {
    const isOpen = root.dataset.state === "open";
    if (list) list.hidden = !isOpen;
    input?.setAttribute("aria-expanded", String(isOpen));
  }
  function highlight(index) {
    const items = visibleOptions();
    activeIndex = items.length === 0 ? -1 : (index + items.length) % items.length;
    options.forEach((option) => delete option.dataset.state);
    const active = items[activeIndex];
    if (active) active.dataset.state = "active";
    return active;
  }
  function open() { root.dataset.state = "open"; sync(); return api; }
  function close() { root.dataset.state = "closed"; activeIndex = -1; options.forEach((option) => delete option.dataset.state); sync(); return api; }
  function filter() {
    const query = (input?.value || "").trim().toLowerCase();
    options.forEach((option) => {
      const label = (option.dataset.value || option.textContent || "").toLowerCase();
      option.hidden = query.length > 0 && !label.includes(query);
    });
    open();
    highlight(0);
  }
  function select(option) {
    if (!option || !input) return api;
    input.value = option.dataset.value || option.textContent || "";
    close();
    return api;
  }
  function onKeyDown(event) {
    if (event.key === "ArrowDown") { event.preventDefault?.(); open(); highlight(activeIndex + 1); return; }
    if (event.key === "ArrowUp") { event.preventDefault?.(); open(); highlight(activeIndex - 1); return; }
    if (event.key === "Enter") {
      const active = visibleOptions()[activeIndex];
      if (active) { event.preventDefault?.(); select(active); }
      return;
    }
    if (event.key === "Escape") { event.preventDefault?.(); close(); }
  }
  input?.addEventListener("focus", open);
  input?.addEventListener("input", filter);
  input?.addEventListener("keydown", onKeyDown);
  options.forEach((option) => option.addEventListener("click", () => select(option)));
  if (typeof document !== "undefined") stopOutsideClick = onOutsideClick(document, root, close);
  sync();
  function destroy() { input?.removeEventListener("focus", open); input?.removeEventListener("input", filter); input?.removeEventListener("keydown", onKeyDown); stopOutsideClick(); delete root[KEY]; }
  const api = { open, close, select, destroy };
  root[KEY] = api;
  return api;
}

