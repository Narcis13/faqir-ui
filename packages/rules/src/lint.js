/**
 * @faqir-ui/rules — the lint, and the reference reading of `rules.schema.json`.
 * [1.1B-05 · §8.4]
 *
 * Imports its siblings and nothing else; touches no DOM, no filesystem and no
 * process, so `faqir rules lint`, the MCP surface and a browser form builder
 * all report the same thing about the same definition.
 *
 * ── Two different questions ─────────────────────────────────────────────────
 *
 * `validateDefinition(def)` answers "is this the right SHAPE" — the question
 * `rules.schema.json` asks, and the only one a platform generating structured
 * output can be held to. It is hand-written rather than run through a JSON
 * Schema validator because this package has no dependencies and will not grow
 * one; `tests/schema.test.ts` is what keeps the two honest, replaying an
 * accept/reject corpus through both and requiring the same verdict case by
 * case.
 *
 * `lintDefinition(def)` answers "will this definition DO what it says", which
 * no schema can express: a `var` naming a field nobody declared, a compute
 * cycle, a message key no locale translates, a condition that folds to a
 * constant. Seven rules, each with a stable id, in the order they are reported:
 *
 *   schema            the definition does not match `rules.schema.json`
 *   rule-verb         a rule with zero or two verbs
 *   rule-ops          an unsupported operator, a bad arity, a malformed node
 *   rule-refs         a path — a target or a `var` — that names no field
 *   rule-cycles       `compute` rules that depend on each other in a cycle
 *   rule-unreachable  a `when` (or a `validate`) that is constant after folding
 *   rule-messages     a message key that addresses nothing, or a locale gap
 *
 * ── Severity, and what an exit code means ───────────────────────────────────
 *
 * `error` is a rule that cannot do what it was written to do — the page and the
 * server will both quietly disagree with its author. `warning` is a rule that
 * works but is worth a second look: a form-level `validate` the browser has no
 * field-group to paint into (legitimate, and `plugin.js` says so in as many
 * words), a compute nothing validates, a condition that folded flat. `faqir
 * rules lint` exits non-zero on an error and zero on a warning, which is the
 * same bargain `faqir audit` strikes.
 *
 * ── Why `schema` findings are dropped where a specific rule spoke ───────────
 *
 * A rule with two verbs matches none of the schema's branches, so the shape
 * check and `rule-verb` both have something to say about the same bytes. The
 * specific sentence is the useful one ("has 2 verbs (show, require)") and the
 * generic one ("matches no rule branch") only repeats it, so a `schema` finding
 * inside a rule a specific check already claimed is suppressed.
 */

import { DefinitionError } from "./errors.js";
import { assertLogic, evaluateLogic, truthy, varPaths } from "./logic.js";
import { catastrophicMessage, nestedMessage, patternRisk } from "./pattern.js";
import { RULE_MESSAGES, SHAPE_RULES } from "./messages.js";
import { DEFINITION_VERSION, FIELD_KEYWORDS, normalizePath } from "./shape.js";
import { RULE_KEYS, RULE_VERBS, REMOTE, compile } from "./rules.js";

/** The seven lint rules, in the order `lintDefinition` reports them. */
export const LINT_RULES = Object.freeze([
  "schema",
  "rule-verb",
  "rule-ops",
  "rule-refs",
  "rule-cycles",
  "rule-unreachable",
  "rule-messages",
]);

/** The keys a definition may carry — the schema's root, as a list. */
export const DEFINITION_KEYWORDS = Object.freeze([
  "version", "fields", "required", "messages", "defaultLocale", "rules",
]);

/**
 * @typedef {object} LintFinding
 * @property {string} rule one of {@link LINT_RULES}
 * @property {"error" | "warning"} severity
 * @property {string} path where in the definition — `rules[2]`, `fields.email`
 * @property {string} message one sentence, naming what to change
 * @property {string} [id] the offending rule's own id, when it has one
 */

/**
 * @typedef {object} LintReport
 * @property {boolean} ok no `error`-severity findings
 * @property {{ error: number, warning: number }} counts
 * @property {LintFinding[]} findings
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {string} rule @param {string} path @param {string} message @param {object} [extra] @returns {LintFinding} */
function error(rule, path, message, extra) {
  return { rule, severity: "error", path, message, ...extra };
}

/** @param {string} rule @param {string} path @param {string} message @param {object} [extra] @returns {LintFinding} */
function warning(rule, path, message, extra) {
  return { rule, severity: "warning", path, message, ...extra };
}

// ── The shape half: `rules.schema.json`, as code ────────────────────────────

