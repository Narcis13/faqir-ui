// ═══════════════════════════════════════════════════════════════════════════
// `dreams.tsv` — the ledger the morning review reads            [task 1.1N-01]
// ═══════════════════════════════════════════════════════════════════════════
//
// Three properties, in the order they matter:
//
//   1. **Round-trip.** A row that cannot be read back is a row that was written
//      wrong, and a ledger nobody can parse is a ledger nobody can audit.
//   2. **Append-only.** A script that may rewrite the ledger is a script that
//      can quietly lose the discard it is least comfortable with — so the test
//      is that the bytes already on disk are untouched, byte for byte, after a
//      write, not that a comment says they are.
//   3. **Refusal over mangling.** A tab inside a cell would split one row into
//      two and the file would still parse — into something that is not what was
//      written. There is no value worth that, so it throws.
//
// The committed `dreams.tsv` is checked too: the shipped file is the format's
// first user, and a format nothing valid conforms to is a format nobody proved.

import { describe, expect, it, beforeAll, afterEach } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLedger, ROOT, type LedgerModule } from "./load";

let ledger: LedgerModule;
beforeAll(async () => {
  ledger = await loadLedger();
});

const temps: string[] = [];
function tempLedger(): string {
  const dir = mkdtempSync(join(tmpdir(), "faqir-dreams-"));
  temps.push(dir);
  return join(dir, "dreams.tsv");
}
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

