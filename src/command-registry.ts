// Central command registry — the single source of truth for which commands the
// `faqir` CLI dispatches, and what each one is. Kept side-effect-free (it
// neither reads argv nor calls `main`) so tests and generators can import it to
// enumerate commands — e.g. the `--json` meta-test that runs every registered
// command and asserts parseable JSON, and the skill generator's CLI reference.
//
// Each entry carries its handler AND its metadata, so a command cannot be
// registered without a category, a usage line and a summary. `faqir help` groups
// by `category`; `src/generator/skill.ts` renders `usage` + `summary` into the
// shipped skill's CLI reference. Both read this table, so neither can fall
// behind the other (tests/generator/skill.test.ts asserts the coverage).

import { init } from "./commands/init";
import { doctor } from "./commands/doctor";
import { add } from "./commands/add";
import { remove } from "./commands/remove";
import { diff } from "./commands/diff";
import { upgrade } from "./commands/upgrade";
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
import { bindings } from "./commands/bindings";

/** The headings `faqir help` groups commands under, in display order. */
export const COMMAND_CATEGORIES = [
  "Project Setup",
  "Components",
  "Development",
  "Quality",
  "AI / Agent",
] as const;

export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

export interface CommandDefinition {
  /** The handler `faqir <name>` dispatches to. */
  run: (args: string[]) => Promise<void>;
  /** Which `faqir help` group the command appears under. */
  category: CommandCategory;
  /** One-line summary for `faqir help`. */
  summary: string;
  /**
   * Argument/flag sketch shown after the command name (empty when the command
   * takes none). Rendered verbatim into the skill's CLI reference.
   */
  args: string;
  /** Terser gloss for the skill's CLI reference; falls back to `summary`. */
  skillNote?: string;
}

export const COMMAND_DEFINITIONS: Record<string, CommandDefinition> = {
  init: {
    run: init,
    category: "Project Setup",
    summary: "Initialize a new Faqir project",
    args: "[--theme <name>]",
    skillNote: "scaffold a project",
  },
  doctor: {
    run: doctor,
    category: "Project Setup",
    summary: "Check project health",
    args: "[--json]",
    skillNote: "check environment + project health",
  },
  add: {
    run: add,
    category: "Components",
    summary: "Add components from the registry",
    args: "<component...>",
    skillNote: "add components (resolves deps, accepts aliases)",
  },
  remove: {
    run: remove,
    category: "Components",
    summary: "Remove installed components",
    args: "<component...>",
    skillNote: "remove (checks dependents)",
  },
  diff: {
    run: diff,
    category: "Quality",
    summary: "Show component drift vs the pristine copy",
    args: "[component...]",
    skillNote: "user drift vs pristine baseline",
  },
  upgrade: {
    run: upgrade,
    category: "Components",
    summary: "Three-way merge components to the registry's latest",
    args: "[component...]",
    skillNote: "three-way merge to the latest version",
  },
  list: {
    run: list,
    category: "Components",
    summary: "Show installed and available components",
    args: "",
    skillNote: "installed / available",
  },
  search: {
    run: search,
    category: "Components",
    summary: "Search components by name, alias, or description",
    args: "<query>",
    skillNote: "find by name, alias, or description",
  },
  create: {
    run: create,
    category: "Components",
    summary: "Scaffold a new custom component",
    args: "<name> --kind <type>",
    skillNote: "scaffold a custom component",
  },
  inspect: {
    run: inspect,
    category: "Components",
    summary: "Show component manifest details",
    args: "<component>",
    skillNote: "full manifest",
  },
  audit: {
    run: audit,
    category: "Quality",
    summary: "Validate components against manifests",
    args: "[--json] [--skip-rules <ids>]",
    skillNote: "validate markup against manifests",
  },
  repair: {
    run: repair,
    category: "Quality",
    summary: "Auto-fix audit issues",
    args: "",
    skillNote: "auto-fix audit issues",
  },
  context: {
    run: context,
    category: "AI / Agent",
    summary: "Generate AI context file",
    args: "[--format json|md|cursorrules|llms] [--skill]",
    skillNote: "emit the machine-readable project context",
  },
  explain: {
    run: explain,
    category: "AI / Agent",
    summary: "Human/agent-readable component explanation",
    args: "<component> [--json]",
    skillNote: "human/agent explanation",
  },
  trace: {
    run: trace,
    category: "Quality",
    summary: "Show dependency and file trace",
    args: "<component> [--json]",
    skillNote: "dependency graph",
  },
  conform: {
    run: conform,
    category: "Quality",
    summary: "Normalize component markup",
    args: "[--dry-run]",
    skillNote: "normalize markup",
  },
  theme: {
    run: theme,
    category: "Development",
    summary: "Manage or generate contrast-verified themes",
    args: "set|list|create <name>",
    skillNote: "manage themes — see the Themes table",
  },
  variant: {
    run: variant,
    category: "Development",
    summary: "Add or remove component variants",
    args: "add|remove <component> <group>=<value>",
    skillNote: "add/remove a variant value (manifest + CSS together)",
  },
  scaffold: {
    run: scaffold,
    category: "Development",
    summary: "Generate full page templates",
    args: "<name> [--output <path>] [--theme <name>]",
    skillNote: "generate a whole page — see the Scaffolds table",
  },
  bundle: {
    run: bundle,
    category: "Development",
    summary: "Compose CSS into a single bundle file",
    args: "[--minify] [--watch]",
    skillNote: "compose CSS into one file",
  },
  dev: {
    run: dev,
    category: "Development",
    summary: "Start a local dev server",
    args: "[--port <n>] [--bundle]",
    skillNote: "local dev server with live reload",
  },
  bindings: {
    run: bindings,
    category: "Development",
    summary: "Generate framework bindings from manifests (vue, react)",
    args: "vue|react [--out <dir>] [--check]",
    skillNote: "generate typed Vue/React components from manifests",
  },
};

/**
 * Name → handler, the dispatch table `src/index.ts` looks commands up in.
 * Derived from `COMMAND_DEFINITIONS` so the two can never disagree.
 */
export const COMMANDS: Record<string, (args: string[]) => Promise<void>> = Object.fromEntries(
  Object.entries(COMMAND_DEFINITIONS).map(([name, def]) => [name, def.run]),
);

/** Names of every registered command, in registration order. */
export const COMMAND_NAMES: string[] = Object.keys(COMMAND_DEFINITIONS);

/** Registered commands of one category, in registration order. */
export function commandsInCategory(category: CommandCategory): [string, CommandDefinition][] {
  return Object.entries(COMMAND_DEFINITIONS).filter(([, def]) => def.category === category);
}
