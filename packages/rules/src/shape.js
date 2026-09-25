/**
 * @faqir-ui/rules — the shape validator and the coercion pass. [1.1B-01 · §8.2]
 *
 * Imports only sibling leaves. Touches no DOM, no filesystem, no
 * process: the same source runs in Bun, Node, a browser, a worker and an agent
 * sandbox, and is required to produce byte-identical verdicts in all of them.
 *
 * ── The definition ──────────────────────────────────────────────────────────
 *
 *   {
 *     version: "1",
 *     fields: { "<dotted.path>": <field schema>, … },
 *     required: ["<dotted.path>", …],          // optional, top level
 *     messages: { en: { "email.format": "…" } },
 *     defaultLocale: "en",
 *     rules: [ … ]                             // the verbs; see rules.js
 *   }
 *
 * A field schema is the JSON Schema 2020-12 subset listed in `FIELD_KEYS`
 * below, plus one piece of Faqir sugar: `required: true` on the field itself,
 * which spares a definition from restating every path in a sibling array. The
 * subset is *closed* — an unrecognised keyword is a definition error, never a
 * silently ignored one, because "my `maxlength` did nothing" is the single
 * worst failure mode a validator can have.
 *
 * ── The two halves of a verdict ──────────────────────────────────────────────
 *
 * This module answers the shape half — `shapeFindings`, every finding the data
 * earns against its declared fields. `rules.js` owns the public `validate`: it
 * runs the definition's verbs, hands the requiredness they decided back here,
 * and adds the cross-field findings on top. The split is a dependency, not a
 * layer: only the rules engine knows whether a field is visible at all, and a
 * finding about a hidden field is noise.
 *
 * ── Order ───────────────────────────────────────────────────────────────────
 *
 * Findings come out in definition order (the insertion order of `fields`, then
 * of each object's `properties`, then array index), and within one value in the
 * fixed order of `SHAPE_RULES`. A missing-and-optional value skips every other
 * check; a value of the wrong type reports `type` and skips the rest, since
 * `minLength` on a number answers a question nobody asked.
 */

import { DefinitionError } from "./errors.js";
import { checkFormat, formatNames, hasFormat } from "./formats.js";
import { MAX_ARRAY_INDEX, MAX_PATTERN_LENGTH, MAX_REGEX_SUBJECT_LENGTH } from "./limits.js";
import { DEFAULT_LOCALE, resolveMessage } from "./messages.js";
import { catastrophicMessage, patternRisk } from "./pattern.js";

export { DefinitionError, MAX_ARRAY_INDEX, MAX_PATTERN_LENGTH };

/** The definition format this module implements. */
export const DEFINITION_VERSION = "1";

/**
 * @typedef {object} CompiledField
 * @property {string} type
 * @property {Record<string, unknown>} schema the field schema as authored
 * @property {boolean} [selfRequired] the `required: true` sugar
 * @property {Set<string>} [requiredChildren] an object's `required: [names]`
 * @property {RegExp} [regex] a compiled `pattern`
 * @property {Map<string, CompiledField>} [properties]
 * @property {CompiledField} [items]
 */

/**
 * @typedef {object} Finding
 * @property {string} path dotted path of the offending value
 * @property {string} rule the constraint that failed
 * @property {string} message the resolved, interpolated sentence
 * @property {Record<string, unknown>} params what the rule was checking against
 */

/**
 * A definition with every regex compiled, every property map built and every
 * required path resolved. Produced by `compile`, accepted by `validate` and
 * `coerce` in place of a raw definition so a hot caller pays for it once. The
 * verbs in `rules` are compiled by `rules.js`, which memoises that work against
 * this instance.
 */
