#!/usr/bin/env node
/**
 * The weekly digest  [task 1.1N-02]
 *
 * `dreams.tsv` is the record; `DREAMS.md` is the week of it a human actually
 * reads on a Monday. Every number in it is READ, never kept: the counts come
 * from the ledger, the distinctiveness from the row the generator measured, the
 * taste from the scorecard the scorer wrote, and the open PRs from `gh` when
 * `gh` is there. Nothing in this file is a second place a fact could live.
 *
 * Two decisions worth the words:
 *
 *   **It reads unmerged dream branches too.** A kept dream commits its ledger
 *   row ON ITS BRANCH — that is the whole shape of the shift — so a digest that
 *   only read `dreams.tsv` at HEAD would report last night's dream as nothing
 *   at all until someone merged it, which is exactly backwards: the digest
 *   exists to decide whether to merge. So the ledger is the union of HEAD's and
 *   every `dream/*` branch's, deduped.
 *
 *   **It is a pure function of its inputs.** `renderDigest` takes data and
 *   returns bytes; nothing inside it reads a clock or a file. Re-running the
 *   digest on an unchanged week rewrites the same bytes, which is what makes it
 *   safe to run from `nightly.sh` every night.
 *
 * Run: `node scripts/dream/digest.mjs [--week YYYY-MM-DD] [--out DREAMS.md] [--print]`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isTimeout, spawnBudgeted } from "../spawn.mjs";
import { parseLedger, readLedger } from "./ledger.mjs";
import { readQueue } from "./queue.mjs";
import {
  RUBRIC_CRITERIA,
  RUBRIC_KEYS,
  RUBRIC_PATH,
  isScored,
  parseTasteCell,
  tasteScore,
  validateTaste,
} from "./rubric.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The file this writes, at the repository root. */
export const DIGEST_FILE = "DREAMS.md";

/** Budgets for the two things the digest shells out to. Both are probes. */
const DIGEST_TIMEOUT = { GIT: 30_000, GH: 30_000 };

// ── weeks ───────────────────────────────────────────────────────────────────

/**
 * The ISO week (Monday–Sunday, UTC) containing `date`.
 *
 * UTC throughout, and dates are compared as strings: the ledger's `date` is a
 * `YYYY-MM-DD` written by whatever machine ran the dream, so treating it as a
 * local timestamp would move a Sunday-night dream into the wrong week depending
 * on where the reader is sitting.
 */
export function weekOf(date) {
  const day = new Date(`${isoDate(date)}T00:00:00Z`);
  // getUTCDay: Sunday is 0, and ISO weeks start on Monday.
  const offset = (day.getUTCDay() + 6) % 7;
  const start = new Date(day.getTime() - offset * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** `YYYY-MM-DD` from a Date or a string that already is one. */
export function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`'${text}' is not an ISO date (YYYY-MM-DD).`);
  }
  return text;
}

/** Whether a row's date falls inside a week. String comparison; see `weekOf`. */
export function inWeek(date, week) {
  const text = String(date ?? "");
  return text >= week.start && text <= week.end;
}

// ── the ledger, as the digest sees it ───────────────────────────────────────

/** Identity of a row, for the union across branches: one dream, one outcome. */
const rowKey = (row) => [row.iteration, row.kind, row.id, row.status].join("\u0000");

/**
 * The ledger at HEAD unioned with every `dream/*` branch's own copy.
 *
 * A branch's `dreams.tsv` is HEAD's plus the row that branch earned, so the
 * union is HEAD's rows plus one per unmerged dream — and a row that has since
 * merged appears in both and is deduped. A branch whose file cannot be read
 * (no `dreams.tsv` on it yet) is skipped rather than fatal: a half-finished
 * branch is a normal thing to find at 6am.
 */
export function collectRows({ root = ROOT, run = defaultRun } = {}) {
  const rows = readLedger(join(root, "dreams.tsv"));
  const seen = new Map(rows.map((row) => [rowKey(row), row]));

  const listed = run("git", ["branch", "--list", "dream/*", "--format=%(refname:short)"], {
    cwd: root,
    timeout: DIGEST_TIMEOUT.GIT,
  });
  const branches = listed.status === 0 ? listed.stdout.split("\n").map((b) => b.trim()).filter(Boolean) : [];

  for (const branch of branches) {
    const shown = run("git", ["show", `${branch}:dreams.tsv`], { cwd: root, timeout: DIGEST_TIMEOUT.GIT });
    if (shown.status !== 0) continue;
    let parsed;
    try {
      parsed = parseLedger(shown.stdout);
    } catch {
      continue;
    }
    for (const row of parsed) {
      if (!seen.has(rowKey(row))) seen.set(rowKey(row), { ...row, branch: row.branch ?? branch });
    }
  }

  return [...seen.values()].sort((a, b) => a.iteration - b.iteration || String(a.date).localeCompare(String(b.date)));
}

