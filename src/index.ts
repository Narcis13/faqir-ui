#!/usr/bin/env bun

import { init } from "./commands/init";
import { doctor } from "./commands/doctor";
import { add } from "./commands/add";
import { remove } from "./commands/remove";
import { list } from "./commands/list";
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
import { VERSION } from "./version";

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  init,
  doctor,
  add,
  remove,
  list,
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

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

function suggestCommand(input: string): string | null {
  const commands = Object.keys(COMMANDS);
  let best = { name: "", distance: Infinity };

  for (const cmd of commands) {
    const d = levenshtein(input, cmd);
    if (d < best.distance) best = { name: cmd, distance: d };
  }

  return best.distance <= 3 ? best.name : null;
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
