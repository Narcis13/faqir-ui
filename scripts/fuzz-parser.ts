#!/usr/bin/env bun
// ─────────────────────────────────────────────────────────────────────────────
// fuzz-parser.ts — standalone HTML-parser fuzzer (task 0.5-09)
//
//   bun run fuzz:parser                 # default seed, 10k iterations
//   bun run fuzz:parser 12345           # explicit seed
//   bun run fuzz:parser 12345 500000    # seed + iteration count (extended run)
//   bun run fuzz:parser --seed 7 -n 1e6 # flag form
//
// Generates malformed HTML and asserts the parser invariants (never throws,
// never hangs, node ranges in bounds, deterministic). On the FIRST violation it
// prints the reproducing seed + iteration index + the offending input, writes
// the input to tests/fixtures/malformed/<...>.crasher.html for pinning, and
// exits non-zero. A clean run exits zero.
//
// This shares its generator and checker with the CI property tests
// (tests/parser/fuzz/fuzz-core.ts), so any crasher found here reproduces there.
// ─────────────────────────────────────────────────────────────────────────────

import {
  makeRng,
  generateHTML,
  checkInvariants,
  DEFAULT_BUDGET,
  type FuzzBudget,
} from "../tests/parser/fuzz/fuzz-core";

interface Args {
  seed: number;
  iterations: number;
  timeBudgetMs: number;
}

function parseArgs(argv: string[]): Args {
  const positional: number[] = [];
  let seed: number | undefined;
  let iterations: number | undefined;
  let timeBudgetMs = 2000;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed" || a === "-s") seed = Number(argv[++i]);
    else if (a === "--iterations" || a === "-n") iterations = Number(argv[++i]);
    else if (a === "--time-budget") timeBudgetMs = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: bun run fuzz:parser [seed] [iterations]\n" +
          "       bun run fuzz:parser --seed <n> --iterations <n> [--time-budget <ms>]",
      );
      process.exit(0);
    } else positional.push(Number(a));
  }

  return {
    seed: seed ?? positional[0] ?? 0xc0ffee,
    iterations: iterations ?? positional[1] ?? 10_000,
    timeBudgetMs,
  };
}

async function main() {
  const { seed, iterations, timeBudgetMs } = parseArgs(process.argv.slice(2));
  const budget: FuzzBudget = DEFAULT_BUDGET;

  // A single RNG stream seeded once — the (seed, iteration) pair below is what
  // makes any hit reproducible: rerun with the same seed and it reappears.
  const rng = makeRng(seed);
  console.log(
    `fuzzing parser: seed=${seed} iterations=${iterations} ` +
      `timeBudget=${timeBudgetMs}ms (deep≤${budget.maxDepth}, attr≤${budget.maxAttrLen})`,
  );

  const started = performance.now();
  let worstMs = 0;
  let longestInput = 0;

  for (let i = 0; i < iterations; i++) {
    const input = generateHTML(rng, budget);
    longestInput = Math.max(longestInput, input.length);
    const { violations, elapsedMs } = checkInvariants(input, { timeBudgetMs });
    worstMs = Math.max(worstMs, elapsedMs);

    if (violations.length > 0) {
      console.error(`\n✗ CRASHER at seed=${seed} iteration=${i} (len=${input.length})`);
      for (const v of violations) console.error(`  • ${v}`);

      const stamp = `${seed}-${i}`;
      const path = `tests/fixtures/malformed/fuzz-${stamp}.crasher.html`;
      await Bun.write(path, input);
      console.error(`\n  Reproducing input written to ${path}`);
      console.error(`  Pin it: keep the file and add a regression note, then fix the parser.`);
      process.exit(1);
    }

    if (iterations >= 50_000 && (i + 1) % 25_000 === 0) {
      console.log(`  … ${i + 1}/${iterations} clean (worst ${worstMs.toFixed(1)}ms)`);
    }
  }

  const totalMs = performance.now() - started;
  console.log(
    `\n✓ ${iterations} iterations clean in ${(totalMs / 1000).toFixed(1)}s ` +
      `(worst single parse ${worstMs.toFixed(1)}ms, longest input ${longestInput} chars)`,
  );
}

await main();
