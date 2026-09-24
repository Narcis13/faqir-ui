/**
 * @faqir-ui/forms renderer — scalars (0.6-03) + composites (0.6-04).
 *
 * This module deliberately has no imports and touches no host globals. Rendering
 * is pure string construction, so the same source runs in Bun, Node, browsers,
 * workers, and agent sandboxes.
 *
 * Composite mapping (§7.2): nested objects → fieldset cards; arrays of enum →
 * checkbox group or multi-select by cardinality; arrays of objects → repeatable
 * groups driven by `l-data` + keyed `l-for`; uiSchema `ui:groups` layout groups;
 * multi-step forms via the wizard pattern (stepper + card + field-group + button,
 * step visibility via data-state, per-step validation gated by faqir-validate).
 * The client runtime stays faqir-core.js + faqir-validate.js — no @faqir-ui/forms
 * needed in the browser.
 */

export const DEFAULT_RADIO_THRESHOLD = 4;

const ROOT_KEYS = new Set([
  "$schema", "$id", "type", "title", "description", "properties", "required",
  // The conditional keywords (1.1B-06): understood, and turned into rules —
  // never rendered as markup, and never ignored.
  "if", "then", "else", "allOf", "dependentRequired",
]);
const SCALAR_TYPES = new Set(["string", "number", "integer", "boolean"]);
const FIELD_KEYS = new Set([
  "type", "title", "description", "enum", "format", "default",
  "minLength", "maxLength", "pattern", "minimum", "maximum", "multipleOf", "step",
]);
const OBJECT_FIELD_KEYS = new Set(["type", "title", "description", "properties", "required"]);
const ENUM_ARRAY_KEYS = new Set(["type", "title", "description", "items", "uniqueItems", "default"]);
const ENUM_ARRAY_ITEM_KEYS = new Set(["type", "enum"]);
const OBJECT_ARRAY_KEYS = new Set(["type", "title", "description", "items", "minItems", "maxItems"]);
const OBJECT_ARRAY_ITEM_KEYS = new Set(["type", "properties", "required"]);
const UI_KEYS = new Set([
  "widget", "ui:widget", "placeholder", "ui:placeholder",
  "rows", "ui:rows", "enumLabels", "ui:enumLabels",
]);
const ENUM_ARRAY_UI_KEYS = new Set(["widget", "ui:widget", "enumLabels", "ui:enumLabels"]);
const OBJECT_ARRAY_UI_KEYS = new Set(["items", "addLabel", "ui:addLabel", "removeLabel", "ui:removeLabel"]);
const GROUP_KEYS = new Set(["title", "description", "fields"]);
const WIZARD_KEYS = new Set(["label", "steps"]);
const STEP_KEYS = new Set(["title", "description", "fields", "when"]);
const OPTION_KEYS = new Set(["idPrefix", "radioThreshold", "theme", "density", "i18n", "rules"]);
const I18N_KEYS = new Set([
  "requiredMarker", "selectPlaceholder", "datePickerLabel", "calendarLabel",
  "addRowLabel", "removeRowLabel", "backLabel", "nextLabel", "submitLabel", "wizardNavLabel",
]);
const STRING_FORMATS = new Set(["date", "email", "uri"]);
const WIDGETS = new Set([
  "input", "textarea", "select", "radio", "checkbox", "switch", "date-picker",
  "checkbox-group", "multi-select",
]);

const DEFAULT_I18N = Object.freeze({
  requiredMarker: "*",
  selectPlaceholder: "Select {title}",
  datePickerLabel: "Choose {title}",
  calendarLabel: "Calendar",
  addRowLabel: "Add {title}",
  removeRowLabel: "Remove {title}",
  backLabel: "Back",
  nextLabel: "Next",
  submitLabel: "Submit",
  wizardNavLabel: "Form steps",
});

/** @param {unknown} value */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @param {string} path */
function assertRecord(value, path) {
  if (!isRecord(value)) throw new TypeError(`@faqir-ui/forms: ${path} must be an object.`);
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {Record<string, unknown>} value @param {Set<string>} allowed @param {string} path */
function assertKnownKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`@faqir-ui/forms: unsupported keyword "${key}" at ${path}.`);
    }
  }
}

/** @param {unknown} value @param {string} path */
function assertString(value, path) {
  if (typeof value !== "string") throw new TypeError(`@faqir-ui/forms: ${path} must be a string.`);
  return value;
}

/** @param {unknown} value @param {string} path */
function assertFiniteNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`@faqir-ui/forms: ${path} must be a finite number.`);
  }
  return value;
}

/** @param {unknown} value @param {string} path */
function assertNonNegativeInteger(value, path) {
  const number = assertFiniteNumber(value, path);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`@faqir-ui/forms: ${path} must be a non-negative integer.`);
  }
  return number;
}

/**
 * A non-empty array of unique strings (enum values, enum defaults, field lists).
 * @param {unknown} value @param {string} path
 */
function assertStringArray(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`@faqir-ui/forms: ${path} must be a non-empty string array.`);
  }
  for (let index = 0; index < value.length; index++) assertString(value[index], `${path}[${index}]`);
  if (new Set(value).size !== value.length) {
    throw new Error(`@faqir-ui/forms: ${path} values must be unique.`);
  }
  return /** @type {string[]} */ (value);
}

/** @param {string} value */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** @param {string | number | boolean} value */
function attrValue(value) {
  return escapeHtml(String(value));
}

/** @param {string} value */
function idToken(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** @param {string} name */
function humanize(name) {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Field";
}

/** @param {string} template @param {string} title */
function interpolateTitle(template, title) {
  return template.replaceAll("{title}", title);
}

/** Indent every non-empty line by `depth` two-space steps. @param {string[]} lines @param {number} depth */
function indentLines(lines, depth) {
  const pad = "  ".repeat(depth);
  return lines.map((line) => (line === "" ? line : pad + line));
}

/**
 * Accept the terse keys and the ecosystem-style `ui:*` aliases without making
 * their precedence ambiguous.
 * @param {Record<string, unknown>} ui
 * @param {string} shortKey
 * @param {string} prefixedKey
 * @param {string} path
 */
function uiValue(ui, shortKey, prefixedKey, path) {
  const short = ui[shortKey];
  const prefixed = ui[prefixedKey];
  if (short !== undefined && prefixed !== undefined && JSON.stringify(short) !== JSON.stringify(prefixed)) {
    throw new Error(`@faqir-ui/forms: ${path}.${shortKey} conflicts with ${path}.${prefixedKey}.`);
  }
  return prefixed !== undefined ? prefixed : short;
}

/** @param {Record<string, unknown>} raw */
function normalizeOptions(raw) {
  assertKnownKeys(raw, OPTION_KEYS, "opts");

  const prefixSource = raw.idPrefix === undefined ? "faqir" : assertString(raw.idPrefix, "opts.idPrefix");
  const prefix = idToken(prefixSource);
  if (!prefix) throw new Error("@faqir-ui/forms: opts.idPrefix must contain an ASCII letter or digit.");

  const threshold = raw.radioThreshold === undefined
    ? DEFAULT_RADIO_THRESHOLD
    : assertFiniteNumber(raw.radioThreshold, "opts.radioThreshold");
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new TypeError("@faqir-ui/forms: opts.radioThreshold must be an integer greater than or equal to 1.");
  }

  const theme = raw.theme === undefined ? undefined : assertString(raw.theme, "opts.theme");
  const density = raw.density === undefined ? undefined : assertString(raw.density, "opts.density");
  if (theme !== undefined && theme.length === 0) throw new Error("@faqir-ui/forms: opts.theme cannot be empty.");
  if (density !== undefined && density.length === 0) throw new Error("@faqir-ui/forms: opts.density cannot be empty.");

  const i18nRaw = raw.i18n === undefined ? {} : assertRecord(raw.i18n, "opts.i18n");
  assertKnownKeys(i18nRaw, I18N_KEYS, "opts.i18n");
  /** @type {Record<string, string>} */
  const i18n = { ...DEFAULT_I18N };
  for (const key of I18N_KEYS) {
    if (i18nRaw[key] !== undefined) i18n[key] = assertString(i18nRaw[key], `opts.i18n.${key}`);
  }

  const rules = raw.rules === undefined ? null : normalizeRulesOption(raw.rules);

  return { prefix, threshold, theme, density, i18n, rules };
}

/**
 * Classify a property schema into one of the four supported field kinds. Every
 * unsupported shape throws with the exact path — nothing is silently skipped.
 * @param {Record<string, unknown>} schema
 * @param {string} path
 * @returns {"scalar" | "object" | "enum-array" | "object-array"}
 */
function classifyField(schema, path) {
  const type = assertString(schema.type, `${path}.type`);
  if (SCALAR_TYPES.has(type)) return "scalar";
  if (type === "object") return "object";
  if (type === "array") {
    const items = assertRecord(schema.items, `${path}.items`);
    const itemType = assertString(items.type, `${path}.items.type`);
    if (itemType === "string") return "enum-array";
    if (itemType === "object") return "object-array";
    throw new Error(
      `@faqir-ui/forms: unsupported array item type "${itemType}" at ${path}.items.type; ` +
      `arrays support enum strings (choice sets) or objects (repeatable groups).`,
    );
  }
  throw new Error(`@faqir-ui/forms: unsupported type "${type}" at ${path}.type.`);
}

/**
 * @param {Record<string, unknown>} schema
 * @param {string} path
 */
