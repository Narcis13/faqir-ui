const on = (target, type, listener, options) => {
  target.addEventListener(type, listener, options);
  return () => target.removeEventListener(type, listener, options);
};

export const once = (target, type, listener, options) =>
  on(target, type, listener, { ...options, once: true });

export function delegate(target, type, selector, listener, options) {
  return on(target, type, (event) => {
    const match = event.target?.closest?.(selector);
    if (match && (!target.contains || target.contains(match))) {
      listener(event, match);
    }
  }, options);
}

export function onOutsideClick(target, boundary, listener, options) {
  return on(target, "click", (event) => {
    const node = event.target;
    if (node && node !== boundary && !boundary.contains?.(node)) {
      listener(event);
    }
  }, options);
}