export class CompiledDefinition {
  /**
   * @param {Map<string, CompiledField>} fields
   * @param {Set<string>} required
   * @param {Record<string, Record<string, string>>} messages
   * @param {string} defaultLocale
   * @param {unknown[]} rules
   */
  constructor(fields, required, messages, defaultLocale, rules) {
    this.version = DEFINITION_VERSION;
    this.fields = fields;
    this.required = required;
    this.messages = messages;
    this.defaultLocale = defaultLocale;
    /** The verbs, as authored; `rules.js` compiles and memoises them. */
    this.rules = rules;
  }
}

const SCALAR_TYPES = ["string", "number", "integer", "boolean"];
const TYPES = new Set([...SCALAR_TYPES, "object", "array"]);

const DEFINITION_KEYS = new Set([
  "version", "fields", "required", "messages", "defaultLocale", "rules",
]);

/** Metadata every field may carry. `title` also feeds `{title}` in messages. */
const META_KEYS = ["type", "title", "description", "required", "enum", "const"];

/** The closed keyword set, per type. Anything else is a definition error. */
/** @type {Record<string, Set<string>>} */
const FIELD_KEYS = {
  string: new Set([...META_KEYS, "pattern", "format", "minLength", "maxLength"]),
  number: new Set([...META_KEYS, "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]),
  integer: new Set([...META_KEYS, "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]),
  boolean: new Set(META_KEYS),
  object: new Set([...META_KEYS, "properties"]),
  array: new Set([...META_KEYS, "items", "minItems", "maxItems", "uniqueItems"]),
};

/**
 * The same closed sets, as sorted lists. Published (1.1B-05) so that
 * `rules.schema.json` and `lint.js` can state the vocabulary without
 * re-typing it: a keyword added above appears in the schema's branch and in
 * the lint's sentence by construction, and `tests/schema.test.ts` fails if the
 * published schema falls behind them.
 */
export const FIELD_KEYWORDS = Object.freeze(
  /** @type {Record<string, readonly string[]>} */ (Object.fromEntries(
    Object.entries(FIELD_KEYS).map(([type, keys]) => [type, Object.freeze([...keys].sort())]),
  )),
);

const NUMERIC_KEYWORDS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"];

/** `multipleOf` on IEEE doubles: 0.3 / 0.1 is 2.9999999999999996, not 3. */
const MULTIPLE_OF_EPSILON = 1e-9;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} target @param {string} key */
export function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Path segments that reach an object's machinery instead of its data. Writing
 * through `__proto__` rewires a prototype — `coerce(def, { "a.__proto__.x": 1 })`
 * would otherwise set `x` on every object in the process — and reading
 * `constructor` off plain data answers a function. A definition may not name
 * them and a form key that does is not un-flattened.
 */
const UNSAFE_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/** @param {string} path */
export function hasUnsafeSegment(path) {
  return splitPath(path).some((segment) => UNSAFE_SEGMENTS.has(segment));
}

/**
 * Refuse a definition path that names `__proto__`, `constructor` or `prototype`.
 *
 * @param {string} path @param {string} where
 */
export function assertSafePath(path, where) {
  if (hasUnsafeSegment(path)) {
    throw new DefinitionError(
      `the path "${path}" at ${where} names __proto__, constructor or prototype.`,
      where,
    );
  }
}

/** `a[0].b` and `a.0.b` are the same path; the first is what HTML `name` uses. */
/** @param {string} path */
export function normalizePath(path) {
  return path.replace(/\[(\d+)\]/g, ".$1");
}

/** @param {string} path @returns {string[]} */
function splitPath(path) {
  return normalizePath(path).split(".").filter((segment) => segment.length > 0);
}

/**
 * Read `path` out of `data`. At every level a literal own key wins over a
 * split — so a definition keyed `"contact.email"` still finds its value in
 * flat `{ "contact.email": … }` data without a coercion pass first.
 *
 * @param {unknown} data @param {string} path @returns {unknown}
 */
export function getPath(data, path) {
  /** @type {unknown} */
  let current = data;
  let rest = path;
  while (rest.length > 0) {
    if (current === undefined || current === null) return undefined;
    if (isRecord(current) && hasOwn(current, rest)) {
      return current[rest];
    }
    const segments = splitPath(rest);
    if (segments.length === 0) return undefined;
    const head = segments[0];
    if (Array.isArray(current)) {
      const index = Number(head);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (isRecord(current)) {
      // Own properties only: `constructor` on plain data is not a value.
      current = hasOwn(current, head) ? current[head] : undefined;
    } else {
      return undefined;
    }
    rest = segments.slice(1).join(".");
  }
  return current;
}

/**
 * Can `setPath` write here? Not through `__proto__` / `constructor` /
 * `prototype`, and not at an array index past `MAX_ARRAY_INDEX` — a key is
 * frequently attacker-chosen, and one index is enough to allocate a sparse
 * array a hundred million slots long.
 *
 * @param {string} path
 */
function writable(path) {
  for (const segment of splitPath(path)) {
    if (UNSAFE_SEGMENTS.has(segment)) return false;
    if (/^\d+$/.test(segment) && Number(segment) > MAX_ARRAY_INDEX) return false;
  }
  return true;
}

/**
 * Write `value` at `path`, creating objects — or arrays, where the next segment
 * is an index — along the way. Only ever through own properties, and only for a
 * path `writable` allows; the caller has checked.
 *
 * @param {Record<string, unknown>} target @param {string} path @param {unknown} value
 */
function setPath(target, path, value) {
  const segments = splitPath(path);
  /** @type {any} */
  let current = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const nextIsIndex = /^\d+$/.test(segments[i + 1]);
    const existing = hasOwn(current, key) ? current[key] : undefined;
    const next = isRecord(existing) || Array.isArray(existing) ? existing : nextIsIndex ? [] : {};
    current[key] = next;
    current = next;
  }
  current[segments[segments.length - 1]] = value;
}

/**
 * Remove whatever sits at `path`. An array element is spliced out rather than
 * holed — for a list of values, "the blank one goes away" is what that means.
 *
 * @param {Record<string, unknown>} target @param {string} path
 */
function deletePath(target, path) {
  const segments = splitPath(path);
  /** @type {any} */
  let current = target;
  for (let i = 0; i < segments.length - 1; i++) {
    current = hasOwn(current, segments[i]) ? current[segments[i]] : undefined;
    if (!isRecord(current) && !Array.isArray(current)) return;
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(current)) current.splice(Number(last), 1);
  else if (isRecord(current)) delete current[last];
}

// ── Compiling a definition ──────────────────────────────────────────────────

/** @param {Record<string, unknown>} schema @param {string} key @param {string} where */
function assertNumericKeyword(schema, key, where) {
  const value = schema[key];
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DefinitionError(`"${key}" at ${where} must be a finite number.`, where);
  }
}

/** @param {unknown} schema @param {string} where @returns {CompiledField} */
function compileField(schema, where) {
  if (!isRecord(schema)) {
    throw new DefinitionError(`the field schema at ${where} must be an object.`, where);
  }
  const type = schema.type;
  if (typeof type !== "string" || !TYPES.has(type)) {
    throw new DefinitionError(
      `the field at ${where} needs a "type" of ${[...TYPES].join(", ")}${
        type === undefined ? "" : ` (got ${JSON.stringify(type)})`
      }.`,
      where,
    );
  }
  const allowed = FIELD_KEYS[type];
  for (const key of Object.keys(schema)) {
    if (!allowed.has(key)) {
      throw new DefinitionError(
        `unsupported keyword "${key}" at ${where} (a "${type}" field accepts ${
          [...allowed].sort().join(", ")
        }).`,
        where,
      );
    }
  }

  /** @type {CompiledField} */
  const compiled = { type, schema };

  if (schema.required !== undefined) {
    if (schema.required === true) {
      compiled.selfRequired = true;
    } else if (type === "object" && Array.isArray(schema.required)) {
      for (const name of schema.required) {
        if (typeof name !== "string") {
          throw new DefinitionError(`"required" at ${where} must list property names.`, where);
        }
      }
      compiled.requiredChildren = new Set(/** @type {string[]} */ (schema.required));
    } else {
      throw new DefinitionError(
        type === "object"
          ? `"required" at ${where} must be true (the object itself is required) or an array of property names.`
          : `"required" at ${where} must be true; only an object field may list property names.`,
        where,
      );
    }
  }

  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
    throw new DefinitionError(`"enum" at ${where} must be a non-empty array.`, where);
  }

  if (type === "string") {
    if (schema.pattern !== undefined) {
      if (typeof schema.pattern !== "string") {
        throw new DefinitionError(`"pattern" at ${where} must be a string.`, where);
      }
      if (schema.pattern.length > MAX_PATTERN_LENGTH) {
        throw new DefinitionError(
          `"pattern" at ${where} is ${schema.pattern.length} characters; the limit is ${MAX_PATTERN_LENGTH}.`,
          where,
        );
      }
      try {
        compiled.regex = new RegExp(schema.pattern);
      } catch (error) {
        throw new DefinitionError(
          `"pattern" at ${where} is not a valid regular expression: ${
            error instanceof Error ? error.message : String(error)
          }`,
          where,
        );
      }
      if (patternRisk(schema.pattern) === "catastrophic") {
        throw new DefinitionError(catastrophicMessage(`"pattern" at ${where}`), where);
      }
    }
    if (schema.format !== undefined) {
      if (typeof schema.format !== "string" || !hasFormat(schema.format)) {
        throw new DefinitionError(
          `unknown format ${JSON.stringify(schema.format)} at ${where} (known: ${
            formatNames().join(", ")
          } — add one with registerFormat).`,
          where,
        );
      }
    }
    assertNumericKeyword(schema, "minLength", where);
    assertNumericKeyword(schema, "maxLength", where);
  }

  if (type === "number" || type === "integer") {
    for (const key of NUMERIC_KEYWORDS) assertNumericKeyword(schema, key, where);
    if (typeof schema.multipleOf === "number" && schema.multipleOf <= 0) {
      throw new DefinitionError(`"multipleOf" at ${where} must be greater than zero.`, where);
    }
  }

  if (type === "object") {
    /** @type {Map<string, CompiledField>} */
    const properties = new Map();
    if (schema.properties !== undefined) {
      if (!isRecord(schema.properties)) {
        throw new DefinitionError(`"properties" at ${where} must be an object.`, where);
      }
      for (const [name, child] of Object.entries(schema.properties)) {
        assertSafePath(name, `${where}.properties`);
        properties.set(name, compileField(child, `${where}.${name}`));
      }
    }
    for (const name of compiled.requiredChildren ?? []) {
      if (!properties.has(name)) {
        throw new DefinitionError(
          `"required" at ${where} names "${name}", which is not one of its properties.`,
          where,
        );
      }
    }
    compiled.properties = properties;
  }

  if (type === "array") {
    assertNumericKeyword(schema, "minItems", where);
    assertNumericKeyword(schema, "maxItems", where);
    if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== "boolean") {
      throw new DefinitionError(`"uniqueItems" at ${where} must be a boolean.`, where);
    }
    if (schema.items !== undefined) {
      const items = compileField(schema.items, `${where}[]`);
      if (items.selfRequired) {
        throw new DefinitionError(
          `"required" at ${where}[] has no meaning: array items are checked by minItems, not by presence.`,
          `${where}[]`,
        );
      }
      compiled.items = items;
    }
  }

  return compiled;
}

