#!/usr/bin/env bun

import { init } from "./commands/init";
import { doctor } from "./commands/doctor";
import { add } from "./commands/add";
import { list } from "./commands/list";
import { inspect } from "./commands/inspect";
import { log } from "./utils/logger";

const VERSION = "0.1.0";

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  init,
  doctor,
  add,
  list,
  inspect,
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
