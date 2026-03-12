import { auditProject } from "../audit/checker";
import { formatAuditReportJson, printAuditReport } from "../audit/reporter";
import { repairCommand } from "./repair";

type AuditArgs = {
  file?: string;
  json: boolean;
  fix: boolean;
};

export async function auditCommand(args: string[], cwd: string): Promise<number> {
  const options = parseAuditArgs(args);

  if (options.fix) {
    return await repairCommand(args.filter((arg) => arg !== "--fix"), cwd);
  }

  const report = await auditProject(cwd, { file: options.file });

  if (options.json) {
    process.stdout.write(formatAuditReportJson(report));
  } else {
    printAuditReport(report);
  }

  return report.ok ? 0 : 1;
}

function parseAuditArgs(args: string[]): AuditArgs {
  const options: AuditArgs = {
    json: false,
    fix: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--fix") {
      options.fix = true;
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
