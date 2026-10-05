/**
 * @faqir-ui/forms/dom — the same forms, built as DOM nodes. [1.1F-30]
 *
 * `renderForm` writes a string, and a string a browser parses is a place a
 * schema can inject markup: every title is escaped, but the safety is the
 * escaper's. `buildForm` never writes markup. It creates elements on the
 * `document` it is given, puts every schema string in through `textContent`
 * or `setAttribute`, and derives no expression from the schema: the form
 * carries a bare `l-data` and a bare `l-validate` and nothing else for the
 * engine to evaluate. Ids are a counter, never a property name.
 *
 * Minimal on purpose: scalars, nested objects, enum arrays, `ui:groups`, and
 * repeatable rows, which are added and removed imperatively rather than by
 * `l-for`. A wizard, and any schema that needs a rules definition (the
 * conditional keywords, `opts.rules`, a `pattern` no HTML attribute can
 * carry), throws: use `renderForm` for those.
 *
 * The schema is checked by `renderForm` itself before a node is made, so the
 * two accept exactly the same subset and fail with the same messages.
 */

import { DEFAULT_RADIO_THRESHOLD, renderForm } from "./index.js";

const DEFAULT_I18N = Object.freeze({
  requiredMarker: "*",
  selectPlaceholder: "Select {title}",
  datePickerLabel: "Choose {title}",
  calendarLabel: "Calendar",
  addRowLabel: "Add {title}",
  removeRowLabel: "Remove {title}",
});

/** The fixed text `renderForm` leaves where a schema says `additionalProperties: false`. */
const CLOSED_NOTE = " additionalProperties: false - a closed object: the form submits only the fields rendered here ";

const WEEKDAYS = [
  ["Sunday", "Su"], ["Monday", "Mo"], ["Tuesday", "Tu"], ["Wednesday", "We"],
  ["Thursday", "Th"], ["Friday", "Fr"], ["Saturday", "Sa"],
];

/**
 * @typedef {Record<string, any>} Schema
 * @typedef {{
 *   doc: Document, prefix: string, threshold: number, i18n: Record<string, string>,
 *   nextId: () => string,
 * }} BuildState
 * @typedef {{
 *   id: string, name: string, title: string, required: boolean, describedBy: string,
 * }} FieldCtx
 */

/** @param {string} value */
function idToken(value) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
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

/** `ui:*` wins; `renderForm` has already refused a pair that disagrees. @param {Schema} ui @param {string} key */
function uiValue(ui, key) {
  return ui[`ui:${key}`] !== undefined ? ui[`ui:${key}`] : ui[key];
}

/** A nullable field is its type, and `default: null` is no default. @param {Schema} schema */
function denull(schema) {
  if (!Array.isArray(schema.type)) return schema;
  const field = { ...schema, type: schema.type.find((/** @type {string} */ type) => type !== "null") };
  if (field.default === null) delete field.default;
  return field;
}

/**
 * Is the whole pattern pinned at both ends? Then it goes into the attribute as
 * written; otherwise it is wrapped to match anywhere, as `renderForm` does. A
 * pattern no attribute can carry never gets here: it needs a rules definition.
 * @param {string} pattern
 */
