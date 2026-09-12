// ═══════════════════════════════════════════════════════════════════════════
// One brief in, one gated branch out — or one discard          [task 1.1N-01]
// ═══════════════════════════════════════════════════════════════════════════
//
// The gates ARE the dream, so a test that cannot watch them run cannot check
// anything that matters. Every subprocess goes through one injected `run`, and
// this file passes a recording one: a fake repository in a temp directory, a
// stubbed generator that writes the files a real one would, and a recorder that
// keeps the exact sequence of commands so the order can be read back.
//
// What is asserted, in the order the plan asks for it:
//
//   * the gate list runs IN ORDER, each one only after the last succeeded;
//   * the expected files exist and a `keep` row lands in the ledger;
//   * a failing gate writes a `discard` row, names the gate, and leaves no
//     branch — the destructive half, which is the half worth proving;
//   * the path allow-list is checked on the diff BEFORE the commit, not after;
//   * `--dry-run` performs no writes at all.
//
// No real `git`, no real `bun`, no browser. The pieces that do touch the world
// (`defaultRun`) are covered by `tests/meta/spawn-timeouts.test.ts`, which is
// what keeps this file fast enough to run on every change.

import { describe, expect, it, beforeAll, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  loadLedger,
  loadQueue,
  loadRubric,
  loadTheme,
  type LedgerModule,
  type QueueModule,
  type RubricModule,
  type RunResult,
  type Runner,
  type ThemeModule,
} from "./load";

let theme: ThemeModule;
let ledger: LedgerModule;
let queueMod: QueueModule;
let rubric: RubricModule;
beforeAll(async () => {
  theme = await loadTheme();
  ledger = await loadLedger();
  queueMod = await loadQueue();
  rubric = await loadRubric();
});

const ok = (stdout = ""): RunResult => ({ status: 0, stdout, stderr: "" });
const failed = (stderr: string): RunResult => ({ status: 1, stdout: "", stderr });

const temps: string[] = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

const BRIEF = {
  id: "arcade",
  kind: "theme",
  brief: "A cabinet in a dark room: magenta light, everything a lozenge, motion that overshoots.",
  added: "2026-09-12",
  status: "pending",
};

const SEED = {
  name: "arcade",
  accent: "#d926a9",
  neutral: "tinted",
  scheme: "dark",
  motion: "playful",
};

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

interface Fake {
  root: string;
  run: Runner;
  /** Every command the dream launched, joined, in order. */
  calls: string[];
  /** Only the gate names, in the order they ran. */
  gatesRun: () => string[];
  branch: () => string;
  /** Branches created and not deleted. */
  liveBranches: () => string[];
}

/**
 * A repository the dream can run against, with `git` and every gate faked.
 *
 * `failAt` makes one named gate exit non-zero; `extraWrites` adds paths to what
 * the generator "produced", which is how the allow-list case gets a diff that
 * touches something forbidden without a real generator that would never do it.
 */
