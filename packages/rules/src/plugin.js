// @ui:plugin faqir-rules
// @ui:provides l-rules, $rules
/**
 * faqir-rules — a form's conditional logic, from one JSON definition. [1.1B-04 · §8.3]
 * The browser half of `@faqir-ui/rules`: the same evaluator a server runs.
 *
 *   <script type="application/json" id="signup-rules">
 *     { "version": "1",
 *       "fields": { "plan": { "type": "string" }, "seats": { "type": "integer" } },
 *       "rules": [{ "id": "seats-for-teams", "show": "seats",
 *                   "when": { "==": [{ "var": "plan" }, "team"] } }] }
 *   </script>
 *   <form l-validate l-rules="#signup-rules"> … </form>
 *
 * On init and on every `input`/`change`, the form's own `FormData` is coerced
 * through the definition and handed to `evaluate`, and the answer is applied to
 * the DOM: a hidden field's `[data-ui="field-group"]` takes `hidden` and its
 * controls take `disabled`, so it neither validates nor submits; `require`
 * toggles `required` + `aria-required`; `compute` writes its value into the
 * scope and into any control of that name; and `jump` lands in `$rules.next`
 * for a wizard to read. Cross-field and remote `validate` rules are registered
 * through `Faqir.validate.register`, so they run at faqir-validate's moments,
 * with faqir-validate's messages and its `validating` state — this plugin owns
 * no message and paints no error of its own.
 *
 * ── The definition ──────────────────────────────────────────────────────────
 *   `l-rules="#id"` (any selector — `#`, `.`, `[`) reads a
 *   `<script type="application/json">`; anything else is an expression
 *   evaluated in the form's scope, so `l-rules="rulesDef"` takes the object (or
 *   JSON string) a page already has. The definition is compiled once, at bind.
 *
 * ── Remote rules ────────────────────────────────────────────────────────────
 *   `{ "id": …, "validate": "remote", "path": "email", "remote": "/api/check" }`
 *   becomes an async validator that POSTs `{ path, value, data }` and expects
 *   `{ ok: boolean, message?: string }`. Anything else — a non-2xx, a body that
 *   is not JSON, a network failure — is a failed check wearing faqir-validate's
 *   built-in sentence, never a silent pass.
 *
 * ── Nothing fails quietly ───────────────────────────────────────────────────
 *   An `l-rules` that resolves to nothing, a definition the package refuses (an
 *   unknown operator, a compute cycle), a rule naming a field the form has no
 *   control for, a form with no `l-validate`, and a missing faqir-validate are
 *   each reported: in full through the dev engine's diagnostics, and tersely on
 *   `console.warn` in production, where that seam says nothing.
 *
 * Self-registers via `Faqir.plugin` when a global `Faqir` is present (load it
 * after faqir-core and after faqir-validate) and exports `install` for bundlers
 * as `@faqir-ui/rules/plugin`. GENERATED into `registry/core/plugins/` by
 * `bun run build:rules-plugin`: the evaluator is `@faqir-ui/rules` itself,
 * bundled in, so the verdict in the page is the verdict on the server by
 * construction rather than by agreement. Zero dependencies. The only attributes
 * it owns are `hidden` on a field-group, `disabled` / `required` /
 * `aria-required` on a control it was told to own, and a computed control's
 * `value` — the frozen five-attribute protocol is untouched.
 */
import { coerce, compile, evaluate, validate } from "./index.js";

/** @typedef {import("./index.js").CompiledDefinition} CompiledDefinition */
/** @typedef {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} Control */

/**
 * The slice of faqir-core this plugin uses, declared rather than imported: the
 * package depends on nothing, the engine included.
 *
 * @typedef {object} Engine
 * @property {(target: Record<string, unknown>) => Record<string, unknown>} reactive
 * @property {(expression: string, scope: unknown, el: unknown) => unknown} evaluate
 * @property {(name: string, callback: (el: unknown, scope: unknown) => unknown) => void} magic
 * @property {(name: string, handler: (el: any, dir: { expression?: string }, scope: any) => void) => void} directive
 * @property {{ report?: (message: string, el?: unknown) => boolean }} [devtools]
 * @property {{ register: (form: unknown, field: string, name: string,
 *              fn: (value: unknown, ctx: unknown) => unknown, message?: string) => unknown }} [validate]
 */

