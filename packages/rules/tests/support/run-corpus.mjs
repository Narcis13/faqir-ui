// Runs the golden corpus and prints the result as JSON. Not a test file — it is
// the *subject* of one: `isomorphic.test.ts` executes it in a second runtime and
// diffs the output against the verdicts it computed in its own realm.
//
// Deliberately self-contained (no import of `../corpus.ts`), because the whole
// point is to be launchable by a bare `bun packages/rules/tests/support/run-corpus.mjs`
// with no preload, no test runner and therefore no DOM globals in scope.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { coerce, validate } = await import(join(here, "..", "..", "src", "index.js"));

const goldenDir = join(here, "..", "golden");
const results = [];
for (const file of readdirSync(goldenDir).filter((f) => f.endsWith(".json")).sort()) {
  for (const entry of JSON.parse(readFileSync(join(goldenDir, file), "utf8"))) {
    const data = entry.raw === undefined ? entry.data : coerce(entry.definition, entry.raw);
    results.push({
      name: entry.name,
      coerced: entry.raw === undefined ? null : data,
      verdict: validate(entry.definition, data, { locale: entry.locale }),
    });
  }
}

process.stdout.write(JSON.stringify({
  realm: {
    // What separates the two runs: the test process has happy-dom registered
    // globally by `tests/setup.ts`; a bare `bun <file>` has nothing of the sort.
    hasDom: typeof globalThis.document !== "undefined" && typeof globalThis.window !== "undefined",
    // …and the caller runs this child in a different time zone, so that the
    // `date` operator's zone-independence is proved rather than assumed.
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  results,
}));
