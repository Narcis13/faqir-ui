// faqir audit — validate all installed components against their manifests

import { configExists } from "../utils/config";
import { log } from "../utils/logger";
import { runAudit } from "../audit/checker";
import { printAuditReport, printAuditJSON, printRuleInventory } from "../audit/reporter";

export async function audit(args: string[]): Promise<void> {
  const cwd = process.cwd();

  const jsonMode = args.includes("--json");

  // `--rules` lists the rule inventory (id, severity, scope, description,
  // exemptions) without running an audit — no config required.
  if (args.includes("--rules")) {
    printRuleInventory(jsonMode);
    return;
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
