// ═══════════════════════════════════════════════════════════════════════════
// Waiting for observer-delivered work is bounded by a condition, not by a count
// ═══════════════════════════════════════════════════════════════════════════
//
// The whole main partition shares one process and one happy-dom realm
// (`scripts/test.mjs`), so a file that runs late inherits every pending effect,
// observer and timer the ~170 files before it left behind. A test that spends a
// fixed number of `await tick()`s waiting for a `MutationObserver` callback is
// therefore calibrated against a queue it cannot see: it passes alone, passes in
// its own directory, and fails in the full run.
//
// That is not hypothetical. On a clean tree at `1f36b0f`,
// `tests/recipes/tree-view-reactive.test.ts` failed 3 of 4 full-suite runs
// (`aria-posinset` still `"1"` after a reorder that makes it `"2"`) and
// `tests/core/lifecycle.test.ts`'s late-append `l-cloak` case took the fourth —
// while every one of them passed in isolation. A red baseline that cannot be
// reproduced in isolation costs a session before it costs a bug.
//
// So this file has two halves, like `spawn-timeouts.test.ts`:
//
//   1. behavioural proof that `settle()` actually waits, actually returns early
//      and actually fails — a gate mandating a mechanism is worth nothing if the
//      mechanism does not work;
//   2. a source gate: no NEW consecutive `await tick()` pair anywhere in the
//      suite, with an explicit allow-list for the six that predate the helper.
//
// The allow-list is checked in both directions. A site that is converted must be
// removed from it, so the list shrinks toward zero instead of quietly becoming
// documentation of a habit.

import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SETTLE_TURNS, settle, tick } from "../helpers/settle";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("settle() waits for the condition rather than for a turn count", () => {
  it("returns without spending a turn when the condition already holds", async () => {
    let probes = 0;
    const before = Date.now();
    await settle(() => {
      probes++;
      return true;
    }, "an already-satisfied condition");
    expect(probes).toBe(1);
    expect(Date.now() - before).toBeLessThan(50);
  });

  it("keeps polling across turns until later work lands", async () => {
    let done = false;
    // Five nested turns out — further than any hand-counted wait in the suite,
    // and the shape of a delivery pushed back by an inherited queue.
    let queued = 0;
    const push = () => {
      if (++queued === 5) done = true;
      else setTimeout(push, 0);
    };
    setTimeout(push, 0);

    await settle(() => done, "five turns of queued work");
    expect(done).toBe(true);
  });

  it("resolves as soon as the condition flips, not after the full budget", async () => {
    let probes = 0;
    let ready = false;
    setTimeout(() => (ready = true), 0);
    await settle(() => {
      probes++;
      return ready;
    }, "a condition satisfied on the next turn");
    // One failed probe, one successful — nowhere near the ceiling.
    expect(probes).toBeLessThan(5);
    expect(probes).toBeGreaterThan(1);
  });

  it("throws naming the awaited behavior when the budget runs out", async () => {
    const failure = await settle(() => false, "a refresh that never happens", 2).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure!.message).toContain("a refresh that never happens");
    expect(failure!.message).toContain("2 turns");
  });

  it("treats a throwing probe as not-settled and reports it if the budget runs out", async () => {
    let node: { present: boolean } | null = null;
    setTimeout(() => (node = { present: true }), 0);
    // Addresses something the pending work has not created yet.
    await settle(() => node!.present, "a node created on a later turn");
    expect(node).not.toBeNull();

    const failure = await settle(() => {
      throw new Error("no such element");
    }, "an element that never arrives", 1).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure!.message).toContain("an element that never arrives");
    expect(failure!.message).toContain("no such element");
  });

  it("budgets enough turns to absorb a loaded shared realm", () => {
    // Small enough that a real regression fails fast, large enough that queue
    // pressure never decides the result. Both halves matter; pin the value so a
    // future edit has to argue with this comment.
    expect(SETTLE_TURNS).toBeGreaterThanOrEqual(20);
    expect(SETTLE_TURNS).toBeLessThanOrEqual(200);
  });

  it("tick() resolves after the microtask queue drains", async () => {
    const order: string[] = [];
    queueMicrotask(() => order.push("microtask"));
    await tick();
    order.push("tick");
    expect(order).toEqual(["microtask", "tick"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The source gate
// ───────────────────────────────────────────────────────────────────────────

/**
 * Consecutive `await tick()`s that predate `settle()`. Every one is a boot or
 * mount helper waiting for "render, then the stubbed fetch" — none has gone red
 * yet, and each needs a condition chosen by someone reading what it boots, so
 * they are recorded rather than converted blind (see the follow-up row for
 * 1.1A-22 in `FAQIR-PLAN-1.1.md`). Convert one → delete its entry here.
 */
const KNOWN_TICK_PAIRS: Record<string, number> = {
  "tests/core/faqir-mask.test.ts": 2,
  "tests/patterns/inbox.test.ts": 2,
  "tests/generator/engine-page.test.ts": 2,
};

const IS_TEST_SOURCE = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".faqir", "fixtures"]);
const TICK_PAIR = /await tick\([^)]*\);\s*\n\s*await tick\([^)]*\);/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (IS_TEST_SOURCE.test(entry)) out.push(full);
  }
  return out;
}

function tickPairCounts(): Record<string, number> {
  const roots = [join(ROOT, "tests"), join(ROOT, "packages")];
  const counts: Record<string, number> = {};
  for (const root of roots) {
    for (const file of walk(root)) {
      const matches = readFileSync(file, "utf8").match(TICK_PAIR);
      if (matches) counts[relative(ROOT, file)] = matches.length;
    }
  }
  return counts;
}

describe("no new tick-counting waits", () => {
  it("finds no consecutive `await tick()` outside the recorded sites", () => {
    const offenders = Object.entries(tickPairCounts())
      .filter(([file, count]) => (KNOWN_TICK_PAIRS[file] ?? 0) < count)
      .map(([file, count]) => `${file}: ${count} pair(s), ${KNOWN_TICK_PAIRS[file] ?? 0} allowed`);
    expect(offenders).toEqual([]);
  });

  it("keeps the allow-list honest — a converted site must be delisted", () => {
    const counts = tickPairCounts();
    const stale = Object.keys(KNOWN_TICK_PAIRS).filter(
      (file) => (counts[file] ?? 0) < KNOWN_TICK_PAIRS[file],
    );
    expect(stale).toEqual([]);
  });

  it("is not vacuous — the scan reaches real test sources", () => {
    const scanned = [...walk(join(ROOT, "tests")), ...walk(join(ROOT, "packages"))];
    expect(scanned.length).toBeGreaterThan(150);
    expect(scanned.some((f) => f.endsWith("tests/core/lifecycle.test.ts"))).toBe(true);
  });

  it("holds for the two files whose flakes motivated the helper", () => {
    for (const file of [
      "tests/core/lifecycle.test.ts",
      "tests/recipes/tree-view-reactive.test.ts",
    ]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).toContain("helpers/settle");
      expect(source.match(TICK_PAIR)).toBeNull();
    }
  });
});
