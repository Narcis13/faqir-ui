// One HTML string in, the versioned `faqir audit --json` report out.
//
// The body of `faqir audit --stdin --json`, factored out so the programmatic
// `auditHtml` (`@faqir-ui/mcp/audit`) is not a second implementation of it: both
// call this with the same inputs and therefore return the same document, byte
// for byte once serialized. Pure over its inputs — no filesystem, no process
// state — so the caller decides where the manifests come from.

import { extractComponents } from "../parser/html-parser";
import type { AuditSummary, StringAuditInputs } from "./checker";
import { auditHtmlSource } from "./html-audit";
import { buildAuditReport, type AuditReportJSON } from "./reporter";
import type { AuditResult, Severity } from "./rules";

/** The file name a string audit reports its findings against. */
export const STDIN_FILE = "<stdin>";

/** Build an AuditSummary from a flat result list (one source, nothing vendor). */
export function summarizeResults(
  results: AuditResult[],
  filesScanned: number,
  componentsFound: number,
): AuditSummary {
  const counts: Record<Severity, number> = { critical: 0, error: 0, warning: 0, info: 0 };
  for (const r of results) counts[r.severity]++;
  return {
    results,
    files_scanned: filesScanned,
    components_found: componentsFound,
    counts,
    // Nothing audited as a string is vendor: the caller authored what it sent.
    vendor_counts: { critical: 0, error: 0, warning: 0, info: 0 },
    passed: counts.critical === 0 && counts.error === 0,
  };
}

/** Per-call switches of a string audit. */
export interface StringAuditSwitches {
  /** Rule ids to skip (`--skip-rules`). */
  skipRules?: string[];
  /** Also report undeclared `data-*` attributes (`undeclared-markup-attribute`). */
  strict?: boolean;
}

/** Audit one HTML string; the summary (for the human reporter) and its JSON report. */
export function auditSourceReport(
  source: string,
  inputs: StringAuditInputs,
  switches: StringAuditSwitches = {},
): { summary: AuditSummary; report: AuditReportJSON } {
  const results = auditHtmlSource({
    source,
    file: STDIN_FILE,
    manifests: inputs.manifests,
    styles: inputs.styles,
    knownUiValues: inputs.knownUiValues,
    engineControllers: inputs.engineControllers,
    forbidDirectives: inputs.forbidDirectives,
    skipRules: switches.skipRules,
    ...(switches.strict ? { strict: true } : {}),
  });
  const summary = summarizeResults(results, 1, extractComponents(source, STDIN_FILE).length);
  return { summary, report: buildAuditReport(summary) };
}
