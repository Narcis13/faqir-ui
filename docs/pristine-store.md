# The pristine store & `faqir diff`

When `faqir add` installs a component it also keeps a **pristine copy** — a
byte-exact snapshot of the component exactly as it was installed. That snapshot
is the baseline `faqir diff` compares your working copy against, and it is the
"old" side of the three-way merge `faqir upgrade` performs. Together they let
you customize a component freely and still pull in upstream changes without
losing your edits.

The store lives inside the git-ignored `.faqir/` directory. It is a **local,
reproducible cache** — never committed — and is rebuilt from the registry on the
next `add`/`upgrade` if it is ever deleted.

---

## Layout

```
.faqir/pristine/
├── pristine.json                 # index: schema + one entry per component
├── button@1.0.0/                 # {name}@{version}
│   ├── button.css
│   ├── button.html
│   └── button.manifest.json
└── card@1.0.0/
    ├── card.css
    ├── card.html
    └── card.manifest.json
```

A component's snapshot directory is named `{name}@{version}` and mirrors the
component's file tree exactly. The bytes are written verbatim from the install
source (the bundled registry, or a hash-verified remote payload), so every file
is byte-equal to what was installed.

## `pristine.json`

```jsonc
{
  "schema": "faqir-pristine@1",       // format id — bumped only on a breaking change
  "components": {
    "button": {
      "version": "1.0.0",             // manifest version the snapshot came from
      "layer": "primitives",          // primitives | recipes | patterns
      "dir": "button@1.0.0",          // snapshot directory, relative to the store root
      "files": ["button.css", "button.html", "button.manifest.json"],
      "backfilled": false             // present & true only for backfilled baselines
    }
  }
}
```

### Versioned by design

The `schema` field makes the layout forward-compatible. A future format change
bumps the id (`faqir-pristine@2`, …); a CLI that reads a store whose schema it
does not recognize treats it as **empty** rather than crashing — an old snapshot
can never break a newer CLI, and a missing/corrupt store degrades to "no
baseline". This is the same content-addressed, schema-tagged discipline the
remote registry index uses (see `docs/remote-registry.md`).

## `faqir diff`

```
faqir diff button            # unified diff of your drift for one component
faqir diff                   # diff every installed component
faqir diff button --json     # machine-readable drift summary
```

- **Human** output is a standard unified diff (`--- / +++` headers, `@@` hunks),
  copy-pasteable as a patch.
- **`--json`** emits a stable envelope an agent can consume without parsing the
  patch text:

```jsonc
{
  "schema": "faqir-diff@1",
  "components": [
    {
      "component": "button",
      "version": "1.0.0",
      "layer": "primitives",
      "pristine": true,          // was a baseline found?
      "clean": false,            // does the working copy match the baseline?
      "files": [
        { "path": "button.css", "status": "modified", "added": 3, "removed": 1, "hunks": 2 }
      ],
      "summary": { "filesChanged": 1, "added": 3, "removed": 1 }
    }
  ]
}
```

`status` is `modified`, `added` (a file you added), or `removed` (a file you
deleted). Unchanged files are omitted. `diff` exits `0` whether or not there is
drift — it is a report, not a gate.

## Backfill

Components installed **before** the pristine store existed have no baseline. On
their next `faqir add` they get one — captured from the *current* registry
source and marked `"backfilled": true` — accompanied by a warning, because that
baseline may not match the exact bytes you originally installed. Reviewing
`faqir diff <component>` right after a backfill shows what (if anything) the
approximation attributes to your drift.

If you run `faqir diff` on a component that still has no baseline (never
re-added), it warns and reports `"pristine": false` rather than erroring.

## Changelog (`changes`)

Component manifests may carry a `changes` array — the per-version changelog
`faqir upgrade` prints when moving between versions:

```jsonc
"changes": [
  { "version": "1.1.0", "note": "Added `--variant ghost`.", "breaking": false },
  { "version": "2.0.0", "note": "Renamed data-tone → data-variant.", "breaking": true }
]
```

The schema is in place as of task 0.5-04; entries are populated going forward.
`breaking` entries are surfaced prominently before an upgrade applies any merge.
