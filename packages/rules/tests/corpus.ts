// The golden corpus — the single description of what a verdict *is*.
//
// Every case is authored data: a definition, the data it judges, and the exact
// verdict expected down to the sentence and the params. Nothing here is
// captured from the implementation, so a change in behaviour shows up as a
// diff against an intention rather than against a previous run.
//
// Three things read it, and that is the point of keeping it in JSON:
//   · `golden.test.ts`      — the drift gate for this package;
//   · `isomorphic.test.ts`  — runs it twice, in two realms, and diffs;
//   · 1.1B-04               — the plugin tests reuse it rather than inventing
//                             a second corpus.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RulesDefinition, Verdict } from "../src/index.js";

export const GOLDEN_DIR = join(import.meta.dir, "golden");

export interface GoldenCase {
  /** Unique across the whole corpus; it is the test name. */
  name: string;
  /** The rules definition under test. */
  definition: RulesDefinition;
  /** The data to validate. Omitted when `raw` is given — the coercion is the data. */
  data?: unknown;
  /** Form-shaped input, run through `coerce` first. */
  raw?: Record<string, unknown>;
  /** What `coerce(definition, raw)` must produce, exactly. */
  coerced?: Record<string, unknown>;
  /** Locale asked of `validate`. */
  locale?: string;
  /**
   * The whole verdict. Only `valid` and `findings` are compulsory: the four
   * maps a case says nothing about are expected to be empty, which is what
   * lets a shape-only case stay written the way it was authored while a rules
   * case spells out every one of them.
   */
  expected: {
    valid: boolean;
    findings: { path: string; rule: string; message: string; params: Record<string, unknown> }[];
    computed?: Record<string, unknown>;
    visible?: Record<string, boolean>;
    required?: Record<string, boolean>;
    next?: Record<string, string>;
    pending?: string[];
  };
  /** The corpus file this case came from; filled by the loader. */
  file?: string;
}

/** The case's `expected`, with every omitted map spelled out. */
export function expectedVerdict(testCase: GoldenCase): Verdict {
  return {
    valid: testCase.expected.valid,
    findings: testCase.expected.findings,
    computed: testCase.expected.computed ?? {},
    visible: testCase.expected.visible ?? {},
    required: testCase.expected.required ?? {},
    next: testCase.expected.next ?? {},
    pending: testCase.expected.pending ?? [],
  };
}

/** Every case, in file-name then in-file order — a stable, diffable sequence. */
export function loadCorpus(): GoldenCase[] {
  const files = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".json")).sort();
  const cases: GoldenCase[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(GOLDEN_DIR, file), "utf8")) as GoldenCase[];
    if (!Array.isArray(parsed)) throw new Error(`corpus file ${file} must hold an array of cases`);
    for (const entry of parsed) cases.push({ ...entry, file });
  }
  return cases;
}
