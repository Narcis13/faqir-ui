// site/lib/csp-proof.js — the strict-CSP page's evidence (1.3).
//
// engine/csp/ states `script-src 'self'` in a <meta http-equiv> and loads
// faqir-core.csp.js instead of faqir-core.js. This script reports what that
// means in the browser that is reading the page: the policy it found, whether
// the policy refused `new Function` (it should: no 'unsafe-eval'), and which
// engine is running. The demos on the page are the rest of the proof — every
// l-* expression in them ran through the interpreter, because nothing else can.
//
// The refused compile is the point, so the browser also logs a CSP violation
// to the console when this runs. That line is expected on this page.
(function () {
  "use strict";

  function report(name, text, state) {
    var el = document.querySelector('[data-docs-csp-result="' + name + '"]');
    if (!el) return;
    el.textContent = text;
    if (state) el.setAttribute("data-state", state);
  }

  function run() {
    var meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    report("policy", meta ? meta.getAttribute("content") : "none stated");

    var refused = null;
    try {
      // The whole proof: a page without 'unsafe-eval' cannot compile a string.
      new Function("return 1")();
    } catch (error) {
      refused = (error && error.name) || "Error";
    }
    report(
      "eval",
      refused ? "refused (" + refused + ")" : "allowed: this browser did not enforce the policy",
      refused ? "refused" : "allowed",
    );

    var engine = window.Faqir;
    report("engine", engine ? "faqir-core.csp.js " + (engine.version || "") : "not loaded");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
