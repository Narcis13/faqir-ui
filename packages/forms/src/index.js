/**
 * @faqir-ui/forms scalar renderer.
 *
 * This module deliberately has no imports and touches no host globals. Rendering
 * is pure string construction, so the same source runs in Bun, Node, browsers,
 * workers, and agent sandboxes.
 */

export const DEFAULT_RADIO_THRESHOLD = 4;

const ROOT_KEYS = new Set(["$schema", "$id", "type", "title", "description", "properties", "required"]);
const FIELD_KEYS = new Set([
  "type", "title", "description", "enum", "format", "default",
  "minLength", "maxLength", "pattern", "minimum", "maximum", "multipleOf", "step",
]);
const UI_KEYS = new Set([
  "widget", "ui:widget", "placeholder", "ui:placeholder",
  "rows", "ui:rows", "enumLabels", "ui:enumLabels",
]);
const OPTION_KEYS = new Set(["idPrefix", "radioThreshold", "theme", "density", "i18n"]);
const I18N_KEYS = new Set(["requiredMarker", "selectPlaceholder", "datePickerLabel", "calendarLabel"]);
const STRING_FORMATS = new Set(["date", "email", "uri"]);
const WIDGETS = new Set(["input", "textarea", "select", "radio", "checkbox", "switch", "date-picker"]);

const DEFAULT_I18N = Object.freeze({
  requiredMarker: "*",
  selectPlaceholder: "Select {title}",
  datePickerLabel: "Choose {title}",
  calendarLabel: "Calendar",
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

  return { prefix, threshold, theme, density, i18n };
}

/**
 * @param {Record<string, unknown>} schema
 * @param {string} path
 */
function validateFieldSchema(schema, path) {
  assertKnownKeys(schema, FIELD_KEYS, path);
  const type = assertString(schema.type, `${path}.type`);
  if (!new Set(["string", "number", "integer", "boolean"]).has(type)) {
    throw new Error(`@faqir-ui/forms: unsupported type "${type}" at ${path}.type; scalar fields only.`);
  }

  if (schema.title !== undefined) assertString(schema.title, `${path}.title`);
  if (schema.description !== undefined) assertString(schema.description, `${path}.description`);

  if (schema.enum !== undefined) {
    if (type !== "string") throw new Error(`@faqir-ui/forms: ${path}.enum is supported only for string fields.`);
    if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
      throw new TypeError(`@faqir-ui/forms: ${path}.enum must be a non-empty string array.`);
    }
    for (let index = 0; index < schema.enum.length; index++) {
      assertString(schema.enum[index], `${path}.enum[${index}]`);
    }
    if (new Set(schema.enum).size !== schema.enum.length) {
      throw new Error(`@faqir-ui/forms: ${path}.enum values must be unique.`);
    }
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
    if (schema.enum !== undefined && !schema.enum.includes(schema.default)) {
      throw new Error(`@faqir-ui/forms: ${path}.default must be one of its enum values.`);
    }
  }
}

/**
 * @param {Record<string, unknown>} ui
 * @param {Record<string, unknown>} schema
 * @param {string} path
 */
function normalizeUi(ui, schema, path) {
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
    if (!Array.isArray(labelsRaw) || labelsRaw.length !== schema.enum.length) {
      throw new Error(`@faqir-ui/forms: ${path}.enumLabels must contain one label per enum value.`);
    }
    enumLabels = labelsRaw.map((value, index) => assertString(value, `${path}.enumLabels[${index}]`));
  }

  const type = schema.type;
  const format = schema.format;
  const allowed = type === "string"
    ? schema.enum !== undefined
      ? new Set(["select", "radio"])
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

/** @param {string[]} attrs */
function renderAttrs(attrs) {
  return attrs.length === 0 ? "" : ` ${attrs.join(" ")}`;
}

/**
 * @param {string} id
 * @param {string} name
 * @param {boolean} required
 * @param {string} describedBy
 */
function commonControlAttrs(id, name, required, describedBy) {
  const attrs = [`id="${attrValue(id)}"`, `name="${attrValue(name)}"`];
  if (required) attrs.push("required", 'aria-required="true"');
  attrs.push(`aria-describedby="${attrValue(describedBy)}"`);
  return attrs;
}

/**
 * @param {Record<string, unknown>} schema
 * @param {{ widget?: string, placeholder?: string, rows?: number, enumLabels?: string[] }} ui
 * @param {{ id: string, name: string, title: string, required: boolean, describedBy: string, threshold: number, i18n: Record<string, string> }} ctx
 */
