#!/usr/bin/env node
/**
 * The theme dream  [task 1.1N-01]
 *
 * One brief in, one gated branch out — or one discard row with a reason. This
 * is the pipeline FAQIR-VISION §10.2 draws, made literal: the agent writes a
 * seed from the brief (choosing the axes is the part that needs taste), and
 * everything after that is a fixed list of gates that either all pass or the
 * night produced nothing. `THEME_GATES` is that list, exported, so the ledger
 * can name which gate stopped a dream and a test can assert the order.
 *
 * Two design rules earn their weight here:
 *
 *   **Every subprocess goes through one injected `run`.** The gates ARE the
 *   dream, so a test that cannot watch them run cannot check anything that
 *   matters; `tests/dream/theme-dream.test.ts` passes a recording runner and
 *   reads the sequence back. The default is `spawnBudgeted`, so nothing the
 *   shift launches is unbounded (`scripts/spawn.mjs`).
 *
 *   **The guards are called, not remembered.** `guards.mjs` holds them as pure
 *   functions and this file routes every git invocation and the whole diff
 *   through them. A rule that lives only in `.claude/commands/faqir-dream.md`
 *   is a rule the next model may read differently.
 *
 * Run: `node scripts/dream/theme.mjs --brief <id> [--seed <path>] [--dry-run]`
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isTimeout, spawnBudgeted, timeoutMessage } from "../spawn.mjs";
import {
  assertCleanStart,
  assertGenerateArgsAllowed,
  assertGitAllowed,
  assertNotProtected,
  checkDiffPaths,
  diffViolationSummary,
} from "./guards.mjs";
import { appendRow, nextPosition, readLedger } from "./ledger.mjs";
import { findBrief, pickNext, readQueue, releaseStale, transition, writeQueue } from "./queue.mjs";
import { RUBRIC_PATH, RUBRIC_VERSION, emptyTaste } from "./rubric.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Where the shift keeps its state, relative to the repository root. */
export const DREAMS_DIR = ".faqir-dreams";
export const QUEUE_FILE = `${DREAMS_DIR}/queue.json`;
export const SEEDS_DIR = `${DREAMS_DIR}/seeds`;
export const OUT_DIR = `${DREAMS_DIR}/out`;
export const LEDGER_FILE = "dreams.tsv";
/** Where a generated theme lands. The same directory the shipped 24 live in. */
export const THEME_OUT_DIR = "registry/themes";

/**
 * A gate is slow (the gauntlet is a few thousand tests) but not unbounded. One
 * budget class per kind of work, in the spirit of `tests/helpers/spawn.ts`:
 * a generator pass, a build, and the full theme suite.
 */
const MINUTE = 60_000;
export const GATE_TIMEOUT = {
  GENERATE: 3 * MINUTE,
  SUITE: 20 * MINUTE,
  BUILD: 5 * MINUTE,
  SNAPSHOT: 5 * MINUTE,
  GIT: MINUTE,
};

/**
 * The gates, in the order §10.2 lists them, plus the one it does not.
 *
 * `gen:theme-docs` is the addition, and it is not discretionary: README's theme
 * tables are a committed generated artifact (the plan's own regeneration map
 * names it), so a new theme leaves `check:theme-docs` red and the PR
 * un-mergeable without it. It runs after `gen:theme-manifests` because it reads
 * the manifests that step writes.
 *
 * Each entry is a function of the run's context so the two gates that need the
 * theme's name and the brief's id can have them, and the rest stay constant.
 */
