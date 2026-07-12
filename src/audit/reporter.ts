// Formatted audit report output — terminal and JSON modes

import type { AuditSummary } from "./checker";
import type { AuditResult, Severity } from "./rules";
import { getRuleInventory } from "./rules";
import { log } from "../utils/logger";
import { emitJSON } from "../utils/json-output";

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "\x1b[31m", // red
  error: "\x1b[33m",    // yellow
  warning: "\x1b[36m",  // cyan
  info: "\x1b[2m",      // dim
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const SEVERITY_ICONS: Record<Severity, string> = {
  critical: "✗",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
};

/**
 * Print audit results to the terminal with colors and formatting.
 */
export function printAuditReport(summary: AuditSummary): void {
  log.heading("Faqir Audit Report");
  log.blank();

  // Summary line
  log.info(`Scanned ${summary.files_scanned} file(s), found ${summary.components_found} component(s)`);
  log.blank();

  if (summary.results.length === 0) {
    log.success("All components pass audit — no issues found.");
    return;
  }

  // Group results by file
  const byFile = new Map<string, AuditResult[]>();
  for (const result of summary.results) {
    const existing = byFile.get(result.file) || [];
    existing.push(result);
    byFile.set(result.file, existing);
  }

  // Sort files
  const sortedFiles = [...byFile.keys()].sort();

  for (const file of sortedFiles) {
    const results = byFile.get(file)!;
    console.log(`${BOLD}${file}${RESET}`);

    // Sort by severity (critical first, then error, warning, info)
    const order: Severity[] = ["critical", "error", "warning", "info"];
    results.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

    for (const result of results) {
      const color = SEVERITY_COLORS[result.severity];
      const icon = SEVERITY_ICONS[result.severity];
      const sev = result.severity.toUpperCase().padEnd(8);
      // Document rules pin a precise line:column — surface it so the fix is easy to find.
      const loc = result.column !== undefined ? `${SEVERITY_COLORS.info}L${result.line}:${result.column}${RESET} ` : "";
      console.log(`  ${color}${icon} ${sev}${RESET} ${loc}${result.message}`);
      if (result.fix) {
        console.log(`    ${SEVERITY_COLORS.info}↳ Auto-fixable${RESET}`);
      }
    }
    log.blank();
  }

  // Summary counts
  const { counts } = summary;
  const parts: string[] = [];
  if (counts.critical > 0) parts.push(`${SEVERITY_COLORS.critical}${counts.critical} critical${RESET}`);
  if (counts.error > 0) parts.push(`${SEVERITY_COLORS.error}${counts.error} error(s)${RESET}`);
  if (counts.warning > 0) parts.push(`${SEVERITY_COLORS.warning}${counts.warning} warning(s)${RESET}`);
  if (counts.info > 0) parts.push(`${SEVERITY_COLORS.info}${counts.info} info${RESET}`);

  console.log(`${BOLD}Total: ${summary.results.length} issue(s)${RESET} — ${parts.join(", ")}`);
  log.blank();

  if (summary.passed) {
    log.success("Audit passed (no critical or error issues).");
  } else {
    log.error("Audit failed — fix critical and error issues above.");
    const fixable = summary.results.filter(r => r.fix).length;
    if (fixable > 0) {
      log.dim(`  ${fixable} issue(s) can be auto-fixed with 'faqir repair'`);
    }
  }
}

/**
 * Version of the `faqir audit --json` payload schema. Bumped only on a
 * breaking change to the shape below — additive fields do not bump it. The
 * emitted document always carries this as `audit_schema_version`, which is the
 * stable contract the MCP tools and the 1.0 freeze depend on.
 */
export const AUDIT_SCHEMA_VERSION = 1 as const;

export interface AuditFindingJSON {
  rule_id: string;
  severity: Severity;
  component_name: string;
  file: string;
  line: number;
  column?: number;
  message: string;
  fixable: boolean;
}

export interface AuditReportJSON {
  audit_schema_version: typeof AUDIT_SCHEMA_VERSION;
  passed: boolean;
  files_scanned: number;
  components_found: number;
  counts: Record<Severity, number>;
  results: AuditFindingJSON[];
}

/**
 * Build the stable, versioned JSON payload for an audit summary. Shared by
 * `faqir audit --json` (project scan) and `faqir audit --stdin --json` (piped
 * HTML) so both speak the identical schema.
 */
export function buildAuditReport(summary: AuditSummary): AuditReportJSON {
  return {
    audit_schema_version: AUDIT_SCHEMA_VERSION,
    passed: summary.passed,
    files_scanned: summary.files_scanned,
    components_found: summary.components_found,
    counts: summary.counts,
    results: summary.results.map((r) => ({
      rule_id: r.rule_id,
      severity: r.severity,
      component_name: r.component_name,
      file: r.file,
      line: r.line,
      ...(r.column !== undefined ? { column: r.column } : {}),
      message: r.message,
      fixable: !!r.fix,
    })),
  };
}

/**
 * Output audit results as JSON via the universal `--json` channel.
 */
export function printAuditJSON(summary: AuditSummary): void {
  emitJSON(buildAuditReport(summary));
}

/**
 * Print the audit rule inventory — id, severity, scope, description, and any
 * exemptions. Powers `faqir audit --rules`; the description output is where a
 * rule's exemptions (e.g. `no-fetch` exempting `l-source`) are surfaced.
 */
export function printRuleInventory(json = false): void {
  const rules = getRuleInventory();
  if (json) {
    emitJSON({ rules });
    return;
  }

  log.heading("Faqir Audit Rules");
  log.blank();
  for (const r of rules) {
    const color = SEVERITY_COLORS[r.severity];
    console.log(`${BOLD}${r.id}${RESET}  ${color}${r.severity}${RESET}  ${SEVERITY_COLORS.info}(${r.applies_to})${RESET}`);
    console.log(`  ${r.description}`);
    if (r.exempt && r.exempt.length > 0) {
      console.log(`  ${SEVERITY_COLORS.info}exempt: ${r.exempt.join("; ")}${RESET}`);
    }
    log.blank();
  }
}
