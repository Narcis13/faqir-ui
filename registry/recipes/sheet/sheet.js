// @ui:controller sheet
// @ui:provides open close toggle destroy

import { trapFocus } from "../../core/focus.js";

export function createSheet(root) {
  // Prevent double-init
  if (root._faqirSheet) return root._faqirSheet;

  const trigger = root.querySelector("[data-part='trigger']");
  const overlay = root.querySelector("[data-part='overlay']");
  const panel = root.querySelector("[data-part='panel']");
  const closeButtons = root.querySelectorAll("[data-part='close']");

  let focusCleanup = null;
  let previouslyFocused = null;
  let prevBodyOverflow = null;

  // Scroll lock: an open modal sheet freezes the page behind it. The guard makes
  // lock/unlock idempotent so overlapping open/close sequences (or a double
  // open) can never leave the body stuck at `overflow: hidden`.
  function lockScroll() {
    if (prevBodyOverflow !== null) return;
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  function unlockScroll() {
    if (prevBodyOverflow === null) return;
    document.body.style.overflow = prevBodyOverflow;
    prevBodyOverflow = null;
  }

  function open() {
    previouslyFocused = document.activeElement;
    root.dataset.state = "open";
    overlay.hidden = false;
    panel.hidden = false;
    lockScroll();
    focusCleanup = trapFocus(panel);
    panel.focus?.();
  }

  function close() {
    root.dataset.state = "closing";

    const onEnd = () => {
      root.dataset.state = "closed";
      overlay.hidden = true;
      panel.hidden = true;
      unlockScroll();
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

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    overlay?.removeEventListener("click", onOverlayClick);
    closeButtons.forEach((btn) =>
      btn.removeEventListener("click", onCloseClick)
    );
    root.removeEventListener("keydown", onKeyDown);
    if (focusCleanup) focusCleanup();
    unlockScroll();
    delete root._faqirSheet;
  }

  const api = { open, close, toggle, destroy };
  root._faqirSheet = api;
  return api;
}
