# Faqir UI 1.1 "Personality" — release notes

> **Draft.** Written ahead of the tag. The release-verification section is
> completed by whoever cuts the release, from the rehearsal and the manual
> suites; nothing else here should need to change.

1.0 froze the contract. 1.1 gives it a voice. The protocol did not move: every
1.0 page still audits clean, and everything below is additive under
[`SPEC-1.0.md` §8](../SPEC-1.0.md).

Seven packages ship at 1.1.0, in lockstep: `faqir-ui-cli`, `@faqir-ui/core`,
`@faqir-ui/react`, `@faqir-ui/vue`, `@faqir-ui/forms`, `@faqir-ui/mcp` and — new
in this release — `@faqir-ui/rules`.

---

## What shipped

### Theme System 2.0

- **A theme is a seed.** One accent colour plus fourteen character axes (type,
  shape, depth, material, motion, density, focus, decoration, controls,
  contrast, …). `faqir theme generate` turns a seed into a contrast-verified
  stylesheet, manifest, preview and scorecard.
- **27 themes.** Twelve authored themes, re-expressed as seeds, are joined by
  twelve generated ones and three print companions.
- **Distinctiveness.** The generator measures every new theme against every
  shipped one and refuses a recolour; the manifest records the nearest theme and
  the distance.
- **New token families.** Typography roles (`--font-heading/-body/-ui`,
  `--heading-*`), shape (`--border-width-*`, `--corner-shape`), focus
  (`--focus-ring-*`), depth (`--shadow-color`, `--surface-backdrop`), motion
  personality (`--ease-spring`, `--motion-*`) and six SVG surface textures.
  Components read the role tokens, so an axis change reaches them.
- **`light-dark()`.** A dual-scheme theme is one `light-dark()` block rather than
  two parallel token sets.
- **Self-hosted fonts.** `faqir fonts add <family> --role heading` downloads a
  hash-pinned WOFF2 from a 16-family OFL catalog and serves it from the project.
  No third-party font link, ever.
- **Scoped themes.** `faqir theme bundle <theme> --scope` rewrites a theme onto
  `data-skin="<theme>"`, so two themes can live on one page.
- **Choosing by axes.** The docs gallery filters by axis, and the MCP server's
  `faqir_theme_list` takes an `axes` filter, so an agent picks a theme by what it
  is like rather than by name.

### Rules platform

- **`@faqir-ui/rules`** (new package) evaluates a form's cross-field logic —
  shape and conditions — from one JSON definition, with the same evaluator on
  the server and in the browser (golden-parity tested).
- **`l-rules`** — the new `faqir-rules` official plugin, the sixth — runs that
  definition in the page.
- **Async validation.** `faqir-validate` gains `l-validate:<name>.async`: the
  field sits in `data-state="validating"` while a promise is out, runs are
  debounced and the newest wins, and a rejection is a failure, not a silent pass.
- **`faqir rules lint`** checks a definition: references, cycles, messages,
  operators and reachability.
- **`@faqir-ui/forms` emits rules** beside the markup they govern.

### Audit

- **Vocabulary rules.** `attribute-vocabulary`, `unknown-attribute`,
  `directive-name` and `part-element` catch a near-miss attribute, an unknown
  directive, or a slot on the wrong element — markup that renders and silently
  does nothing.

### Night Shift (v0, developer tooling)

The framework generates theme candidates unattended and a human decides in the
morning. It is repository tooling, not part of any published package: a queue of
briefs, a gated pipeline that ends in a branch (never a merge or a push), a
ledger (`dreams.tsv`), a rubric and a weekly digest (`DREAMS.md`). See
[`docs/night-shift.md`](night-shift.md) and [`docs/dream-rubric.md`](dream-rubric.md).

---

## The protocol: two amendments

Both are additive under SPEC-1.0 §8.2 and neither touches the five protocol
attributes.

1. **`data-skin` — a fourth sanctioned token modifier**, beside `data-density`,
   `data-motion` and `data-theme`. It selects which installed theme's token
   declarations a subtree resolves. Its vocabulary is open: any installed theme's
   name is legal, so adding a theme is not an amendment.
2. **`data-density="spacious"`** — a third value for the density modifier, beside
   `compact` and `comfortable`.

## Manifest schema 1.1

`schema_version` moves to **1.1**; `protocol_version` stays at **1.0**. The
schema gains five optional theme-manifest fields — `seed`, `axes`, `fonts`,
`distinctiveness` and `visual_matrix`. They are optional, so every manifest
written against 1.0 still validates. The change is recorded in the schema's own
changelog and in SPEC-1.0 §9.

## No breaking changes — proven, not asserted

`tests/migration/surface-v100.test.ts` reads the honoured surface of every
component the **v1.0.0** tag shipped (`tests/fixtures/v100/surface.json`,
extracted from the tag by `bun run gen:v100-surface`) — every attribute value a
manifest declared or a stylesheet or controller selected on — and requires
today's registry to honour all of it. It allows no exceptions: the only
acceptable number of losses in a 1.x minor is zero, and at the time of release
it is zero across all 86 components.

## Canonical URLs

