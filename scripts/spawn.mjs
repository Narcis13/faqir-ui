/**
 * Wall-clock budgets for the subprocesses the build scripts launch.
 *
 * Same reason as `tests/helpers/spawn.ts`: `spawnSync` blocks its caller for
 * the child's entire life, so a child that never exits does not fail a build —
 * it suspends it, with no output and no exit code. Every `spawnSync` in
 * `scripts/` and in each package's `build.mjs` therefore carries a budget, and
 * `tests/meta/spawn-timeouts.test.ts` fails if a new one does not.
 *
 * `killSignal` is SIGKILL throughout: SIGTERM is ignorable, and the child that
 * hangs is exactly the child that might ignore it.
 *
 * Plain ESM with no dependencies — these scripts run under `node` as well as
 * `bun` (`build:cli` and `build:core-package` are invoked with `node`).
 */
import { spawnSync } from "node:child_process";

/**
 * Budget for one bundler pass (`bun build`). Generous, because a cold Bun on a
 * loaded CI runner is slow; the point is to bound a hang, not to police speed.
 * Override with `FAQIR_SPAWN_TIMEOUT_MS` on a machine that needs longer.
 */
export const BUILD_TIMEOUT_MS = (() => {
  const raw = Number(process.env.FAQIR_SPAWN_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 180_000;
})();

/** `spawnSync` with a mandatory budget and a non-ignorable kill. */
export function spawnBudgeted(command, args, options = {}) {
  return spawnSync(command, args, {
    killSignal: "SIGKILL",
    ...options,
    timeout: options.timeout ?? BUILD_TIMEOUT_MS,
  });
}

/** True when `result` came back because its budget expired, not for any other reason. */
export function isTimeout(result) {
  return result?.error?.code === "ETIMEDOUT";
}

/** One line explaining the kill, and the knob that lifts it. */
export function timeoutMessage(command, args = [], timeoutMs = BUILD_TIMEOUT_MS) {
  const shown = [command, ...args].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ");
  return (
    `timed out after ${timeoutMs}ms and was killed: ${shown}\n` +
    `Raise the budget with FAQIR_SPAWN_TIMEOUT_MS=<ms> if this machine is simply slow.\n`
  );
}
