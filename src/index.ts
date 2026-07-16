#!/usr/bin/env bun

// Must be first: installs a Bun→Node polyfill when running the compiled
// bundle on plain Node. No-op under the Bun runtime.
import "./utils/runtime-shim";

import { COMMANDS } from "./command-registry";
import { log } from "./utils/logger";
import { suggestClosest } from "./utils/suggest";
import { initJSONMode, recordJSONError } from "./utils/json-output";
import { VERSION } from "./version";

const HELP_CATEGORIES = [
  {
    name: "Project Setup",
    commands: [
      ["init", "Initialize a new Faqir project"],
      ["doctor", "Check project health"],
    ],
  },
  {
    name: "Components",
    commands: [
      ["add", "Add components from the registry"],
      ["remove", "Remove installed components"],
      ["upgrade", "Three-way merge components to the registry's latest"],
      ["list", "Show installed and available components"],
      ["search", "Search components by name, alias, or description"],
      ["create", "Scaffold a new custom component"],
      ["inspect", "Show component manifest details"],
    ],
  },
  {
    name: "Development",
    commands: [
      ["dev", "Start a local dev server"],
      ["bundle", "Compose CSS into a single bundle file"],
      ["theme", "Manage or generate contrast-verified themes"],
      ["variant", "Add or remove component variants"],
      ["scaffold", "Generate full page templates"],
    ],
  },
  {
    name: "Quality",
    commands: [
      ["audit", "Validate components against manifests"],
      ["repair", "Auto-fix audit issues"],
      ["conform", "Normalize component markup"],
      ["diff", "Show component drift vs the pristine copy"],
      ["trace", "Show dependency and file trace"],
    ],
  },
  {
    name: "AI / Agent",
    commands: [
      ["context", "Generate AI context file"],
      ["explain", "Human/agent-readable component explanation"],
    ],
  },
];

function suggestCommand(input: string): string | null {
  return suggestClosest(input, Object.keys(COMMANDS), 3);
}

function printHelp() {
  log.heading("faqir — Agent-Native UI Framework CLI");
  log.blank();
  log.info(`Version ${VERSION}`);
  log.blank();
  console.log("Usage: faqir <command> [options]");

  for (const category of HELP_CATEGORIES) {
    log.blank();
    console.log(`  ${category.name}:`);
    log.table(category.commands as [string, string][]);
  }

  log.blank();
  log.table([
    ["help", "Show this help message"],
    ["version", "Show version"],
  ]);
  log.blank();
  console.log("Run 'faqir <command> --help' for command-specific options.");
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
    const suggestion = suggestCommand(command);
    if (suggestion) {
      log.dim(`Did you mean: faqir ${suggestion}?`);
    } else {
      log.dim("Run 'faqir help' for available commands.");
    }
    process.exit(1);
  }

  // Arm the universal `--json` guarantee before dispatch: in JSON mode all human
  // console output is captured and a single JSON document is emitted (bespoke for
  // commands with their own schema, else a generic envelope flushed on exit).
  initJSONMode(command, args.slice(1));

  try {
    await handler(args.slice(1));
  } catch (err) {
    recordJSONError(err);
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
