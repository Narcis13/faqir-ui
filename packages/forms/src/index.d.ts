export type ScalarType = "string" | "number" | "integer" | "boolean";
export type StringFormat = "date" | "email" | "uri";
export type Widget =
  | "input"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "switch"
  | "date-picker"
  | "checkbox-group"
  | "multi-select"
  /** A horizontal radio group with optional end captions: a string or integer enum, or an integer `minimum`–`maximum` range. */
  | "scale";

/** `ui:width`: the field's share of a row from the md tier up (`data-span` on its field-group). Phones stay single-column. */
export type FieldWidth = "full" | "half" | "third";

/** `ui:orientation`: how a radio or checkbox group lays out its options. */
export type ChoiceOrientation = "vertical" | "horizontal";

/** `opts.gap`: a step on the rhythm ladder, written as the form's `data-gap`. */
export type FormGap = "0" | "1" | "2" | "3" | "4" | "6" | "8" | "10" | "12" | "16" | 0 | 1 | 2 | 3 | 4 | 6 | 8 | 10 | 12 | 16;

/**
 * `[T, "null"]`, in either order: a nullable `T`. It renders and emits rules as
 * `T` — a form cannot submit null — and stays required when `required` names it.
 * No other union is accepted.
 */
export type Nullable<T extends string> = [T, "null"] | ["null", T];

/**
 * `additionalProperties`: `false` leaves a closed-object note in the markup (a
 * form submits only the fields it renders); any other value is ignored.
 */
export type AdditionalProperties = boolean | Record<string, unknown>;

export interface ScalarSchema {
  type: ScalarType | Nullable<ScalarType>;
  title?: string;
  description?: string;
  /** Strings on a `string` field, integers on an `integer` field. */
  enum?: string[] | number[];
  format?: StringFormat;
  /** `null` is accepted on a nullable field only, and means no default. */
  default?: string | number | boolean | null;
  /** The first entry is the placeholder when the UI schema gives none (inputs, textareas, date pickers). */
  examples?: Array<string | number | boolean>;
  /**
   * The field's only value: rendered read-only, showing it, and emitted into
   * the rules. Not on a boolean, and not with `enum`; a `default` must equal it.
   */
  const?: string | number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  /** HTML-oriented alias for `multipleOf`. Do not provide both. */
  step?: number;
}

/** Nested object → fieldset card. Children may be any supported field kind. */
export interface ObjectFieldSchema {
  type: "object" | Nullable<"object">;
  title?: string;
  description?: string;
  properties: Record<string, FieldSchema>;
  required?: string[];
  additionalProperties?: AdditionalProperties;
}

/** Array of enum strings → checkbox group (≤ threshold) or multi-select. */
export interface EnumArraySchema {
  type: "array";
  title?: string;
  description?: string;
  items: { type: "string"; enum: string[] };
  uniqueItems?: true;
  default?: string[];
}

/** Array of objects → repeatable group (add/remove via `l-data` + keyed `l-for`). Row properties are scalars only. */
export interface ObjectArraySchema {
  type: "array";
  title?: string;
  description?: string;
  items: {
    type: "object";
    properties: Record<string, ScalarSchema>;
    required?: string[];
    additionalProperties?: AdditionalProperties;
  };
  minItems?: number;
  maxItems?: number;
}

export type FieldSchema = ScalarSchema | ObjectFieldSchema | EnumArraySchema | ObjectArraySchema;

/**
 * A JSONLogic expression, as `@faqir-ui/rules` defines it. Opaque here: the
 * renderer emits it, it never evaluates it.
 */
export type RulesLogic = Record<string, unknown>;

/** An `if` subschema: a value test per property, plus presence via `required`. */
export interface SchemaCondition {
  properties?: Record<string, { const?: string | number | boolean } | { enum?: Array<string | number | boolean> }>;
  required?: string[];
}

/** A `then` / `else` branch: `properties` is visibility (each entry `{}`), `required` is requiredness. */
export interface SchemaConsequent {
  properties?: Record<string, Record<string, never>>;
  required?: string[];
}

/** One conditional. `allOf` entries take this shape — conditionals only, never composition. */
export interface SchemaConditional {
  if: SchemaCondition;
  then?: SchemaConsequent;
  else?: SchemaConsequent;
}

export interface ObjectSchema {
  $schema?: string;
  $id?: string;
  type: "object";
  title?: string;
  description?: string;
  properties: Record<string, FieldSchema>;
  required?: string[];
  additionalProperties?: AdditionalProperties;
  /** Conditional visibility/requiredness → `show` / `require` rules. */
  if?: SchemaCondition;
  then?: SchemaConsequent;
  else?: SchemaConsequent;
  /** More than one conditional. Every entry must be one; `allOf` is not composition here. */
  allOf?: SchemaConditional[];
  /** `{ trigger: [dependents] }` → a `require` rule per dependent. */
  dependentRequired?: Record<string, string[]>;
}

export interface FieldUISchema {
  widget?: Widget;
  "ui:widget"?: Widget;
  placeholder?: string;
  "ui:placeholder"?: string;
  rows?: number;
  "ui:rows"?: number;
  enumLabels?: string[];
  "ui:enumLabels"?: string[];
  width?: FieldWidth;
  "ui:width"?: FieldWidth;
  /** Radio and checkbox-group widgets only. */
  orientation?: ChoiceOrientation;
  "ui:orientation"?: ChoiceOrientation;
  /** Caption under the scale's first choice. `scale` widget only. */
  minLabel?: string;
  "ui:minLabel"?: string;
  /** Caption under the scale's last choice. `scale` widget only. */
  maxLabel?: string;
  "ui:maxLabel"?: string;
}