function validateFieldSchema(schema, path) {
  assertKnownKeys(schema, FIELD_KEYS, path);
  const type = assertString(schema.type, `${path}.type`);
  if (!SCALAR_TYPES.has(type)) {
    throw new Error(`@faqir-ui/forms: unsupported type "${type}" at ${path}.type; scalar fields only.`);
  }

  if (schema.title !== undefined) assertString(schema.title, `${path}.title`);
  if (schema.description !== undefined) assertString(schema.description, `${path}.description`);

  if (schema.enum !== undefined) {
    if (type !== "string") throw new Error(`@faqir-ui/forms: ${path}.enum is supported only for string fields.`);
    assertStringArray(schema.enum, `${path}.enum`);
  }

  if (schema.format !== undefined) {
    const format = assertString(schema.format, `${path}.format`);
    if (type !== "string") throw new Error(`@faqir-ui/forms: ${path}.format is supported only for string fields.`);
    if (!STRING_FORMATS.has(format)) {
      throw new Error(`@faqir-ui/forms: unsupported format "${format}" at ${path}.format.`);
    }
    if (schema.enum !== undefined) {
      throw new Error(`@faqir-ui/forms: ${path} cannot combine enum with format.`);
    }
  }

  for (const keyword of ["minLength", "maxLength"]) {
    if (schema[keyword] !== undefined) {
      if (type !== "string") throw new Error(`@faqir-ui/forms: ${path}.${keyword} is valid only for string fields.`);
      assertNonNegativeInteger(schema[keyword], `${path}.${keyword}`);
    }
  }
  if (schema.minLength !== undefined && schema.maxLength !== undefined && schema.minLength > schema.maxLength) {
    throw new Error(`@faqir-ui/forms: ${path}.minLength cannot exceed maxLength.`);
  }
  if (schema.pattern !== undefined) {
    if (type !== "string") throw new Error(`@faqir-ui/forms: ${path}.pattern is valid only for string fields.`);
    assertString(schema.pattern, `${path}.pattern`);
  }

  for (const keyword of ["minimum", "maximum", "multipleOf", "step"]) {
    if (schema[keyword] !== undefined) {
      if (type !== "number" && type !== "integer") {
        throw new Error(`@faqir-ui/forms: ${path}.${keyword} is valid only for number or integer fields.`);
      }
      assertFiniteNumber(schema[keyword], `${path}.${keyword}`);
    }
  }
  if (schema.minimum !== undefined && schema.maximum !== undefined && schema.minimum > schema.maximum) {
    throw new Error(`@faqir-ui/forms: ${path}.minimum cannot exceed maximum.`);
  }
  if (schema.multipleOf !== undefined && schema.multipleOf <= 0) {
    throw new Error(`@faqir-ui/forms: ${path}.multipleOf must be greater than zero.`);
  }
  if (schema.step !== undefined && schema.step <= 0) {
    throw new Error(`@faqir-ui/forms: ${path}.step must be greater than zero.`);
  }
  if (schema.multipleOf !== undefined && schema.step !== undefined) {
    throw new Error(`@faqir-ui/forms: ${path} cannot define both multipleOf and step.`);
  }

  if (schema.default !== undefined) {
    const expected = type === "integer" ? "number" : type;
    if (typeof schema.default !== expected || (type === "integer" && !Number.isInteger(schema.default))) {
      throw new TypeError(`@faqir-ui/forms: ${path}.default must match type "${type}".`);
    }
    if (schema.enum !== undefined && !(/** @type {string[]} */ (schema.enum)).includes(/** @type {string} */ (schema.default))) {
      throw new Error(`@faqir-ui/forms: ${path}.default must be one of its enum values.`);
    }
  }
}

/**
 * Validate a `properties` map + `required` list pair (used by the root schema,
 * nested objects, and array item objects alike).
 * @param {Record<string, unknown>} owner
 * @param {string} path
 */
function validatePropertiesAndRequired(owner, path) {
  const properties = assertRecord(owner.properties, `${path}.properties`);
  if (Object.keys(properties).length === 0) {
    throw new Error(`@faqir-ui/forms: ${path}.properties must declare at least one property.`);
  }
  /** @type {string[]} */
  let required = [];
  if (owner.required !== undefined) {
    if (!Array.isArray(owner.required)) throw new TypeError(`@faqir-ui/forms: ${path}.required must be a string array.`);
    required = owner.required.map((name, index) => assertString(name, `${path}.required[${index}]`));
    if (new Set(required).size !== required.length) throw new Error(`@faqir-ui/forms: ${path}.required cannot contain duplicates.`);
    for (const name of required) {
      if (!Object.prototype.hasOwnProperty.call(properties, name)) {
        throw new Error(`@faqir-ui/forms: ${path}.required references unknown property "${name}".`);
      }
    }
  }
  return { properties, requiredSet: new Set(required) };
}

/**
 * @param {Record<string, unknown>} schema
 * @param {string} path
 */
function validateEnumArrayField(schema, path) {
  assertKnownKeys(schema, ENUM_ARRAY_KEYS, path);
  if (schema.title !== undefined) assertString(schema.title, `${path}.title`);
  if (schema.description !== undefined) assertString(schema.description, `${path}.description`);
  const items = assertRecord(schema.items, `${path}.items`);
  assertKnownKeys(items, ENUM_ARRAY_ITEM_KEYS, `${path}.items`);
  const values = assertStringArray(items.enum, `${path}.items.enum`);
  if (schema.uniqueItems !== undefined && schema.uniqueItems !== true) {
    throw new Error(`@faqir-ui/forms: ${path}.uniqueItems must be true when present (choice sets are unique).`);
  }
  if (schema.default !== undefined) {
    const defaults = assertStringArray(schema.default, `${path}.default`);
    for (const value of defaults) {
      if (!values.includes(value)) {
        throw new Error(`@faqir-ui/forms: ${path}.default contains "${value}", which is not one of its enum values.`);
      }
    }
  }
  return values;
}

/**
 * Repeatable-group names are embedded in generated `l-data`/binding expressions
 * (e.g. `:name="'meds[' + rowIndex + '].dose'"`), so they must be plain
 * identifier-style names — no quotes, backslashes, dots, or whitespace.
 * @param {string} name @param {string} path
 */
function assertExpressionSafeName(name, path) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
    throw new Error(
      `@faqir-ui/forms: ${path} — repeatable group property names must match [A-Za-z_][A-Za-z0-9_-]* ` +
      `(they are embedded in generated binding expressions).`,
    );
  }
}

/**
 * @param {Record<string, unknown>} schema
 * @param {string} path
 */
function validateObjectArrayField(schema, path) {
  assertKnownKeys(schema, OBJECT_ARRAY_KEYS, path);
  if (schema.title !== undefined) assertString(schema.title, `${path}.title`);
  if (schema.description !== undefined) assertString(schema.description, `${path}.description`);
  const items = assertRecord(schema.items, `${path}.items`);
  assertKnownKeys(items, OBJECT_ARRAY_ITEM_KEYS, `${path}.items`);
  if (items.type !== "object") {
    throw new Error(`@faqir-ui/forms: ${path}.items.type must be "object" for repeatable groups.`);
  }
  const { properties, requiredSet } = validatePropertiesAndRequired(items, `${path}.items`);
  for (const [childName, rawChild] of Object.entries(properties)) {
    const childPath = `${path}.items.properties.${childName}`;
    assertExpressionSafeName(childName, childPath);
    const child = assertRecord(rawChild, childPath);
    const kind = classifyField(child, childPath);
    if (kind !== "scalar") {
      throw new Error(
        `@faqir-ui/forms: ${childPath} is a ${kind} field — repeatable group rows support scalar fields only.`,
      );
    }
    validateFieldSchema(child, childPath);
  }
  if (schema.minItems !== undefined) assertNonNegativeInteger(schema.minItems, `${path}.minItems`);
  if (schema.maxItems !== undefined) {
    const max = assertNonNegativeInteger(schema.maxItems, `${path}.maxItems`);
    if (max < 1) throw new Error(`@faqir-ui/forms: ${path}.maxItems must be at least 1.`);
  }
  if (schema.minItems !== undefined && schema.maxItems !== undefined &&
      /** @type {number} */ (schema.minItems) > /** @type {number} */ (schema.maxItems)) {
    throw new Error(`@faqir-ui/forms: ${path}.minItems cannot exceed maxItems.`);
  }
  return { properties, requiredSet };
}

/**
 * @param {Record<string, unknown>} ui
 * @param {Record<string, unknown>} schema
 * @param {string} path
 * @param {boolean} [inRow] Inside a repeatable row: enums always render as select
 *   (radio/checkbox option ids cannot be made row-unique declaratively).
 */
function normalizeUi(ui, schema, path, inRow = false) {
  assertKnownKeys(ui, UI_KEYS, path);
  const widgetRaw = uiValue(ui, "widget", "ui:widget", path);
  const placeholderRaw = uiValue(ui, "placeholder", "ui:placeholder", path);
  const rowsRaw = uiValue(ui, "rows", "ui:rows", path);
  const labelsRaw = uiValue(ui, "enumLabels", "ui:enumLabels", path);

  const widget = widgetRaw === undefined ? undefined : assertString(widgetRaw, `${path}.widget`);
  if (widget !== undefined && !WIDGETS.has(widget)) {
    throw new Error(`@faqir-ui/forms: unsupported widget "${widget}" at ${path}.widget.`);
  }
  const placeholder = placeholderRaw === undefined ? undefined : assertString(placeholderRaw, `${path}.placeholder`);
  const rows = rowsRaw === undefined ? undefined : assertFiniteNumber(rowsRaw, `${path}.rows`);
  if (rows !== undefined && (!Number.isInteger(rows) || rows < 1)) {
    throw new TypeError(`@faqir-ui/forms: ${path}.rows must be an integer greater than or equal to 1.`);
  }

  /** @type {string[] | undefined} */
  let enumLabels;
  if (labelsRaw !== undefined) {
    if (schema.enum === undefined) throw new Error(`@faqir-ui/forms: ${path}.enumLabels requires a schema enum.`);
    if (!Array.isArray(labelsRaw) || labelsRaw.length !== (/** @type {string[]} */ (schema.enum)).length) {
      throw new Error(`@faqir-ui/forms: ${path}.enumLabels must contain one label per enum value.`);
    }
    enumLabels = labelsRaw.map((value, index) => assertString(value, `${path}.enumLabels[${index}]`));
  }

  const type = schema.type;
  const format = schema.format;
  const allowed = type === "string"
    ? schema.enum !== undefined
      ? inRow ? new Set(["select"]) : new Set(["select", "radio"])
      : format === "date"
        ? new Set(["date-picker"])
        : new Set(["input", "textarea"])
    : type === "boolean"
      ? new Set(["checkbox", "switch"])
      : new Set(["input"]);
  if (widget !== undefined && !allowed.has(widget)) {
    throw new Error(`@faqir-ui/forms: widget "${widget}" is incompatible with ${path.replace(/^uiSchema/, "jsonSchema.properties")}.`);
  }
  if (rows !== undefined && widget !== "textarea") {
    throw new Error(`@faqir-ui/forms: ${path}.rows is supported only with the textarea widget.`);
  }
  if (placeholder !== undefined && type !== "string") {
    throw new Error(`@faqir-ui/forms: ${path}.placeholder is supported only for string fields.`);
  }

  return { widget, placeholder, rows, enumLabels };
}

/**
 * @param {Record<string, unknown>} ui
 * @param {string[]} values
 * @param {string} path
 */
function normalizeEnumArrayUi(ui, values, path) {
  assertKnownKeys(ui, ENUM_ARRAY_UI_KEYS, path);
  const widgetRaw = uiValue(ui, "widget", "ui:widget", path);
  const labelsRaw = uiValue(ui, "enumLabels", "ui:enumLabels", path);
  const widget = widgetRaw === undefined ? undefined : assertString(widgetRaw, `${path}.widget`);
  if (widget !== undefined && widget !== "checkbox-group" && widget !== "multi-select") {
    throw new Error(`@faqir-ui/forms: widget "${widget}" is incompatible with ${path} (enum arrays render as checkbox-group or multi-select).`);
  }
  /** @type {string[] | undefined} */
  let enumLabels;
  if (labelsRaw !== undefined) {
    if (!Array.isArray(labelsRaw) || labelsRaw.length !== values.length) {
      throw new Error(`@faqir-ui/forms: ${path}.enumLabels must contain one label per enum value.`);
    }
    enumLabels = labelsRaw.map((value, index) => assertString(value, `${path}.enumLabels[${index}]`));
  }
  return { widget, enumLabels };
}

/**
 * @param {Record<string, unknown>} ui
 * @param {Record<string, unknown>} itemProperties
 * @param {string} path
 */