The canonical spec and schema URLs are pinned to `SPEC_REF` in
`src/canonical.ts`, which stays **`v1.0.0`**: those URLs keep serving the 1.0
text exactly as it was frozen. The 1.1 text of `SPEC-1.0.md` — with both
amendments — is at tag **`v1.1.0`**. The schema alias
(`…/main/manifest.schema.json`, the schema's `$id`) always serves the newest 1.x
schema, which is now 1.1.

## No npm provenance

As with 1.0, no package carries an npm provenance attestation. Provenance needs
an OIDC token from a CI provider, and this repository runs no CI workflows.
Verify the published artifacts against the `v1.1.0` tag instead.

---

## UPGRADING FROM 1.0

Run, in the project:

```bash
faqir upgrade --dry-run   # preview
faqir upgrade
faqir doctor
```

**What `faqir upgrade` changes.** It three-way merges every installed component
up to the 1.1 registry, keeping local edits; a conflict is written with standard
git markers and reported. New in 1.1, it does the same for the files `faqir init`
wrote and nothing used to refresh: the token layer (`tokens/index.css` and
`tokens/imports.css`, or every token file under `--tokens-split`) and
`base/{reset,prose,rhythm,motion-presets}.css`. This matters: 1.1 components read
about fifty custom properties 1.0's token layer never defined (`--border-width`,
`--focus-ring-*`, `--switch-width`, `--panel-bg`, …). Upgrading the components
without the tokens would render a switch with no width and a focus with no ring.

- A 1.0 file you never edited is recognized by its hash against what 1.0 shipped,
  so it is replaced cleanly.
- A token file you edited before 1.1 has no recorded baseline, so it is not
  rewritten. It only gains the declarations it is missing, appended at zero
  specificity (`:where(:root)`), so every value you chose still wins.
- A base stylesheet in that state is left alone and reported.

**What it never touches.** `tokens/theme.css` is yours — the theme you chose,
possibly edited — and so is anything else you put under `tokens/`.

**By hand, in one case.** Components that 1.0's `faqir scaffold` installed were
copied without a baseline, so `upgrade` reports them as `no-baseline` and skips
them. Run `faqir add <name>` for each one it lists (this records your current
copy as the baseline), then `faqir upgrade` again.

**Afterwards.** `faqir doctor` now fails a project whose installed components read
a token its token layer does not define, and names the tokens. `faqir add` checks
the same thing when it installs a component and refreshes the token layer if it
must.

The 1.0 → 1.1 path was exercised end to end before the tag: a project created by
the `v1.0.0` CLI (init, five components and an invoice scaffold) upgraded with no
conflicts, and audited clean.

---

## Fixes since the 1.1 lanes

A review of the finished 1.1 tree (`docs/code-evaluation-1.1.md`) and the fix
pass that followed it. None of these changes the protocol or a manifest contract.

**Security**
- `@faqir-ui/rules` `coerce` no longer lets a submitted key such as
  `profile.__proto__.x` write onto `Object.prototype`.
- A field `pattern` that can backtrack catastrophically is refused when the
  definition compiles — nested repeats like `(a+)+` and `(a+){20}`, and repeated
  alternations whose branches overlap, like `(a|a)+` and `(\w|\d)+`. A value
  longer than 10,000 characters is never matched against a pattern at all.
- `faqir scaffold --output`, `theme generate/bundle --out`, `bundle --output`
  and `init --dir` can no longer write outside the project through a relative
  path; theme names are validated before they reach a path.
- `apiSource` and `l-source` encode item ids in the URL they build.
- `faqir_project_context` (MCP) reads only inside the project root.
- The Night Shift runner no longer `eval`s a brief name.

**Runtime**
- `l-for` with duplicate keys no longer leaks rows.
- `l-model.number.trim` no longer throws.
- Optimistic `apiSource.create` / `l-source` rows are found by identity after an
  interleaved `load()` or `remove()`.
- The collapse plugin's effect is disposed with its scope.
- `faqir.js` destroys the controllers of removed subtrees and keeps moved ones.
- The observer no longer re-initializes a scope `Faqir.start()` already built.
- A dialog opened twice keeps one focus trap; a toast dismissed twice arms one
  exit.
- The mask plugin handles every delete input type.
- A remote validator must answer a boolean `ok` and a string `message`.
- `@faqir-ui/forms` emits `step="any"` on a decimal number field.

**CLI**
- `faqir repair` applies the fixes it advertises: the `trigger-contract` fix,
  fixes located by offset (the second of two dialogs, not the first), and no
  empty ARIA attributes. `repair --json` and `audit <file> --fix` work as
  documented.
- `faqir doctor` accepts components whose content model is `empty`
  (`page-break`, `spinner`), so invoice and report projects no longer fail it.
- `faqir scaffold` installs through `faqir add`, so scaffolded components have a
  baseline for `diff` and `upgrade`.
- A flag given no value is an error rather than the next flag.
- The rule inventory lists every rule the audit runs: 37.
- The CLI bundle no longer prints garbled output when run under Bun.

**Themes and tokens**
- `--heading-caps` makes the small-caps heading voice render.
- `--divider-width` makes a `double` divider drawable.
- Theme alias overrides apply under `[data-theme]` as well as `:root`.
- A theme `faqir theme generate` wrote is listed by `faqir theme list` and can be
  set by name.

---

## Release verification

> **TO FILL** — recorded as `docs/release-checklist.md` asks.

- `node scripts/release.mjs minor --dry-run`: <!-- result -->
- Manual suites (they baseline in a pinned Linux container, so they are run by
  hand; see the checklist):
  - `bun run test:visual` (under the 1.1A-13 matrix policy): <!-- result -->
  - `bun run test:visual:print`: <!-- result -->
  - `bun run test:a11y`: <!-- result -->
  - `bun run test:browser`: <!-- result -->
  - `bun run lint:layout`: <!-- result -->