/** A complete, valid row — the fixture every case starts from. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    iteration: 1,
    date: "2026-09-13",
    kind: "theme",
    id: "arcade",
    branch: "dream/theme-arcade",
    commit: "abc1234",
    metric: 9,
    delta: 5,
    guard: "pass",
    gates: "9/9",
    taste: 4,
    status: "keep",
    description: "arcade: a cabinet in a dark room — 9 axes from candy",
    ...overrides,
  };
}

describe("the row format", () => {
  it("states its metric direction, because a bare delta points nowhere", () => {
    // `autoresearch-results.tsv` opens with the same line for the same reason:
    // its metric was lower_is_better, this one is higher_is_better, and a reader
    // of the raw TSV must not have to guess which.
    expect(ledger.METRIC_DIRECTION).toBe("higher_is_better");
    expect(ledger.LEDGER_PREAMBLE).toBe("# metric_direction: higher_is_better");
  });

  it("carries autoresearch's seven columns plus the four a dream needs", () => {
    // The plan's shape, asserted rather than described: the precedent's columns
    // must all survive, or the two ledgers stop being comparable.
    for (const column of ["iteration", "commit", "metric", "delta", "guard", "status", "description"]) {
      expect(ledger.LEDGER_COLUMNS).toContain(column);
    }
    for (const column of ["kind", "branch", "gates", "taste"]) {
      expect(ledger.LEDGER_COLUMNS).toContain(column);
    }
    expect(ledger.LEDGER_COLUMNS).toContain("date");
    expect(ledger.LEDGER_COLUMNS.length).toBe(13);
    expect(new Set(ledger.LEDGER_COLUMNS).size).toBe(13);
  });

  it("writes one tab-separated line with a cell per column", () => {
    const line = ledger.formatRow(row());
    expect(line.split("\t").length).toBe(ledger.LEDGER_COLUMNS.length);
    expect(line).not.toContain("\n");
    expect(line.split("\t")[0]).toBe("1");
  });

  it("spells an absent value, rather than leaving an empty cell", () => {
    // "" and "-" are indistinguishable to a human scanning a TSV in a terminal,
    // and an empty trailing cell is invisible to `split("\t")` readers that trim.
    const cells = ledger.rowCells(row({ commit: null, taste: undefined, branch: "" }));
    const at = (name: string) => cells[ledger.LEDGER_COLUMNS.indexOf(name)];
    expect(at("commit")).toBe(ledger.LEDGER_EMPTY);
    expect(at("taste")).toBe(ledger.LEDGER_EMPTY);
    expect(at("branch")).toBe(ledger.LEDGER_EMPTY);
  });

  it("refuses a status or a kind outside its vocabulary", () => {
    expect(() => ledger.formatRow(row({ status: "maybe" }))).toThrow(/not one of/);
    expect(() => ledger.formatRow(row({ kind: "wallpaper" }))).toThrow(/not one of/);
    for (const status of ledger.LEDGER_STATUSES) {
      expect(() => ledger.formatRow(row({ status }))).not.toThrow();
    }
  });

  it("refuses a malformed date and a negative iteration", () => {
    expect(() => ledger.formatRow(row({ date: "13/09/2026" }))).toThrow(/YYYY-MM-DD/);
    expect(() => ledger.formatRow(row({ iteration: -1 }))).toThrow(/non-negative/);
    expect(() => ledger.formatRow(row({ iteration: 1.5 }))).toThrow(/integer/);
  });

  it("refuses a row with nothing written in the description", () => {
    // The column a human actually reads in the morning. A blank one makes the
    // row a number with no story, which is the row that gets ignored.
    expect(() => ledger.formatRow(row({ description: "   " }))).toThrow(/records nothing/);
  });

  it("refuses a tab or a newline in a cell instead of escaping it", () => {
    expect(() => ledger.formatRow(row({ description: "one\ttwo" }))).toThrow(/may not contain a tab/);
    expect(() => ledger.formatRow(row({ description: "one\ntwo" }))).toThrow(/may not contain a newline/);
    expect(() => ledger.assertCellSafe("gates", "9/9\r")).toThrow(/may not contain a newline/);
  });
});

describe("parsing", () => {
  it("round-trips a row through format and parse", () => {
    const original = row();
    const text = `${ledger.LEDGER_PREAMBLE}\n${ledger.LEDGER_COLUMNS.join("\t")}\n${ledger.formatRow(original)}\n`;
    const [parsed] = ledger.parseLedger(text);
    expect(parsed).toEqual({ ...original, iteration: 1, metric: 9, delta: 5, taste: 4 });
  });

  it("turns the empty marker back into null, not into the string '-'", () => {
    const text = ledger.formatRow(row({ commit: null, taste: null }));
    const [parsed] = ledger.parseLedger(text);
    expect(parsed.commit).toBeNull();
    expect(parsed.taste).toBeNull();
  });

  it("skips comments, blank lines and the header", () => {
    const text = [
      ledger.LEDGER_PREAMBLE,
      "",
      ledger.LEDGER_COLUMNS.join("\t"),
      ledger.formatRow(row()),
      "",
      "# a note someone left",
      ledger.formatRow(row({ iteration: 2, id: "moss" })),
    ].join("\n");
    const rows = ledger.parseLedger(text);
    expect(rows.map((r) => r.id)).toEqual(["arcade", "moss"]);
  });

  it("refuses a file whose columns moved, rather than mis-reading every row", () => {
    const moved = [...ledger.LEDGER_COLUMNS];
    [moved[2], moved[3]] = [moved[3], moved[2]];
    expect(() => ledger.parseLedger(`${moved.join("\t")}\n`)).toThrow(/columns moved/);
  });

  it("refuses a row with the wrong number of cells", () => {
    expect(() => ledger.parseLedger("1\t2\t3\n")).toThrow(/has 3 cells, expected 13/);
  });
});

describe("appending", () => {
  it("creates the file with its preamble and header on the first row", () => {
    const path = tempLedger();
    expect(existsSync(path)).toBe(false);
    ledger.appendRow(path, row({ iteration: 0 }));
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    expect(lines[0]).toBe(ledger.LEDGER_PREAMBLE);
    expect(lines[1]).toBe(ledger.LEDGER_COLUMNS.join("\t"));
    expect(lines.length).toBe(3);
  });

  it("leaves every byte already on disk untouched", () => {
    // The property "append-only" actually means. Asserted on the bytes rather
    // than on the parsed rows, because a rewrite that happens to reproduce the
    // same rows is still a rewrite, and the next one may not.
    const path = tempLedger();
    ledger.appendRow(path, row({ iteration: 0, id: "first" }));
    const before = readFileSync(path);
    ledger.appendRow(path, row({ iteration: 1, id: "second" }));
    const after = readFileSync(path);
    expect(after.subarray(0, before.length)).toEqual(before);
    expect(ledger.parseLedger(after.toString("utf8")).map((r) => r.id)).toEqual(["first", "second"]);
  });

  it("does not disturb hand-written notes already in the file", () => {
    const path = tempLedger();
    ledger.initLedger(path);
    writeFileSync(path, readFileSync(path, "utf8") + "# reviewed 2026-09-13, kept two\n");
    ledger.appendRow(path, row());
    expect(readFileSync(path, "utf8")).toContain("# reviewed 2026-09-13, kept two");
  });

  it("initLedger never overwrites an existing ledger", () => {
    const path = tempLedger();
    ledger.appendRow(path, row());
    const before = readFileSync(path, "utf8");
    expect(ledger.initLedger(path)).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(before);
  });
});

describe("iteration and delta", () => {
  it("starts at zero with a zero delta, exactly as the autoresearch baseline does", () => {
    expect(ledger.nextPosition([], "theme", 7)).toEqual({ iteration: 0, delta: 0 });
  });

  it("counts iterations across every kind but measures delta within one", () => {
    // A theme's axis distance and a (future) component's size budget are not on
    // the same scale; subtracting one from the other would produce a number.
    const rows = ledger.parseLedger(
      [
        ledger.formatRow(row({ iteration: 0, kind: "theme", metric: 5 })),
        ledger.formatRow(row({ iteration: 1, kind: "docs", metric: 900, status: "keep" })),
      ].join("\n"),
    );
    expect(ledger.nextPosition(rows, "theme", 9)).toEqual({ iteration: 2, delta: 4 });
  });

  it("reports no delta at all when the row carries no metric", () => {
    const rows = ledger.parseLedger(ledger.formatRow(row({ iteration: 0, metric: 5 })));
    expect(ledger.nextPosition(rows, "theme", null)).toEqual({ iteration: 1, delta: null });
  });

  it("ignores an earlier row of the same kind that had no metric", () => {
    const rows = ledger.parseLedger(
      [
        ledger.formatRow(row({ iteration: 0, metric: 5 })),
        ledger.formatRow(row({ iteration: 1, metric: null, status: "discard", guard: "fail" })),
      ].join("\n"),
    );
    expect(ledger.nextPosition(rows, "theme", 6).delta).toBe(1);
  });
});

describe("the committed dreams.tsv", () => {
  it("parses, and opens with one baseline row", () => {
    const rows = ledger.readLedger(join(ROOT, "dreams.tsv"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].iteration).toBe(0);
    expect(rows[0].status).toBe("baseline");
    expect(rows[0].kind).toBe("theme");
    expect(String(rows[0].description).length).toBeGreaterThan(20);
  });

  it("carries the preamble a raw reader needs", () => {
    expect(readFileSync(join(ROOT, "dreams.tsv"), "utf8").split("\n")[0]).toBe(ledger.LEDGER_PREAMBLE);
  });

  it("every row re-formats to exactly the bytes on disk", () => {
    // The shipped file is the format's first user. If a row in it does not
    // round-trip, the format was never actually exercised.
    const text = readFileSync(join(ROOT, "dreams.tsv"), "utf8");
    const lines = text.trimEnd().split("\n").filter((l) => l && !l.startsWith("#"));
    const rows = ledger.readLedger(join(ROOT, "dreams.tsv"));
    expect(lines.length).toBe(rows.length + 1); // +1 for the header
    for (const [i, r] of rows.entries()) {
      expect(ledger.formatRow(r)).toBe(lines[i + 1]);
    }
  });
});
