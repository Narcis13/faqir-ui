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
//
// ── Why the state lives on globalThis ────────────────────────────────────────
// The Node-compatible bundle (`bun build --target=node`) can split a single
// module across two fragments by symbol usage: `emitJSON` may land in one scope
// and `initJSONMode`/`flushEnvelope` in another, each with its OWN copy of the
// module-level `let`s. If that state were plain module bindings, `emitJSON`
// marking the run "handled" would be invisible to `flushEnvelope`, and both the
// bespoke document AND the generic envelope would be printed. Holding the state
// on a single globalThis-keyed record makes every fragment read and write the
// same object, so the module behaves as a true singleton regardless of how the
// bundler duplicates it.

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

type ConsoleFn = (...args: unknown[]) => void;

interface JSONOutputState {
  active: boolean;
  commandName: string;
  handledExternally: boolean;
  flushed: boolean;
  exitHookInstalled: boolean;
  explicitError: string | undefined;
  messages: CapturedMessage[];
  // Real console methods, captured before any patching so the flush and
  // `emitJSON` can always reach true stdout/stderr regardless of the active
  // capture. Captured lazily on first `state()` access, which — because
  // `initJSONMode` is the CLI's first touch point — happens before any patch.
  realConsole: { log: ConsoleFn; info: ConsoleFn; warn: ConsoleFn; error: ConsoleFn };
}

const ANSI = /\x1b\[[0-9;]*m/g;

// A single shared record, keyed on globalThis so every (possibly duplicated)
// copy of this module in the compiled bundle observes the same state.
const STATE_KEY = Symbol.for("faqir.utils.json-output.state");

function state(): JSONOutputState {
  const g = globalThis as unknown as Record<symbol, JSONOutputState | undefined>;
  let s = g[STATE_KEY];
  if (!s) {
    s = {
      active: false,
      commandName: "",
      handledExternally: false,
      flushed: false,
      exitHookInstalled: false,
      explicitError: undefined,
      messages: [],
      realConsole: {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
      },
    };
    g[STATE_KEY] = s;
  }
  return s;
}

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
  const s = state();
  s.active = args.includes("--json");
  s.commandName = command;
  if (!s.active) return false;

  console.log = (...a: unknown[]) => void s.messages.push({ level: "log", text: stringifyArgs(a) });
  console.info = (...a: unknown[]) => void s.messages.push({ level: "info", text: stringifyArgs(a) });
  console.warn = (...a: unknown[]) => void s.messages.push({ level: "warn", text: stringifyArgs(a) });
  console.error = (...a: unknown[]) => void s.messages.push({ level: "error", text: stringifyArgs(a) });

  if (!s.exitHookInstalled) {
    s.exitHookInstalled = true;
    process.on("exit", flushEnvelope);
  }
  return true;
}

/** Whether the current run is in `--json` mode. */
export function isJSONMode(): boolean {
  return state().active;
}

/**
 * Emit a command's bespoke JSON document to the real stdout and mark the run as
 * handled so the generic envelope is suppressed. Use this from any command that
 * owns a stable JSON schema.
 */
export function emitJSON(payload: unknown): void {
  const s = state();
  s.handledExternally = true;
  const text = JSON.stringify(payload, null, 2);
  // When capture is armed, bypass the buffering patch and write the real JSON to
  // stdout. Otherwise defer to the live `console.log` so in-process callers (and
  // tests that spy on it) observe the output normally.
  if (s.active) {
    s.realConsole.log(text);
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
  state().explicitError = err instanceof Error ? err.message : String(err);
}

/**
 * Flush the single generic envelope on process exit. No-op when JSON mode is
 * off, when a bespoke command already owned stdout, or if already flushed.
 */
function flushEnvelope(): void {
  const s = state();
  if (!s.active || s.handledExternally || s.flushed) return;
  s.flushed = true;

  const exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
  const ok = exitCode === 0 && s.explicitError === undefined;

  const envelope: CliJsonEnvelope = {
    json_schema_version: JSON_ENVELOPE_VERSION,
    command: s.commandName,
    ok,
    exit_code: exitCode,
    messages: s.messages,
  };

  if (!ok) {
    // Prefer an explicitly recorded error; otherwise surface the first captured
    // error-level message so the failure reason is not lost.
    const firstError = s.messages.find((m) => m.level === "error");
    envelope.error = { message: s.explicitError ?? firstError?.text ?? "Command failed" };
  }

  s.realConsole.log(JSON.stringify(envelope, null, 2));
}

/** Test-only: reset module state between assertions in the same process. */
export function __resetJSONMode(): void {
  const s = state();
  s.active = false;
  s.commandName = "";
  s.handledExternally = false;
  s.flushed = false;
  s.explicitError = undefined;
  s.messages.length = 0;
  console.log = s.realConsole.log;
  console.info = s.realConsole.info;
  console.warn = s.realConsole.warn;
  console.error = s.realConsole.error;
}
