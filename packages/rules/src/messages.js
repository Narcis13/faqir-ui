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
 * A caller may pass a `fallback` — the sentence a rule carries on itself. It
 * sits between the tables and the built-ins: a localised message still wins
 * over it (that is what a translation is for), and it still wins over the
 * generic "Please check this value.", which knows nothing about the rule.
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

/**
 * The sentences for findings that come from a *rule* rather than from a field's
 * shape. They are kept apart from `DEFAULT_MESSAGES` on purpose: that table is
 * pinned, key for key, against `SHAPE_RULES` and against the browser plugin's
 * `ValidityState` wording, and a cross-field rule has neither a JSON Schema
 * keyword nor a `ValidityState` flag to be pinned to.
 *
 * A cross-field `validate` rule reports under its own `id`, so no table can
 * hold a default for it; `rule` is the sentence it falls back to when the
 * definition offers neither a `messages` entry nor the rule's own `message`.
 * `remote-error` is the one a rejected remote check reports under — a check
 * that could not run must say so rather than read as a value that was rejected.
 */
export const RULE_MESSAGES = Object.freeze({
  rule: "Please check this value.",
  "remote-error": "This value could not be checked right now.",
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
 * @param {string} [options.fallback] a sentence the rule carries on itself
 * @returns {string}
 */
export function resolveMessage(options) {
  const { messages, locale, path, rule, params, fallback } = options;
  const defaultLocale = options.defaultLocale || DEFAULT_LOCALE;
  const keys = [`${path}.${rule}`, rule];

  for (const layer of [locale, defaultLocale]) {
    if (!layer) continue;
    // Own keys only: a locale or a key spelled like an Object.prototype member
    // (`lang="constructor"`) must find nothing rather than a function.
    const table = messages && Object.prototype.hasOwnProperty.call(messages, layer) ? messages[layer] : undefined;
    if (!table) continue;
    for (const key of keys) {
      const text = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
      if (typeof text === "string") return interpolate(text, params);
    }
  }

  if (typeof fallback === "string") return interpolate(fallback, params);

  for (const table of [DEFAULT_MESSAGES, RULE_MESSAGES]) {
    if (Object.prototype.hasOwnProperty.call(table, rule)) {
      const builtin = /** @type {Record<string, string>} */ (table)[rule];
      if (typeof builtin === "string") return interpolate(builtin, params);
    }
  }

  // Nothing knows this rule. The key is more useful than an empty string: it
  // names what fired, which is exactly what the author has to go and define.
  return rule;
}
