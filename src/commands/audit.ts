// loom audit — validate all installed components against their manifests

import { configExists } from "../utils/config";
import { log } from "../utils/logger";
import { runAudit } from "../audit/checker";
import { printAuditReport, printAuditJSON } from "../audit/reporter";

export async function audit(args: string[]): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No loom.config.json found. Run 'loom init' first.");
    process.exit(1);
  }

  const jsonMode = args.includes("--json");
  const fileArg = args.indexOf("--file");
  const file = fileArg >= 0 ? args[fileArg + 1] : undefined;

  // --fix is an alias for loom repair
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