const FIELD_TYPES = Object.freeze(Object.keys(FIELD_KEYWORDS));

/** `number` and `integer` accept the same keywords, and the schema shares one branch. */
const NUMERIC_TYPES = Object.freeze(["number", "integer"]);

/**
 * @param {unknown} schema @param {string} at @param {LintFinding[]} out
 */
function checkFieldSchema(schema, at, out) {
  if (!isRecord(schema)) {
    out.push(error("schema", at, "a field schema must be an object."));
    return;
  }
  const type = schema.type;
  if (typeof type !== "string" || !FIELD_TYPES.includes(type)) {
    out.push(error(
      "schema",
      at,
      `"type" must be one of ${FIELD_TYPES.join(", ")}${type === undefined ? " (it is missing)" : ` (got ${JSON.stringify(type)})`}.`,
    ));
    return;
  }
  const allowed = /** @type {Record<string, readonly string[]>} */ (FIELD_KEYWORDS)[type];
  for (const key of Object.keys(schema)) {
    if (!allowed.includes(key)) {
      out.push(error("schema", `${at}.${key}`, `a "${type}" field accepts ${allowed.join(", ")}; "${key}" is not one of them.`));
    }
  }

  for (const key of ["title", "description"]) {
    if (schema[key] !== undefined && typeof schema[key] !== "string") {
      out.push(error("schema", `${at}.${key}`, `"${key}" must be a string.`));
    }
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
    out.push(error("schema", `${at}.enum`, '"enum" must be a non-empty array.'));
  }
  if (schema.required !== undefined) {
    const listed = type === "object" && Array.isArray(schema.required) &&
      schema.required.every((name) => typeof name === "string");
    if (schema.required !== true && !listed) {
      out.push(error(
        "schema",
        `${at}.required`,
        type === "object"
          ? '"required" must be true or an array of property names.'
          : '"required" must be true; only an object field may list property names.',
      ));
    }
  }

  if (type === "string") {
    if (schema.pattern !== undefined && typeof schema.pattern !== "string") {
      out.push(error("schema", `${at}.pattern`, '"pattern" must be a string.'));
    }
    if (schema.format !== undefined && typeof schema.format !== "string") {
      out.push(error("schema", `${at}.format`, '"format" must be a string.'));
    }
  }
  for (const key of ["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum",
    "exclusiveMaximum", "multipleOf", "minItems", "maxItems"]) {
    const value = schema[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
      out.push(error("schema", `${at}.${key}`, `"${key}" must be a finite number.`));
    }
  }
  if (type === "array") {
    if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== "boolean") {
      out.push(error("schema", `${at}.uniqueItems`, '"uniqueItems" must be a boolean.'));
    }
    if (schema.items !== undefined) checkFieldSchema(schema.items, `${at}[]`, out);
  }
  if (type === "object" && schema.properties !== undefined) {
    if (!isRecord(schema.properties)) {
      out.push(error("schema", `${at}.properties`, '"properties" must be an object.'));
    } else {
      for (const [name, child] of Object.entries(schema.properties)) {
        checkFieldSchema(child, `${at}.${name}`, out);
      }
    }
  }
}

/** Which verb keys a rule carries. @param {Record<string, unknown>} rule */
function verbsOf(rule) {
  return RULE_VERBS.filter((verb) => rule[verb] !== undefined);
}

/**
 * @param {unknown} raw @param {string} at @param {LintFinding[]} out
 */