function normalizeObjectArrayUi(ui, itemProperties, path) {
  assertKnownKeys(ui, OBJECT_ARRAY_UI_KEYS, path);
  const addRaw = uiValue(ui, "addLabel", "ui:addLabel", path);
  const removeRaw = uiValue(ui, "removeLabel", "ui:removeLabel", path);
  const addLabel = addRaw === undefined ? undefined : assertString(addRaw, `${path}.addLabel`);
  const removeLabel = removeRaw === undefined ? undefined : assertString(removeRaw, `${path}.removeLabel`);
  const itemsUi = ui.items === undefined ? {} : assertRecord(ui.items, `${path}.items`);
  for (const key of Object.keys(itemsUi)) {
    if (!Object.prototype.hasOwnProperty.call(itemProperties, key)) {
      throw new Error(`@faqir-ui/forms: ${path}.items references unknown row property "${key}".`);
    }
  }
  return { addLabel, removeLabel, itemsUi };
}

/**
 * Validate a `ui:groups` / `ui:wizard` field list partition: every top-level
 * property appears exactly once across all lists.
 * @param {string[][]} lists
 * @param {Record<string, unknown>} properties
 * @param {string} path
 */
function assertFieldPartition(lists, properties, path) {
  const seen = new Set();
  for (const list of lists) {
    for (const name of list) {
      if (!Object.prototype.hasOwnProperty.call(properties, name)) {
        throw new Error(`@faqir-ui/forms: ${path} references unknown property "${name}".`);
      }
      if (seen.has(name)) {
        throw new Error(`@faqir-ui/forms: ${path} lists property "${name}" more than once.`);
      }
      seen.add(name);
    }
  }
  for (const name of Object.keys(properties)) {
    if (!seen.has(name)) {
      throw new Error(`@faqir-ui/forms: ${path} does not place property "${name}" — every property must appear exactly once.`);
    }
  }
}

/**
 * @param {unknown} raw
 * @param {Record<string, unknown>} properties
 */
function normalizeGroups(raw, properties) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new TypeError('@faqir-ui/forms: uiSchema["ui:groups"] must be a non-empty array of layout groups.');
  }
  const groups = raw.map((rawGroup, index) => {
    const path = `uiSchema["ui:groups"][${index}]`;
    const group = assertRecord(rawGroup, path);
    assertKnownKeys(group, GROUP_KEYS, path);
    const title = group.title === undefined ? undefined : assertString(group.title, `${path}.title`);
    const description = group.description === undefined ? undefined : assertString(group.description, `${path}.description`);
    const fields = assertStringArray(group.fields, `${path}.fields`);
    return { title, description, fields };
  });
  assertFieldPartition(groups.map((group) => group.fields), properties, 'uiSchema["ui:groups"]');
  return groups;
}

/**
 * @param {unknown} raw
 * @param {Record<string, unknown>} properties
 */
function normalizeWizard(raw, properties) {
  const wizard = assertRecord(raw, 'uiSchema["ui:wizard"]');
  assertKnownKeys(wizard, WIZARD_KEYS, 'uiSchema["ui:wizard"]');
  const label = wizard.label === undefined ? undefined : assertString(wizard.label, 'uiSchema["ui:wizard"].label');
  if (!Array.isArray(wizard.steps) || wizard.steps.length < 2) {
    throw new TypeError('@faqir-ui/forms: uiSchema["ui:wizard"].steps must be an array of at least two steps.');
  }
  const steps = wizard.steps.map((rawStep, index) => {
    const path = `uiSchema["ui:wizard"].steps[${index}]`;
    const step = assertRecord(rawStep, path);
    assertKnownKeys(step, STEP_KEYS, path);
    const title = assertString(step.title, `${path}.title`);
    const description = step.description === undefined ? undefined : assertString(step.description, `${path}.description`);
    const fields = assertStringArray(step.fields, `${path}.fields`);
    // A step's `when` is logic, not markup: it becomes a `jump` rule, and the
    // rules package is what reads it. Only its shape is checked here.
    const when = step.when === undefined ? undefined : assertRecord(step.when, `${path}.when`);
    return { title, description, fields, when };
  });
  assertFieldPartition(steps.map((step) => step.fields), properties, 'uiSchema["ui:wizard"].steps');
  return { label, steps };
}

// ── Rules: the definition a form carries beside its markup [1.1B-06 · §8.3] ──
//
// The renderer EMITS a `@faqir-ui/rules` definition; it never evaluates one, so
// this package still depends on nothing. The definition is written into a
// `<script type="application/json">` beside the form and pointed at by
// `l-rules`, which the `faqir-rules` plugin reads in the page and a server
// re-reads before it writes anything down — one document, two readers.
//
// Two sources feed it. `opts.rules` is what the author wrote (verbs, messages,
// extra fields); the rest is DERIVED from the JSON Schema the renderer already
// understands, so `if/then/else`, `dependentRequired` and a wizard step's
// `when` stop being keywords that throw and become rules that run. The `fields`
// map is always derived, never authored from scratch: it carries the same
// coercion types the widgets were chosen from, which is what makes the page's
// `data` and the server's `data` the same object.

/** The definition format `@faqir-ui/rules` implements. */
const RULES_VERSION = "1";

const RULES_OPTION_KEYS = new Set(["version", "fields", "required", "messages", "defaultLocale", "rules"]);
const CONDITIONAL_KEYS = new Set(["if", "then", "else"]);
const CONDITION_KEYS = new Set(["properties", "required"]);
const CONSEQUENT_KEYS = new Set(["properties", "required"]);
const CONDITION_TEST_KEYS = new Set(["const", "enum"]);

/** @param {Record<string, unknown>} properties @param {string} name @param {string} path */
function assertKnownProperty(properties, name, path) {
  if (!Object.prototype.hasOwnProperty.call(properties, name)) {
    throw new Error(`@faqir-ui/forms: ${path} references unknown property "${name}".`);
  }
  return name;
}

/** A value a condition may compare against. @param {unknown} value @param {string} path */
function assertJsonScalar(value, path) {
  const type = typeof value;
  if (type !== "string" && type !== "number" && type !== "boolean") {
    throw new TypeError(`@faqir-ui/forms: ${path} must be a string, number, or boolean.`);
  }
  return /** @type {string | number | boolean} */ (value);
}

/**
 * One field's rules schema — the JSON Schema subset `@faqir-ui/rules` accepts,
 * built from the same schema the widget was chosen from. Keywords the rules
 * package has no reading for (`default`, the `step` alias's UI half) are left
 * out rather than renamed into something it would enforce differently.
 * @param {Record<string, unknown>} schema
 * @param {string} path
 * @returns {Record<string, unknown>}
 */
function rulesFieldSchema(schema, path) {
  const kind = classifyField(schema, path);
  /** @type {Record<string, unknown>} */
  const out = {};

  if (kind === "scalar") {
    out.type = schema.type;
    if (schema.title !== undefined) out.title = schema.title;
    if (schema.enum !== undefined) out.enum = schema.enum;
    if (schema.format !== undefined) out.format = schema.format;
    if (schema.pattern !== undefined) out.pattern = schema.pattern;
    if (schema.minLength !== undefined) out.minLength = schema.minLength;
    if (schema.maxLength !== undefined) out.maxLength = schema.maxLength;
    if (schema.minimum !== undefined) out.minimum = schema.minimum;
    if (schema.maximum !== undefined) out.maximum = schema.maximum;
    // `step` is documented as the HTML-oriented alias for `multipleOf`, and the
    // browser enforces it as one, so the server is told the same thing.
    const multipleOf = schema.multipleOf === undefined ? schema.step : schema.multipleOf;
    if (multipleOf !== undefined) out.multipleOf = multipleOf;
    return out;
  }

  if (kind === "object") {
    out.type = "object";
    if (schema.title !== undefined) out.title = schema.title;
    /** @type {Record<string, unknown>} */
    const properties = {};
    for (const [name, child] of Object.entries(assertRecord(schema.properties, `${path}.properties`))) {
      properties[name] = rulesFieldSchema(assertRecord(child, `${path}.properties.${name}`), `${path}.properties.${name}`);
    }
    out.properties = properties;
    if (Array.isArray(schema.required) && schema.required.length > 0) out.required = [...schema.required];
    return out;
  }

  const items = assertRecord(schema.items, `${path}.items`);
  out.type = "array";
  if (schema.title !== undefined) out.title = schema.title;
  if (kind === "enum-array") {
    out.items = { type: "string", enum: [...(/** @type {string[]} */ (items.enum))] };
    if (schema.uniqueItems === true) out.uniqueItems = true;
    return out;
  }

  /** @type {Record<string, unknown>} */
  const rowProperties = {};
  for (const [name, child] of Object.entries(assertRecord(items.properties, `${path}.items.properties`))) {
    rowProperties[name] = rulesFieldSchema(assertRecord(child, `${path}.items.properties.${name}`), `${path}.items.properties.${name}`);
  }
  /** @type {Record<string, unknown>} */
  const rowSchema = { type: "object", properties: rowProperties };
  if (Array.isArray(items.required) && items.required.length > 0) rowSchema.required = [...items.required];
  out.items = rowSchema;
  if (schema.minItems !== undefined) out.minItems = schema.minItems;
  if (schema.maxItems !== undefined) out.maxItems = schema.maxItems;
  return out;
}

/**
 * The whole `fields` map, in schema order.
 * @param {Record<string, unknown>} properties
 */
function rulesFieldsFrom(properties) {
  /** @type {Record<string, unknown>} */
  const fields = {};
  for (const [name, schema] of Object.entries(properties)) {
    const path = `jsonSchema.properties.${name}`;
    fields[name] = rulesFieldSchema(assertRecord(schema, path), path);
  }
  return fields;
}

/**
 * The JSONLogic condition an `if` subschema states. A property test is a value
 * test (`const` or `enum`); a bare `required` name is a presence test, which is
 * what `dependentRequired` means too.
 * @param {unknown} raw
 * @param {Record<string, unknown>} properties
 * @param {string} path
 */
function conditionFromIf(raw, properties, path) {
  const condition = assertRecord(raw, path);
  assertKnownKeys(condition, CONDITION_KEYS, path);
  /** @type {unknown[]} */
  const terms = [];
  const tested = new Set();

  const tests = condition.properties === undefined ? {} : assertRecord(condition.properties, `${path}.properties`);
  for (const [name, rawTest] of Object.entries(tests)) {
    const testPath = `${path}.properties.${name}`;
    assertKnownProperty(properties, name, `${path}.properties`);
    const test = assertRecord(rawTest, testPath);
    assertKnownKeys(test, CONDITION_TEST_KEYS, testPath);
    if (test.const !== undefined && test.enum !== undefined) {
      throw new Error(`@faqir-ui/forms: ${testPath} cannot combine const with enum.`);
    }
    tested.add(name);
    if (test.const !== undefined) {
      terms.push({ "==": [{ var: name }, assertJsonScalar(test.const, `${testPath}.const`)] });
      continue;
    }
    if (!Array.isArray(test.enum) || test.enum.length === 0) {
      throw new Error(
        `@faqir-ui/forms: ${testPath} must state a "const" or a non-empty "enum" — a conditional tests a value.`,
      );
    }
    terms.push({ in: [{ var: name }, test.enum.map((value, index) => assertJsonScalar(value, `${testPath}.enum[${index}]`))] });
  }

  const present = condition.required === undefined ? [] : assertStringArray(condition.required, `${path}.required`);
  for (const name of present) {
    assertKnownProperty(properties, name, `${path}.required`);
    if (tested.has(name)) continue; // a value test already implies presence
    terms.push({ "!": { missing: [name] } });
  }

  if (terms.length === 0) {
    throw new Error(`@faqir-ui/forms: ${path} states no condition; an "if" needs a "properties" test or a "required" name.`);
  }
  return terms.length === 1 ? terms[0] : { and: terms };
}

