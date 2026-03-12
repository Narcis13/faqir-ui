#!/usr/bin/env bun

import { addCommand } from "./commands/add";
import { auditCommand } from "./commands/audit";
import { conformCommand } from "./commands/conform";
import { contextCommand } from "./commands/context";
import { doctorCommand } from "./commands/doctor";
import { explainCommand } from "./commands/explain";
import { galleryCommand } from "./commands/gallery";
import { initCommand } from "./commands/init";
import { inspectCommand } from "./commands/inspect";
import { listCommand } from "./commands/list";
import { repairCommand } from "./commands/repair";
import { scaffoldCommand } from "./commands/scaffold";
import { themeCommand } from "./commands/theme";
import { traceCommand } from "./commands/trace";
import { variantCommand } from "./commands/variant";
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

    if (command === "gallery") {
      await galleryCommand(rest, cwd);
      return 0;
    }

    if (command === "audit") {
      return await auditCommand(rest, cwd);
    }

    if (command === "repair") {
      return await repairCommand(rest, cwd);
    }

    if (command === "context") {
      await contextCommand(rest, cwd);
      return 0;
    }

    if (command === "explain") {
      await explainCommand(rest, cwd);
      return 0;
    }

    if (command === "trace") {
      await traceCommand(rest, cwd);
      return 0;
    }

    if (command === "conform") {
      return await conformCommand(rest, cwd);
    }

    if (command === "theme") {
      await themeCommand(rest, cwd);
      return 0;
    }

    if (command === "scaffold") {
      await scaffoldCommand(rest, cwd);
      return 0;
    }

    if (command === "variant") {
      await variantCommand(rest, cwd);
      return 0;
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
  info("  gallery   Generate a self-hosted component gallery");
  info("  audit     Check HTML and CSS contracts");
  info("  repair    Apply deterministic audit fixes");
  info("  context   Generate AI context files");
  info("  explain   Human/agent-readable component explanation");
  info("  trace     Show dependency and file trace");
  info("  conform   Normalize component markup to canonical order");
  info("  theme     Manage active and custom themes");
  info("  scaffold  Generate full-page templates");
  info("  variant   Add or remove component variant values");
}

if (import.meta.main) {
  const exitCode = await runCli();
  process.exit(exitCode);
}
