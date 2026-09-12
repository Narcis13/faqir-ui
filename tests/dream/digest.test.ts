// ═══════════════════════════════════════════════════════════════════════════
// DREAMS.md — the week of the ledger a human reads            [task 1.1N-02]
// ═══════════════════════════════════════════════════════════════════════════
//
// The digest is two halves and they are tested as two halves: `renderDigest` is
// a pure function from data to bytes (no clock, no filesystem, no git), and
// `collectDigest` is the half that reads the world, with `git` and `gh` injected
// so this file launches neither.
//
// Three properties carry the weight:
//
//   * every number in it is READ — counts from the ledger, distinctiveness from
//     the row the generator measured, taste from the scorecard. A digest that
//     computed a number of its own would be a second place that number lives;
//   * it is IDEMPOTENT — rendering an unchanged week twice produces identical
//     bytes, which is what lets `nightly.sh` run it every night without noise;
//   * it reads UNMERGED dream branches. A kept dream commits its ledger row on
//     its own branch, so a digest that only read HEAD would report last night as
//     nothing at all — backwards, since the digest exists to decide on merging.
//
// The week boundary gets its own case because it is the one arithmetic in the
// file: ISO weeks, Monday to Sunday, in UTC, compared as strings so a Sunday
// dream does not move week depending on where the reader is sitting.

import { describe, expect, it, beforeAll, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  loadDigest,
  loadLedger,
  loadRubric,
  type DigestModule,
  type DigestWeek,
  type LedgerModule,
  type LedgerRow,
  type RubricModule,
  type RunResult,
  type Runner,
  type TasteBlock,
} from "./load";

let digest: DigestModule;
let ledger: LedgerModule;
let rubric: RubricModule;
beforeAll(async () => {
  digest = await loadDigest();
  ledger = await loadLedger();
  rubric = await loadRubric();
});

const temps: string[] = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

/** The week every fixture row below falls in: Mon 2026-09-07 – Sun 2026-09-13. */
const WEEK: DigestWeek = { start: "2026-09-07", end: "2026-09-13" };

function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    iteration: 1,
    date: "2026-09-12",
    kind: "theme",
    id: "arcade",
    branch: "dream/theme-arcade",
    commit: "2e0a8d5",
    metric: 9,
    delta: 5,
    guard: "pass",
    gates: "9/9",
    taste: null,
    status: "keep",
    description: "arcade: a cabinet in a dark room — 9 axes from candy",
    ...overrides,
  } as LedgerRow;
}

function scorecard(overrides: Record<string, unknown> = {}) {
  return {
    id: "arcade",
    kind: "theme",
    theme: "arcade",
    date: "2026-09-12",
    brief: "A cabinet in a dark room: magenta light on a mesh of colour.",
    gates: ["generate", "gauntlet"],
    distinctiveness: { nearest: "candy", axis_distance: 9, token_distance: 0.0812 },
    snapshots: ["arcade-light.png", "arcade-dark.png"],
    taste: rubric.emptyTaste(),
    ...overrides,
  };
}

/** A fully and legally scored taste block. */
function scoredTaste(scores: number[] = [4, 4, 3, 4, 5]): TasteBlock {
  const block = rubric.emptyTaste();
  block.judge = "claude-opus-5";
  block.scored = "2026-09-12";
  for (const [index, key] of rubric.RUBRIC_KEYS.entries()) {
    block.scores[key] = { score: scores[index], why: `${key} holds in both schemes, with one caveat.` };
  }
  return block;
}

const render = (data: Partial<Parameters<DigestModule["renderDigest"]>[0]>) =>
  digest.renderDigest({ week: WEEK, rows: [], ...data });

// ── the week arithmetic ─────────────────────────────────────────────────────