function checkRuleShape(raw, at, out) {
  if (!isRecord(raw)) {
    out.push(error("schema", at, "a rule must be an object."));
    return;
  }
  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : undefined;
  if (id === undefined) {
    out.push(error("schema", `${at}.id`, '"id" must be a non-empty string; it is what a message is addressed to.'));
  }
  const verbs = verbsOf(raw);
  if (verbs.length !== 1) {
    // The schema says this too — a rule with no verb, or two, matches none of
    // its branches — so the shape check has to say it as well, or the two
    // readings of the same document would disagree. `lintDefinition` is what
    // drops this one in favour of `rule-verb`'s more specific sentence.
    out.push(error(
      "schema",
      at,
      `a rule carries exactly one verb (${RULE_VERBS.join(", ")}); this one carries ${
        verbs.length === 0 ? "none" : `${verbs.length} (${verbs.join(", ")})`
      }.`,
      { id },
    ));
    return;
  }

  const verb = verbs[0];
  const allowed = /** @type {Record<string, readonly string[]>} */ (RULE_KEYS)[verb];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      out.push(error("schema", `${at}.${key}`, `a "${verb}" rule accepts ${allowed.join(", ")}; "${key}" is not one of them.`, { id }));
    }
  }

  /** @param {string} key */
  const mustBeText = (key) => {
    if (typeof raw[key] !== "string" || raw[key] === "") {
      out.push(error("schema", `${at}.${key}`, `"${key}" must be a non-empty string.`, { id }));
    }
  };

  if (verb === "show" || verb === "require") {
    mustBeText(verb);
    if (raw.when === undefined) {
      out.push(error("schema", `${at}.when`, `a "${verb}" rule needs a "when"; a rule with no condition never changes anything.`, { id }));
    }
    return;
  }
  if (verb === "compute") {
    mustBeText("compute");
    if (raw.value === undefined) {
      out.push(error("schema", `${at}.value`, '"compute" needs a "value" expression.', { id }));
    }
    return;
  }
  if (verb === "jump") {
    mustBeText("jump");
    mustBeText("from");
    return;
  }

  // `validate`, in its two forms.
  mustBeText("path");
  if (raw.message !== undefined && typeof raw.message !== "string") {
    out.push(error("schema", `${at}.message`, '"message" must be a string.', { id }));
  }
  if (raw.validate === REMOTE) {
    mustBeText("remote");
  } else if (raw.remote !== undefined) {
    out.push(error(
      "schema",
      `${at}.remote`,
      `"remote" only belongs to a rule whose "validate" is ${JSON.stringify(REMOTE)}.`,
      { id },
    ));
  }
}

/**
 * Does `definition` match `rules.schema.json`? The reference implementation of
 * that document, and the `schema` lint rule's whole content.
 *
 * Unlike `compile`, which throws at the first problem because it is about to
 * run the thing, this reports every one of them: a definition is usually being
 * fixed, not executed, when someone asks this question.
 *
 * @param {unknown} definition
 * @returns {{ valid: boolean, findings: LintFinding[] }}
 */
export function validateDefinition(definition) {
  /** @type {LintFinding[]} */
  const findings = [];
  if (!isRecord(definition)) {
    findings.push(error("schema", "", "a definition must be an object."));
    return { valid: false, findings };
  }

  for (const key of Object.keys(definition)) {
    if (!DEFINITION_KEYWORDS.includes(key)) {
      findings.push(error("schema", key, `unsupported definition key "${key}" (accepted: ${DEFINITION_KEYWORDS.join(", ")}).`));
    }
  }
  if (definition.version !== undefined && definition.version !== DEFINITION_VERSION) {
    findings.push(error("schema", "version", `"version" must be ${JSON.stringify(DEFINITION_VERSION)}.`));
  }
  if (definition.defaultLocale !== undefined &&
      (typeof definition.defaultLocale !== "string" || definition.defaultLocale === "")) {
    findings.push(error("schema", "defaultLocale", '"defaultLocale" must be a non-empty string.'));
  }

  if (definition.fields !== undefined) {
    if (!isRecord(definition.fields)) {
      findings.push(error("schema", "fields", '"fields" must be a map of paths to field schemas.'));
    } else {
      for (const [path, schema] of Object.entries(definition.fields)) {
        if (path.length === 0) {
          findings.push(error("schema", "fields", '"fields" has an empty path key.'));
          continue;
        }
        checkFieldSchema(schema, `fields.${path}`, findings);
      }
    }
  }

  if (definition.required !== undefined) {
    if (!Array.isArray(definition.required)) {
      findings.push(error("schema", "required", '"required" must be an array of field paths.'));
    } else {
      for (let i = 0; i < definition.required.length; i++) {
        if (typeof definition.required[i] !== "string" || definition.required[i] === "") {
          findings.push(error("schema", `required[${i}]`, '"required" must list field paths as non-empty strings.'));
        }
      }
    }
  }

  if (definition.messages !== undefined) {
    if (!isRecord(definition.messages)) {
      findings.push(error("schema", "messages", '"messages" must be a map of locales to message tables.'));
    } else {
      for (const [locale, table] of Object.entries(definition.messages)) {
        if (!isRecord(table)) {
          findings.push(error("schema", `messages.${locale}`, `the "${locale}" message table must be an object.`));
          continue;
        }
        for (const [key, text] of Object.entries(table)) {
          if (typeof text !== "string") {
            findings.push(error("schema", `messages.${locale}.${key}`, "a message must be a string."));
          }
        }
      }
    }
  }

  if (definition.rules !== undefined) {
    if (!Array.isArray(definition.rules)) {
      findings.push(error("schema", "rules", '"rules" must be an array.'));
    } else {
      for (let i = 0; i < definition.rules.length; i++) {
        checkRuleShape(definition.rules[i], `rules[${i}]`, findings);
      }
    }
  }

  return { valid: findings.length === 0, findings };
}

