// Waiting for DOM work that lands on a later turn, without guessing how many.
//
// Why this exists: several suites assert on work the engine (or a recipe
// controller) performs from a `MutationObserver` callback — the `l-cloak` sweep
// over late-inserted nodes, tree-view's ARIA refresh after an `l-for`
// reconciliation. happy-dom delivers those callbacks on a real microtask, so
// `await tick()` — a `setTimeout(0)` — normally drains them, and the assertion
// that follows passes.
//
// "Normally" is the problem. Bun runs the whole main partition in ONE process
// sharing ONE happy-dom realm (see `scripts/test.mjs`), so by the time a late
// file runs, the queue it inherits is not empty: pending effects, observers and
// timers left by ~170 earlier files. Under that load the mutation can be
// delivered one turn further out than the test allowed, and a test that spent
// its single tick asserts against a pre-refresh DOM. Observed on a clean tree at
// `1f36b0f`: `tests/recipes/tree-view-reactive.test.ts` failed 3 full-suite runs
// in 4 (`aria-posinset` still `"1"` after a reorder that should make it `"2"`),
// `tests/core/lifecycle.test.ts`'s late-append `l-cloak` case failed the fourth.
// Both pass in isolation, and no single earlier file reproduces it — the trigger
// is the accumulated queue, which is exactly the thing a fixed tick count cannot
// be calibrated against.
//
// Counting ticks harder is not the fix: `await tick(); await tick()` (which
// lifecycle.test.ts used, with a comment predicting this) just moves the cliff.
// `settle()` waits for the *condition* instead, one turn at a time, bounded. A
// loaded machine spends more turns and still passes; an engine that never
// refreshes exhausts the budget and fails with a legible message, which is the
// regression the test was written to catch.
//
// Use it whenever the thing you assert on is produced by an observer, a queued
// effect or a timer you do not control. Deterministic work — anything the API
// does synchronously, or the explicit `refresh()` hooks controllers expose —
// needs no wait at all; prefer those where a recipe offers one.

/** One macrotask turn: resolves after the microtask queue has drained. */
export function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generous enough to absorb a fully loaded shared realm, small enough that a
 * genuine regression fails in well under a second rather than hanging out to
 * bun's per-test timeout. Each turn is a `setTimeout(0)`, so the ceiling is
 * turns × (timer granularity + whatever else the queue is holding).
 */
export const SETTLE_TURNS = 50;

/**
 * Wait until `condition()` is true, polling once per macrotask turn.
 *
 * Returns as soon as the condition holds — the fast path costs one extra
 * predicate call and no turns at all when the work has already landed. Throws
 * after `turns` unsuccessful turns, naming `what` so the failure reads as the
 * missing behavior rather than as a timeout somewhere in the DOM.
 *
 * A predicate that throws (an element that is not there *yet*) counts as
 * not-settled, so probes can address nodes the pending work is about to create.
 * The last error is reported if the budget runs out, so a probe that is simply
 * wrong still says why.
 */
export async function settle(
  condition: () => boolean,
  what: string,
  turns: number = SETTLE_TURNS,
): Promise<void> {
  let lastError: unknown;
  for (let turn = 0; turn <= turns; turn++) {
    try {
      if (condition()) return;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (turn < turns) await tick();
  }
  const because = lastError instanceof Error ? ` (probe threw: ${lastError.message})` : "";
  throw new Error(`settle: gave up after ${turns} turns waiting for ${what}${because}`);
}