describe("weeks", () => {
  it("runs Monday to Sunday", () => {
    expect(digest.weekOf("2026-09-12")).toEqual(WEEK); // a Saturday
    expect(digest.weekOf("2026-09-07")).toEqual(WEEK); // the Monday itself
    expect(digest.weekOf("2026-09-13")).toEqual(WEEK); // the Sunday itself
  });

  it("puts the next Monday in the next week", () => {
    expect(digest.weekOf("2026-09-14")).toEqual({ start: "2026-09-14", end: "2026-09-20" });
  });

  it("crosses a month and a year boundary without moving the day", () => {
    expect(digest.weekOf("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });

  it("takes a Date as readily as a string, in UTC", () => {
    expect(digest.weekOf(new Date("2026-09-12T23:30:00Z"))).toEqual(WEEK);
  });

  it("refuses something that is not a date", () => {
    expect(() => digest.weekOf("last tuesday")).toThrow(/is not an ISO date/);
  });

  it("includes both ends of the week and nothing outside it", () => {
    expect(digest.inWeek("2026-09-07", WEEK)).toBe(true);
    expect(digest.inWeek("2026-09-13", WEEK)).toBe(true);
    expect(digest.inWeek("2026-09-06", WEEK)).toBe(false);
    expect(digest.inWeek("2026-09-14", WEEK)).toBe(false);
    expect(digest.inWeek(null, WEEK)).toBe(false);
  });
});

// ── the counts ──────────────────────────────────────────────────────────────

describe("the week's counts", () => {
  it("counts kept and discarded, and never counts the baseline row", () => {
    const markdown = render({
      rows: [
        row({ iteration: 0, id: "baseline", status: "baseline", branch: null, commit: null, gates: null }),
        row(),
        row({ iteration: 2, id: "moss", status: "discard", gates: "4/9 (gen:theme-previews)" }),
      ],
      briefs: [
        { id: "blueprint", kind: "theme", brief: "A drafting table at 2am.", added: "2026-09-12", status: "pending" },
        { id: "arcade", kind: "theme", brief: "A cabinet.", added: "2026-09-12", status: "kept" },
      ],
    });
    expect(markdown).toContain("**2 dreams · 1 kept · 1 discarded · 1 brief still queued**");
    expect(markdown).toContain(`## Week of ${WEEK.start} – ${WEEK.end}`);
  });

  it("counts one dream in the singular", () => {
    expect(render({ rows: [row()] })).toContain("**1 dream · 1 kept · 0 discarded");
  });

  it("leaves rows from another week out of this week's sections", () => {
    const markdown = render({ rows: [row({ iteration: 2, id: "moss", date: "2026-09-06" }), row()] });
    expect(markdown).toContain("**1 dream");
    expect(markdown).toContain("#### arcade");
    expect(markdown).not.toContain("#### moss");
    // …but the earlier week is still summarized, which is where it went.
    expect(markdown).toContain("## Earlier weeks");
    expect(markdown).toContain("| 2026-08-31 – 2026-09-06 | 1 | 1 | 0 |");
  });

  it("says so plainly when the shift produced nothing", () => {
    const markdown = render({ rows: [] });
    expect(markdown).toContain("No dreams this week.");
    expect(markdown).toContain("**0 dreams · 0 kept · 0 discarded · 0 briefs still queued**");
  });
});

// ── the kept section ────────────────────────────────────────────────────────

describe("a kept dream", () => {
  it("shows the branch, the commit, the brief and the distinctiveness the row measured", () => {
    const markdown = render({ rows: [row()], scorecards: { arcade: scorecard() } });
    expect(markdown).toContain("#### arcade");
    expect(markdown).toContain("> A cabinet in a dark room: magenta light on a mesh of colour.");
    expect(markdown).toContain("- **branch** — `dream/theme-arcade` (`2e0a8d5`)");
    expect(markdown).toContain("- **distinctiveness** — 9 axes from `candy` (ΔE 0.0812)");
  });

  it("names the brief when the theme took a different name", () => {
    const markdown = render({
      rows: [row({ id: "night-market", description: "lanterns: a night market — 7 axes from candy" })],
      scorecards: { "night-market": scorecard({ id: "night-market", theme: "lanterns" }) },
    });
    expect(markdown).toContain("#### lanterns — brief `night-market`");
  });

  it("links both snapshots and the scorecard in the bundle", () => {
    const markdown = render({ rows: [row()], scorecards: { arcade: scorecard() } });
    expect(markdown).toContain("[light](.faqir-dreams/out/arcade/arcade-light.png)");
    expect(markdown).toContain("[dark](.faqir-dreams/out/arcade/arcade-dark.png)");
    expect(markdown).toContain("[scorecard](.faqir-dreams/out/arcade/scorecard.json)");
  });

  it("still names the theme when no bundle survived, reading it off the description", () => {
    const markdown = render({ rows: [row()] });
    expect(markdown).toContain("#### arcade");
    expect(markdown).toContain("[light](.faqir-dreams/out/arcade/arcade-light.png)");
  });

  it("says a dream is unscored rather than implying a score", () => {
    const markdown = render({ rows: [row()], scorecards: { arcade: scorecard() } });
    expect(markdown).toContain("- **taste** — not scored yet (`docs/dream-rubric.md`)");
  });

  it("shows the mean, the rubric version, the judge and every criterion's sentence", () => {
    const markdown = render({
      rows: [row()],
      scorecards: { arcade: scorecard({ taste: scoredTaste([4, 4, 3, 4, 5]) }) },
    });
    expect(markdown).toContain("- **taste** — 4.0 / 5 (rubric 1.0, judged by claude-opus-5)");
    for (const key of rubric.RUBRIC_KEYS) {
      expect(markdown, key).toContain(`  - ${key} **`);
    }
    expect(markdown).toContain("contrast **3** — contrast holds in both schemes, with one caveat.");
  });

  it("prefers the ledger cell to the scorecard when the row carries one", () => {
    const markdown = render({
      rows: [row({ taste: "3.6 rubric-1.0 some-vision-model" })],
      scorecards: { arcade: scorecard({ taste: scoredTaste([5, 5, 5, 5, 5]) }) },
    });
    expect(markdown).toContain("- **taste** — 3.6 / 5 (rubric 1.0, judged by some-vision-model)");
    expect(markdown).not.toContain("5.0 / 5");
  });

  it("refuses to average an invalid block — it reports it as unscored and says why", () => {
    const broken = scoredTaste();
    broken.judge = null; // scored by nobody
    const markdown = render({ rows: [row()], scorecards: { arcade: scorecard({ taste: broken }) } });
    expect(markdown).toContain("- **taste** — unscored: the scorecard's block is invalid (taste.judge:");
    expect(markdown).not.toContain("/ 5 (rubric");
  });

  it("adds the pull request only when gh answered with one for that branch", () => {
    const withPr = render({
      rows: [row()],
      pulls: {
        "dream/theme-arcade": {
          number: 12,
          title: "arcade — a cabinet in a dark room",
          url: "https://example.invalid/pull/12",
          headRefName: "dream/theme-arcade",
        },
      },
    });
    expect(withPr).toContain("- **pull request** — [#12 arcade — a cabinet in a dark room](https://example.invalid/pull/12)");
    // No gh, no section — an absence the digest did not measure is not reported.
    expect(render({ rows: [row()], pulls: null })).not.toContain("pull request");
    expect(render({ rows: [row()], pulls: {} })).not.toContain("pull request");
  });
});

// ── the other sections ──────────────────────────────────────────────────────

describe("the discarded section", () => {
  it("is a table of the gate that stopped it and the reason", () => {
    const markdown = render({
      rows: [
        row({
          iteration: 2,
          id: "moss",
          status: "discard",
          gates: "4/9 (gen:theme-previews)",
          branch: null,
          commit: null,
          metric: null,
          description: "moss: gen:theme-previews failed — no GALLERY_PREVIEWS entry for 'moss'",
        }),
      ],
    });
    expect(markdown).toContain("### Discarded");
    expect(markdown).toContain("| `moss` | 4/9 (gen:theme-previews) | moss: gen:theme-previews failed");
    expect(markdown).toContain("A discard with a reason is the cheapest data the loop produces");
  });

  it("escapes a pipe in a reason rather than ending the cell early", () => {
    const markdown = render({
      rows: [row({ status: "discard", description: "arcade: audit failed — a|b" })],
    });
    expect(markdown).toContain("a\\|b");
  });
});

describe("the queue section", () => {
  it("lists only pending briefs, with what each is aiming at", () => {
    const markdown = render({
      rows: [],
      briefs: [
        { id: "blueprint", kind: "theme", brief: "A drafting table at 2am.", added: "2026-09-11", status: "pending" },
        { id: "arcade", kind: "theme", brief: "A cabinet.", added: "2026-09-12", status: "kept" },
        { id: "moss", kind: "theme", brief: "Wet stone.", added: "2026-09-12", status: "discarded" },
      ],
    });
    expect(markdown).toContain("| `blueprint` | 2026-09-11 | A drafting table at 2am. |");
    expect(markdown).not.toContain("| `arcade` | 2026-09-12 |");
    expect(markdown).not.toContain("| `moss` |");
  });

  it("says where the next briefs go when there are none", () => {
    expect(render({ rows: [], briefs: [] })).toContain("Nothing pending.");
  });
});

describe("earlier weeks", () => {
  it("totals each week, newest first, and leaves this one out of the table", () => {
    const summaries = digest.weekSummaries([
      row({ date: "2026-09-12" }),
      row({ iteration: 2, date: "2026-09-05", status: "discard" }),
      row({ iteration: 3, date: "2026-09-04" }),
    ]);
    expect(summaries.map((s) => s.start)).toEqual(["2026-09-07", "2026-08-31"]);
    expect(summaries[1]).toEqual({ start: "2026-08-31", end: "2026-09-06", total: 2, kept: 1, discarded: 1 });
  });

  it("is absent when every dream is in this week", () => {
    expect(render({ rows: [row()] })).not.toContain("## Earlier weeks");
  });
});

// ── the properties that matter ──────────────────────────────────────────────

describe("the digest as a file", () => {
  it("renders the same bytes twice from the same data", () => {
    const data = { rows: [row()], scorecards: { arcade: scorecard({ taste: scoredTaste() }) } };
    expect(render(data)).toBe(render(data));
  });

  it("ends with exactly one newline and never leaves a blank line doubled", () => {
    const markdown = render({ rows: [row()] });
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
    expect(markdown).not.toContain("\n\n\n");
  });

  it("says how to regenerate itself and that it is generated", () => {
    const markdown = render({ rows: [] });
    expect(markdown).toContain("Generated by `bun run dream:digest`");
    expect(markdown).toContain("Do not edit");
  });
});

// ── the half that reads the world ───────────────────────────────────────────

/** A repository with a ledger, a queue and a bundle — but no real git. */
function fakeRepo(options: { rows?: string[]; briefs?: Record<string, unknown>[]; branches?: Record<string, string[]>; gh?: RunResult } = {}) {
  const root = mkdtempSync(join(tmpdir(), "faqir-digest-"));
  temps.push(root);
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };

  const head = [ledger.LEDGER_PREAMBLE, ledger.LEDGER_COLUMNS.join("\t"), ...(options.rows ?? [])].join("\n") + "\n";
  write("dreams.tsv", head);
  write(
    ".faqir-dreams/queue.json",
    JSON.stringify({ version: 1, briefs: options.briefs ?? [] }, null, 2) + "\n",
  );

  const branches = options.branches ?? {};
  const run: Runner = (command, args) => {
    if (command === "git" && args[0] === "branch") {
      return { status: 0, stdout: Object.keys(branches).join("\n") + "\n", stderr: "" };
    }
    if (command === "git" && args[0] === "show") {
      const branch = String(args[1]).split(":")[0];
      const extra = branches[branch];
      if (!extra) return { status: 128, stdout: "", stderr: "fatal: path 'dreams.tsv' does not exist" };
      return { status: 0, stdout: head + extra.join("\n") + "\n", stderr: "" };
    }
    if (command === "gh") return options.gh ?? { status: 127, stdout: "", stderr: "gh: not found" };
    return { status: 1, stdout: "", stderr: `unexpected ${command}` };
  };
  return { root, run, write };
}

/** The two fixture rows as ledger lines. Lazy: `ledger` arrives in `beforeAll`. */
const keepRow = () => ledger.formatRow(row());
const otherRow = () =>
  ledger.formatRow(row({ iteration: 2, id: "moss", branch: "dream/theme-moss", commit: "abc1234" }));

describe("collecting from the repository", () => {
  it("reads the ledger at HEAD", () => {
    const fake = fakeRepo({ rows: [keepRow()] });
    const rows = digest.collectRows({ root: fake.root, run: fake.run });
    expect(rows.map((r) => r.id)).toEqual(["arcade"]);
  });

  it("adds the row a kept dream committed on its own unmerged branch", () => {
    const fake = fakeRepo({ rows: [], branches: { "dream/theme-arcade": [keepRow()] } });
    const rows = digest.collectRows({ root: fake.root, run: fake.run });
    expect(rows.map((r) => r.id)).toEqual(["arcade"]);
    expect(rows[0].branch).toBe("dream/theme-arcade");
  });

  it("does not count a row twice once its branch has merged", () => {
    const fake = fakeRepo({ rows: [keepRow()], branches: { "dream/theme-arcade": [keepRow()] } });
    expect(digest.collectRows({ root: fake.root, run: fake.run })).toHaveLength(1);
  });

  it("sorts the union by iteration, whichever branch a row came from", () => {
    const fake = fakeRepo({
      rows: [otherRow()],
      branches: { "dream/theme-arcade": [keepRow()] },
    });
    expect(digest.collectRows({ root: fake.root, run: fake.run }).map((r) => r.iteration)).toEqual([1, 2]);
  });

  it("skips a branch with no ledger on it rather than failing the digest", () => {
    const fake = fakeRepo({ rows: [keepRow()], branches: { "dream/theme-half-done": [] } });
    const run: Runner = (command, args) =>
      command === "git" && args[0] === "show"
        ? { status: 128, stdout: "", stderr: "fatal: invalid object name" }
        : fake.run(command, args);
    expect(digest.collectRows({ root: fake.root, run }).map((r) => r.id)).toEqual(["arcade"]);
  });

  it("survives a branch whose ledger is corrupt", () => {
    const fake = fakeRepo({ rows: [keepRow()] });
    const run: Runner = (command, args) => {
      if (command === "git" && args[0] === "branch") return { status: 0, stdout: "dream/theme-x\n", stderr: "" };
      if (command === "git" && args[0] === "show") return { status: 0, stdout: "not\ta\tledger\n", stderr: "" };
      return fake.run(command, args);
    };
    expect(digest.collectRows({ root: fake.root, run }).map((r) => r.id)).toEqual(["arcade"]);
  });

  it("reads only open dream PRs from gh, and null when gh is not there", () => {
    const listed = JSON.stringify([
      { number: 12, title: "arcade", url: "u1", headRefName: "dream/theme-arcade" },
      { number: 13, title: "an unrelated PR", url: "u2", headRefName: "feature/x" },
    ]);
    const fake = fakeRepo({ gh: { status: 0, stdout: listed, stderr: "" } });
    expect(Object.keys(digest.collectPulls({ root: fake.root, run: fake.run })!)).toEqual([
      "dream/theme-arcade",
    ]);
    expect(digest.collectPulls({ root: fakeRepo().root, run: fakeRepo().run })).toBeNull();
  });

  it("is null rather than wrong when gh answers with something unreadable", () => {
    const fake = fakeRepo({ gh: { status: 0, stdout: "<html>not json</html>", stderr: "" } });
    expect(digest.collectPulls({ root: fake.root, run: fake.run })).toBeNull();
  });

  it("reads each dream's scorecard out of its bundle, and tolerates a missing one", () => {
    const fake = fakeRepo({ rows: [keepRow()] });
    fake.write(".faqir-dreams/out/arcade/scorecard.json", JSON.stringify(scorecard()));
    expect(digest.readScorecard(fake.root, "arcade")!.theme).toBe("arcade");
    expect(digest.readScorecard(fake.root, "nobody")).toBeNull();
  });

  it("tolerates a scorecard that is not JSON", () => {
    const fake = fakeRepo({ rows: [keepRow()] });
    fake.write(".faqir-dreams/out/arcade/scorecard.json", "{ truncated");
    expect(digest.readScorecard(fake.root, "arcade")).toBeNull();
  });

  it("gathers the whole picture for the week containing `now`", () => {
    const fake = fakeRepo({
      rows: [keepRow()],
      briefs: [{ id: "blueprint", kind: "theme", brief: "A drafting table at 2am.", added: "2026-09-12", status: "pending" }],
    });
    fake.write(".faqir-dreams/out/arcade/scorecard.json", JSON.stringify(scorecard()));
    const data = digest.collectDigest({ root: fake.root, run: fake.run, now: new Date("2026-09-12T22:00:00Z") });
    expect(data.week).toEqual(WEEK);
    expect(data.rows).toHaveLength(1);
    expect(data.briefs!.map((b) => b.id)).toEqual(["blueprint"]);
    expect(data.scorecards!.arcade).toBeTruthy();
    expect(data.pulls).toBeNull();
  });

  it("takes an explicit week over the clock", () => {
    const fake = fakeRepo({ rows: [keepRow()] });
    const data = digest.collectDigest({
      root: fake.root,
      run: fake.run,
      now: new Date("2026-10-01T00:00:00Z"),
      week: "2026-09-09",
    });
    expect(data.week).toEqual(WEEK);
  });
});

describe("writing DREAMS.md", () => {
  it("writes the file and reports the change", () => {
    const fake = fakeRepo({ rows: [keepRow()] });
    const first = digest.writeDigest({ root: fake.root, run: fake.run, now: new Date("2026-09-12T00:00:00Z") });
    expect(existsSync(first.path)).toBe(true);
    expect(first.changed).toBe(true);
    expect(readFileSync(first.path, "utf8")).toBe(first.markdown);
  });

  it("is idempotent: a second run on an unchanged week rewrites nothing", () => {
    const fake = fakeRepo({ rows: [keepRow()] });
    const options = { root: fake.root, run: fake.run, now: new Date("2026-09-12T00:00:00Z") };
    const first = digest.writeDigest(options);
    const second = digest.writeDigest(options);
    expect(second.changed).toBe(false);
    expect(second.markdown).toBe(first.markdown);
  });

  it("honours --out", () => {
    const fake = fakeRepo({ rows: [keepRow()] });
    const written = digest.writeDigest({
      root: fake.root,
      run: fake.run,
      now: new Date("2026-09-12T00:00:00Z"),
      out: "docs/week.md",
    });
    expect(written.path).toBe(join(fake.root, "docs", "week.md"));
  });
});

describe("the CLI's arguments", () => {
  it("defaults to this week and DREAMS.md", () => {
    expect(digest.parseDigestArgs([])).toEqual({ week: null, out: digest.DIGEST_FILE, print: false });
    expect(digest.DIGEST_FILE).toBe("DREAMS.md");
  });

  it("takes a week, an out and a print flag, in either spelling", () => {
    expect(digest.parseDigestArgs(["--week", "2026-09-12", "--out", "x.md", "--print"])).toEqual({
      week: "2026-09-12",
      out: "x.md",
      print: true,
    });
    expect(digest.parseDigestArgs(["--week=2026-09-12"])!.week).toBe("2026-09-12");
  });

  it("refuses a week that is not a date, an unknown flag, and a flag with no value", () => {
    expect(() => digest.parseDigestArgs(["--week", "tuesday"])).toThrow(/is not an ISO date/);
    expect(() => digest.parseDigestArgs(["--wek", "x"])).toThrow(/Unknown option/);
    expect(() => digest.parseDigestArgs(["--week"])).toThrow(/requires a value/);
  });

  it("prints the usage rather than running for --help", () => {
    expect(digest.parseDigestArgs(["--help"])).toBeNull();
  });
});
