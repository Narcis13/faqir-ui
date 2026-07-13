// @ui:plugin faqir-validate
// @ui:provides l-validate
/**
 * faqir-validate — declarative form validation for the field-group contract. [0.6-02 · §7.1, §A5]
 *
 *   <form l-validate>
 *     <div data-ui="field-group">
 *       <label data-part="label" for="email">Work email</label>
 *       <input data-part="input" id="email" name="email" type="email" required
 *              l-validate:company="isCompanyEmail(value)"
 *              data-error-company="Use your company address.">
 *       <p data-part="error"></p>
 *     </div>
 *   </form>
 *
 * Reflects each control's native `ValidityState` (plus any custom validators)
 * into the enclosing `[data-ui="field-group"]`: sets `data-state="invalid"`,
 * fills the group's `[data-part="error"]` with a message, and wires
 * `aria-invalid` (+ `aria-describedby` to the error part when it has an id).
 * No JavaScript is required from the page author for the full validation UX.
 *
 * ── Revalidation policy (the exact UX contract) ─────────────────────────────
 *   • On **submit**: every field is validated. If any is invalid the submit is
 *     blocked (`preventDefault`) and focus moves to the first offender. When all
 *     are clean the browser submits natively — unless `l-validate` carries an
 *     expression, which is then treated as an on-valid hook (SPA submit) and run
 *     while the native submit is suppressed.
 *   • **After the first submit attempt**, each field additionally revalidates
 *     live — on `blur` (error surfaces when you leave it) and on `input` (error
 *     clears as you fix it). Before that first attempt, typing is never
 *     interrupted with errors. (`blur` doesn't bubble, so both are captured.)
 *
 * ── Custom validators ───────────────────────────────────────────────────────
 *   `l-validate:<name>="expr"` on a control runs only after native constraints
 *   pass. `expr` is evaluated with the control's current `value` (and `$el`) in
 *   scope; a falsy result marks the field invalid. Its message comes from
 *   `data-error-<name>`, then `data-error`, then a default. Multiple named
 *   validators may coexist on one control; the first to fail wins.
 *
 * ── Message resolution (when a field is invalid) ────────────────────────────
 *   custom-validator message → `data-error-<constraint>` → `data-error`
 *   → the browser's native `validationMessage` → a built-in default.
 *
 * Escape hatch: `data-validate-ignore` on a control opts it out entirely.
 *
 * Self-registers via `Faqir.plugin` when a global `Faqir` is present (load it
 * after faqir-core) and is also exported for bundlers/tests. Zero dependencies,
 * ≤ 2 KB gzip. The only attributes it owns are `data-state="invalid"` on the
 * group and `aria-invalid`/`aria-describedby` on the control — the frozen
 * five-attribute protocol is untouched.
 */
