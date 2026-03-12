// @ui:controller popover
// @ui:provides open close toggle destroy

import { onOutsideClick } from "../../core/events.js";

const KEY = "__loomPopover";

export function createPopover(root) {
  if (root[KEY]) return root[KEY];
  const trigger = root.querySelector("[data-part='trigger']");
  const content = root.querySelector("[data-part='content']");
  const closeButtons = [...root.querySelectorAll("[data-part='close']")];
  let stopOutsideClick = () => {};
  if (trigger && content?.id) trigger.setAttribute("aria-controls", content.id);
  function sync() {
    const isOpen = root.dataset.state === "open";
    if (content) content.hidden = !isOpen;
    trigger?.setAttribute("aria-expanded", String(isOpen));
  }
  function open() { root.dataset.state = "open"; sync(); return api; }
  function close() { root.dataset.state = "closed"; sync(); return api; }
  function toggle() { return root.dataset.state === "open" ? close() : open(); }
  trigger?.addEventListener("click", toggle);
  content?.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault?.(); close(); } });
  closeButtons.forEach((button) => button.addEventListener("click", close));
  if (typeof document !== "undefined") stopOutsideClick = onOutsideClick(document, root, close);
  sync();
  function destroy() { stopOutsideClick(); delete root[KEY]; }
  const api = { open, close, toggle, destroy };
  root[KEY] = api;
  return api;
}

