import { info, warn, error } from "../utils/logger";
import { type AuditReport, type AuditSummary } from "./checker";

export function printAuditReport(report: AuditReport): void {
  if (report.results.length === 0) {
    info(`Audit passed across ${report.summary.files} HTML file(s)`);
    return;
  }

  for (const result of report.results) {
    const line = `${formatSeverity(result.severity)} ${result.ruleId} ${result.filePath}:${result.location.line}:${result.location.column} ${result.message}`;

    if (result.severity === "critical" || result.severity === "error") {
      error(line);
      continue;
    }

    if (result.severity === "warning") {
      warn(line);
      continue;
    }

    info(line);
  }

  const summary = formatSummary(report.summary);

  if (report.ok) {
    warn(summary);
    return;
  }

  error(summary);
}

export function formatAuditReportJson(report: AuditReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function formatSeverity(severity: string): string {
  return severity.toUpperCase().padEnd(8, " ");
}

function formatSummary(summary: AuditSummary): string {
  return [
    `Audit summary: ${summary.total} issue(s)`,
    `${summary.critical} critical`,
    `${summary.error} error`,
    `${summary.warning} warning`,
    `${summary.info} info`,
  ].join(", ");
}
