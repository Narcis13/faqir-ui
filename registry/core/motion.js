export const prefersReducedMotion = () =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

export function waitForTransition(element, timeout = 350) {
  if (prefersReducedMotion() || !element?.addEventListener) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(id);
      element.removeEventListener("transitionend", finish);
      resolve();
    };
    const id = setTimeout(finish, timeout);

    element.addEventListener("transitionend", finish, { once: true });
  });
}
