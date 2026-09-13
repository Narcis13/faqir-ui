/**
 * Docs section: Forms, validation and the rules platform (`rules/index.html`).
 *
 * Every list on this page is derived, not restated. The operator table comes
 * from `LOGIC_OPS` and the `OP_ARITY` block in `packages/rules/src/logic.js`;
 * the verbs from `RULE_VERBS`/`RULE_KEYS`; the shape rules and their sentences
 * from `messages.js`; the formats from `formats.js`; the limits from
 * `limits.js`; the export list from the package's own `index.js`; the field
 * reference from `rules.schema.json`, which is also emitted verbatim beside the
 * page. The three worked examples (a Node verdict, a lint report, a rendered
 * form) are produced by RUNNING the packages at build time, so the output on
 * the page is the output the reader will get.
 *
 * Import discipline: nothing from `../docs` is used at module top level — the
 * generator imports this module, so those bindings do not exist yet when it
 * evaluates. The package imports below are free of that cycle.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as rulesPkg from "../../../packages/rules/src/index.js";
import type { LintFinding, RulesDefinition } from "../../../packages/rules/src/index.js";
import { DEFAULT_RADIO_THRESHOLD, renderForm } from "../../../packages/forms/src/index.js";
import type { ObjectSchema, RenderFormOptions, UISchema } from "../../../packages/forms/src/index.js";
import { RULES_LINT_SCHEMA_VERSION } from "../../commands/rules";
import {
  PACKAGE_ROOT,
  code,
  esc,
  escAttr,
  relUrl,
  renderShell,
  section,
  table,
  type SiteFile,
} from "../docs";
import type { PageContext } from "./context";

export const RULES_PAGE = "rules/index.html";
export const RULES_SCHEMA_FILE = "rules/rules.schema.json";
export const RULES_NAV_TITLE = "Rules & validation";

const GITHUB_PACKAGES = "https://github.com/Narcis13/faqir-ui/tree/main/packages";

// ---------------------------------------------------------------------------
// Source-of-truth readers
// ---------------------------------------------------------------------------

interface OperatorRow {
  op: string;
  family: string;
  arity: number;
}

const FAMILY_LABELS: Record<string, string> = {
  data: "data",
  logic: "logic",
  compare: "compare",
  arith: "arithmetic",
  string: "string",
  arrays: "arrays",
  faqir: "Faqir",
};

/**
 * The operator table: names in `LOGIC_OPS` order, each with the family the
 * `logic.js` header files it under and the minimum argument count from
 * `OP_ARITY`. Both are parsed out of the module source, and the parse is held
 * against the exported list so a new operator cannot appear on the page
 * without a family, or in the header without an implementation.
 */