function renderControl(schema, ui, ctx) {
  const common = commonControlAttrs(ctx.id, ctx.name, ctx.required, ctx.describedBy);
  const type = /** @type {string} */ (schema.type);

  if (type === "string" && schema.enum !== undefined) {
    const values = /** @type {string[]} */ (schema.enum);
    const labels = ui.enumLabels ?? values;
    const widget = ui.widget ?? (values.length <= ctx.threshold ? "radio" : "select");
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
    if (schema.pattern !== undefined) attrs.push(`pattern="${attrValue(/** @type {string} */ (schema.pattern))}"`);
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
  if (schema.pattern !== undefined) attrs.push(`pattern="${attrValue(/** @type {string} */ (schema.pattern))}"`);
  if (schema.minimum !== undefined) attrs.push(`min="${attrValue(/** @type {number} */ (schema.minimum))}"`);
  if (schema.maximum !== undefined) attrs.push(`max="${attrValue(/** @type {number} */ (schema.maximum))}"`);
  const step = schema.multipleOf ?? schema.step ?? (type === "integer" ? 1 : undefined);
  if (step !== undefined) attrs.push(`step="${attrValue(/** @type {number} */ (step))}"`);
  return [`<input${renderAttrs(attrs)}>`];
}

/**
 * @param {string[]} values @param {string[]} labels @param {unknown} defaultValue
 * @param {string[]} common
 * @param {{ id: string, name: string, title: string }} ctx
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
 * @param {{ title: string, i18n: Record<string, string> }} ctx
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
 * @param {Record<string, unknown>} schema
 * @param {{ placeholder?: string }} ui
 * @param {string[]} common
 * @param {{ title: string, i18n: Record<string, string> }} ctx
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
 * Render a strict JSON Schema scalar subset to deterministic, validation-ready
 * Faqir HTML. Unsupported types, composition keywords, formats, widgets, and
 * constraints throw instead of disappearing from the output.
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

  for (const name of Object.keys(uiRoot)) {
    if (!Object.prototype.hasOwnProperty.call(properties, name)) {
      throw new Error(`@faqir-ui/forms: uiSchema references unknown property "${name}".`);
    }
  }

  const fields = [];
  const idCounts = new Map();
  let usesDatePicker = false;
  for (const [name, rawFieldSchema] of Object.entries(properties)) {
    const path = `jsonSchema.properties.${name}`;
    const schema = assertRecord(rawFieldSchema, path);
    validateFieldSchema(schema, path);
    const ui = normalizeUi(
      uiRoot[name] === undefined ? {} : assertRecord(uiRoot[name], `uiSchema.${name}`),
      schema,
      `uiSchema.${name}`,
    );

    const baseToken = idToken(name) || "field";
    const count = (idCounts.get(baseToken) ?? 0) + 1;
    idCounts.set(baseToken, count);
    const id = `${normalizedOptions.prefix}-field-${baseToken}${count === 1 ? "" : `-${count}`}`;
    const title = schema.title === undefined ? humanize(name) : /** @type {string} */ (schema.title);
    const isRequired = requiredSet.has(name);
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const describedBy = schema.description === undefined ? errorId : `${hintId} ${errorId}`;
    const chosenWidget = ui.widget ?? (
      schema.type === "string" && schema.enum !== undefined
        ? schema.enum.length <= normalizedOptions.threshold ? "radio" : "select"
        : schema.type === "string" && schema.format === "date" ? "date-picker"
          : schema.type === "boolean" ? "checkbox" : "input"
    );
    if (chosenWidget === "date-picker") usesDatePicker = true;

    const labelId = `${id}-label`;
    const label = `${escapeHtml(title)}${isRequired ? ` <span data-part="required">${escapeHtml(normalizedOptions.i18n.requiredMarker)}</span>` : ""}`;
    const control = renderControl(schema, ui, {
      id,
      name,
      title,
      required: isRequired,
      describedBy,
      threshold: normalizedOptions.threshold,
      i18n: normalizedOptions.i18n,
    });
    // A radio group's aria-labelledby points to this exact field-group label.
    const labelIdAttr = chosenWidget === "radio" ? ` id="${attrValue(labelId)}"` : "";

    const lines = [
      '  <div data-ui="field-group">',
      `    <label data-part="label"${labelIdAttr} for="${attrValue(chosenWidget === "radio" ? `${id}-option-1` : id)}">${label}</label>`,
      '    <div data-part="input">',
      ...control.map((line) => `      ${line}`),
      '    </div>',
    ];
    if (schema.description !== undefined) {
      lines.push(`    <p data-part="description" id="${attrValue(hintId)}">${escapeHtml(/** @type {string} */ (schema.description))}</p>`);
    }
    lines.push(`    <p data-part="error" id="${attrValue(errorId)}" aria-live="polite"></p>`);
    lines.push("  </div>");
    fields.push(lines);
  }

  const dependencies = usesDatePicker
    ? "faqir-core.js faqir-validate.js date-picker.js calendar.js"
    : "faqir-core.js faqir-validate.js";
  const formAttrs = [`id="${attrValue(`${normalizedOptions.prefix}-form`)}"`, "l-validate"];
  if (root.title !== undefined) formAttrs.push(`aria-label="${attrValue(/** @type {string} */ (root.title))}"`);
  if (root.description !== undefined) formAttrs.push(`aria-describedby="${attrValue(`${normalizedOptions.prefix}-form-description`)}"`);
  if (normalizedOptions.theme !== undefined) formAttrs.push(`data-theme="${attrValue(normalizedOptions.theme)}"`);
  if (normalizedOptions.density !== undefined) formAttrs.push(`data-density="${attrValue(normalizedOptions.density)}"`);

  const output = [`<!-- @ui:requires ${dependencies} -->`, `<form${renderAttrs(formAttrs)}>`];
  if (root.title !== undefined) output.push(`  <h1>${escapeHtml(/** @type {string} */ (root.title))}</h1>`);
  if (root.description !== undefined) {
    output.push(`  <p id="${attrValue(`${normalizedOptions.prefix}-form-description`)}">${escapeHtml(/** @type {string} */ (root.description))}</p>`);
  }
  fields.forEach((lines) => output.push(...lines));
  output.push("</form>");
  return output.join("\n") + "\n";
}