export const THEME_GATES = [
  {
    name: "generate",
    describe: "faqir theme generate — the seed becomes CSS, a manifest and a preview",
    command: (ctx) => ["bun", ["src/index.ts", "theme", "generate", "--seed", ctx.seedPath, "--out", THEME_OUT_DIR]],
    timeout: GATE_TIMEOUT.GENERATE,
  },
  {
    name: "gauntlet",
    describe: "the theme suite — axes, manifests, distinctiveness, byte-for-byte regeneration",
    command: () => ["bun", ["test", "tests/themes", "tests/commands/theme-generate.test.ts"]],
    timeout: GATE_TIMEOUT.SUITE,
  },
  {
    name: "audit:registry",
    describe: "registry integrity over everything the generator wrote",
    command: () => ["bun", ["run", "audit:registry"]],
    timeout: GATE_TIMEOUT.BUILD,
  },
  {
    name: "gen:theme-manifests",
    describe: "derived manifests — tokens_overridden/inherited, axes, distinctiveness",
    command: () => ["bun", ["run", "gen:theme-manifests"]],
    timeout: GATE_TIMEOUT.BUILD,
  },
  {
    name: "gen:theme-previews",
    describe: "the gallery harness the snapshot and the docs site render",
    command: () => ["bun", ["run", "gen:theme-previews"]],
    timeout: GATE_TIMEOUT.BUILD,
  },
  {
    name: "gen:theme-docs",
    describe: "README's theme tables — a committed artifact a new theme invalidates",
    command: () => ["bun", ["run", "gen:theme-docs"]],
    timeout: GATE_TIMEOUT.BUILD,
  },
  {
    name: "build:core-package",
    describe: "the CDN bundle and its SRI hashes, which now carry one more theme",
    command: () => ["node", ["scripts/build-core-package.mjs"]],
    timeout: GATE_TIMEOUT.BUILD,
  },
  {
    name: "gen:skill",
    describe: "the agent surface, so the theme is discoverable the morning it lands",
    command: () => ["bun", ["run", "gen:skill"]],
    timeout: GATE_TIMEOUT.BUILD,
  },
  {
    name: "snapshot",
    describe: "the light/dark pair the scorecard and the PR show (§10.5)",
    command: (ctx) => [
      "node",
      ["scripts/dream/snapshot.mjs", "--theme", ctx.theme, "--out", `${OUT_DIR}/${ctx.id}`],
    ],
    timeout: GATE_TIMEOUT.SNAPSHOT,
  },
];

/**
 * The default subprocess runner: budgeted, captured, never inherited.
 *
 * The timeout is named here rather than left to `...options`, and not only to
 * satisfy `tests/meta/spawn-timeouts.test.ts`: a `timeout` arriving through a
 * spread is a timeout that is `undefined` the day a caller forgets it, and
 * `spawnSync` reads `undefined` as "no bound at all". The fallback is the BUILD
 * class because that is what an unlabelled gate most resembles.
 */
export function defaultRun(command, args, options = {}) {
  const result = spawnBudgeted(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    ...options,
    timeout: options.timeout ?? GATE_TIMEOUT.BUILD,
  });
  if (isTimeout(result)) {
    return {
      status: 124,
      stdout: result.stdout ?? "",
      stderr: timeoutMessage(command, args, options.timeout),
    };
  }
  if (result.error) {
    return { status: 127, stdout: "", stderr: String(result.error.message ?? result.error) };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** A `run` that refuses whatever `guards.mjs` refuses, before the child starts. */
function guardedRun(run) {
  return (command, args, options) => {
    if (command === "git") assertGitAllowed(args);
    if (args.includes("theme") && args.includes("generate")) assertGenerateArgsAllowed(args);
    return run(command, args, options);
  };
}

/** Trim a child's output to something a ledger row or a console can carry. */
function tail(text, lines = 12) {
  return String(text ?? "").trimEnd().split("\n").slice(-lines).join("\n");
}

/** The first line of a failure, collapsed for the ledger's `description`. */
function firstProblem(result) {
  const source = (result.stderr || result.stdout || "").trim();
  const line = source.split("\n").find((l) => l.trim()) ?? "no output";
  return line.replace(/\s+/g, " ").slice(0, 160);
}

// ── the repository, as the dream sees it ────────────────────────────────────

/** The branch HEAD is on, or `"HEAD"` when detached. */
export function currentBranch(run) {
  const r = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { timeout: GATE_TIMEOUT.GIT });
  return r.status === 0 ? r.stdout.trim() : "HEAD";
}

/**
 * Where the dream started, as `git checkout` arguments that return there.
 *
 * On a branch that is the branch. Detached — which is how `nightly.sh` runs
 * every dream, in a `worktree add --detach` checkout — `rev-parse --abbrev-ref`
 * says the literal `HEAD`, and `git checkout HEAD` after `checkout -b <dream>`
 * stays ON the dream branch: the `branch -D` that follows then fails (git will
 * not delete the checked-out branch) and a discarded dream left its branch
 * behind. So a detached start is captured as its commit and returned to with
 * `--detach <sha>`.
 */
