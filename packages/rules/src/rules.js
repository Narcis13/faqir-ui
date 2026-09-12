/**
 * @faqir-ui/rules — the rules engine. [1.1B-02 · §8.2]
 *
 * Imports its siblings and nothing else. The shape validator answers "is this
 * value well formed"; this module answers the questions a *form* asks, which
 * are all about the other fields: is this one even on screen, is it required
 * today, does it agree with the one above it, what is it worth, and which page
 * comes next.
 *
 * ── The verbs ───────────────────────────────────────────────────────────────
 *
 * Every rule carries an `id` — unique, and the key a message is addressed to —
 * and exactly one verb:
 *
 *   { id, show:     "<path>",  when: <logic> }     visibility
 *   { id, require:  "<path>",  when: <logic> }     conditional requiredness
 *   { id, validate: <logic>,   path, message }     cross-field check
 *   { id, validate: "remote",  path, remote, message }
 *   { id, compute:  "<path>",  value: <logic> }    derived value
 *   { id, jump:     "<pageId>", from: "<pageId>", when }
 *
 * A rule with no verb, two verbs, an unknown key, a missing `when` or a
 * duplicate `id` is a `DefinitionError`. None of them is ignored: a rule that
 * quietly does nothing is the worst outcome available here, because the form
 * still submits and the field it was guarding was never checked.
 *
 * ── The order everything runs in ────────────────────────────────────────────
 *
 *   1. `compute`, in dependency order (a cycle is a definition error), each
 *      value written into the data the rest of the pass reads — so a computed
 *      total can be validated and can drive a `show`.
 *   2. `show`, then `require`. Several `show` rules on one path AND together
 *      (any rule may hide it); several `require` rules OR (any may demand it).
 *      A hidden field is never required.
 *   3. Shape validation, over the computed data, with the requiredness step 2
 *      decided folded into the definition's own.
 *   4. Findings about hidden fields — and about anything nested inside them —
 *      are dropped. A field nobody can see cannot be wrong.
 *   5. `validate` rules, in document order, appended after the shape findings.
 *   6. `jump`, whose answers land in `next` as `{ <from>: <to> }`: the first
 *      rule whose `when` holds wins for a given `from`.
 *
 * A cross-field `validate` rule is skipped when its `path` names a declared
 * field whose value is blank. "Is the end date after the start date" has no
 * answer without an end date, and `required` is the rule that should be
 * complaining. A rule whose `path` is *not* a declared field (a form-level
 * check, a section) always runs — nothing else is speaking for it.
 *
 * ── Remote rules ────────────────────────────────────────────────────────────
 *
 * `{ validate: "remote" }` needs the network, which this package will never
 * touch. It runs only through `validateAsync(def, data, { remote })`, where
 * `remote(rule, value, data)` returns `true`, `false`, a message string, or a
 * promise of one of those — the browser plugin implements it with `fetch`, a
 * server with a database read. A rejected resolver is a finding under
 * `remote-error`, never a pass.
 *
 * Sync `validate` cannot run them, and does not pretend to: their ids come back
 * in the verdict's `pending`, and a verdict with anything pending is not
 * `valid`. That is the difference between "this data is good" and "nothing has
 * told me it is bad yet", and every other design for it we tried made the
 * second look like the first.
 */

import { DefinitionError } from "./errors.js";
import { runLogic, truthy, varPaths, assertLogic } from "./logic.js";
import { RULE_MESSAGES, resolveMessage } from "./messages.js";
import {
  compile as compileShape,
  getPath,
  isMissing,
  normalizePath,
  shapeFindings,
} from "./shape.js";

/** The five verbs. `validate` covers both the logic and the remote form. */
export const RULE_VERBS = Object.freeze(["show", "require", "validate", "compute", "jump"]);

/** `validate: "remote"` is the one reserved string; anything else is logic. */
export const REMOTE = "remote";

/** The closed key set per verb — anything else in a rule is a definition error. */
/** @type {Record<string, string[]>} */
const RULE_KEYS = {
  show: ["id", "show", "when"],
  require: ["id", "require", "when"],
  validate: ["id", "validate", "path", "message", "remote"],
  compute: ["id", "compute", "value"],
  jump: ["id", "jump", "from", "when"],
};

/**
 * @typedef {object} CompiledRule
 * @property {string} id
 * @property {string} verb
 * @property {string} path the field or page the verb acts on
 * @property {unknown} [when] `show`, `require`, `jump`
 * @property {unknown} [logic] a cross-field `validate`
 * @property {unknown} [value] a `compute`
 * @property {string} [message] the rule's own sentence
 * @property {string} [remote] the resolver's url or name
 * @property {string} [from] a `jump`'s source page
 * @property {boolean} [isRemote]
 */

