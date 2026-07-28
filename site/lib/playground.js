/* Audit-playground wiring — task 0.7-14 (FAQIR-PLAN §13).
 *
 * The only hand-written JavaScript on the docs site, alongside gallery.js. It
 * wires three things together and owns no logic of its own:
 *
 *   window.FaqirAudit           the audit engine, compiled for the browser from
 *                               src/audit/browser.ts (scripts/faqir-audit.js)
 *   window.__FAQIR_MANIFESTS__  every registry manifest, emitted by the docs
 *                               generator (scripts/faqir-manifests.js)
 *   the page                    a textarea, a findings region, a preview frame
 *
 * There is no server, no API, no build step: the audit runs in this page, so the
 * findings you see are produced by the same `auditHtmlSource` the CLI runs.
 *
 * Findings are rendered with createElement/textContent only — never innerHTML.
 * The textarea holds arbitrary markup, and the one place it is allowed to become
 * live DOM is the sandboxed preview frame.
 */
(function () {
  "use strict";

  var SOURCE_ID = "playground-source";
  var FINDINGS_ID = "playground-findings";
  var COUNT_ID = "playground-count";
  var PREVIEW_ID = "playground-preview";
  var STATUS_ID = "playground-status";

  /**
   * Severity → badge variant. Semantic soft badges are intentionally avoided
   * here: the severity word already carries the meaning, while a neutral/solid
   * badge keeps the findings legible across every swappable theme.
   */
  var BADGE = {
    critical: "secondary",
    error: "secondary",
    warning: "default",
    info: "secondary",
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) node.setAttribute(key, attrs[key]);
      }
    }
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /**
   * Absolute URL of a sibling of this script — the preview document needs the
   * stylesheet, the theme and the engine by absolute URL, because a `srcdoc`
   * frame in a sandbox has no useful base of its own.
   */
  function assetUrl(link) {
    return link ? link.href : null;
  }

  function scriptDir() {
    var own = document.querySelector('script[src$="playground.js"]');
    if (!own) return "";
    return own.src.replace(/[^/]+$/, "");
  }

  /** The full document the preview frame renders: the site's CSS + the user's markup. */
  function previewDocument(markup, urls) {
    var head = "";
    if (urls.styles) head += '<link rel="stylesheet" href="' + urls.styles + '">';
    if (urls.theme) head += '<link rel="stylesheet" href="' + urls.theme + '">';
    if (urls.engine) head += '<script src="' + urls.engine + '" defer><\/script>';
    return (
      '<!DOCTYPE html><html lang="en" data-theme="' +
      (document.documentElement.getAttribute("data-theme") || "auto") +
      '"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      head +
      '</head><body style="padding: 1rem;"><main>' +
      markup +
      "</main></body></html>"
    );
  }

  function renderFindings(container, count, findings) {
    clear(container);

    if (findings.length === 0) {
      var ok = el("div", { "data-ui": "callout", "data-variant": "success", role: "note" });
      ok.appendChild(
        el("div", { "data-part": "content" }, "No findings. This markup satisfies every rule below."),
      );
      container.appendChild(ok);
      count.textContent = "0";
      count.setAttribute("data-variant", "secondary");
      return;
    }

    // Worst first, then by line, so the list reads like the CLI reporter.
    var order = window.FaqirAudit.severities;
    var sorted = findings.slice().sort(function (a, b) {
      var bySeverity = order.indexOf(a.severity) - order.indexOf(b.severity);
      return bySeverity !== 0 ? bySeverity : (a.line || 0) - (b.line || 0);
    });

    var table = el("table");
    var thead = el("thead");
    var headRow = el("tr");
    ["Severity", "Rule", "Line", "Finding"].forEach(function (label) {
      headRow.appendChild(el("th", { scope: "col" }, label));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = el("tbody");
    sorted.forEach(function (finding) {
      var row = el("tr");
      var severityCell = el("td");
      severityCell.appendChild(
        el(
          "span",
          { "data-ui": "badge", "data-variant": BADGE[finding.severity] || "default", "data-size": "sm" },
          finding.severity,
        ),
      );
      row.appendChild(severityCell);
      var ruleCell = el("td");
      ruleCell.appendChild(el("code", null, finding.rule_id));
      row.appendChild(ruleCell);
      row.appendChild(el("td", null, finding.line || 1));
      row.appendChild(el("td", null, finding.message));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    var worst = sorted[0].severity;
    count.textContent = String(findings.length);
    count.setAttribute("data-variant", BADGE[worst] || "default");
  }

  function start() {
    var source = byId(SOURCE_ID);
    var container = byId(FINDINGS_ID);
    var count = byId(COUNT_ID);
    var preview = byId(PREVIEW_ID);
    var status = byId(STATUS_ID);
    if (!source || !container || !count) return;

    if (!window.FaqirAudit || !window.__FAQIR_MANIFESTS__) {
      clear(container);
      var failed = el("div", { "data-ui": "callout", "data-variant": "destructive", role: "alert" });
      failed.appendChild(
        el(
          "div",
          { "data-part": "content" },
          "The audit engine did not load, so this page cannot audit anything. Check that scripts/faqir-audit.js and scripts/faqir-manifests.js were served.",
        ),
      );
      container.appendChild(failed);
      return;
    }

    var auditor = window.FaqirAudit.createAuditor(window.__FAQIR_MANIFESTS__);
    var urls = {
      styles: assetUrl(document.querySelector('link[rel="stylesheet"]:not([id="faqir-theme"])')),
      theme: assetUrl(document.getElementById("faqir-theme")),
      engine: scriptDir() ? scriptDir() + "faqir-core.js" : null,
    };

    if (status) {
      // Count what this page RUNS, not what the engine ships: since 0.8-10 the
      // bundle also carries the stylesheet rules (undeclared-attribute,
      // breakpoint-canon), and those audit a component's CSS against its
      // manifest — there is no CSS in this textarea to run them on.
      var markupRules = window.FaqirAudit.rules.filter(function (rule) {
        return rule.scope !== "css";
      });
      status.textContent =
        markupRules.length +
        " rules · " +
        auditor.components.length +
        " components · engine v" +
        window.FaqirAudit.version +
        " · running in this page, with no server";
    }

    var pending = null;
    function run() {
      pending = null;
      var markup = source.value;
      // `audit` never throws (the engine turns an internal failure into an
      // `info` finding), so a half-typed tag cannot take the page down.
      renderFindings(container, count, auditor.audit(markup, { file: "playground.html" }));
      if (preview) preview.setAttribute("srcdoc", previewDocument(markup, urls));
    }

    function schedule() {
      if (pending !== null) clearTimeout(pending);
      pending = setTimeout(run, 120);
    }

    source.addEventListener("input", schedule);
    // The global documentation switcher changes the stylesheet link and scheme
    // in place. Rebuild the srcdoc so the preview follows both axes immediately.
    window.addEventListener("faqir:appearance", run);
    // Expose the debounced pass for tests and for anything that changes the
    // textarea programmatically (no `input` event fires for that).
    window.FaqirPlayground = { run: run, auditor: auditor };
    run();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