/**
 * One rule, as authored. `compile()` has already refused every shape this does
 * not describe, so the fields read here are the fields that survived it.
 *
 * @typedef {object} RawRule
 * @property {string} id
 * @property {string} [show]
 * @property {string} [require]
 * @property {string} [compute]
 * @property {string} [jump]
 * @property {unknown} [validate] a logic expression, or the string "remote"
 * @property {string} [path] the field a `validate` rule speaks for
 * @property {string} [remote] the url a remote rule POSTs to
 * @property {string} [message]
 */

/**
 * What one bound form needs to answer a keystroke.
 *
 * @typedef {object} FormContext
 * @property {CompiledDefinition} definition
 * @property {any} scope the reactive scope the form sits in
 * @property {Record<string, unknown>} state the reactive `$rules` object
 * @property {string | undefined} locale
 */

/** The engine, from `install()`. @type {Engine | null} */
let F = null;

/** scope → the reactive `$rules` state for the form bound in it. */
/** @type {WeakMap<object, Record<string, unknown>>} */
const states = new WeakMap();
/** Field-groups this plugin hid, so an author's own `hidden` is never cleared. */
/** @type {WeakSet<Element>} */
const ownHidden = new WeakSet();
/** Controls this plugin disabled, for the same reason. */
/** @type {WeakSet<Element>} */
const ownDisabled = new WeakSet();
/** control → the requiredness its markup declared, captured before we touch it. */
/** @type {WeakMap<Element, { required: boolean, aria: boolean }>} */
const authored = new WeakMap();
/** Terse production warnings already said once. */
/** @type {Set<string>} */
const warned = new Set();

/**
 * What `$rules` answers in a scope with no rules form — never undefined, and
 * never shared: a fresh object each time.
 *
 * Not a frozen singleton, which is what this was first: the engine's scope is a
 * Proxy that wraps object values as it hands them out, and a Proxy may not
 * return a wrapper for a non-configurable, non-writable property of its target.
 * Reading `$rules.next` off a frozen constant therefore threw a TypeError in
 * exactly the case this exists to make harmless.
 *
 * @returns {Record<string, unknown>}
 */
function emptyState() {
  return { visible: {}, required: {}, computed: {}, next: {} };
}

/**
 * Say something, once. The dev engine keeps the full sentence (and the
 * element); production has no diagnostics seam at all, so it gets the short
 * form on `console.warn` — the plugin is never silent about a rule that cannot
 * do its job, which is the whole reason the definition is worth writing down.
 *
 * @param {string} full
 * @param {unknown} el
 * @param {string} [terse]
 */
function report(full, el, terse) {
  if (F && F.devtools && F.devtools.report && F.devtools.report(full, el)) return;
  if (warned.has(full)) return;
  warned.add(full);
  if (typeof console !== "undefined" && console.warn) {
    console.warn("[Faqir] l-rules: " + (terse || full));
  }
}

/**
 * The controls a rule path speaks for: the one named exactly, plus anything
 * nested inside it — `show: "address"` hides `address.city` and `address[0].zip`
 * even though nothing is named `address`.
 *
 * @param {HTMLFormElement} form
 * @param {string} path
 * @returns {Control[]}
 */
function controlsFor(form, path) {
  const all = /** @type {NodeListOf<Control>} */ (form.querySelectorAll("input, select, textarea"));
  /** @type {Control[]} */
  const out = [];
  for (let i = 0; i < all.length; i++) {
    const name = all[i].name;
    if (!name) continue;
    if (name === path || name.indexOf(path + ".") === 0 || name.indexOf(path + "[") === 0) {
      out.push(all[i]);
    }
  }
  return out;
}

/**
 * The field-group a control reports into, or the control itself when it has
 * none — hiding a bare control is still better than hiding nothing.
 *
 * @param {Control} el
 * @returns {Element}
 */
function groupOf(el) {
  return el.closest('[data-ui="field-group"]') || el;
}

/**
 * The form's data, exactly as its own submission would carry it: `FormData`
 * (which already drops disabled controls, so a hidden field is absent here as
 * well as on the wire), repeated names collected into a list, then `coerce` —
 * the same function a server runs over the body it receives.
 *
 * @param {HTMLFormElement} form
 * @param {CompiledDefinition} definition
 * @returns {Record<string, unknown>}
 */
