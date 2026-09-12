---
description: Run one Night Shift dream — turn the next brief in .faqir-dreams/queue.json into a gated, PR-ready theme branch, or a discard row with a reason
argument-hint: "[brief-id | next | status | dry-run]"
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, TodoWrite
---

# /faqir-dream — one dream per run

The Night Shift (`FAQIR-VISION.md` §10) generates while nobody is watching and
leaves a branch a human decides about in the morning. **One dream per run**, the
same shape `/faqir-plan` uses for tasks.

Argument: `$ARGUMENTS`

Your job in this run is small and specific: **read the brief and write the
seed.** Everything after that is `scripts/dream/theme.mjs`, which runs the gates,
checks the diff against the path allow-list, commits on a branch and appends the
ledger row. Do not re-implement any of it by hand — the guards live in the script
precisely so they are not a matter of how carefully you read this file.

## Argument dispatch

- **empty** or `next` → take the first `pending` theme brief in queue order.
- **a brief id** (e.g. `arcade`) → dream exactly that brief.
- **`status`** → do NOT dream. Print the queue counts by status, the brief that
  would run next, and the last five ledger rows. Then stop.
- **`dry-run`** → print what the next brief would do (branch name, gate list) and
  stop, writing nothing. This is `node scripts/dream/theme.mjs --dry-run`.

## Step 0 — Check the shift can run at all

```bash
git status --porcelain          # must be empty; the script refuses otherwise
node scripts/dream/theme.mjs --dry-run
```

A dirty tree is a refusal, not a warning: the shift commits the diff its gates
passed over, so anything already in the tree would ship inside its PR.

## Step 1 — Read the brief, and read what already ships

```bash
cat .faqir-dreams/queue.json                     # the briefs, in running order
cat .faqir-dreams/queue.schema.md                # the schema and its two gotchas
bun run dev theme list                           # what ships today
```

Then look at the region the brief is aiming for. The distinctiveness block of
every shipped manifest (`registry/themes/*.theme.json` → `distinctiveness`) and
README's theme tables are the map. **A theme within 4 axes or 0.03 ΔE of a
shipped one is refused by the generator before it writes anything** — that is
the keep condition (§10.3), and a brief that lands there produces a discard row
and nothing else.

## Step 2 — Write the seed

Write `.faqir-dreams/seeds/<brief-id>.seed.json`: a complete theme seed whose
`name` is the theme's name (lowercase kebab; it becomes `registry/themes/<name>.css`).
Start from the brief's `axes_hint`, then **state every axis you have an opinion
about** — an unstated axis takes its documented default, and a seed made mostly
of defaults is a recolour of `default`.

```bash
bun run dev theme generate --help    # the fourteen axes and their vocabularies
```

Three facts the vocabulary does not tell you, each measured rather than assumed:

- **`shape.corner` is an axis only a rounded theme can state.** At
  `border-radius: 0` a filled box is pixel-identical under `round`, `bevel`,
  `scoop` and `notch`. Pairing a corner shape with `shape.radius: "sharp"` asks
  for an axis nothing draws.
- **`decoration.divider: "double"` needs a border of at least 3px**, and the
  gauntlet refuses the combination below that (follow-up `1.1A-26`).
- **`type.voice.transform: "small-caps"` renders nothing** — it is a
  `font-variant-caps` value being fed to `text-transform` (follow-up `1.1A-25`).

Two source files need one edit each before the generators will accept a new
theme, and both are on the dream's allow-list because of it:

- `scripts/gen-theme-manifests.mjs` — the editorial seed: the theme's `mood`
  vocabulary and its `pairs_with`. `gen:theme-manifests` **exits non-zero** for
  a theme that has none.
- `src/theme-preview.ts` — a `GALLERY_PREVIEWS` entry. `gen:theme-previews`
  **exits non-zero** for a theme in neither that list nor `BESPOKE_PREVIEWS`.

Make both edits now, in the same style as the entries already there.