/**
 * A `then` / `else` branch, as rules: `properties` is what the branch makes
 * visible, `required` is what it demands. A conditional CONSTRAINT (a `then`
 * property carrying keywords) is refused rather than dropped — the rules
 * package expresses it as a `validate` rule, and `opts.rules` is where that
 * goes.
 * @param {unknown} raw
 * @param {unknown} condition
 * @param {Record<string, unknown>} properties
 * @param {string} path
 * @param {(base: string) => string} allocateId
 */
function rulesFromConsequent(raw, condition, properties, path, allocateId) {
  const branch = assertRecord(raw, path);
  assertKnownKeys(branch, CONSEQUENT_KEYS, path);
  /** @type {Record<string, unknown>[]} */
  const rules = [];

  const shown = branch.properties === undefined ? {} : assertRecord(branch.properties, `${path}.properties`);
  for (const [name, rawEntry] of Object.entries(shown)) {
    const entryPath = `${path}.properties.${name}`;
    assertKnownProperty(properties, name, `${path}.properties`);
    const entry = assertRecord(rawEntry, entryPath);
    if (Object.keys(entry).length > 0) {
      throw new Error(
        `@faqir-ui/forms: ${entryPath} carries constraints; a conditional branch decides visibility only ` +
        `(write it as {}). Express a conditional constraint as a "validate" rule in opts.rules.`,
      );
    }
    rules.push({ id: allocateId(`show-${idToken(name) || "field"}`), show: name, when: condition });
  }

  const required = branch.required === undefined ? [] : assertStringArray(branch.required, `${path}.required`);
  for (const name of required) {
    assertKnownProperty(properties, name, `${path}.required`);
    rules.push({ id: allocateId(`require-${idToken(name) || "field"}`), require: name, when: condition });
  }

  if (rules.length === 0) {
    throw new Error(`@faqir-ui/forms: ${path} changes nothing; a branch needs "properties" (visibility) or "required".`);
  }
  return rules;
}

/**
 * Every conditional the root schema carries: its own `if/then/else`, plus each
 * `allOf` entry, which is the standard way to write more than one. `allOf` is
 * accepted for conditionals ONLY — it is not schema composition here, and an
 * entry that is not a conditional throws rather than being merged in silently.
 * @param {Record<string, unknown>} root
 */
function conditionalsOf(root) {
  /** @type {Array<{ node: Record<string, unknown>, path: string }>} */
  const out = [];
  if (root.if !== undefined || root.then !== undefined || root.else !== undefined) {
    if (root.if === undefined) {
      throw new Error('@faqir-ui/forms: jsonSchema has a "then"/"else" with no "if".');
    }
    out.push({ node: { if: root.if, then: root.then, else: root.else }, path: "jsonSchema" });
  }
  if (root.allOf !== undefined) {
    if (!Array.isArray(root.allOf) || root.allOf.length === 0) {
      throw new TypeError("@faqir-ui/forms: jsonSchema.allOf must be a non-empty array of conditionals.");
    }
    root.allOf.forEach((entry, index) => {
      const path = `jsonSchema.allOf[${index}]`;
      const node = assertRecord(entry, path);
      assertKnownKeys(node, CONDITIONAL_KEYS, path);
      if (node.if === undefined) {
        throw new Error(
          `@faqir-ui/forms: ${path} must be a conditional ("if" with "then" and/or "else"); ` +
          "allOf is not supported for schema composition.",
        );
      }
      out.push({ node, path });
    });
  }
  return out;
}

/**
 * @param {Record<string, unknown>} root
 * @param {Record<string, unknown>} properties
 * @param {(base: string) => string} allocateId
 */
function conditionalRules(root, properties, allocateId) {
  /** @type {Record<string, unknown>[]} */
  const rules = [];
  for (const { node, path } of conditionalsOf(root)) {
    const condition = conditionFromIf(node.if, properties, `${path}.if`);
    if (node.then === undefined && node.else === undefined) {
      throw new Error(`@faqir-ui/forms: ${path}.if decides nothing; add a "then" or an "else".`);
    }
    if (node.then !== undefined) {
      rules.push(...rulesFromConsequent(node.then, condition, properties, `${path}.then`, allocateId));
    }
    if (node.else !== undefined) {
      rules.push(...rulesFromConsequent(node.else, { "!": condition }, properties, `${path}.else`, allocateId));
    }
  }
  return rules;
}

/**
 * `dependentRequired` — "if this one was filled in, those become required".
 * `{"!": {"missing": [trigger]}}` is presence in the rules package's own terms:
 * an unchecked box and an empty input are both absent from a form's data, so
 * both read false.
 * @param {Record<string, unknown>} root
 * @param {Record<string, unknown>} properties
 * @param {(base: string) => string} allocateId
 */
function dependentRequiredRules(root, properties, allocateId) {
  if (root.dependentRequired === undefined) return [];
  const map = assertRecord(root.dependentRequired, "jsonSchema.dependentRequired");
  /** @type {Record<string, unknown>[]} */
  const rules = [];
  for (const [trigger, rawList] of Object.entries(map)) {
    const path = `jsonSchema.dependentRequired.${trigger}`;
    assertKnownProperty(properties, trigger, "jsonSchema.dependentRequired");
    for (const name of assertStringArray(rawList, path)) {
      assertKnownProperty(properties, name, path);
      if (name === trigger) throw new Error(`@faqir-ui/forms: ${path} cannot make "${trigger}" depend on itself.`);
      rules.push({
        id: allocateId(`require-${idToken(name) || "field"}-with-${idToken(trigger) || "field"}`),
        require: name,
        when: { "!": { missing: [trigger] } },
      });
    }
  }
  return rules;
}

/**
 * A wizard step's `when` is the condition under which the step APPLIES; the
 * rules derived from it are the jump that steps over the page when it does not,
 * and a `show` per field on that page with the same condition. The second half
 * is what makes the jump honest on the server: a skipped page's fields were
 * never on screen, so `validate()` must not report them required — without the
 * `show`, every submission down the skip path was rejected by the handler the
 * page had just satisfied. Page ids are the step indices, which is what the
 * emitted wizard's `step` scope variable holds, so `$rules.next` can be read
 * without a lookup table.
 *
 * One jump steps over one page, so two conditional steps in a row are refused
 * rather than silently mis-navigated, and the first and last steps — which have
 * nowhere to jump from, or to — are refused too.
 * @param {{ steps: Array<{ when?: Record<string, unknown>, fields: string[] }> }} wizard
 * @param {(base: string) => string} allocateId
 */
function wizardJumpRules(wizard, allocateId) {
  /** @type {Record<string, unknown>[]} */
  const rules = [];
  const last = wizard.steps.length - 1;
  wizard.steps.forEach((step, index) => {
    if (step.when === undefined) return;
    const path = `uiSchema["ui:wizard"].steps[${index}].when`;
    if (index === 0) {
      throw new Error(`@faqir-ui/forms: ${path} — the first step is always reached, so it cannot be conditional.`);
    }
    if (index === last) {
      throw new Error(`@faqir-ui/forms: ${path} — the last step cannot be skipped; there is nowhere to jump to.`);
    }
    if (wizard.steps[index - 1].when !== undefined) {
      throw new Error(`@faqir-ui/forms: ${path} — two consecutive steps cannot both be conditional; one jump steps over one page.`);
    }
    rules.push({
      id: allocateId(`skip-step-${index + 1}`),
      jump: String(index + 1),
      from: String(index - 1),
      when: { "!": step.when },
    });
    for (const name of step.fields) {
      rules.push({ id: allocateId(`show-step-${index + 1}-${idToken(name) || "field"}`), show: name, when: step.when });
    }
  });
  return rules;
}

/**
 * `opts.rules`: a definition, or the parts of one an author writes by hand. The
 * verbs are passed through verbatim — this package does not own the rules
 * vocabulary and will not grow a second, drifting copy of it — but an `id` is
 * checked here, because a rule with none is a rule no message can address and
 * the emitter is what makes the ids unique.
 * @param {unknown} raw
 */
function normalizeRulesOption(raw) {
  const definition = assertRecord(raw, "opts.rules");
  assertKnownKeys(definition, RULES_OPTION_KEYS, "opts.rules");
  if (definition.version !== undefined && definition.version !== RULES_VERSION) {
    throw new Error(`@faqir-ui/forms: opts.rules.version must be "${RULES_VERSION}".`);
  }
  const fields = definition.fields === undefined ? undefined : assertRecord(definition.fields, "opts.rules.fields");
  const required = definition.required === undefined ? [] : assertStringArray(definition.required, "opts.rules.required");
  const messages = definition.messages === undefined ? undefined : assertRecord(definition.messages, "opts.rules.messages");
  const defaultLocale = definition.defaultLocale === undefined
    ? undefined
    : assertString(definition.defaultLocale, "opts.rules.defaultLocale");

  /** @type {Record<string, unknown>[]} */
  const rules = [];
  if (definition.rules !== undefined) {
    if (!Array.isArray(definition.rules)) {
      throw new TypeError("@faqir-ui/forms: opts.rules.rules must be an array of rules.");
    }
    definition.rules.forEach((rawRule, index) => {
      const rule = assertRecord(rawRule, `opts.rules.rules[${index}]`);
      if (typeof rule.id !== "string" || rule.id.length === 0) {
        throw new Error(
          `@faqir-ui/forms: opts.rules.rules[${index}].id must be a non-empty string — it is what a message is addressed to.`,
        );
      }
      rules.push(rule);
    });
  }
  return { fields, required, messages, defaultLocale, rules };
}

/**
 * The definition, as the `<script type="application/json">` a page embeds.
 *
 * `<` is escaped to `\u003c` — still JSON, and mandatory rather than careful: a
 * script element is raw text, `</script` ends it, and the operators a rules
 * definition is made of (`{"<=": …}`) are full of the character that starts
 * that sequence. Without this the parser eats the rest of the page.
 * @param {string} id
 * @param {Record<string, unknown>} definition
 */
function rulesScriptLines(id, definition) {
  const json = JSON.stringify(definition, null, 2).replaceAll("<", "\\u003c");
  return [
    `<script type="application/json" id="${attrValue(id)}">`,
    ...json.split("\n"),
    "</script>",
  ];
}

/** @param {string[]} attrs */
function renderAttrs(attrs) {
  return attrs.length === 0 ? "" : ` ${attrs.join(" ")}`;
}