/**
 * @typedef {object} Finding
 * @property {string} path
 * @property {string} rule
 * @property {string} message
 * @property {Record<string, unknown>} params
 */

/**
 * @typedef {object} Verdict
 * @property {boolean} valid
 * @property {Finding[]} findings
 * @property {Record<string, unknown>} computed values the `compute` verbs produced
 * @property {Record<string, boolean>} visible what the `show` verbs decided
 * @property {Record<string, boolean>} required what the `require` verbs decided
 * @property {Record<string, string>} next `{ <fromPage>: <toPage> }` from the `jump` verbs
 * @property {string[]} pending ids of remote rules that have not run
 */

/**
 * Compiled verbs, memoised against the `CompiledDefinition` they came from — in
 * document order, and with the computes pre-sorted into the order they must run
 * in, which is a property of the definition and never of the data. A WeakMap
 * rather than a field on the class: `shape.js` knows nothing about verbs, and
 * this keeps the module graph pointing one way.
 */
/** @typedef {{ all: CompiledRule[], computes: CompiledRule[] }} CompiledRules */
/** @type {WeakMap<object, CompiledRules>} */
const COMPILED_RULES = new WeakMap();

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {string} path @returns {string[]} */
function splitPath(path) {
  return normalizePath(path).split(".").filter((segment) => segment.length > 0);
}

/** @param {unknown} value @param {string} key @param {string} where @returns {string} */
function requireString(value, key, where) {
  if (typeof value !== "string" || value.length === 0) {
    throw new DefinitionError(`"${key}" at ${where} must be a non-empty string.`, where);
  }
  return value;
}

/**
 * Compile one rule: find its verb, refuse anything the verb does not accept,
 * and check its logic now rather than at the first keystroke that reaches it.
 *
 * @param {unknown} raw
 * @param {number} index
 * @param {Map<string, unknown>} fields the declared fields, for `require`
 * @returns {CompiledRule}
 */
function compileRule(raw, index, fields) {
  const at = `rules[${index}]`;
  if (!isRecord(raw)) {
    throw new DefinitionError(`the rule at ${at} must be an object.`, at);
  }
  const id = requireString(raw.id, "id", at);
  const where = `rules[${index}] ("${id}")`;

  const verbs = RULE_VERBS.filter((verb) => raw[verb] !== undefined);
  if (verbs.length === 0) {
    throw new DefinitionError(
      `the rule at ${where} has no verb (one of ${RULE_VERBS.join(", ")}).`,
      where,
    );
  }
  if (verbs.length > 1) {
    throw new DefinitionError(
      `the rule at ${where} has ${verbs.length} verbs (${verbs.join(", ")}); a rule does one thing.`,
      where,
    );
  }
  const verb = verbs[0];
  const allowed = RULE_KEYS[verb];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      throw new DefinitionError(
        `unsupported key "${key}" at ${where} (a "${verb}" rule accepts ${allowed.join(", ")}).`,
        where,
      );
    }
  }

  if (verb === "show" || verb === "require") {
    const path = normalizePath(requireString(raw[verb], verb, where));
    if (raw.when === undefined) {
      throw new DefinitionError(
        `"${verb}" at ${where} needs a "when" condition; a rule with no condition never changes anything.`,
        where,
      );
    }
    // A `require` has to be able to produce a finding, and only a declared
    // field can: requiring a path the shape validator never visits is a rule
    // that does nothing, which is the failure this package refuses to have.
    if (verb === "require" && !fields.has(path)) {
      throw new DefinitionError(
        `"require" at ${where} names "${path}", which is not a key of "fields".`,
        where,
      );
    }
    assertLogic(raw.when, where);
    return { id, verb, path, when: raw.when };
  }

  if (verb === "compute") {
    const path = normalizePath(requireString(raw.compute, "compute", where));
    if (raw.value === undefined) {
      throw new DefinitionError(`"compute" at ${where} needs a "value" expression.`, where);
    }
    assertLogic(raw.value, where);
    return { id, verb, path, value: raw.value };
  }

  if (verb === "jump") {
    const to = requireString(raw.jump, "jump", where);
    const from = requireString(raw.from, "from", where);
    if (raw.when !== undefined) assertLogic(raw.when, where);
    return { id, verb, path: to, from, when: raw.when };
  }

  // `validate`, in its two forms.
  const path = normalizePath(requireString(raw.path, "path", where));
  const message = raw.message === undefined ? undefined : requireString(raw.message, "message", where);
  if (raw.validate === REMOTE) {
    const remote = requireString(raw.remote, "remote", where);
    return { id, verb, path, message, remote, isRemote: true };
  }
  if (raw.remote !== undefined) {
    throw new DefinitionError(
      `"remote" at ${where} only belongs to a rule whose "validate" is ${JSON.stringify(REMOTE)}.`,
      where,
    );
  }
  assertLogic(raw.validate, where);
  return { id, verb, path, message, logic: raw.validate };
}