function fakeRepo(options: {
  failAt?: string;
  extraWrites?: string[];
  briefs?: Record<string, unknown>[];
  seed?: Record<string, unknown> | null;
  startDirty?: string[];
  ledgerRows?: string[];
  hasRemote?: boolean;
} = {}): Fake {
  const root = mkdtempSync(join(tmpdir(), "faqir-dream-"));
  temps.push(root);

  write(
    join(root, ".faqir-dreams", "queue.json"),
    JSON.stringify({ version: 1, briefs: options.briefs ?? [BRIEF] }, null, 2) + "\n",
  );
  if (options.seed !== null) {
    write(
      join(root, ".faqir-dreams", "seeds", `${BRIEF.id}.seed.json`),
      JSON.stringify(options.seed ?? SEED, null, 2) + "\n",
    );
  }
  mkdirSync(join(root, "registry", "themes"), { recursive: true });
  if (options.ledgerRows) {
    write(
      join(root, "dreams.tsv"),
      [ledger.LEDGER_PREAMBLE, ledger.LEDGER_COLUMNS.join("\t"), ...options.ledgerRows].join("\n") + "\n",
    );
  }

  // What the generator would have written, and therefore what `git status`
  // reports once the gates have run.
  const produced = [
    "registry/themes/arcade.css",
    "registry/themes/arcade.theme.json",
    "registry/themes/arcade.seed.json",
    "registry/themes/arcade.preview.html",
    "README.md",
    "packages/core/cdn.json",
    ...(options.extraWrites ?? []),
  ];

  let branch = "main";
  const branches = new Set<string>();
  const changed = new Set<string>(options.startDirty ?? []);
  const calls: string[] = [];

  // The gate a command belongs to, computed from the gate list itself so the
  // fake cannot drift from the pipeline it is standing in for.
  const ctx = { id: BRIEF.id, theme: "arcade", seedPath: `.faqir-dreams/seeds/${BRIEF.id}.seed.json` };
  const gateOf = new Map<string, string>(
    theme.THEME_GATES.map((g) => {
      const [command, args] = g.command(ctx);
      return [[command, ...args].join(" "), g.name];
    }),
  );

  const run: Runner = (command, args) => {
    const key = [command, ...args].join(" ");
    calls.push(key);

    if (command === "git") {
      const sub = args[0];
      if (sub === "rev-parse") return ok(args.includes("--short") ? "deadbee" : branch);
      if (sub === "status") return ok([...changed].map((p) => ` M ${p}`).join("\n"));
      if (sub === "checkout" && args[1] === "-b") {
        branch = args[2];
        branches.add(branch);
        return ok();
      }
      if (sub === "checkout" && args[1] === "--") {
        // `checkout -- .` restores tracked files; untracked output survives it,
        // which is exactly why the pipeline follows it with `clean -fd`.
        for (const p of [...changed]) if (!p.startsWith("registry/themes/")) changed.delete(p);
        return ok();
      }
      if (sub === "checkout" || sub === "switch") {
        branch = args[args.length - 1];
        return ok();
      }
      if (sub === "clean") {
        changed.clear();
        return ok();
      }
      if (sub === "branch" && args.includes("-D")) {
        branches.delete(args[args.length - 1]);
        return ok();
      }
      if (sub === "remote") return options.hasRemote ? ok("origin") : ok("");
      return ok();
    }
    if (command === "gh") return options.hasRemote ? ok("gh version 2.0.0") : failed("not found");

    const gate = gateOf.get(key);
    if (gate && gate === options.failAt) return failed(`${gate} exploded\nsecond line of the report`);
    if (gate === "generate") {
      // The generator, stubbed to a known seed: the files a real run produces,
      // including the manifest whose `distinctiveness` block becomes the metric.
      write(join(root, "registry", "themes", "arcade.css"), ':root { --color-primary: oklch(0.6 0.2 340) }\n');
      write(
        join(root, "registry", "themes", "arcade.theme.json"),
        JSON.stringify(
          { name: "arcade", scheme: "dark", distinctiveness: { nearest: "candy", axis_distance: 9, token_distance: 0.0812 } },
          null,
          2,
        ) + "\n",
      );
      write(join(root, "registry", "themes", "arcade.seed.json"), JSON.stringify(SEED, null, 2) + "\n");
      write(join(root, "registry", "themes", "arcade.preview.html"), "<!doctype html><title>arcade</title>\n");
      for (const p of produced) changed.add(p);
      return ok();
    }
    if (gate === "snapshot") {
      for (const scheme of ["light", "dark"]) {
        write(join(root, ".faqir-dreams", "out", BRIEF.id, `arcade-${scheme}.png`), "PNG");
      }
      return ok();
    }
    return ok();
  };

  return {
    root,
    run,
    calls,
    gatesRun: () => calls.map((c) => gateOf.get(c)).filter((g): g is string => Boolean(g)),
    branch: () => branch,
    liveBranches: () => [...branches],
  };
}

const dream = (fake: Fake, extra: Record<string, unknown> = {}) =>
  theme.runThemeDream({ root: fake.root, run: fake.run, now: new Date("2026-09-13T02:00:00Z"), log: () => {}, ...extra });

const rows = (fake: Fake) => ledger.readLedger(join(fake.root, "dreams.tsv"));
const queueOf = (fake: Fake) => queueMod.readQueue(join(fake.root, ".faqir-dreams", "queue.json"));

