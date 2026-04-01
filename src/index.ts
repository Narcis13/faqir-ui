#!/usr/bin/env bun

import { init } from "./commands/init";
import { doctor } from "./commands/doctor";
import { add } from "./commands/add";
import { list } from "./commands/list";
import { inspect } from "./commands/inspect";
import { audit } from "./commands/audit";
import { repair } from "./commands/repair";
import { context } from "./commands/context";
import { explain } from "./commands/explain";
import { trace } from "./commands/trace";
import { conform } from "./commands/conform";
import { theme } from "./commands/theme";
import { variant } from "./commands/variant";
import { scaffold } from "./commands/scaffold";
import { log } from "./utils/logger";

const VERSION = "0.1.0";

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  init,
  doctor,
  add,
  list,
  inspect,
  audit,
  repair,
  context,
  explain,
  trace,
  conform,
  theme,
  variant,
  scaffold,
};

function printHelp() {
  log.heading("loom — Agent-Native UI Framework CLI");
  log.blank();
  log.info(`Version ${VERSION}`);
  log.blank();
  console.log("Usage: loom <command> [options]");
  log.blank();
  console.log("Commands:");
  log.table([
    ["init", "Initialize a new Loom project"],
    ["add", "Add components to the project"],
    ["list", "Show installed and available components"],
    ["inspect", "Show component manifest details"],
    ["audit", "Validate components against manifests"],
    ["repair", "Auto-fix audit issues"],
    ["context", "Generate AI context file"],
    ["explain", "Human/agent-readable component explanation"],
    ["trace", "Show dependency and file trace"],
    ["conform", "Normalize component markup"],
    ["theme", "Manage themes (set, create, list)"],
    ["variant", "Add or remove component variants"],
    ["scaffold", "Generate full page templates"],
    ["doctor", "Check project health"],
    ["help", "Show this help message"],
    ["version", "Show version"],
  ]);
  log.blank();
  console.log("Run 'loom <command> --help' for command-specific options.");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    log.error(`Unknown command: ${command}`);
    log.dim("Run 'loom help' for available commands.");
    process.exit(1);
  }

  try {
    await handler(args.slice(1));
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