/**
 * Validate a definition and pre-compile everything that would otherwise be
 * rebuilt on each call. Idempotent: handed a `CompiledDefinition` it returns it.
 *
 * @param {unknown} definition
 * @returns {CompiledDefinition}
 */
export function compile(definition) {
  if (definition instanceof CompiledDefinition) return definition;
  if (!isRecord(definition)) {
    throw new DefinitionError("a definition must be an object.", "");
  }
  for (const key of Object.keys(definition)) {
    if (!DEFINITION_KEYS.has(key)) {
      throw new DefinitionError(
        `unsupported definition key "${key}" (accepted: ${[...DEFINITION_KEYS].sort().join(", ")}).`,
        key,
      );
    }
  }
  if (definition.version !== undefined && definition.version !== DEFINITION_VERSION) {
    throw new DefinitionError(
      `unsupported definition version ${JSON.stringify(definition.version)}; ` +
        `this package implements "${DEFINITION_VERSION}".`,
      "version",
    );
  }
  if (definition.fields !== undefined && !isRecord(definition.fields)) {
    throw new DefinitionError('"fields" must be a map of paths to field schemas.', "fields");
  }
  if (definition.messages !== undefined && !isRecord(definition.messages)) {
    throw new DefinitionError('"messages" must be a map of locales to message tables.', "messages");
  }
  if (definition.defaultLocale !== undefined && typeof definition.defaultLocale !== "string") {
    throw new DefinitionError('"defaultLocale" must be a string.', "defaultLocale");
  }
  // `rules` belongs to 1.1B-02. Its shape is checked so a typo is not mistaken
  // for "rules do nothing yet"; its contents are deliberately not interpreted.
  if (definition.rules !== undefined && !Array.isArray(definition.rules)) {
    throw new DefinitionError('"rules" must be an array.', "rules");
  }

  /** @type {Map<string, CompiledField>} */
  const fields = new Map();
  for (const [path, schema] of Object.entries(definition.fields ?? {})) {
    if (splitPath(path).length === 0) {
      throw new DefinitionError('"fields" has an empty path key.', "fields");
    }
    assertSafePath(path, "fields");
    fields.set(normalizePath(path), compileField(schema, path));
  }

  /** @type {Set<string>} */
  const required = new Set();
  if (definition.required !== undefined) {
    if (!Array.isArray(definition.required)) {
      throw new DefinitionError('"required" must be an array of field paths.', "required");
    }
    for (const path of definition.required) {
      if (typeof path !== "string") {
        throw new DefinitionError('"required" must list field paths as strings.', "required");
      }
      const normalized = normalizePath(path);
      if (!fields.has(normalized)) {
        throw new DefinitionError(
          `"required" names "${path}", which is not a key of "fields".`,
          "required",
        );
      }
      required.add(normalized);
    }
  }

  return new CompiledDefinition(
    fields,
    required,
    /** @type {Record<string, Record<string, string>>} */ (definition.messages ?? {}),
    typeof definition.defaultLocale === "string" ? definition.defaultLocale : DEFAULT_LOCALE,
    Array.isArray(definition.rules) ? definition.rules : [],
  );
}