function collect(form, definition) {
  /** @type {Record<string, unknown>} */
  const raw = {};
  new FormData(form).forEach(function (value, key) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) raw[key] = value;
    else if (Array.isArray(raw[key])) /** @type {unknown[]} */ (raw[key]).push(value);
    else raw[key] = [raw[key], value];
  });
  return coerce(definition, raw);
}

/**
 * `hidden` on the group, `disabled` on the controls — and only ever ours back.
 *
 * @param {HTMLFormElement} form
 * @param {string} path
 * @param {boolean} shown
 */
function applyVisible(form, path, shown) {
  const list = controlsFor(form, path);
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    const group = groupOf(el);
    if (shown === false) {
      if (!group.hasAttribute("hidden")) {
        group.setAttribute("hidden", "");
        ownHidden.add(group);
      }
      if (!el.disabled) {
        el.disabled = true;
        ownDisabled.add(el);
      }
    } else {
      if (ownHidden.has(group)) {
        group.removeAttribute("hidden");
        ownHidden.delete(group);
      }
      if (ownDisabled.has(el)) {
        el.disabled = false;
        ownDisabled.delete(el);
      }
    }
  }
}

/**
 * Requiredness is the OR of what the markup declared and what the rule decided:
 * a `require` rule may add a demand, never lift one the page wrote down.
 *
 * @param {HTMLFormElement} form
 * @param {string} path
 * @param {boolean} demanded
 */
function applyRequired(form, path, demanded) {
  const list = controlsFor(form, path);
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    let base = authored.get(el);
    if (!base) {
      base = { required: el.required === true, aria: el.getAttribute("aria-required") === "true" };
      authored.set(el, base);
    }
    const want = base.required || demanded === true;
    if (el.required !== want) el.required = want;
    if (want || base.aria) el.setAttribute("aria-required", "true");
    else el.removeAttribute("aria-required");
  }
}

/**
 * A computed value goes two places: the scope, so `l-text="total"` renders it,
 * and any control of that name, so the form submits it. Intermediate scope
 * objects are never invented — a page's data keeps the shape the page gave it.
 *
 * @param {HTMLFormElement} form
 * @param {any} scope
 * @param {string} path
 * @param {unknown} value
 */
function applyComputed(form, scope, path, value) {
  if (scope) {
    const segments = path.split(".");
    let target = scope;
    let reachable = true;
    for (let i = 0; i < segments.length - 1 && reachable; i++) {
      const next = target[segments[i]];
      if (next && typeof next === "object") target = next;
      else reachable = false;
    }
    const leaf = segments[segments.length - 1];
    if (reachable && target[leaf] !== value) target[leaf] = value;
  }
  const text = value === undefined || value === null ? "" : String(value);
  const list = controlsFor(form, path);
  for (let i = 0; i < list.length; i++) {
    if (list[i].name === path && list[i].value !== text) list[i].value = text;
  }
}

/**
 * Read the form, run the verbs, paint the answer.
 *
 * @param {HTMLFormElement} form
 * @param {FormContext} ctx
 */
function repaint(form, ctx) {
  /** @type {ReturnType<typeof evaluate>} */
  let out;
  try {
    out = evaluate(ctx.definition, collect(form, ctx.definition));
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    report("l-rules could not evaluate its rules: " + why, form, why);
    return;
  }
  for (const path in out.visible) applyVisible(form, path, out.visible[path]);
  for (const path in out.required) applyRequired(form, path, out.required[path]);
  for (const path in out.computed) applyComputed(form, ctx.scope, path, out.computed[path]);
  ctx.state.visible = out.visible;
  ctx.state.required = out.required;
  ctx.state.computed = out.computed;
  ctx.state.next = out.next;
}

/**
 * A cross-field rule, as a validator faqir-validate can run: re-judge the whole
 * form with the package and answer for this rule alone. The shape findings
 * belong to the native constraints the markup already carries, and a rule whose
 * field is blank produces nothing here — `required` is what should be speaking.
 *
 * @param {HTMLFormElement} form
 * @param {FormContext} ctx
 * @param {RawRule} rule
 * @returns {() => true | string}
 */
