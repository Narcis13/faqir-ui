// faqir repair — attempt deterministic fixes for audit issues

import { configExists, missingConfigMessage } from "../utils/config";
import { log } from "../utils/logger";
import { emitJSON } from "../utils/json-output";
import { runAudit } from "../audit/checker";
import { applyRepairs } from "../audit/repairer";
import { parseSkipRules, resolveAuditTarget } from "./audit";

/** Bumped when the `repair --json` document changes shape. */
export const REPAIR_SCHEMA_VERSION = 1;

export async function repair(args: string[]): Promise<void> {
  const cwd = process.cwd();

  if (args.includes("--help") || args.includes("-h")) {
    log.heading("faqir repair");
    log.blank();
    console.log("Apply the deterministic fixes the audit knows how to make.");
    log.blank();
    console.log("Usage: faqir repair [file.html] [options]");
    log.blank();
    console.log("Options:");
    log.table([
      ["<file>, --file <file>", "Repair one HTML file instead of the whole project"],
      ["--skip-rules <ids>", "Comma-separated rule IDs whose fixes to leave alone"],
      ["--dry-run", "Show what would be fixed without writing"],
      ["--json", "Machine-readable output: every fix, applied or skipped, and what remains"],
    ]);
    return;
  }

  // `audit --fix` forwards its arguments here. `--strict` only moves audit's
  // exit code (vendor findings count toward it); repair fixes what it can either
  // way and exits 0, so accepting the flag would promise something it does not
  // do. Say so instead of dropping it.
  if (args.includes("--strict")) {
    log.error(
      "--strict has no effect on repair — it only changes audit's exit code. " +
        "Run `faqir repair`, then `faqir audit --strict`.",
    );
    process.exit(1);
  }

  const dryRun = args.includes("--dry-run");
  const jsonMode = args.includes("--json");

  if (!configExists(cwd)) {
    log.error(missingConfigMessage(cwd));
    process.exit(1);
  }

  const file = resolveAuditTarget(args, cwd);
  const skipRules = parseSkipRules(args);

  log.heading("Faqir Repair");
  log.blank();

  // Run audit to find issues
  log.info("Running audit to find fixable issues...");
  const summary = await runAudit({ cwd, file, skipRules });

  const fixable = summary.results.filter(r => r.fix);
  if (fixable.length === 0) {
    log.success("No fixable issues found.");
    if (jsonMode) emitReport({ dryRun, files_modified: 0, fixes_applied: 0, fixes_skipped: 0, fixes: [] }, dryRun ? null : summary.results);
    return;
  }

  log.info(`Found ${fixable.length} auto-fixable issue(s). Applying repairs...`);
  log.blank();

  const repairSummary = await applyRepairs(summary.results, cwd, { dryRun });

  log.blank();
  if (dryRun) {
    log.info(
      `${repairSummary.fixes_applied} fix(es) would be applied across ${repairSummary.files_modified} file(s). Run without --dry-run to apply.`
    );
    if (repairSummary.fixes_skipped > 0) {
      log.dim(`  ${repairSummary.fixes_skipped} fix(es) would be skipped (already applied or not applicable).`);
    }
    if (jsonMode) emitReport({ dryRun, ...repairSummary }, null);
    return;
  }
  log.success(`Repairs complete: ${repairSummary.fixes_applied} fix(es) applied across ${repairSummary.files_modified} file(s).`);
  if (repairSummary.fixes_skipped > 0) {
    log.dim(`  ${repairSummary.fixes_skipped} fix(es) skipped (already applied or not applicable).`);
  }

  // Re-run audit to verify
  log.blank();
  log.info("Re-running audit to verify...");
  const verification = await runAudit({ cwd, file, skipRules });
  const remaining = verification.results.filter(r => r.severity === "critical" || r.severity === "error");

  if (jsonMode) {
    emitReport({ dryRun, ...repairSummary }, verification.results);
    return;
  }

  if (remaining.length === 0) {
    log.success("All critical and error issues resolved.");
  } else {
    log.warn(`${remaining.length} issue(s) remain that require manual attention:`);
    for (const r of remaining) {
      log.step(`${r.severity.toUpperCase()}: ${r.message}`);
    }
  }
}

/**
 * The `repair --json` document. `fixes` lists every fix the audit offered, each
 * marked `applied` or not (on `--dry-run`, "applied" means "would apply").
 * `remaining` is the critical and error findings the re-audit still reports —
 * `null` on `--dry-run`, where nothing was re-audited because nothing changed.
 */
function emitReport(
  outcome: {
    dryRun: boolean;
    files_modified: number;
    fixes_applied: number;
    fixes_skipped: number;
    fixes: Awaited<ReturnType<typeof applyRepairs>>["fixes"];
  },
  after: Awaited<ReturnType<typeof runAudit>>["results"] | null,
): void {
  emitJSON({
    repair_schema_version: REPAIR_SCHEMA_VERSION,
    dry_run: outcome.dryRun,
    files_modified: outcome.files_modified,
    fixes_applied: outcome.fixes_applied,
    fixes_skipped: outcome.fixes_skipped,
    fixes: outcome.fixes,
    remaining:
      after === null
        ? null
        : after
            .filter((r) => r.severity === "critical" || r.severity === "error")
            .map((r) => ({
              rule_id: r.rule_id,
              severity: r.severity,
              file: r.file,
              line: r.line,
              message: r.message,
            })),
  });
}