describe("the gate list", () => {
  it("is the list §10.2 draws, in order, plus the README regeneration it forgot", () => {
    // `gen:theme-docs` is not discretionary: README's theme tables are a
    // committed generated artifact, so a new theme leaves `check:theme-docs` red
    // and the PR un-mergeable. It runs after the manifests it reads.
    expect(theme.THEME_GATES.map((g) => g.name)).toEqual([
      "generate",
      "gauntlet",
      "audit:registry",
      "gen:theme-manifests",
      "gen:theme-previews",
      "gen:theme-docs",
      "build:core-package",
      "gen:skill",
      "snapshot",
    ]);
  });

  it("gives every gate a sentence and a bounded budget", () => {
    for (const gate of theme.THEME_GATES) {
      expect(gate.describe.length, gate.name).toBeGreaterThan(20);
      expect(gate.timeout, gate.name).toBeGreaterThan(0);
    }
  });

  it("runs them in order, and stops at the first failure", async () => {
    const fake = fakeRepo({ failAt: "gen:theme-previews" });
    await dream(fake);
    expect(fake.gatesRun()).toEqual([
      "generate",
      "gauntlet",
      "audit:registry",
      "gen:theme-manifests",
      "gen:theme-previews",
    ]);
  });
});

describe("a dream that keeps", () => {
  it("produces the expected files and commits them on its own branch", async () => {
    const fake = fakeRepo();
    const result = await dream(fake);

    expect(result.outcome).toBe("keep");
    expect(result.theme).toBe("arcade");
    expect(result.branch).toBe("dream/theme-arcade");
    expect(fake.gatesRun()).toEqual(theme.THEME_GATES.map((g) => g.name));

    for (const file of [
      "registry/themes/arcade.css",
      "registry/themes/arcade.theme.json",
      "registry/themes/arcade.seed.json",
      "registry/themes/arcade.preview.html",
      ".faqir-dreams/out/arcade/scorecard.json",
      ".faqir-dreams/out/arcade/arcade-light.png",
      ".faqir-dreams/out/arcade/arcade-dark.png",
    ]) {
      expect(existsSync(join(fake.root, file)), file).toBe(true);
    }
  });

  it("writes a keep row carrying the distinctiveness the generator measured", async () => {
    const fake = fakeRepo();
    await dream(fake);
    const [row] = rows(fake);
    expect(row.status).toBe("keep");
    expect(row.kind).toBe("theme");
    expect(row.id).toBe("arcade");
    expect(row.branch).toBe("dream/theme-arcade");
    expect(row.metric).toBe(9); // the manifest's axis_distance
    expect(row.gates).toBe(`${theme.THEME_GATES.length}/${theme.THEME_GATES.length}`);
    expect(row.guard).toBe("pass");
    expect(row.date).toBe("2026-09-13");
    expect(row.description).toContain("9 axes from candy");
  });

  it("cites the commit the theme actually landed in", async () => {
    // Two commits, not one: a row cannot cite a hash it is inside. The theme
    // first, then the row naming it — the same shape /faqir-plan uses for its
    // own cursor.
    const fake = fakeRepo();
    const result = await dream(fake);
    expect(result.commit).toBe("deadbee");
    expect(rows(fake)[0].commit).toBe("deadbee");
    const commits = fake.calls.filter((c) => c.startsWith("git commit"));
    expect(commits.length).toBe(2);
    expect(commits[0]).toContain("feat(dream/arcade): arcade");
    expect(commits[1]).toContain("chore(dream/arcade): record the dream in dreams.tsv");
  });

  it("continues the ledger's numbering and measures the delta against the last theme row", async () => {
    const previous = ledger.formatRow({
      iteration: 0, date: "2026-09-12", kind: "theme", id: "baseline", branch: null, commit: null,
      metric: 4, delta: 0, guard: "pass", gates: null, taste: null, status: "baseline",
      description: "24 shipped themes; the closest pair differs on 4 axes",
    });
    const fake = fakeRepo({ ledgerRows: [previous] });
    await dream(fake);
    const all = rows(fake);
    expect(all.length).toBe(2);
    expect(all[1].iteration).toBe(1);
    expect(all[1].delta).toBe(5); // 9 − 4
  });

  it("writes a scorecard the morning review and the rubric can both read", async () => {
    const fake = fakeRepo();
    await dream(fake);
    const card = JSON.parse(readFileSync(join(fake.root, ".faqir-dreams/out/arcade/scorecard.json"), "utf8"));
    expect(card.theme).toBe("arcade");
    expect(card.brief).toBe(BRIEF.brief);
    expect(card.seed).toEqual(SEED);
    expect(card.gates).toEqual(theme.THEME_GATES.map((g) => g.name));
    expect(card.distinctiveness).toEqual({ nearest: "candy", axis_distance: 9, token_distance: 0.0812 });
    expect(card.snapshots).toEqual(["arcade-light.png", "arcade-dark.png"]);
    // The taste block is the versioned rubric, empty: the scorer looks at the
    // PNGs after this row is written, so what a fresh scorecard carries is the
    // rubric's identity and one null per criterion (1.1N-02).
    expect(card.taste).toEqual(rubric.emptyTaste());
    expect(card.taste.rubric).toBe(rubric.RUBRIC_VERSION);
    expect(card.taste.rubric_doc).toBe("docs/dream-rubric.md");
    expect(Object.keys(card.taste.scores)).toEqual(rubric.RUBRIC_KEYS);
    expect(rubric.validateTaste(card.taste)).toEqual([]);
  });

  it("marks the brief kept, and never picks it again", async () => {
    const fake = fakeRepo();
    await dream(fake);
    const queue = queueOf(fake);
    expect(queue.briefs[0].status).toBe("kept");
    expect(queueMod.pickNext(queue, "theme")).toBeNull();
  });

  it("never pushes and never merges", async () => {
    const fake = fakeRepo({ hasRemote: true });
    await dream(fake);
    for (const forbidden of ["git push", "git merge", "git rebase", "gh pr merge"]) {
      expect(fake.calls.some((c) => c.startsWith(forbidden)), forbidden).toBe(false);
    }
    // With a remote and `gh`, the run says how to open the PR; it does not open
    // one. PR-only means a human's decision stays a human's decision (§10.2).
    expect(fake.calls.some((c) => c.startsWith("gh pr create"))).toBe(false);
  });
});

