// faqir audit — validate installed components against their manifests
//
// Two input modes:
//   • project scan (default) — walk the project's HTML files against installed
//     manifests. Requires faqir.config.json.
//   • `--stdin` — audit an HTML document piped on stdin against the *registry*
//     manifests (the shared `auditHtmlSource` engine, the same one the MCP
//     `faqir_audit_html` tool drives). It needs no project; inside one, the
//     project's installed manifests are laid over the registry's.

import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { configExists, missingConfigMessage, readConfig } from "../utils/config";
import { log } from "../utils/logger";
import { getRegistryPath } from "../utils/fs";
import { knownUiValues, loadRegistryManifestMap } from "../utils/components";
import { extractComponents } from "../parser/html-parser";
import { runAudit, auditHtmlSource, loadInstalledAuditInputs, type AuditSummary } from "../audit/checker";
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
  for (const i of skipRuleValueIndices(args)) {
    for (const id of args[i].split(",")) {
      const trimmed = id.trim();
      if (trimmed) ids.push(trimmed);
    }
  }
  return ids;
}

/**
 * The argument positions `--skip-rules` consumes: every value up to the next
 * flag — or up to the first one that is a path rather than a rule id, so
 * `faqir audit --skip-rules a page.html` audits `page.html` with `a` skipped
 * instead of trying to skip a rule called "page.html". Rule ids are kebab-case
 * and never contain a `.` or a `/`.
 */
function skipRuleValueIndices(args: string[]): number[] {
  const at = args.indexOf("--skip-rules");
  if (at < 0) return [];
  const out: number[] = [];
  for (let i = at + 1; i < args.length && !args[i].startsWith("-"); i++) {
    if (/[./\\]/.test(args[i])) break;
    out.push(i);
  }
  return out;
}

/**
 * The one file an audit or repair is scoped to: `--file <path>` or a bare
 * positional path (`faqir audit page.html`). Shared by `audit`, `audit --fix`
 * and `repair`, so all three read the same arguments the same way.
 *
 * The positional form used to be ignored outright — `faqir audit page.html`
 * audited the whole project and said nothing. An error is returned rather than
 * a guess for `--file` with no value, two different targets, or more than one.
 */
export function parseAuditTarget(args: string[]): { file?: string; error?: string } {
  const consumed = new Set(skipRuleValueIndices(args));
  let flagFile: string | undefined;
  const at = args.indexOf("--file");
  if (at >= 0) {
    const value = args[at + 1];
    if (value === undefined || value.startsWith("-")) return { error: "--file needs a path" };
    flagFile = value;
    consumed.add(at + 1);
  }
  const positional = args.filter((a, i) => !a.startsWith("-") && !consumed.has(i));
  if (positional.length > 1) {
    return { error: `expected one file to audit, got ${positional.join(", ")}` };
  }
  if (flagFile && positional.length === 1 && positional[0] !== flagFile) {
    return { error: `two targets given: --file ${flagFile} and ${positional[0]}` };
  }
  return { file: flagFile ?? positional[0] };
}

/**
 * Resolve a target from {@link parseAuditTarget} against `cwd`, or exit 1 with
 * the reason. A path that does not exist is an error, not an empty audit that
 * passes.
 */
export function resolveAuditTarget(args: string[], cwd: string): string | undefined {
  const target = parseAuditTarget(args);
  if (target.error) {
    log.error(target.error);
    process.exit(1);
  }
  if (!target.file) return undefined;
  const path = resolve(cwd, target.file);
  if (!existsSync(path) || !statSync(path).isFile()) {
    log.error(`No such file: ${target.file}`);
    process.exit(1);
  }
  return path;
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
    // Nothing piped on stdin is vendor: the caller authored what it sent.
    vendor_counts: { critical: 0, error: 0, warning: 0, info: 0 },
    passed: counts.critical === 0 && counts.error === 0,
  };
}

/**
 * Audit HTML piped on stdin against the registry manifests — and, run inside a
 * project, against that project's installed ones laid over them.
 *
 * Without the overlay a project's own components (`faqir create`) were
 * `unknown-component` on stdin while `--file` in the same directory knew them,
 * and an installed manifest the project had edited was ignored for the
 * registry's copy.
 */
async function auditStdin(args: string[], cwd: string): Promise<void> {
  const jsonMode = args.includes("--json");
  const source = await readStdin();

  const registryPath = getRegistryPath();
  const manifests = await loadRegistryManifestMap(registryPath);
  // `unknown-component` (task 1.0R-11) is decided from the registry the
  // manifests came from — plus the aliases and base-layer values that have no
  // manifest of their own, and the project's installed names.
  const known = new Set(knownUiValues(registryPath));
  let styles: Map<string, string> | undefined;

  if (configExists(cwd)) {
    const config = await readConfig(cwd);
    const installed = await loadInstalledAuditInputs(config, join(cwd, config.output_dir));
    for (const [name, manifest] of installed.manifests) {
      manifests.set(name, manifest);
      known.add(name);
    }
    styles = installed.styles;
  }

  const results = auditHtmlSource({
    source,
    file: "<stdin>",
    manifests,
    styles,
    knownUiValues: [...known],
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
    console.log("Usage: faqir audit [file.html] [options]");
    log.blank();
    console.log("Options:");
    log.table([
      ["<file>, --file <file>", "Audit one HTML file instead of the whole project"],
      ["--stdin", "Audit HTML read from stdin — no project required; inside one, its components count"],
      ["--rules", "List the rule inventory instead of auditing"],
      ["--skip-rules <ids>", "Comma-separated rule IDs to skip"],
      ["--strict", "Fail on findings in ui/ too — the framework's own installed files"],
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
    return auditStdin(args, cwd);
  }

  if (!configExists(cwd)) {
    log.error(missingConfigMessage(cwd));
    process.exit(1);
  }

  const file = resolveAuditTarget(args, cwd);

  // --fix is an alias for faqir repair, which reads the same target and
  // --skip-rules this command does — and refuses the flags it cannot honour.
  if (args.includes("--fix")) {
    const { repair } = await import("./repair");
    return repair(args.filter(a => a !== "--fix"));
  }

  const summary = await runAudit({
    cwd,
    file,
    skipRules: parseSkipRules(args),
    strict: args.includes("--strict"),
  });

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
