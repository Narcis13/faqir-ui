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
 * On init and on every `input`/`change`/`reset`, the form's controls are read
 * (a control someone else disabled, like a wizard's other steps, still
 * answers), coerced through the definition and handed to `evaluate`, and the
 * answer is applied to the DOM: a hidden field's `[data-ui="field-group"]`
 * takes `hidden` and its controls take `disabled` — held there even if
 * something else enables them — so it neither validates nor submits; `require`
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
 *   `{ ok: boolean, message?: string }`. `ok: false` with no non-empty string
 *   `message` wears the rule's own sentence, resolved exactly as a server's
 *   `validateAsync` resolves it. Anything else — a non-2xx, a body that is not
 *   JSON, an `ok` that is not a boolean, a network failure — is a failed check
 *   wearing faqir-validate's built-in sentence, never a silent pass.
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
import { RULE_MESSAGES, coerce, compile, evaluate, fromFormData, resolveMessage, validate } from "./index.js";

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
 * @property {(name: string, handler: (el: any, dir: { expression?: string }, scope: any) => unknown) => void} directive
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
 * @property {Set<Element>} hidden controls a `show` rule is hiding right now
 * @property {Map<Element, boolean>} foreign for each of those, the `disabled`
 *   everyone else wants — what it goes back to when the rule shows it again
 * @property {MutationObserver | null} observer watches `disabled` on the form's controls
 */

/** The engine, from `install()`. @type {Engine | null} */
let F = null;

/** scope → the reactive `$rules` state for the form bound in it. */
/** @type {WeakMap<object, Record<string, unknown>>} */
const states = new WeakMap();
/** Field-groups this plugin hid, so an author's own `hidden` is never cleared. */
/** @type {WeakSet<Element>} */
const ownHidden = new WeakSet();
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
 * `contacts[0].name` and `contacts.0.name` are one path — the first is how
 * HTML names it, the second how a compiled definition does.
 *
 * @param {string} path
 */
function normal(path) {
  return path.replace(/\[(\d+)\]/g, ".$1");
}

/**
 * The controls a rule path speaks for: the one named exactly, plus anything
 * nested inside it — `show: "address"` hides `address.city` and `address[0].zip`
 * even though nothing is named `address`. Both sides are compared normalized,
 * so `show: "contacts[0]"` finds `contacts[0].name`.
 *
 * @param {HTMLFormElement} form
 * @param {string} path
 * @param {boolean} [exact] only the control named for `path` itself
 * @returns {Control[]}
 */
function controlsFor(form, path, exact) {
  const all = /** @type {NodeListOf<Control>} */ (form.querySelectorAll("input, select, textarea"));
  const want = normal(path);
  /** @type {Control[]} */
  const out = [];
  for (let i = 0; i < all.length; i++) {
    if (!all[i].name) continue;
    const name = normal(all[i].name);
    if (name === want || (!exact && name.indexOf(want + ".") === 0)) out.push(all[i]);
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
 * The form's data: every named control, the way `FormData` reads one (checked
 * boxes only, every selected option, no buttons) — then `fromFormData` and
 * `coerce`, the same two functions a server runs over the body it receives.
 *
 * One deliberate difference from `FormData`: a control someone else disabled
 * still answers. A wizard disables every step but the current one, and the
 * answers on the other steps did not stop existing because the page is showing
 * something else — reading them as blank sent Back over a step the person had
 * filled in. A control a `show` rule is hiding is the one thing absent here, as
 * it is on the wire.
 *
 * @param {HTMLFormElement} form
 * @param {FormContext} ctx
 * @returns {Record<string, unknown>}
 */
function collect(form, ctx) {
  /** @type {[string, unknown][]} */
  const pairs = [];
  const all = /** @type {NodeListOf<Control>} */ (form.querySelectorAll("input, select, textarea"));
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const name = el.name;
    if (!name || ctx.hidden.has(el)) continue;
    if (el.tagName === "SELECT") {
      const options = /** @type {HTMLSelectElement} */ (el).options;
      for (let j = 0; j < options.length; j++) {
        if (options[j].selected && !options[j].disabled) pairs.push([name, options[j].value]);
      }
      continue;
    }
    if (el.tagName === "INPUT") {
      const type = el.type;
      if (type === "submit" || type === "button" || type === "reset" || type === "image") continue;
      if ((type === "checkbox" || type === "radio") && !(/** @type {HTMLInputElement} */ (el).checked)) continue;
      if (type === "file") {
        const files = /** @type {HTMLInputElement} */ (el).files;
        for (let j = 0; files && j < files.length; j++) pairs.push([name, files[j]]);
        continue;
      }
    }
    pairs.push([name, el.value]);
  }
  return coerce(ctx.definition, fromFormData(pairs));
}

