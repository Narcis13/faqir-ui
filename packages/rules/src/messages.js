/**
 * @faqir-ui/rules — the message layer. [1.1B-01 · §8.2]
 *
 * A leaf module: it imports nothing, reads no host global, and holds the one
 * vocabulary that every consumer of a verdict shares — the finding's `rule`
 * name and the English sentence it falls back to.
 *
 * ── Resolution chain (`resolveMessage`) ─────────────────────────────────────
 *   `messages[locale]`  →  `messages[defaultLocale]`  →  the built-in English
 *   default for the rule  →  the key itself.
 *
 * Within each `messages[…]` layer two keys are tried, specific first:
 * `"<path>.<rule>"` then `"<rule>"`. So a definition can say "this one field's
 * `required` sentence" without restating the other twenty.
 *
 * The built-in defaults are deliberately the same sentences the browser plugin
 * `registry/core/plugins/faqir-validate.js` shows for the equivalent
 * `ValidityState` flag (`required`/`type`/`pattern`/`minLength`/`maxLength`/
 * `minimum`/`maximum`/`multipleOf` ↔ `valueMissing`/`typeMismatch`/
 * `patternMismatch`/`tooShort`/`tooLong`/`rangeUnderflow`/`rangeOverflow`/
 * `stepMismatch`). A field validated natively in the browser and the same field
 * validated on a server must not disagree about its own wording; the plugin can
 * import these instead of keeping a second copy. `tests/shape.test.ts` fails if
 * the two tables drift apart.
 */

/** The rule names the shape validator can emit, in the order it checks them. */
export const SHAPE_RULES = Object.freeze([
  "required",
  "type",
  "enum",
  "const",
  "pattern",
  "format",
  "minLength",
  "maxLength",
  "minimum",
  "exclusiveMinimum",
  "maximum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
]);

/**
 * The built-in English sentence per rule. Placeholders in braces are filled
 * from the finding's `params` (see `interpolate`).
 */
export const DEFAULT_MESSAGES = Object.freeze({
  required: "This field is required.",
  type: "Please enter a valid value.",
  enum: "Please choose one of the allowed values.",
  const: "Please enter the required value.",
  pattern: "Please match the requested format.",
  format: "Please enter a valid value.",
  minLength: "Please lengthen this value.",
  maxLength: "Please shorten this value.",
  minimum: "Value is too small.",
  exclusiveMinimum: "Value is too small.",
  maximum: "Value is too large.",
  exclusiveMaximum: "Value is too large.",
  multipleOf: "Please enter a valid value.",
  minItems: "Please choose more items.",
  maxItems: "Please choose fewer items.",
  uniqueItems: "Please remove the duplicate entries.",
});

/** The locale used when a verdict is asked for in no particular locale. */
export const DEFAULT_LOCALE = "en";

/**
 * Fill `{name}` placeholders from `params`. A placeholder with no matching
 * param is left standing rather than blanked: an author debugging their own
 * message can see which name they got wrong, where an empty gap says nothing.
 * Arrays render as a comma-separated list so `{allowed}` reads naturally.
 *
 * @param {string} text
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export function interpolate(text, params) {
  if (!params || typeof text !== "string" || text.indexOf("{") === -1) return text;
  return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return whole;
    const value = params[name];
    if (value === undefined || value === null) return whole;
    if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
    return String(value);
  });
}

/**
 * The sentence for one finding, resolved through the chain in the header.
 *
 * @param {object} options
 * @param {Record<string, Record<string, string>>} [options.messages] the definition's `messages`
 * @param {string} [options.locale] the requested locale
 * @param {string} [options.defaultLocale] the definition's fallback locale
 * @param {string} options.path the dotted path of the offending value
 * @param {string} options.rule the rule that failed
 * @param {Record<string, unknown>} [options.params] values for `{placeholders}`
 * @returns {string}
 */
export function resolveMessage(options) {
  const { messages, locale, path, rule, params } = options;
  const defaultLocale = options.defaultLocale || DEFAULT_LOCALE;
  const keys = [`${path}.${rule}`, rule];

  for (const layer of [locale, defaultLocale]) {
    if (!layer) continue;
    const table = messages && messages[layer];
    if (!table) continue;
    for (const key of keys) {
      const text = table[key];
      if (typeof text === "string") return interpolate(text, params);
    }
  }

  const builtin = Object.prototype.hasOwnProperty.call(DEFAULT_MESSAGES, rule)
    ? /** @type {Record<string, string>} */ (DEFAULT_MESSAGES)[rule]
    : undefined;
  if (typeof builtin === "string") return interpolate(builtin, params);

  // Nothing knows this rule. The key is more useful than an empty string: it
  // names what fired, which is exactly what the author has to go and define.
  return rule;
}