/**
 * Order the `compute` rules so that each runs after everything it reads.
 *
 * The graph is built from the literal `var` paths inside each `value`: a
 * compute depends on another when it reads that one's target, the target's
 * parent or one of its children — `total` reading `line.qty` depends on a
 * compute writing `line`. Ties are broken by document order, so the order is a
 * property of the definition rather than of the traversal.
 *
 * @param {CompiledRule[]} computes
 * @returns {CompiledRule[]}
 */
function orderComputes(computes) {
  if (computes.length < 2) return computes.slice();

  const targets = computes.map((rule) => rule.path);
  /** @type {number[][]} */
  const dependsOn = computes.map(() => []);
  for (let i = 0; i < computes.length; i++) {
    const reads = varPaths(computes[i].value).map(normalizePath);
    for (let j = 0; j < computes.length; j++) {
      if (i === j) continue;
      const target = targets[j];
      const touches = reads.some((read) =>
        read === target || read.startsWith(`${target}.`) || target.startsWith(`${read}.`));
      if (touches) dependsOn[i].push(j);
    }
  }

  /** @type {CompiledRule[]} */
  const ordered = [];
  const done = computes.map(() => false);
  let progress = true;
  while (ordered.length < computes.length && progress) {
    progress = false;
    for (let i = 0; i < computes.length; i++) {
      if (done[i] || dependsOn[i].some((j) => !done[j])) continue;
      done[i] = true;
      ordered.push(computes[i]);
      progress = true;
    }
  }
  if (ordered.length < computes.length) {
    const stuck = computes.filter((_, i) => !done[i]).map((rule) => rule.id);
    throw new DefinitionError(
      `the "compute" rules ${stuck.map((id) => `"${id}"`).join(", ")} depend on each other in a cycle.`,
      "rules",
    );
  }
  return ordered;
}

/**
 * Compile a definition, verbs included. Idempotent, and the rule half is
 * memoised — handing the same `CompiledDefinition` back in is free.
 *
 * @param {unknown} definition
 * @returns {import("./shape.js").CompiledDefinition}
 */
export function compile(definition) {
  const compiled = compileShape(definition);
  if (!COMPILED_RULES.has(compiled)) {
    const rules = compiled.rules.map((raw, index) => compileRule(raw, index, compiled.fields));
    /** @type {Set<string>} */
    const ids = new Set();
    for (const rule of rules) {
      if (ids.has(rule.id)) {
        throw new DefinitionError(
          `two rules share the id "${rule.id}"; ids address messages, so they must be unique.`,
          "rules",
        );
      }
      ids.add(rule.id);
    }
    // Ordering runs at compile time, so that a cycle is reported when the
    // definition is read rather than on the first submission that hits it —
    // and so that no later pass pays for the sort again.
    const computes = orderComputes(rules.filter((rule) => rule.verb === "compute"));
    COMPILED_RULES.set(compiled, { all: rules, computes });
  }
  return compiled;
}

/** @param {import("./shape.js").CompiledDefinition} compiled @returns {CompiledRules} */
function rulesOf(compiled) {
  return COMPILED_RULES.get(compiled) ?? { all: [], computes: [] };
}

/**
 * Write `value` at `path` without touching the caller's data: every level along
 * the way is copied. A rules pass is a pure function of its inputs, and a
 * caller that validates twice must get the same answer both times.
 *
 * @param {unknown} target @param {string[]} segments @param {unknown} value @returns {unknown}
 */
function setIn(target, segments, value) {
  const [head, ...rest] = segments;
  const nextIsIndex = rest.length > 0 && /^\d+$/.test(rest[0]);
  if (Array.isArray(target)) {
    const copy = target.slice();
    const index = Number(head);
    copy[index] = rest.length === 0 ? value : setIn(copy[index], rest, value);
    return copy;
  }
  if (target === undefined || target === null) {
    if (/^\d+$/.test(head)) {
      /** @type {unknown[]} */
      const list = [];
      list[Number(head)] = rest.length === 0 ? value : setIn(nextIsIndex ? [] : {}, rest, value);
      return list;
    }
  }
  /** @type {Record<string, unknown>} */
  const copy = isRecord(target) ? { ...target } : {};
  copy[head] = rest.length === 0 ? value : setIn(copy[head], rest, value);
  return copy;
}

