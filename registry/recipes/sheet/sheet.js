// @ui:controller sheet
// @ui:provides open close toggle destroy

import { onOutsideClick } from "../../core/events.js";
import { trapFocus } from "../../core/focus.js";
import { waitForTransition } from "../../core/motion.js";

const KEY = "__loomSheet";

export function createSheet(root) {
  if (root[KEY]) return root[KEY];
  const trigger = root.querySelector("[data-part='trigger']");
  const overlay = root.querySelector("[data-part='overlay']");
  const panel = root.querySelector("[data-part='panel']");
  const title = root.querySelector("[data-part='title']");
  const closeButtons = [...root.querySelectorAll("[data-part='close']")];
  let releaseFocus = null;
  let stopOutsideClick = () => {};
  if (panel) {
    panel.id ||= (root.id ? root.id + "-panel" : "loom-panel");
    panel.setAttribute("tabindex", panel.getAttribute("tabindex") ?? "-1");
    if (title) {
      title.id ||= (root.id ? root.id + "-title" : "loom-title");
      if (!panel.getAttribute("aria-labelledby")) panel.setAttribute("aria-labelledby", title.id);
    }
  }
  if (trigger && panel?.id) trigger.setAttribute("aria-controls", panel.id);
  function sync() {
    const visible = root.dataset.state === "open" || root.dataset.state === "closing";
    if (overlay) overlay.hidden = !visible;
    if (panel) panel.hidden = !visible;
    trigger?.setAttribute("aria-expanded", String(root.dataset.state === "open"));
  }
  function open() {
    if (!panel || root.dataset.state === "open") return api;
    root.dataset.state = "open";
    sync();
    releaseFocus?.();
    releaseFocus = trapFocus(panel);
    panel.focus?.();
    return api;
  }
  async function close() {
    if (!panel || root.dataset.state === "closed") return api;
    root.dataset.state = "closing";
    sync();
    await waitForTransition(panel, 260);
    releaseFocus?.();
    releaseFocus = null;
    root.dataset.state = "closed";
    sync();
    trigger?.focus?.();
    return api;
  }
  function toggle() { return root.dataset.state === "open" ? close() : open(); }
  function onKeyDown(event) { if (event.key === "Escape" && root.dataset.state === "open") { event.preventDefault?.(); close(); } }
  trigger?.addEventListener("click", toggle);
  overlay?.addEventListener("click", close);
  root.addEventListener("keydown", onKeyDown);
  closeButtons.forEach((button) => button.addEventListener("click", close));
  if (typeof document !== "undefined") stopOutsideClick = onOutsideClick(document, root, () => { if (root.dataset.state === "open") close(); });
  sync();
  function destroy() { stopOutsideClick(); releaseFocus?.(); delete root[KEY]; }
  const api = { open, close, toggle, destroy };
  root[KEY] = api;
  return api;
}