function wholeAnchored(pattern) {
  if (!pattern.startsWith("^") || !pattern.endsWith("$")) return false;
  let depth = 0;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      if (i === pattern.length - 2) return false;
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
 * One element. `true` is a boolean attribute, `undefined`/`false` is none, and
 * `text` goes in as `textContent` — never parsed.
 * @param {Document} doc @param {string} tag
 * @param {Record<string, string | number | boolean | undefined>} [attrs]
 * @param {string} [text]
 */
function el(doc, tag, attrs = {}, text) {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {FieldCtx} ctx */
function commonAttrs(ctx) {
  return {
    id: ctx.id,
    name: ctx.name,
    required: ctx.required,
    "aria-required": ctx.required ? "true" : undefined,
    "aria-describedby": ctx.describedBy,
  };
}

/**
 * @param {BuildState} state @param {string[]} values @param {string[]} labels
 * @param {(value: string) => boolean} checked @param {FieldCtx} ctx @param {"radio" | "checkbox"} kind
 */
function optionGroup(state, values, labels, checked, ctx, kind) {
  const { doc } = state;
  const group = el(doc, "div", {
    "data-ui": kind === "radio" ? "radio-group" : "checkbox-group",
    role: kind === "radio" ? "radiogroup" : "group",
    "aria-labelledby": `${ctx.id}-label`,
    "aria-describedby": ctx.describedBy,
  });
  values.forEach((value, index) => {
    const label = el(doc, "label", { "data-ui": `${kind}-label` });
    label.append(
      el(doc, "input", {
        "data-ui": kind,
        type: kind,
        id: `${ctx.id}-option-${index + 1}`,
        name: ctx.name,
        value,
        // A checkbox group's minimum is not natively enforceable: the marker only.
        required: kind === "radio" && ctx.required,
        "aria-required": kind === "radio" && ctx.required ? "true" : undefined,
        "aria-describedby": ctx.describedBy,
        checked: checked(value),
      }),
      el(doc, "span", { "data-part": "label" }, labels[index]),
    );
    group.append(label);
  });
  return group;
}

/**
 * @param {BuildState} state @param {string[]} values @param {string[]} labels
 * @param {(value: string) => boolean} selected @param {FieldCtx} ctx
 * @param {string | undefined} prompt A single select's empty first option; none on a multi-select.
 */
function select(state, values, labels, selected, ctx, prompt) {
  const { doc } = state;
  const control = el(doc, "select", { "data-ui": "select", multiple: prompt === undefined, ...commonAttrs(ctx) });
  if (prompt !== undefined) {
    const none = !values.some(selected);
    control.append(el(doc, "option", { value: "", selected: none, disabled: ctx.required }, prompt));
  }
  values.forEach((value, index) => {
    control.append(el(doc, "option", { value, selected: selected(value) }, labels[index]));
  });
  return control;
}

/** @param {BuildState} state @param {Schema} schema @param {string | undefined} placeholder @param {FieldCtx} ctx */
function datePicker(state, schema, placeholder, ctx) {
  const { doc } = state;
  const root = el(doc, "div", { "data-ui": "date-picker", "data-state": "closed", "data-size": "md" });
  const trigger = el(doc, "div", { "data-part": "trigger" });
  trigger.append(
    el(doc, "input", {
      "data-part": "input", ...commonAttrs(ctx), type: "text", role: "combobox", readonly: true,
      "aria-haspopup": "dialog", "aria-expanded": "false",
      "aria-label": interpolateTitle(state.i18n.datePickerLabel, ctx.title),
      placeholder, value: schema.default,
    }),
    el(doc, "span", { "data-part": "icon", "aria-hidden": "true" }, "\u{1F4C5}"),
  );
  const dialog = el(doc, "div", { "data-part": "calendar", role: "dialog", "aria-label": state.i18n.calendarLabel, hidden: true });
  const calendar = el(doc, "div", { "data-ui": "calendar", "data-size": "md", "data-value": schema.default });
  const header = el(doc, "div", { "data-part": "header" });
  header.append(
    el(doc, "button", { "data-part": "nav-prev", type: "button", "aria-label": "Previous month" }, "‹"),
    el(doc, "span", { "data-part": "month-label" }),
    el(doc, "button", { "data-part": "nav-next", type: "button", "aria-label": "Next month" }, "›"),
  );
  const grid = el(doc, "table", { "data-part": "grid", role: "grid", "aria-label": state.i18n.calendarLabel });
  const head = el(doc, "thead");
  const row = el(doc, "tr");
  for (const [day, short] of WEEKDAYS) row.append(el(doc, "th", { scope: "col", abbr: day }, short));
  head.append(row);
  grid.append(head, el(doc, "tbody", { "data-part": "grid-body" }));
  calendar.append(header, grid);
  dialog.append(calendar);
  root.append(trigger, dialog);
  return root;
}

/**
 * The control for one scalar field, chosen exactly as `renderForm` chooses it.
 * @param {BuildState} state @param {Schema} schema @param {Schema} ui @param {FieldCtx} ctx @param {boolean} inRow
 */
function scalarControl(state, schema, ui, ctx, inRow) {
  const { doc } = state;
  const widget = uiValue(ui, "widget");
  const placeholder = uiValue(ui, "placeholder") ?? (
    Array.isArray(schema.examples) && schema.enum === undefined && schema.const === undefined && schema.type !== "boolean"
      ? String(schema.examples[0])
      : undefined
  );
  const type = schema.type;

  if (type === "string" && schema.enum !== undefined) {
    const values = /** @type {string[]} */ (schema.enum);
    const labels = uiValue(ui, "enumLabels") ?? values;
    const chosen = widget ?? (!inRow && values.length <= state.threshold ? "radio" : "select");
    const isDefault = (/** @type {string} */ value) => schema.default === value;
    if (chosen === "radio") return { widget: chosen, control: optionGroup(state, values, labels, isDefault, ctx, "radio") };
    const prompt = placeholder ?? interpolateTitle(state.i18n.selectPlaceholder, ctx.title);
    return { widget: chosen, control: select(state, values, labels, isDefault, ctx, prompt) };
  }

  if (type === "string" && schema.format === "date" && schema.const === undefined) {
    return { widget: "date-picker", control: datePicker(state, schema, placeholder, ctx) };
  }

  if (type === "boolean") {
    const chosen = widget ?? "checkbox";
    return {
      widget: chosen,
      control: el(doc, "input", {
        "data-ui": chosen, type: "checkbox", role: chosen === "switch" ? "switch" : undefined,
        ...commonAttrs(ctx), checked: schema.default === true,
      }),
    };
  }

  const pattern = schema.pattern === undefined
    ? undefined
    : wholeAnchored(schema.pattern) ? schema.pattern : `[\\s\\S]*(?:${schema.pattern})[\\s\\S]*`;
  const text = schema.const ?? schema.default;

  if (type === "string" && widget === "textarea") {
    const control = el(doc, "textarea", {
      "data-ui": "textarea", ...commonAttrs(ctx), rows: uiValue(ui, "rows") ?? 4,
      readonly: schema.const !== undefined, placeholder,
      minlength: schema.minLength, maxlength: schema.maxLength, pattern,
    });
    if (text !== undefined) control.textContent = String(text);
    return { widget: "textarea", control };
  }

  const htmlType = type === "string"
    ? schema.format === "email" ? "email" : schema.format === "uri" ? "url" : "text"
    : "number";
  return {
    widget: "input",
    control: el(doc, "input", {
      "data-ui": "input", ...commonAttrs(ctx), type: htmlType, placeholder, value: text,
      readonly: schema.const !== undefined,
      minlength: schema.minLength, maxlength: schema.maxLength, pattern,
      min: schema.minimum, max: schema.maximum,
      step: htmlType === "number" ? schema.multipleOf ?? schema.step ?? (type === "integer" ? 1 : "any") : undefined,
    }),
  };
}

/**
 * One field-group — label, control, description, error — for a scalar or an
 * enum array. Returns the group and the controls that carry its `name`.
 * @param {BuildState} state @param {string} name The property name, for the default title.
 * @param {Schema} rawSchema @param {Schema} ui @param {string} fieldName The control's `name`.
 * @param {boolean} required @param {boolean} inRow
 */
function fieldGroup(state, name, rawSchema, ui, fieldName, required, inRow) {
  const { doc } = state;
  const schema = denull(rawSchema);
  const id = state.nextId();
  const title = schema.title ?? humanize(name);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  /** @type {FieldCtx} */
  const ctx = {
    id, name: fieldName, title, required,
    describedBy: schema.description === undefined ? errorId : `${hintId} ${errorId}`,
  };

  /** @type {{ widget: string, control: Element }} */
  let built;
  if (schema.type === "array") {
    const values = /** @type {string[]} */ (schema.items.enum);
    const labels = uiValue(ui, "enumLabels") ?? values;
    const defaults = /** @type {string[]} */ (schema.default ?? []);
    const widget = uiValue(ui, "widget") ?? (values.length <= state.threshold ? "checkbox-group" : "multi-select");
    const isDefault = (/** @type {string} */ value) => defaults.includes(value);
    built = {
      widget,
      control: widget === "checkbox-group"
        ? optionGroup(state, values, labels, isDefault, ctx, "checkbox")
        : select(state, values, labels, isDefault, ctx, undefined),
    };
  } else {
    built = scalarControl(state, schema, ui, ctx, inRow);
  }

  const targetsOption = built.widget === "radio" || built.widget === "checkbox-group";
  const label = el(doc, "label", {
    "data-part": "label",
    id: targetsOption ? `${id}-label` : undefined,
    for: targetsOption ? `${id}-option-1` : id,
  }, title);
  if (required) label.append(" ", el(doc, "span", { "data-part": "required" }, state.i18n.requiredMarker));

  const slot = el(doc, "div", { "data-part": "input" });
  slot.append(built.control);
  const group = el(doc, "div", { "data-ui": "field-group" });
  group.append(label, slot);
  if (schema.description !== undefined) {
    group.append(el(doc, "p", { "data-part": "description", id: hintId }, schema.description));
  }
  group.append(el(doc, "p", { "data-part": "error", id: errorId, "aria-live": "polite" }));
  return { group, named: [...group.querySelectorAll("[name]")] };
}

/**
 * A fieldset card: nested objects, layout groups and repeatable groups.
 * @param {Document} doc @param {string | undefined} title @param {string | undefined} description
 */
function fieldsetCard(doc, title, description) {
  const card = el(doc, "fieldset", { "data-ui": "card", "data-variant": "outlined" });
  if (title !== undefined) card.append(el(doc, "legend", { "data-part": "title" }, title));
  if (description !== undefined) card.append(el(doc, "p", { "data-part": "description" }, description));
  const body = el(doc, "div", { "data-part": "body" });
  card.append(body);
  return { card, body };
}

/**
 * Arrays of objects: one card per row, added and removed by listeners on the
 * buttons. Row names are rewritten on every change, so a submission's rows are
 * always `name[0]`, `name[1]`, … with no gaps.
 * @param {BuildState} state @param {string} name @param {Schema} schema @param {Schema} ui @param {string} path
 */
function repeatableGroup(state, name, schema, ui, path) {
  const { doc } = state;
  const title = schema.title ?? humanize(name);
  const minItems = schema.minItems ?? 0;
  /** @type {number | undefined} */
  const maxItems = schema.maxItems;
  const itemsUi = ui.items ?? {};
  const required = new Set(schema.items.required ?? []);
  const { card, body } = fieldsetCard(doc, title, schema.description);

  /** @type {Array<{ card: Element, remove: HTMLButtonElement, named: Array<{ el: Element, child: string }> }>} */
  const rows = [];
  const add = /** @type {HTMLButtonElement} */ (el(doc, "button", {
    type: "button", "data-ui": "button", "data-variant": "outline", "data-size": "sm",
  }, uiValue(ui, "addLabel") ?? interpolateTitle(state.i18n.addRowLabel, title)));

  const sync = () => {
    rows.forEach((row, index) => {
      for (const { el: control, child } of row.named) control.setAttribute("name", `${path}[${index}].${child}`);
      row.remove.toggleAttribute("disabled", rows.length <= minItems);
    });
    add.toggleAttribute("disabled", maxItems !== undefined && rows.length >= maxItems);
  };

  const addRow = () => {
    const rowCard = el(doc, "div", { "data-ui": "card", "data-variant": "filled", "data-size": "sm" });
    const rowBody = el(doc, "div", { "data-part": "body" });
    rowCard.append(rowBody);
    if (schema.items.additionalProperties === false) rowBody.append(doc.createComment(CLOSED_NOTE));
    /** @type {Array<{ el: Element, child: string }>} */
    const named = [];
    for (const [child, childSchema] of Object.entries(/** @type {Schema} */ (schema.items.properties))) {
      const field = fieldGroup(state, child, childSchema, itemsUi[child] ?? {}, `${path}[${rows.length}].${child}`, required.has(child), true);
      rowBody.append(field.group);
      for (const control of field.named) named.push({ el: control, child });
    }
    const remove = /** @type {HTMLButtonElement} */ (el(doc, "button", {
      type: "button", "data-ui": "button", "data-variant": "ghost", "data-size": "sm",
    }, uiValue(ui, "removeLabel") ?? interpolateTitle(state.i18n.removeRowLabel, title)));
    rowBody.append(remove);
    const row = { card: rowCard, remove, named };
    remove.addEventListener("click", () => {
      if (rows.length <= minItems) return;
      rows.splice(rows.indexOf(row), 1);
      rowCard.remove();
      sync();
      // The button that had focus is gone; the add button is where the group goes on.
      add.focus();
    });
    rows.push(row);
    body.insertBefore(rowCard, add);
  };

  body.append(add);
  add.addEventListener("click", () => {
    if (maxItems !== undefined && rows.length >= maxItems) return;
    addRow();
    sync();
  });
  for (let i = 0; i < Math.max(minItems, 1); i++) addRow();
  sync();
  return card;
}

/**
 * Any one field, appended to `parent`.
 * @param {BuildState} state @param {Element} parent @param {string} name @param {Schema} rawSchema
 * @param {Schema} ui @param {string[]} pathNames @param {boolean} required
 */
function appendField(state, parent, name, rawSchema, ui, pathNames, required) {
  const schema = denull(rawSchema);
  const path = pathNames.join(".");
  if (schema.type === "array" && schema.items.type === "object") {
    parent.append(repeatableGroup(state, name, schema, ui, path));
    return;
  }
  if (schema.type !== "object") {
    parent.append(fieldGroup(state, name, schema, ui, path, required, false).group);
    return;
  }
  const { card, body } = fieldsetCard(state.doc, schema.title ?? humanize(name), schema.description);
  if (schema.additionalProperties === false) body.append(state.doc.createComment(CLOSED_NOTE));
  const requiredSet = new Set(schema.required ?? []);
  for (const [child, childSchema] of Object.entries(/** @type {Schema} */ (schema.properties))) {
    appendField(state, body, child, childSchema, ui[child] ?? {}, [...pathNames, child], requiredSet.has(child));
  }
  parent.append(card);
}

/**
 * Build the form as DOM nodes on `document`. Accepts what `renderForm` accepts,
 * minus a wizard and anything that needs a rules definition, which throw.
 * Nothing is attached: insert the returned form where it belongs.
 *
 * @param {Record<string, unknown>} jsonSchema
 * @param {Document} document
 * @param {Record<string, unknown>} [uiSchema]
 * @param {Record<string, unknown>} [opts]
 * @returns {HTMLFormElement}
 */
export function buildForm(jsonSchema, document, uiSchema = {}, opts = {}) {
  if (uiSchema && typeof uiSchema === "object" && "ui:wizard" in uiSchema) {
    throw new Error('@faqir-ui/forms/dom: buildForm does not build a wizard; use renderForm for "ui:wizard".');
  }
  if (opts && typeof opts === "object" && "rules" in opts) {
    throw new Error("@faqir-ui/forms/dom: buildForm does not emit a rules definition; use renderForm for opts.rules.");
  }
  // The schema check is renderForm's own. Its output is read for one thing: the
  // rules script it had to emit. No schema string can forge that tag, because
  // renderForm escapes every `<` a schema gives it.
  const html = renderForm(jsonSchema, uiSchema, opts);
  if (html.includes('<script type="application/json"')) {
    throw new Error(
      "@faqir-ui/forms/dom: this schema needs a rules definition (a conditional keyword, or a `pattern` " +
      "no HTML attribute can carry), which buildForm does not emit; use renderForm.",
    );
  }

  const schema = /** @type {Schema} */ (jsonSchema);
  const ui = /** @type {Schema} */ (uiSchema);
  const options = /** @type {Schema} */ (opts);
  const prefix = idToken(options.idPrefix ?? "faqir");
  let counter = 0;
  /** @type {BuildState} */
  const state = {
    doc: document,
    prefix,
    threshold: options.radioThreshold ?? DEFAULT_RADIO_THRESHOLD,
    i18n: { ...DEFAULT_I18N, ...options.i18n },
    nextId: () => `${prefix}-field-${++counter}`,
  };

  const form = /** @type {HTMLFormElement} */ (el(document, "form", {
    id: `${prefix}-form`,
    "l-data": true,
    "l-validate": true,
    "aria-label": schema.title,
    "aria-describedby": schema.description === undefined ? undefined : `${prefix}-form-description`,
    "data-theme": options.theme,
    "data-density": options.density,
  }));
  if (schema.additionalProperties === false) form.append(document.createComment(CLOSED_NOTE));
  if (schema.title !== undefined) form.append(el(document, "h1", {}, schema.title));
  if (schema.description !== undefined) {
    form.append(el(document, "p", { id: `${prefix}-form-description` }, schema.description));
  }

  const required = new Set(schema.required ?? []);
  /** @param {Element} parent @param {string} name */
  const append = (parent, name) =>
    appendField(state, parent, name, schema.properties[name], ui[name] ?? {}, [name], required.has(name));

  const groups = ui["ui:groups"];
  if (Array.isArray(groups)) {
    for (const group of groups) {
      const { card, body } = fieldsetCard(document, group.title, group.description);
      for (const name of group.fields) append(body, name);
      form.append(card);
    }
  } else {
    for (const name of Object.keys(schema.properties)) append(form, name);
  }
  return form;
}
