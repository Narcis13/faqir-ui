// @ui:controller tooltip
// @ui:provides show hide destroy

import { debounce } from "../../core/utils.js";

export function createTooltip(root) {
  // Prevent double-init
  if (root._faqirTooltip) return root._faqirTooltip;

  const trigger = root.querySelector("[data-part='trigger']");
  const content = root.querySelector("[data-part='content']");

  let showTimer = null;
  let hideTimer = null;

  function show() {
    clearTimeout(hideTimer);
    hideTimer = null;
    root.dataset.state = "visible";
    content.hidden = false;
  }

  function hide() {
    clearTimeout(showTimer);
    showTimer = null;
    root.dataset.state = "hidden";
    content.hidden = true;
  }

  function scheduleShow() {
    clearTimeout(hideTimer);
    hideTimer = null;
    showTimer = setTimeout(show, 200);
  }

  function scheduleHide() {
    clearTimeout(showTimer);
    showTimer = null;
    hideTimer = setTimeout(hide, 100);
  }

  function onMouseEnter() {
    scheduleShow();
  }

  function onMouseLeave() {
    scheduleHide();
  }

  function onFocusIn() {
    scheduleShow();
  }

  function onFocusOut() {
    scheduleHide();
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "visible") {
      e.stopPropagation();
      hide();
    }
  }

  trigger?.addEventListener("mouseenter", onMouseEnter);
  trigger?.addEventListener("mouseleave", onMouseLeave);
  trigger?.addEventListener("focusin", onFocusIn);
  trigger?.addEventListener("focusout", onFocusOut);
  root.addEventListener("keydown", onKeyDown);

  function destroy() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    trigger?.removeEventListener("mouseenter", onMouseEnter);
    trigger?.removeEventListener("mouseleave", onMouseLeave);
    trigger?.removeEventListener("focusin", onFocusIn);
    trigger?.removeEventListener("focusout", onFocusOut);
    root.removeEventListener("keydown", onKeyDown);
    delete root._faqirTooltip;
  }

  const api = { show, hide, destroy };
  root._faqirTooltip = api;
  return api;
}
