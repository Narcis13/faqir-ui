// The drift gate. Every case in `tests/golden/` is replayed and compared whole:
// `valid`, every finding's path, rule, params *and* sentence, and — where the
// case gives form-shaped `raw` input — the exact output of `coerce`.
//
// Whole-verdict comparison is the point. A test that only asserts "one finding,
// on `email`" passes happily while the sentence rots, the params lose a `limit`
// or `computed` quietly disappears; those are precisely the things the plugin
// and a server have to agree on.

import { describe, expect, it } from "bun:test";
import { coerce, validate } from "../src/index.js";
import { expectedVerdict, loadCorpus } from "./corpus";

const CORPUS = loadCorpus();

describe("@faqir-ui/rules golden corpus", () => {
  it("is big enough to be worth trusting, and every case is named once", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(40);
    const names = CORPUS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every case either data or form-shaped raw input, never both and never neither", () => {
    for (const testCase of CORPUS) {
      const hasData = Object.prototype.hasOwnProperty.call(testCase, "data");
      const hasRaw = testCase.raw !== undefined;
      expect(hasData || hasRaw, `${testCase.name} has no input`).toBe(true);
      if (hasRaw) {
        expect(testCase.coerced, `${testCase.name} gives raw input but no expected coercion`)
          .toBeDefined();
      }
    }
  });

  for (const testCase of CORPUS) {
    it(`${testCase.file} · ${testCase.name}`, () => {
      let data = testCase.data;
      if (testCase.raw !== undefined) {
        data = coerce(testCase.definition, testCase.raw);
        expect(data).toEqual(testCase.coerced!);
      }

      const verdict = validate(testCase.definition, data, { locale: testCase.locale });
      // The whole verdict, both halves. A case that says nothing about the
      // rules maps is asserting they are empty — so a rule leaking into a
      // shape-only case is a failure, not a silent extra key.
      expect(verdict).toEqual(expectedVerdict(testCase));
    });
  }

  it("agrees with itself: `valid` means no findings and nothing left to check", () => {
    for (const testCase of CORPUS) {
      const expected = expectedVerdict(testCase);
      expect(expected.valid, testCase.name)
        .toBe(expected.findings.length === 0 && expected.pending.length === 0);
    }
  });

  it("is stable under re-coercion — coerce(def, coerce(def, raw)) is a fixed point", () => {
    for (const testCase of CORPUS) {
      if (testCase.raw === undefined) continue;
      const once = coerce(testCase.definition, testCase.raw);
      expect(coerce(testCase.definition, once), testCase.name).toEqual(once);
    }
  });
});
