/**
 * `dreams.tsv` — the Night Shift ledger  [task 1.1N-01]
 *
 * One row per dream, appended and never rewritten. The shape is
 * `autoresearch-results.tsv`'s — the layout-lint campaign ran exactly this loop
 * by hand, and its file is the proof the format survives a campaign — plus the
 * four columns a dream needs and a metric iteration does not: `kind` (which of
 * §10.3's dream kinds ran), `branch` (where the work is, so the morning review
 * can find it), `gates` (which of the deterministic gates passed) and `taste`
 * (the rubric score, which 1.1N-02 formalizes).
 *
 * Append-only is the whole point. A ledger a script may rewrite is a ledger
 * that can quietly lose the discard it is least comfortable with, so
 * `appendRow` only ever adds bytes to the end of the file, and `parseLedger`
 * round-trips what it wrote — a row that cannot be read back is a row that was
 * written wrong.
 *
 * Plain ESM with no dependencies: these scripts run under `node` as well as
 * `bun`, like everything else in `scripts/`.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * The metric a theme dream reports is `axis_distance` to its nearest shipped
 * theme — how many of the fourteen axes differ. More is better: a theme that
 * differs on twelve axes is a new region of the space, one that differs on two
 * is a recolour. Stated in the file, like `autoresearch-results.tsv` states
 * its own direction, so a reader of the raw TSV is never guessing which way
 * a delta points.
 */
export const METRIC_DIRECTION = "higher_is_better";

/** The header comment every ledger carries as its first line. */
export const LEDGER_PREAMBLE = `# metric_direction: ${METRIC_DIRECTION}`;

/**
 * The columns, in order. `autoresearch-results.tsv`'s seven
 * (`iteration commit metric delta guard status description`) with `date` and
 * the four dream columns interleaved where they read naturally: what ran, then
 * where it went, then how it scored, then the verdict.
 */
export const LEDGER_COLUMNS = [
  "iteration",
  "date",
  "kind",
  "id",
  "branch",
  "commit",
  "metric",
  "delta",
  "guard",
  "gates",
  "taste",
  "status",
  "description",
];

/** The verdicts a row may carry. `baseline` is the seed row, as in autoresearch. */
export const LEDGER_STATUSES = ["baseline", "keep", "discard"];

/** The dream kinds of FAQIR-VISION §10.3. Only `theme` has gates in 1.1. */
export const LEDGER_KINDS = ["theme", "component", "motion", "dogfood", "wish", "docs"];

/** Written where a column has no value — TSV has no way to spell "empty". */
export const LEDGER_EMPTY = "-";

/**
 * A field may not contain a tab, a newline or a carriage return: each would
 * split one row into two, or one cell into two, and the ledger would still
 * parse — into something that is not what was written. So this throws rather
 * than escaping. There is no value worth silently mangling a record for, and
 * every field here is either a number, an identifier or a one-line summary.
 */
export function assertCellSafe(column, value) {
  const text = String(value);
  const bad = /[\t\r\n]/.exec(text);
  if (bad) {
    const name = bad[0] === "\t" ? "a tab" : "a newline";
    throw new Error(
      `dreams.tsv column '${column}' may not contain ${name}: ${JSON.stringify(text)}. ` +
        `Every field is one cell on one line; collapse the value before recording it.`,
    );
  }
  return text;
}

