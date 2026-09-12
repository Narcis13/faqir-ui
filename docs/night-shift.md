# Night Shift

The framework generates while nobody is watching, and a human decides in the
morning. `FAQIR-VISION.md` §10 is the argument for it; this is how to run it,
what stops it, and what to do with what it leaves behind.

Night Shift is **a skill plus a ledger plus a queue**. No new infrastructure and
no new dependency: the generators, the gates and the browser it screenshots with
all shipped before it did.

**Status: v0 (tasks 1.1N-01, 1.1N-02).** One dream kind — `theme`. Run by hand
or by `scripts/dream/nightly.sh` on a schedule; scored against a versioned
rubric; summarized weekly into `DREAMS.md`.

---

## The loop

```
.faqir-dreams/queue.json          twelve briefs, in running order
      │
      ▼
/faqir-dream                      one dream per run
      │   the agent reads the brief and writes a seed
      ▼
scripts/dream/theme.mjs --brief <id>
      │
      ├─ branch  dream/theme-<id>
      ├─ nine gates, in order, stopping at the first failure
      ├─ the diff, checked against the path allow-list
      ├─ commit on the branch  +  scorecard and a light/dark PNG pair
      │
      ├─▶ keep      → a branch and a `.faqir-dreams/out/<id>/` bundle
      └─▶ discard   → branch deleted, nothing left behind, a row saying why
      │
      ▼
dreams.tsv                        append-only, one row per dream
      │
      ▼
DREAMS.md                         the week of it, regenerated from the ledger
      │
      ▼
morning: a human merges, edits, or closes. The ledger already knows.
```

## The files

| Path | What it is | Committed |
|---|---|---|
| `.claude/commands/faqir-dream.md` | the skill — what the agent does, which is *read the brief and write the seed* | yes |
| `.faqir-dreams/queue.json` | the briefs and their statuses | yes |
| `.faqir-dreams/queue.schema.md` | the queue's schema, in prose; `scripts/dream/queue.mjs` is the same thing as code | yes |
| `.faqir-dreams/seeds/<id>.seed.json` | the seed the dream was written from — a kept theme is reproducible from it | yes |
| `.faqir-dreams/out/<id>/` | the scorecard and the light/dark PNG pair | **no** (`.gitignore`) |
| `dreams.tsv` | the ledger | yes |
| `docs/dream-rubric.md` | the taste rubric, versioned — the prose half | yes |
| `DREAMS.md` | the weekly digest, generated from the ledger | yes |
| `scripts/dream/{theme,guards,queue,ledger,snapshot,rubric,digest}.mjs` | the shift | yes |
| `scripts/dream/nightly.sh` | the runner a scheduler invokes | yes |

The bundle is the one thing not committed. It is a local review artefact: two
PNGs per dream in the repository history is a repository that doubles in a year,
and `scripts/dream/snapshot.mjs --theme <name> --out <dir>` regenerates it from
the committed theme in seconds.

## Running one

```bash
# what would happen, without doing any of it
node scripts/dream/theme.mjs --dry-run

# the whole thing, from the agent's side
/faqir-dream                 # the next pending brief
/faqir-dream arcade          # one named brief
/faqir-dream status          # queue counts and the last rows; dreams nothing
```

The script alone, once a seed exists:

```bash
node scripts/dream/theme.mjs --brief arcade
node scripts/dream/theme.mjs --brief arcade --seed some/other.seed.json
```

## The gates

In order. The first failure ends the dream.

| # | Gate | What it proves |
|---|---|---|
| 1 | `faqir theme generate --seed … --out registry/themes` | the seed is legal, contrast-verified, and **distinct** from all 24 shipped themes |
| 2 | `bun test tests/themes tests/commands/theme-generate.test.ts` | axes derive back, manifests validate, the CSS is a pure function of the seed |
| 3 | `bun run audit:registry` | registry integrity over everything written |
| 4 | `bun run gen:theme-manifests` | derived manifests — `tokens_overridden`, `axes`, `distinctiveness` |
| 5 | `bun run gen:theme-previews` | the gallery harness the snapshot and the docs site render |
| 6 | `bun run gen:theme-docs` | README's theme tables, a committed artifact a new theme invalidates |
| 7 | `node scripts/build-core-package.mjs` | the CDN bundle and its SRI hashes |
| 8 | `bun run gen:skill` | the agent surface, so the theme is discoverable the morning it lands |
| 9 | `node scripts/dream/snapshot.mjs` | the light/dark pair §10.5's taste gate needs something to look at |

Gate 6 is not in FAQIR-VISION's list and is not optional: README is a committed
generated artifact, so a new theme without it leaves `check:theme-docs` red and
the PR un-mergeable.

**Gate 1 is the keep condition.** A theme within 4 axes or 0.03 ΔE of one that
already ships is refused before a byte is written. That refusal is the answer to
the brief — not a problem to route around, and `--allow-similar` is refused by
`guards.mjs` precisely so it cannot be.

