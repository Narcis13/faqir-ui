// Central command registry — the single source of truth for which commands the
// `faqir` CLI dispatches. Kept side-effect-free (it neither reads argv nor calls
// `main`) so tests can import it to enumerate commands — e.g. the `--json`
// meta-test that runs every registered command and asserts parseable JSON.

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

export const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  init,
  doctor,
  add,
  remove,
  diff,
  upgrade,
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
  bindings,
};

/** Names of every registered command, in registration order. */
export const COMMAND_NAMES: string[] = Object.keys(COMMANDS);
