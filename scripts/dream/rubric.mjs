/**
 * The taste rubric, as data  [task 1.1N-02]
 *
 * `docs/dream-rubric.md` is the rubric a model reads; this is the same rubric a
 * program reads. Two copies of one thing is drift waiting to happen, so
 * `tests/dream/rubric.test.ts` parses the document and asserts it against this
 * file — the version, the five criteria, their questions and the threshold. A
 * question reworded in prose and not here (or the other way round) fails there
 * rather than in six months, when a score means something different from the
 * score it is being compared with.
 *
 * The version is the load-bearing part. §10.5 asks for a rubric that "lives in
 * the repo and is versioned; the judge model is named in the ledger row so
 * scores stay comparable" — both facts travel WITH the score, in the scorecard
 * and in the ledger's one `taste` cell, because a number whose rubric and judge
 * are implicit is a number that cannot be compared with next month's.
 *
 * Plain ESM with no dependencies.
 */

/** The rubric's version. Bumped when a question changes; scores carry it. */
export const RUBRIC_VERSION = "1.0";

/** Where the prose lives. Named in the scorecard so a reader can find it. */
export const RUBRIC_PATH = "docs/dream-rubric.md";

/**
 * The five criteria of §10.5, in scoring order, each with the question it asks.
 *
 * The order is the order they are answered in and the order they render in —
 * hierarchy first because it is the one a bad theme fails first, `fit` last
 * because it is the one that fails a beautiful page that answered a different
 * brief.
 */
export const RUBRIC_CRITERIA = [
  {
    key: "hierarchy",
    question:
      "Does the eye land on the right thing first — the headline, then the primary action — in both schemes?",
  },
  {
    key: "rhythm",
    question: "Do spacing and type repeat on a scale, so the page has a beat rather than a pile?",
  },
  {
    key: "contrast",
    question:
      "Is the difference between the loud and the quiet parts clear, and does it survive the dark scheme?",
  },
  {
    key: "restraint",
    question: "Is any one axis shouting over the others — a radius, a shadow, a texture, a weight?",
  },
  {
    key: "fit",
    question: "Is this the theme the brief asked for, or a different good theme?",
  },
];

/** The keys alone, for a quick membership check. */
export const RUBRIC_KEYS = RUBRIC_CRITERIA.map((c) => c.key);

/** The scale's ends. Every score is an integer between them. */
export const RUBRIC_SCALE = { min: 1, max: 5 };

/**
 * What makes a dream worth a human's minute: no criterion below `floor`, and a
 * mean of at least `mean`. It decides what a PR is opened for and deletes
 * nothing — the branch and the row survive a low score, which is the point of
 * recording one.
 */
export const RUBRIC_THRESHOLD = { floor: 3, mean: 3.5 };

/**
 * The `taste` block a fresh scorecard carries: the rubric's identity filled in,
 * every score null.
 *
 * The block exists from the moment the scorecard is written rather than
 * appearing when someone scores it, so a digest reading a scorecard never has
 * to tell "not scored yet" apart from "written by a version that had no rubric".
 */
export function emptyTaste() {
  return {
    rubric: RUBRIC_VERSION,
    rubric_doc: RUBRIC_PATH,
    judge: null,
    scored: null,
    scores: Object.fromEntries(RUBRIC_KEYS.map((key) => [key, null])),
    notes: null,
  };
}

/**
 * Validate a `taste` block, returning every problem rather than the first —
 * the same `{ field, message }` shape the manifest and queue validators use, so
 * a scorer is told about all five typos at once rather than one per run.
 *
 * An UNSCORED block (no judge, every score null) is not an error: it is what
 * `theme.mjs` writes at commit time, hours before anyone looks. `isScored`
 * distinguishes the two, and only a block that claims to be scored is held to
 * the rubric.
 */