// ── Validating data ─────────────────────────────────────────────────────────

/**
 * Missing means "the person left it blank": absent, null, the empty string, or
 * an empty array (a checkbox group with nothing ticked). An empty *object* is
 * present — its required children are what report, and saying "this object is
 * missing" instead would hide which three fields inside it were blank.
 *
 * @param {unknown} value
 */
export function isMissing(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.length === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/** @param {unknown} value @param {string} type */
function matchesType(value, type) {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "object": return isRecord(value);
    case "array": return Array.isArray(value);
    default: return false;
  }
}

/**
 * Order-independent identity, used by `enum`, `const` and `uniqueItems`. Object
 * keys are sorted so `{a:1,b:2}` and `{b:2,a:1}` are the same value, which is
 * what JSON Schema's equality means and what a form round-trip can easily undo.
 *
 * @param {unknown} value @returns {string}
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/**
 * @typedef {object} CheckContext
 * @property {Finding[]} findings
 * @property {Record<string, Record<string, string>>} messages
 * @property {string | undefined} locale
 * @property {string} defaultLocale
 */

/**
 * One value, then everything beneath it. Appends to `ctx.findings` in the
 * documented order.
 *
 * @param {CompiledField} field
 * @param {unknown} value
 * @param {string} path
 * @param {boolean} required
 * @param {CheckContext} ctx
 */
