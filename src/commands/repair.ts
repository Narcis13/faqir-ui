// faqir repair — attempt deterministic fixes for audit issues

import { configExists, missingConfigMessage } from "../utils/config";
import { log } from "../utils/logger";
import { runAudit } from "../audit/checker";
import { applyRepairs } from "../audit/repairer";

export async function repair(args: string[]): Promise<void> {
  const cwd = process.cwd();

  if (args.includes("--help") || args.includes("-h")) {
    log.heading("faqir repair");
    log.blank();
    console.log("Apply the deterministic fixes the audit knows how to make.");
    log.blank();
    console.log("Options:");
    log.table([
      ["--dry-run", "Show what would be fixed without writing"],
      ["--json", "Machine-readable output"],
    ]);
    return;
  }

  const dryRun = args.includes("--dry-run");

  if (!configExists(cwd)) {
    log.error(missingConfigMessage(cwd));
    process.exit(1);
  }

  log.heading("Faqir Repair");
  log.blank();

  // Run audit to find issues
  log.info("Running audit to find fixable issues...");
  const summary = await runAudit({ cwd });

  const fixable = summary.results.filter(r => r.fix);
  if (fixable.length === 0) {
    log.success("No fixable issues found.");
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
    return;
  }
  log.success(`Repairs complete: ${repairSummary.fixes_applied} fix(es) applied across ${repairSummary.files_modified} file(s).`);
  if (repairSummary.fixes_skipped > 0) {
    log.dim(`  ${repairSummary.fixes_skipped} fix(es) skipped (already applied or not applicable).`);
  }

  // Re-run audit to verify
  log.blank();
  log.info("Re-running audit to verify...");
  const verification = await runAudit({ cwd });
  const remaining = verification.results.filter(r => r.severity === "critical" || r.severity === "error");

  if (remaining.length === 0) {
    log.success("All critical and error issues resolved.");
  } else {
    log.warn(`${remaining.length} issue(s) remain that require manual attention:`);
    for (const r of remaining) {
      log.step(`${r.severity.toUpperCase()}: ${r.message}`);
    }
  }
}
