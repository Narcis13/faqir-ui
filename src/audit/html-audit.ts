// HTML audit core — the filesystem-free half of the checker (task 0.7-14).
//
// `auditHtmlSource` audits one HTML *string* against in-memory manifests. It
// reads nothing and writes nothing, so it is the piece that can run anywhere:
// in `faqir audit` (per file), in the MCP `faqir_audit_html` tool (per string),
// and — since this module and everything it imports are free of `node:*` — in a
// browser, which is what the docs-site playground bundles (`src/audit/browser.ts`).
//
// It lives in its own module for exactly that reason: `checker.ts` needs
// `node:fs`/`node:path` for the on-disk sweep (`runAudit`), and a single
// `node:fs` import anywhere in the graph makes the whole thing unbundlable for
// the browser. `checker.ts` re-exports this file's API, so every existing call
// site is unchanged and there is only ever ONE implementation — which is what
// makes CLI ↔ browser finding parity structural rather than a coincidence to
// re-test.

import { extractComponents, parseDocument } from "../parser/html-parser";
import type { Manifest } from "../manifest";
import {
  type AuditResult,
  ALL_RULES,
  DOCUMENT_RULES,
  SINGLE_FIXED_REGION_RULE,
  TRIGGER_CONTRACT_RULE,
  buildSingleFixedRegionResults,
  buildTriggerContractResults,
} from "./rules";

/**
 * Rules that assert a **runtime is present in the same file** — not a property
 * of the markup (task 0.9-04, resolving follow-up 0.7-17).
 *
 * A component *fragment* — `<div data-ui="dialog">…</div>` with no `<html>`,
 * `<body>` or doctype — is by construction a thing that gets included into a
 * page; the `<script>` that boots its controller belongs to that page, and no
 * edit to the fragment can satisfy the rule without making the fragment stop
 * being a fragment. Firing here produced 39 findings on Faqir's own reference
 * markup and, worse, reached users: `faqir audit` scans `ui/**`, so a fresh
 * `init` + `add crud-table` reported the framework's own files as broken.
 *
 * The scope is derived from the content (`ParsedDocument.isFullDocument`), never
 * from a path allow-list, so it holds identically for the registry, for a user's
 * server-side partial, and for the docs-site playground — and the moment the
 * same markup is emitted as a real page (the docs example pages, the
 * copy-for-agents payloads, both of which carry the CDN preamble) the rules
 * apply again and must pass.
 */
export const RUNTIME_PRESENCE_RULES = ["controller-loaded", "focus-trap"] as const;

export interface HtmlAuditInput {
  /** Raw HTML source to audit. */
  source: string;
  /** File label used in findings (offsets index into `source`, not this path). */
  file?: string;
  /** Manifests keyed by their `data-ui` name (canonical + aliases). */
  manifests: Map<string, Manifest>;
  /**
   * Component stylesheets, keyed exactly as `manifests` is (task 0.9-05).
   *
   * Optional, and the input the markup+css rules can be decided from:
   * `trigger-contract` needs to know whether the sheet styles a trigger, while
   * `single-fixed-region` resolves fixed anchors across component instances. A
   * component whose stylesheet the caller cannot supply is skipped rather than
   * guessed at. Every caller that has the sheets on hand passes them —
   * `runAudit` from the project's `ui/**`, the registry gate from `registry/**`.
   */
  styles?: Map<string, string>;
  /** Rule IDs to skip. */
  skipRules?: string[];
}

/**
 * Audit one HTML source string against in-memory manifests — the shared,
 * **filesystem-free** core behind `faqir audit` (per file), the MCP
 * `faqir_audit_html` tool (per string) and the docs-site playground (in the
 * browser). Runs every HTML-derived rule: the per-component manifest rules
 * ({@link ALL_RULES}), the document-level rules ({@link DOCUMENT_RULES}), and the
 * file-level `controller-loaded` reconciliation. CSS/JS/token/contrast checks are
 * NOT here — they scan on-disk component sources and stay in `runAudit`.
 *
 * Pure: it reads nothing and writes nothing. Unknown `data-ui` names (no manifest
 * in the map) are skipped for per-component rules, exactly as `runAudit` skips
 * not-installed components; document rules still run over the whole source.
 */