function checkValue(field, value, path, required, ctx) {
  const schema = field.schema;
  /** @param {string} rule @param {Record<string, unknown>} params */
  const add = (rule, params) => {
    ctx.findings.push({
      path,
      rule,
      message: resolveMessage({
        messages: ctx.messages,
        locale: ctx.locale,
        defaultLocale: ctx.defaultLocale,
        path,
        rule,
        // `path` and `title` are offered to the message but are not part of the
        // finding's params: params say what the *rule* was checking against.
        params: { path, title: schema.title, ...params },
      }),
      params,
    });
  };

  if (isMissing(value)) {
    if (required) add("required", {});
    return;
  }

  const type = field.type;
  if (!matchesType(value, type)) {
    add("type", { type });
    return;
  }

  if (schema.enum !== undefined) {
    const allowed = /** @type {unknown[]} */ (schema.enum);
    if (!allowed.some((option) => canonical(option) === canonical(value))) {
      add("enum", { allowed });
    }
  }
  if (schema.const !== undefined && canonical(schema.const) !== canonical(value)) {
    add("const", { const: schema.const });
  }

  if (type === "string") {
    const text = /** @type {string} */ (value);
    // A subject past MAX_REGEX_SUBJECT_LENGTH fails the pattern unread, as the
    // `regex` operator answers false for one: the pattern's shape is checked,
    // but the product of pattern and subject is bounded only here.
    if (field.regex && (text.length > MAX_REGEX_SUBJECT_LENGTH || !field.regex.test(text))) {
      add("pattern", { pattern: schema.pattern });
    }
    if (typeof schema.format === "string" && !checkFormat(schema.format, text)) {
      add("format", { format: schema.format });
    }
    // Count code points, not UTF-16 units: JSON Schema 2020-12 §6.3.1 measures
    // length in characters, so "🙂" is one — a maxLength of 1 must accept it.
    const length = [...text].length;
    if (typeof schema.minLength === "number" && length < schema.minLength) {
      add("minLength", { limit: schema.minLength, actual: length });
    }
    if (typeof schema.maxLength === "number" && length > schema.maxLength) {
      add("maxLength", { limit: schema.maxLength, actual: length });
    }
  }

  if (type === "number" || type === "integer") {
    const n = /** @type {number} */ (value);
    if (typeof schema.minimum === "number" && n < schema.minimum) {
      add("minimum", { limit: schema.minimum });
    }
    if (typeof schema.exclusiveMinimum === "number" && n <= schema.exclusiveMinimum) {
      add("exclusiveMinimum", { limit: schema.exclusiveMinimum });
    }
    if (typeof schema.maximum === "number" && n > schema.maximum) {
      add("maximum", { limit: schema.maximum });
    }
    if (typeof schema.exclusiveMaximum === "number" && n >= schema.exclusiveMaximum) {
      add("exclusiveMaximum", { limit: schema.exclusiveMaximum });
    }
    if (typeof schema.multipleOf === "number") {
      const ratio = n / schema.multipleOf;
      if (Math.abs(ratio - Math.round(ratio)) > MULTIPLE_OF_EPSILON) {
        add("multipleOf", { multipleOf: schema.multipleOf });
      }
    }
  }

  if (type === "array") {
    const items = /** @type {unknown[]} */ (value);
    if (typeof schema.minItems === "number" && items.length < schema.minItems) {
      add("minItems", { limit: schema.minItems, actual: items.length });
    }
    if (typeof schema.maxItems === "number" && items.length > schema.maxItems) {
      add("maxItems", { limit: schema.maxItems, actual: items.length });
    }
    if (schema.uniqueItems === true) {
      /** @type {Set<string>} */
      const seen = new Set();
      for (let i = 0; i < items.length; i++) {
        const key = canonical(items[i]);
        if (seen.has(key)) {
          add("uniqueItems", { index: i });
          break;
        }
        seen.add(key);
      }
    }
    if (field.items) {
      for (let i = 0; i < items.length; i++) {
        checkValue(field.items, items[i], `${path}.${i}`, false, ctx);
      }
    }
  }

  if (type === "object" && field.properties) {
    const requiredChildren = field.requiredChildren;
    for (const [name, child] of field.properties) {
      const childRequired = child.selfRequired === true ||
        (requiredChildren !== undefined && requiredChildren.has(name));
      checkValue(child, getPath(value, name), `${path}.${name}`, childRequired, ctx);
    }
  }
}