/** UI schema for a nested object mirrors the schema structure (child name → child UI). */
export interface ObjectFieldUISchema {
  [childName: string]: FieldUISchemaEntry;
}

/** UI schema for a repeatable group: per-row-property UI plus button labels. */
export interface ObjectArrayUISchema {
  items?: Record<string, FieldUISchema>;
  addLabel?: string;
  "ui:addLabel"?: string;
  removeLabel?: string;
  "ui:removeLabel"?: string;
}

export type FieldUISchemaEntry = FieldUISchema | ObjectFieldUISchema | ObjectArrayUISchema;

/** One `ui:groups` layout group: a titled fieldset card around the named fields. */
export interface UILayoutGroup {
  title?: string;
  description?: string;
  fields: string[];
}

/** One wizard step: title (stepper label), optional description, and its fields. */
export interface UIWizardStep {
  title: string;
  description?: string;
  fields: string[];
  /**
   * The condition under which this step applies. When it does not hold the
   * wizard jumps over the step — a derived `jump` rule the page and the server
   * both read. Not available on the first or last step, and not on two steps in
   * a row: one jump steps over one page.
   */
  when?: RulesLogic;
}

/** Multi-step wizard: stepper + card panels + Back/Next/Submit, per-step validation. */
export interface UIWizard {
  label?: string;
  steps: UIWizardStep[];
}

export type UISchema = {
  "ui:groups"?: UILayoutGroup[];
  "ui:wizard"?: UIWizard;
} & Record<string, FieldUISchemaEntry | UILayoutGroup[] | UIWizard | undefined>;

export interface RenderFormI18n {
  requiredMarker?: string;
  selectPlaceholder?: string;
  datePickerLabel?: string;
  calendarLabel?: string;
  /** Repeatable group add button, `{title}` interpolated. Default "Add {title}". */
  addRowLabel?: string;
  /** Repeatable group remove button, `{title}` interpolated. Default "Remove {title}". */
  removeRowLabel?: string;
  backLabel?: string;
  nextLabel?: string;
  submitLabel?: string;
  /** Accessible name of the wizard stepper when `ui:wizard.label` is absent. */
  wizardNavLabel?: string;
}

/**
 * One rule, as `@faqir-ui/rules` defines it: an `id` plus exactly one verb
 * (`show`, `require`, `validate`, `compute`, `jump`) and its keys. Passed
 * through verbatim — this package owns the emission, not the vocabulary.
 */
export interface FormRule {
  id: string;
  [key: string]: unknown;
}

/**
 * A rules definition, or the parts of one written by hand. `fields` is always
 * derived from the JSON Schema; entries given here are merged over the derived
 * map (a `compute` target with no control of its own, say).
 */
export interface RulesDefinitionInput {
  version?: "1";
  fields?: Record<string, unknown>;
  required?: string[];
  messages?: Record<string, Record<string, string>>;
  defaultLocale?: string;
  rules?: FormRule[];
}

export interface RenderFormOptions {
  idPrefix?: string;
  /** Maximum enum cardinality rendered as radios / checkbox groups. Defaults to 4. */
  radioThreshold?: number;
  theme?: string;
  density?: string;
  i18n?: RenderFormI18n;
  /**
   * Rules the form carries. Emitted as a JSON script beside the form and bound
   * with `l-rules`; merged with everything derived from the schema's
   * `if/then/else`, `dependentRequired` and wizard step `when`.
   */
  rules?: RulesDefinitionInput;
  /**
   * `false` drops the visible `<h1>` and description paragraph a root `title` /
   * `description` render (and the `aria-describedby` to it); the form keeps
   * its `aria-label`. Defaults to `true`.
   */
  heading?: boolean;
  /**
   * Id (or space-separated ids) of the element that names the form — a page's
   * own heading. Emitted as `aria-labelledby` in place of `aria-label`.
   */
  labelledBy?: string;
  /**
   * `false` leaves out a single-page form's submit button (the footer labelled
   * `i18n.submitLabel`). A wizard's navigation is unaffected. Defaults to `true`.
   */
  submit?: boolean;
  /**
   * The step between fields, as `data-gap` on the form (the rhythm ladder).
   * Fields in a `ui:groups` card and in a wizard step keep the same step.
   * Defaults to `"4"`.
   */
  gap?: FormGap;
}

/** The `data-gap` a form carries when `opts.gap` is not given. */
export const DEFAULT_FORM_GAP: "4";

/** Enums with this many values or fewer render as radio groups (single) or checkbox groups (arrays) by default. */
export const DEFAULT_RADIO_THRESHOLD: 4;

/** Render the supported JSON Schema subset to deterministic Faqir HTML. */
export function renderForm(
  jsonSchema: ObjectSchema,
  uiSchema?: UISchema,
  opts?: RenderFormOptions,
): string;

/**
 * The `@faqir-ui/rules` definition `renderForm` embeds in its
 * `<idPrefix>-rules` script for the same arguments — the object a server
 * passes to `validate()` — or `null` when that form carries none. Same render,
 * same errors.
 */
export function rulesFor(
  jsonSchema: ObjectSchema,
  uiSchema?: UISchema,
  opts?: RenderFormOptions,
): RulesDefinition | null;

/** A rules definition as `renderForm` emits it: `version` and `fields` always present. */
export interface RulesDefinition {
  version: "1";
  fields: Record<string, unknown>;
  required?: string[];
  messages?: Record<string, Record<string, string>>;
  defaultLocale?: string;
  rules?: FormRule[];
}