/** Normalize one row object into the thirteen cells, in column order. */
export function rowCells(row) {
  if (!LEDGER_STATUSES.includes(row.status)) {
    throw new Error(
      `dreams.tsv status '${row.status}' is not one of ${LEDGER_STATUSES.join(", ")}.`,
    );
  }
  if (!LEDGER_KINDS.includes(row.kind)) {
    throw new Error(`dreams.tsv kind '${row.kind}' is not one of ${LEDGER_KINDS.join(", ")}.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date ?? ""))) {
    throw new Error(`dreams.tsv date '${row.date}' must be ISO YYYY-MM-DD.`);
  }
  if (!Number.isInteger(row.iteration) || row.iteration < 0) {
    throw new Error(`dreams.tsv iteration '${row.iteration}' must be a non-negative integer.`);
  }
  if (!String(row.description ?? "").trim()) {
    throw new Error(
      `dreams.tsv needs a description: a row nobody can read in the morning is a row that ` +
        `records nothing. Say in one line what was dreamt and why it was ${row.status}ed.`,
    );
  }
  return LEDGER_COLUMNS.map((column) => {
    const value = row[column];
    return assertCellSafe(column, value === undefined || value === null || value === "" ? LEDGER_EMPTY : value);
  });
}

/** One row as its TSV line, without the trailing newline. */
export function formatRow(row) {
  return rowCells(row).join("\t");
}

/**
 * Parse a ledger back into rows. Comment lines (`#`) and blank lines are
 * skipped; the header line is recognised by its first cell and dropped.
 * `iteration` comes back as a number and `metric`/`delta`/`taste` as numbers
 * when they are numeric, so a caller computing the next delta is not parsing
 * strings at every call site.
 */
export function parseLedger(text) {
  const rows = [];
  const lines = String(text).split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim() || line.startsWith("#")) continue;
    const cells = line.split("\t");
    if (cells[0] === LEDGER_COLUMNS[0]) {
      if (cells.join("\t") !== LEDGER_COLUMNS.join("\t")) {
        throw new Error(
          `dreams.tsv line ${index + 1}: header is ${JSON.stringify(cells)}, expected ` +
            `${JSON.stringify(LEDGER_COLUMNS)}. A ledger whose columns moved cannot be appended to.`,
        );
      }
      continue;
    }
    if (cells.length !== LEDGER_COLUMNS.length) {
      throw new Error(
        `dreams.tsv line ${index + 1} has ${cells.length} cells, expected ${LEDGER_COLUMNS.length}.`,
      );
    }
    const row = {};
    for (const [i, column] of LEDGER_COLUMNS.entries()) {
      const raw = cells[i];
      row[column] = raw === LEDGER_EMPTY ? null : raw;
    }
    row.iteration = Number(row.iteration);
    for (const numeric of ["metric", "delta", "taste"]) {
      if (row[numeric] !== null && row[numeric] !== "" && Number.isFinite(Number(row[numeric]))) {
        row[numeric] = Number(row[numeric]);
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Read `path`, returning `[]` when the ledger does not exist yet. */
export function readLedger(path) {
  if (!existsSync(path)) return [];
  return parseLedger(readFileSync(path, "utf8"));
}

/** Create `path` with its preamble and header. Never touches an existing file. */
export function initLedger(path) {
  if (existsSync(path)) return false;
  writeFileSync(path, `${LEDGER_PREAMBLE}\n${LEDGER_COLUMNS.join("\t")}\n`);
  return true;
}

/**
 * The next row's `iteration` and `delta`, from what the ledger already holds.
 *
 * `delta` is measured against the last row of the SAME kind that carried a
 * metric — a theme dream's distinctiveness and a (future) component dream's
 * size budget are not on the same scale, so a delta across kinds would be a
 * subtraction of unrelated numbers. A row with no comparable predecessor gets
 * `0`, exactly as autoresearch's baseline row does.
 */
export function nextPosition(rows, kind, metric) {
  const iteration = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.iteration)) + 1;
  if (typeof metric !== "number" || !Number.isFinite(metric)) return { iteration, delta: null };
  const previous = [...rows]
    .reverse()
    .find((r) => r.kind === kind && typeof r.metric === "number" && Number.isFinite(r.metric));
  return { iteration, delta: previous ? Number((metric - previous.metric).toFixed(4)) : 0 };
}

/**
 * Append one row. The file is created with its preamble if it is missing, and
 * the bytes already on disk are never read back and rewritten — `appendFileSync`
 * is the whole implementation, which is what makes "append-only" a property of
 * the code rather than a promise in a comment.
 */
export function appendRow(path, row) {
  initLedger(path);
  const line = formatRow(row);
  appendFileSync(path, `${line}\n`);
  return line;
}