/**
 * The open pull requests for `dream/*` branches, keyed by branch.
 *
 * `gh` is optional everywhere in the shift, and it is optional here: with no
 * `gh` and no remote there is no PR section, not an empty one. A digest that
 * printed "Pull requests: none" on a machine that cannot see any would be
 * reporting an absence it did not measure.
 */
export function collectPulls({ root = ROOT, run = defaultRun } = {}) {
  const result = run("gh", ["pr", "list", "--state", "open", "--limit", "50", "--json", "number,title,url,headRefName"], {
    cwd: root,
    timeout: DIGEST_TIMEOUT.GH,
  });
  if (result.status !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout || "[]");
    if (!Array.isArray(parsed)) return null;
    const byBranch = {};
    for (const pr of parsed) {
      if (typeof pr?.headRefName === "string" && pr.headRefName.startsWith("dream/")) byBranch[pr.headRefName] = pr;
    }
    return byBranch;
  } catch {
    return null;
  }
}

/** Read one dream's scorecard, or `null` when the bundle is not on this machine. */
export function readScorecard(root, id) {
  const path = join(root, ".faqir-dreams", "out", id, "scorecard.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The taste a row can show, from the ledger cell first and the scorecard
 * second.
 *
 * The cell is authoritative when it is there — it was written with the row and
 * travels with the repository — but it is usually `-`, because the row is
 * appended the moment the gates pass and the pictures are scored afterwards.
 * The scorecard is where a score actually lands, so it is the fallback, and an
 * INVALID block reports as invalid rather than being averaged into a number: a
 * digest that rounds a malformed scorecard into a 4 is reporting a theme nobody
 * looked at.
 */
export function tasteOf(row, scorecard) {
  const cell = parseTasteCell(row.taste);
  if (cell) return { ...cell, source: "ledger", criteria: null };
  const taste = scorecard?.taste;
  if (!taste || !isScored(taste)) return null;
  const problems = validateTaste(taste);
  if (problems.length > 0) return { invalid: problems, source: "scorecard" };
  return {
    score: tasteScore(taste),
    rubric: taste.rubric,
    judge: taste.judge,
    source: "scorecard",
    criteria: RUBRIC_KEYS.map((key) => ({ key, ...taste.scores[key] })),
    notes: taste.notes ?? null,
  };
}

// ── rendering ───────────────────────────────────────────────────────────────

/** The theme a row is about: the scorecard's, else the `theme: …` description prefix. */
function themeOf(row, scorecard) {
  if (scorecard?.theme) return scorecard.theme;
  const match = /^([a-z][a-z0-9-]*):/.exec(String(row.description ?? ""));
  return match ? match[1] : null;
}

/** One line, collapsed and cut, for a table cell. */
function oneLine(text, limit = 120) {
  const collapsed = String(text ?? "").replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 1)}…` : collapsed;
}

/** A markdown table cell: pipes would end the cell early. */
const cell = (text) => oneLine(text).replaceAll("|", "\\|");

/**
 * The digest, as bytes. A pure function of what `collect` gathered — no clock,
 * no filesystem — so running it twice on an unchanged week produces the same
 * file, which is what lets `nightly.sh` run it every night without noise.
 */
export function renderDigest(data) {
  const { week, rows, briefs = [], scorecards = {}, pulls = null } = data;
  const dreams = rows.filter((row) => row.status !== "baseline");
  const thisWeek = dreams.filter((row) => inWeek(row.date, week));
  const kept = thisWeek.filter((row) => row.status === "keep");
  const discarded = thisWeek.filter((row) => row.status === "discard");
  const pending = briefs.filter((brief) => brief.status === "pending");

  const out = [];
  out.push("# DREAMS.md — the Night Shift digest");
  out.push("");
  out.push(
    "<!-- Generated by `bun run dream:digest` from dreams.tsv, .faqir-dreams/queue.json and",
    "     each dream's scorecard. Do not edit: the ledger is the record, this is the week of it. -->",
  );
  out.push("");
  out.push(
    `What the framework made while nobody was watching (\`docs/night-shift.md\`), scored against`,
    `\`${RUBRIC_PATH}\`. A kept dream is a branch waiting for a human, not a merge.`,
  );
  out.push("");
  out.push(`## Week of ${week.start} – ${week.end}`);
  out.push("");
  out.push(
    `**${count(thisWeek.length, "dream")} · ${kept.length} kept · ${discarded.length} discarded` +
      ` · ${count(pending.length, "brief")} still queued**`,
  );
  out.push("");

  if (thisWeek.length === 0) {
    out.push("No dreams this week. The shift ran and found nothing to keep, or it did not run —");
    out.push("`tail dreams.tsv` and the queue below say which.");
    out.push("");
  }

  if (kept.length > 0) {
    out.push("### Kept");
    out.push("");
    for (const row of kept) {
      const card = scorecards[row.id] ?? null;
      const theme = themeOf(row, card);
      const heading = theme && theme !== row.id ? `${theme} — brief \`${row.id}\`` : `${row.id}`;
      out.push(`#### ${heading}`);
      out.push("");
      if (card?.brief) {
        out.push(`> ${oneLine(card.brief, 400)}`);
        out.push("");
      }
      const facts = [];
      facts.push(`- **branch** — \`${row.branch ?? "—"}\`${row.commit ? ` (\`${row.commit}\`)` : ""}`);
      const nearest = card?.distinctiveness?.nearest ?? null;
      if (typeof row.metric === "number") {
        facts.push(
          `- **distinctiveness** — ${row.metric} axes from ${nearest ? `\`${nearest}\`` : "the nearest shipped theme"}` +
            (typeof card?.distinctiveness?.token_distance === "number"
              ? ` (ΔE ${card.distinctiveness.token_distance})`
              : ""),
        );
      }
      const taste = tasteOf(row, card);
      if (taste?.invalid) {
        facts.push(
          `- **taste** — unscored: the scorecard's block is invalid (${taste.invalid[0].field}: ${oneLine(taste.invalid[0].message, 80)})`,
        );
      } else if (taste) {
        facts.push(
          `- **taste** — ${taste.score.toFixed(1)} / 5 (rubric ${taste.rubric}, judged by ${taste.judge})`,
        );
      } else {
        facts.push(`- **taste** — not scored yet (\`${RUBRIC_PATH}\`)`);
      }
      if (theme) {
        const bundle = `.faqir-dreams/out/${row.id}`;
        facts.push(
          `- **snapshots** — [light](${bundle}/${theme}-light.png) · [dark](${bundle}/${theme}-dark.png)` +
            ` · [scorecard](${bundle}/scorecard.json)`,
        );
      }
      const pr = pulls && row.branch ? pulls[row.branch] : null;
      if (pr) facts.push(`- **pull request** — [#${pr.number} ${cell(pr.title)}](${pr.url})`);
      out.push(...facts);
      if (taste?.criteria) {
        out.push("");
        for (const criterion of taste.criteria) {
          out.push(`  - ${criterion.key} **${criterion.score}** — ${oneLine(criterion.why, 200)}`);
        }
        if (taste.notes) out.push(`  - notes — ${oneLine(taste.notes, 200)}`);
      }
      out.push("");
    }
  }

  if (discarded.length > 0) {
    out.push("### Discarded");
    out.push("");
    out.push("| brief | gates | why |");
    out.push("|---|---|---|");
    for (const row of discarded) {
      out.push(`| \`${cell(row.id)}\` | ${cell(row.gates ?? "—")} | ${cell(row.description)} |`);
    }
    out.push("");
    out.push("A discard with a reason is the cheapest data the loop produces: it says which");
    out.push("region of the axis space the gates will not let a theme into.");
    out.push("");
  }

  out.push("### Still queued");
  out.push("");
  if (pending.length === 0) {
    out.push("Nothing pending. `.faqir-dreams/queue.json` is where the next briefs go —");
    out.push("`docs/night-shift.md` says what makes a good one.");
  } else {
    out.push("| brief | added | aiming at |");
    out.push("|---|---|---|");
    for (const brief of pending) {
      out.push(`| \`${cell(brief.id)}\` | ${cell(brief.added)} | ${cell(brief.brief, 110)} |`);
    }
  }
  out.push("");

  const earlier = weekSummaries(dreams).filter((summary) => summary.start !== week.start);
  if (earlier.length > 0) {
    out.push("## Earlier weeks");
    out.push("");
    out.push("| week | dreams | kept | discarded |");
    out.push("|---|---|---|---|");
    for (const summary of earlier) {
      out.push(`| ${summary.start} – ${summary.end} | ${summary.total} | ${summary.kept} | ${summary.discarded} |`);
    }
    out.push("");
  }

  out.push("---");
  out.push("");
  out.push(
    "Regenerate with `bun run dream:digest` (`--week YYYY-MM-DD` for an older week). The",
    "snapshots are local review artefacts and are not committed — `bun run dream:snapshot",
    "--theme <name> --out <dir>` makes them again from the committed theme.",
  );
  out.push("");
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/** `1 dream` / `3 dreams` — the digest counts things in sentences. */
function count(n, noun) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** Per-week totals, newest first, over every non-baseline row. */
export function weekSummaries(rows) {
  const weeks = new Map();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date ?? ""))) continue;
    const week = weekOf(row.date);
    const entry = weeks.get(week.start) ?? { ...week, total: 0, kept: 0, discarded: 0 };
    entry.total += 1;
    if (row.status === "keep") entry.kept += 1;
    if (row.status === "discard") entry.discarded += 1;
    weeks.set(week.start, entry);
  }
  return [...weeks.values()].sort((a, b) => b.start.localeCompare(a.start));
}