describe("a dream that is discarded", () => {
  it("writes a discard row naming the gate and the first line of its report", async () => {
    const fake = fakeRepo({ failAt: "gauntlet" });
    const result = await dream(fake);

    expect(result.outcome).toBe("discard");
    expect(result.reason).toBe("gate");
    expect(result.gate).toBe("gauntlet");
    const [row] = rows(fake);
    expect(row.status).toBe("discard");
    expect(row.guard).toBe("fail");
    expect(row.gates).toBe(`1/${theme.THEME_GATES.length} (gauntlet)`);
    expect(row.metric).toBeNull();
    expect(row.description).toContain("gauntlet failed");
    expect(row.description).toContain("gauntlet exploded");
    // One cell, one line: the console gets the rest.
    expect(row.description).not.toContain("second line");
  });

  it("leaves no branch and no generated file behind", async () => {
    const fake = fakeRepo({ failAt: "audit:registry" });
    await dream(fake);
    expect(fake.liveBranches()).toEqual([]);
    expect(fake.branch()).toBe("main");
    expect(fake.calls).toContain("git branch -D dream/theme-arcade");
    expect(fake.calls).toContain("git clean -fd");
    expect(existsSync(join(fake.root, ".faqir-dreams/out/arcade"))).toBe(false);
  });

  it("marks the brief discarded, which is terminal", async () => {
    const fake = fakeRepo({ failAt: "gen:skill" });
    await dream(fake);
    const queue = queueOf(fake);
    expect(queue.briefs[0].status).toBe("discarded");
    expect(() => queueMod.transition(queue.briefs[0], "pending")).toThrow(/terminal/);
  });

  it("records the discard even though the branch it was on is gone", async () => {
    // The row lands in the working tree of the branch the dream started from,
    // uncommitted and on purpose: there is nothing left to attach it to.
    const fake = fakeRepo({ failAt: "generate" });
    await dream(fake);
    expect(rows(fake).length).toBe(1);
    expect(rows(fake)[0].branch).toBeNull();
  });
});

describe("the allow-list, checked on the diff before anything is committed", () => {
  it("discards a dream whose diff reaches a forbidden path", async () => {
    const fake = fakeRepo({ extraWrites: ["SPEC-1.0.md"] });
    const result = await dream(fake);

    expect(result.outcome).toBe("discard");
    expect(result.reason).toBe("guard");
    expect(result.violations?.map((v) => v.path)).toEqual(["SPEC-1.0.md"]);
    expect(rows(fake)[0].description).toContain("SPEC-1.0.md");
    expect(rows(fake)[0].description).toContain("forbidden path");
  });

  it("discards one whose diff reaches a path no gate writes", async () => {
    const fake = fakeRepo({ extraWrites: ["src/core-src/engine.js"] });
    const result = await dream(fake);
    expect(result.outcome).toBe("discard");
    expect(result.violations![0].kind).toBe("outside-allow-list");
  });

  it("checks it BEFORE the commit, so nothing forbidden is ever committed", async () => {
    const fake = fakeRepo({ extraWrites: ["package.json"] });
    await dream(fake);
    expect(fake.calls.some((c) => c.startsWith("git commit"))).toBe(false);
    expect(fake.liveBranches()).toEqual([]);
  });

  it("runs every gate first — a forbidden path is found after the work, not instead of it", async () => {
    // Deliberate: the gates are what decide whether the theme was any good, and
    // the ledger row says so even when the diff is refused. A guard that
    // short-circuited would record "guard failed" with nothing behind it.
    const fake = fakeRepo({ extraWrites: ["manifest.schema.json"] });
    await dream(fake);
    expect(fake.gatesRun()).toEqual(theme.THEME_GATES.map((g) => g.name));
    expect(rows(fake)[0].gates).toBe(`${theme.THEME_GATES.length}/${theme.THEME_GATES.length}`);
  });
});