function logicCheck(form, ctx, rule) {
  return function () {
    /** @type {ReturnType<typeof validate>} */
    let verdict;
    try {
      verdict = validate(ctx.definition, collect(form, ctx.definition), { locale: ctx.locale });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      report("l-rules could not evaluate its rules: " + why, form, why);
      return true;
    }
    for (let i = 0; i < verdict.findings.length; i++) {
      if (verdict.findings[i].rule === rule.id) return verdict.findings[i].message;
    }
    return true;
  };
}

/**
 * A remote rule, as an async validator. The resolver is the one §8.3 names:
 * POST `{ path, value, data }`, expect `{ ok, message? }`. Every other outcome
 * rejects, and faqir-validate turns a rejection into a failed check — a check
 * that could not run has not passed.
 *
 * @param {HTMLFormElement} form
 * @param {FormContext} ctx
 * @param {RawRule} rule
 * @returns {(value: unknown) => Promise<true | string | false>}
 */
function remoteCheck(form, ctx, rule) {
  return function (value) {
    return fetch(/** @type {string} */ (rule.remote), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: rule.path, value: value, data: collect(form, ctx.definition) }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("remote check answered " + response.status);
        return response.json();
      })
      .then(function (body) {
        if (body && body.ok === true) return true;
        return (body && body.message) || rule.message || false;
      });
  };
}

/**
 * Hand every `validate` rule to faqir-validate, and say so when there is no
 * faqir-validate to hand them to: without it the rules evaluate and nothing
 * ever asks them, which looks exactly like a form with no rules at all.
 *
 * @param {HTMLFormElement} form
 * @param {FormContext} ctx
 * @param {RawRule[]} rules
 */
function registerValidators(form, ctx, rules) {
  const checks = rules.filter(function (rule) {
    return rule && rule.validate !== undefined;
  });
  if (checks.length === 0) return;
  const engine = /** @type {Engine} */ (F);
  if (!engine.validate) {
    report(
      "l-rules has " + checks.length + " validate rule(s) but faqir-validate is not " +
        "loaded, so none of them can run. Load faqir-validate.js before faqir-rules.js.",
      form,
      "faqir-validate is not loaded; validate rules cannot run.",
    );
    return;
  }
  if (!form.hasAttribute("l-validate")) {
    report(
      "l-rules has " + checks.length + " validate rule(s) on a form with no l-validate, " +
        "so nothing validates them on submit. Add l-validate to the form.",
      form,
      "a form with validate rules has no l-validate.",
    );
  }
  for (let i = 0; i < checks.length; i++) {
    const rule = checks[i];
    const fn = rule.validate === "remote"
      ? remoteCheck(form, ctx, rule)
      : logicCheck(form, ctx, rule);
    engine.validate.register(form, /** @type {string} */ (rule.path), rule.id, fn, rule.message);
  }
}

/**
 * A rule whose field this form has no control for, reported per verb — because
 * "no control" means something different to each of them, and a report that
 * flags correct markup is worse than no report at all.
 *
 *   · `show` / `require` act on controls and nothing else: with none, the rule
 *     is dead.
 *   · `validate` with no control is the form-level check the package documents
 *     (`rules.js`: "a rule whose path is not a declared field always runs").
 *     It is legitimate, and a server WILL report it — but faqir-validate paints
 *     into a field-group, so this page has nowhere to put the sentence. That
 *     asymmetry is worth one line; calling it a mistake is not.
 *   · `compute` needs no control at all: it writes the scope, and `$rules.computed`
 *     is a perfectly good destination. Never reported.
 *   · `jump` names a page, not a field.
 *
 * @param {HTMLFormElement} form
 * @param {RawRule[]} rules
 */
function reportMissingControls(form, rules) {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule || rule.jump !== undefined || rule.compute !== undefined) continue;
    const path = rule.show || rule.require || rule.path;
    if (typeof path !== "string" || controlsFor(form, path).length > 0) continue;
    if (rule.validate !== undefined) {
      report(
        'l-rules rule "' + rule.id + '" is a form-level check: its path "' + path +
          '" names no control in this form, so a server can report it but this page ' +
          "has no field-group to show it on.",
        form,
        'rule "' + rule.id + '" is a form-level check with nowhere to report.',
      );
      continue;
    }
    report(
      'l-rules rule "' + rule.id + '" names the field "' + path + '", which no control ' +
        "in this form is named for — the rule will never change anything.",
      form,
      'rule "' + rule.id + '" names an absent field "' + path + '".',
    );
  }
}

