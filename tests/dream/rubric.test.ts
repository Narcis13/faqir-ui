// ═══════════════════════════════════════════════════════════════════════════
// The taste rubric, and the document that is the same rubric   [task 1.1N-02]
// ═══════════════════════════════════════════════════════════════════════════
//
// §10.5 asks for a rubric that "lives in the repo and is versioned". Versioned
// means a score carries the version it was given under; lives in the repo means
// there are two copies of it — the prose a model reads (`docs/dream-rubric.md`)
// and the data a program reads (`scripts/dream/rubric.mjs`) — and two copies of
// one thing is drift waiting to happen.
//
// So the first describe below parses the DOCUMENT and asserts it against the
// module: the version, the five criteria in order, their questions, the scale
// and the threshold. A question reworded on one side and not the other fails
// here rather than in six months, when a 4 is being compared with a 4 that was
// answering a different question.
//
// The rest is the validator, which exists because the block a scorer writes is
// hand-written JSON: a half-scored block, a bare number with no reason, an
// anonymous judge and a score of 7 are all things that happen, and each of them
// would otherwise become a number in the digest.

import { describe, expect, it, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRubric, ROOT, type RubricModule, type TasteBlock } from "./load";

let rubric: RubricModule;
let doc: string;
beforeAll(async () => {
  rubric = await loadRubric();
  doc = readFileSync(join(ROOT, "docs", "dream-rubric.md"), "utf8");
});

/** A fully and legally scored block — the shape a scorer is asked to write. */
function scored(overrides: Partial<TasteBlock> = {}): TasteBlock {
  const base = rubric.emptyTaste();
  const whys: Record<string, string> = {
    hierarchy: "The headline wins in both schemes and the primary button is second.",
    rhythm: "One 1.25 scale end to end, and the card gutters repeat it.",
    contrast: "Secondary text sits close to the ground in dark, but it holds.",
    restraint: "The mesh is the only loud thing and it sits behind everything.",
    fit: "This is the cabinet the brief describes, at night.",
  };
  const scores: TasteBlock["scores"] = {};
  for (const key of rubric.RUBRIC_KEYS) scores[key] = { score: 4, why: whys[key] };
  return { ...base, judge: "claude-opus-5", scored: "2026-09-12", scores, ...overrides };
}

