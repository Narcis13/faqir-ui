// @ui:controller toast
// @ui:provides dismiss destroy

import { waitForTransition } from "../../core/motion.js";

const KEY = "__loomToast";

export function createToast(root) {
  if (root[KEY]) {
    return root[KEY];
  }

  const items = [...root.querySelectorAll("[data-part='item']")];
  const timers = new Map();

  async function dismiss(item) {
    if (!item) return api;
    clearTimeout(timers.get(item));
    item.dataset.state = "closing";
    await waitForTransition(item, 200);
    item.hidden = true;
    return api;
  }

  function arm(item) {
    const duration = Number(item.dataset.duration || 0);
    if (duration > 0) timers.set(item, setTimeout(() => dismiss(item), duration));
    item.querySelector("[data-part='close']")?.addEventListener("click", () => dismiss(item));
  }

  items.forEach(arm);

  function destroy() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    delete root[KEY];
  }

  const api = { dismiss, destroy };
  root[KEY] = api;
  return api;
}

