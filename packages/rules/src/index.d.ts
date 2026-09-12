/** The definition format implemented by this package. */
export type DefinitionVersion = "1";

export type FieldType = "string" | "number" | "integer" | "boolean" | "object" | "array";

/** Metadata and sugar every field schema may carry. */
interface FieldBase {
  title?: string;
  description?: string;
  /** Faqir sugar: this field must be present. */
  required?: true;
  enum?: unknown[];
  const?: unknown;
}

export interface StringFieldSchema extends FieldBase {
  type: "string";
  pattern?: string;
  /** A built-in name or one added with `registerFormat`. */
  format?: BuiltInFormat | (string & {});
  minLength?: number;
  maxLength?: number;
}

export interface NumberFieldSchema extends FieldBase {
  type: "number" | "integer";
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}

export interface BooleanFieldSchema extends FieldBase {
  type: "boolean";
}

export interface ObjectFieldSchema extends Omit<FieldBase, "required"> {
  type: "object";
  properties?: Record<string, FieldSchema>;
  /** `true` — the object itself is required; an array — these children are. */
  required?: true | string[];
}

export interface ArrayFieldSchema extends FieldBase {
  type: "array";
  items?: FieldSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

export type FieldSchema =
  | StringFieldSchema
  | NumberFieldSchema
  | BooleanFieldSchema
  | ObjectFieldSchema
  | ArrayFieldSchema;

/** `{ [locale]: { [messageKey]: sentence } }`; keys are `<path>.<rule>` or `<rule>`. */
export type MessageTable = Record<string, Record<string, string>>;

export interface RulesDefinition {
  version?: DefinitionVersion;
  /** Dotted paths (`a.b`, `a[0].b`) to field schemas. */
  fields?: Record<string, FieldSchema>;
  /** Field paths that must be present, as an alternative to `required: true`. */
  required?: string[];
  messages?: MessageTable;
  defaultLocale?: string;
  /** Accepted and ignored until 1.1B-02 gives the verbs meaning. */
  rules?: unknown[];
}

export interface Finding {
  /** Dotted path of the offending value. */
  path: string;
  /** The constraint that failed — one of `SHAPE_RULES` for this release. */
  rule: string;
  /** The resolved, interpolated sentence. */
  message: string;
  /** What the rule was checking against (`{ limit: 3 }`, `{ format: "email" }`). */
  params: Record<string, unknown>;
}

export interface Verdict {
  valid: boolean;
  findings: Finding[];
  /** Computed values. Empty until 1.1B-02. */
  computed: Record<string, unknown>;
  /** Per-path visibility. Empty until 1.1B-02. */
  visible: Record<string, boolean>;
  /** Per-path requiredness. Empty until 1.1B-02. */
  required: Record<string, boolean>;
}

export interface ValidateOptions {
  /** Preferred locale for message resolution; falls back to `defaultLocale`. */
  locale?: string;
}

/** Anything wrong with the *definition*. Bad data produces findings, not throws. */
export declare class DefinitionError extends Error {
  readonly name: "DefinitionError";
  /** Where in the definition the problem is. */
  readonly path?: string;
}

/** A definition with regexes compiled and property maps built. Opaque. */
export declare class CompiledDefinition {
  readonly version: DefinitionVersion;
  readonly defaultLocale: string;
  readonly messages: MessageTable;
  readonly rules: unknown[];
}

export declare const DEFINITION_VERSION: DefinitionVersion;
export declare const MAX_PATTERN_LENGTH: number;

/** Validate and pre-compile a definition. Idempotent. Throws `DefinitionError`. */
export declare function compile(definition: RulesDefinition | CompiledDefinition): CompiledDefinition;

/** The verdict for `data` under `definition`. */
export declare function validate(
  definition: RulesDefinition | CompiledDefinition,
  data: unknown,
  options?: ValidateOptions,
): Verdict;

/** Un-flatten dotted form keys and narrow form strings to the declared types. */
export declare function coerce(
  definition: RulesDefinition | CompiledDefinition,
  rawData: unknown,
): Record<string, unknown>;

export type BuiltInFormat =
  | "email"
  | "uri"
  | "date"
  | "time"
  | "date-time"
  | "phone"
  | "iban"
  | "uuid"
  | "postal-code";

export declare const BUILT_IN_FORMATS: readonly BuiltInFormat[];

/** Add a format, or override a built-in one. Process-global by design. */
export declare function registerFormat(name: string, check: (value: string) => boolean): void;
export declare function hasFormat(name: string): boolean;
export declare function formatNames(): string[];
/** Run a checker. Unknown names return `true` — `compile` rejects them first. */
export declare function checkFormat(name: string, value: string): boolean;

/** The rule names the shape validator emits, in the order it checks them. */
export declare const SHAPE_RULES: readonly string[];
/** The built-in English sentence per rule, shared with `faqir-validate`. */
export declare const DEFAULT_MESSAGES: Readonly<Record<string, string>>;
export declare const DEFAULT_LOCALE: string;

/** Fill `{name}` placeholders; an unmatched placeholder is left standing. */
export declare function interpolate(text: string, params?: Record<string, unknown>): string;

export interface ResolveMessageOptions {
  messages?: MessageTable;
  locale?: string;
  defaultLocale?: string;
  path: string;
  rule: string;
  params?: Record<string, unknown>;
}

/** `messages[locale]` → `messages[defaultLocale]` → built-in default → the key. */
export declare function resolveMessage(options: ResolveMessageOptions): string;
