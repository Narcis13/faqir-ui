// @ui:controller popover
// @ui:provides open close toggle destroy

import { onOutsideClick } from "../../core/events.js";

export function createPopover(root) {
  // Prevent double-init
  if (root._faqirPopover) return root._faqirPopover;

  const trigger = root.querySelector("[data-part='trigger']");
  const content = root.querySelector("[data-part='content']");
  const closeBtn = root.querySelector("[data-part='close']");

  let outsideClickCleanup = null;

  function open() {
    root.dataset.state = "open";
    content.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    // Close on outside click
    outsideClickCleanup = onOutsideClick(root, close);
  }

  function close() {
    root.dataset.state = "closed";
    content.hidden = true;
    trigger.setAttribute("aria-expanded", "false");

    if (outsideClickCleanup) {
      outsideClickCleanup();
      outsideClickCleanup = null;
    }
  }

  function toggle() {
    root.dataset.state === "open" ? close() : open();
  }

  // Event: trigger click toggles
  function onTriggerClick() {
    toggle();
  }

  // Event: close button
  function onCloseClick(e) {
    e.stopPropagation();
    close();
  }

  // Event: escape closes
  function onKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "open") {
      e.preventDefault();
      close();
      trigger.focus();
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  closeBtn?.addEventListener("click", onCloseClick);
  root.addEventListener("keydown", onKeyDown);

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    closeBtn?.removeEventListener("click", onCloseClick);
    root.removeEventListener("keydown", onKeyDown);
    if (outsideClickCleanup) outsideClickCleanup();
    delete root._faqirPopover;
  }

  const api = { open, close, toggle, destroy };
  root._faqirPopover = api;
  return api;
}
