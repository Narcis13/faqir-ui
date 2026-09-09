// faqir audit — validate installed components against their manifests
//
// Two input modes:
//   • project scan (default) — walk the project's HTML files against installed
//     manifests. Requires faqir.config.json.
//   • `--stdin` — audit an HTML document piped on stdin against the *registry*
//     manifests. Filesystem-free per call (the shared `auditHtmlSource` engine,
//     the same one the MCP `faqir_audit_html` tool drives) and needs no project.

import { configExists, missingConfigMessage } from "../utils/config";
import { log } from "../utils/logger";
import { getRegistryPath } from "../utils/fs";
import { knownUiValues, loadRegistryManifestMap } from "../utils/components";
import { extractComponents } from "../parser/html-parser";
import { runAudit, auditHtmlSource, type AuditSummary } from "../audit/checker";
import type { AuditResult, Severity } from "../audit/rules";
import { printAuditReport, printAuditJSON, printRuleInventory } from "../audit/reporter";
import { readStdin } from "../utils/stdin";

/**
 * `--skip-rules <ids>` — the documented escape hatch (task 1.0R-11).
 *
 * Accepts a comma- and/or space-separated list (`--skip-rules unknown-component`,
 * `--skip-rules a,b`, `--skip-rules a b`), reading every value until the next
 * flag. Generic over the rule inventory rather than special-cased for one rule:
 * `faqir audit --rules` prints the ids, and any of them can be silenced. The
 * case it exists for is `unknown-component` on a page that deliberately mixes
 * Faqir with `data-ui` values belonging to another system.
 */
export function parseSkipRules(args: string[]): string[] | undefined {
  const at = args.indexOf("--skip-rules");
  if (at < 0) return undefined;
  const ids: string[] = [];
  for (let i = at + 1; i < args.length && !args[i].startsWith("--"); i++) {
    for (const id of args[i].split(",")) {
      const trimmed = id.trim();
      if (trimmed) ids.push(trimmed);
    }
  }
  return ids;
}

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

  // Here the manifests ARE the registry, so `unknown-component` (task 1.0R-11)
  // is decided from the same registry the manifests came from — plus the aliases
  // and base-layer values that have no manifest of their own.
  const results = auditHtmlSource({
    source,
    file: "<stdin>",
    manifests,
    knownUiValues: knownUiValues(registryPath),
    skipRules: parseSkipRules(args),
  });
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

  // `--help` must never do the thing it is asking about. It is the safest probe
  // an agent has, so it has to stay free of side effects and of cost.
  if (args.includes("--help") || args.includes("-h")) {
    log.heading("faqir audit");
    log.blank();
    console.log("Validate components and pages against their manifests.");
    log.blank();
    console.log("Options:");
    log.table([
      ["--stdin", "Audit HTML read from stdin — no project required"],
      ["--rules", "List the rule inventory instead of auditing"],
      ["--skip-rules <ids>", "Comma-separated rule IDs to skip"],
      ["--fix", "Apply the deterministic fixes (same as `faqir repair`)"],
      ["--json", "Machine-readable output"],
    ]);
    return;
  }

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
    log.error(missingConfigMessage(cwd));
    process.exit(1);
  }

  const fileArg = args.indexOf("--file");
  const file = fileArg >= 0 ? args[fileArg + 1] : undefined;

  // --fix is an alias for faqir repair
  if (args.includes("--fix")) {
    const { repair } = await import("./repair");
    return repair(args.filter(a => a !== "--fix"));
  }

  const summary = await runAudit({ cwd, file, skipRules: parseSkipRules(args) });

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
