import { describe, it, expect } from "bun:test";
import { makeRng, generateHTML, checkInvariants, generateAt, type FuzzBudget } from "./fuzz-core";

// Seeded property runs for the HTML parser (task 0.5-09, §9.1, §12.7).
//
// Properties asserted for every generated input (see checkInvariants):
//   • never throws            — no parser entry point raises
//   • never hangs             — each parse is time-bounded
//   • node ranges in bounds    — every token/element offset ∈ [0, input.length]
//   • stability                — parseHTML is deterministic (round-trip proxy;
//                                the parser has no HTML serializer, so the literal
//                                parse(serialize(parse(x))) is not applicable)
//
// Determinism in CI: the seed set and per-seed iteration count are FIXED here, so
// the exact same inputs run on every machine. Total generations N is asserted
// below so the count can't silently drift.
//
// Extended local fuzzing (documented for contributors):
//   bun run fuzz:parser                 # default seed, 10k iterations
//   bun run fuzz:parser 424242 1000000  # a specific seed, 1M iterations
// The standalone runner writes any crasher it finds to
// tests/fixtures/malformed/fuzz-<seed>-<i>.crasher.html for pinning.

// Fixed CI seeds — chosen once, never derived from the clock.
const CI_SEEDS = [1, 7, 42, 1337, 90210, 0xc0ffee, 0xbadf00d, 314159, 271828, 999983, 424242, 8675309];
const ITERATIONS_PER_SEED = 1500;
const CI_GENERATIONS = CI_SEEDS.length * ITERATIONS_PER_SEED; // N = 18,000

// CI runs a smaller size budget so 18k generations stay fast; the pathological
// extremes (60k-deep nesting, 64 KiB attributes) are pinned as corpus fixtures
// and dedicated regression tests instead. The standalone fuzzer keeps the full
// DEFAULT_BUDGET, so extended local runs still explore the large sizes.
const CI_BUDGET: FuzzBudget = { maxDepth: 600, maxAttrLen: 4000 };

describe("HTML parser fuzz (seeded property runs)", () => {
  it(`runs a fixed, documented number of generations (N = ${CI_GENERATIONS})`, () => {
    // Pin N so nobody quietly shrinks coverage; 12 seeds × 1,500 = 18,000.
    expect(CI_GENERATIONS).toBe(18_000);
  });

  for (const seed of CI_SEEDS) {
    it(`seed ${seed}: ${ITERATIONS_PER_SEED} generations satisfy every invariant`, () => {
      const rng = makeRng(seed);
      for (let i = 0; i < ITERATIONS_PER_SEED; i++) {
        const input = generateHTML(rng, CI_BUDGET);
        const { violations } = checkInvariants(input, { timeBudgetMs: 3000 });
        if (violations.length > 0) {
          // Surface the reproducing seed and a preview so a failure is actionable.
          const preview = JSON.stringify(input.slice(0, 200));
          throw new Error(
            `invariant violation at seed=${seed} iteration=${i} (len=${input.length}):\n` +
              violations.map((x) => `  • ${x}`).join("\n") +
              `\ninput[0..200]=${preview}`,
          );
        }
      }
      expect(true).toBe(true);
    });
  }

  it("generateAt(seed, i) is reproducible (same bytes every call)", () => {
    // The (seed, index) addressing the standalone runner reports must be stable,
    // or a reported crasher couldn't be reproduced.
    for (const [seed, i] of [[42, 0], [42, 99], [1337, 7]] as const) {
      expect(generateAt(seed, i)).toBe(generateAt(seed, i));
    }
    // Different coordinates should (essentially always) differ.
    expect(generateAt(42, 0)).not.toBe(generateAt(42, 1));
  });
});