describe("refusals — runs that should not have started", () => {
  it("refuses a dirty tree before touching anything", async () => {
    const fake = fakeRepo({ startDirty: ["src/index.ts"] });
    await expect(dream(fake)).rejects.toThrow(/dirty tree/);
    expect(fake.calls.some((c) => c.startsWith("git checkout"))).toBe(false);
    expect(existsSync(join(fake.root, "dreams.tsv"))).toBe(false);
  });

  it("refuses when the agent wrote no seed", async () => {
    const fake = fakeRepo({ seed: null });
    await expect(dream(fake)).rejects.toThrow(/No seed at .*arcade\.seed\.json/);
    expect(fake.liveBranches()).toEqual([]);
  });

  it("refuses a seed with no usable name", async () => {
    const fake = fakeRepo({ seed: { name: "Arcade Cabinet", accent: "#d926a9" } });
    await expect(dream(fake)).rejects.toThrow(/lowercase kebab-case "name"/);
  });

  it("refuses to overwrite a theme that already ships", async () => {
    const fake = fakeRepo();
    write(join(fake.root, "registry", "themes", "arcade.css"), ":root{}\n");
    await expect(dream(fake)).rejects.toThrow(/already ships. A dream adds a theme/);
  });

  it("refuses a brief of a kind that has no pipeline yet", async () => {
    const fake = fakeRepo({ briefs: [{ ...BRIEF, kind: "component" }] });
    await expect(dream(fake, { briefId: "arcade" })).rejects.toThrow(/only theme dreams have a pipeline/);
  });

  it("says so, calmly, when the queue is exhausted", async () => {
    const fake = fakeRepo({ briefs: [{ ...BRIEF, status: "kept" }] });
    const result = await dream(fake);
    expect(result.outcome).toBe("empty");
    expect(existsSync(join(fake.root, "dreams.tsv"))).toBe(false);
  });

  it("releases a brief a crashed run left dreaming, rather than stranding it", async () => {
    const fake = fakeRepo({ briefs: [{ ...BRIEF, status: "dreaming" }] });
    const result = await dream(fake);
    expect(result.outcome).toBe("keep");
    expect(queueOf(fake).briefs[0].status).toBe("kept");
  });
});

describe("--dry-run", () => {
  it("performs no writes at all", async () => {
    const fake = fakeRepo();
    const before = readFileSync(join(fake.root, ".faqir-dreams", "queue.json"), "utf8");
    const result = await dream(fake, { dryRun: true });

    expect(result.outcome).toBe("dry-run");
    expect(result.gates).toEqual(theme.THEME_GATES.map((g) => g.name));
    expect(result.seedExists).toBe(true);
    expect(result.theme).toBe("arcade");
    expect(existsSync(join(fake.root, "dreams.tsv"))).toBe(false);
    expect(existsSync(join(fake.root, "registry", "themes", "arcade.css"))).toBe(false);
    expect(existsSync(join(fake.root, ".faqir-dreams", "out"))).toBe(false);
    expect(readFileSync(join(fake.root, ".faqir-dreams", "queue.json"), "utf8")).toBe(before);
  });

  it("creates no branch and runs no gate — only the two reads that decide what it would do", async () => {
    const fake = fakeRepo();
    await dream(fake, { dryRun: true });
    expect(fake.gatesRun()).toEqual([]);
    expect(fake.liveBranches()).toEqual([]);
    expect(fake.calls).toEqual(["git rev-parse --abbrev-ref HEAD", "git status --porcelain"]);
  });

  it("still refuses a dirty tree, so the rehearsal rehearses the refusal too", async () => {
    const fake = fakeRepo({ startDirty: ["README.md"] });
    await expect(dream(fake, { dryRun: true })).rejects.toThrow(/dirty tree/);
  });

  it("rehearses before the seed exists, which is when it is actually asked", async () => {
    // The skill runs a dry run at Step 0 and writes the seed at Step 2. A
    // rehearsal that needs the seed is a rehearsal that cannot answer the
    // question it is run to answer: can the shift run at all tonight?
    const fake = fakeRepo({ seed: null });
    const result = await dream(fake, { dryRun: true });
    expect(result.outcome).toBe("dry-run");
    expect(result.seedExists).toBe(false);
    expect(result.theme).toBeNull();
    expect(result.branch).toBe("dream/theme-arcade");
    expect(result.seedPath).toBe(".faqir-dreams/seeds/arcade.seed.json");
  });

  it("still validates a seed that IS there — rehearsing the wrong run helps nobody", async () => {
    const fake = fakeRepo({ seed: { name: "Arcade Cabinet", accent: "#d926a9" } });
    await expect(dream(fake, { dryRun: true })).rejects.toThrow(/lowercase kebab-case "name"/);
  });
});

