/**
 * `.faqir-dreams/queue.json` — what the Night Shift is going to dream  [1.1N-01]
 *
 * A queue of briefs, each one a mood and a region of the axis space. The shift
 * takes the FIRST pending brief in file order, so the order in the file is the
 * running order and re-prioritising is an edit, not a field: a `priority`
 * column is a second source of truth about the same thing, and the file already
 * has one.
 *
 * The status machine is deliberately small, and `dreaming` exists only so a
 * crashed run is distinguishable from a run that never started:
 *
 *     pending ──▶ dreaming ──▶ kept
 *        ▲            │
 *        │            ├──────▶ discarded
 *        └────────────┘  (a crashed run is released back by the next one)
 *
 * `kept` and `discarded` are terminal. A brief worth trying again is a NEW
 * brief with what was learnt written into it, not a status reset — the ledger
 * row for the first attempt has to keep meaning what it said.
 *
 * Plain ESM with no dependencies.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** The schema version `queue.json` carries. Bumped when the shape changes. */
export const QUEUE_VERSION = 1;

/** Every status a brief may hold, and what each one means to `pickNext`. */
export const QUEUE_STATUSES = ["pending", "dreaming", "kept", "discarded"];

/** Terminal statuses: a run never picks one up again. */
export const QUEUE_TERMINAL = ["kept", "discarded"];

/** The legal moves. Anything not listed here is refused with both ends named. */
export const QUEUE_TRANSITIONS = {
  pending: ["dreaming"],
  // A run that died between marking and finishing leaves `dreaming` behind;
  // the next run releases it rather than stranding the brief forever.
  dreaming: ["kept", "discarded", "pending"],
  kept: [],
  discarded: [],
};

/** The dream kinds a brief may declare. Only `theme` has a pipeline in 1.1. */
export const QUEUE_KINDS = ["theme", "component", "motion", "dogfood", "wish", "docs"];

/** A brief id: lowercase kebab, because it becomes a branch name and a filename. */
const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Validate a parsed queue, returning every problem rather than the first.
 *
 * Same shape as the manifest validators: `{ field, message }`, so a caller can
 * print all of them at once. A queue is hand-edited by whoever is filling the
 * shift, and being told about one typo per run is how a five-typo edit takes
 * five runs.
 */
export function validateQueue(value) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [{ field: "", message: "queue.json must contain a JSON object." }];
  }
  if (value.version !== QUEUE_VERSION) {
    fail("version", `must be ${QUEUE_VERSION}, got ${JSON.stringify(value.version)}.`);
  }
  if (!Array.isArray(value.briefs)) {
    fail("briefs", "must be an array of dream briefs.");
    return errors;
  }

  const seen = new Set();
  for (const [index, brief] of value.briefs.entries()) {
    const at = `briefs[${index}]`;
    if (typeof brief !== "object" || brief === null || Array.isArray(brief)) {
      fail(at, "must be an object.");
      continue;
    }
    if (typeof brief.id !== "string" || !ID_PATTERN.test(brief.id)) {
      fail(`${at}.id`, "must be lowercase kebab-case — it becomes a branch name and a filename.");
    } else if (seen.has(brief.id)) {
      fail(`${at}.id`, `duplicate id '${brief.id}'; ids address ledger rows and must be unique.`);
    } else {
      seen.add(brief.id);
    }
    if (!QUEUE_KINDS.includes(brief.kind)) {
      fail(`${at}.kind`, `must be one of ${QUEUE_KINDS.join(", ")}.`);
    }
    if (typeof brief.brief !== "string" || brief.brief.trim().length < 20) {
      fail(
        `${at}.brief`,
        "must be a sentence or two of mood — the dream is written FROM this, so a label is not enough.",
      );
    }
    if (!QUEUE_STATUSES.includes(brief.status)) {
      fail(`${at}.status`, `must be one of ${QUEUE_STATUSES.join(", ")}.`);
    }
    if (typeof brief.added !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(brief.added)) {
      fail(`${at}.added`, "must be an ISO date (YYYY-MM-DD).");
    }
    if (brief.axes_hint !== undefined) {
      if (typeof brief.axes_hint !== "object" || brief.axes_hint === null || Array.isArray(brief.axes_hint)) {
        fail(`${at}.axes_hint`, "must be an object — a partial seed the dream starts from.");
      }
    }
  }
  return errors;
}

/** Read and validate `path`, throwing with every problem named. */
export function readQueue(path) {
  if (!existsSync(path)) {
    throw new Error(`Dream queue '${path}' not found. Night Shift has nothing to dream.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Dream queue '${path}' is not valid JSON: ${error.message}`);
  }
  const errors = validateQueue(parsed);
  if (errors.length > 0) {
    throw new Error(
      `Dream queue '${path}' is invalid:\n` +
        errors.map((e) => `  ${e.field || "(root)"}: ${e.message}`).join("\n"),
    );
  }
  return parsed;
}

/** Write a queue back, validated first and with a trailing newline. */
export function writeQueue(path, queue) {
  const errors = validateQueue(queue);
  if (errors.length > 0) {
    throw new Error(
      `Refusing to write an invalid dream queue:\n` +
        errors.map((e) => `  ${e.field || "(root)"}: ${e.message}`).join("\n"),
    );
  }
  writeFileSync(path, JSON.stringify(queue, null, 2) + "\n");
}

/**
 * The brief this run should take: the first `pending` one in file order, of
 * `kind` when one is named. Returns `null` when the queue is exhausted — an
 * empty shift is a normal night, not an error.
 */
export function pickNext(queue, kind = null) {
  return (
    queue.briefs.find((b) => b.status === "pending" && (kind === null || b.kind === kind)) ?? null
  );
}

/** The brief with `id`, or `null`. */
export function findBrief(queue, id) {
  return queue.briefs.find((b) => b.id === id) ?? null;
}

/**
 * Move `brief` to `status`, refusing an illegal move by name. Mutates the
 * brief — the queue object is the unit that gets written back, and copying it
 * here would make it easy to update the copy and write the original.
 */
export function transition(brief, status) {
  if (!QUEUE_STATUSES.includes(status)) {
    throw new Error(`'${status}' is not a dream status (${QUEUE_STATUSES.join(", ")}).`);
  }
  const legal = QUEUE_TRANSITIONS[brief.status] ?? [];
  if (!legal.includes(status)) {
    throw new Error(
      `Brief '${brief.id}' is ${brief.status} and cannot become ${status}` +
        (legal.length === 0
          ? ` — ${brief.status} is terminal. A brief worth another attempt is a new brief.`
          : ` (legal: ${legal.join(", ")}).`),
    );
  }
  brief.status = status;
  return brief;
}

/**
 * Release every brief a crashed run left `dreaming`, so the next shift can pick
 * them up. Returns the ids released, for the log — a silent recovery is a
 * recovery nobody knows happened.
 */
export function releaseStale(queue) {
  const released = [];
  for (const brief of queue.briefs) {
    if (brief.status === "dreaming") {
      brief.status = "pending";
      released.push(brief.id);
    }
  }
  return released;
}

/** Counts per status, for the `--status` report and the weekly digest. */
export function queueSummary(queue) {
  const counts = Object.fromEntries(QUEUE_STATUSES.map((s) => [s, 0]));
  for (const brief of queue.briefs) counts[brief.status] += 1;
  return counts;
}