/**
 * The shape half of a verdict: every finding `data` earns against the declared
 * fields, in definition order. `rules.js` owns the public `validate`, which
 * calls this and then adds the cross-field half — the split exists so that the
 * rules engine can hand in the requiredness its `require` verbs decided, which
 * only it knows.
 *
 * @param {CompiledDefinition} compiled
 * @param {unknown} data
 * @param {{ locale?: string, required?: Set<string> }} [options]
 * @returns {Finding[]}
 */
export function shapeFindings(compiled, data, options) {
  /** @type {CheckContext} */
  const ctx = {
    findings: [],
    messages: compiled.messages,
    locale: options?.locale,
    defaultLocale: compiled.defaultLocale,
  };
  const extra = options?.required;

  for (const [path, field] of compiled.fields) {
    const required = field.selfRequired === true || compiled.required.has(path) ||
      (extra !== undefined && extra.has(path));
    checkValue(field, getPath(data, path), path, required, ctx);
  }

  return ctx.findings;
}

// ── Coercion ────────────────────────────────────────────────────────────────

const TRUTHY = new Set(["true", "on", "yes", "1"]);
const FALSY = new Set(["false", "off", "no", "0"]);
/** A JSON number: the only string shape that becomes a number without guessing. */
const NUMERIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** @param {unknown} value @param {string} type @returns {unknown} */
function coerceScalar(value, type) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text.length === 0) return undefined;
  if (type === "number" || type === "integer") {
    // A string that is not a number is left alone, so `validate` reports a
    // `type` finding naming the field rather than a silent NaN downstream.
    return NUMERIC_RE.test(text) ? Number(text) : value;
  }
  if (type === "boolean") {
    const lower = text.toLowerCase();
    if (TRUTHY.has(lower)) return true;
    if (FALSY.has(lower)) return false;
    return value;
  }
  return value;
}