// ── the world ───────────────────────────────────────────────────────────────

/** The default subprocess runner: budgeted, captured, never inherited. */
export function defaultRun(command, args, options = {}) {
  const result = spawnBudgeted(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    ...options,
    timeout: options.timeout ?? DIGEST_TIMEOUT.GIT,
  });
  if (isTimeout(result) || result.error) return { status: 127, stdout: "", stderr: "" };
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Gather everything the digest renders from. The only half that touches the world. */
export function collectDigest({ root = ROOT, run = defaultRun, now = new Date(), week = null } = {}) {
  const rows = collectRows({ root, run });
  const queuePath = join(root, ".faqir-dreams", "queue.json");
  const briefs = existsSync(queuePath) ? readQueue(queuePath).briefs : [];
  const scorecards = {};
  for (const row of rows) {
    if (row.status === "baseline" || scorecards[row.id]) continue;
    const card = readScorecard(root, row.id);
    if (card) scorecards[row.id] = card;
  }
  return {
    week: weekOf(week ?? now),
    rows,
    briefs,
    scorecards,
    pulls: collectPulls({ root, run }),
  };
}

/** Render and write `DREAMS.md`. Returns the path and whether the bytes changed. */
export function writeDigest(options = {}) {
  const { root = ROOT, out = DIGEST_FILE } = options;
  const markdown = renderDigest(collectDigest(options));
  const path = resolve(root, out);
  const before = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (before !== markdown) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, markdown);
  }
  return { path, markdown, changed: before !== markdown };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