/**
 * Per-row dynamic wiring for a field rendered inside a repeatable group's
 * template: expressions (bound with `:attr`) that derive row-unique ids and
 * names from the row's reconciliation key / index at runtime, while the static
 * attributes keep the template itself audit-clean.
 * @typedef {{ idExpr: string, nameExpr: string, hintExpr: string, errorExpr: string, describedByExpr: string }} RowWiring
 */

/**
 * Shared rendering context for one field.
 * @typedef {{
 *   id: string, name: string, title: string, required: boolean, describedBy: string,
 *   threshold: number, i18n: Record<string, string>,
 *   disabledExpr: string | null, dyn: RowWiring | null,
 * }} FieldCtx
 */

/**
 * @param {FieldCtx} ctx
 */
function commonControlAttrs(ctx) {
  const attrs = [`id="${attrValue(ctx.id)}"`];
  if (ctx.dyn) attrs.push(`:id="${attrValue(ctx.dyn.idExpr)}"`);
  attrs.push(`name="${attrValue(ctx.name)}"`);
  if (ctx.dyn) attrs.push(`:name="${attrValue(ctx.dyn.nameExpr)}"`);
  if (ctx.required) attrs.push("required", 'aria-required="true"');
  attrs.push(`aria-describedby="${attrValue(ctx.describedBy)}"`);
  if (ctx.dyn) attrs.push(`:aria-describedby="${attrValue(ctx.dyn.describedByExpr)}"`);
  if (ctx.disabledExpr) attrs.push(`:disabled="${attrValue(ctx.disabledExpr)}"`);
  return attrs;
}

// ── `pattern`: one regular expression, two readers ─────────────────────────
//
// JSON Schema's `pattern` is UNANCHORED — `[A-Z]+` accepts "abcD" — and is what
// `@faqir-ui/rules` enforces on a server. HTML's `pattern` attribute is
// implicitly anchored (`^(?:p)$`) and compiled with the `v` flag. Writing the
// schema's string into the attribute verbatim therefore made the browser
// stricter than the server, and a pattern the `v` flag rejects (`[a-z.-]`,
// whose bare `-` is a syntax error there) is silently ignored by the browser
// altogether. So the attribute is DERIVED: an already whole-anchored pattern
// goes through as it is, anything else is wrapped to match anywhere, and one
// that is not `v`-safe is left off — the definition then travels with the form
// and the `faqir-rules` plugin enforces it with the server's own evaluator.

/** Characters the `v` flag reserves as doubled punctuation inside a class. */
const V_DOUBLE_PUNCTUATORS = "&!#$%*+,.:;<=>?@^`~";
/** Characters the `v` flag refuses unescaped inside a class. */
const V_CLASS_SYNTAX = "()[{}/|";

/**
 * Would a browser compile this under the `v` flag? Decided without `v` — Node
 * 18 has no such flag, and the same schema must render the same bytes on every
 * runtime — by compiling it under `u` (whose grammar `v` extends everywhere but
 * inside a character class) and then reading every class for the syntax `v`
 * adds. Conservative: when in doubt, the answer is no.
 * @param {string} pattern
 */
function vFlagSafe(pattern) {
  try {
    new RegExp(pattern, "u");
  } catch {
    return false;
  }
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "\\") {
      i += 1;
      continue;
    }
    if (pattern[i] !== "[") continue;
    let j = i + 1;
    if (pattern[j] === "^") j += 1;
    let atom = false; // the last thing read was a single class character
    for (; j < pattern.length && pattern[j] !== "]"; j++) {
      const c = pattern[j];
      if (c === "\\") {
        j += 1;
        atom = true;
        continue;
      }
      if (V_CLASS_SYNTAX.includes(c)) return false;
      if (V_DOUBLE_PUNCTUATORS.includes(c) && pattern[j + 1] === c) return false;
      if (c === "-") {
        if (!atom || pattern[j + 1] === "]" || pattern[j + 1] === "-") return false;
        j += pattern[j + 1] === "\\" ? 2 : 1; // the range's upper end
        atom = false;
        continue;
      }
      atom = true;
    }
    i = j;
  }
  return true;
}

/**
 * Is the whole pattern pinned at both ends — `^…$` with no top-level `|`? Then
 * HTML's implicit anchoring adds nothing and it can be emitted as written.
 * @param {string} pattern
 */
function wholeAnchored(pattern) {
  if (!pattern.startsWith("^") || !pattern.endsWith("$")) return false;
  let depth = 0;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      if (i === pattern.length - 2) return false; // the closing `$` is escaped
      i += 1;
    } else if (inClass) {
      if (c === "]") inClass = false;
    } else if (c === "[") inClass = true;
    else if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === "|" && depth === 0) return false;
  }
  return true;
}

/**
 * The HTML `pattern` attribute meaning what the schema's `pattern` means, or
 * `null` when no attribute can.
 * @param {string} pattern
 */
function htmlPattern(pattern) {
  if (!vFlagSafe(pattern)) return null;
  return wholeAnchored(pattern) ? pattern : `[\\s\\S]*(?:${pattern})[\\s\\S]*`;
}

/** @param {string[]} attrs @param {Record<string, unknown>} schema */
function pushPattern(attrs, schema) {
  if (schema.pattern === undefined) return;
  const html = htmlPattern(/** @type {string} */ (schema.pattern));
  if (html !== null) attrs.push(`pattern="${attrValue(html)}"`);
}

/**
 * @param {Record<string, unknown>} schema
 * @param {{ widget?: string, placeholder?: string, rows?: number, enumLabels?: string[] }} ui
 * @param {FieldCtx} ctx
 */
function renderControl(schema, ui, ctx) {
  const common = commonControlAttrs(ctx);
  const type = /** @type {string} */ (schema.type);

  if (type === "string" && schema.enum !== undefined) {
    const values = /** @type {string[]} */ (schema.enum);
    const labels = ui.enumLabels ?? values;
    const widget = ui.widget ?? (!ctx.dyn && values.length <= ctx.threshold ? "radio" : "select");
    if (widget === "radio") return renderRadio(values, labels, schema.default, common, ctx);
    return renderSelect(values, labels, schema.default, ui.placeholder, common, ctx);
  }

  if (type === "string" && schema.format === "date") {
    return renderDatePicker(schema, ui, common, ctx);
  }

  if (type === "boolean") {
    const widget = ui.widget ?? "checkbox";
    const attrs = [`data-ui="${widget}"`, 'type="checkbox"'];
    if (widget === "switch") attrs.push('role="switch"');
    attrs.push(...common);
    if (schema.default === true) attrs.push("checked");
    return [`<input${renderAttrs(attrs)}>`];
  }

  if (type === "string" && ui.widget === "textarea") {
    const attrs = ['data-ui="textarea"', ...common];
    attrs.push(`rows="${attrValue(ui.rows ?? 4)}"`);
    if (ui.placeholder !== undefined) attrs.push(`placeholder="${attrValue(ui.placeholder)}"`);
    if (schema.minLength !== undefined) attrs.push(`minlength="${attrValue(/** @type {number} */ (schema.minLength))}"`);
    if (schema.maxLength !== undefined) attrs.push(`maxlength="${attrValue(/** @type {number} */ (schema.maxLength))}"`);
    pushPattern(attrs, schema);
    const value = schema.default === undefined ? "" : escapeHtml(/** @type {string} */ (schema.default));
    return [`<textarea${renderAttrs(attrs)}>${value}</textarea>`];
  }

  const htmlType = type === "string"
    ? schema.format === "email" ? "email" : schema.format === "uri" ? "url" : "text"
    : "number";
  const attrs = ['data-ui="input"', ...common, `type="${htmlType}"`];
  if (ui.placeholder !== undefined) attrs.push(`placeholder="${attrValue(ui.placeholder)}"`);
  if (schema.default !== undefined) attrs.push(`value="${attrValue(/** @type {string | number | boolean} */ (schema.default))}"`);
  if (schema.minLength !== undefined) attrs.push(`minlength="${attrValue(/** @type {number} */ (schema.minLength))}"`);
  if (schema.maxLength !== undefined) attrs.push(`maxlength="${attrValue(/** @type {number} */ (schema.maxLength))}"`);
  pushPattern(attrs, schema);
  if (schema.minimum !== undefined) attrs.push(`min="${attrValue(/** @type {number} */ (schema.minimum))}"`);
  if (schema.maximum !== undefined) attrs.push(`max="${attrValue(/** @type {number} */ (schema.maximum))}"`);
  // A number input with no `step` steps by 1, so the browser refuses `2.5` as
  // a step mismatch the schema never asked for: a plain `number` says "any".
  const step = schema.multipleOf ?? schema.step ?? (type === "integer" ? 1 : "any");
  if (htmlType === "number") attrs.push(`step="${attrValue(/** @type {number | string} */ (step))}"`);
  return [`<input${renderAttrs(attrs)}>`];
}

/**
 * @param {string[]} values @param {string[]} labels @param {unknown} defaultValue
 * @param {string[]} common
 * @param {FieldCtx} ctx
 */
function renderRadio(values, labels, defaultValue, common, ctx) {
  const labelId = `${ctx.id}-label`;
  const describedBy = common.find((attr) => attr.startsWith("aria-describedby="));
  const requiredAttrs = common.filter((attr) => attr === "required" || attr.startsWith("aria-required="));
  const lines = [`<div data-ui="radio-group" role="radiogroup" aria-labelledby="${attrValue(labelId)}"${describedBy ? ` ${describedBy}` : ""}>`];
  values.forEach((value, index) => {
    const optionId = `${ctx.id}-option-${index + 1}`;
    const attrs = [
      'data-ui="radio"', 'type="radio"', `id="${attrValue(optionId)}"`,
      `name="${attrValue(ctx.name)}"`, `value="${attrValue(value)}"`, ...requiredAttrs,
    ];
    if (describedBy) attrs.push(describedBy);
    if (ctx.disabledExpr) attrs.push(`:disabled="${attrValue(ctx.disabledExpr)}"`);
    if (defaultValue === value) attrs.push("checked");
    lines.push("  <label data-ui=\"radio-label\">");
    lines.push(`    <input${renderAttrs(attrs)}>`);
    lines.push(`    <span data-part="label">${escapeHtml(labels[index])}</span>`);
    lines.push("  </label>");
  });
  lines.push("</div>");
  return lines;
}

/**
 * @param {string[]} values @param {string[]} labels @param {unknown} defaultValue
 * @param {string | undefined} placeholder @param {string[]} common
 * @param {FieldCtx} ctx
 */
function renderSelect(values, labels, defaultValue, placeholder, common, ctx) {
  const attrs = ['data-ui="select"', ...common];
  const prompt = placeholder ?? interpolateTitle(ctx.i18n.selectPlaceholder, ctx.title);
  const promptAttrs = ['value=""'];
  if (defaultValue === undefined) promptAttrs.push("selected");
  if (common.includes("required")) promptAttrs.push("disabled");
  const lines = [`<select${renderAttrs(attrs)}>`];
  lines.push(`  <option ${promptAttrs.join(" ")}>${escapeHtml(prompt)}</option>`);
  values.forEach((value, index) => {
    const selected = defaultValue === value ? " selected" : "";
    lines.push(`  <option value="${attrValue(value)}"${selected}>${escapeHtml(labels[index])}</option>`);
  });
  lines.push("</select>");
  return lines;
}

