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

export interface ObjectSchema {
  $schema?: string;
  $id?: string;
  type: "object";
  title?: string;
  description?: string;
  properties: Record<string, FieldSchema>;
  required?: string[];
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

export interface RenderFormOptions {
  idPrefix?: string;
  /** Maximum enum cardinality rendered as radios / checkbox groups. Defaults to 4. */
  radioThreshold?: number;
  theme?: string;
  density?: string;
  i18n?: RenderFormI18n;
}

/** Enums with this many values or fewer render as radio groups (single) or checkbox groups (arrays) by default. */
export const DEFAULT_RADIO_THRESHOLD: 4;

/** Render the supported JSON Schema subset to deterministic Faqir HTML. */
export function renderForm(
  jsonSchema: ObjectSchema,
  uiSchema?: UISchema,
  opts?: RenderFormOptions,
): string;
