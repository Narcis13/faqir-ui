// @ui:controller drawer
// @ui:provides open close toggle destroy

import { onOutsideClick } from "../../core/events.js";
import { trapFocus } from "../../core/focus.js";
import { waitForTransition } from "../../core/motion.js";

const KEY = "__loomDrawer";

export function createDrawer(root) {
  if (root[KEY]) {
    return root[KEY];
  }

  const trigger = root.querySelector("[data-part='trigger']");
  const overlay = root.querySelector("[data-part='overlay']");
  const panel = root.querySelector("[data-part='panel']");
  const title = root.querySelector("[data-part='title']");
  const description = root.querySelector("[data-part='description']");
  const closeButtons = [...root.querySelectorAll("[data-part='close']")];
  const externalTriggers = root.id && typeof document !== "undefined"
    ? [...document.querySelectorAll('[data-open="' + root.id + '"]')]
    : [];
  let releaseFocus = null;
  let previouslyFocused = null;
  let stopOutsideClick = () => {};

  if (panel) {
    panel.id ||= (root.id ? root.id + "-panel" : "loom-panel");
    panel.setAttribute("tabindex", panel.getAttribute("tabindex") ?? "-1");

    if (title) {
      title.id ||= (root.id ? root.id + "-title" : "loom-title");
      if (!panel.getAttribute("aria-labelledby")) {
        panel.setAttribute("aria-labelledby", title.id);
      }
    }

    if (description) {
      description.id ||= (root.id ? root.id + "-description" : "loom-description");
      if (!panel.getAttribute("aria-describedby")) {
        panel.setAttribute("aria-describedby", description.id);
      }
    }
  }

  if (trigger && panel?.id) {
    trigger.setAttribute("aria-controls", panel.id);
  }

  function sync() {
    const visible = root.dataset.state === "open" || root.dataset.state === "closing";
    if (overlay) overlay.hidden = !visible;
    if (panel) panel.hidden = !visible;
    trigger?.setAttribute("aria-expanded", String(root.dataset.state === "open"));
  }

  function open() {
    if (!panel || root.dataset.state === "open") {
      return api;
    }

    previouslyFocused = typeof document !== "undefined" ? document.activeElement : null;
    root.dataset.state = "open";
    sync();
    releaseFocus?.();
    releaseFocus = trapFocus(panel);
    panel.focus?.();
    return api;
  }

  async function close(options = {}) {
    if (!panel || root.dataset.state === "closed") {
      return api;
    }

    root.dataset.state = "closing";
    sync();
    await waitForTransition(panel, 260);
    releaseFocus?.();
    releaseFocus = null;
    root.dataset.state = "closed";
    sync();

    if (options.focusTrigger !== false) {
      (trigger || previouslyFocused)?.focus?.();
    }

    return api;
  }

  function toggle() {
    return root.dataset.state === "open" ? close() : open();
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && root.dataset.state === "open") {
      event.preventDefault?.();
      close();
    }
  }

  function onTriggerClick() {
    toggle();
  }

  function onOverlayClick() {
    close({ focusTrigger: false });
  }

  function onCloseClick() {
    close();
  }

  trigger?.addEventListener("click", onTriggerClick);
  overlay?.addEventListener("click", onOverlayClick);
  root.addEventListener("keydown", onKeyDown);

  for (const button of closeButtons) {
    button.addEventListener("click", onCloseClick);
  }

  for (const externalTrigger of externalTriggers) {
    externalTrigger.addEventListener("click", onTriggerClick);
  }

  if (typeof document !== "undefined") {
    stopOutsideClick = onOutsideClick(document, root, () => {
      if (root.dataset.state === "open") {
        close({ focusTrigger: false });
      }
    });
  }

  sync();

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    overlay?.removeEventListener("click", onOverlayClick);
    root.removeEventListener("keydown", onKeyDown);

    for (const button of closeButtons) {
      button.removeEventListener("click", onCloseClick);
    }

    for (const externalTrigger of externalTriggers) {
      externalTrigger.removeEventListener("click", onTriggerClick);
    }

    stopOutsideClick();
    releaseFocus?.();
    releaseFocus = null;
    delete root[KEY];
  }

  const api = { open, close, toggle, destroy };
  root[KEY] = api;
  return api;
}

