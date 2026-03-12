// @ui:controller select-custom
// @ui:provides open close select destroy

import { onOutsideClick } from "../../core/events.js";

const KEY = "__loomSelectCustom";

export function createSelectCustom(root) {
  if (root[KEY]) return root[KEY];
  const trigger = root.querySelector("[data-part='trigger']");
  const content = root.querySelector("[data-part='content']");
  const options = [...root.querySelectorAll("[data-part='option']")];
  let stopOutsideClick = () => {};
  function sync() {
    const isOpen = root.dataset.state === "open";
    if (content) content.hidden = !isOpen;
    trigger?.setAttribute("aria-expanded", String(isOpen));
  }
  function open() { root.dataset.state = "open"; sync(); return api; }
  function close() { root.dataset.state = "closed"; sync(); return api; }
  function select(option) {
    if (!option) return api;
    options.forEach((entry) => delete entry.dataset.state);
    option.dataset.state = "selected";
    if (trigger) trigger.textContent = option.dataset.value || option.textContent || "";
    close();
    return api;
  }
  trigger?.addEventListener("click", () => root.dataset.state === "open" ? close() : open());
  content?.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault?.(); close(); } });
  options.forEach((option) => option.addEventListener("click", () => select(option)));
  if (typeof document !== "undefined") stopOutsideClick = onOutsideClick(document, root, close);
  sync();
  function destroy() { stopOutsideClick(); delete root[KEY]; }
  const api = { open, close, select, destroy };
  root[KEY] = api;
  return api;
}

