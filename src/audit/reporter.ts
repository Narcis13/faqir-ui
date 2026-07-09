// Formatted audit report output — terminal and JSON modes

import type { AuditSummary } from "./checker";
import type { AuditResult, Severity } from "./rules";
import { getRuleInventory } from "./rules";
import { log } from "../utils/logger";

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
      console.log(`  ${color}${icon} ${sev}${RESET} ${result.message}`);
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
 * Output audit results as JSON.
 */
export function printAuditJSON(summary: AuditSummary): void {
  const output = {
    passed: summary.passed,
    files_scanned: summary.files_scanned,
    components_found: summary.components_found,
    counts: summary.counts,
    results: summary.results.map(r => ({
      rule_id: r.rule_id,
      severity: r.severity,
      component_name: r.component_name,
      file: r.file,
      line: r.line,
      message: r.message,
      fixable: !!r.fix,
    })),
  };
  console.log(JSON.stringify(output, null, 2));
}

/**
 * Print the audit rule inventory — id, severity, scope, description, and any
 * exemptions. Powers `faqir audit --rules`; the description output is where a
 * rule's exemptions (e.g. `no-fetch` exempting `l-source`) are surfaced.
 */
export function printRuleInventory(json = false): void {
  const rules = getRuleInventory();
  if (json) {
    console.log(JSON.stringify({ rules }, null, 2));
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
