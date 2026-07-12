// faqir audit — validate installed components against their manifests
//
// Two input modes:
//   • project scan (default) — walk the project's HTML files against installed
//     manifests. Requires faqir.config.json.
//   • `--stdin` — audit an HTML document piped on stdin against the *registry*
//     manifests. Filesystem-free per call (the shared `auditHtmlSource` engine,
//     the same one the MCP `faqir_audit_html` tool drives) and needs no project.

import { configExists } from "../utils/config";
import { log } from "../utils/logger";
import { getRegistryPath } from "../utils/fs";
import { loadRegistryManifestMap } from "../utils/components";
import { extractComponents } from "../parser/html-parser";
import { runAudit, auditHtmlSource, type AuditSummary } from "../audit/checker";
import type { AuditResult, Severity } from "../audit/rules";
import { printAuditReport, printAuditJSON, printRuleInventory } from "../audit/reporter";
import { readStdin } from "../utils/stdin";

/** Build an AuditSummary from a flat result list (used by the stdin path). */
function summarize(results: AuditResult[], filesScanned: number, componentsFound: number): AuditSummary {
  const counts: Record<Severity, number> = { critical: 0, error: 0, warning: 0, info: 0 };
  for (const r of results) counts[r.severity]++;
  return {
    results,
    files_scanned: filesScanned,
    components_found: componentsFound,
    counts,
    passed: counts.critical === 0 && counts.error === 0,
  };
}

/** Audit HTML piped on stdin against the registry manifests. */
async function auditStdin(args: string[]): Promise<void> {
  const jsonMode = args.includes("--json");
  const source = await readStdin();

  const registryPath = getRegistryPath();
  const manifests = await loadRegistryManifestMap(registryPath);

  const results = auditHtmlSource({ source, file: "<stdin>", manifests });
  const componentsFound = extractComponents(source, "<stdin>").length;
  const summary = summarize(results, 1, componentsFound);

  if (jsonMode) {
    printAuditJSON(summary);
  } else {
    printAuditReport(summary);
  }

  if (!summary.passed) process.exit(1);
}

export async function audit(args: string[]): Promise<void> {
  const cwd = process.cwd();

  const jsonMode = args.includes("--json");

  // `--rules` lists the rule inventory (id, severity, scope, description,
  // exemptions) without running an audit — no config required.
  if (args.includes("--rules")) {
    printRuleInventory(jsonMode);
    return;
  }

  // `--stdin` reads HTML from stdin and audits against the registry — no project.
  if (args.includes("--stdin")) {
    return auditStdin(args);
  }

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const fileArg = args.indexOf("--file");
  const file = fileArg >= 0 ? args[fileArg + 1] : undefined;

  // --fix is an alias for faqir repair
  if (args.includes("--fix")) {
    const { repair } = await import("./repair");
    return repair(args.filter(a => a !== "--fix"));
  }

  const summary = await runAudit({ cwd, file });

  if (jsonMode) {
    printAuditJSON(summary);
  } else {
    printAuditReport(summary);
  }

  // Exit with non-zero code if audit failed
  if (!summary.passed) {
    process.exit(1);
  }
}
