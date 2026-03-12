// @ui:core motion
// @ui:provides waitForTransition animate prefersReducedMotion

/**
 * Check if the user prefers reduced motion.
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Wait for a CSS transition or animation to end on an element.
 * Resolves immediately if no transition/animation is active or reduced motion is preferred.
 * @param {Element} el
 * @returns {Promise<void>}
 */
export function waitForTransition(el) {
  if (prefersReducedMotion()) return Promise.resolve();

  const style = getComputedStyle(el);
  const hasDuration =
    parseFloat(style.transitionDuration) > 0 ||
    (style.animationName !== "none" && parseFloat(style.animationDuration) > 0);

  if (!hasDuration) return Promise.resolve();

  return new Promise((resolve) => {
    function done(e) {
      if (e.target !== el) return;
      el.removeEventListener("transitionend", done);
      el.removeEventListener("animationend", done);
      resolve();
    }
    el.addEventListener("transitionend", done);
    el.addEventListener("animationend", done);
  });
}

/**
 * Apply a class-based animation, wait for it to finish, then remove the class.
 * @param {Element} el
 * @param {string} className
 * @returns {Promise<void>}
 */
export async function animate(el, className) {
  el.classList.add(className);
  await waitForTransition(el);
  el.classList.remove(className);
}
