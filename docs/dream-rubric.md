# The taste rubric

<!-- The machine-readable half of this file is `scripts/dream/rubric.mjs`.
     `tests/dream/rubric.test.ts` asserts the two agree — the version, the five
     criteria, their questions and the threshold — so neither can move alone. -->

**Version: 1.0**

Deterministic gates catch correctness. They do not catch *this is ugly* or *this
is the same thing again* (`FAQIR-VISION.md` §10.5). The distinctiveness gate
answers the second question numerically and refuses a look-alike before a byte
is written. This file is the first question: five criteria, scored 1–5 from the
light/dark PNG pair, each with one sentence saying why.

The scorer is a vision-capable model — the agent running `/faqir-dream`, or any
other model handed the same two pictures. **The judge is named in the scorecard**
(and in the ledger's `taste` cell when it is known before the row is written),
because a 4 from one model and a 4 from another are not the same 4, and a score
whose judge is anonymous cannot be compared with next month's.

**The rubric is versioned and the version travels with the score.** Changing a
question changes what a number means; scores carry `rubric` so a digest never
averages across a revision.

---

## The five criteria

Each is scored **1–5**, and each score needs **one sentence** — the sentence is
the part a human reads in the morning; the number is only how the digest sorts.

| # | Criterion | The question |
|---|-----------|--------------|
| 1 | `hierarchy` | Does the eye land on the right thing first — the headline, then the primary action — in **both** schemes? |
| 2 | `rhythm` | Do spacing and type repeat on a scale, so the page has a beat rather than a pile? |
| 3 | `contrast` | Is the difference between the loud and the quiet parts clear, and does it survive the dark scheme? |
| 4 | `restraint` | Is any one axis shouting over the others — a radius, a shadow, a texture, a weight? |
| 5 | `fit` | Is this the theme the brief asked for, or a different good theme? |

`fit` is the one that fails a beautiful page. A dream answers a brief; a theme
that scores 5 on the first four and 2 on `fit` is a new brief, not this one.

## The scale

| Score | Meaning |
|-------|---------|
| 5 | Exemplary — this is what the criterion looks like when it is done right. |
| 4 | Good — holds everywhere it is looked at, with nothing to fix. |
| 3 | Acceptable — holds, with one thing a human would change. |
| 2 | Weak — a real problem, visible in the picture without looking for it. |
| 1 | Broken — the criterion is not met at all. |

Score what the pictures show, not what the seed intended. The seed is in the
scorecard beside the scores; the two disagreeing is exactly the information the
morning review wants.

## The threshold

A dream is **worth a human's minute** when:

- no criterion is below **3**, and
- the mean of the five is at least **3.5**.

Below that, say so in the report and leave the branch for the human to close.
The threshold decides what a PR is opened for — it never deletes anything. A
theme that passes every deterministic gate and scores 2 on `restraint` is
precisely what §10.5 says the gates cannot catch, and the row that records it is
the cheapest data the loop produces.

## Where a score is written

```jsonc
// .faqir-dreams/out/<brief-id>/scorecard.json
"taste": {
  "rubric": "1.0",                       // this file's version
  "judge": "claude-opus-5",              // who looked
  "scored": "2026-09-12",
  "scores": {
    "hierarchy": { "score": 4, "why": "The headline wins in both schemes; the primary button is second." },
    "rhythm":    { "score": 4, "why": "One 1.25 scale end to end, and the card gutters repeat it." },
    "contrast":  { "score": 3, "why": "Secondary text is close to the ground in dark; it holds, barely." },
    "restraint": { "score": 4, "why": "The mesh is the only loud thing, and it sits behind everything." },
    "fit":       { "score": 5, "why": "This is the cabinet the brief describes, at night." }
  },
  "notes": "Optional — anything the five questions did not ask."
}
```

`scripts/dream/rubric.mjs` validates that block: five criteria, integer scores in
range, a sentence each, a judge, a known rubric version. `scripts/dream/digest.mjs`
refuses to average an invalid block and prints it as unscored instead — a digest
that quietly rounds a malformed scorecard into a number is a digest that reports
a theme nobody looked at.

## The ledger cell

`dreams.tsv`'s `taste` column carries one cell, and it carries all three facts:

```
4.0 rubric-1.0 claude-opus-5
```

`-` means the row was written before anyone looked, which is **the normal case**:
`scripts/dream/theme.mjs` appends the row the moment the gates pass, and the
pictures are scored after, by the agent driving the skill — outside the
pipeline. So the scorecard is the record, the digest reads it when the cell is
`-`, and the score reaches the morning review either way.

There is a reader for that cell (`parseTasteCell`) and deliberately no writer.
A cell gets filled in exactly two ways: a reviewer types one in with the
spelling above, or — the day §10.5's judge can be invoked from the pipeline —
the row is written already knowing its score.