/**
 * Multi-value select for high-cardinality enum arrays. Unlike the single
 * select there is no prompt option — `multiple` selects render as a listbox.
 * @param {string[]} values @param {string[]} labels @param {string[]} defaults
 * @param {string[]} common
 */
function renderMultiSelect(values, labels, defaults, common) {
  const attrs = ['data-ui="select"', "multiple", ...common];
  const lines = [`<select${renderAttrs(attrs)}>`];
  values.forEach((value, index) => {
    const selected = defaults.includes(value) ? " selected" : "";
    lines.push(`  <option value="${attrValue(value)}"${selected}>${escapeHtml(labels[index])}</option>`);
  });
  lines.push("</select>");
  return lines;
}

/**
 * Checkbox group for low-cardinality enum arrays. Mirrors the radio-group
 * anatomy: a role="group" wrapper labelled by the field-group label, one
 * checkbox-label per value. Group-level minimum selection is not natively
 * enforceable, so `required` renders the marker only (documented).
 * @param {string[]} values @param {string[]} labels @param {string[]} defaults
 * @param {FieldCtx} ctx
 */
function renderCheckboxGroup(values, labels, defaults, ctx) {
  const labelId = `${ctx.id}-label`;
  const describedBy = `aria-describedby="${attrValue(ctx.describedBy)}"`;
  const lines = [`<div data-ui="checkbox-group" role="group" aria-labelledby="${attrValue(labelId)}" ${describedBy}>`];
  values.forEach((value, index) => {
    const optionId = `${ctx.id}-option-${index + 1}`;
    const attrs = [
      'data-ui="checkbox"', 'type="checkbox"', `id="${attrValue(optionId)}"`,
      `name="${attrValue(ctx.name)}"`, `value="${attrValue(value)}"`, describedBy,
    ];
    if (ctx.disabledExpr) attrs.push(`:disabled="${attrValue(ctx.disabledExpr)}"`);
    if (defaults.includes(value)) attrs.push("checked");
    lines.push("  <label data-ui=\"checkbox-label\">");
    lines.push(`    <input${renderAttrs(attrs)}>`);
    lines.push(`    <span data-part="label">${escapeHtml(labels[index])}</span>`);
    lines.push("  </label>");
  });
  lines.push("</div>");
  return lines;
}

/**
 * @param {Record<string, unknown>} schema
 * @param {{ placeholder?: string }} ui
 * @param {string[]} common
 * @param {FieldCtx} ctx
 */
function renderDatePicker(schema, ui, common, ctx) {
  const inputAttrs = [
    'data-part="input"', ...common, 'type="text"', 'role="combobox"', "readonly",
    'aria-haspopup="dialog"', 'aria-expanded="false"',
    `aria-label="${attrValue(interpolateTitle(ctx.i18n.datePickerLabel, ctx.title))}"`,
  ];
  if (ui.placeholder !== undefined) inputAttrs.push(`placeholder="${attrValue(ui.placeholder)}"`);
  if (schema.default !== undefined) inputAttrs.push(`value="${attrValue(/** @type {string} */ (schema.default))}"`);
  const calendarAttrs = ['data-ui="calendar"', 'data-size="md"'];
  if (schema.default !== undefined) calendarAttrs.push(`data-value="${attrValue(/** @type {string} */ (schema.default))}"`);

  return [
    '<div data-ui="date-picker" data-state="closed" data-size="md">',
    '  <div data-part="trigger">',
    `    <input${renderAttrs(inputAttrs)}>`,
    '    <span data-part="icon" aria-hidden="true">&#x1F4C5;</span>',
    '  </div>',
    `  <div data-part="calendar" role="dialog" aria-label="${attrValue(ctx.i18n.calendarLabel)}" hidden>`,
    `    <div${renderAttrs(calendarAttrs)}>`,
    '      <div data-part="header">',
    '        <button data-part="nav-prev" type="button" aria-label="Previous month">&lsaquo;</button>',
    '        <span data-part="month-label"></span>',
    '        <button data-part="nav-next" type="button" aria-label="Next month">&rsaquo;</button>',
    '      </div>',
    `      <table data-part="grid" role="grid" aria-label="${attrValue(ctx.i18n.calendarLabel)}">`,
    '        <thead>',
    '          <tr>',
    '            <th scope="col" abbr="Sunday">Su</th>',
    '            <th scope="col" abbr="Monday">Mo</th>',
    '            <th scope="col" abbr="Tuesday">Tu</th>',
    '            <th scope="col" abbr="Wednesday">We</th>',
    '            <th scope="col" abbr="Thursday">Th</th>',
    '            <th scope="col" abbr="Friday">Fr</th>',
    '            <th scope="col" abbr="Saturday">Sa</th>',
    '          </tr>',
    '        </thead>',
    '        <tbody data-part="grid-body"></tbody>',
    '      </table>',
    '    </div>',
    '  </div>',
    '</div>',
  ];
}

/**
 * Rendering state shared across the whole form: deterministic id allocation,
 * scope-variable allocation for repeatable groups, and dependency tracking.
 * @typedef {{
 *   prefix: string, threshold: number, i18n: Record<string, string>,
 *   idCounts: Map<string, number>, scopeNames: Set<string>,
 *   scopeEntries: string[],
 *   flags: { usesDatePicker: boolean, patternInRules: boolean },
 * }} FormState
 */

/**
 * Allocate the deterministic, collision-free id for a field path.
 * @param {FormState} state @param {string[]} pathNames @param {string} [extraSegment]
 */
function allocateId(state, pathNames, extraSegment) {
  const parts = pathNames.map((part) => idToken(part) || "field");
  if (extraSegment !== undefined) parts.splice(parts.length - 1, 0, extraSegment);
  const baseToken = parts.join("-");
  const count = (state.idCounts.get(baseToken) ?? 0) + 1;
  state.idCounts.set(baseToken, count);
  return {
    id: `${state.prefix}-field-${baseToken}${count === 1 ? "" : `-${count}`}`,
    token: `${baseToken}${count === 1 ? "" : `-${count}`}`,
  };
}

/**
 * Allocate a collision-free scope variable name (`rowsMedications`, …).
 * @param {FormState} state @param {string} kind @param {string[]} pathNames
 */
function allocateScopeName(state, kind, pathNames) {
  const token = pathNames
    .map((part) => idToken(part) || "field")
    .join("-")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  let candidate = `${kind}${token}`;
  let n = 2;
  while (state.scopeNames.has(candidate)) candidate = `${kind}${token}${n++}`;
  state.scopeNames.add(candidate);
  return candidate;
}

/**
 * Build one field-group (label + control + description + error) at zero indent.
 * Shared by scalar fields and enum-array fields, at any nesting level.
 * @param {Record<string, unknown>} schema
 * @param {{ widget?: string, placeholder?: string, rows?: number, enumLabels?: string[] }} ui
 * @param {FormState} state
 * @param {{ pathNames: string[], required: boolean, disabledExpr: string | null, row: { arrayId: string, arrayName: string, childName: string } | null, enumArray: { values: string[], defaults: string[] } | null }} spec
 */
function buildFieldGroup(schema, ui, state, spec) {
  const { pathNames, required, disabledExpr, row, enumArray } = spec;
  const name = pathNames[pathNames.length - 1];
  const { id } = allocateId(state, pathNames, row ? "item" : undefined);
  const title = schema.title === undefined ? humanize(name) : /** @type {string} */ (schema.title);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = schema.description === undefined ? errorId : `${hintId} ${errorId}`;

  /** @type {RowWiring | null} */
  let dyn = null;
  if (row) {
    const childToken = idToken(row.childName) || "field";
    const dynBase = `'${row.arrayId}-' + row.__key + '-${childToken}`;
    const idExpr = `${dynBase}'`;
    const hintExpr = `${dynBase}-hint'`;
    const errorExpr = `${dynBase}-error'`;
    const describedByExpr = schema.description === undefined
      ? errorExpr
      : `${dynBase}-hint ' + '${row.arrayId}-' + row.__key + '-${childToken}-error'`;
    dyn = {
      idExpr,
      nameExpr: `'${row.arrayName}[' + rowIndex + '].${row.childName}'`,
      hintExpr,
      errorExpr,
      describedByExpr,
    };
  }

  const staticName = row ? `${row.arrayName}[].${row.childName}` : pathNames.join(".");
  /** @type {FieldCtx} */
  const ctx = {
    id,
    name: staticName,
    title,
    required,
    describedBy,
    threshold: state.threshold,
    i18n: state.i18n,
    disabledExpr,
    dyn,
  };

  /** @type {string} */
  let chosenWidget;
  /** @type {string[]} */
  let control;
  if (enumArray) {
    const labels = ui.enumLabels ?? enumArray.values;
    chosenWidget = ui.widget ?? (enumArray.values.length <= state.threshold ? "checkbox-group" : "multi-select");
    control = chosenWidget === "checkbox-group"
      ? renderCheckboxGroup(enumArray.values, labels, enumArray.defaults, ctx)
      : renderMultiSelect(enumArray.values, labels, enumArray.defaults, commonControlAttrs(ctx));
  } else {
    chosenWidget = ui.widget ?? (
      schema.type === "string" && schema.enum !== undefined
        ? !dyn && (/** @type {string[]} */ (schema.enum)).length <= state.threshold ? "radio" : "select"
        : schema.type === "string" && schema.format === "date" ? "date-picker"
          : schema.type === "boolean" ? "checkbox" : "input"
    );
    if (chosenWidget === "date-picker") state.flags.usesDatePicker = true;
    if (typeof schema.pattern === "string" && htmlPattern(schema.pattern) === null) state.flags.patternInRules = true;
    control = renderControl(schema, ui, ctx);
  }

  const labelTargetsOption = chosenWidget === "radio" || chosenWidget === "checkbox-group";
  const labelId = `${id}-label`;
  const label = `${escapeHtml(title)}${required ? ` <span data-part="required">${escapeHtml(state.i18n.requiredMarker)}</span>` : ""}`;
  // A radio/checkbox group's aria-labelledby points to this exact field-group label.
  const labelIdAttr = labelTargetsOption ? ` id="${attrValue(labelId)}"` : "";
  const labelForValue = labelTargetsOption ? `${id}-option-1` : id;
  const labelForBind = dyn && !labelTargetsOption ? ` :for="${attrValue(dyn.idExpr)}"` : "";

  const lines = [
    '<div data-ui="field-group">',
    `  <label data-part="label"${labelIdAttr} for="${attrValue(labelForValue)}"${labelForBind}>${label}</label>`,
    '  <div data-part="input">',
    ...control.map((line) => `    ${line}`),
    '  </div>',
  ];
  if (schema.description !== undefined) {
    const hintBind = dyn ? ` :id="${attrValue(dyn.hintExpr)}"` : "";
    lines.push(`  <p data-part="description" id="${attrValue(hintId)}"${hintBind}>${escapeHtml(/** @type {string} */ (schema.description))}</p>`);
  }
  const errorBind = dyn ? ` :id="${attrValue(dyn.errorExpr)}"` : "";
  lines.push(`  <p data-part="error" id="${attrValue(errorId)}"${errorBind} aria-live="polite"></p>`);
  lines.push("</div>");
  return lines;
}

