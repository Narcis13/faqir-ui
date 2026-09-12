# `.faqir-dreams/queue.json` — the dream queue

What the Night Shift is going to dream, in the order it will dream it.
`scripts/dream/queue.mjs` is this document as code (`validateQueue`), and
`tests/dream/queue.test.ts` fails if the two disagree — so neither may be edited
alone.

```jsonc
{
  "version": 1,
  "briefs": [
    {
      "id": "arcade",              // lowercase kebab; becomes dream/theme-<id>
      "kind": "theme",             // theme | component | motion | dogfood | wish | docs
      "brief": "…a sentence or two of mood…",
      "axes_hint": { "scheme": "dark", "motion": "playful" },  // optional partial seed
      "added": "2026-09-12",       // ISO date
      "status": "pending"          // pending | dreaming | kept | discarded
    }
  ]
}
```

## Fields

| Field | Required | Rule |
|---|---|---|
| `version` | yes | Exactly `1`. Bumped when this shape changes. |
| `briefs` | yes | An array. May be empty — an empty queue is a quiet night, not an error. |
| `briefs[].id` | yes | Lowercase kebab-case, unique across the file. It becomes a branch name (`dream/theme-<id>`), a seed filename (`.faqir-dreams/seeds/<id>.seed.json`), a bundle directory (`.faqir-dreams/out/<id>/`) and a ledger row's `id`, so it has to be safe in all four. |
| `briefs[].kind` | yes | One of the six dream kinds of FAQIR-VISION §10.3. Only `theme` has a pipeline in 1.1; the others are here so the vocabulary does not move when they arrive. |
| `briefs[].brief` | yes | At least 20 characters. The dream is written **from** this — the agent turns it into a seed — so a label (`"dark theme"`) is not enough. Say the mood, and say which region of the axis space it is reaching for. |
| `briefs[].axes_hint` | no | A partial seed. The agent may override any of it after looking at what already ships; it is a starting point, not a contract. |
| `briefs[].added` | yes | ISO `YYYY-MM-DD`. |
| `briefs[].status` | yes | See the machine below. |

## The status machine

```
pending ──▶ dreaming ──▶ kept
   ▲            │
   │            ├──────▶ discarded
   └────────────┘  (a crashed run is released back by the next one)
```

`kept` and `discarded` are **terminal**. A brief worth trying again is a *new*
brief with what was learnt written into it — not a status reset, because the
ledger row for the first attempt has to keep meaning what it said.

`dreaming` exists only so a crashed run is distinguishable from a night that
never started. The next run calls `releaseStale()`, which returns every
`dreaming` brief to `pending` and logs the ids it released.

## Order

`pickNext()` takes the **first `pending` brief in file order**. The order in the
file is the running order; re-prioritising is an edit. There is deliberately no
`priority` field — that would be a second source of truth about the same thing,
and the file already has one.

## Writing a good brief

The queue's job is to send the shift where the shipped themes are *not*. The
distinctiveness table (`registry/themes/*.theme.json` → `distinctiveness`, and
README's theme tables) is the map: a brief that lands 3 axes from `default` is a
recolour the generator will refuse before it writes anything, and a discard row
is all the night will have produced.

Two facts about the vocabulary worth knowing before writing a hint, both
measured rather than assumed:

- **`shape.corner` is an axis only a rounded theme can state.** At
  `border-radius: 0` a filled box is pixel-identical under `round`, `bevel`,
  `scoop` and `notch` (Chrome 149). A brief asking for a bevel must also ask for
  a radius above `sharp`, or it is asking for an axis nothing draws.
- **`decoration.divider: "double"` needs a border of at least 3px.** `separator`
  draws its rule as `var(--border-width) var(--divider-style) …`, so under a
  hairline a double rule paints as one solid line. The theme gauntlet refuses
  the combination; follow-up `1.1A-26` tracks giving the family its own width.
