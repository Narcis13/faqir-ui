# `.faqir-plan/state.json` — format

The cross-session cursor for the `/faqir-plan` slash command (`.claude/commands/faqir-plan.md`).

**`FAQIR-PLAN.md`'s Status cells (⬜/✅) are the source of truth for what is done.** This
file is a pointer plus a log. When the two disagree, trust the plan's cells and repair this
file — that is exactly what `/faqir-plan reset` does.

## Top level

| Field | Type | Meaning |
|---|---|---|
| `$schema` | string | Relative path to this document. Prose, not a JSON Schema — nothing validates against it. |
| `plan` | string | The plan file this cursor tracks. Always `"FAQIR-PLAN.md"`. |
| `current` | string \| null | Task ID a session has started but not finished, else `null`. Written before work begins so a crash mid-session is recoverable. **Do not hand-edit while a session is running.** |
| `last_completed` | string \| null | Task ID of the most recently finished task. |
| `history` | array | Per-task log. See below. |
| `note` | string | Human-facing reminder of the rules above. |

## `history[]`

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Task ID as it appears in `FAQIR-PLAN.md` (`0.7-15`), or a span label for collapsed work (`phases v0.3–v0.5`). |
| `completed` | string | ISO date (`YYYY-MM-DD`). |
| `commit` | string \| null | Short hash of the task's final commit. `null` for early entries recorded before the field existed. |
| `summary` | string | What actually shipped. The house style is dense and specific — files, measured numbers, deviations from the plan, and anything a later session would otherwise have to rediscover. The command file says "one line"; in practice entries run to a paragraph, which is the useful form. |
| `reconstructed` | boolean | *Optional.* `true` when the entry was back-filled from git and `FAQIR-PLAN.md` after the fact rather than written by the session that shipped the task. Such summaries are inferred from commit diffs and acceptance-criteria annotations, so they carry less authority than a contemporaneous one. |

## Ordering

Not strictly ordered, and nothing depends on the order. The first ten entries are
newest-first (recent sessions prepend); everything from `phases v0.3–v0.5` down is
oldest-first (earlier sessions appended). Back-filled entries are slotted in by
`completed` date so each block stays internally chronological.

## Completeness

`history` is **not** a complete ledger. All of phases v0.3–v0.5 is collapsed into a single
entry, and seven v0.6/v0.7 tasks were missing entirely until they were back-filled on
2026-07-25. To answer "was task X done?", read the Status cell in `FAQIR-PLAN.md` and check
the registry/tests — not this file.