describe("the module and the document are the same rubric", () => {
  it("declares the same version", () => {
    expect(doc).toContain(`**Version: ${rubric.RUBRIC_VERSION}**`);
  });

  it("names the module as the machine-readable half, and the module names the document", () => {
    expect(doc).toContain("scripts/dream/rubric.mjs");
    // The path the module publishes is the document this test is reading; a
    // scorecard citing a rubric nobody can open is a version with no prose.
    expect(rubric.RUBRIC_PATH).toBe("docs/dream-rubric.md");
    expect(readFileSync(join(ROOT, rubric.RUBRIC_PATH), "utf8")).toBe(doc);
  });

  it("lists the five criteria in the same order, with the same question", () => {
    // The document's criteria table: | n | `key` | question |
    const rows = [...doc.matchAll(/^\| \d+ \| `([a-z]+)` \| (.+?) \|$/gm)].map((m) => ({
      key: m[1],
      question: m[2].replace(/\*\*/g, ""),
    }));
    expect(rows.map((r) => r.key)).toEqual(rubric.RUBRIC_KEYS);
    for (const [index, criterion] of rubric.RUBRIC_CRITERIA.entries()) {
      expect(rows[index].question, criterion.key).toBe(criterion.question);
    }
  });

  it("has exactly five criteria — the five §10.5 names", () => {
    expect(rubric.RUBRIC_KEYS).toEqual(["hierarchy", "rhythm", "contrast", "restraint", "fit"]);
  });

  it("agrees on the scale and on the threshold", () => {
    expect(rubric.RUBRIC_SCALE).toEqual({ min: 1, max: 5 });
    // The scale table has one row per point, top down.
    const scale = [...doc.matchAll(/^\| ([1-5]) \| \w/gm)].map((m) => Number(m[1]));
    expect(scale.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(doc).toContain(`below **${rubric.RUBRIC_THRESHOLD.floor}**`);
    expect(doc).toContain(`at least **${rubric.RUBRIC_THRESHOLD.mean}**`);
  });

  it("spells the ledger cell the way the parser reads it", () => {
    // The document's example cell, lifted out of its code fence and parsed.
    const example = /^(\d\.\d rubric-\S+ \S+)$/m.exec(doc)?.[1];
    expect(example, "docs/dream-rubric.md has no example taste cell").toBeTruthy();
    expect(rubric.parseTasteCell(example)).toEqual({
      score: 4,
      rubric: rubric.RUBRIC_VERSION,
      judge: "claude-opus-5",
    });
  });

  it("shows a scorecard block the validator accepts", () => {
    // The JSON example in the document, with its `// …` comments stripped.
    const fence = /```jsonc\n([\s\S]+?)```/.exec(doc)?.[1] ?? "";
    const json = fence.replace(/^\/\/.*$/gm, "").replace(/\s*\/\/.*$/gm, "");
    const parsed = JSON.parse(`{${json.trim().replace(/,$/, "")}}`) as { taste: TasteBlock };
    expect(rubric.validateTaste(parsed.taste)).toEqual([]);
    expect(rubric.tasteScore(parsed.taste)).toBe(4);
  });
});

describe("an empty block", () => {
  it("carries the rubric's identity and one null per criterion", () => {
    const empty = rubric.emptyTaste();
    expect(empty.rubric).toBe(rubric.RUBRIC_VERSION);
    expect(empty.rubric_doc).toBe(rubric.RUBRIC_PATH);
    expect(Object.keys(empty.scores)).toEqual(rubric.RUBRIC_KEYS);
    expect(Object.values(empty.scores).every((v) => v === null)).toBe(true);
  });

  it("is valid, unscored and has no mean", () => {
    const empty = rubric.emptyTaste();
    expect(rubric.validateTaste(empty)).toEqual([]);
    expect(rubric.isScored(empty)).toBe(false);
    expect(rubric.tasteScore(empty)).toBeNull();
  });

  it("is not valid if it names a judge who scored nothing", () => {
    const empty = { ...rubric.emptyTaste(), judge: "claude-opus-5" };
    expect(rubric.validateTaste(empty).map((e) => e.field)).toEqual(["taste.judge"]);
  });
});

describe("validating a scored block", () => {
  it("accepts the shape the document asks for", () => {
    expect(rubric.validateTaste(scored())).toEqual([]);
    expect(rubric.isScored(scored())).toBe(true);
  });

  it("refuses a score from another rubric version", () => {
    const problems = rubric.validateTaste(scored({ rubric: "0.9" }));
    expect(problems.map((p) => p.field)).toContain("taste.rubric");
    expect(problems[0].message).toContain("not comparable");
  });

  it("refuses a half-scored block — five criteria or none", () => {
    const half = scored();
    half.scores.fit = null;
    half.scores.restraint = null;
    const problems = rubric.validateTaste(half);
    expect(problems.map((p) => p.field)).toContain("taste.scores");
    expect(problems.find((p) => p.field === "taste.scores")!.message).toContain("restraint, fit");
    // And the mean refuses too, rather than averaging three of five.
    expect(rubric.tasteScore(half)).toBeNull();
  });

  it("refuses an anonymous score", () => {
    for (const judge of [null, "", "   "]) {
      const problems = rubric.validateTaste(scored({ judge: judge as string | null }));
      expect(problems.map((p) => p.field), String(judge)).toContain("taste.judge");
    }
  });

  it("refuses a score outside the scale, and a non-integer one", () => {
    for (const score of [0, 6, 3.5, "4", null]) {
      const block = scored();
      block.scores.fit = { score: score as number, why: "a sentence long enough to count as one" };
      expect(rubric.validateTaste(block).map((p) => p.field), String(score)).toContain(
        "taste.scores.fit.score",
      );
    }
  });

  it("refuses a bare number — the reason is the part a human reads", () => {
    const block = scored();
    (block.scores as Record<string, unknown>).rhythm = 4;
    const problems = rubric.validateTaste(block);
    expect(problems.map((p) => p.field)).toContain("taste.scores.rhythm");
    expect(problems[0].message).toContain("records no reason");
  });

  it("refuses a reason that is not a sentence", () => {
    const block = scored();
    block.scores.contrast = { score: 4, why: "good" };
    expect(rubric.validateTaste(block).map((p) => p.field)).toContain("taste.scores.contrast.why");
  });

  it("refuses a criterion that is not one", () => {
    const block = scored();
    (block.scores as Record<string, unknown>).vibes = { score: 5, why: "it has them, unmistakably" };
    const problems = rubric.validateTaste(block);
    expect(problems.map((p) => p.field)).toContain("taste.scores.vibes");
  });

  it("refuses a scored date that is not a date", () => {
    expect(rubric.validateTaste(scored({ scored: "last night" })).map((p) => p.field)).toContain(
      "taste.scored",
    );
  });

  it("refuses anything that is not an object", () => {
    for (const value of [null, "4", 4, [1, 2]]) {
      expect(rubric.validateTaste(value), String(value)).toEqual([
        { field: "taste", message: "must be an object — see docs/dream-rubric.md." },
      ]);
    }
  });
});

describe("the mean and the threshold", () => {
  const withScores = (values: number[]) => {
    const block = scored();
    for (const [index, key] of rubric.RUBRIC_KEYS.entries()) {
      block.scores[key] = { score: values[index], why: "a sentence long enough to count as one" };
    }
    return block;
  };

  it("averages the five to one decimal", () => {
    expect(rubric.tasteScore(withScores([5, 4, 4, 4, 4]))).toBe(4.2);
    expect(rubric.tasteScore(withScores([3, 3, 3, 3, 3]))).toBe(3);
    expect(rubric.tasteScore(withScores([5, 5, 4, 4, 3]))).toBe(4.2);
  });

  it("never means an invalid block into a number", () => {
    expect(rubric.tasteScore(withScores([5, 5, 5, 5, 9]))).toBeNull();
    expect(rubric.tasteScore({ scores: {} })).toBeNull();
  });

  it("clears the threshold at 3.5 with nothing below 3", () => {
    expect(rubric.meetsThreshold(withScores([4, 4, 3, 3, 4]))).toEqual({ ok: true, mean: 3.6, below: [] });
  });

  it("fails on the mean, and says the mean", () => {
    expect(rubric.meetsThreshold(withScores([3, 3, 3, 4, 3]))).toEqual({ ok: false, mean: 3.2, below: [] });
  });

  it("fails on one low criterion even when the mean is high, and names it", () => {
    const verdict = rubric.meetsThreshold(withScores([5, 5, 5, 2, 5]));
    expect(verdict).toEqual({ ok: false, mean: 4.4, below: ["restraint"] });
  });

  it("has no verdict at all for an unscored block", () => {
    expect(rubric.meetsThreshold(rubric.emptyTaste())).toEqual({ ok: false, mean: null, below: [] });
  });
});

describe("the ledger cell", () => {
  it("reads a score, its rubric and its judge back out of one cell", () => {
    expect(rubric.parseTasteCell("4.0 rubric-1.0 claude-opus-5")).toEqual({
      score: 4,
      rubric: "1.0",
      judge: "claude-opus-5",
    });
    expect(rubric.parseTasteCell("  3.6 rubric-1.0 some-vision-model  ")).toEqual({
      score: 3.6,
      rubric: "1.0",
      judge: "some-vision-model",
    });
  });

  it("is null for the empty cell and for anything it cannot read", () => {
    for (const cell of [null, undefined, "-", "", "4.0", "4.0 claude-opus-5", "rubric-1.0 x"]) {
      expect(rubric.parseTasteCell(cell), JSON.stringify(cell)).toBeNull();
    }
  });
});

describe("the rubric as lines", () => {
  it("prints one numbered question per criterion", () => {
    const lines = rubric.rubricLines();
    expect(lines).toHaveLength(5);
    expect(lines[0]).toStartWith("1. hierarchy — ");
    expect(lines[4]).toContain(rubric.RUBRIC_CRITERIA[4].question);
  });
});
