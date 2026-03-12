// @ui:controller command-palette
// @ui:provides open close destroy

import { onOutsideClick } from "../../core/events.js";
import { trapFocus } from "../../core/focus.js";
import { waitForTransition } from "../../core/motion.js";

const KEY = "__loomCommandPalette";

export function createCommandPalette(root) {
  if (root[KEY]) return root[KEY];
  const trigger = root.querySelector("[data-part='trigger']");
  const overlay = root.querySelector("[data-part='overlay']");
  const panel = root.querySelector("[data-part='panel']");
  const input = root.querySelector("[data-part='input']");
  const items = [...root.querySelectorAll("[data-part='item']")];
  const closeButtons = [...root.querySelectorAll("[data-part='close']")];
  let activeIndex = -1;
  let releaseFocus = null;
  let stopOutsideClick = () => {};
  function visibleItems() { return items.filter((item) => !item.hidden); }
  function sync() {
    const visible = root.dataset.state === "open" || root.dataset.state === "closing";
    if (overlay) overlay.hidden = !visible;
    if (panel) panel.hidden = !visible;
  }
  function highlight(index) {
    const visible = visibleItems();
    activeIndex = visible.length === 0 ? -1 : (index + visible.length) % visible.length;
    items.forEach((item) => delete item.dataset.state);
    const active = visible[activeIndex];
    if (active) active.dataset.state = "active";
  }
  function filter() {
    const query = (input?.value || "").trim().toLowerCase();
    items.forEach((item) => {
      const label = (item.dataset.value || item.textContent || "").toLowerCase();
      item.hidden = query.length > 0 && !label.includes(query);
    });
    highlight(0);
  }
  function open() {
    root.dataset.state = "open";
    sync();
    releaseFocus?.();
    if (panel) releaseFocus = trapFocus(panel);
    input?.focus?.();
    filter();
    return api;
  }
  async function close() {
    root.dataset.state = "closing";
    sync();
    await waitForTransition(panel, 220);
    releaseFocus?.();
    releaseFocus = null;
    root.dataset.state = "closed";
    sync();
    trigger?.focus?.();
    return api;
  }
  function onGlobalKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault?.();
      if (root.dataset.state === "open") close();
      else open();
      return;
    }
    if (event.key === "Escape" && root.dataset.state === "open") {
      event.preventDefault?.();
      close();
    }
  }
  function onInputKeyDown(event) {
    if (event.key === "ArrowDown") { event.preventDefault?.(); highlight(activeIndex + 1); return; }
    if (event.key === "ArrowUp") { event.preventDefault?.(); highlight(activeIndex - 1); return; }
    if (event.key === "Enter") visibleItems()[activeIndex]?.click?.();
  }
  const itemListeners = items.map((item) => {
    const handler = () => {
      if (input) input.value = item.dataset.value || item.textContent || "";
      close();
    };
    item.addEventListener("click", handler);
    return { item, handler };
  });
  trigger?.addEventListener("click", open);
  overlay?.addEventListener("click", close);
  input?.addEventListener("input", filter);
  input?.addEventListener("keydown", onInputKeyDown);
  closeButtons.forEach((button) => button.addEventListener("click", close));
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", onGlobalKeyDown);
    stopOutsideClick = onOutsideClick(document, root, () => { if (root.dataset.state === "open") close(); });
  }
  sync();
  function destroy() {
    trigger?.removeEventListener("click", open);
    overlay?.removeEventListener("click", close);
    input?.removeEventListener("input", filter);
    input?.removeEventListener("keydown", onInputKeyDown);
    closeButtons.forEach((button) => button.removeEventListener("click", close));
    itemListeners.forEach(({ item, handler }) => item.removeEventListener("click", handler));
    globalThis.document?.removeEventListener?.("keydown", onGlobalKeyDown);
    stopOutsideClick();
    releaseFocus?.();
    delete root[KEY];
  }
  const api = { open, close, destroy };
  root[KEY] = api;
  return api;
}