(function () {
  "use strict";

  // Non-field / non-validatable input types — skipped when scanning a form.
  var SKIP_TYPES = { submit: 1, button: 1, reset: 1, image: 1, hidden: 1 };

  // ValidityState flag → (author-message attribute suffix, built-in fallback).
  // Checked in order; the first failing flag decides the message.
  var CONSTRAINTS = [
    ["valueMissing", "required", "This field is required."],
    ["typeMismatch", "type", "Please enter a valid value."],
    ["patternMismatch", "pattern", "Please match the requested format."],
    ["tooShort", "short", "Please lengthen this value."],
    ["tooLong", "long", "Please shorten this value."],
    ["rangeUnderflow", "min", "Value is too small."],
    ["rangeOverflow", "max", "Value is too large."],
    ["stepMismatch", "step", "Please enter a valid value."],
    ["badInput", "input", "Please enter a valid value."]
  ];

  function isFormField(el) {
    var tag = el.tagName;
    if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") return false;
    if (el.disabled) return false;
    if (el.hasAttribute("data-validate-ignore")) return false;
    if (tag === "INPUT" && SKIP_TYPES[el.type]) return false;
    return true;
  }

  function fields(form) {
    var out = [];
    var all = form.querySelectorAll("input, select, textarea");
    for (var i = 0; i < all.length; i++) if (isFormField(all[i])) out.push(all[i]);
    return out;
  }

  // Suffixes of the custom `l-validate:<name>` validators declared on a control.
  function customNames(el) {
    var names = [];
    for (var i = 0; i < el.attributes.length; i++) {
      var n = el.attributes[i].name;
      if (n.indexOf("l-validate:") === 0) names.push(n.slice(11));
    }
    return names;
  }

  // Message shown once a control is invalid — see header for the priority order.
  function messageFor(el) {
    var v = el.validity;
    if (v.customError) return el.validationMessage || "This field is invalid.";
    for (var i = 0; i < CONSTRAINTS.length; i++) {
      if (v[CONSTRAINTS[i][0]]) {
        return (
          el.getAttribute("data-error-" + CONSTRAINTS[i][1]) ||
          el.getAttribute("data-error") ||
          el.validationMessage ||
          CONSTRAINTS[i][2]
        );
      }
    }
    return el.validationMessage || "This field is invalid.";
  }

  function group(el) {
    return el.closest('[data-ui="field-group"]');
  }

  // Reflect a control's verdict onto itself + its field-group. The plugin owns
  // the group's `[data-part="error"]` text and toggles `data-state` only between
  // "invalid" and cleared (an author's "disabled"/"validating" state is left be).
  function applyState(el, valid, message) {
    var g = group(el);
    var err = g && g.querySelector('[data-part="error"]');
    if (valid) {
      el.removeAttribute("aria-invalid");
      if (g && g.getAttribute("data-state") === "invalid") g.removeAttribute("data-state");
      if (err) {
        err.textContent = "";
        if (err.id && el.getAttribute("aria-describedby") === err.id)
          el.removeAttribute("aria-describedby");
      }
    } else {
      el.setAttribute("aria-invalid", "true");
      if (g) g.setAttribute("data-state", "invalid");
      if (err) {
        err.textContent = message;
        if (err.id && !el.getAttribute("aria-describedby"))
          el.setAttribute("aria-describedby", err.id);
      }
    }
  }

  function install(Faqir) {
    Faqir.directive("validate", function (form, dir, scope) {
      var submitted = false;

      // Run a control's custom validators (native constraints already passed).
      // `value` and `$el` are exposed so `l-validate:x="fn(value)"` resolves; the
      // first falsy verdict sets a custom validity message and stops.
      function runCustom(el) {
        var names = customNames(el);
        if (!names.length) return;
        var local = Object.create(scope);
        local.value = "value" in el ? el.value : null;
        local.$el = el;
        for (var i = 0; i < names.length; i++) {
          var ok = !!Faqir.evaluate(el.getAttribute("l-validate:" + names[i]), local, el);
          if (!ok) {
            el.setCustomValidity(
              el.getAttribute("data-error-" + names[i]) ||
                el.getAttribute("data-error") ||
                "This field is invalid."
            );
            return;
          }
        }
      }

      function validateField(el) {
        el.setCustomValidity(""); // clear any prior custom verdict
        if (el.validity.valid) runCustom(el); // native ok → try custom
        var valid = el.validity.valid;
        applyState(el, valid, valid ? "" : messageFor(el));
        return valid;
      }

      // Submit: validate everything; block + focus the first offender when dirty.
      form.addEventListener("submit", function (e) {
        submitted = true;
        var list = fields(form),
          firstBad = null;
        for (var i = 0; i < list.length; i++) {
          if (!validateField(list[i]) && !firstBad) firstBad = list[i];
        }
        if (firstBad) {
          e.preventDefault();
          if (typeof firstBad.focus === "function") firstBad.focus();
          return;
        }
        // Clean. A non-empty `l-validate` expression is an on-valid hook (SPA
        // submit): run it and keep the browser from navigating. Otherwise let
        // the native submit proceed.
        if (dir.expression && dir.expression.trim()) {
          e.preventDefault();
          Faqir.evaluateAssignment(dir.expression, scope, form);
        }
      });

      // After the first submit attempt, revalidate the touched field live.
      function live(e) {
        if (submitted && isFormField(e.target)) validateField(e.target);
      }
      form.addEventListener("blur", live, true);
      form.addEventListener("input", live, true);
    });
  }

  // CommonJS / bundler export (tests import the installer directly).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = install;
  }

  // Browser self-registration: attach as soon as a global Faqir exists.
  var F =
    (typeof globalThis !== "undefined" && globalThis.Faqir) ||
    (typeof window !== "undefined" && window.Faqir);
  if (F && typeof F.plugin === "function") {
    F.plugin(install);
  }
})();
