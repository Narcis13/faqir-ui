#!/usr/bin/env bun

// Must be first: installs a Bun→Node polyfill when running the compiled
// bundle on plain Node. No-op under the Bun runtime.
import "./utils/runtime-shim";

import { init } from "./commands/init";
import { doctor } from "./commands/doctor";
import { add } from "./commands/add";
import { remove } from "./commands/remove";
import { diff } from "./commands/diff";
import { list } from "./commands/list";
import { search } from "./commands/search";
import { create } from "./commands/create";
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
import { bundle } from "./commands/bundle";
import { dev } from "./commands/dev";
import { log } from "./utils/logger";
import { suggestClosest } from "./utils/suggest";
import { VERSION } from "./version";

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  init,
  doctor,
  add,
  remove,
  diff,
  list,
  search,
  create,
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
  bundle,
  dev,
};

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
      ["theme", "Manage themes (set, create, list)"],
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

  try {
    await handler(args.slice(1));
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