## The guards

They live in `scripts/dream/guards.mjs` as pure functions and are called by the
pipeline — not written down here and hoped for. `tests/dream/guards.test.ts` is
the proof they hold.

| Guard | Rule |
|---|---|
| `assertCleanStart` | never on a dirty tree. The shift commits the diff its gates passed over, so an unrelated edit would ship inside its PR. |
| `assertNotProtected` | never a commit on `main`, checked immediately before each commit. |
| `assertGitAllowed` | an allow-list of git subcommands. `push`, `merge`, `rebase`, `tag`, `reset` and `cherry-pick` are absent, so the only way the work leaves this machine is a PR a human opens. `git clean -x` is refused in every spelling. |
| `assertGenerateArgsAllowed` | never `--allow-similar`. |
| `checkDiffPaths` | the whole diff, checked **before the commit**, against a forbidden list (`SPEC-1.0.md`, `src/protocol.ts`, `manifest.schema.json`, `package.json`, `bun.lock`, visual baselines, the plan files) and then an allow-list of what the nine gates actually write. |

The allow-list is the shape that survives: a deny-list is a list of the mistakes
already made. Two entries in it are source files rather than output, and they are
there because the generators refuse without them — `scripts/gen-theme-manifests.mjs`
(the theme's `mood` and `pairs_with`) and `src/theme-preview.ts` (its gallery
spec). Both refusals are asserted in the guards test, so the day a generator
stops requiring one, the permission goes with it.

## The ledger

`dreams.tsv` — append-only, thirteen tab-separated columns. It is
`autoresearch-results.tsv`'s format (the layout-lint campaign ran exactly this
loop by hand, which is the proof the shape survives a campaign) plus `date` and
the four columns a dream needs:

```
iteration  date  kind  id  branch  commit  metric  delta  guard  gates  taste  status  description
```

- `metric` is the theme's **axis distance to its nearest shipped peer**, and the
  file's first line says `higher_is_better` so a raw reader is never guessing.
- `delta` is measured against the last row **of the same kind** — a theme's axis
  distance and a future component dream's size budget are not on the same scale.
- `gates` reads `9/9` on a keep and `4/9 (gen:theme-previews)` on a discard.
- `status` is `keep`, `discard` or `baseline` (row 0).
- `taste` is one cell carrying all three facts — `4.0 rubric-1.0 claude-opus-5` —
  because the column count is frozen by append-only. It is usually `-`: the row
  is written the moment the gates pass and the pictures are scored afterwards,
  so the scorecard is where a score lands. See *The taste rubric* below.
- `-` means "no value". A tab or a newline in a cell is a refusal, not an escape:
  a mangled row would still parse, into something that is not what was written.

A kept dream lands **two commits** on its branch: the theme, then a row citing
that theme's hash — a row cannot cite a hash it is inside. (`/faqir-plan` records
its own task hashes the same way.)

## The cadence

Nothing above needs a schedule to work — `/faqir-dream` is a command a human can
run. The schedule is what makes it a *shift*.

```bash
bun run dream:nightly --dry-run     # create a worktree, print the plan, remove it
bun run dream:nightly               # one dream, in a worktree of its own
bun run dream:digest                # rewrite DREAMS.md from the ledger
```

### `scripts/dream/nightly.sh` — one night, one worktree

A scheduled run cannot use your checkout: the shift refuses to start on a dirty
tree, which is right for a human and fatal at 3am. So the runner gives the
pipeline a checkout of its own — `git worktree add --detach` from `main` — and
takes it away afterwards. **The branch survives**: a worktree shares one `.git`,
so `dream/theme-<id>` is still there when the checkout is gone. The checkout is
scaffolding; the branch is the output.

Three details that are not obvious:

- **`node_modules` is symlinked in.** It is not in the tree and every gate needs
  it; the link is removed before the worktree is.
- **The bundle is harvested before the worktree goes.** The scorecard and the
  PNGs are gitignored, so they live nowhere else — they are copied back to
  `.faqir-dreams/out/` first.
- **A dirty worktree is KEPT, not removed.** A discarded dream deletes its branch
  and leaves the ledger row and the queue update uncommitted (see the morning
  review below); removing the worktree would delete the only record of a night
  that produced a reason. The runner prints where it is.

It runs `git worktree`, `git branch --list` and `git status` and nothing else —
`tests/dream/nightly.test.ts` greps for the verbs §10.2 forbids and runs the
whole thing against a disposable repository, so "never touches main" is measured
rather than promised.

Scheduling it, the two ways §10.6 names:

```bash
# local — crontab -e
0 3 * * * cd /path/to/faqir && bash scripts/dream/nightly.sh >> /tmp/faqir-night.log 2>&1

# local — launchd (macOS), ~/Library/LaunchAgents/dev.faqir.night.plist
#   ProgramArguments: /bin/bash -lc 'cd /path/to/faqir && bash scripts/dream/nightly.sh'
#   StartCalendarInterval: { Hour: 3, Minute: 0 }
```

