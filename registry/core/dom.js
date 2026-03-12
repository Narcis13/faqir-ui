// @ui:core dom
// @ui:provides $ $$ closest create

/**
 * Query a single element within a scope.
 * @param {string} selector
 * @param {Element|Document} [scope=document]
 * @returns {Element|null}
 */
export const $ = (selector, scope = document) => scope.querySelector(selector);

/**
 * Query all matching elements within a scope.
 * @param {string} selector
 * @param {Element|Document} [scope=document]
 * @returns {Element[]}
 */
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

/**
 * Find the closest ancestor (or self) matching a selector.
 * @param {Element} el
 * @param {string} selector
 * @returns {Element|null}
 */
export const closest = (el, selector) => el.closest(selector);

/**
 * Create an element with attributes and children.
 * @param {string} tag
 * @param {Record<string, string>} [attrs={}]
 * @param {...(string|Node)} children
 * @returns {HTMLElement}
 */
export function create(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  for (const child of children) {
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}
