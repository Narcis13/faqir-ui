#!/usr/bin/env bash
#
# The nightly runner  [task 1.1N-02]
#
# One dream a night, in a worktree of its own, from a machine nobody is sitting
# at. This is the thin part of the Night Shift: everything that decides anything
# lives in `scripts/dream/theme.mjs` and `guards.mjs`, and this script's whole
# job is to give that pipeline a checkout it can dirty and take it away again.
#
# Why a worktree at all: the shift refuses to start on a dirty tree, which is
# exactly right for a human's checkout and fatal for a scheduled run that finds
# one. A worktree is a second checkout sharing one `.git`, so the branch a dream
# creates SURVIVES the worktree being removed — the branch is the output, the
# checkout is scaffolding.
#
# What it never does: commit, merge, push, or touch the branch it started from.
# It runs `git worktree add/remove/prune` and nothing else; the grep gate in
# `tests/dream/nightly.test.ts` is what keeps that true rather than this comment.
#
#   scripts/dream/nightly.sh [--dry-run] [--keep] [--brief <id>]
#                            [--base <ref>] [--worktree <path>]
#
# Scheduling it — the two paths §10.6 names:
#
#   # local: crontab -e, 03:00 every night
#   0 3 * * * cd /path/to/faqir && bash scripts/dream/nightly.sh >> /tmp/faqir-night.log 2>&1
#
#   # local: launchd (macOS), ~/Library/LaunchAgents/dev.faqir.night.plist
#   #   ProgramArguments: /bin/bash -lc 'cd /path/to/faqir && bash scripts/dream/nightly.sh'
#   #   StartCalendarInterval: { Hour: 3, Minute: 0 }
#
#   # cloud: a Claude Code scheduled routine (`/schedule`), which brings its own
#   #   checkout — there, schedule the SKILL rather than this script:
#   #     every day at 03:00 — /faqir-dream
#
set -euo pipefail

DRY_RUN=0
KEEP=0
BRIEF=""
BASE="${DREAM_BASE:-main}"
WORKTREE=""

# A value flag with nothing after it, or another flag after it, is an error —
# not an empty string that quietly means "the default".
value_of() {
  if [ $# -lt 2 ] || [ -z "$2" ] || [ "${2#-}" != "$2" ]; then
    echo "✗ $1 needs a value — see --help" >&2
    exit 2
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --keep) KEEP=1 ;;
    --brief) value_of "$@"; BRIEF="$2"; shift ;;
    --base) value_of "$@"; BASE="$2"; shift ;;
    --worktree) value_of "$@"; WORKTREE="$2"; shift ;;
    -h|--help)
      sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^#\{1,2\} \{0,1\}//'
      exit 0
      ;;
    *) echo "✗ unknown option '$1' — see --help" >&2; exit 2 ;;
  esac
  shift
done