/**
 * A fieldset card wrapper (nested objects, layout groups, repeatable groups).
 * @param {{ title?: string, description?: string, rootAttrs?: string[], bodyLines: string[] }} spec
 */
function fieldsetCard(spec) {
  const attrs = ['data-ui="card"', 'data-variant="outlined"', ...(spec.rootAttrs ?? [])];
  const lines = [`<fieldset${renderAttrs(attrs)}>`];
  if (spec.title !== undefined) lines.push(`  <legend data-part="title">${escapeHtml(spec.title)}</legend>`);
  if (spec.description !== undefined) lines.push(`  <p data-part="description">${escapeHtml(spec.description)}</p>`);
  lines.push('  <div data-part="body">');
  lines.push(...indentLines(spec.bodyLines, 2));
  lines.push("  </div>");
  lines.push("</fieldset>");
  return lines;
}

/**
 * Render one named field of any kind to zero-indent lines.
 * @param {string} name
 * @param {Record<string, unknown>} schema
 * @param {Record<string, unknown>} ui
 * @param {FormState} state
 * @param {{ pathNames: string[], required: boolean, disabledExpr: string | null }} spec
 * @returns {string[]}
 */
function renderField(name, schema, ui, state, spec) {
  const schemaPath = `jsonSchema.properties.${spec.pathNames.join(".properties.")}`;
  const uiPath = `uiSchema.${spec.pathNames.join(".")}`;
  const kind = classifyField(schema, schemaPath);

  if (kind === "scalar") {
    validateFieldSchema(schema, schemaPath);
    const normalizedUi = normalizeUi(ui, schema, uiPath);
    return buildFieldGroup(schema, normalizedUi, state, { ...spec, row: null, enumArray: null });
  }

  if (kind === "enum-array") {
    const values = validateEnumArrayField(schema, schemaPath);
    const normalizedUi = normalizeEnumArrayUi(ui, values, uiPath);
    const defaults = schema.default === undefined ? [] : /** @type {string[]} */ (schema.default);
    return buildFieldGroup(schema, normalizedUi, state, {
      ...spec,
      row: null,
      enumArray: { values, defaults },
    });
  }

  if (kind === "object") {
    assertKnownKeys(schema, OBJECT_FIELD_KEYS, schemaPath);
    if (schema.title !== undefined) assertString(schema.title, `${schemaPath}.title`);
    if (schema.description !== undefined) assertString(schema.description, `${schemaPath}.description`);
    const { properties, requiredSet } = validatePropertiesAndRequired(schema, schemaPath);
    for (const key of Object.keys(ui)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        throw new Error(
          `@faqir-ui/forms: ${uiPath}.${key} does not match a property of ${schemaPath} — nested object UI schemas mirror the schema structure.`,
        );
      }
    }
    const title = schema.title === undefined ? humanize(name) : /** @type {string} */ (schema.title);
    /** @type {string[]} */
    const bodyLines = [];
    for (const [childName, rawChild] of Object.entries(properties)) {
      const childSchema = assertRecord(rawChild, `${schemaPath}.properties.${childName}`);
      const childUi = ui[childName] === undefined ? {} : assertRecord(ui[childName], `${uiPath}.${childName}`);
      bodyLines.push(...renderField(childName, childSchema, childUi, state, {
        pathNames: [...spec.pathNames, childName],
        required: requiredSet.has(childName),
        disabledExpr: spec.disabledExpr,
      }));
    }
    return fieldsetCard({
      title,
      description: /** @type {string | undefined} */ (schema.description),
      bodyLines,
    });
  }

  // object-array → repeatable group: rows driven by l-data + keyed l-for.
  for (const segment of spec.pathNames) assertExpressionSafeName(segment, schemaPath);
  const { properties, requiredSet } = validateObjectArrayField(schema, schemaPath);
  const { addLabel, removeLabel, itemsUi } = normalizeObjectArrayUi(ui, properties, uiPath);
  const title = schema.title === undefined ? humanize(name) : /** @type {string} */ (schema.title);
  const minItems = schema.minItems === undefined ? 0 : /** @type {number} */ (schema.minItems);
  const maxItems = /** @type {number | undefined} */ (schema.maxItems);
  const initialRows = Math.max(minItems, 1);

  const rowsVar = allocateScopeName(state, "rows", spec.pathNames);
  const seqVar = allocateScopeName(state, "seq", spec.pathNames);
  const { id: arrayId } = allocateId(state, spec.pathNames);
  const arrayName = spec.pathNames.join(".");

  // Row state lives on the FORM's l-data scope: faqir-core does not chain
  // nested l-data scopes, and wizard step gates inside the group must still
  // see `step` — one flat scope per form keeps every expression resolvable.
  const initial = Array.from({ length: initialRows }, (_, index) => `{ __key: ${index + 1} }`).join(", ");
  state.scopeEntries.push(`${rowsVar}: [${initial}]`, `${seqVar}: ${initialRows}`);

  /** @type {string[]} */
  const rowLines = [];
  for (const [childName, rawChild] of Object.entries(properties)) {
    const childSchema = assertRecord(rawChild, `${schemaPath}.items.properties.${childName}`);
    const childUiRaw = itemsUi[childName] === undefined ? {} : assertRecord(itemsUi[childName], `${uiPath}.items.${childName}`);
    const childUi = normalizeUi(childUiRaw, childSchema, `${uiPath}.items.${childName}`, true);
    rowLines.push(...buildFieldGroup(childSchema, childUi, state, {
      pathNames: [...spec.pathNames, childName],
      required: requiredSet.has(childName),
      disabledExpr: spec.disabledExpr,
      row: { arrayId, arrayName, childName },
      enumArray: null,
    }));
  }
  const removeText = removeLabel ?? interpolateTitle(state.i18n.removeRowLabel, title);
  const removeAttrs = [
    'type="button"', 'data-ui="button"', 'data-variant="ghost"', 'data-size="sm"',
    `@click="${attrValue(`${rowsVar}.splice(rowIndex, 1)`)}"`,
  ];
  const removeGate = [minItems > 0 ? `${rowsVar}.length <= ${minItems}` : null, spec.disabledExpr]
    .filter(Boolean).join(" || ");
  if (removeGate) removeAttrs.push(`:disabled="${attrValue(removeGate)}"`);
  rowLines.push(`<button${renderAttrs(removeAttrs)}>${escapeHtml(removeText)}</button>`);

  const addText = addLabel ?? interpolateTitle(state.i18n.addRowLabel, title);
  const addAttrs = [
    'type="button"', 'data-ui="button"', 'data-variant="outline"', 'data-size="sm"',
    `@click="${attrValue(`${rowsVar}.push({ __key: (${seqVar} = ${seqVar} + 1) })`)}"`,
  ];
  const addGate = [maxItems !== undefined ? `${rowsVar}.length >= ${maxItems}` : null, spec.disabledExpr]
    .filter(Boolean).join(" || ");
  if (addGate) addAttrs.push(`:disabled="${attrValue(addGate)}"`);

  const bodyLines = [
    `<template l-for="(row, rowIndex) in ${rowsVar}" l-key="row.__key">`,
    '  <div data-ui="card" data-variant="filled" data-size="sm">',
    '    <div data-part="body">',
    ...indentLines(rowLines, 3),
    "    </div>",
    "  </div>",
    "</template>",
    `<button${renderAttrs(addAttrs)}>${escapeHtml(addText)}</button>`,
  ];

  return fieldsetCard({
    title,
    description: /** @type {string | undefined} */ (schema.description),
    bodyLines,
  });
}

/**
 * Render the wizard chrome: stepper, one card panel per step (visibility via
 * `data-state`/`hidden` bindings), and Back/Next/Submit navigation. Stub of the
 * 0.6-14 `wizard` pattern contract — stepper + card + field-group + button,
 * driven by `l-data` `{ step }`, with faqir-validate gating each advance
 * (inactive steps' controls are disabled, so submit validates only the active
 * step; the `l-validate` on-valid hook advances or completes).
 * @param {{ label: string | undefined, steps: Array<{ title: string, description: string | undefined, fields: string[] }> }} wizard
 * @param {(name: string, disabledExpr: string | null) => string[]} renderNamedField
 * @param {Record<string, string>} i18n
 * @param {boolean} [jumps] The definition carries `jump` rules, so navigation
 *   asks `$rules.next` which page comes next instead of counting by one.
 */
function renderWizard(wizard, renderNamedField, i18n, jumps = false) {
  const last = wizard.steps.length - 1;
  /** @type {string[]} */
  const lines = [];

  const stepperAttrs = [
    'data-ui="stepper"', 'role="navigation"',
    `aria-label="${attrValue(wizard.label ?? i18n.wizardNavLabel)}"`,
  ];
  lines.push(`<div${renderAttrs(stepperAttrs)}>`);
  wizard.steps.forEach((step, index) => {
    if (index > 0) lines.push('  <div data-part="connector"></div>');
    const stateExpr = `step > ${index} ? 'completed' : (step === ${index} ? 'active' : null)`;
    const staticState = index === 0 ? ' data-state="active"' : "";
    lines.push(`  <div data-part="step"${staticState} :data-state="${attrValue(stateExpr)}">`);
    lines.push(`    <span data-part="indicator">${index + 1}</span>`);
    lines.push(`    <span data-part="label">${escapeHtml(step.title)}</span>`);
    lines.push("  </div>");
  });
  lines.push("</div>");

  // Step gating is binding-owned: no static `hidden`/`disabled` twins, the
  // `:hidden`/`:disabled` expressions add and remove the real attributes at
  // runtime. Pre-JS presentation of inactive steps belongs to the wizard
  // pattern's CSS keyed on data-state (0.6-14).
  wizard.steps.forEach((step, index) => {
    const disabledExpr = `step !== ${index}`;
    const panelAttrs = ['data-ui="card"', 'data-variant="outlined"'];
    panelAttrs.push(`:hidden="${attrValue(`step !== ${index}`)}"`);
    panelAttrs.push(`:data-state="${attrValue(`step === ${index} ? 'active' : null`)}"`);
    lines.push(`<section${renderAttrs(panelAttrs)}>`);
    lines.push(`  <h2 data-part="title">${escapeHtml(step.title)}</h2>`);
    if (step.description !== undefined) {
      lines.push(`  <p data-part="description">${escapeHtml(step.description)}</p>`);
    }
    lines.push('  <div data-part="body">');
    for (const fieldName of step.fields) {
      lines.push(...indentLines(renderNamedField(fieldName, disabledExpr), 2));
    }
    lines.push("  </div>");
    lines.push("</section>");
  });

  // Back is the forward jump read in reverse: a page the wizard stepped OVER
  // announces itself as `next[step - 2] === step`, so Back steps over it too
  // rather than landing on a page the rules skipped.
  const backExpr = jumps
    ? "step = $rules.next[step - 2] == step ? step - 2 : step - 1"
    : "step = step - 1";
  lines.push("<div>");
  lines.push(`  <button type="button" data-ui="button" data-variant="outline" :disabled="${attrValue("step === 0")}" @click="${attrValue(backExpr)}">${escapeHtml(i18n.backLabel)}</button>`);
  lines.push(`  <button type="submit" data-ui="button" data-variant="primary" :hidden="${attrValue(`step === ${last}`)}">${escapeHtml(i18n.nextLabel)}</button>`);
  lines.push(`  <button type="submit" data-ui="button" data-variant="primary" :hidden="${attrValue(`step !== ${last}`)}">${escapeHtml(i18n.submitLabel)}</button>`);
  lines.push("</div>");

  return lines;
}