/**
 * Is `path`, or anything it sits inside, hidden?
 *
 * @param {Record<string, boolean>} visible @param {string} path @returns {boolean}
 */
function isHidden(visible, path) {
  if (visible[path] === false) return true;
  const segments = splitPath(path);
  for (let i = 1; i < segments.length; i++) {
    if (visible[segments.slice(0, i).join(".")] === false) return true;
  }
  return false;
}

/**
 * Run the verbs. Returns the maps plus the data the computes produced, which is
 * what the rest of `validate` judges.
 *
 * @param {import("./shape.js").CompiledDefinition} compiled
 * @param {unknown} data
 */
function runRules(compiled, data) {
  const { all: rules, computes } = rulesOf(compiled);
  /** @type {Record<string, unknown>} */
  const computed = {};
  /** @type {Record<string, boolean>} */
  const visible = {};
  /** @type {Record<string, boolean>} */
  const required = {};
  /** @type {Record<string, string>} */
  const next = {};

  let current = data;
  for (const rule of computes) {
    const value = runLogic(rule.value, current);
    computed[rule.path] = value;
    current = setIn(current, splitPath(rule.path), value);
  }

  for (const rule of rules) {
    if (rule.verb === "show") {
      const shown = truthy(runLogic(rule.when, current));
      visible[rule.path] = (visible[rule.path] ?? true) && shown;
    }
  }
  for (const rule of rules) {
    if (rule.verb === "require") {
      const demanded = truthy(runLogic(rule.when, current));
      required[rule.path] = (required[rule.path] ?? false) || demanded;
    }
  }
  for (const path of Object.keys(required)) {
    if (isHidden(visible, path)) required[path] = false;
  }
  for (const rule of rules) {
    if (rule.verb !== "jump") continue;
    const from = /** @type {string} */ (rule.from);
    if (Object.prototype.hasOwnProperty.call(next, from)) continue;
    if (rule.when === undefined || truthy(runLogic(rule.when, current))) next[from] = rule.path;
  }

  return { computed, visible, required, next, data: current, rules };
}

/**
 * What the verbs decide for `data`, without validating anything: `visible`,
 * `required`, `computed` and `next`. The plugin calls this on every input to
 * repaint the form; `validate` calls it and then judges the values.
 *
 * @param {unknown} definition
 * @param {unknown} data
 * @returns {{ visible: Record<string, boolean>, required: Record<string, boolean>,
 *            computed: Record<string, unknown>, next: Record<string, string> }}
 */
export function evaluate(definition, data) {
  const state = runRules(compile(definition), data);
  return {
    visible: state.visible,
    required: state.required,
    computed: state.computed,
    next: state.next,
  };
}

/**
 * Does this `validate` rule have anything to say about the current data?
 *
 * @param {CompiledRule} rule
 * @param {import("./shape.js").CompiledDefinition} compiled
 * @param {Record<string, boolean>} visible
 * @param {unknown} data
 */
function applies(rule, compiled, visible, data) {
  if (isHidden(visible, rule.path)) return false;
  if (compiled.fields.has(rule.path) && isMissing(getPath(data, rule.path))) return false;
  return true;
}

/**
 * @param {import("./shape.js").CompiledDefinition} compiled
 * @param {CompiledRule} rule
 * @param {string} ruleName the finding's `rule` — the id, or `remote-error`
 * @param {string | undefined} locale
 * @param {Record<string, unknown>} params
 * @param {string} [override] a sentence the resolver handed back
 * @returns {Finding}
 */
function ruleFinding(compiled, rule, ruleName, locale, params, override) {
  return {
    path: rule.path,
    rule: ruleName,
    message: override ?? resolveMessage({
      messages: compiled.messages,
      locale,
      defaultLocale: compiled.defaultLocale,
      path: rule.path,
      rule: ruleName,
      params: { path: rule.path, ...params },
      // The rule's own sentence sits under the definition's `messages` tables
      // and over the generic one. A `remote-error` keeps its built-in: the
      // rule's `message` describes a value that failed the check, which is not
      // what happened.
      fallback: ruleName === "remote-error" ? RULE_MESSAGES["remote-error"] : (rule.message ?? RULE_MESSAGES.rule),
    }),
    params,
  };
}

