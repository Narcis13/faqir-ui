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
  | "multi-select";

export interface ScalarSchema {
  type: ScalarType;
  title?: string;
  description?: string;
  enum?: string[];
  format?: StringFormat;
  default?: string | number | boolean;
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
  type: "object";
  title?: string;
  description?: string;
  properties: Record<string, FieldSchema>;
  required?: string[];
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
}

/** Enums with this many values or fewer render as radio groups (single) or checkbox groups (arrays) by default. */
export const DEFAULT_RADIO_THRESHOLD: 4;

/** Render the supported JSON Schema subset to deterministic Faqir HTML. */
export function renderForm(
  jsonSchema: ObjectSchema,
  uiSchema?: UISchema,
  opts?: RenderFormOptions,
): string;
