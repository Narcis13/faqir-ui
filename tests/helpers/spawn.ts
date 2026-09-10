// Every synchronous subprocess the suite launches, with a wall-clock budget.
//
// Why this exists: `bun test`'s per-test timeout is cooperative — it can only
// fire between turns of the event loop, and `spawnSync` blocks the loop for its
// entire duration. So a child that never exits does not fail its test, it
// *suspends the whole run*: observed five times on macOS, once for 12.3 minutes
// inside a test declaring a 60s budget. A suite that hangs instead of failing
// is worse than a red one, because nothing downstream of it ever reports.
//
// The fix is per-spawn, because the timeout has to be enforced by the kernel
// (`spawnSync`'s own `timeout` option) rather than by the test runner. Two
// wrappers below cover the two spawn APIs the suite uses; both:
//
//   - default `killSignal` to SIGKILL, since SIGTERM is ignorable and the child
//     that hangs is exactly the child that might ignore it;
//   - throw `SpawnTimeoutError` on expiry with the command, cwd, budget and the
//     tail of whatever the child managed to emit — a hang diagnosed from the
//     failure message instead of from an interrupted run;
//   - pass every other failure (ENOENT included) through untouched, so callers
//     that probe for an optional binary keep working.
//
// `tests/meta/spawn-timeouts.test.ts` fails if a new call site skips them.

import { spawnSync } from "node:child_process";
import type { SpawnSyncOptions, SpawnSyncReturns } from "node:child_process";

/**
 * Multiplier for every budget below, for machines slower than the ones these
 * numbers were measured on. `FAQIR_TEST_SPAWN_SCALE=3 bun run test` triples
 * them. Invalid or non-positive values fall back to 1.
 */
export const SPAWN_SCALE = (() => {
  const raw = Number(process.env.FAQIR_TEST_SPAWN_SCALE);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
})();

const scale = (ms: number) => Math.round(ms * SPAWN_SCALE);

/**
 * Named budgets, one per class of work — a `--version` probe and a cold
 * `vue-tsc` do not deserve the same one. Each is an order of magnitude above
 * what that class costs in health, because the job is to bound a hang, not to
 * police speed; `FAQIR_TEST_SPAWN_SCALE` lifts them all on a slow machine.
 *
 *   QUICK — a probe: `git init`, `lsof`, `node --version`. Sub-second in health.
 *   CLI   — one `faqir` invocation, source or bundle. ~1s in health.
 *   BUILD — a bundler or type-checker pass: `bun build`, `tsc`, `vue-tsc`,
 *           `build:core-package`. Tens of seconds cold, and the slowest thing
 *           the suite shells out to.
 *
 * Where a test declares its own bun timeout, prefer to keep it *above* the
 * budget it uses: then the thrown `SpawnTimeoutError` — which names the command
 * and its output — is what the run reports, rather than the runner's generic
 * "test timed out", which names nothing. Either way the run is bounded.
 */
export const SPAWN_TIMEOUT = {
  QUICK: scale(10_000),
  CLI: scale(30_000),
  BUILD: scale(90_000),
} as const;

/**
 * How many times to attempt a spawn of `command` before reporting a timeout.
 *
 * **Bun's `spawnSync` intermittently hangs when the child is also Bun.** The
 * child never executes — no stdout, no stderr, not a byte — and is killed at the
 * budget. Measured on Bun 1.3.8, spawning `bun src/index.ts doctor --json`:
 *
 *   | parent → child        | hangs   |
 *   |-----------------------|---------|
 *   | bun  → bun (source)   | 4 / 120 |
 *   | node → bun (source)   | 0 / 120 |
 *   | bun  → node (bundle)  | 0 / 40  |
 *
 * Neither runtime is at fault alone; it is the pairing. `bun test` is the runner,
 * so the parent is always Bun and every test that shells out to `bun` is exposed
 * at roughly 2-3% per spawn. A file spawning ~50 CLIs therefore failed about two
 * runs in three — always a *different* command, which is what proved it was not a
 * defect in any of them. It stalled the release preflight in exactly this way.
 *
 * The stdio shape is irrelevant: `["pipe","pipe","pipe"]` with no input — what
 * the CLI tests use — hung 0/40 in one sample and `["ignore","pipe","pipe"]` hung
 * 1/40, i.e. the same rate within noise. An open stdin pipe is not the cause.
 *
 * So a Bun child gets one retry, and only when the timeout was **silent**. A
 * child that produced output and then stalled is a genuine hang, and reporting it
 * on the first sighting is worth more than the retry would save. Two silent
 * timeouts in a row still fail — a real infinite loop costs twice the budget and
 * is then reported, which is the right trade for a flake this frequent.
 *
 * Revisit when Bun fixes it; delete this and the retry loops together.
 */
const SPAWN_ATTEMPTS = (command: string): number => {
  const base = command.split("/").pop() ?? command;
  return base === "bun" || base === "bun-debug" ? 2 : 1;
};

/** Thrown when a child outlives its budget; never for any other failure. */
export class SpawnTimeoutError extends Error {
  readonly command: string;
  readonly timeoutMs: number;
  readonly elapsedMs: number;