export function parseLogicOperators(logicSource: string): OperatorRow[] {
  const families = new Map<string, string>();
  const headerLine = /^\s*\*\s{3}(data|logic|compare|arith|string|arrays|faqir)\s+(.+)$/gm;
  for (const m of logicSource.matchAll(headerLine)) {
    for (const op of m[2].matchAll(/`([^`]+)`/g)) families.set(op[1], m[1]);
  }

  const arities = new Map<string, number>();
  const block = /const OP_ARITY = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(logicSource);
  if (!block) throw new Error("rules docs: OP_ARITY block not found in logic.js");
  for (const m of block[1].matchAll(/("?)([^\s:,"{}]+)\1:\s*(\d+)/g)) {
    arities.set(m[2], Number(m[3]));
  }

  const ops = [...rulesPkg.LOGIC_OPS];
  const rows = ops.map((op) => {
    const family = families.get(op);
    const arity = arities.get(op);
    if (family === undefined) throw new Error(`rules docs: operator "${op}" has no family in the logic.js header`);
    if (arity === undefined) throw new Error(`rules docs: operator "${op}" has no OP_ARITY entry`);
    return { op, family, arity };
  });
  for (const op of families.keys()) {
    if (!ops.includes(op)) throw new Error(`rules docs: header lists "${op}" but LOGIC_OPS does not`);
  }
  return rows;
}

interface ExportGroup {
  module: string;
  names: string[];
}

/**
 * The package's public surface, grouped by the module each name is
 * re-exported from, parsed from `index.js` and checked against the module
 * namespace so the two cannot drift.
 */
export function parseRulesExports(indexSource: string): ExportGroup[] {
  const groups: ExportGroup[] = [];
  const seen = new Set<string>();
  for (const m of indexSource.matchAll(/export \{([^}]*)\} from "\.\/([a-z]+)\.js"/g)) {
    const names = m[1]
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .sort();
    for (const n of names) seen.add(n);
    groups.push({ module: `${m[2]}.js`, names });
  }
  const actual = Object.keys(rulesPkg).sort();
  const parsed = [...seen].sort();
  if (actual.join(",") !== parsed.join(",")) {
    throw new Error(
      `rules docs: index.js export parse (${parsed.length}) disagrees with the module namespace (${actual.length})`,
    );
  }
  return groups;
}

/** A JSON Schema node as far as this page reads it. */
interface SchemaNode {
  description?: string;
  type?: string;
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, SchemaNode>;
  oneOf?: Array<{ $ref?: string; const?: unknown; type?: string }>;
  $ref?: string;
  not?: { const?: unknown };
}

interface RulesSchema {
  $id: string;
  title: string;
  description: string;
  properties: Record<string, SchemaNode>;
  definitions: Record<string, SchemaNode>;
}

/** One line describing what a schema property accepts, from its own keywords. */
function schemaShape(node: SchemaNode): string {
  if (node.$ref) return node.$ref.replace("#/definitions/", "");
  if (node.const !== undefined) return `const ${JSON.stringify(node.const)}`;
  if (node.enum) return node.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (node.oneOf) {
    return node.oneOf
      .map((alt) =>
        alt.$ref
          ? alt.$ref.replace("#/definitions/", "")
          : alt.const !== undefined
            ? `const ${JSON.stringify(alt.const)}`
            : alt.type ?? "any",
      )
      .join(" | ");
  }
  if (node.not?.const !== undefined) return `logic (not ${JSON.stringify(node.not.const)})`;
  return node.type ?? "any";
}


/**
 * JSON with a reader's indentation: objects one key per line, but an array or
 * object whose one-line form is short stays on one line, so
 * `{ "==": [{ "var": "plan" }, "team"] }` reads as the expression it is.
 */
export function prettyJson(value: unknown, indent = 0, width = 64): string {
  const flat = JSON.stringify(value);
  if (flat === undefined) return "null";
  if (typeof value !== "object" || value === null) return flat;
  const pad = " ".repeat(indent + 2);
  const close = " ".repeat(indent);
  if (Array.isArray(value)) {
    const fits = flat.length + indent <= width;
    if (fits) return prettyInline(value);
    return `[\n${value.map((v) => pad + prettyJson(v, indent + 2, width)).join(",\n")}\n${close}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (flat.length + indent <= width) return prettyInline(value);
  return (
    `{\n` +
    entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${prettyJson(v, indent + 2, width)}`).join(",\n") +
    `\n${close}}`
  );
}

/** `{ "a": 1, "b": [1, 2] }` — JSON on one line with breathing room. */
function prettyInline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(prettyInline).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${prettyInline(v)}`).join(", ")} }`;
  }
  return JSON.stringify(value);
}

/** Escape a schema description and turn its markdown backticks into `<code>`. */
function ticks(text: string): string {
  return esc(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

// ---------------------------------------------------------------------------
// Hand-held descriptions, each pinned against the list it annotates
// ---------------------------------------------------------------------------

/** What each built-in format checks, from the checker comments in `formats.js`. */
const FORMAT_NOTES: Record<string, string> = {
  email: "One @, no whitespace, a dotted domain with a final label of two or more letters; at most 254 characters.",
  uri: "A scheme, then anything without whitespace or control characters.",
  date: "YYYY-MM-DD, calendar-checked: 2025-02-29 is not a date.",
  time: "HH:MM or HH:MM:SS, optional fraction, optional Z or ±HH:MM offset; a leap second is allowed.",
  "date-time": "A date, a T, t or space, then a time. No offset required: datetime-local emits none.",
  phone: "E.164-lenient: optional +, human separators allowed, 7 to 15 digits remain.",
  iban: "ISO 13616 shape, then the ISO 7064 MOD-97-10 check.",
  uuid: "Any UUID version, plus the nil UUID.",
  "postal-code": "Country-agnostic: 2 to 12 letters and digits with single inner spaces or hyphens.",
};

/** The lint rule sentences, as `faqir rules --help` prints them. */
const LINT_NOTES: Record<string, string> = {
  schema: "The definition does not match rules.schema.json",
  "rule-verb": "A rule with zero or two verbs",
  "rule-ops": "An unsupported operator, a bad arity, a malformed node",
  "rule-refs": "A path — a target or a var — that names no field",
  "rule-cycles": "compute rules that depend on each other in a cycle",
  "rule-unreachable": "A when (or a validate) that is constant after folding",
  "rule-messages": "A message key that addresses nothing, or a locale gap",
};

/** Shape rule → the browser `ValidityState` flag it shares a sentence with (`messages.js` header). */
const VALIDITY_FLAGS: Record<string, string> = {
  required: "valueMissing",
  type: "typeMismatch",
  pattern: "patternMismatch",
  minLength: "tooShort",
  maxLength: "tooLong",
  minimum: "rangeUnderflow",
  maximum: "rangeOverflow",
  multipleOf: "stepMismatch",
};

/** What the `l-rules` plugin does with each verb, from `plugin.js`. */
const VERB_IN_PAGE: Record<string, string> = {
  show: "The field's field-group takes <code>hidden</code> and its controls take <code>disabled</code>, so the field neither validates nor submits.",
  require: "Toggles <code>required</code> and <code>aria-required</code> on the control. A rule may add a demand, never lift one the markup declared.",
  validate: "Registered through <code>Faqir.validate.register</code>, so it runs at faqir-validate's moments and wears its messages. A remote rule POSTs <code>{ path, value, data }</code>.",
  compute: "Writes the value into the scope and into any control of that name.",
  jump: "Lands in <code>$rules.next</code>, keyed by the page it fires on, for a wizard to read.",
};

/** What each verb decides, from the `rules.js` header. */
const VERB_MEANING: Record<string, string> = {
  show: "visibility",
  require: "conditional requiredness",
  validate: "a cross-field check, or a remote one",
  compute: "a derived value",
  jump: "a wizard's next page",
};

function pinned<T extends string>(list: readonly T[], notes: Record<string, string>, what: string): void {
  for (const item of list) {
    if (!(item in notes)) throw new Error(`rules docs: no ${what} note for "${item}"`);
  }
}

// ---------------------------------------------------------------------------
// Worked examples, run at build time
// ---------------------------------------------------------------------------

const SIGNUP_DEFINITION: RulesDefinition = {
  version: "1",
  fields: {
    email: { type: "string", format: "email", required: true },
    plan: { type: "string", enum: ["solo", "team"], required: true },
    seats: { type: "integer", minimum: 2 },
  },
  rules: [
    { id: "seats-for-teams", show: "seats", when: { "==": [{ var: "plan" }, "team"] } },
    { id: "seats-required", require: "seats", when: { "==": [{ var: "plan" }, "team"] } },
  ],
};

const SIGNUP_RAW_BODY = { email: "ana@example", plan: "team", seats: "1" };

const BROKEN_DEFINITION: RulesDefinition = {
  version: "1",
  fields: { plan: { type: "string" }, seats: { type: "integer" } },
  rules: [
    { id: "seats-for-teams", show: "seats", when: { "==": [{ var: "plna" }, "team"] } },
  ],
};

const FORMS_SCHEMA: ObjectSchema = {
  type: "object",
  title: "Sign up",
  required: ["email", "plan"],
  properties: {
    email: { type: "string", format: "email", title: "Work email" },
    plan: { type: "string", enum: ["solo", "team"], title: "Plan" },
    seats: { type: "integer", minimum: 2, title: "Seats" },
  },
  if: { properties: { plan: { const: "team" } } },
  then: { properties: { seats: {} }, required: ["seats"] },
};

const FORMS_UI: UISchema = { plan: { widget: "radio" } };
const FORMS_OPTS: RenderFormOptions = { idPrefix: "signup" };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function renderRulesPages(ctx: PageContext): SiteFile[] {
  // A fixture packageRoot (the generator tests build against one) does not
  // carry the workspace packages; the page then documents the package the
  // generator itself ships with rather than failing the whole build.
  const candidate = join(ctx.packageRoot, "packages", "rules");
  const rulesDir = existsSync(join(candidate, "rules.schema.json"))
    ? candidate
    : join(PACKAGE_ROOT, "packages", "rules");
  const schemaText = readFileSync(join(rulesDir, "rules.schema.json"), "utf8");
  const schema = JSON.parse(schemaText) as RulesSchema;
  const logicSource = readFileSync(join(rulesDir, "src", "logic.js"), "utf8");
  const indexSource = readFileSync(join(rulesDir, "src", "index.js"), "utf8");

  const operators = parseLogicOperators(logicSource);
  const exportGroups = parseRulesExports(indexSource);
  pinned(rulesPkg.BUILT_IN_FORMATS, FORMAT_NOTES, "format");
  pinned(rulesPkg.LINT_RULES, LINT_NOTES, "lint");
  pinned(rulesPkg.RULE_VERBS, VERB_IN_PAGE, "plugin verb");
  pinned(rulesPkg.RULE_VERBS, VERB_MEANING, "verb");

  const u = (to: string) => escAttr(relUrl(RULES_PAGE, to));
  const pre = (text: string) => `      <pre tabindex="0"><code>${esc(text)}</code></pre>`;
  const json = (value: unknown) => prettyJson(value);

  // ── the examples, executed ────────────────────────────────────────────────
  const coerced = rulesPkg.coerce(SIGNUP_DEFINITION, SIGNUP_RAW_BODY);
  const verdict = rulesPkg.validate(SIGNUP_DEFINITION, coerced);
  const lint = rulesPkg.lintDefinition(BROKEN_DEFINITION);
  const lintReport = {
    rules_lint_schema_version: RULES_LINT_SCHEMA_VERSION,
    source: "signup.rules.json",
    ok: lint.ok,
    counts: lint.counts,
    findings: lint.findings as LintFinding[],
  };
  const formHtml = renderForm(FORMS_SCHEMA, FORMS_UI, FORMS_OPTS);

  const fieldGroup = ctx.byName.get("field-group");
  const fieldGroupHref = fieldGroup ? u(fieldGroup.pagePath) : "";

  // ── lede + toc ────────────────────────────────────────────────────────────
  const toc: Array<[string, string]> = [
    ["realms", "Three realms, one verdict"],
    ["layers", "The three validation layers"],
    ["definition", "The definition"],
    ["logic", "Logic, shape rules, formats and limits"],
    ["plugin", "l-rules in the page"],
    ["server", "@faqir-ui/rules on the server"],
    ["lint", "faqir rules lint"],
    ["forms", "@faqir-ui/forms"],
    ["packages", "Packages"],
  ];

  const head =
    `      <h1>${esc(RULES_NAV_TITLE)}</h1>\n` +
    `      <p data-docs-rules-lede>One JSON definition says what a form's data must look like and everything that depends on the other fields. ` +
    `The same document is enforced by the <code>faqir-rules</code> plugin in the browser, re-checked by <code>@faqir-ui/rules</code> on a Node server, ` +
    `and linted by <code>faqir rules lint</code> before either runs it. One definition, one verdict, in every realm that runs it.</p>\n` +
    `      <nav aria-label="On this page" data-docs-toc>\n        <ul>\n` +
    toc.map(([id, label]) => `          <li><a href="#${id}">${esc(label)}</a></li>`).join("\n") +
    `\n        </ul>\n      </nav>\n`;

  // ── 1. three realms ───────────────────────────────────────────────────────
  const realmCard = (realm: string, title: string, lines: string[], footer: string) =>
    `        <div data-ui="card" data-variant="outlined" data-docs-rules-realm="${realm}">\n` +
    `          <div data-part="header"><h3 data-part="title">${esc(title)}</h3></div>\n` +
    `          <div data-part="body">\n            <ul>\n` +
    lines.map((l) => `              <li>${l}</li>`).join("\n") +
    `\n            </ul>\n          </div>\n` +
    `          <div data-part="footer"><span data-ui="text" data-variant="mono" data-size="sm">${esc(footer)}</span></div>\n` +
    `        </div>`;

  const realms =
    `      <p>The rules package imports nothing outside itself and never names <code>window</code>, <code>document</code>, <code>process</code> or a filesystem. ` +
    `The browser plugin is that package with a DOM around it, bundled in, so the verdict in the page is the verdict on the server by construction rather than by agreement. ` +
    `The page's verdict is advisory. The handler's is the one that counts.</p>\n` +
    `      <div data-docs-rules-realms>\n` +
    `        <div data-docs-rules-source>\n` +
    `          <span data-ui="badge" data-variant="primary">rules definition</span>\n` +
    `          <span data-ui="text" data-variant="mono" data-size="sm">{ version, fields, required, messages, defaultLocale, rules }</span>\n` +
    `        </div>\n` +
    realmCard("browser", "Browser", [
      `<code>l-rules="#id"</code> on the form`,
      `Re-evaluates on every <code>input</code> and <code>change</code>`,
      `Paints <code>hidden</code>, <code>disabled</code>, <code>required</code>`,
      `Hands <code>validate</code> rules to faqir-validate`,
    ], "core/plugins/faqir-rules.js") + "\n" +
    realmCard("server", "Node server", [
      `<code>coerce(def, req.body)</code>`,
      `<code>validate(def, data)</code> for the verdict`,
      `<code>validateAsync</code> resolves remote rules`,
      `A pending verdict is never <code>valid</code>`,
    ], "@faqir-ui/rules") + "\n" +
    realmCard("cli", "CLI lint", [
      `${rulesPkg.LINT_RULES.length} checks a schema cannot make`,
      `<code>--json</code> for tooling, <code>--stdin</code> for pipes`,
      `Exit 1 on an error, 0 on a warning`,
      `The same <code>lintDefinition</code> the MCP surface runs`,
    ], "faqir rules lint") + "\n" +
    `      </div>`;

  // ── 2. three layers ───────────────────────────────────────────────────────
  const layers =
    `      <p>Form validation is three layers, each usable without the ones above it. All three paint the same UI: the enclosing ` +
    (fieldGroupHref ? `<a data-ui="link" href="${fieldGroupHref}">field-group</a>` : `field-group`) +
    ` takes <code>data-state="invalid"</code>, its <code>[data-part="error"]</code> takes the message, and the control takes <code>aria-invalid</code>. ` +
    `A page never has two error styles.</p>\n` +
    `      <h3 id="layers-native">1. Native constraints, reflected</h3>\n` +
    `      <p><code>l-validate</code> on the form is the whole setup. The plugin reflects each control's own <code>ValidityState</code>; you write no JavaScript. ` +
    `Errors surface on submit, then live on <code>blur</code> and <code>input</code> after the first attempt.</p>\n` +
    pre(`<script src="ui/core/plugins/faqir-validate.js"></script>

<form l-validate>
  <div data-ui="field-group">
    <label data-part="label" for="email">Work email</label>
    <input data-part="input" id="email" name="email" type="email" required>
    <p data-part="error"></p>
  </div>
</form>`) + "\n" +
    `      <h3 id="layers-attribute">2. Attribute validators, including async</h3>\n` +
    `      <p><code>l-validate:&lt;name&gt;</code> on a control adds a check of your own; its value is an expression with the control's <code>value</code> in scope. ` +
    `<code>.async</code> marks one that answers with a promise: the field-group sits in <code>data-state="validating"</code> until it settles, runs are debounced 250 ms and the newest wins, ` +
    `and a rejection is a failure rather than a silent pass. <code>data-error-&lt;name&gt;</code> supplies the message.</p>\n` +
    pre(`<input data-part="input" name="email" type="email" required
       l-validate:company="isCompanyEmail(value)"
       l-validate:taken.async="isFree(value)"
       data-error-company="Use your company address."
       data-error-taken="That address is already registered.">`) + "\n" +
    `      <h3 id="layers-registry">3. The programmatic registry</h3>\n` +
    `      <p><code>Faqir.validate</code> is installed by the same plugin. Registered validators run after the native constraints and after the attribute validators, in registration order, first failure wins. ` +
    `Return <code>true</code> to pass, <code>false</code> to fail with the registered message, or a string to fail with that one. ` +
    `<code>unregister(form, field, name?)</code> drops one validator, or all of the field's.</p>\n` +
    pre(`const off = Faqir.validate.register('#signup', 'email', 'taken', async (value) => {
  const res = await fetch(\`/api/email-free?q=\${encodeURIComponent(value)}\`);
  return res.ok || 'That address is already registered.';
});

await Faqir.validate.run('#signup');   // true when the whole form is clean
off();                                 // remove just this one`) + "\n" +
    `      <p>Everything above judges one field at a time. The rules definition is the cross-field half, and the rest of this page is about it.</p>`;

  // ── 3. the definition ─────────────────────────────────────────────────────
  const rootRows = Object.entries(schema.properties).map(([key, node]) => [
    code(key),
    code(schemaShape(node)),
    ticks(node.description ?? ""),
  ]);
  const definitionKeywords = [...rulesPkg.DEFINITION_KEYWORDS];
  const schemaRootKeys = Object.keys(schema.properties).sort();
  if (schemaRootKeys.join(",") !== [...definitionKeywords].sort().join(",")) {
    throw new Error("rules docs: rules.schema.json root keys differ from DEFINITION_KEYWORDS");
  }

  // Field branches: one column per branch, one row per keyword.
  const branchNames = (schema.definitions.field.oneOf ?? []).map((alt) =>
    (alt.$ref ?? "").replace("#/definitions/", ""),
  );
  const branchTypes = branchNames.map((name) => {
    const typeNode = schema.definitions[name].properties?.type;
    return typeNode ? schemaShape(typeNode).replace(/"/g, "").replace(/^const /, "") : name;
  });
  const keywordOrder: string[] = [];
  const keywordDesc = new Map<string, string>();
  for (const name of branchNames) {
    for (const [key, node] of Object.entries(schema.definitions[name].properties ?? {})) {
      if (!keywordOrder.includes(key)) keywordOrder.push(key);
      if (node.description && !keywordDesc.has(key)) keywordDesc.set(key, node.description);
    }
  }
  // Pin the schema's branches against the package's closed sets.
  for (const [type, keys] of Object.entries(rulesPkg.FIELD_KEYWORDS)) {
    const branch = branchNames.find((name) => {
      const t = schema.definitions[name].properties?.type;
      return t !== undefined && (t.const === type || (t.enum ?? []).includes(type));
    });
    if (!branch) throw new Error(`rules docs: no schema branch for field type "${type}"`);
    const inSchema = Object.keys(schema.definitions[branch].properties ?? {}).sort();
    if (inSchema.join(",") !== [...keys].sort().join(",")) {
      throw new Error(`rules docs: schema branch ${branch} differs from FIELD_KEYWORDS.${type}`);
    }
  }
  const fieldRows = keywordOrder.map((key) => [
    code(key),
    ...branchNames.map((name) => {
      const node = schema.definitions[name].properties?.[key];
      return node ? `<span data-docs-rules-yes>${esc(schemaShape(node))}</span>` : `<span data-docs-rules-no>—</span>`;
    }),
    ticks(keywordDesc.get(key) ?? ""),
  ]);

  // Rule branches.
  const ruleBranches = (schema.definitions.rule.oneOf ?? []).map((alt) =>
    (alt.$ref ?? "").replace("#/definitions/", ""),
  );
  const verbRows = ruleBranches.map((name) => {
    const node = schema.definitions[name];
    const props = node.properties ?? {};
    const required = node.required ?? [];
    const keys = Object.keys(props).map((k) => (required.includes(k) ? code(k) : `${code(k)}?`));
    const verb = Object.keys(props).find((k) => (rulesPkg.RULE_VERBS as readonly string[]).includes(k)) ?? "";
    const isRemote = props.validate?.const === "remote";
    return [
      `${code(verb)}${isRemote ? ` <span data-ui="badge" data-size="sm">remote</span>` : ""}`,
      keys.join(" "),
      ticks(node.description ?? ""),
    ];
  });
  const ruleKeyRows = Object.entries(rulesPkg.RULE_KEYS).map(([verb, keys]) => [
    code(verb),
    esc(VERB_MEANING[verb]),
    keys.map(code).join(" "),
  ]);

  const definition =
    `      <p>A definition has two halves. <strong>Fields</strong> say what each value must look like on its own. <strong>Rules</strong> say everything that depends on the other fields. ` +
    `Both halves answer into one verdict. Anything the format does not name is a <code>DefinitionError</code>, thrown when the definition is read: a misspelled <code>maxlength</code> throws rather than doing nothing, ` +
    `because a constraint that silently disappears is the worst failure a validator can have.</p>\n` +
    pre(`{
  "version": "1",                          // optional; "1" is the only value
  "fields": { "<path>": <field schema> },  // dotted paths: "a.b", "rows[0].qty"
  "required": ["<path>"],                  // optional alternative to required: true
  "messages": { "en": { "<key>": "…" } },  // optional
  "defaultLocale": "en",                   // optional
  "rules": [ <rule>, … ]                   // optional; the verbs
}`) + "\n" +
    `      <p>The format is published as Draft-07 JSON Schema: <a data-ui="link" href="${u(RULES_SCHEMA_FILE)}"><span data-ui="text" data-variant="mono">rules.schema.json</span></a>. ` +
    `It is the document to hand a model as the structured-output schema when it writes a definition, and every table in this section is walked out of it. ` +
    `Its <code>$id</code> is <code>${esc(schema.$id)}</code>, and the package publishes the file itself as <code>@faqir-ui/rules/rules.schema.json</code>.</p>\n` +
    `      <h3 id="definition-root">Root keys</h3>\n` +
    table(["Key", "Accepts", "Meaning"], rootRows, "No root keys.") + "\n" +
    `      <h3 id="definition-fields">Field schemas</h3>\n` +
    `      <p>A JSON Schema 2020-12 subset plus one piece of Faqir sugar, <code>required: true</code> on the field itself. The keyword set is closed per type. ` +
    `Requiredness has three equivalent spellings: <code>required: true</code> on a field, a top-level <code>required</code> array, and an object's <code>required: [names]</code>. ` +
    `Blank means absent: <code>undefined</code>, <code>null</code>, <code>""</code> and <code>[]</code>. <code>false</code> and <code>0</code> are values. ` +
    `A blank optional field is skipped entirely, and a <code>type</code> finding stops the other checks for that value.</p>\n` +
    `      <div data-docs-rules-matrix>\n` +
    table(["Keyword", ...branchTypes, "Note"], fieldRows, "No field keywords.") + "\n" +
    `      </div>\n` +
    `      <h3 id="definition-verbs">The ${rulesPkg.RULE_VERBS.length} verbs</h3>\n` +
    `      <p>Every rule carries an <code>id</code>, unique in the definition, which is the <code>rule</code> a finding reports under and the key a message is addressed to, and exactly one verb. ` +
    `<code>validate: "${esc(rulesPkg.REMOTE)}"</code> is the one reserved string; anything else under <code>validate</code> is logic.</p>\n` +
    table(["Verb", "Decides", "Closed key set"], ruleKeyRows, "No verbs.") + "\n" +
    `      <p>The schema splits <code>validate</code> into its two shapes, so it has ${ruleBranches.length} rule branches. A key marked <code>?</code> is optional.</p>\n` +
    table(["Branch", "Keys", "What it does"], verbRows, "No rule branches.") + "\n" +
    pre(`"rules": [
  { "id": "vat-for-companies", "show": "vat", "when": { "==": [{ "var": "kind" }, "company"] } },
  { "id": "vat-required", "require": "vat", "when": { "==": [{ "var": "kind" }, "company"] } },
  { "id": "total", "compute": "total", "value": { "*": [{ "var": "qty" }, { "var": "price" }] } },
  { "id": "under-limit", "validate": { "<=": [{ "var": "total" }, 900] }, "path": "total",
    "message": "This order is over your credit limit." },
  { "id": "email-free", "validate": "remote", "path": "email", "remote": "/api/email-free",
    "message": "That address is already registered." },
  { "id": "to-approval", "jump": "approval", "from": "cart", "when": { ">": [{ "var": "total" }, 500] } }
]`) + "\n" +
    `      <h3 id="definition-order">The order a pass runs in</h3>\n` +
    `      <ol>\n` +
    `        <li><code>compute</code>, in dependency order. The graph comes from the literal <code>var</code> paths and a cycle is a <code>DefinitionError</code>. Each value is written into the data the rest of the pass reads; the caller's data is never mutated.</li>\n` +
    `        <li><code>show</code>, then <code>require</code>. Several <code>show</code> rules on one path AND together; several <code>require</code> rules OR. A hidden field is never required.</li>\n` +
    `        <li>Shape validation over the computed data, with that requiredness folded in.</li>\n` +
    `        <li>Findings about a hidden field, and anything nested inside it, are dropped.</li>\n` +
    `        <li><code>validate</code> rules in document order, appended after the shape findings. A rule is skipped while its own declared field is blank; a rule whose <code>path</code> is not a declared field always runs.</li>\n` +
    `        <li><code>jump</code>: the first rule whose <code>when</code> holds wins for a given <code>from</code>; a rule with no <code>when</code> is that page's default.</li>\n` +
    `      </ol>\n` +
    `      <h3 id="definition-verdict">The verdict</h3>\n` +
    pre(`{
  "valid": boolean,                          // no findings, and nothing left to check
  "findings": [{ path, rule, message, params }],
  "computed": { "<path>": value },           // what the compute verbs produced
  "visible":  { "<path>": boolean },         // what the show verbs decided
  "required": { "<path>": boolean },         // what the require verbs decided
  "next":     { "<fromPage>": "<toPage>" },  // what the jump verbs decided
  "pending":  ["<ruleId>"]                   // remote rules that have not run
}`) + "\n" +
    `      <p>Findings come out in definition order, and within one value in the fixed order of <code>SHAPE_RULES</code>. The order is part of the contract: the plugin focuses the first offender, so "first" has to mean the same thing everywhere. ` +
    `Sync <code>validate</code> cannot run remote rules and does not pretend to: their ids come back in <code>pending</code>, and a verdict with anything pending is not <code>valid</code>.</p>`;

  // ── 4. logic, shape, formats, limits ──────────────────────────────────────
  const opRows = operators.map((row) => [
    code(row.op),
    esc(FAMILY_LABELS[row.family] ?? row.family),
    row.arity === 0 ? "any" : String(row.arity),
  ]);
  const shapeRows = rulesPkg.SHAPE_RULES.map((rule) => [
    code(rule),
    esc(rulesPkg.DEFAULT_MESSAGES[rule] ?? ""),
    VALIDITY_FLAGS[rule] ? code(VALIDITY_FLAGS[rule]) : `<span data-docs-rules-no>—</span>`,
  ]);
  const ruleMessageRows = Object.entries(rulesPkg.RULE_MESSAGES).map(([key, text]) => [code(key), esc(text)]);
  const formatRows = rulesPkg.BUILT_IN_FORMATS.map((name) => [code(name), esc(FORMAT_NOTES[name])]);
  const limitRows: string[][] = [
    [code("MAX_PATTERN_LENGTH"), String(rulesPkg.MAX_PATTERN_LENGTH), "A <code>pattern</code> or a <code>regex</code> operand longer than this is refused at compile time."],
    [code("MAX_REGEX_SUBJECT_LENGTH"), String(rulesPkg.MAX_REGEX_SUBJECT_LENGTH), "A <code>regex</code> subject longer than this answers <code>false</code> rather than risking a pathological match."],
    [code("MAX_LOGIC_NODES"), String(rulesPkg.MAX_LOGIC_NODES), "Every operator object, array and literal in one expression, counted while it is walked."],
    [code("MAX_LOGIC_DEPTH"), String(rulesPkg.MAX_LOGIC_DEPTH), "How deeply one expression may nest."],
  ];

  const logic =
    `      <h3 id="logic-operators">The JSONLogic subset: ${operators.length} operators</h3>\n` +
    `      <p>Conditions and computed values are JSONLogic: a literal, an array, or a one-key <code>{ "&lt;op&gt;": &lt;args&gt; }</code> object. ` +
    `Anything not in this table, including <code>map</code>, <code>filter</code>, <code>reduce</code>, <code>merge</code> or a typo, is a <code>DefinitionError</code> naming the operator. ` +
    `There is no "unknown operators evaluate to null" mode, because a condition that answers <code>null</code> is a field that silently stays hidden. ` +
    `The list below is <code>LOGIC_OPS</code>, in the order the evaluator declares it; "min args" is the arity the compiler enforces.</p>\n` +
    `      <div data-docs-rules-operators>\n` +
    table(["Operator", "Family", "Min args"], opRows, "No operators.") + "\n" +
    `      </div>\n` +
    `      <p>Semantics are the reference implementation's, vendored conformance vectors and all. Truthiness is JavaScript's except that an empty array is falsy. ` +
    `<code>and</code> and <code>or</code> answer with the deciding value, not a boolean. <code>==</code> is loose and <code>===</code> is strict. ` +
    `Arithmetic coerces with <code>parseFloat</code>. The comparators are 3-ary for "between". <code>all</code> over an empty array is false; <code>none</code> over an empty array is true.</p>\n` +
    `      <p>The two Faqir operators: <code>date</code> parses ISO 8601 itself and reads a date-time with no zone as UTC, so the same rule answers the same in Berlin and on the server; ` +
    `its middle argument is one of ${rulesPkg.DATE_COMPARATORS.map(code).join(", ")}. ` +
    `<code>regex</code> takes a literal pattern, compiled and bounded when the definition is read, and answers <code>false</code> for a non-string subject.</p>\n` +
    pre(`{ "date": ["2026-01-01", "<=", { "var": "start" }] }
{ "regex": ["^[A-Z]{2}\\\\d{3}$", { "var": "code" }] }`) + "\n" +
    `      <h3 id="logic-shape">The ${rulesPkg.SHAPE_RULES.length} shape rules</h3>\n` +
    `      <p>The rule names a finding can carry, in the order the validator checks them, with the built-in English sentence for each. ` +
    `Where a rule has a browser <code>ValidityState</code> flag, faqir-validate shows the same sentence for it, and a test in the package fails if the two tables drift.</p>\n` +
    table(["Rule", "Default message", "ValidityState flag"], shapeRows, "No shape rules.") + "\n" +
    `      <p>A cross-field <code>validate</code> rule reports under its own <code>id</code>. The two sentences findings fall back to when nothing else speaks:</p>\n` +
    table(["Key", "Sentence"], ruleMessageRows, "No rule messages.") + "\n" +
    `      <h3 id="logic-formats">The ${rulesPkg.BUILT_IN_FORMATS.length} formats</h3>\n` +
    `      <p>Form formats, not RFC conformance suites: reject what is plainly wrong, never reject what a real registrar, postal service or phone network would accept. ` +
    `Add your own with <code>registerFormat(name, value =&gt; boolean)</code>. It is process-global on purpose: a definition naming <code>format: "nino"</code> has to mean the same thing on both sides of the wire.</p>\n` +
    table(["Format", "What passes"], formatRows, "No formats.") + "\n" +
    `      <h3 id="logic-limits">Limits</h3>\n` +
    `      <p>A definition is data, and data is often one layer removed from someone untrusted. Every bound is checked at the point the work would start, never after it.</p>\n` +
    table(["Export", "Value", "Bounds"], limitRows, "No limits.");

  // ── 5. l-rules in the page ────────────────────────────────────────────────
  const pluginVerbRows = rulesPkg.RULE_VERBS.map((verb) => [code(verb), VERB_IN_PAGE[verb]]);
  const plugin =
    `      <p>The <code>faqir-rules</code> plugin binds a definition to a form and applies the answer to the markup. Load it after <code>faqir-core</code> and after <code>faqir-validate</code>; ` +
    `it provides the <code>l-rules</code> directive and the <code>$rules</code> magic on the <a data-ui="link" href="${u("engine/index.html")}">engine</a>.</p>\n` +
    pre(`<script src="ui/core/faqir-core.js"></script>
<script src="ui/core/plugins/faqir-validate.js"></script>
<script src="ui/core/plugins/faqir-rules.js"></script>

<script type="application/json" id="signup-rules">
  { "version": "1",
    "fields": { "plan": { "type": "string" }, "seats": { "type": "integer" } },
    "rules": [{ "id": "seats-for-teams", "show": "seats",
                "when": { "==": [{ "var": "plan" }, "team"] } }] }
</script>

<form l-validate l-rules="#signup-rules"> … </form>`) + "\n" +
    `      <h3 id="plugin-attach">How a definition attaches</h3>\n` +
    `      <p><code>l-rules="#id"</code>, or any value starting with <code>#</code>, <code>.</code> or <code>[</code>, is a selector to a <code>&lt;script type="application/json"&gt;</code>. ` +
    `Anything else is an expression evaluated in the form's scope, so <code>l-rules="rulesDef"</code> takes an object or a JSON string the page already holds. ` +
    `The definition is compiled once, at bind. On init and on every captured <code>input</code> and <code>change</code>, the form's own <code>FormData</code> is coerced through the definition and handed to <code>evaluate</code>. ` +
    `Because a hidden field's controls are disabled, <code>FormData</code> carries exactly what a server receives.</p>\n` +
    `      <h3 id="plugin-verbs">What each verb does to the DOM</h3>\n` +
    table(["Verb", "In the page"], pluginVerbRows, "No verbs.") + "\n" +
    `      <p>Every attribute the plugin touches is owned rather than assumed. A <code>hidden</code> the page wrote survives a rule that says "shown"; <code>required</code> is the OR of the markup's own and the rule's. ` +
    `The plugin owns <code>hidden</code> on a field-group, <code>disabled</code>, <code>required</code> and <code>aria-required</code> on a control, and a computed control's <code>value</code>. Nothing else. ` +
    `A rule path also reaches everything nested under it: <code>show: "address"</code> hides <code>address.city</code> and <code>address[0].zip</code>.</p>\n` +
    `      <h3 id="plugin-state">The <code>$rules</code> magic</h3>\n` +
    `      <p><code>$rules</code> is the live verdict, <code>{ visible, required, computed, next }</code>, reactive and never undefined. In a scope with no rules form it answers a fresh empty state, so <code>$rules.next[page]</code> is safe to read in any expression.</p>\n` +
    pre(`<button data-ui="button" @click="page = $rules.next[page] || page + 1">Next</button>`) + "\n" +
    `      <h3 id="plugin-messages">Messages</h3>\n` +
    `      <p>The plugin owns no message and paints no error of its own. A finding's sentence resolves through <code>messages[locale]</code>, then <code>messages[defaultLocale]</code>, then the built-in English default, then the rule name itself. ` +
    `Within each layer <code>"&lt;path&gt;.&lt;rule&gt;"</code> is tried before <code>"&lt;rule&gt;"</code>. A rule's own <code>message</code> sits between the tables and the built-ins. ` +
    `The locale is the page's <code>&lt;html lang&gt;</code>. <code>{name}</code> placeholders are filled from the finding's <code>params</code>, plus <code>{path}</code> and <code>{title}</code>; a placeholder nothing fills is left standing.</p>\n` +
    pre(`"messages": {
  "en": {
    "required": "Don't leave this empty.",
    "email.required": "We need an address to reply to.",
    "minLength": "Use at least {limit} characters — you typed {actual}."
  }
}`) + "\n" +
    `      <h3 id="plugin-remote">Remote rules in the page</h3>\n` +
    `      <p>A <code>validate: "remote"</code> rule becomes an async validator that POSTs <code>{ path, value, data }</code>, where <code>data</code> is every coerced field, to the URL the definition names, and expects <code>{ ok: boolean, message?: string }</code>. ` +
    `A non-2xx status, a body that is not JSON or a network failure is a failed check wearing faqir-validate's built-in sentence, never a silent pass. ` +
    `A definition is data, but a remote rule sends the whole form to the URL inside it; treat the definition's origin accordingly.</p>\n` +
    `      <h3 id="plugin-notes">Nothing fails quietly</h3>\n` +
    `      <ul>\n` +
    `        <li>An <code>l-rules</code> that resolves to nothing, a definition the package refuses, a <code>show</code> or <code>require</code> naming a field the form has no control for, a form with no <code>l-validate</code>, and a missing faqir-validate are each reported: in full through the dev engine's diagnostics, tersely on <code>console.warn</code> in production.</li>\n` +
    `        <li>A <code>validate</code> rule whose path names no control is a legitimate form-level check. A server will report it; the page says once that it has no field-group to paint it into.</li>\n` +
    `        <li>A definition embedded in a <code>&lt;script type="application/json"&gt;</code> must escape <code>&lt;</code> as <code>\\u003c</code>, because a script element is raw text and <code>{"&lt;=": …}</code> is an ordinary operator. <code>@faqir-ui/forms</code> does it when it emits the script.</li>\n` +
    `        <li>The plugin ships in the registry as <code>core/plugins/faqir-rules.js</code>, on the CDN as <code>@faqir-ui/core/dist/plugins/faqir-rules.js</code>, and for a bundler as <code>@faqir-ui/rules/plugin</code>, which exports <code>install(Faqir)</code>. All three are built from one source with the evaluator bundled in.</li>\n` +
    `      </ul>`;

  // ── 6. server ─────────────────────────────────────────────────────────────
  const exportRows = exportGroups.map((g) => [code(g.module), g.names.map(code).join(" ")]);
  const exportCount = Object.keys(rulesPkg).length;
  const server =
    `      <p>The same evaluator, imported. <code>coerce</code> turns the strings a form produces into the types the definition declares, un-flattening the dotted names <code>@faqir-ui/forms</code> emits, so a handler reading <code>FormData</code> and the browser plugin hand <code>validate</code> identical data. ` +
    `Below is the exact output of running this on the definition from the diagram above.</p>\n` +
    pre(`import { coerce, validate } from "@faqir-ui/rules";

const definition = ${json(SIGNUP_DEFINITION)};

// A body as a form posts it: every value a string.
const data = coerce(definition, ${json(SIGNUP_RAW_BODY)});
// → ${JSON.stringify(coerced)}

const verdict = validate(definition, data);
// → ${json(verdict).replace(/\n/g, "\n// ")}`) + "\n" +
    `      <p>A remote rule runs only through <code>validateAsync</code>, which takes a resolver and throws if a definition has remote rules and no resolver was given. ` +
    `The resolver answers <code>true</code>, <code>false</code>, or a string, or a promise of one. A rejection, or anything else, is a finding under <code>remote-error</code>: a check that could not run never passes.</p>\n` +
    pre(`import { validateAsync } from "@faqir-ui/rules";

const verdict = await validateAsync(definition, data, {
  remote: async (rule, value, data) => {
    const response = await fetch(\`\${rule.remote}?q=\${encodeURIComponent(String(value))}\`);
    return response.ok ? true : "That address is already registered.";
  },
});`) + "\n" +
    `      <h3 id="server-api">The ${exportCount} exports</h3>\n` +
    `      <p>Parsed from the package's <code>index.js</code>, grouped by the module each name comes from. <code>@faqir-ui/rules/plugin</code> additionally exports <code>install</code>.</p>\n` +
    table(["Module", "Exports"], exportRows, "No exports.") + "\n" +
    `      <p><code>compile(def)</code> returns a pre-compiled definition and is idempotent: pass it to <code>validate</code> in a hot path. <code>evaluate(def, data)</code> answers the verbs with nothing validated, which is what the plugin runs on every keystroke. ` +
    `<code>evaluateLogic(expr, data)</code> runs one expression. <code>DefinitionError</code> is thrown for a bad definition; bad data produces findings, never throws.</p>`;

  // ── 7. lint ───────────────────────────────────────────────────────────────
  const lintRows = rulesPkg.LINT_RULES.map((rule) => [code(rule), esc(LINT_NOTES[rule])]);
  const lintSection =
    `      <p>A schema cannot say whether a definition will do what it says. <code>lintDefinition(def, { locales })</code> reports the ${rulesPkg.LINT_RULES.length} things it cannot, and <code>faqir rules lint</code> is that function behind a CLI. ` +
    `<code>validateDefinition(def)</code> is <code>rules.schema.json</code> as code, the reference reading of the published schema, and a test corpus holds the two to the same verdict case by case.</p>\n` +
    pre(`faqir rules lint signup.rules.json          # a file
faqir rules lint --stdin < signup.rules.json # a pipe
faqir rules lint form.json --json            # for an agent
faqir rules lint form.json --locales en,ro   # these locales must be complete`) + "\n" +
    `      <h3 id="lint-rules">The ${rulesPkg.LINT_RULES.length} checks</h3>\n` +
    table(["Rule", "What it reports"], lintRows, "No lint rules.") + "\n" +
    `      <h3 id="lint-output">The JSON output</h3>\n` +
    `      <p>The report below is <code>lintDefinition</code> run over a definition whose condition reads a field nobody declared, wrapped in the envelope <code>--json</code> emits. ` +
    `<code>rules_lint_schema_version</code> is bumped when a key changes meaning; adding one is additive.</p>\n` +
    pre(`$ faqir rules lint signup.rules.json --json
${json(lintReport)}`) + "\n" +
    `      <h3 id="lint-exit">Exit codes</h3>\n` +
    table(
      ["Exit", "When"],
      [
        [code("0"), "No findings, or only warnings. A warning is a rule that works and is worth a second look."],
        [code("1"), "Any <code>error</code> finding: a rule that cannot do what it was written to do. Also: no definition given, the file could not be read, or the file is not JSON (reported as a <code>schema</code> finding, in the same envelope)."],
      ],
      "No exit codes.",
    ) + "\n" +
    `      <p>Two things the lint is deliberately quiet about, because both are correct: a <code>var</code> inside the test of <code>some</code>, <code>all</code> or <code>none</code>, where the name is a property of the item, and a <code>var</code> with a default. ` +
    `A locale gap is a warning unless you named the locale with <code>--locales</code>, which is how you say "these must be complete".</p>`;

  // ── 8. forms ──────────────────────────────────────────────────────────────
  const widgetRows: string[][] = [
    [code("string"), code("input[type=text]")],
    [`${code("string")} + ${code('format: "email"')}`, code("input[type=email]")],
    [`${code("string")} + ${code('format: "uri"')}`, code("input[type=url]")],
    [`${code("string")} + ${code('format: "date"')}`, `${code("date-picker")} + ${code("calendar")}`],
    [`${code("string")} + ${code("enum")} (1 to 4 values)`, "radio group"],
    [`${code("string")} + ${code("enum")} (5+ values)`, "select"],
    [code("number"), code("input[type=number]")],
    [code("integer"), code("input[type=number][step=1]")],
    [code("boolean"), `checkbox, or ${code("switch")} via the UI schema`],
    [`${code("object")} (nested)`, `fieldset card (${code("card")} + ${code("legend")}), children recurse`],
    [`${code("array")} of ${code("enum")} (1 to 4 values)`, "checkbox group"],
    [`${code("array")} of ${code("enum")} (5+ values)`, `multi-select (${code("select[multiple]")})`],
    [`${code("array")} of ${code("object")}`, `repeatable group (${code("l-data")} + keyed ${code("l-for")}, add/remove buttons)`],
    [`UI schema ${code("ui:groups")}`, "layout groups (fieldset cards)"],
    [`UI schema ${code("ui:wizard")}`, "multi-step wizard (stepper + card panels + Back/Next/Submit)"],
  ];
  const derivedRows: string[][] = [
    [`${code("if")} + ${code("then")}/${code("else")}`, `${code("then.properties")} → ${code("show")}, ${code("then.required")} → ${code("require")}; the ${code("else")} branch takes the negated condition`],
    [code("allOf: [{ if, then, else }, …]"), "the same, once per entry; conditionals only"],
    [code("dependentRequired: { trigger: [names] }"), `one ${code("require")} per name, conditioned on the trigger being filled in`],
    [`${code("ui:wizard")} step ${code("when")}`, `a ${code("jump")} that steps over the page when the condition does not hold`],
  ];
  const forms =
    `      <p><code>renderForm(jsonSchema, uiSchema?, opts?)</code> turns a JSON Schema into audit-clean Faqir markup: field-groups, deterministic ids, <code>l-validate</code>, and <code>l-data</code> on the form so the engine adopts it as a scope root. ` +
    `It only builds strings. The browser needs <code>faqir-core.js</code> and <code>faqir-validate.js</code>, plus <code>faqir-rules.js</code> when the form carries rules; the <code>@ui:requires</code> comment at the top says which. ` +
    `Options are <code>idPrefix</code>, <code>radioThreshold</code> (default <code>${DEFAULT_RADIO_THRESHOLD}</code>), <code>theme</code>, <code>density</code>, <code>i18n</code> and <code>rules</code>.</p>\n` +
    `      <h3 id="forms-widgets">Widget mapping</h3>\n` +
    table(["JSON Schema", "Faqir widget"], widgetRows, "No widgets.") + "\n" +
    `      <h3 id="forms-rules">Schema → rules</h3>\n` +
    `      <p>A form's <code>fields</code> map is always derived from the schema, with the same coercion types the widgets were chosen from, so the page's data and the server's data are the same object. ` +
    `<code>opts.rules</code> adds what a schema cannot say; author rules come first and keep their ids. Four conditional keywords the schema itself may carry become rules instead of throwing:</p>\n` +
    table(["Schema", "Derived rules"], derivedRows, "No derived rules.") + "\n" +
    `      <p>Everything emitted is lint-clean by construction: <code>lintDefinition</code> reports nothing for a definition this renderer produced. When the definition contains any <code>jump</code>, the wizard's Next and Back read <code>$rules.next</code> instead of counting by one.</p>\n` +
    `      <h3 id="forms-example">A real run</h3>\n` +
    `      <p>The input, then the exact string <code>renderForm</code> returned for it when this page was built. The <code>if</code>/<code>then</code> pair became a <code>show</code> and a <code>require</code>, and the definition was written beside the form.</p>\n` +
    pre(`import { renderForm } from "@faqir-ui/forms";

const html = renderForm(${json(FORMS_SCHEMA)}, ${json(FORMS_UI)}, ${json(FORMS_OPTS)});`) + "\n" +
    `      <div data-docs-rules-output>\n` +
    pre(formHtml.trimEnd()) + "\n" +
    `      </div>`;

  // ── 9. packages ───────────────────────────────────────────────────────────
  const pkg = (name: string, role: string) =>
    `        <a data-ui="card" data-variant="outlined" data-docs-rules-package href="${GITHUB_PACKAGES}/${name}" target="_blank" rel="noopener noreferrer">\n` +
    `          <div data-part="header"><h3 data-part="title"><span data-ui="text" data-variant="mono">@faqir-ui/${esc(name)}</span></h3></div>\n` +
    `          <div data-part="body"><p>${esc(role)}</p></div>\n` +
    `          <div data-part="footer"><span data-ui="text" data-variant="subtle" data-size="sm">github.com/Narcis13/faqir-ui/packages/${esc(name)}</span></div>\n` +
    `        </a>`;
  const packages =
    `      <p>Three packages, one repository. Every link opens in a new tab.</p>\n` +
    `      <div data-ui="grid" data-cols="1" data-cols-md="3" data-gap="4" data-docs-rules-packages>\n` +
    pkg("rules", "The definition format, the evaluator, the formats, the messages, the lint and the published schema. Zero dependencies, no host coupling.") + "\n" +
    pkg("forms", "JSON Schema to Faqir markup, with the rules definition emitted beside the form. Only builds strings.") + "\n" +
    pkg("core", "The engine, as ESM. The faqir-rules and faqir-validate plugins ship in its dist/plugins directory.") + "\n" +
    `      </div>`;

  const body =
    head +
    section("realms", "Three realms, one verdict", realms) + "\n" +
    section("layers", "The three validation layers", layers) + "\n" +
    section("definition", "The definition", definition) + "\n" +
    section("logic", "Logic, shape rules, formats and limits", logic) + "\n" +
    section("plugin", "l-rules in the page", plugin) + "\n" +
    section("server", "@faqir-ui/rules on the server", server) + "\n" +
    section("lint", "faqir rules lint", lintSection) + "\n" +
    section("forms", "@faqir-ui/forms", forms) + "\n" +
    section("packages", "Packages", packages);

  return [
    {
      path: RULES_PAGE,
      content: renderShell({
        pagePath: RULES_PAGE,
        title: `${RULES_NAV_TITLE} · ${ctx.config.title}`,
        description:
          "One JSON rules definition, enforced in the browser by the faqir-rules plugin, re-checked on the server by @faqir-ui/rules, and linted by faqir rules lint.",
        body: `<div data-docs-rules>\n${body}\n</div>`,
        config: ctx.config,
        components: ctx.components,
        themes: ctx.themes,
        current: RULES_PAGE,
        layout: "reference",
        scripts: [],
      }),
    },
    { path: RULES_SCHEMA_FILE, content: schemaText },
  ];
}