describe("the repository, as the dream reads it", () => {
  it("reads the branch, the dirty paths and whether a PR is possible", () => {
    const run: Runner = (command, args) => {
      if (command === "gh") return ok("gh version 2.0.0");
      if (args[0] === "rev-parse") return ok("dream/theme-arcade\n");
      if (args[0] === "status") return ok(" M README.md\n?? registry/themes/arcade.css\n");
      if (args[0] === "remote") return ok("origin\n");
      return ok();
    };
    expect(theme.currentBranch(run)).toBe("dream/theme-arcade");
    expect(theme.dirtyPaths(run)).toEqual(["README.md", "registry/themes/arcade.css"]);
    expect(theme.canOpenPullRequest(run)).toBe(true);
  });

  it("reads a rename's destination, not its source", () => {
    const run: Runner = (command, args) =>
      args[0] === "status" ? ok('R  old.css -> registry/themes/arcade.css\n') : ok();
    expect(theme.dirtyPaths(run)).toEqual(["registry/themes/arcade.css"]);
  });

  it("says no PR is possible with a remote but no gh, and with gh but no remote", () => {
    const withRemote: Runner = (command, args) =>
      command === "gh" ? failed("not found") : args[0] === "remote" ? ok("origin\n") : ok();
    const withGh: Runner = (command, args) =>
      command === "gh" ? ok("gh version 2.0.0") : args[0] === "remote" ? ok("") : ok();
    expect(theme.canOpenPullRequest(withRemote)).toBe(false);
    expect(theme.canOpenPullRequest(withGh)).toBe(false);
  });

  it("abstains from a metric rather than inventing one when the manifest has none", () => {
    const dir = mkdtempSync(join(tmpdir(), "faqir-metric-"));
    temps.push(dir);
    mkdirSync(join(dir, "registry", "themes"), { recursive: true });
    expect(theme.readMetric(dir, "arcade")).toEqual({ metric: null, nearest: null });
    write(join(dir, "registry", "themes", "arcade.theme.json"), '{"name":"arcade"}\n');
    expect(theme.readMetric(dir, "arcade")).toEqual({ metric: null, nearest: null });
    write(join(dir, "registry", "themes", "arcade.theme.json"), "{not json\n");
    expect(theme.readMetric(dir, "arcade")).toEqual({ metric: null, nearest: null });
  });
});

describe("the command line", () => {
  it("parses the three options and nothing else", () => {
    expect(theme.parseDreamArgs([])).toEqual({ briefId: null, seedPath: null, dryRun: false });
    expect(theme.parseDreamArgs(["--brief", "arcade", "--dry-run"])).toEqual({
      briefId: "arcade",
      seedPath: null,
      dryRun: true,
    });
    expect(theme.parseDreamArgs(["--brief=arcade", "--seed=s.json"])).toEqual({
      briefId: "arcade",
      seedPath: "s.json",
      dryRun: false,
    });
    expect(theme.parseDreamArgs(["--help"])).toBeNull();
  });

  it("refuses an unknown option and a flag with no value", () => {
    expect(() => theme.parseDreamArgs(["--merge"])).toThrow(/Unknown option/);
    expect(() => theme.parseDreamArgs(["--brief"])).toThrow(/requires a value/);
    expect(() => theme.parseDreamArgs(["--brief", "--dry-run"])).toThrow(/requires a value/);
  });
});
