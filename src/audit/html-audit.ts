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
import { type AuditResult, ALL_RULES, DOCUMENT_RULES } from "./rules";

export interface HtmlAuditInput {
  /** Raw HTML source to audit. */
  source: string;
  /** File label used in findings (offsets index into `source`, not this path). */
  file?: string;
  /** Manifests keyed by their `data-ui` name (canonical + aliases). */
  manifests: Map<string, Manifest>;
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
  const activeRules = ALL_RULES.filter((r) => !skipRules.has(r.id));
  const activeDocRules = DOCUMENT_RULES.filter((r) => !skipRules.has(r.id));

  const results: AuditResult[] = [];
  const components = extractComponents(source, file);

  for (const component of components) {
    const manifest = manifests.get(component.name);
    if (!manifest) continue; // unknown/not-installed component — skip per-component rules
    for (const rule of activeRules) {
      results.push(...rule.check(component, manifest));
    }
  }

  if (activeDocRules.length > 0) {
    const doc = parseDocument(source, file);
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

  // Check for script tags or imports referencing the controllers
  const sourceLower = source.toLowerCase();
  for (const comp of recipeComponents) {
    const manifest = manifests.get(comp.name)!;
    const jsFile = manifest.files.js!;

    // Check for a direct controller import or either assembled auto-init runtime.
    const hasScript = sourceLower.includes(jsFile)
      || sourceLower.includes("faqir-core.js")
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