export function validateTaste(taste) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });

  if (typeof taste !== "object" || taste === null || Array.isArray(taste)) {
    return [{ field: "taste", message: "must be an object — see docs/dream-rubric.md." }];
  }
  if (taste.rubric !== RUBRIC_VERSION) {
    fail(
      "taste.rubric",
      `is ${JSON.stringify(taste.rubric)}, and this repository's rubric is ${RUBRIC_VERSION}. ` +
        `A score carries the version it was given under; scores from two versions are not comparable.`,
    );
  }
  const scores = taste.scores;
  if (typeof scores !== "object" || scores === null || Array.isArray(scores)) {
    fail("taste.scores", `must be an object with one entry per criterion: ${RUBRIC_KEYS.join(", ")}.`);
    return errors;
  }

  const extra = Object.keys(scores).filter((key) => !RUBRIC_KEYS.includes(key));
  for (const key of extra) {
    fail(`taste.scores.${key}`, `is not a rubric criterion. The five are ${RUBRIC_KEYS.join(", ")}.`);
  }

  let scoredCount = 0;
  for (const key of RUBRIC_KEYS) {
    const entry = scores[key];
    if (entry === null || entry === undefined) continue;
    scoredCount += 1;
    const at = `taste.scores.${key}`;
    if (typeof entry !== "object" || Array.isArray(entry)) {
      fail(at, `must be { score, why } — a bare number records no reason, and the reason is the part a human reads.`);
      continue;
    }
    const { score, why } = entry;
    if (!Number.isInteger(score) || score < RUBRIC_SCALE.min || score > RUBRIC_SCALE.max) {
      fail(
        `${at}.score`,
        `must be an integer ${RUBRIC_SCALE.min}–${RUBRIC_SCALE.max}, got ${JSON.stringify(score)}.`,
      );
    }
    if (typeof why !== "string" || why.trim().length < 10) {
      fail(`${at}.why`, "needs one sentence saying why. The sentence is what the morning review reads.");
    }
  }

  if (scoredCount === 0) {
    // Unscored, and legitimately so. Anything claiming otherwise is caught below.
    if (taste.judge) fail("taste.judge", `names a judge (${taste.judge}) but no criterion was scored.`);
    return errors;
  }
  if (scoredCount < RUBRIC_KEYS.length) {
    const missing = RUBRIC_KEYS.filter((key) => scores[key] === null || scores[key] === undefined);
    fail(
      "taste.scores",
      `is half-scored: ${missing.join(", ")} missing. Five criteria or none — a mean over three of them ` +
        `is not the score the rubric defines.`,
    );
  }
  if (typeof taste.judge !== "string" || !taste.judge.trim()) {
    fail(
      "taste.judge",
      "must name the model that looked. An anonymous score cannot be compared with next month's (§10.5).",
    );
  }
  if (taste.scored !== null && taste.scored !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(taste.scored))) {
    fail("taste.scored", `must be ISO YYYY-MM-DD, got ${JSON.stringify(taste.scored)}.`);
  }
  return errors;
}

/** True when every criterion carries a score. `validateTaste` judges whether it is a LEGAL one. */
export function isScored(taste) {
  const scores = taste?.scores;
  if (typeof scores !== "object" || scores === null) return false;
  return RUBRIC_KEYS.every((key) => scores[key] !== null && scores[key] !== undefined);
}

/**
 * The mean of the five, to one decimal — the number the digest sorts by and the
 * ledger cell carries. `null` for anything not fully and legally scored, so a
 * caller never gets an average of three criteria that looks like an average of
 * five.
 */
export function tasteScore(taste) {
  if (!isScored(taste) || validateTaste(taste).length > 0) return null;
  const total = RUBRIC_KEYS.reduce((sum, key) => sum + taste.scores[key].score, 0);
  return Number((total / RUBRIC_KEYS.length).toFixed(1));
}

/** Whether a scored block clears §10.5's threshold, and which criteria did not. */
export function meetsThreshold(taste) {
  const mean = tasteScore(taste);
  if (mean === null) return { ok: false, mean: null, below: [] };
  const below = RUBRIC_KEYS.filter((key) => taste.scores[key].score < RUBRIC_THRESHOLD.floor);
  return { ok: below.length === 0 && mean >= RUBRIC_THRESHOLD.mean, mean, below };
}

/**
 * Read the ledger's `taste` cell: `4.0 rubric-1.0 claude-opus-5`.
 *
 * Three facts in one cell because the column count is frozen — `dreams.tsv` is
 * append-only, so the thirteen columns a row already on disk was written with
 * cannot grow a fourteenth without rewriting that row. One cell with a spelling
 * and one parser is the honest version of that constraint; a bare number whose
 * rubric and judge live somewhere else is not.
 *
 * There is deliberately no formatter here, because today there is nothing that
 * would call it: `theme.mjs` appends the row the moment the gates pass, and the
 * pictures are scored afterwards — by the agent driving the skill, outside the
 * pipeline — so the cell it writes is `-` and the scorecard is where the score
 * lands. The parser exists for the two cases that do produce a cell: a reviewer
 * filling one in by hand (`docs/dream-rubric.md` gives the spelling), and the
 * day §10.5's judge can be invoked from the pipeline, when the row will be
 * written already knowing its score. `null` for `-`, an empty cell, or anything
 * unparseable.
 */
export function parseTasteCell(cell) {
  if (cell === null || cell === undefined) return null;
  const match = /^(\d+(?:\.\d+)?)\s+rubric-(\S+)\s+(\S.*)$/.exec(String(cell).trim());
  if (!match) return null;
  return { score: Number(match[1]), rubric: match[2], judge: match[3] };
}

/** The rubric as the lines a scorecard template or a skill can print. */
export function rubricLines() {
  return RUBRIC_CRITERIA.map((c, i) => `${i + 1}. ${c.key} — ${c.question}`);
}
