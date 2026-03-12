const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]):not([type='hidden']),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
const KEY = "__loomFocusTrap";

export const getFocusableElements = (root) =>
  [...root.querySelectorAll(FOCUSABLE)].filter((element) => !element.hidden && !element.disabled);

export function releaseFocus(container, handler = container?.[KEY]) {
  if (handler) {
    container.removeEventListener("keydown", handler);
    if (container[KEY] === handler) {
      delete container[KEY];
    }
  }
}

export function trapFocus(container) {
  releaseFocus(container);

  const handler = (event) => {
    if (event.key !== "Tab") {
      return;
    }

    const items = getFocusableElements(container);
    if (!items.length) {
      event.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if ((event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus?.();
    }
  };

  container[KEY] = handler;
  container.addEventListener("keydown", handler);
  getFocusableElements(container)[0]?.focus?.();
  return () => releaseFocus(container, handler);
}
