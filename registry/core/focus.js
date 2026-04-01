// @ui:core focus
// @ui:provides trapFocus releaseFocus focusFirst getFocusableElements

const FOCUSABLE = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Get all focusable elements within a container.
 * @param {Element} container
 * @returns {Element[]}
 */
export function getFocusableElements(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter(
    (el) => !el.closest("[hidden]") && el.offsetParent !== null
  );
}

/**
 * Focus the first focusable element in a container.
 * @param {Element} container
 * @returns {boolean} true if an element was focused
 */
export function focusFirst(container) {
  const els = getFocusableElements(container);
  if (els.length > 0) {
    els[0].focus();
    return true;
  }
  return false;
}

/**
 * Trap focus within a container. Returns a cleanup function.
 * @param {Element} container
 * @returns {Function} release function
 */
export function trapFocus(container) {
  function onKeyDown(e) {
    if (e.key !== "Tab") return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  container.addEventListener("keydown", onKeyDown);
  return () => container.removeEventListener("keydown", onKeyDown);
}

/**
 * Release a focus trap (alias for calling the cleanup returned by trapFocus).
 * @param {Function} cleanup
 */
export function releaseFocus(cleanup) {
  if (typeof cleanup === "function") cleanup();
}