# A brief id is a queue key — lowercase kebab-case, the same shape the queue
# validates. It is spliced into the command the dream runs, so anything else
# (a quote, a `;`, a `$(…)`) is refused here rather than handed to a shell.
if [ -n "$BRIEF" ] && ! [[ "$BRIEF" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "✗ --brief '$BRIEF' is not a brief id (lowercase letters, digits and '-', starting with a letter)" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
# The pid joins the stamp because two runs in one second is not hypothetical —
# a test suite does it, and `git worktree add` onto an existing path is a hard
# failure that would look like a git problem rather than a naming one.
TMPROOT="${TMPDIR:-/tmp}"
[ -n "$WORKTREE" ] || WORKTREE="${TMPROOT%/}/faqir-night-$STAMP-$$"

# The dream itself. `claude -p` runs the skill non-interactively, which is the
# whole point of the nightly path; override it to run the script directly, or to
# use a different agent CLI, without editing this file:
#
#   DREAM_CMD='node scripts/dream/theme.mjs --brief arcade' bash scripts/dream/nightly.sh
#
# The default runs as an argument vector, never through `eval`: the brief id is
# the one piece of it that comes from the command line. A DREAM_CMD you set
# yourself is a shell command by design, and is evaluated as one.
DREAM_ARGV=(claude -p "/faqir-dream ${BRIEF:-next}" --permission-mode acceptEdits)
if [ -n "${DREAM_CMD:-}" ]; then
  DREAM_SHOWN="$DREAM_CMD"
else
  DREAM_SHOWN="${DREAM_ARGV[*]}"
fi

echo "▶ Night Shift — $STAMP"
echo "  repository: $ROOT"
echo "  base:       $BASE"
echo "  worktree:   $WORKTREE"
echo "  command:    $DREAM_SHOWN"

if ! git -C "$ROOT" rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "✗ no ref '$BASE' to start from (set DREAM_BASE or pass --base)" >&2
  exit 1
fi

# Branches before, so the summary can say what tonight actually produced.
BEFORE="$(git -C "$ROOT" branch --list 'dream/*' --format='%(refname:short)' | sort)"

# `--detach` rather than a branch: the dream creates its own `dream/theme-<id>`
# inside, and a worktree holding `main` would both lock it and put HEAD one
# checkout closer to a commit landing there.
git -C "$ROOT" worktree add --detach "$WORKTREE" "$BASE" >/dev/null
echo "✓ worktree added (detached at $BASE)"

# node_modules is not in the tree, and every gate needs it. A symlink costs
# nothing and is removed before the worktree is, so `git worktree remove` never
# trips over it.
if [ -d "$ROOT/node_modules" ] && [ ! -e "$WORKTREE/node_modules" ]; then
  ln -s "$ROOT/node_modules" "$WORKTREE/node_modules"
fi

STATUS=0
if [ "$DRY_RUN" -eq 1 ]; then
  echo "— dry run: the worktree was created and will be removed; the dream was not run."
else
  set +e
  if [ -n "${DREAM_CMD:-}" ]; then
    ( cd "$WORKTREE" && eval "$DREAM_CMD" )
  else
    ( cd "$WORKTREE" && "${DREAM_ARGV[@]}" )
  fi
  STATUS=$?
  set -e
  echo "· dream command exited $STATUS"
fi

# Harvest the bundle BEFORE the worktree goes: the scorecard and the light/dark
# PNGs are gitignored, so they live nowhere else, and removing the worktree
# would take the only copy of the thing the morning review looks at.
if [ -d "$WORKTREE/.faqir-dreams/out" ]; then
  mkdir -p "$ROOT/.faqir-dreams/out"
  cp -R "$WORKTREE/.faqir-dreams/out/." "$ROOT/.faqir-dreams/out/"
  echo "✓ bundles harvested → $ROOT/.faqir-dreams/out/"
fi

DIRTY="$(git -C "$WORKTREE" status --porcelain)"

if [ -n "$DIRTY" ] && [ "$DRY_RUN" -eq 0 ]; then
  # A discarded dream deletes its branch and leaves the queue update and the
  # ledger row uncommitted, on purpose (`docs/night-shift.md`). Removing the
  # worktree here would delete the only record of a night that produced a
  # reason — so the worktree stays and says so.
  echo "⚠ the worktree is dirty — a discard's ledger row and queue update are in it:"
  echo "$DIRTY" | sed 's/^/    /'
  echo "  kept for review: $WORKTREE"
  echo "  when you are done:  git -C $ROOT worktree remove --force $WORKTREE"
elif [ "$KEEP" -eq 1 ]; then
  echo "· --keep: worktree left at $WORKTREE"
else
  rm -f "$WORKTREE/node_modules"
  git -C "$ROOT" worktree remove --force "$WORKTREE"
  git -C "$ROOT" worktree prune
  echo "✓ worktree removed"
fi

AFTER="$(git -C "$ROOT" branch --list 'dream/*' --format='%(refname:short)' | sort)"
NEW="$(comm -13 <(echo "$BEFORE") <(echo "$AFTER") | sed '/^$/d')"

if [ -n "$NEW" ]; then
  echo "✓ tonight's branches:"
  echo "$NEW" | sed 's/^/    /'
else
  echo "· no new dream branch (nothing kept, or nothing to dream)"
fi

# The digest is a pure function of the ledger and the branches, so refreshing it
# every night costs nothing on a night that produced nothing: unchanged bytes
# are not rewritten. It writes DREAMS.md in the REPOSITORY, not the worktree —
# that is where the file lives — so a night that produced a dream leaves it
# modified and uncommitted for the morning (`docs/night-shift.md` says so where
# someone finds it).
if [ "$DRY_RUN" -eq 0 ] && [ -f "$ROOT/scripts/dream/digest.mjs" ] && command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/dream/digest.mjs" || echo "· digest skipped (non-zero exit)"
fi

exit "$STATUS"
