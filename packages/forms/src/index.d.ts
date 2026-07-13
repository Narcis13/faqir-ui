export type ScalarType = "string" | "number" | "integer" | "boolean";
export type StringFormat = "date" | "email" | "uri";
export type Widget =
  | "input"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "switch"
  | "date-picker";

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

export interface ObjectSchema {
  $schema?: string;
  $id?: string;
  type: "object";
  title?: string;
  description?: string;
  properties: Record<string, ScalarSchema>;
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

export type UISchema = Record<string, FieldUISchema>;

export interface RenderFormI18n {
  requiredMarker?: string;
  selectPlaceholder?: string;
  datePickerLabel?: string;
  calendarLabel?: string;
}

export interface RenderFormOptions {
  idPrefix?: string;
  /** Maximum enum cardinality rendered as radios. Defaults to 4. */
  radioThreshold?: number;
  theme?: string;
  density?: string;
  i18n?: RenderFormI18n;
}

/** Enums with this many values or fewer render as radio groups by default. */
export const DEFAULT_RADIO_THRESHOLD: 4;

/** Render the supported JSON Schema scalar subset to deterministic Faqir HTML. */
export function renderForm(
  jsonSchema: ObjectSchema,
  uiSchema?: UISchema,
  opts?: RenderFormOptions,
): string;
