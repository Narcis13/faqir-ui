#!/usr/bin/env bun

import { addCommand } from "./commands/add";
import { auditCommand } from "./commands/audit";
import { doctorCommand } from "./commands/doctor";
import { initCommand } from "./commands/init";
import { inspectCommand } from "./commands/inspect";
import { listCommand } from "./commands/list";
import { repairCommand } from "./commands/repair";
import { error, info } from "./utils/logger";

export async function runCli(args = process.argv.slice(2), cwd = process.cwd()): Promise<number> {
  try {
    const [command, ...rest] = args;

    if (!command || command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return 0;
    }

    if (command === "--version" || command === "-v") {
      info("loom 1.0.0");
      return 0;
    }

    if (command === "init") {
      await initCommand(rest, cwd);
      return 0;
    }

    if (command === "add") {
      await addCommand(rest, cwd);
      return 0;
    }

    if (command === "list") {
      await listCommand(rest, cwd);
      return 0;
    }

    if (command === "inspect") {
      await inspectCommand(rest, cwd);
      return 0;
    }

    if (command === "doctor") {
      return (await doctorCommand(rest, cwd)).ok ? 0 : 1;
    }

    if (command === "audit") {
      return await auditCommand(rest, cwd);
    }

    if (command === "repair") {
      return await repairCommand(rest, cwd);
    }

    error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  } catch (caught) {
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }
}

function printHelp(): void {
  info("Usage: loom <command> [options]");
  info("");
  info("Commands:");
  info("  init      Initialize a Loom project");
  info("  add       Add registry components");
  info("  list      Show installed and available components");
  info("  inspect   Show a component manifest");
  info("  doctor    Check project health");
  info("  audit     Check HTML and CSS contracts");
  info("  repair    Apply deterministic audit fixes");
}

if (import.meta.main) {
  const exitCode = await runCli();
  process.exit(exitCode);
}