export function startPoint(run) {
  const branch = currentBranch(run);
  if (branch !== "HEAD") return { label: branch, checkout: [branch] };
  const head = run("git", ["rev-parse", "HEAD"], { timeout: GATE_TIMEOUT.GIT });
  if (head.status !== 0) throw new Error(`git rev-parse HEAD failed: ${tail(head.stderr)}`);
  const sha = head.stdout.trim();
  return { label: `detached at ${sha.slice(0, 12)}`, checkout: ["--detach", sha] };
}

/** Every path with an uncommitted change, tracked or not. */
export function dirtyPaths(run) {
  const r = run("git", ["status", "--porcelain"], { timeout: GATE_TIMEOUT.GIT });
  if (r.status !== 0) throw new Error(`git status failed: ${tail(r.stderr)}`);
  return r.stdout
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    // A rename reads `old -> new`; the destination is the path that changed.
    .map((path) => (path.includes(" -> ") ? path.split(" -> ")[1] : path))
    .map((path) => path.replace(/^"|"$/g, ""));
}

/** True when a git remote exists and `gh` is on PATH — the two a PR needs. */
export function canOpenPullRequest(run) {
  const remote = run("git", ["remote"], { timeout: GATE_TIMEOUT.GIT });
  if (remote.status !== 0 || !remote.stdout.trim()) return false;
  const gh = run("gh", ["--version"], { timeout: GATE_TIMEOUT.GIT });
  return gh.status === 0;
}

// ── the dream ───────────────────────────────────────────────────────────────

/**
 * Read the seed the agent wrote for `id`, and answer the only two questions the
 * pipeline has about it: is it JSON, and what is the theme called? Every other
 * property of a seed is `validateThemeSeed`'s to judge, and it judges it inside
 * `theme generate` — checking twice here is how two spellings of one rule drift
 * apart, which is the reason `theme generate` itself stopped validating flags.
 */
export function readSeed(seedPath, root = ROOT) {
  if (!existsSync(seedPath)) {
    throw new Error(
      `No seed at ${seedPath}. A dream starts from a seed the agent wrote from the brief — ` +
        `see .claude/commands/faqir-dream.md.`,
    );
  }
  let seed;
  try {
    seed = JSON.parse(readFileSync(seedPath, "utf8"));
  } catch (error) {
    throw new Error(`Seed '${seedPath}' is not valid JSON: ${error.message}`);
  }
  if (typeof seed !== "object" || seed === null || Array.isArray(seed)) {
    throw new Error(`Seed '${seedPath}' must be a JSON object.`);
  }
  if (typeof seed.name !== "string" || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(seed.name)) {
    throw new Error(
      `Seed '${seedPath}' needs a lowercase kebab-case "name" — it becomes ` +
        `registry/themes/<name>.css and the theme an agent selects by.`,
    );
  }
  if (existsSync(join(root, THEME_OUT_DIR, `${seed.name}.css`))) {
    throw new Error(
      `A theme called '${seed.name}' already ships. A dream adds a theme; it never overwrites one.`,
    );
  }
  return seed;
}

/** The distinctiveness the generator measured, read back out of the manifest. */
export function readMetric(root, theme) {
  const manifestPath = join(root, THEME_OUT_DIR, `${theme}.theme.json`);
  if (!existsSync(manifestPath)) return { metric: null, nearest: null };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const d = manifest.distinctiveness;
    if (!d || typeof d.axis_distance !== "number") return { metric: null, nearest: null };
    return { metric: d.axis_distance, nearest: d.nearest ?? null, tokenDistance: d.token_distance ?? null };
  } catch {
    return { metric: null, nearest: null };
  }
}

/**
 * Run one dream.
 *
 * Returns a result object rather than throwing on a gate failure: a failed gate
 * is a *normal outcome* of a night — it is the discard half of keep/discard —
 * and the caller still has a ledger row to write and a brief to mark. Only a
 * refusal (a guard, a missing seed, a dirty tree) throws, because that is a run
 * that should not have started.
 */