// ── Paths a definition knows about ──────────────────────────────────────────

/**
 * Walk `segments` down a field schema's `properties` / `items`. An array whose
 * `items` is undeclared swallows the rest: nothing more is knowable about what
 * is inside it, and reporting a guess would be worse than saying nothing.
 *
 * @param {unknown} schema @param {string[]} segments @returns {boolean}
 */
function descends(schema, segments) {
  let node = schema;
  for (const segment of segments) {
    if (!isRecord(node)) return false;
    if (node.type === "object") {
      const properties = isRecord(node.properties) ? node.properties : {};
      if (!Object.prototype.hasOwnProperty.call(properties, segment)) return false;
      node = properties[segment];
      continue;
    }
    if (node.type === "array") {
      if (!/^\d+$/.test(segment)) return false;
      if (node.items === undefined) return true;
      node = node.items;
      continue;
    }
    return false;
  }
  return true;
}

/**
 * The paths a definition declares, answered for any dotted path: the field
 * itself, anything inside it, and any container above it — `show: "address"`
 * is meaningful when only `address.city` is declared, because `validate` hides
 * a finding whose path sits under a hidden prefix.
 *
 * @param {Record<string, unknown>} definition
 */
function pathOracle(definition) {
  /** @type {Map<string, unknown>} */
  const declared = new Map();
  if (isRecord(definition.fields)) {
    for (const [path, schema] of Object.entries(definition.fields)) {
      if (path.length > 0) declared.set(normalizePath(path), schema);
    }
  }
  return {
    /** @param {string} path */
    knows(path) {
      const normalized = normalizePath(path);
      if (normalized.length === 0) return false;
      if (declared.has(normalized)) return true;
      for (const key of declared.keys()) {
        if (key.startsWith(`${normalized}.`)) return true;
      }
      for (const [key, schema] of declared) {
        if (!normalized.startsWith(`${key}.`)) continue;
        if (descends(schema, normalized.slice(key.length + 1).split("."))) return true;
      }
      return false;
    },
    /** Every declared path, for the message check. */
    paths: declared,
  };
}

/**
 * The paths an expression reads **against the form's own data**, which is not
 * the same list `varPaths` returns and must not be:
 *
 *   · `some`, `all` and `none` re-bind the data to each item, so the `qty` in
 *     `{"some": [{"var":"lines"}, {"<": [{"var":"qty"}, 0]}]}` is a property of
 *     a line, not a field — checking it against the definition's fields would
 *     report correct logic as broken.
 *   · `{"var": ["rate", 0]}` carries a default, which is an author saying in
 *     as many words what happens when the path is absent. That is the opposite
 *     of the silent `undefined` this check exists to find.
 *
 * `varPaths` stays what the compute graph is built from — there it must match
 * the engine's own edges exactly, item scope included.
 *
 * @param {unknown} expr @returns {string[]}
 */
function readPaths(expr) {
  /** @type {string[]} */
  const paths = [];
  /** @param {unknown} node @param {boolean} scoped */
  const walk = (node, scoped) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, scoped);
      return;
    }
    if (!isRecord(node)) return;
    const keys = Object.keys(node);
    if (keys.length !== 1) return;
    const op = keys[0];
    const raw = node[op];
    const args = Array.isArray(raw) ? raw : [raw];

    if (op === "var") {
      if (typeof args[0] === "string") {
        if (!scoped && args.length === 1 && args[0].length > 0) paths.push(args[0]);
        return;
      }
      for (const arg of args) walk(arg, scoped);
      return;
    }
    if (op === "missing" || op === "missing_some") {
      if (!scoped) {
        for (const arg of args.flat()) if (typeof arg === "string") paths.push(arg);
      }
      return;
    }
    if (op === "some" || op === "all" || op === "none") {
      walk(args[0], scoped);
      for (let i = 1; i < args.length; i++) walk(args[i], true);
      return;
    }
    for (const arg of args) walk(arg, scoped);
  };
  walk(expr, false);
  return paths;
}

// ── Folding a condition flat ────────────────────────────────────────────────

/** @type {{ constant: boolean, value: unknown }} */
const NOT_CONSTANT = Object.freeze({ constant: false, value: undefined });

/**
 * Fold an expression to a constant where the data cannot change the answer.
 * `{"or": [true, {"var": "x"}]}` is constant even though it reads a field,
 * because `or` answers before it gets there — which is exactly the class of
 * mistake `rule-unreachable` exists to name.
 *
 * @param {unknown} expr
 * @returns {{ constant: boolean, value: unknown }}
 */
