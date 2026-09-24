// faqir rules — the form-rules definition, checked before anything runs it.
//
// `faqir rules lint <def.json>` reads a definition (a file, or `--stdin`) and
// reports what `@faqir-ui/rules` would refuse and what it would accept while
// quietly doing nothing: a `var` naming a field nobody declared, a compute
// cycle, a message key no locale translates, a `when` that folds to a constant.
// Seven rule ids, `--json` for an agent, and `faqir audit`'s exit-code bargain —
// non-zero on an error, zero on a warning.
//
// The lint itself lives in the package (`packages/rules/src/lint.js`), not here:
// the MCP surface, a browser form builder and a server can all run it, and a
// second implementation behind a CLI is exactly how two readings of one
// document start to disagree.

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { log } from "../utils/logger";
import { emitJSON } from "../utils/json-output";
import { readStdin } from "../utils/stdin";
import { LINT_RULES, lintDefinition } from "../../packages/rules/src/index.js";
import type { LintFinding } from "../../packages/rules/src/index.js";

/**
 * The `--json` document's version. Bump it when a key changes meaning or
 * disappears; adding one is additive and does not (same bargain as
 * `AUDIT_SCHEMA_VERSION`).
 */
export const RULES_LINT_SCHEMA_VERSION = 1;

/** What one lint run emits under `--json`. */
export interface RulesLintReport {
  rules_lint_schema_version: number;
  /** The file linted, or `<stdin>`. */
  source: string;
  /** No error-severity findings. Warnings do not clear it to `false`. */
  ok: boolean;
  counts: { error: number; warning: number };
  findings: LintFinding[];
}

/**
 * `--locales en,ro` — one comma-separated token, and deliberately not the
 * greedy "read until the next flag" list `faqir audit --skip-rules` takes. That
 * command has no positional argument to be confused with; this one does, and
 * `--locales en ro form.json` has no reading that is right for everyone. One
 * token is unambiguous, and it is the spelling every example uses.
 */
export function parseLocales(args: string[]): string[] {
  const at = args.indexOf("--locales");
  if (at < 0 || at + 1 >= args.length) return [];
  const locales: string[] = [];
  for (const locale of args[at + 1].split(",")) {
    const trimmed = locale.trim();
    if (trimmed && !locales.includes(trimmed)) locales.push(trimmed);
  }
  return locales;
}

/** The first positional argument after `lint`; flags and their one value are skipped. */
function definitionPath(args: string[]): string | undefined {
  const valueTaking = new Set(["--locales"]);
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      if (valueTaking.has(arg)) i++;
      continue;
    }
    return arg;
  }
  return undefined;
}

