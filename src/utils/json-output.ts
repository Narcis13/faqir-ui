// Universal `--json` guarantee for the faqir CLI.
//
// Every command accepts `--json` and, in that mode, stdout is guaranteed to be a
// single machine-readable JSON document — nothing else. Two shapes satisfy the
// contract:
//
//   • Bespoke — a command that has a stable, documented JSON schema (audit, diff,
//     upgrade, inspect, explain, trace, context) emits it via {@link emitJSON}.
//     That writes the object straight to the real stdout and marks the run as
//     "handled", so no envelope is appended.
//
//   • Envelope — a command with no bespoke schema still honors `--json`: while in
//     JSON mode all human console output is captured (not printed), and on exit a
//     single {@link JSON_ENVELOPE_VERSION}-stamped envelope is flushed carrying the
//     captured messages, the resolved exit code, and any error.
//
// The net effect enforced by the meta-test: `<any command> --json` → exactly one
// parseable JSON document on stdout, including on non-zero exit / error paths.

/** Envelope schema version for the generic (non-bespoke) `--json` fallback. */
export const JSON_ENVELOPE_VERSION = 1;

type MessageLevel = "log" | "info" | "warn" | "error";

interface CapturedMessage {
  level: MessageLevel;
  text: string;
}

interface CliJsonEnvelope {
  json_schema_version: number;
  command: string;
  ok: boolean;
  exit_code: number;
  messages: CapturedMessage[];
  error?: { message: string };
}

const ANSI = /\x1b\[[0-9;]*m/g;

let active = false;
let commandName = "";
let handledExternally = false;
let flushed = false;
let explicitError: string | undefined;
const messages: CapturedMessage[] = [];

// Real console methods, captured before any patching so the flush and `emitJSON`
// can always reach true stdout/stderr regardless of the active capture.
const realConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function stringifyArgs(args: unknown[]): string {
  return args
    .map((a) => (typeof a === "string" ? a : a === undefined ? "" : String(a)))
    .join(" ")
    .replace(ANSI, "");
}

/**
 * Detect `--json` for `command` and, when present, arm JSON mode: patch the
 * console so all human output is captured instead of printed, and register the
 * single-envelope flush on process exit. Returns whether JSON mode is active.
 * A no-op (returns false) when `--json` is absent.
 */
export function initJSONMode(command: string, args: string[]): boolean {
  active = args.includes("--json");
  commandName = command;
  if (!active) return false;

  console.log = (...a: unknown[]) => void messages.push({ level: "log", text: stringifyArgs(a) });
  console.info = (...a: unknown[]) => void messages.push({ level: "info", text: stringifyArgs(a) });
  console.warn = (...a: unknown[]) => void messages.push({ level: "warn", text: stringifyArgs(a) });
  console.error = (...a: unknown[]) => void messages.push({ level: "error", text: stringifyArgs(a) });

  process.on("exit", flushEnvelope);
  return true;
}

/** Whether the current run is in `--json` mode. */
export function isJSONMode(): boolean {
  return active;
}

/**
 * Emit a command's bespoke JSON document to the real stdout and mark the run as
 * handled so the generic envelope is suppressed. Use this from any command that
 * owns a stable JSON schema.
 */
export function emitJSON(payload: unknown): void {
  handledExternally = true;
  const text = JSON.stringify(payload, null, 2);
  // When capture is armed, bypass the buffering patch and write the real JSON to
  // stdout. Otherwise defer to the live `console.log` so in-process callers (and
  // tests that spy on it) observe the output normally.
  if (active) {
    realConsole.log(text);
  } else {
    console.log(text);
  }
}

/**
 * Record a structured error for the generic envelope (called from the CLI's
 * top-level catch). Bespoke commands that already emitted their own JSON are
 * unaffected.
 */
export function recordJSONError(err: unknown): void {
  explicitError = err instanceof Error ? err.message : String(err);
}

/**
 * Flush the single generic envelope on process exit. No-op when JSON mode is
 * off, when a bespoke command already owned stdout, or if already flushed.
 */
function flushEnvelope(): void {
  if (!active || handledExternally || flushed) return;
  flushed = true;

  const exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
  const ok = exitCode === 0 && explicitError === undefined;

  const envelope: CliJsonEnvelope = {
    json_schema_version: JSON_ENVELOPE_VERSION,
    command: commandName,
    ok,
    exit_code: exitCode,
    messages,
  };

  if (!ok) {
    // Prefer an explicitly recorded error; otherwise surface the first captured
    // error-level message so the failure reason is not lost.
    const firstError = messages.find((m) => m.level === "error");
    envelope.error = { message: explicitError ?? firstError?.text ?? "Command failed" };
  }

  realConsole.log(JSON.stringify(envelope, null, 2));
}

/** Test-only: reset module state between assertions in the same process. */
export function __resetJSONMode(): void {
  active = false;
  commandName = "";
  handledExternally = false;
  flushed = false;
  explicitError = undefined;
  messages.length = 0;
  console.log = realConsole.log;
  console.info = realConsole.info;
  console.warn = realConsole.warn;
  console.error = realConsole.error;
}