/** @param {CompiledField} field @param {unknown} value @returns {unknown} */
function coerceValue(field, value) {
  if (field.type === "array") {
    if (value === undefined || value === null) return value;
    // One ticked checkbox in a group arrives as a scalar, not a one-item list.
    const source = Array.isArray(value) ? value : value === "" ? [] : [value];
    const items = field.items
      ? source.map((item) => coerceValue(/** @type {CompiledField} */ (field.items), item))
      : source.slice();
    return items.filter((item) => item !== undefined);
  }

  if (field.type === "object") {
    if (!isRecord(value)) return value;
    /** @type {Record<string, unknown>} */
    const out = { ...value };
    for (const [name, child] of field.properties ?? []) {
      if (!Object.prototype.hasOwnProperty.call(out, name)) continue;
      const coerced = coerceValue(child, out[name]);
      if (coerced === undefined) delete out[name];
      else out[name] = coerced;
    }
    return out;
  }

  return coerceScalar(value, field.type);
}

/**
 * A form submission as the record `coerce` reads: `FormData` — or anything
 * that iterates `[name, value]` pairs (`URLSearchParams`, a `Map`, an array of
 * pairs), or that has `forEach((value, name) => …)` — with every REPEATED name
 * collected into a list, in submission order.
 *
 * `Object.fromEntries(formData)` is the obvious spelling and the wrong one: it
 * keeps only the last value of a repeated name, so a checkbox group with three
 * boxes ticked arrives as one string and fails `minItems` on the server while
 * the page accepted it. Dotted and indexed names are left flat here; `coerce`
 * is what writes `contacts[0].name` into place, against the definition.
 *
 *   const data = coerce(definition, fromFormData(await request.formData()));
 *
 * A name that reaches `__proto__`, `constructor` or `prototype` is dropped.
 *
 * @param {unknown} entries
 * @returns {Record<string, unknown>}
 */