function fold(expr) {
  if (Array.isArray(expr)) {
    /** @type {unknown[]} */
    const values = [];
    for (const item of expr) {
      const folded = fold(item);
      if (!folded.constant) return NOT_CONSTANT;
      values.push(folded.value);
    }
    return { constant: true, value: values };
  }
  if (!isRecord(expr)) return { constant: true, value: expr };

  const keys = Object.keys(expr);
  // Not a single-operator object: `rule-ops` reports it; this is not the
  // check that should also have an opinion.
  if (keys.length !== 1) return NOT_CONSTANT;
  const op = keys[0];
  if (op === "var" || op === "missing" || op === "missing_some") return NOT_CONSTANT;

  const raw = expr[op];
  const args = Array.isArray(raw) ? raw : [raw];
  if (args.length === 0) return NOT_CONSTANT;

  if (op === "and" || op === "or") {
    let last = NOT_CONSTANT;
    for (const arg of args) {
      const folded = fold(arg);
      if (!folded.constant) return NOT_CONSTANT;
      // JSONLogic answers with the deciding value, and it stops there.
      if (op === "and" ? !truthy(folded.value) : truthy(folded.value)) return folded;
      last = folded;
    }
    return last;
  }

  if (op === "if") {
    for (let i = 0; i + 1 < args.length; i += 2) {
      const condition = fold(args[i]);
      if (!condition.constant) return NOT_CONSTANT;
      if (truthy(condition.value)) return fold(args[i + 1]);
    }
    // The trailing odd argument is the else; with none, JSONLogic answers null.
    return args.length % 2 === 1 ? fold(args[args.length - 1]) : { constant: true, value: null };
  }

  for (const arg of args) {
    if (!fold(arg).constant) return NOT_CONSTANT;
  }
  try {
    return { constant: true, value: evaluateLogic(expr, {}) };
  } catch {
    // A definition error in the expression; `rule-ops` is reporting it.
    return NOT_CONSTANT;
  }
}

// ── The lint ────────────────────────────────────────────────────────────────

/** Every logic expression a rule carries, with the key it sits under. */
/** @param {Record<string, unknown>} rule @returns {[string, unknown][]} */
function expressionsOf(rule) {
  /** @type {[string, unknown][]} */
  const out = [];
  if (rule.when !== undefined) out.push(["when", rule.when]);
  if (rule.value !== undefined) out.push(["value", rule.value]);
  if (rule.validate !== undefined && rule.validate !== REMOTE) out.push(["validate", rule.validate]);
  return out;
}

/**
 * @param {Record<string, unknown>[]} rules
 * @param {LintFinding[]} out
 */
function lintComputeCycles(rules, out) {
  const computes = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => typeof rule.compute === "string" && rule.value !== undefined);
  if (computes.length === 0) return;

  const targets = computes.map(({ rule }) => normalizePath(/** @type {string} */ (rule.compute)));
  // The same graph `rules.js` orders the computes with: a compute depends on
  // another when it reads that one's target, its parent or one of its children
  // — and on itself when it reads its own, which is a cycle of one.
  const dependsOn = computes.map(({ rule }) => {
    const reads = varPaths(rule.value).map(normalizePath);
    /** @type {number[]} */
    const edges = [];
    for (let j = 0; j < computes.length; j++) {
      const target = targets[j];
      if (reads.some((read) => read === target || read.startsWith(`${target}.`) || target.startsWith(`${read}.`))) {
        edges.push(j);
      }
    }
    return edges;
  });

  const done = computes.map(() => false);
  let settled = 0;
  let progress = true;
  while (settled < computes.length && progress) {
    progress = false;
    for (let i = 0; i < computes.length; i++) {
      if (done[i] || dependsOn[i].some((j) => !done[j])) continue;
      done[i] = true;
      settled += 1;
      progress = true;
    }
  }
  if (settled === computes.length) return;

  const stuck = computes.filter((_, i) => !done[i]);
  const ids = stuck.map(({ rule }) => `"${String(rule.id)}"`).join(", ");
  for (const { rule, index } of stuck) {
    out.push(error(
      "rule-cycles",
      `rules[${index}]`,
      stuck.length === 1
        ? `the "compute" rule ${ids} reads "${String(rule.compute)}", the value it writes, so it can never settle.`
        : `the "compute" rules ${ids} depend on each other in a cycle, so none of them can run.`,
      { id: typeof rule.id === "string" ? rule.id : undefined },
    ));
  }
}