/**
 * Read what everyone else has done to `disabled` since we last looked.
 *
 * A control a `show` rule hides is disabled and HELD disabled: a wizard that
 * enables its step's controls must not revive a field nobody can see, or Next
 * stops on a "required" error for something invisible. So every foreign write
 * to a held control is noted — it is what the control goes back to when the
 * rule shows it — and the control is disabled again. Our own writes never
 * reach here: each is followed by `takeRecords()`, which discards them.
 *
 * @param {FormContext} ctx
 * @param {MutationRecord[]} records
 */
function noteForeign(ctx, records) {
  for (let i = 0; i < records.length; i++) {
    const el = /** @type {Element} */ (records[i].target);
    if (ctx.hidden.has(el)) ctx.foreign.set(el, /** @type {Control} */ (el).disabled);
  }
  let wrote = false;
  ctx.hidden.forEach(function (el) {
    const control = /** @type {Control} */ (el);
    if (!control.disabled) {
      ctx.foreign.set(el, false);
      control.disabled = true;
      wrote = true;
    }
  });
  if (wrote && ctx.observer) ctx.observer.takeRecords();
}

/** Settle pending foreign writes before this plugin writes, or anyone reads. @param {FormContext} ctx */
function flush(ctx) {
  noteForeign(ctx, ctx.observer ? ctx.observer.takeRecords() : []);
}

/**
 * Set `disabled` as this plugin, without it reading as someone else's wish.
 *
 * @param {FormContext} ctx @param {Control} el @param {boolean} value
 */
function writeDisabled(ctx, el, value) {
  if (el.disabled === value) return;
  el.disabled = value;
  if (ctx.observer) ctx.observer.takeRecords();
}

/**
 * `hidden` on the group, `disabled` on the controls — and only ever ours back.
 *
 * Decided per control, not per rule path: a control is hidden when ANY path
 * the verdict decided about — its own, or one it sits inside — is hidden, so
 * `show: "address"` false and `show: "address.city"` true leave the city
 * hidden whichever rule came first. A group is hidden when any control in it
 * is.
 *
 * @param {HTMLFormElement} form
 * @param {FormContext} ctx
 * @param {Record<string, boolean>} visible
 */
function applyVisible(form, ctx, visible) {
  const keys = Object.keys(visible);
  if (keys.length === 0) return;
  flush(ctx);
  /** @type {Map<Element, boolean>} group → hidden */
  const groups = new Map();
  const all = /** @type {NodeListOf<Control>} */ (form.querySelectorAll("input, select, textarea"));
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (!el.name) continue;
    const name = normal(el.name);
    let matched = false;
    let shown = true;
    for (let k = 0; k < keys.length; k++) {
      if (name === keys[k] || name.indexOf(keys[k] + ".") === 0) {
        matched = true;
        if (visible[keys[k]] === false) shown = false;
      }
    }
    if (!matched) continue;
    const group = groupOf(el);
    groups.set(group, groups.get(group) === true || !shown);
    if (!shown && !ctx.hidden.has(el)) {
      ctx.foreign.set(el, el.disabled);
      ctx.hidden.add(el);
      writeDisabled(ctx, el, true);
    } else if (shown && ctx.hidden.has(el)) {
      const want = ctx.foreign.get(el) === true;
      ctx.hidden.delete(el);
      ctx.foreign.delete(el);
      writeDisabled(ctx, el, want);
    }
  }
  groups.forEach(function (hide, group) {
    if (hide && !group.hasAttribute("hidden")) {
      group.setAttribute("hidden", "");
      ownHidden.add(group);
    } else if (!hide && ownHidden.has(group)) {
      group.removeAttribute("hidden");
      ownHidden.delete(group);
    }
  });
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
  const list = controlsFor(form, path, true);
  for (let i = 0; i < list.length; i++) {
    if (list[i].value !== text) list[i].value = text;
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
    flush(ctx);
    out = evaluate(ctx.definition, collect(form, ctx));
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    report("l-rules could not evaluate its rules: " + why, form, why);
    return;
  }
  applyVisible(form, ctx, out.visible);
  for (const path in out.required) applyRequired(form, path, out.required[path]);
  for (const path in out.computed) applyComputed(form, ctx.scope, path, out.computed[path]);
  ctx.state.visible = out.visible;
  ctx.state.required = out.required;
  ctx.state.computed = out.computed;
  ctx.state.next = out.next;
}