export function fromFormData(entries) {
  /** @type {Record<string, unknown>} */
  const out = {};
  /** @param {unknown} value @param {unknown} name */
  const add = (value, name) => {
    if (typeof name !== "string" || hasUnsafeSegment(name)) return;
    if (!hasOwn(out, name)) out[name] = value;
    else if (Array.isArray(out[name])) /** @type {unknown[]} */ (out[name]).push(value);
    else out[name] = [out[name], value];
  };
  const source = /** @type {any} */ (entries);
  if (source && typeof source[Symbol.iterator] === "function") {
    for (const pair of source) {
      if (Array.isArray(pair)) add(pair[1], pair[0]);
    }
  } else if (source && typeof source.forEach === "function") {
    source.forEach(add);
  }
  return out;
}

/**
 * Turn the strings a form produces into the types a definition declares, so a
 * server reading `FormData` and the browser plugin reading the same controls
 * hand `validate` identical data.
 *
 * Two things happen, in this order:
 *
 *  1. **Un-flattening.** HTML `name` attributes are flat and dotted —
 *     `address.geo.lat`, `contacts[0].name` is what `@faqir-ui/forms` emits —
 *     so any own key whose first segment names a declared field is written into
 *     its nested position. Keys the definition knows nothing about are copied
 *     through untouched: coercion narrows types, it never drops data. Two
 *     bounds apply, because a server's keys come from whoever sent the body:
 *     an index past `MAX_ARRAY_INDEX` is not un-flattened (the key is carried
 *     flat, like an unknown one), and a key naming `__proto__`, `constructor`
 *     or `prototype` anywhere is dropped.
 *  2. **Typing.** Per field: numeric strings become numbers, `"on"`/`"true"`
 *     become `true`, a lone value for an array field becomes a one-item list,
 *     and a blank string becomes *absent* — so a blank required field reports
 *     `required` rather than a `type` finding about `""`.
 *
 * @param {unknown} definition
 * @param {unknown} rawData
 * @returns {Record<string, unknown>}
 */
export function coerce(definition, rawData) {
  const compiled = compile(definition);
  if (!isRecord(rawData)) return {};

  /** First segments of every declared path — the only keys worth un-flattening. */
  /** @type {Set<string>} */
  const roots = new Set();
  for (const path of compiled.fields.keys()) roots.add(splitPath(path)[0]);

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(rawData)) {
    // `__proto__` / `constructor` / `prototype` are not data, wherever they
    // sit in a key: such a key is dropped rather than carried, because carrying
    // `__proto__` through is itself the write that rewires a prototype.
    if (hasUnsafeSegment(key)) continue;
    const segments = splitPath(key);
    if (segments.length > 1 && roots.has(segments[0]) && writable(key)) setPath(out, key, value);
    else out[key] = value;
  }

  for (const [path, field] of compiled.fields) {
    const current = getPath(out, path);
    if (current === undefined) continue;
    const coerced = coerceValue(field, current);
    if (coerced === undefined) deletePath(out, path);
    else setPath(out, path, coerced);
  }

  return out;
}