  constructor(opts: {
    command: string;
    timeoutMs: number;
    elapsedMs: number;
    cwd?: string;
    stdout?: string;
    stderr?: string;
  }) {
    const detail = [
      `subprocess exceeded its ${opts.timeoutMs}ms budget (killed after ${opts.elapsedMs}ms)`,
      `  command: ${opts.command}`,
      ...(opts.cwd ? [`  cwd:     ${opts.cwd}`] : []),
      ...tail("stdout", opts.stdout),
      ...tail("stderr", opts.stderr),
      SPAWN_SCALE === 1
        ? "  (raise every budget with FAQIR_TEST_SPAWN_SCALE=<n> if this machine is simply slow)"
        : `  (FAQIR_TEST_SPAWN_SCALE=${SPAWN_SCALE} was already applied)`,
    ].join("\n");
    super(detail);
    this.name = "SpawnTimeoutError";
    this.command = opts.command;
    this.timeoutMs = opts.timeoutMs;
    this.elapsedMs = opts.elapsedMs;
  }
}

/** Last 2000 chars of a stream, as message lines. Empty streams say so. */
function tail(label: string, text: string | undefined): string[] {
  if (text === undefined) return [];
  const trimmed = text.trimEnd();
  if (!trimmed) return [`  ${label}:  (empty)`];
  const clipped = trimmed.length > 2000 ? `…${trimmed.slice(-2000)}` : trimmed;
  return [`  ${label}:`, ...clipped.split("\n").map((l) => `    ${l}`)];
}

function describe(command: string, args: readonly string[]): string {
  return [command, ...args].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ");
}

/** A stream as text, whichever shape it came back in. `null` (an inherited or
 * ignored stream) has nothing to report, and says so by being omitted. */
function asText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8");
  return undefined;
}

export interface RunSyncOptions extends Omit<SpawnSyncOptions, "timeout"> {
  /** Wall-clock budget in ms. Defaults to `SPAWN_TIMEOUT.CLI`. */
  timeout?: number;
}

/**
 * `node:child_process` spawnSync with a mandatory budget. Same return shape as
 * `spawnSync`, so call sites keep reading `status` / `stdout` / `stderr`.
 */
export function runSync(
  command: string,
  args: readonly string[] = [],
  options: RunSyncOptions = {},
): SpawnSyncReturns<string> {
  const timeout = options.timeout ?? SPAWN_TIMEOUT.CLI;
  const attempts = SPAWN_ATTEMPTS(command);
  let expiry: SpawnTimeoutError | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    const result = spawnSync(command, [...args], {
      killSignal: "SIGKILL",
      ...options,
      timeout,
    } as SpawnSyncOptions) as SpawnSyncReturns<string>;
    const elapsed = Date.now() - started;

    if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT") {
      const stdout = asText(result.stdout);
      const stderr = asText(result.stderr);
      expiry = new SpawnTimeoutError({
        command: describe(command, args),
        timeoutMs: timeout,
        elapsedMs: elapsed,
        cwd: typeof options.cwd === "string" ? options.cwd : undefined,
        stdout,
        stderr,
      });
      // Silent expiry of a Bun child only — see SPAWN_ATTEMPTS.
      if (attempt < attempts && !stdout && !stderr) continue;
      throw expiry;
    }
    return result;
  }
  throw expiry as SpawnTimeoutError;
}

export type RunSyncBunOptions = NonNullable<Parameters<typeof Bun.spawnSync>[1]> & {
  /** Wall-clock budget in ms. Defaults to `SPAWN_TIMEOUT.CLI`. */
  timeout?: number;
  killSignal?: string;
  cwd?: string;
};

/**
 * `Bun.spawnSync` with a mandatory budget. Same return shape as
 * `Bun.spawnSync`, so call sites keep reading `exitCode` / `stdout` / `stderr`.
 *
 * Bun flags an expiry on the result (`exitedDueToTimeout`), which is what this
 * reads; the elapsed-time comparison is the fallback for a Bun old enough not
 * to set it. Neither is `exitCode === null` alone — a child that signals itself
 * looks identical, and reporting that as a stall would send the next reader
 * hunting a hang that never happened.
 */
export function runSyncBun(
  cmd: readonly string[],
  options: RunSyncBunOptions = {},
): Bun.SyncSubprocess<"pipe", "pipe"> {
  const timeout = options.timeout ?? SPAWN_TIMEOUT.CLI;
  const killSignal = options.killSignal ?? "SIGKILL";
  const attempts = SPAWN_ATTEMPTS(cmd[0] ?? "");
  let expiry: SpawnTimeoutError | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    const result = Bun.spawnSync([...cmd], {
      ...options,
      killSignal,
      timeout,
    }) as Bun.SyncSubprocess<"pipe", "pipe">;
    const elapsed = Date.now() - started;

    const expired = result.exitedDueToTimeout === true ||
      (result.exitCode === null && result.signalCode === killSignal && elapsed >= timeout);
    if (expired) {
      const stdout = asText(result.stdout);
      const stderr = asText(result.stderr);
      expiry = new SpawnTimeoutError({
        command: describe(cmd[0] ?? "", cmd.slice(1)),
        timeoutMs: timeout,
        elapsedMs: elapsed,
        cwd: options.cwd,
        stdout,
        stderr,
      });
      // Silent expiry of a Bun child only — see SPAWN_ATTEMPTS.
      if (attempt < attempts && !stdout && !stderr) continue;
      throw expiry;
    }
    return result;
  }
  throw expiry as SpawnTimeoutError;
}