## Step 3 — Hand it to the script

```bash
node scripts/dream/theme.mjs --brief <brief-id>
```

It runs, in this order, stopping at the first failure:

`generate` → `gauntlet` → `audit:registry` → `gen:theme-manifests` →
`gen:theme-previews` → `gen:theme-docs` → `build:core-package` → `gen:skill` →
`snapshot`

Then it checks the diff against the allow-list, commits on `dream/theme-<id>`,
appends a `keep` row to `dreams.tsv`, and writes the scorecard and the light/dark
PNG pair to `.faqir-dreams/out/<id>/`. A failing gate discards the branch, leaves
no generated file behind, and appends a `discard` row naming the gate.

**Do not work around a gate.** A discard that says *why* is the loop working; a
green run bought by editing the test that was red is the loop broken. If the
distinctiveness gate refuses the theme, that is the answer to the brief.

## Step 4 — Score it against the rubric, and say so

**Read `docs/dream-rubric.md` first** — it is the versioned rubric, and the
version travels with every score. Then look at BOTH PNGs in
`.faqir-dreams/out/<id>/` (not just the light one; three of the five questions
ask about the dark scheme) and score the five criteria 1–5, each with one
sentence:

| criterion | the question |
|---|---|
| `hierarchy` | does the eye land on the right thing first, in both schemes? |
| `rhythm` | do spacing and type repeat on a scale, or is the page a pile? |
| `contrast` | is loud-versus-quiet clear, and does it survive dark? |
| `restraint` | is any one axis shouting over the others? |
| `fit` | is this the theme the brief asked for, or a different good theme? |

Write them into the scorecard's `taste` block — the block the pipeline left
empty, in the shape `docs/dream-rubric.md` shows — naming **yourself as the
judge** (the model id, e.g. `claude-opus-5`) and the date. Score what the
pictures show, not what the seed intended: the seed is in the same file, and the
two disagreeing is information, not an error to smooth over.

`.faqir-dreams/out/<id>/` is not committed, so the scorecard is a local artefact:
put the same five scores and sentences in the PR body (or the report, with no
remote), which is where a human reads them.

Then check the threshold — **nothing below 3, and a mean of at least 3.5**. Below
it, say so plainly in the report and leave the branch for the human to close. A
theme that passes every deterministic gate and looks wrong is exactly what §10.5
says the gates cannot catch, and it is the one judgement no script in this
repository makes for you.

A half-filled block is refused rather than averaged (`scripts/dream/rubric.mjs`
validates it, and `bun run dream:digest` reports an invalid one as *unscored*) —
five criteria or none.

## Step 5 — Report and stop

Print:

- the brief, the theme, and `keep` or `discard` with the reason;
- the distinctiveness (`N axes from <nearest>`, ΔE);
- the branch and the commit, or "no branch — discarded at `<gate>`";
- the ledger row that was appended;
- the five rubric scores, their sentences, and whether the threshold was met;
- **Next up:** the brief the next run would take.

Refresh the weekly digest last — `bun run dream:digest` rewrites `DREAMS.md`
from the ledger and every unmerged `dream/*` branch, so tonight's dream is in it
before it merges. Unchanged bytes are not rewritten.

Then **stop.** One dream per run is the whole point.

## Guards (enforced by `scripts/dream/guards.mjs`, not by this file)

- Never on a dirty tree. Never a commit on `main`.
- Never `git push`, `merge`, `rebase`, `tag` or `reset` — the shift opens a
  branch and stops. **A human merges.**
- Never `--allow-similar`: distinctiveness *is* the keep condition.
- Never a change to `SPEC-1.0.md`, `src/protocol.ts`, `manifest.schema.json`,
  `package.json`, `bun.lock`, a visual baseline, or the plan files. The diff is
  checked against the allow-list before anything is committed.
- Never a new dependency.

If the script refuses, the refusal is the answer. Report it; do not route around it.