function printHelp(): void {
  log.heading("faqir rules");
  log.blank();
  console.log("Check a form-rules definition before anything runs it.");
  log.blank();
  console.log("Usage:");
  log.table([
    ["faqir rules lint <def.json>", "Lint a definition file"],
    ["faqir rules lint --stdin", "Lint a definition read from stdin"],
  ]);
  log.blank();
  console.log("Options:");
  log.table([
    ["--stdin", "Read the definition from stdin instead of a file"],
    ["--locales <a,b>", "Locales that must be complete, e.g. --locales en,ro"],
    ["--json", "Machine-readable output"],
  ]);
  log.blank();
  console.log("Rules:");
  log.table([
    ["schema", "The definition does not match rules.schema.json"],
    ["rule-verb", "A rule with zero or two verbs"],
    ["rule-ops", "An unsupported operator, a bad arity, a malformed node"],
    ["rule-refs", "A path — a target or a var — that names no field"],
    ["rule-cycles", "compute rules that depend on each other in a cycle"],
    ["rule-unreachable", "A when (or a validate) that is constant after folding"],
    ["rule-messages", "A message key that addresses nothing, or a locale gap"],
  ]);
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const SEVERITY_COLOR = { error: "\x1b[31m", warning: "\x1b[33m" } as const;
const SEVERITY_ICON = { error: "✗", warning: "⚠" } as const;

/**
 * The human report, on **one stream**. Findings go to stdout through
 * `console.log` — the same choice `printAuditReport` makes — because `log.error`
 * writes to stderr, and a report split across two streams reads as two
 * unrelated halves the moment anything pipes it. `log.error` is kept for what
 * it is for: the command failing, rather than the definition.
 */
function printReport(report: RulesLintReport): void {
  log.heading(`faqir rules lint — ${report.source}`);
  log.blank();
  if (report.findings.length === 0) {
    log.success("No findings. Every rule can do what it says.");
    return;
  }
  for (const finding of report.findings) {
    const where = finding.id ? `${finding.path} ("${finding.id}")` : finding.path || "<definition>";
    const color = SEVERITY_COLOR[finding.severity];
    console.log(`${color}${SEVERITY_ICON[finding.severity]}${RESET} ${BOLD}${finding.rule}${RESET}  ${DIM}${where}${RESET}`);
    console.log(`  ${finding.message}`);
  }
  log.blank();
  const { error, warning } = report.counts;
  const summary = `${error} error${error === 1 ? "" : "s"}, ${warning} warning${warning === 1 ? "" : "s"}`;
  if (report.ok) log.success(`${summary} — nothing that stops a rule from running.`);
  else console.log(`${SEVERITY_COLOR.error}${summary}${RESET}`);
}

/**
 * A lint that could not look at the definition at all — no path, an unreadable
 * file, bytes that are not JSON — still answers in the report's own shape under
 * `--json`: an agent asking "is this definition good" parses one document
 * whatever went wrong, and `ok: false` with exit 1 is the answer.
 */
function refuse(jsonMode: boolean, source: string, message: string, human?: () => void): never {
  const report: RulesLintReport = {
    rules_lint_schema_version: RULES_LINT_SCHEMA_VERSION,
    source,
    ok: false,
    counts: { error: 1, warning: 0 },
    findings: [{ rule: "schema", severity: "error", path: "", message }],
  };
  if (jsonMode) emitJSON(report);
  else if (human) human();
  else printReport(report);
  process.exit(1);
}

async function lint(args: string[]): Promise<void> {
  const jsonMode = args.includes("--json");
  const fromStdin = args.includes("--stdin");
  const path = definitionPath(args);

  if (!fromStdin && !path) {
    refuse(jsonMode, "", "no definition given: pass a file path, or --stdin.", () => {
      log.error("faqir rules lint needs a definition: a file path, or --stdin.");
      log.step("Try: faqir rules lint form.rules.json");
    });
  }

  const source = fromStdin ? "<stdin>" : (path as string);
  let text: string;
  try {
    text = fromStdin
      ? await readStdin()
      : readFileSync(isAbsolute(source) ? source : resolve(process.cwd(), source), "utf8");
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    refuse(jsonMode, source, `could not read the definition: ${why}`, () => {
      log.error(`Could not read ${source}: ${why}`);
    });
  }

  let definition: unknown;
  try {
    definition = JSON.parse(text);
  } catch (err) {
    // A file that is not JSON is still a lint answer, not a crash.
    refuse(jsonMode, source, `not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result = lintDefinition(definition, { locales: parseLocales(args) });
  const report: RulesLintReport = {
    rules_lint_schema_version: RULES_LINT_SCHEMA_VERSION,
    source,
    ok: result.ok,
    counts: result.counts,
    findings: result.findings,
  };

  if (jsonMode) emitJSON(report);
  else printReport(report);

  if (!report.ok) process.exit(1);
}

export async function rules(args: string[]): Promise<void> {
  // `--help` must never do the thing it is asking about, and a bare
  // `faqir rules --json` is a question about the command, not a lint of
  // nothing: both print the help (into the `--json` envelope, in that mode).
  const subcommand = args.length > 0 && !args[0].startsWith("-") ? args[0] : undefined;
  if (subcommand === undefined || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (subcommand === "lint") return lint(args);

  log.error(`Unknown subcommand "${subcommand}". faqir rules knows: lint.`);
  log.step(`Lint rules: ${LINT_RULES.join(", ")}`);
  process.exit(1);
}