In the cloud, a Claude Code scheduled routine (`/schedule`) brings its own
checkout, so schedule the **skill** rather than this script — `every day at
03:00 — /faqir-dream`. The runner and the routine are two ways to the same
place, which is why everything that decides anything lives in the pipeline and
not in either of them.

`DREAM_CMD` is what the runner runs inside the worktree; it defaults to
`claude -p "/faqir-dream next"` and is an environment variable so the script
itself never needs editing:

```bash
DREAM_CMD='node scripts/dream/theme.mjs --brief arcade' bash scripts/dream/nightly.sh
```

### The taste rubric

`docs/dream-rubric.md`, version 1.0: five criteria — hierarchy, rhythm,
contrast, restraint, fit — scored 1–5 from the light/dark pair, each with one
sentence. The threshold for a PR is **nothing below 3 and a mean of at least
3.5**; it decides what is worth a human's minute and deletes nothing.

Two copies of a rubric is drift waiting to happen, so there are two halves that
cannot move apart: the prose a model reads, and `scripts/dream/rubric.mjs`, which
validates what a scorer wrote. `tests/dream/rubric.test.ts` parses the document
and asserts it against the module — the version, the five questions, the scale,
the threshold and the ledger cell's spelling.

The version and the judge travel WITH the score, in the scorecard's `taste`
block, because a 4 from one model under one rubric is not a 4 from another. The
pipeline writes that block empty and the scorer fills it in: the pictures are
scored after the gates pass, which is why the ledger's `taste` cell is usually
`-` and the scorecard is the record.

### `DREAMS.md` — the weekly digest

```bash
bun run dream:digest                      # this week
bun run dream:digest --week 2026-09-07    # an older one
bun run dream:digest --print              # to stdout, writing nothing
```

Kept dreams with their distinctiveness, their taste scores and links to their
snapshots; discards with the gate that stopped them; what is still queued; and a
line per earlier week. Open PRs are included when `gh` answers and the section
is absent when it does not — an absence the digest did not measure is not
reported.

The nightly runner regenerates it after every run — **in your checkout, not in
the worktree**, since that is where the file lives. So a night that produced a
dream leaves `DREAMS.md` modified and uncommitted for the morning, the same way
a discard leaves its row. Commit it, or `git checkout -- DREAMS.md`; the next
hand-run of `/faqir-dream` refuses to start until you have.

It reads **unmerged `dream/*` branches too**, because a kept dream commits its
ledger row on its own branch: a digest that only read `dreams.tsv` at HEAD would
report last night as nothing at all, which is backwards for a file whose job is
to help you decide what to merge. Every number in it is read from the ledger,
the manifest or the scorecard — the digest computes nothing of its own, and
re-running it on an unchanged week rewrites nothing.

## The morning review

A kept dream leaves you a branch, a bundle and a row.

Start with the digest — `DREAMS.md` is the week in one page, and it already
includes tonight's dream even though its branch is unmerged.

```bash
git log --oneline main..dream/theme-arcade
open .faqir-dreams/out/arcade/arcade-light.png .faqir-dreams/out/arcade/arcade-dark.png
cat .faqir-dreams/out/arcade/scorecard.json
tail -5 dreams.tsv
```

Then: merge it, edit the seed and regenerate, or delete the branch. Whatever you
choose, the ledger row stays — including for a theme you rejected on taste, which
is the row that teaches the next brief something.

**A discarded dream leaves the tree dirty, deliberately.** The branch is gone, so
the queue update and the discard row have nothing to attach to; they sit
uncommitted on the branch the run started from. Commit them if the row is worth
keeping (it usually is — a discard with a reason is the cheapest data the loop
produces), or `git checkout -- dreams.tsv .faqir-dreams/queue.json` if the run
failed for a reason that says nothing about the brief. The next run refuses to
start until you have done one or the other.

## What is not here yet

- **A judge inside the pipeline.** §10.5 imagines the vision model scoring before
  the PR is opened; today the scorer is the agent driving the skill, which runs
  *after* `theme.mjs` has appended the row. So the ledger's `taste` cell is
  written by nobody (`-`) and the scorecard carries the score. The day the judge
  can be called from the script, the row is written already knowing it — the
  cell's spelling and its parser are in `rubric.mjs` waiting for that.
- **The other five dream kinds** — component, motion, dogfood, wish, docs. The
  vocabulary is already in `queue.mjs` and `ledger.mjs` so adding one does not
  move the schema; each waits on its own gates (§10.3).
- **`gh pr create`.** v0 prints the command rather than running it. Opening the
  PR is one keystroke and it is the keystroke where a human first looks at the
  thing — worth keeping, until the nightly runner makes it worth automating.
