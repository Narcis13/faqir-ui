export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const closest = (element, selector) => element?.closest?.(selector) ?? null;

export function create(tagName, attributes = {}, children = []) {
  const element = document.createElement(tagName);

  for (const name in attributes) {
    const value = attributes[name];
    if (value != null) {
      element.setAttribute(name, value === true ? "" : String(value));
    }
  }

  element.append(...(Array.isArray(children) ? children : [children]));
  return element;
}
