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
  /** The verbs: visibility, requiredness, cross-field checks, computed values, wizard jumps. */
  rules?: Rule[];
}

/**
 * A JSONLogic expression: a literal, an array of expressions, or a one-key
 * `{ "<op>": <args> }` object. `LOGIC_OPS` lists the operators implemented.
 */
export type LogicExpression =
  | string
  | number
  | boolean
  | null
  | LogicExpression[]
  | { [op: string]: unknown };

interface RuleBase {
  /** Unique in the definition; it is the `rule` a finding reports and the key a message is addressed to. */
  id: string;
}

/** `{ show: path, when }` — the field is on screen only while `when` holds. */
export interface ShowRule extends RuleBase {
  show: string;
  when: LogicExpression;
}

/** `{ require: path, when }` — the field must be filled in while `when` holds. */
export interface RequireRule extends RuleBase {
  require: string;
  when: LogicExpression;
}

/** `{ validate: logic, path }` — a finding on `path` when the logic is falsy. */
export interface ValidateRule extends RuleBase {
  validate: LogicExpression;
  path: string;
  /** This rule's own sentence; a `messages` entry still wins over it. */
  message?: string;
}

/** `{ validate: "remote", path, remote }` — resolved only by `validateAsync`. */
export interface RemoteRule extends RuleBase {
  validate: "remote";
  path: string;
  /** A url or a name; the resolver decides what it means. */
  remote: string;
  message?: string;
}

/** `{ compute: path, value }` — a derived value, computed in dependency order. */
export interface ComputeRule extends RuleBase {
  compute: string;
  value: LogicExpression;
}

/** `{ jump: toPage, from: fromPage, when }` — a wizard's next page. */
export interface JumpRule extends RuleBase {
  jump: string;
  from: string;
  /** Omitted means unconditional. */
  when?: LogicExpression;
}

export type Rule = ShowRule | RequireRule | ValidateRule | RemoteRule | ComputeRule | JumpRule;

/** What a remote resolver is handed. */
export interface RemoteRuleView {
  id: string;
  path: string;
  remote: string;
  message?: string;
}

/**
 * `true` passes, `false` fails with the rule's message, a string fails with
 * that message. A rejection — or anything else — is a `remote-error` finding.
 */
export type RemoteResolver = (
  rule: RemoteRuleView,
  value: unknown,
  data: unknown,
) => boolean | string | Promise<boolean | string>;

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
  /** No findings, and nothing still to check. */
  valid: boolean;
  findings: Finding[];
  /** What the `compute` verbs produced, by path. */
  computed: Record<string, unknown>;
  /** What the `show` verbs decided, by path. Paths no rule mentions are absent. */
  visible: Record<string, boolean>;
  /** What the `require` verbs decided, by path. A hidden field is never required. */
  required: Record<string, boolean>;
  /** `{ <fromPage>: <toPage> }` from the `jump` verbs. */
  next: Record<string, string>;
  /** Ids of remote rules that have not run. Sync `validate` leaves them here. */
  pending: string[];
}

/** What `evaluate` answers: the verbs' decisions, with nothing validated. */
export interface RuleState {
  visible: Record<string, boolean>;
  required: Record<string, boolean>;
  computed: Record<string, unknown>;
  next: Record<string, string>;
}

export interface ValidateOptions {
  /** Preferred locale for message resolution; falls back to `defaultLocale`. */
  locale?: string;
}

export interface ValidateAsyncOptions extends ValidateOptions {
  /** Required when the definition has remote rules; without it `validateAsync` throws. */
  remote?: RemoteResolver;
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
  readonly rules: Rule[];
}

export declare const DEFINITION_VERSION: DefinitionVersion;
export declare const MAX_PATTERN_LENGTH: number;
export declare const MAX_REGEX_SUBJECT_LENGTH: number;
export declare const MAX_LOGIC_NODES: number;
export declare const MAX_LOGIC_DEPTH: number;
/** The reserved `validate` value that makes a rule remote. */
export declare const REMOTE: "remote";
/** The five verbs, in the order the README documents them. */
export declare const RULE_VERBS: readonly string[];
/** Every JSONLogic operator implemented; anything else is a `DefinitionError`. */
export declare const LOGIC_OPS: readonly string[];
/** The comparators a `date` operator accepts as its middle argument. */
export declare const DATE_COMPARATORS: readonly string[];
/** Sentences for findings that come from a rule rather than a field's shape. */
export declare const RULE_MESSAGES: Readonly<Record<string, string>>;

/** Validate and pre-compile a definition. Idempotent. Throws `DefinitionError`. */
export declare function compile(definition: RulesDefinition | CompiledDefinition): CompiledDefinition;

/** The verdict for `data` under `definition`. Remote rules land in `pending`. */
export declare function validate(
  definition: RulesDefinition | CompiledDefinition,
  data: unknown,
  options?: ValidateOptions,
): Verdict;

/** `validate`, with the remote rules resolved. Throws if one needs a resolver and none was given. */
export declare function validateAsync(
  definition: RulesDefinition | CompiledDefinition,
  data: unknown,
  options?: ValidateAsyncOptions,
): Promise<Verdict>;

/** What the verbs decide for `data`, with nothing validated. */
export declare function evaluate(
  definition: RulesDefinition | CompiledDefinition,
  data: unknown,
): RuleState;

/** The value of a JSONLogic expression. Throws `DefinitionError` for an unknown operator. */
export declare function evaluateLogic(expr: LogicExpression, data: unknown): unknown;

/** JSONLogic truthiness: JavaScript's, except that an empty array is falsy. */
export declare function truthy(value: unknown): boolean;

/** An ISO 8601 date or date-time as a UTC instant, zone-independent; `null` if it is not one. */
export declare function parseInstant(value: unknown): number | null;

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

// ── The lint and the published schema ───────────────────────────────────────

/** One lint finding. `severity: "error"` is what makes `faqir rules lint` exit non-zero. */
export interface LintFinding {
  /** One of `LINT_RULES`. */
  rule: string;
  severity: "error" | "warning";
  /** Where in the definition — `rules[2].when`, `fields.email`, `messages.ro`. */
  path: string;
  message: string;
  /** The offending rule's own id, when the finding is about a rule. */
  id?: string;
}

export interface LintReport {
  /** No `error`-severity findings. */
  ok: boolean;
  counts: { error: number; warning: number };
  findings: LintFinding[];
}

export interface LintOptions {
  /** Locales that must be complete, on top of the ones `messages` declares. */
  locales?: string[];
}

/** The seven lint rules, in the order `lintDefinition` reports them. */
export declare const LINT_RULES: readonly string[];
/** The keys a definition may carry — the schema's root, as a list. */
export declare const DEFINITION_KEYWORDS: readonly string[];
/** The closed keyword set per field type, sorted; the schema's field branches. */
export declare const FIELD_KEYWORDS: Readonly<Record<string, readonly string[]>>;
/** The closed key set per verb; the schema's rule branches. */
export declare const RULE_KEYS: Readonly<Record<string, readonly string[]>>;

/**
 * Does this match `rules.schema.json`? The reference implementation of that
 * document — every shape problem, not just the first, since a definition being
 * checked is usually being fixed rather than run.
 */
export declare function validateDefinition(
  definition: unknown,
): { valid: boolean; findings: LintFinding[] };

/** The shape, plus the six things a schema cannot say. `faqir rules lint` is this. */
export declare function lintDefinition(definition: unknown, options?: LintOptions): LintReport;
