import { applyAuditFixes } from "../audit/repairer";
import { auditProject } from "../audit/checker";
import { formatAuditReportJson, printAuditReport } from "../audit/reporter";
import { info, success, warn } from "../utils/logger";

type RepairArgs = {
  file?: string;
  json: boolean;
};

export async function repairCommand(args: string[], cwd: string): Promise<number> {
  const options = parseRepairArgs(args);
  const before = await auditProject(cwd, { file: options.file });

  if (before.results.length === 0) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ before, repair: { applied: 0, filesChanged: [] }, after: before }, null, 2)}\n`,
      );
    } else {
      info("No repairable issues found");
    }

    return 0;
  }

  const repair = await applyAuditFixes(before.results);
  const after = await auditProject(cwd, { file: options.file });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ before, repair, after }, null, 2)}\n`);
  } else {
    if (repair.applied === 0) {
      warn("No deterministic fixes were available");
    } else {
      success(`Applied ${repair.applied} fix(es) across ${repair.filesChanged.length} file(s)`);
    }

    printAuditReport(after);
  }

  return after.ok ? 0 : 1;
}

function parseRepairArgs(args: string[]): RepairArgs {
  const options: RepairArgs = {
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--file") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("--file requires a path");
      }

      options.file = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}