export function auditHtmlSource(input: HtmlAuditInput): AuditResult[] {
  const { source, manifests } = input;
  const file = input.file ?? "input.html";
  const skipRules = new Set(input.skipRules ?? []);

  // One parse decides the scope, and it is the same `isFullDocument` the
  // document rules have always used to tell a page from a fragment. A fragment
  // cannot carry the runtime, so the rules that ask for one do not apply to it
  // (task 0.9-04 — see RUNTIME_PRESENCE_RULES).
  const doc = parseDocument(source, file);
  if (!doc.isFullDocument) for (const id of RUNTIME_PRESENCE_RULES) skipRules.add(id);

  const activeRules = ALL_RULES.filter((r) => !skipRules.has(r.id));
  const activeDocRules = DOCUMENT_RULES.filter((r) => !skipRules.has(r.id));

  const results: AuditResult[] = [];
  // Composition-aware part attribution (task 0.9-04): the manifests decide which
  // enclosing component a `data-part` belongs to, so a pattern's own slot stays
  // its own when it sits inside a nested primitive. See `extractComponents`.
  const components = extractComponents(source, file, (name, slot) =>
    manifests.get(name)?.slots?.[slot] !== undefined,
  );

  const triggerContract = !skipRules.has(TRIGGER_CONTRACT_RULE.id) && input.styles !== undefined;

  for (const component of components) {
    const manifest = manifests.get(component.name);
    if (!manifest) continue; // unknown/not-installed component — skip per-component rules
    for (const rule of activeRules) {
      results.push(...rule.check(component, manifest));
    }
    if (triggerContract) {
      const css = input.styles!.get(component.name);
      if (css !== undefined) results.push(...buildTriggerContractResults(component, css, file));
    }
  }

  if (!skipRules.has(SINGLE_FIXED_REGION_RULE.id) && input.styles !== undefined) {
    results.push(...buildSingleFixedRegionResults(components, input.styles, file));
  }

  if (activeDocRules.length > 0) {
    for (const rule of activeDocRules) {
      results.push(...rule.check(doc));
    }
  }

  // File-level controller-loaded: replace the generic per-component reminders
  // (emitted by controllerLoadedRule) with the precise "is the script actually
  // referenced?" findings. When every controller is referenced, the generics are
  // simply dropped. Mirrors the reconciliation in runAudit.
  if (!skipRules.has("controller-loaded")) {
    const fileControllerResults = checkControllersInFile(source, file, components, manifests);
    const hasGeneric = results.some((r) => r.rule_id === "controller-loaded");
    if (hasGeneric) {
      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i].rule_id === "controller-loaded") results.splice(i, 1);
      }
      results.push(...fileControllerResults);
    }
  }

  // `focus-trap` says "ensure the controller is loaded" — so it is answered by
  // the same file-level check, not asserted unconditionally (task 0.9-04). The
  // per-component rule cannot see the file, so it emits the reminder for every
  // focus-trapping recipe and it was never satisfiable: a page that loads
  // faqir-core.js still got four criticals from a dialog reference. Now it
  // survives only where `controller-loaded` also fires, which is the condition
  // its own message names, and the copy-for-agents payloads — real documents
  // carrying the CDN preamble — are clean under the full rule set because of it.
  if (!skipRules.has("focus-trap") && results.some((r) => r.rule_id === "focus-trap")) {
    const missing = new Set(
      checkControllersInFile(source, file, components, manifests).map((r) => r.component_name),
    );
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].rule_id === "focus-trap" && !missing.has(results[i].component_name)) {
        results.splice(i, 1);
      }
    }
  }

  return results;
}

/**
 * Check if recipe controllers are referenced in an HTML file via script tags or imports.
 */
export function checkControllersInFile(
  source: string,
  filePath: string,
  components: ReturnType<typeof extractComponents>,
  manifests: Map<string, Manifest>,
): AuditResult[] {
  const results: AuditResult[] = [];
  const recipeComponents = components.filter(c => {
    const m = manifests.get(c.name);
    return m && m.kind === "recipe" && m.files.js;
  });

  if (recipeComponents.length === 0) return results;

  // Check for script tags or imports referencing the controllers.
  //
  // Comments are stripped first (task 0.9-04). Every reference fragment opens
  // with `<!-- @ui:controller dialog.js -->`, and a plain substring test over
  // the raw source read that annotation as a loaded controller — so the rule
  // passed on any file that merely *named* its controller in prose, which is
  // the opposite of what it checks for.
  const sourceLower = source.replace(/<!--[\s\S]*?-->/g, " ").toLowerCase();
  for (const comp of recipeComponents) {
    const manifest = manifests.get(comp.name)!;
    const jsFile = manifest.files.js!;

    // Check for a direct controller import or any assembled auto-init runtime.
    // `faqir-core.min.js` belongs in this list (task 0.9-04): it is the file the
    // CDN preamble loads — the one the copy-for-agents payloads, the README's
    // two-tag snippet and every "no build step" page in the docs actually
    // reference — so leaving it out reported 147 findings against pages that
    // load the runtime by its most common name.
    const hasScript = sourceLower.includes(jsFile)
      || sourceLower.includes("faqir-core.js")
      || sourceLower.includes("faqir-core.min.js")
      || sourceLower.includes("faqir.js")
      || sourceLower.includes("faqir.min.js");

    if (!hasScript) {
      results.push({
        rule_id: "controller-loaded",
        severity: "error",
        component_name: comp.name,
        file: filePath,
        line: comp.line,
        message: `Recipe [data-ui="${comp.name}"] needs its controller "${jsFile}" loaded via script tag or import`,
        fix: {
          type: "add-script",
          offset: 0,
          details: { src: jsFile, component: comp.name },
        },
      });
    }
  }

  return results;
}