export async function runThemeDream(options = {}) {
  const {
    root = ROOT,
    briefId = null,
    run: rawRun = defaultRun,
    now = new Date(),
    dryRun = false,
    log = console.log,
  } = options;

  const run = guardedRun((command, args, opts = {}) =>
    rawRun(command, args, { cwd: root, encoding: "utf8", ...opts }),
  );

  const queuePath = join(root, QUEUE_FILE);
  const ledgerPath = join(root, LEDGER_FILE);
  const date = now.toISOString().slice(0, 10);

  // 1 ── the tree the dream starts from
  const start = startPoint(run);
  const dirty = dirtyPaths(run);
  assertCleanStart({ branch: start.label, dirty: dirty.length > 0, files: dirty });

  // 2 ── the brief
  const queue = readQueue(queuePath);
  const released = releaseStale(queue);
  if (released.length > 0) {
    log(`↻ released ${released.length} brief(s) a previous run left dreaming: ${released.join(", ")}`);
  }
  const brief = briefId ? findBrief(queue, briefId) : pickNext(queue, "theme");
  if (!brief) {
    if (briefId) throw new Error(`No brief '${briefId}' in ${QUEUE_FILE}.`);
    log("· the queue has no pending theme brief. Nothing to dream tonight.");
    return { outcome: "empty", brief: null };
  }
  if (brief.kind !== "theme") {
    throw new Error(
      `Brief '${brief.id}' is a ${brief.kind} dream and only theme dreams have a pipeline in 1.1 (§10.3).`,
    );
  }
  if (brief.status !== "pending") {
    throw new Error(`Brief '${brief.id}' is ${brief.status}, not pending.`);
  }

  const seedPath = options.seedPath ?? join(SEEDS_DIR, `${brief.id}.seed.json`);
  const absoluteSeed = resolve(root, seedPath);
  const branch = `dream/theme-${brief.id}`;

  // A rehearsal has to work BEFORE the seed exists, because "can the shift run
  // at all tonight?" is the question it is asked first — the skill's own Step 0
  // runs it before Step 2 writes the seed. So a missing seed is reported here
  // rather than thrown; a seed that exists is still validated, because a
  // rehearsal that skips the check is a rehearsal of the wrong run.
  if (dryRun) {
    const seed = existsSync(absoluteSeed) ? readSeed(absoluteSeed, root) : null;
    const theme = seed?.name ?? `<${brief.id}>`;
    const ctx = { id: brief.id, theme, seedPath, branch, root };
    log(`— dry run: brief '${brief.id}' → theme '${theme}' on ${branch}`);
    log(
      seed
        ? `    seed: ${seedPath} ✓`
        : `    seed: ${seedPath} — NOT WRITTEN YET (the dream's one hand-written input)`,
    );
    for (const gate of THEME_GATES) {
      const [command, args] = gate.command(ctx);
      log(`    ${gate.name}: ${[command, ...args].join(" ")}`);
    }
    log("— no branch created, no gate run, no file written.");
    return {
      outcome: "dry-run",
      brief,
      theme: seed?.name ?? null,
      branch,
      seedPath,
      seedExists: Boolean(seed),
      gates: THEME_GATES.map((g) => g.name),
    };
  }

  const seed = readSeed(absoluteSeed, root);
  const theme = seed.name;
  const ctx = { id: brief.id, theme, seedPath, branch, root };

  // 3 ── mark the brief, so a crash is distinguishable from a night that never ran
  transition(brief, "dreaming");
  writeQueue(queuePath, queue);

  const rows = readLedger(ledgerPath);

  /** Mark the brief terminal and write the queue where HEAD currently is. */
  const markBrief = (status) => {
    transition(brief, status === "keep" ? "kept" : "discarded");
    writeQueue(queuePath, queue);
  };

  /** Append the row this dream earned. Append-only; see `ledger.mjs`. */
  const recordRow = (status, { metric = null, gates, taste = null, commit = null, description, branchName = null }) => {
    const { iteration, delta } = nextPosition(rows, "theme", metric);
    return appendRow(ledgerPath, {
      iteration,
      date,
      kind: "theme",
      id: brief.id,
      branch: branchName,
      commit,
      metric,
      delta,
      guard: status === "keep" ? "pass" : "fail",
      gates,
      taste,
      status,
      description,
    });
  };

  /**
   * A discard leaves the queue update and the ledger row in the working tree of
   * the branch the dream started from, uncommitted and on purpose: the dream
   * itself is gone, so there is nothing to attach them to, and the morning
   * review decides whether a night that produced nothing is worth a commit.
   * `docs/night-shift.md` says so where someone finds a dirty tree.
   */
  const discard = (fields) => {
    markBrief("discard");
    recordRow("discard", fields);
  };

  // 4 ── the branch
  const created = run("git", ["checkout", "-b", branch], { timeout: GATE_TIMEOUT.GIT });
  if (created.status !== 0) {
    discard({
      gates: `0/${THEME_GATES.length}`,
      description: `could not create ${branch}: ${firstProblem(created)}`,
    });
    throw new Error(`Failed to create ${branch}: ${tail(created.stderr)}`);
  }

  /**
   * Undo everything the dream did and return to where it started. Every step's
   * exit status is checked: a cleanup that silently fails leaves a dream
   * branch — or its files — behind while the ledger says "discarded". The
   * failures come back as text, for the log and the discard row.
   */
  const abandon = () => {
    const problems = [];
    const step = (args) => {
      const r = run("git", args, { timeout: GATE_TIMEOUT.GIT });
      if (r.status !== 0) problems.push(`git ${args.join(" ")}: ${firstProblem(r)}`);
      return r.status === 0;
    };
    step(["checkout", "--", "."]);
    step(["clean", "-fd"]);
    // Only delete the branch once HEAD is off it — git refuses otherwise, and
    // the refusal is the leak this is here to report.
    if (step(["checkout", ...start.checkout])) step(["branch", "-D", branch]);
    else problems.push(`branch ${branch} left in place: could not leave it`);
    rmSync(join(root, OUT_DIR, brief.id), { recursive: true, force: true });
    if (problems.length > 0) log(`⚠ cleanup incomplete:\n${problems.map((p) => `    ${p}`).join("\n")}`);
    return problems;
  };
  const cleanupNote = (problems) =>
    problems.length > 0 ? ` [cleanup incomplete: ${problems[0]}]` : "";

  // 5 ── the gates
  const passed = [];
  for (const gate of THEME_GATES) {
    const [command, args] = gate.command(ctx);
    log(`▸ ${gate.name} — ${gate.describe}`);
    const result = run(command, args, { timeout: gate.timeout });
    if (result.status !== 0) {
      log(`✗ ${gate.name} failed:\n${tail(result.stderr || result.stdout)}`);
      const leftovers = abandon();
      discard({
        gates: `${passed.length}/${THEME_GATES.length} (${gate.name})`,
        description: `${theme}: ${gate.name} failed — ${firstProblem(result)}${cleanupNote(leftovers)}`,
      });
      return {
        outcome: "discard",
        reason: "gate",
        gate: gate.name,
        brief,
        theme,
        output: tail(result.stderr || result.stdout, 40),
      };
    }
    passed.push(gate.name);
  }

  // 6 ── the diff, before anything is committed
  const changed = dirtyPaths(run);
  const verdict = checkDiffPaths(changed);
  if (!verdict.ok) {
    log(`✗ the diff touches paths a dream may not:\n${verdict.violations.map((v) => `    ${v.path} — ${v.reason}`).join("\n")}`);
    const leftovers = abandon();
    discard({
      gates: `${passed.length}/${THEME_GATES.length}`,
      description: `${theme}: ${diffViolationSummary(verdict.violations)}${cleanupNote(leftovers)}`,
    });
    return { outcome: "discard", reason: "guard", brief, theme, violations: verdict.violations };
  }

  // 7 ── the bundle, the ledger row and the commit
  const { metric, nearest, tokenDistance } = readMetric(root, theme);
  const bundleDir = join(root, OUT_DIR, brief.id);
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(
    join(bundleDir, "scorecard.json"),
    JSON.stringify(
      {
        id: brief.id,
        kind: "theme",
        theme,
        date,
        brief: brief.brief,
        seed,
        gates: passed,
        distinctiveness: { nearest, axis_distance: metric, token_distance: tokenDistance ?? null },
        snapshots: [`${theme}-light.png`, `${theme}-dark.png`],
        // The versioned rubric, empty (1.1N-02). The scorer fills it in after
        // looking at the two PNGs — which is after this row is written, which is
        // why the ledger's `taste` cell is `-` and this block is the record.
        // `docs/dream-rubric.md` is the prose; `rubric.mjs` validates what lands
        // here, so a half-filled block is a refusal rather than a mean of three.
        taste: emptyTaste(),
      },
      null,
      2,
    ) + "\n",
  );

  const nearestText = metric === null ? "unmeasured" : `${metric} axes from ${nearest}`;
  const description = `${theme}: ${brief.brief.replace(/\s+/g, " ").slice(0, 90)} — ${nearestText}`;

  // The theme first, then the ledger row naming the commit the theme landed in.
  // Two commits rather than one because a row cannot cite a hash it is inside —
  // the same reason /faqir-plan records its own task hash in a second commit.
  markBrief("keep");
  assertNotProtected(currentBranch(run), "commit");
  run("git", ["add", "--all"], { timeout: GATE_TIMEOUT.GIT });
  const message =
    `feat(dream/${brief.id}): ${theme} — ${brief.brief.replace(/\s+/g, " ").slice(0, 80)}\n\n` +
    `Generated by the Night Shift from .faqir-dreams/queue.json brief '${brief.id}'.\n` +
    `Gates: ${passed.join(", ")}.\n` +
    `Distinctiveness: ${nearestText}.\n` +
    `Scorecard and light/dark snapshots: ${OUT_DIR}/${brief.id}/.\n`;
  const committed = run("git", ["commit", "-m", message], { timeout: GATE_TIMEOUT.GIT });
  if (committed.status !== 0) {
    throw new Error(`Gates passed but the commit failed: ${tail(committed.stderr)}`);
  }
  const head = run("git", ["rev-parse", "--short", "HEAD"], { timeout: GATE_TIMEOUT.GIT });
  const commit = head.status === 0 ? head.stdout.trim() : null;

  recordRow("keep", {
    metric,
    gates: `${passed.length}/${THEME_GATES.length}`,
    commit,
    description,
    branchName: branch,
  });
  assertNotProtected(currentBranch(run), "commit");
  run("git", ["add", LEDGER_FILE], { timeout: GATE_TIMEOUT.GIT });
  run("git", ["commit", "-m", `chore(dream/${brief.id}): record the dream in ${LEDGER_FILE}`], {
    timeout: GATE_TIMEOUT.GIT,
  });

  log(`✓ ${theme} kept on ${branch}${commit ? ` (${commit})` : ""} — ${nearestText}`);
  log(`  scorecard + snapshots: ${OUT_DIR}/${brief.id}/`);
  log(
    `  now score the pair against ${RUBRIC_PATH} (rubric ${RUBRIC_VERSION}) and write the five ` +
      `scores into the scorecard's taste block — the gates cannot see what it looks like (§10.5).`,
  );
  log(
    canOpenPullRequest(run)
      ? `  open the PR with: gh pr create --title "${theme}" --body-file ${OUT_DIR}/${brief.id}/scorecard.json`
      : `  no git remote or no gh — the branch and the bundle are the output; review them in place.`,
  );

  return { outcome: "keep", brief, theme, branch, commit, metric, nearest, gates: passed, bundleDir };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

/** Parse this script's argv. Returns `null` for `--help`. */
export function parseDreamArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return null;
  const parsed = { briefId: null, seedPath: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    const take = () => {
      if (inline !== undefined && inline !== "") return inline;
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error(`${flag} requires a value.`);
      i += 1;
      return next;
    };
    if (flag === "--brief") parsed.briefId = take();
    else if (flag === "--seed") parsed.seedPath = take();
    else if (flag === "--dry-run") parsed.dryRun = true;
    else throw new Error(`Unknown option '${argv[i]}'. Usage: --brief <id> [--seed <path>] [--dry-run]`);
  }
  return parsed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const parsed = parseDreamArgs(process.argv.slice(2));
    if (!parsed) {
      console.log("Usage: node scripts/dream/theme.mjs --brief <id> [--seed <path>] [--dry-run]");
    } else {
      const result = await runThemeDream(parsed);
      if (result.outcome === "discard") process.exitCode = 1;
    }
  } catch (error) {
    // A refusal is an expected outcome of a night, not a crash. Printing the
    // sentence the guard wrote is the whole point of writing it; a V8 stack
    // trace above it is noise that buries the line worth reading.
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
