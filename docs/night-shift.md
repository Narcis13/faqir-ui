# Night Shift

The framework generates while nobody is watching, and a human decides in the
morning. `FAQIR-VISION.md` §10 is the argument for it; this is how to run it,
what stops it, and what to do with what it leaves behind.

Night Shift is **a skill plus a ledger plus a queue**. No new infrastructure and
no new dependency: the generators, the gates and the browser it screenshots with
all shipped before it did.

**Status: v0 (task 1.1N-01).** One dream kind — `theme`. Invoked by hand;
`1.1N-02` adds the nightly runner and the weekly digest.

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
| `scripts/dream/{theme,guards,queue,ledger,snapshot}.mjs` | the shift | yes |

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
- `-` means "no value". A tab or a newline in a cell is a refusal, not an escape:
  a mangled row would still parse, into something that is not what was written.

A kept dream lands **two commits** on its branch: the theme, then a row citing
that theme's hash — a row cannot cite a hash it is inside. (`/faqir-plan` records
its own task hashes the same way.)

## The morning review

A kept dream leaves you a branch, a bundle and a row.

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

- **The nightly runner and the weekly digest** — `1.1N-02`: `scripts/dream/nightly.sh`
  (a worktree per run, for cron/launchd or a `/schedule` cloud routine) and
  `scripts/dream/digest.mjs` → `DREAMS.md`.
- **The versioned taste rubric** — `1.1N-02`: `docs/dream-rubric.md`, five criteria
  scored 1–5 with the judge model named in the row so scores stay comparable. v0
  is three questions the agent answers in the scorecard's `taste` block.
- **The other five dream kinds** — component, motion, dogfood, wish, docs. The
  vocabulary is already in `queue.mjs` and `ledger.mjs` so adding one does not
  move the schema; each waits on its own gates (§10.3).
- **`gh pr create`.** v0 prints the command rather than running it. Opening the
  PR is one keystroke and it is the keystroke where a human first looks at the
  thing — worth keeping, until the nightly runner makes it worth automating.