/**
 * `rule-messages`, whose two halves deserve different severities.
 *
 * A key no rule and no field can address is an **error**: nothing will ever
 * resolve it, so the sentence someone wrote is dead text. A key one locale
 * translates and another does not is a **warning**, because falling back
 * through `messages[defaultLocale]` to the built-in English is documented
 * behaviour and a half-finished translation is a normal state to be in — the
 * corpus has a case pinning exactly that. Unless the locale was **asked for**:
 * `--locales en,ro` is someone saying "these two must be complete", and a
 * request with no teeth is not worth making, so a gap in a requested locale is
 * an error.
 *
 * @param {Record<string, unknown>} definition
 * @param {Record<string, unknown>[]} rules
 * @param {string[]} extraLocales locales named by `--locales`
 * @param {ReturnType<typeof pathOracle>} oracle
 * @param {LintFinding[]} out
 */
function lintMessages(definition, rules, extraLocales, oracle, out) {
  const messages = isRecord(definition.messages) ? definition.messages : {};
  const tables = Object.keys(messages);
  // A definition that customises no sentence has nothing to translate: every
  // message is the built-in English, in every locale, by design. `--locales`
  // asks whether what this definition SAYS is complete, not whether it speaks
  // at all.
  if (tables.length === 0) return;
  /** @type {string[]} */
  const locales = [];
  for (const locale of [...tables, ...extraLocales]) {
    if (!locales.includes(locale)) locales.push(locale);
  }
  if (typeof definition.defaultLocale === "string" && tables.length > 0 &&
      !locales.includes(definition.defaultLocale)) {
    locales.push(definition.defaultLocale);
  }
  if (locales.length === 0) return;

  const ruleIds = new Set(rules.map((rule) => rule.id).filter((id) => typeof id === "string"));
  const ruleNames = new Set([...SHAPE_RULES, ...Object.keys(RULE_MESSAGES), ...ruleIds]);

  /** Does this key address a rule that can actually fire? */
  const addresses = (/** @type {string} */ key) => {
    if (ruleNames.has(key)) return true;
    const dot = key.lastIndexOf(".");
    if (dot <= 0) return false;
    const path = key.slice(0, dot);
    const rule = key.slice(dot + 1);
    if (!ruleNames.has(rule)) return false;
    if (oracle.knows(path)) return true;
    // A rule's own `path` need not be a declared field — a form-level check
    // reports under it just the same, and a message may address that.
    return rules.some((entry) => typeof entry.path === "string" && normalizePath(entry.path) === normalizePath(path));
  };

  /** Every key any table declares, in first-seen order. */
  /** @type {string[]} */
  const keys = [];
  for (const locale of tables) {
    const table = /** @type {Record<string, unknown>} */ (messages[locale]);
    if (!isRecord(table)) continue;
    for (const key of Object.keys(table)) {
      if (!keys.includes(key)) keys.push(key);
      if (!addresses(key)) {
        out.push(error(
          "rule-messages",
          `messages.${locale}.${key}`,
          `the message key "${key}" addresses no field and no rule, so nothing can ever resolve it.`,
        ));
      }
    }
  }

  for (const locale of locales) {
    const asked = extraLocales.includes(locale);
    const gap = asked ? error : warning;
    const table = messages[locale];
    if (!isRecord(table)) {
      out.push(gap(
        "rule-messages",
        `messages.${locale}`,
        `"${locale}" is a ${asked ? "requested" : "declared"} locale with no message table${
          locale === definition.defaultLocale ? " and it is the defaultLocale" : ""
        }, so every message falls back to the built-in English.`,
      ));
      continue;
    }
    for (const key of keys) {
      if (typeof table[key] !== "string") {
        out.push(gap(
          "rule-messages",
          `messages.${locale}`,
          `the "${locale}" table has no "${key}", which another locale translates.`,
        ));
      }
    }
  }
}

/**
 * Every `pattern` a field schema carries, and every literal `regex` operand,
 * read for the backtracking shapes `pattern.js` describes. A catastrophic one
 * is an **error** — `compile` refuses it, so nothing would ever run the
 * definition — and is reported here, under the rule that owns the bytes, so it
 * is named even beside other errors. The milder nested shape is a **warning**:
 * usually fine, occasionally slow, and worth a second look before a definition
 * someone else wrote goes live.
 *
 * @param {Record<string, unknown>} definition
 * @param {Record<string, unknown>[]} rules
 * @param {LintFinding[]} out
 */