/**
 * The verdict for `data` under `definition`: shape, then visibility, then the
 * cross-field rules.
 *
 * Remote rules cannot run here. Their ids come back in `pending`, and a verdict
 * with anything pending is not `valid` — use `validateAsync` to finish it.
 *
 * @param {unknown} definition a definition, or the result of `compile`
 * @param {unknown} data
 * @param {{ locale?: string }} [options]
 * @returns {Verdict}
 */
export function validate(definition, data, options) {
  const compiled = compile(definition);
  const locale = options?.locale;
  const state = runRules(compiled, data);

  /** @type {Set<string>} */
  const required = new Set();
  for (const [path, demanded] of Object.entries(state.required)) {
    if (demanded) required.add(path);
  }

  const findings = shapeFindings(compiled, state.data, { locale, required })
    .filter((finding) => !isHidden(state.visible, finding.path));

  /** @type {string[]} */
  const pending = [];
  for (const rule of state.rules) {
    if (rule.verb !== "validate") continue;
    if (!applies(rule, compiled, state.visible, state.data)) continue;
    if (rule.isRemote) {
      pending.push(rule.id);
      continue;
    }
    if (!truthy(runLogic(rule.logic, state.data))) {
      findings.push(ruleFinding(compiled, rule, rule.id, locale, {}));
    }
  }

  return {
    valid: findings.length === 0 && pending.length === 0,
    findings,
    computed: state.computed,
    visible: state.visible,
    required: state.required,
    next: state.next,
    pending,
  };
}

/**
 * `validate`, with the remote rules resolved.
 *
 * `remote(rule, value, data)` is the caller's — `fetch` in the browser plugin,
 * a query on a server. It answers `true`, `false`, a message string, or a
 * promise of one of those. Anything else, including a rejection, is a finding
 * under `remote-error`: a check that could not run never passes.
 *
 * The resolvers run concurrently, but the findings come out in rule order, so
 * two runs of the same data read the same however the network behaved.
 *
 * @param {unknown} definition
 * @param {unknown} data
 * @param {{ locale?: string, remote?: (rule: { id: string, path: string, remote: string, message?: string }, value: unknown, data: unknown) => unknown }} [options]
 * @returns {Promise<Verdict>}
 */
export async function validateAsync(definition, data, options) {
  const verdict = validate(definition, data, options);
  if (verdict.pending.length === 0) return verdict;

  const resolver = options?.remote;
  if (typeof resolver !== "function") {
    throw new DefinitionError(
      `this definition has remote rules (${verdict.pending.map((id) => `"${id}"`).join(", ")}) ` +
        "but validateAsync was given no `remote` resolver.",
      "rules",
    );
  }

  const compiled = compile(definition);
  const locale = options?.locale;
  const state = runRules(compiled, data);
  const pendingSet = new Set(verdict.pending);
  const remoteRules = state.rules.filter((rule) => rule.isRemote && pendingSet.has(rule.id));

  const answers = await Promise.allSettled(remoteRules.map((rule) => {
    const view = {
      id: rule.id,
      path: rule.path,
      remote: /** @type {string} */ (rule.remote),
      message: rule.message,
    };
    // A resolver that throws synchronously is a rejected promise here, and
    // lands in the same `remote-error` branch as one that rejects later.
    return (async () => resolver(view, getPath(state.data, rule.path), state.data))();
  }));

  const findings = verdict.findings.slice();
  for (let i = 0; i < remoteRules.length; i++) {
    const rule = remoteRules[i];
    const answer = answers[i];
    const params = { remote: rule.remote };
    if (answer.status === "rejected") {
      findings.push(ruleFinding(compiled, rule, "remote-error", locale, params));
      continue;
    }
    if (answer.value === true) continue;
    if (typeof answer.value === "string") {
      findings.push(ruleFinding(compiled, rule, rule.id, locale, params, answer.value));
      continue;
    }
    if (answer.value === false) {
      findings.push(ruleFinding(compiled, rule, rule.id, locale, params));
      continue;
    }
    // Neither a verdict nor a message: the resolver broke its contract. Saying
    // "could not check" is the only honest reading, and it is not a pass.
    findings.push(ruleFinding(compiled, rule, "remote-error", locale, params));
  }

  return {
    valid: findings.length === 0,
    findings,
    computed: verdict.computed,
    visible: verdict.visible,
    required: verdict.required,
    next: verdict.next,
    pending: [],
  };
}
