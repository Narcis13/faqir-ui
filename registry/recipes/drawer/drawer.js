// @ui:controller drawer
// @ui:provides open close toggle destroy

import { trapFocus } from "../../core/focus.js";

export function createDrawer(root) {
  // Prevent double-init
  if (root._faqirDrawer) return root._faqirDrawer;

  const trigger = root.querySelector("[data-part='trigger']");
  const overlay = root.querySelector("[data-part='overlay']");
  const panel = root.querySelector("[data-part='panel']");
  const closeButtons = root.querySelectorAll("[data-part='close']");

  let focusCleanup = null;
  let previouslyFocused = null;

  function open() {
    previouslyFocused = document.activeElement;
    root.dataset.state = "open";
    overlay.hidden = false;
    panel.hidden = false;
    focusCleanup = trapFocus(panel);
    panel.focus?.();
  }

  function close() {
    root.dataset.state = "closing";

    const onEnd = () => {
      root.dataset.state = "closed";
      overlay.hidden = true;
      panel.hidden = true;
      if (focusCleanup) focusCleanup();
      focusCleanup = null;
      previouslyFocused?.focus();
      panel.removeEventListener("transitionend", onTransEnd);
    };

    // Listen for transition end on the panel slide
    let hasTransition = false;
    try {
      const style = getComputedStyle(panel);
      const transDur = parseFloat(style.transitionDuration) || 0;
      hasTransition = transDur > 0;
    } catch {
      // getComputedStyle may not be available in test environments
    }

    const onTransEnd = (e) => {
      if (e.propertyName === "transform") onEnd();
    };

    if (hasTransition) {
      panel.addEventListener("transitionend", onTransEnd, { once: true });
    } else {
      onEnd();
    }
  }

  function toggle() {
    root.dataset.state === "open" ? close() : open();
  }

  // Event listeners
  function onTriggerClick() {
    open();
  }

  function onOverlayClick() {
    close();
  }

  function onCloseClick() {
    close();
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "open") {
      e.stopPropagation();
      close();
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  overlay?.addEventListener("click", onOverlayClick);
  closeButtons.forEach((btn) => btn.addEventListener("click", onCloseClick));
  root.addEventListener("keydown", onKeyDown);

  // Support external triggers: any element with [data-open="{drawer-id}"]
  const externalTriggers = root.id
    ? document.querySelectorAll(`[data-open="${root.id}"]`)
    : [];
  if (externalTriggers.length) {
    externalTriggers.forEach((el) =>
      el.addEventListener("click", onTriggerClick)
    );
  }

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    overlay?.removeEventListener("click", onOverlayClick);
    closeButtons.forEach((btn) =>
      btn.removeEventListener("click", onCloseClick)
    );
    root.removeEventListener("keydown", onKeyDown);
    if (externalTriggers.length) {
      externalTriggers.forEach((el) =>
        el.removeEventListener("click", onTriggerClick)
      );
    }
    if (focusCleanup) focusCleanup();
    delete root._faqirDrawer;
  }

  const api = { open, close, toggle, destroy };
  root._faqirDrawer = api;
  return api;
}
