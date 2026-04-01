// loom repair — attempt deterministic fixes for audit issues

import { configExists } from "../utils/config";
import { log } from "../utils/logger";
import { runAudit } from "../audit/checker";
import { applyRepairs } from "../audit/repairer";

export async function repair(args: string[]): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No loom.config.json found. Run 'loom init' first.");
    process.exit(1);
  }

  log.heading("Loom Repair");
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

  const repairSummary = await applyRepairs(summary.results, cwd);

  log.blank();
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