/**
 * The definition behind an `l-rules` value: a selector to a JSON script, or an
 * expression in the form's scope. `out.why` comes back filled when there is
 * none, because "no rules" and "rules that failed to load" must not look alike.
 *
 * @param {HTMLFormElement} form
 * @param {string | undefined} expression
 * @param {any} scope
 * @param {{ why: string }} out
 * @returns {unknown}
 */
function resolveDefinition(form, expression, scope, out) {
  const raw = (expression || "").trim();
  if (!raw) {
    out.why = "l-rules has no value, so there is no definition to apply.";
    return null;
  }
  const first = raw.charAt(0);
  if (first === "#" || first === "." || first === "[") {
    /** @type {Element | null} */
    let node = null;
    try {
      node = document.querySelector(raw);
    } catch (error) {
      node = null;
    }
    if (!node) {
      out.why = 'l-rules="' + raw + '" matches no element.';
      return null;
    }
    try {
      return JSON.parse(node.textContent || "");
    } catch (error) {
      out.why = 'l-rules="' + raw + '" found an element whose JSON does not parse.';
      return null;
    }
  }
  const value = /** @type {Engine} */ (F).evaluate(raw, scope, form);
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      out.why = 'l-rules="' + raw + '" is a string that does not parse as JSON.';
      return null;
    }
  }
  if (!value || typeof value !== "object") {
    out.why = 'l-rules="' + raw + '" resolved to ' +
      (value === undefined ? "nothing" : typeof value) + ", not a rules definition.";
    return null;
  }
  return value;
}

/**
 * Install into one engine. Exported for bundlers (`@faqir-ui/rules/plugin`);
 * the generated drop calls it through `Faqir.plugin` on load.
 *
 * @param {Engine} Faqir
 */
export function install(Faqir) {
  F = Faqir;

  // `$rules` is how a wizard reads `jump` — and, since the state is reactive,
  // how any expression watches visibility, requiredness or a computed value.
  Faqir.magic("rules", function (el, scope) {
    return states.get(/** @type {object} */ (scope)) || emptyState();
  });

  Faqir.directive("rules", function (form, dir, scope) {
    const out = { why: "" };
    const definition = resolveDefinition(form, dir.expression, scope, out);
    if (!definition) {
      report(out.why, form, out.why);
      return;
    }

    /** @type {CompiledDefinition} */
    let compiled;
    try {
      compiled = compile(definition);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      report("l-rules refused this definition: " + why, form, why);
      return;
    }

    const state = Faqir.reactive({ visible: {}, required: {}, computed: {}, next: {} });
    states.set(scope, state);
    /** @type {FormContext} */
    const ctx = {
      definition: compiled,
      scope: scope,
      state: state,
      // The page's own language: one definition, many locales, and the messages
      // table inside it is addressed by exactly this.
      locale: (typeof document !== "undefined" && document.documentElement &&
        document.documentElement.lang) || undefined,
    };

    const rules = /** @type {RawRule[]} */ (/** @type {unknown} */ (compiled.rules || []));
    reportMissingControls(form, rules);
    registerValidators(form, ctx, rules);
    repaint(form, ctx);

    // Capture, so the DOM is already repainted — a field hidden by this
    // keystroke is disabled — before faqir-validate's live pass reads it.
    function onEdit() {
      repaint(form, ctx);
    }
    form.addEventListener("input", onEdit, true);
    form.addEventListener("change", onEdit, true);
  });
}

// Browser self-registration: attach as soon as a global Faqir exists.
//
// No CommonJS export here, unlike the hand-written plugins: this file is
// BUNDLED, and `bun build --format=iife` resolves the free `module` identifier
// inside its own scope, so a `module.exports = install` would be dead code that
// looks alive — a `require()` of the drop would answer `{}`. A bundler user
// imports `@faqir-ui/rules/plugin` and gets this ESM `install` directly; the
// generated file is for `<script src>`, where self-registration is the contract.
const G =
  (typeof globalThis !== "undefined" && /** @type {any} */ (globalThis).Faqir) ||
  (typeof window !== "undefined" && /** @type {any} */ (window).Faqir);
if (G && typeof G.plugin === "function") {
  G.plugin(install);
}