function lintPatterns(definition, rules, out) {
  /** @param {string} pattern @param {string} rule @param {string} at @param {string} what @param {string} [id] */
  const judge = (pattern, rule, at, what, id) => {
    const risk = patternRisk(pattern);
    if (risk === "catastrophic" && rule === "schema") {
      out.push(error(rule, at, catastrophicMessage(what), { id }));
    } else if (risk === "nested") {
      out.push(warning(rule, at, nestedMessage(what), { id }));
    }
  };

  /** @param {unknown} schema @param {string} at */
  const walkField = (schema, at) => {
    if (!isRecord(schema)) return;
    if (typeof schema.pattern === "string") judge(schema.pattern, "schema", `${at}.pattern`, `"pattern" at ${at}`);
    if (schema.items !== undefined) walkField(schema.items, `${at}[]`);
    if (isRecord(schema.properties)) {
      for (const [name, child] of Object.entries(schema.properties)) walkField(child, `${at}.${name}`);
    }
  };
  if (isRecord(definition.fields)) {
    for (const [path, schema] of Object.entries(definition.fields)) walkField(schema, `fields.${path}`);
  }

  // A catastrophic `regex` is already a `rule-ops` error — `assertLogic`
  // refuses it — so only the warning is added here.
  rules.forEach((rule, index) => {
    const id = typeof rule.id === "string" ? rule.id : undefined;
    for (const [key, expr] of expressionsOf(rule)) {
      /** @param {unknown} node */
      const walk = (node) => {
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (!isRecord(node)) return;
        for (const [op, raw] of Object.entries(node)) {
          const args = Array.isArray(raw) ? raw : [raw];
          if (op === "regex" && typeof args[0] === "string") {
            judge(args[0], "rule-ops", `rules[${index}].${key}`, `the "regex" pattern at rules[${index}].${key}`, id);
          }
          args.forEach(walk);
        }
      };
      walk(expr);
    }
  });
}

/**
 * A definition is embedded in a page as `<script type="application/json">`,
 * which is raw text: `</script` inside any string in it ends the element early
 * and hands the rest of the definition to the HTML parser, and `<!--` switches
 * the script into an escaped state where a later `</script>` is not the end.
 * Both are only safe when every `<` is written `\u003c` — which
 * `@faqir-ui/forms` does, and which a hand-embedded definition has to do too.
 * One warning, at the first string that needs it.
 *
 * @param {unknown} definition
 * @param {LintFinding[]} out
 */
function lintEmbedding(definition, out) {
  /** @param {string} text */
  const breaks = (text) => /<\/script|<!--/i.test(text);
  /** @param {unknown} node @param {string} at @returns {string | null} */
  const find = (node, at) => {
    if (typeof node === "string") return breaks(node) ? at : null;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const hit = find(node[i], `${at}[${i}]`);
        if (hit !== null) return hit;
      }
      return null;
    }
    if (!isRecord(node)) return null;
    for (const [key, value] of Object.entries(node)) {
      const where = at ? `${at}.${key}` : key;
      if (breaks(key)) return where;
      const hit = find(value, where);
      if (hit !== null) return hit;
    }
    return null;
  };
  const hit = find(definition, "");
  if (hit !== null) {
    out.push(warning(
      "schema",
      hit,
      'this contains "</script" or "<!--", which ends or derails a <script type="application/json"> ' +
        "that embeds the definition as written; escape every < as \\u003c when you embed it " +
        "(@faqir-ui/forms does).",
    ));
  }
}

/**
 * Lint a definition: the shape, then the six things a shape cannot say.
 *
 * @param {unknown} definition
 * @param {{ locales?: string[] }} [options] locales that must be complete, on
 *   top of the ones `messages` declares
 * @returns {LintReport}
 */