/**
 * Render the supported JSON Schema subset (scalars + nested objects + enum
 * arrays + repeatable object arrays, with `ui:groups` layout groups or a
 * `ui:wizard` multi-step flow) to deterministic, validation-ready Faqir HTML.
 * Unsupported types, composition keywords, formats, widgets, and constraints
 * throw instead of disappearing from the output.
 *
 * @param {Record<string, unknown>} jsonSchema
 * @param {Record<string, unknown>} [uiSchema]
 * @param {Record<string, unknown>} [opts]
 * @returns {string}
 */
export function renderForm(jsonSchema, uiSchema = {}, opts = {}) {
  const root = assertRecord(jsonSchema, "jsonSchema");
  const uiRoot = assertRecord(uiSchema, "uiSchema");
  const rawOptions = assertRecord(opts, "opts");
  assertKnownKeys(root, ROOT_KEYS, "jsonSchema");
  if (root.type !== "object") {
    const type = Array.isArray(root.type) ? JSON.stringify(root.type) : String(root.type);
    throw new Error(`@faqir-ui/forms: jsonSchema.type must be "object"; received ${type}.`);
  }
  const properties = assertRecord(root.properties, "jsonSchema.properties");
  if (root.title !== undefined) assertString(root.title, "jsonSchema.title");
  if (root.description !== undefined) assertString(root.description, "jsonSchema.description");
  if (root.$schema !== undefined) assertString(root.$schema, "jsonSchema.$schema");
  if (root.$id !== undefined) assertString(root.$id, "jsonSchema.$id");

  /** @type {string[]} */
  let required = [];
  if (root.required !== undefined) {
    if (!Array.isArray(root.required)) throw new TypeError("@faqir-ui/forms: jsonSchema.required must be a string array.");
    required = root.required.map((name, index) => assertString(name, `jsonSchema.required[${index}]`));
    if (new Set(required).size !== required.length) throw new Error("@faqir-ui/forms: jsonSchema.required cannot contain duplicates.");
    for (const name of required) {
      if (!Object.prototype.hasOwnProperty.call(properties, name)) {
        throw new Error(`@faqir-ui/forms: jsonSchema.required references unknown property "${name}".`);
      }
    }
  }
  const requiredSet = new Set(required);
  const normalizedOptions = normalizeOptions(rawOptions);

  const groupsRaw = uiRoot["ui:groups"];
  const wizardRaw = uiRoot["ui:wizard"];
  if (groupsRaw !== undefined && wizardRaw !== undefined) {
    throw new Error('@faqir-ui/forms: uiSchema cannot combine "ui:groups" with "ui:wizard" — pick one layout.');
  }
  for (const name of Object.keys(uiRoot)) {
    if (name === "ui:groups" || name === "ui:wizard") continue;
    if (!Object.prototype.hasOwnProperty.call(properties, name)) {
      throw new Error(`@faqir-ui/forms: uiSchema references unknown property "${name}".`);
    }
  }

  /** @type {FormState} */
  const state = {
    prefix: normalizedOptions.prefix,
    threshold: normalizedOptions.threshold,
    i18n: normalizedOptions.i18n,
    idCounts: new Map(),
    scopeNames: new Set(),
    scopeEntries: [],
    flags: { usesDatePicker: false, patternInRules: false },
  };

  /** @param {string} name @param {string | null} disabledExpr */
  const renderNamedField = (name, disabledExpr) => {
    const schema = assertRecord(properties[name], `jsonSchema.properties.${name}`);
    const ui = uiRoot[name] === undefined ? {} : assertRecord(uiRoot[name], `uiSchema.${name}`);
    return renderField(name, schema, ui, state, {
      pathNames: [name],
      required: requiredSet.has(name),
      disabledExpr,
    });
  };

  const wizard = wizardRaw === undefined ? undefined : normalizeWizard(wizardRaw, properties);
  const groups = groupsRaw === undefined ? undefined : normalizeGroups(groupsRaw, properties);

  // Rules, part one: everything the wizard's own markup depends on. Ids are
  // allocated against the author's own, which are reserved first, so a derived
  // rule can never take an id a message is already addressed to.
  const rulesOption = normalizedOptions.rules;
  /** @type {Set<string>} */
  const ruleIds = new Set();
  for (const rule of rulesOption ? rulesOption.rules : []) {
    const id = /** @type {string} */ (rule.id);
    if (ruleIds.has(id)) {
      throw new Error(`@faqir-ui/forms: opts.rules.rules has two rules with the id "${id}"; an id is what a message is addressed to.`);
    }
    ruleIds.add(id);
  }
  /** @param {string} base */
  const allocateRuleId = (base) => {
    let candidate = base;
    let n = 2;
    while (ruleIds.has(candidate)) candidate = `${base}-${n++}`;
    ruleIds.add(candidate);
    return candidate;
  };
  const jumpRules = wizard ? wizardJumpRules(wizard, allocateRuleId) : [];
  const hasJumps = jumpRules.length > 0 ||
    (rulesOption ? rulesOption.rules.some((rule) => typeof rule.jump === "string") : false);

  /** @type {string[]} */
  const bodyLines = [];
  if (wizard) {
    bodyLines.push(...renderWizard(wizard, renderNamedField, normalizedOptions.i18n, hasJumps));
  } else if (groups) {
    for (const group of groups) {
      /** @type {string[]} */
      const groupBody = [];
      for (const fieldName of group.fields) groupBody.push(...renderNamedField(fieldName, null));
      bodyLines.push(...fieldsetCard({
        title: group.title,
        description: group.description,
        bodyLines: groupBody,
      }));
    }
  } else {
    for (const name of Object.keys(properties)) bodyLines.push(...renderNamedField(name, null));
  }

  // Rules, part two: the rest of the definition, derived from a schema every
  // field of which has now been validated by the render above.
  const derivedRules = [
    ...conditionalRules(root, properties, allocateRuleId),
    ...dependentRequiredRules(root, properties, allocateRuleId),
    // Derived last, allocated first: the wizard's markup had to know about them.
    ...jumpRules,
  ];
  /** @type {Record<string, unknown> | null} */
  let rulesDefinition = null;
  // A `pattern` no HTML attribute can carry is enforced by the plugin from the
  // definition, so such a form carries one even with no rules of its own.
  if (rulesOption || derivedRules.length > 0 || state.flags.patternInRules) {
    /** @type {Record<string, unknown>} */
    const definition = { version: RULES_VERSION };
    definition.fields = { ...rulesFieldsFrom(properties), ...(rulesOption && rulesOption.fields) };
    const requiredPaths = [...new Set([...required, ...(rulesOption ? rulesOption.required : [])])];
    if (requiredPaths.length > 0) definition.required = requiredPaths;
    if (rulesOption && rulesOption.messages !== undefined) definition.messages = rulesOption.messages;
    if (rulesOption && rulesOption.defaultLocale !== undefined) definition.defaultLocale = rulesOption.defaultLocale;
    // The author's rules come first: a `jump` contest is won by the first rule
    // that matches, and the author outranks the schema.
    const allRules = [...(rulesOption ? rulesOption.rules : []), ...derivedRules];
    if (allRules.length > 0) definition.rules = allRules;
    rulesDefinition = definition;
  }
  const rulesId = `${normalizedOptions.prefix}-rules`;

  const dependencies = [
    "faqir-core.js",
    "faqir-validate.js",
    ...(rulesDefinition ? ["faqir-rules.js"] : []),
    ...(state.flags.usesDatePicker ? ["date-picker.js", "calendar.js"] : []),
  ].join(" ");
  // The form itself carries `l-data`: faqir-core only walks scope roots
  // ([l-data]/[data-ui]), so without it a bare rendered form would never get
  // its `l-validate` processed — the §7.2 contract is that the output works
  // against faqir-core + faqir-validate alone, with no wrapper required.
  const formAttrs = [`id="${attrValue(`${normalizedOptions.prefix}-form`)}"`];
  if (wizard) {
    // Completion is reflected imperatively via $el (data-state="submitted"):
    // bind directives declared ON a scope root are not applied by faqir-core,
    // so a :data-state binding on the form itself would never run.
    const last = wizard.steps.length - 1;
    const entries = ["step: 0", ...state.scopeEntries];
    // With `jump` rules in play the next page is the definition's answer, not
    // the next integer: `$rules.next` is keyed by the page being left, and its
    // value is the page id (a step index) to go to.
    const advance = hasJumps
      ? "step = $rules.next[step] === undefined ? step + 1 : +$rules.next[step]"
      : "step = step + 1";
    formAttrs.push(`l-data="${attrValue(`{ ${entries.join(", ")} }`)}"`);
    formAttrs.push(`l-validate="${attrValue(`step < ${last} ? (${advance}) : ($el.dataset.state = 'submitted')`)}"`);
  } else {
    formAttrs.push(state.scopeEntries.length
      ? `l-data="${attrValue(`{ ${state.scopeEntries.join(", ")} }`)}"`
      : "l-data");
    formAttrs.push("l-validate");
  }
  if (rulesDefinition) formAttrs.push(`l-rules="#${attrValue(rulesId)}"`);
  if (root.title !== undefined) formAttrs.push(`aria-label="${attrValue(/** @type {string} */ (root.title))}"`);
  if (root.description !== undefined) formAttrs.push(`aria-describedby="${attrValue(`${normalizedOptions.prefix}-form-description`)}"`);
  if (normalizedOptions.theme !== undefined) formAttrs.push(`data-theme="${attrValue(normalizedOptions.theme)}"`);
  if (normalizedOptions.density !== undefined) formAttrs.push(`data-density="${attrValue(normalizedOptions.density)}"`);

  /** @type {string[]} */
  const output = [`<!-- @ui:requires ${dependencies} -->`];
  if (rulesDefinition) output.push(...rulesScriptLines(rulesId, rulesDefinition));
  output.push(`<form${renderAttrs(formAttrs)}>`);
  if (root.title !== undefined) output.push(`  <h1>${escapeHtml(/** @type {string} */ (root.title))}</h1>`);
  if (root.description !== undefined) {
    output.push(`  <p id="${attrValue(`${normalizedOptions.prefix}-form-description`)}">${escapeHtml(/** @type {string} */ (root.description))}</p>`);
  }
  output.push(...indentLines(bodyLines, 1));
  output.push("</form>");
  return output.join("\n") + "\n";
}
