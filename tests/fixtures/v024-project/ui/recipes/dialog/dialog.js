// @ui:controller dialog
// @ui:provides open close toggle destroy

import { trapFocus } from "../../core/focus.js";

export function createDialog(root) {
  // Prevent double-init
  if (root._loomDialog) return root._loomDialog;

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
      panel.removeEventListener("animationend", onEnd);
      panel.removeEventListener("transitionend", onEnd);
    };

    // If no animation, close immediately
    let hasAnimation = false;
    try {
      const style = getComputedStyle(panel);
      const animName = style.animationName || "none";
      const animDur = parseFloat(style.animationDuration) || 0;
      const transDur = parseFloat(style.transitionDuration) || 0;
      hasAnimation = (animName !== "none" && animDur > 0) || transDur > 0;
    } catch {
      // getComputedStyle may not be available in test environments
    }

    if (hasAnimation) {
      panel.addEventListener("animationend", onEnd, { once: true });
      panel.addEventListener("transitionend", onEnd, { once: true });
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

  // Support external triggers: any element with [data-open="{dialog-id}"]
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
    delete root._loomDialog;
  }

  const api = { open, close, toggle, destroy };
  root._loomDialog = api;
  return api;
}