export function lintDefinition(definition, options) {
  /** @type {LintFinding[]} */
  const schemaFindings = validateDefinition(definition).findings;
  /** @type {LintFinding[]} */
  const specific = [];
  /** Rule positions a specific check has already spoken about. @type {Set<string>} */
  const claimed = new Set();

  const rules = isRecord(definition) && Array.isArray(definition.rules)
    ? definition.rules.filter(isRecord)
    : [];
  const usable = isRecord(definition) &&
    (definition.fields === undefined || isRecord(definition.fields)) &&
    (definition.rules === undefined || Array.isArray(definition.rules));

  if (usable) {
    const oracle = pathOracle(definition);
    const computeTargets = new Set(
      rules.filter((rule) => typeof rule.compute === "string")
        .map((rule) => normalizePath(/** @type {string} */ (rule.compute))),
    );
    /** @param {string} path */
    const known = (path) => oracle.knows(path) || computeTargets.has(normalizePath(path));

    for (let index = 0; index < rules.length; index++) {
      const rule = rules[index];
      const at = `rules[${index}]`;
      const id = typeof rule.id === "string" ? rule.id : undefined;
      const verbs = verbsOf(rule);

      if (verbs.length !== 1) {
        claimed.add(at);
        specific.push(error(
          "rule-verb",
          at,
          verbs.length === 0
            ? `this rule has no verb (one of ${RULE_VERBS.join(", ")}), so it does nothing.`
            : `this rule has ${verbs.length} verbs (${verbs.join(", ")}); a rule does one thing.`,
          { id },
        ));
        continue;
      }
      const verb = verbs[0];

      // rule-ops — one finding per expression: `assertLogic` is the evaluator's
      // own reading of the subset, so the lint cannot drift from what will run.
      let operatorsOk = true;
      for (const [key, expr] of expressionsOf(rule)) {
        try {
          assertLogic(expr, `${at}.${key}`);
        } catch (thrown) {
          operatorsOk = false;
          claimed.add(at);
          specific.push(error(
            "rule-ops",
            `${at}.${key}`,
            thrown instanceof DefinitionError
              ? thrown.message.replace(/^@faqir-ui\/rules: /, "")
              : String(thrown),
            { id },
          ));
        }
      }

      // rule-refs — the verb's own target, then everything its logic reads.
      const target = typeof rule[verb] === "string" ? /** @type {string} */ (rule[verb]) : undefined;
      if ((verb === "show" || verb === "require") && target !== undefined && !known(target)) {
        specific.push(error(
          "rule-refs",
          `${at}.${verb}`,
          `"${verb}" names "${target}", which no field declares — the rule can never change anything.`,
          { id },
        ));
      }
      if (verb === "compute" && target !== undefined && !oracle.knows(target)) {
        specific.push(warning(
          "rule-refs",
          `${at}.compute`,
          `"compute" writes "${target}", which no field declares, so nothing validates the value it produces.`,
          { id },
        ));
      }
      if (verb === "validate" && typeof rule.path === "string" && !known(rule.path)) {
        specific.push(warning(
          "rule-refs",
          `${at}.path`,
          `"path" names "${rule.path}", which no field declares: a server can report this check, but a page has no field-group to show it on.`,
          { id },
        ));
      }
      if (operatorsOk) {
        for (const [key, expr] of expressionsOf(rule)) {
          /** @type {string[]} */
          const seen = [];
          for (const read of readPaths(expr)) {
            if (seen.includes(read) || known(read)) continue;
            seen.push(read);
            specific.push(error(
              "rule-refs",
              `${at}.${key}`,
              `this reads "${read}", which no field declares and no rule computes — it will always be undefined.`,
              { id },
            ));
          }
        }
      }

      // rule-unreachable — a condition the data cannot influence.
      if (!operatorsOk) continue;
      for (const [key, expr] of expressionsOf(rule)) {
        if (key === "value") continue; // a constant `compute` is a default, not a mistake
        const folded = fold(expr);
        if (!folded.constant) continue;
        const always = truthy(folded.value);
        const sentence = key === "validate"
          ? (always
            ? "this check is constant and passes, so it can never report anything."
            : "this check is constant and fails, so it reports on every submission.")
          : (always
            ? `"when" folds to a constant true, so this "${verb}" always applies and the condition is doing nothing.`
            : `"when" folds to a constant false, so this "${verb}" never applies.`);
        specific.push(warning("rule-unreachable", `${at}.${key}`, sentence, { id }));
      }
    }

    lintComputeCycles(rules, specific);
    lintPatterns(/** @type {Record<string, unknown>} */ (definition), rules, specific);
    lintMessages(
      /** @type {Record<string, unknown>} */ (definition),
      rules,
      options?.locales ?? [],
      oracle,
      specific,
    );
  }

  // Whatever `compile` refuses, the lint must have said something about: a
  // definition nothing will run is never "clean". Its remaining complaints —
  // an unknown format, an uncompilable pattern, a `required` naming nothing —
  // are shape, which is what `schema` means.
  const kept = schemaFindings.filter((finding) => {
    for (const prefix of claimed) {
      if (finding.path === prefix || finding.path.startsWith(`${prefix}.`)) return false;
    }
    return true;
  });
  const findings = [...kept, ...specific];
  lintEmbedding(definition, findings);
  if (!findings.some((finding) => finding.severity === "error")) {
    try {
      compile(definition);
    } catch (thrown) {
      findings.push(error(
        "schema",
        thrown instanceof DefinitionError && thrown.path ? thrown.path : "",
        thrown instanceof DefinitionError
          ? thrown.message.replace(/^@faqir-ui\/rules: /, "")
          : String(thrown),
      ));
    }
  }

  const counts = { error: 0, warning: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return { ok: counts.error === 0, counts, findings };
}