/**
 * The first finding the package reports for `rule` (a rule id or a shape
 * constraint) at `path`, judged over the whole form — as a faqir-validate
 * answer: `true`, or the sentence.
 *
 * @param {ReturnType<typeof validate>} verdict @param {string} rule @param {string} [path]
 * @returns {true | string}
 */
function answerFor(verdict, rule, path) {
  for (let i = 0; i < verdict.findings.length; i++) {
    const finding = verdict.findings[i];
    if (finding.rule === rule && (path === undefined || finding.path === path)) return finding.message;
  }
  return true;
}

/**
 * A package check as a validator faqir-validate can run: re-judge the whole
 * form and answer for this one rule. A cross-field rule answers under its id;
 * a field `pattern` the markup could not carry answers under `pattern`. The
 * other shape findings belong to the native constraints the markup already
 * carries, and a rule whose field is blank produces nothing here — `required`
 * is what should be speaking.
 *
 * @param {HTMLFormElement} form
 * @param {FormContext} ctx
 * @param {string} rule
 * @param {string} [path]
 * @returns {() => true | string}
 */
function packageCheck(form, ctx, rule, path) {
  return function () {
    try {
      return answerFor(validate(ctx.definition, collect(form, ctx), { locale: ctx.locale }), rule, path);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      report("l-rules could not evaluate its rules: " + why, form, why);
      return true;
    }
  };
}

/**
 * A remote rule, as an async validator. The resolver is the one §8.3 names:
 * POST `{ path, value, data }`, expect `{ ok, message? }`. A missing or empty
 * message resolves through the package's own `resolveMessage` with the chain
 * `validateAsync` uses on a server — the definition's `messages`, then the
 * rule's `message` — so both report the same sentence. Every other outcome
 * rejects, and faqir-validate turns a rejection into a failed check — a check
 * that could not run has not passed.
 *
 * @param {HTMLFormElement} form
 * @param {FormContext} ctx
 * @param {RawRule} rule
 * @returns {(value: unknown) => Promise<true | string>}
 */
function remoteCheck(form, ctx, rule) {
  return function (value) {
    const data = collect(form, ctx);
    return fetch(/** @type {string} */ (rule.remote), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: rule.path, value: value, data: data }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("remote check answered " + response.status);
        return response.json();
      })
      .then(function (body) {
        if (!body || typeof body !== "object" || typeof body.ok !== "boolean") {
          throw new Error("remote check answered without a boolean `ok`");
        }
        if (body.ok) return true;
        if (typeof body.message === "string" && body.message) return body.message;
        const path = normal(/** @type {string} */ (rule.path));
        return resolveMessage({
          messages: ctx.definition.messages,
          locale: ctx.locale,
          defaultLocale: ctx.definition.defaultLocale,
          path: path,
          rule: rule.id,
          params: { path: path, remote: rule.remote },
          fallback: rule.message || RULE_MESSAGES.rule,
        });
      });
  };
}

/**
 * The compiled field a control's (normalized) name lands on, if it declares a
 * `pattern`: the longest declared path that prefixes it, then down through
 * `properties` and `items`.
 *
 * @param {CompiledDefinition} definition @param {string} path
 * @returns {boolean}
 */
function hasPattern(definition, path) {
  const segments = path.split(".");
  for (let n = segments.length; n > 0; n--) {
    /** @type {any} */
    let field = definition.fields.get(segments.slice(0, n).join("."));
    if (!field) continue;
    for (let i = n; i < segments.length && field; i++) {
      field = field.type === "object" && field.properties ? field.properties.get(segments[i])
        : field.type === "array" && /^\d+$/.test(segments[i]) ? field.items : null;
    }
    return !!(field && field.regex);
  }
  return false;
}

/**
 * Hand every `validate` rule to faqir-validate — registered under the name of
 * each control it speaks for, so `validate` on `contacts.0.name` reaches the
 * control named `contacts[0].name` — plus a `pattern` check for any control
 * whose field declares one its markup does not carry. Say so when there is no
 * faqir-validate to hand them to: without it the rules evaluate and nothing
 * ever asks them, which looks exactly like a form with no rules at all.
 *
 * @param {HTMLFormElement} form
 * @param {FormContext} ctx
 * @param {RawRule[]} rules
 * @returns {Array<() => void>} what undoes each registration
 */
