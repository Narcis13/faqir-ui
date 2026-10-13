// The `l-data` island's value (docs/template.md §11.7). Server data reaches the
// client evaluator only as JSON text, which faqir-core reads as a pure literal.
// Before stringifying, the value is checked to be JSON data: anything else
// (a function, a Date, a getter, NaN) would either run host code during
// `JSON.stringify` or silently change on the way. A `__proto__` key is refused
// because a JavaScript object literal — which is how faqir-core reads the
// attribute — takes it as the prototype instead of a property.

/** Deepest nesting a `json()` value may have (§13). */
export const MAX_JSON_DEPTH = 64;

/**
 * The reason `value` is not JSON data, or null when it is.
 * @param {unknown} value
 * @param {number} depth
 * @returns {string | null}
 */
function problem(value, depth) {
  if (depth > MAX_JSON_DEPTH) return `nested deeper than ${MAX_JSON_DEPTH}`;
  if (value === null || typeof value === "string" || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? null : "a number that is not finite";
  if (typeof value !== "object") return `a ${typeof value}`;
  const proto = Object.getPrototypeOf(value);
  const plain = Array.isArray(value) ? proto === Array.prototype : proto === Object.prototype || proto === null;
  if (!plain) return "an object that is not plain data";
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return "a symbol key";
    if (key === "__proto__") return 'the key "__proto__"';
    const desc = /** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(value, key));
    if (Array.isArray(value) && key === "length") continue;
    if (!("value" in desc)) return `an accessor at "${key}"`;
    if (!desc.enumerable) return `a hidden property "${key}"`;
    const inner = problem(desc.value, depth + 1);
    if (inner) return inner;
  }
  return null;
}

/**
 * JSON text for an island, or the reason the value cannot be one.
 * @param {unknown} value
 * @returns {{ text: string } | { error: string }}
 */
export function islandJson(value) {
  const error = problem(value, 0);
  return error ? { error } : { text: JSON.stringify(value) };
}