/** Parse this script's argv. Returns `null` for `--help`. */
export function parseDigestArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return null;
  const parsed = { week: null, out: DIGEST_FILE, print: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    const take = () => {
      if (inline !== undefined && inline !== "") return inline;
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error(`${flag} requires a value.`);
      i += 1;
      return next;
    };
    if (flag === "--week") parsed.week = isoDate(take());
    else if (flag === "--out") parsed.out = take();
    else if (flag === "--print") parsed.print = true;
    else throw new Error(`Unknown option '${argv[i]}'. Usage: --week <YYYY-MM-DD> [--out <path>] [--print]`);
  }
  return parsed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const parsed = parseDigestArgs(process.argv.slice(2));
    if (!parsed) {
      console.log("Usage: node scripts/dream/digest.mjs [--week YYYY-MM-DD] [--out DREAMS.md] [--print]");
      console.log(`\nThe five rubric criteria (${RUBRIC_PATH}):`);
      for (const criterion of RUBRIC_CRITERIA) console.log(`  ${criterion.key} — ${criterion.question}`);
    } else if (parsed.print) {
      process.stdout.write(renderDigest(collectDigest({ week: parsed.week })));
    } else {
      const { path, changed } = writeDigest({ week: parsed.week, out: parsed.out });
      console.log(changed ? `✓ ${path} updated` : `· ${path} already current`);
    }
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