function registerValidators(form, ctx, rules) {
  /** @type {Array<{ field: string, name: string, fn: (value: unknown) => unknown, message?: string }>} */
  const wanted = [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule || rule.validate === undefined) continue;
    const fn = rule.validate === "remote" ? remoteCheck(form, ctx, rule) : packageCheck(form, ctx, rule.id);
    const path = /** @type {string} */ (rule.path);
    /** @type {string[]} */
    const names = [];
    const list = controlsFor(form, path, true);
    for (let j = 0; j < list.length; j++) if (names.indexOf(list[j].name) === -1) names.push(list[j].name);
    // No control: the form-level check. faqir-validate is still told, under
    // the path itself, so the registration is visible to its diagnostics.
    if (names.length === 0) names.push(path);
    for (let j = 0; j < names.length; j++) wanted.push({ field: names[j], name: rule.id, fn: fn, message: rule.message });
  }
  const checks = wanted.length;
  const all = /** @type {NodeListOf<Control>} */ (form.querySelectorAll("input, textarea"));
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (!el.name || el.hasAttribute("pattern")) continue;
    const path = normal(el.name);
    if (hasPattern(ctx.definition, path)) {
      wanted.push({ field: el.name, name: "pattern", fn: packageCheck(form, ctx, "pattern", path) });
    }
  }
  if (wanted.length === 0) return [];

  const engine = /** @type {Engine} */ (F);
  if (!engine.validate) {
    report(
      "l-rules has " + wanted.length + " check(s) to run but faqir-validate is not " +
        "loaded, so none of them can run. Load faqir-validate.js before faqir-rules.js.",
      form,
      "faqir-validate is not loaded; validate rules cannot run.",
    );
    return [];
  }
  if (checks > 0 && !form.hasAttribute("l-validate")) {
    report(
      "l-rules has " + checks + " validate rule(s) on a form with no l-validate, " +
        "so nothing validates them on submit. Add l-validate to the form.",
      form,
      "a form with validate rules has no l-validate.",
    );
  }
  /** @type {Array<() => void>} */
  const undo = [];
  for (let i = 0; i < wanted.length; i++) {
    const w = wanted[i];
    const off = engine.validate.register(form, w.field, w.name, w.fn, w.message);
    if (typeof off === "function") undo.push(/** @type {() => void} */ (off));
  }
  return undo;
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
      hidden: new Set(),
      foreign: new Map(),
      observer: null,
    };
    if (typeof MutationObserver === "function") {
      ctx.observer = new MutationObserver(function (records) {
        noteForeign(ctx, records);
      });
      ctx.observer.observe(form, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
    }

    const rules = /** @type {RawRule[]} */ (/** @type {unknown} */ (compiled.rules || []));
    reportMissingControls(form, rules);
    const unregister = registerValidators(form, ctx, rules);
    repaint(form, ctx);

    let live = true;
    // Capture, so the DOM is already repainted — a field hidden by this
    // keystroke is disabled — before faqir-validate's live pass reads it.
    function onEdit() {
      repaint(form, ctx);
    }
    // A reset event fires BEFORE the controls are reset, so the repaint waits
    // a task for the values it has to read.
    function onReset() {
      setTimeout(function () {
        if (live) repaint(form, ctx);
      }, 0);
    }
    // Capture, so a control something else re-enabled since the last repaint
    // is held disabled again before faqir-validate decides what to check.
    function onSubmit() {
      flush(ctx);
    }
    form.addEventListener("input", onEdit, true);
    form.addEventListener("change", onEdit, true);
    form.addEventListener("reset", onReset, true);
    form.addEventListener("submit", onSubmit, true);

    // The engine runs this when the form's scope is destroyed: nothing of the
    // plugin's — a listener, the observer, a registered validator — outlives it.
    return function () {
      live = false;
      form.removeEventListener("input", onEdit, true);
      form.removeEventListener("change", onEdit, true);
      form.removeEventListener("reset", onReset, true);
      form.removeEventListener("submit", onSubmit, true);
      if (ctx.observer) ctx.observer.disconnect();
      for (let i = 0; i < unregister.length; i++) unregister[i]();
      if (states.get(scope) === state) states.delete(scope);
    };
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
