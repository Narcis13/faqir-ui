---
description: Execute the next single task from FAQIR-PLAN.md, one task per session, tracked across sessions via .faqir-plan/state.json
argument-hint: "[task-id | next | status | reset]"
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, TodoWrite
---

# /faqir-plan — one task per session, traversed in order

You are executing **FAQIR-PLAN.md** one task at a time. Each invocation of this command
does **exactly one task**, then stops. A pointer file at `.faqir-plan/state.json` records
where you are so the next session continues from the next pending task automatically.

`FAQIR-PLAN.md` is authoritative for *what to do* and its `⬜`/`✅` status cells are the
source of truth for *what is done*. `.faqir-plan/state.json` is the cross-session cursor
and log — keep the two consistent.

Argument: `$ARGUMENTS`

## Argument dispatch

- **empty** or `next` → select and execute the next pending task (normal mode).
- **a task ID** (e.g. `0.3-05`, `0.4-19`, `1.0-01`) → execute exactly that task, if its
  dependencies are satisfied. If deps are unmet, report which and stop.
- **`status`** → do NOT execute anything. Print: the last completed task, the next pending
  task that would run, its `Depends:` line and whether deps are met, and a count of
  `⬜` vs `✅` per phase. Then stop.
- **`reset`** → do NOT execute anything. Re-derive the cursor purely from FAQIR-PLAN.md's
  status cells, rewrite `.faqir-plan/state.json` (`current: null`, `last_completed` = the
  last `✅` in document order), print what the next task would be, and stop.

## Step 0 — Load the cursor and the plan

1. Read `.faqir-plan/state.json`. If it is missing or malformed, recreate it with:
   `{ "plan": "FAQIR-PLAN.md", "current": null, "last_completed": null, "history": [] }`.
2. If `state.json.current` is non-null, a previous session started a task and did not
   finish it. **Resume that task** rather than picking a new one. Re-read the task, run
   `bun test`, and check which acceptance boxes are already ticked before continuing.
3. Read `FAQIR-PLAN.md` in full — the header protocol, the task-index tables, the
   follow-up table, and the detailed `### <ID> · …` sections.

## Step 1 — Select the task

If the argument is a specific task ID, that is the task (verify it exists and is `⬜`).
Otherwise pick the **next pending task** by these rules, in order:

1. Consider every row across all phase tables *and* the "Follow-up tasks" table whose
   Status cell is `⬜`.
2. Exclude any whose `Depends:` (from its detail section) lists a task ID not yet `✅`.
3. Among the remainder, choose the **first in document order** (top-to-bottom, phase
   v0.3 → v0.4 → … → follow-ups). Document order is the intended traversal.

If no `⬜` task has satisfied dependencies:
- If unfinished tasks remain but all are dependency-blocked, report the blockage
  (which tasks block what) and stop — do not force one.
- If nothing is `⬜` at all, congratulate: the plan is complete. Stop.

Announce the selected task ID and one-line summary before doing anything else.

## Step 2 — Mark in-progress and follow the plan's own protocol

1. Write the selected ID into `state.json.current` and save (so a crash mid-session is
   resumable).
2. Now obey **FAQIR-PLAN.md → "How to run a session"** and its **"Global definition of
   done"** verbatim for this one task. In particular:
   - **Verify baseline first:** run `bun test`. If it is red *before* you change anything,
     STOP and report — do not build on a broken baseline. Revert `current` to `null` and
     save state (nothing was started).
   - **Load only the task's context:** read the task's detail section and only the files
     under its **Touches** (plus what they import). Do not read unrelated tasks.
   - **Write the tests named in the task's Tests block in this same session** — never
     defer them.
   - **Stay in scope.** If the task is genuinely larger than one session, do the smallest
     coherent slice, then append a new follow-up row (next free ID in the phase) to the
     "Follow-up tasks" table instead of overrunning. Note this in your report.
   - **Respect the pillars** (FAQIR-NEXT.md §3): five-attribute protocol frozen, zero
     runtime deps, no build step in user projects, manifests are the source of truth,
     CSS targets attributes + tokens only.
3. Use TodoWrite to track the task's Tests and Acceptance criteria as sub-items so
   nothing is dropped.

## Step 3 — Definition of done (all must hold before you may mark it complete)

- [ ] `bun test` fully green (no newly skipped tests).
- [ ] Every item in the task's **Tests** block exists and passes.
- [ ] If registry files were touched → `faqir audit` is clean on them and manifests were
      updated in the same change.
- [ ] No new runtime/npm dependencies (a genuinely-needed npm dep gets a note in the
      commit body).
- [ ] Anything generated from manifests (context, skill) regenerated if a manifest changed.

If any box cannot be honestly ticked, do NOT mark the task done. Report the blocker,
leave `state.json.current` set to this task (so the next session resumes it), and stop.

## Step 4 — Record completion

Only when Step 3 fully passes:

1. In `FAQIR-PLAN.md`, tick every `- [ ]` acceptance-criteria box for this task, appending
   a short parenthetical of *how* it was satisfied (match the existing house style — see
   the already-checked tasks for tone: what file/test proves it, measured numbers, etc.).
2. Flip this task's Status cell in its index table from `⬜` to `✅`.
3. Update `.faqir-plan/state.json`:
   - `current` → `null`
   - `last_completed` → this task ID
   - append to `history`: `{ "id": "<task>", "completed": "<ISO-date>", "commit": "<hash>", "summary": "<one line>" }`
4. Commit everything (code + tests + FAQIR-PLAN.md + state.json) in the plan's required
   form: `feat(<task-id>): <summary>` — use `fix`/`test`/`chore`/`docs` where truer.
   Put any drift-reconciliation or dependency notes in the commit body as the task asks.
   (Commit only — do not push unless the user asks.)

## Step 5 — Report and stop

Print a compact summary:
- ✅ task ID completed + one-line what changed.
- Test result (`N pass / 0 fail`).
- The commit hash.
- **Next up:** the task ID the *next* session will pick (re-run selection logic, read-only)
  and its one-line summary — or "plan complete" / "next tasks are dependency-blocked".

Then **stop**. Do not start the next task — one task per session is the whole point.

## Guardrails

- Never mark a task `✅` on a red or partial test suite.
- Never edit `state.json.current` to skip a task the user asked for by ID.
- If FAQIR-PLAN.md status cells and `state.json` disagree, trust FAQIR-PLAN.md's cells and
  repair `state.json` (this is exactly what `reset` does).
- Keep changes surgical and within the task's **Touches** — this plan is deliberately
  session-sized.
