# Faqir UI 1.1 "Personality" — release notes

> **Draft.** Written ahead of the tag. The sections marked **TO FILL** are
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

> **TO FILL** — the specifics come from the token-refresh fix.

The short version: run

```bash
faqir upgrade
```

in the project (`faqir upgrade --dry-run` previews it). It three-way merges the
installed components — and the token layer and base styles `faqir init` wrote —
up to the 1.1 registry, keeping local edits; a conflict is written with standard
git markers. The project's theme (`tokens/theme.css`) is never touched.

<!-- TO FILL: what `faqir upgrade` changes for a 1.0 project (token files, role
tokens, the theme stylesheet), what it leaves alone, and anything a project
must do by hand. -->

---

## Fixes since the 1.1 lanes

> **TO FILL** — the fixes that landed between the last 1.1 lane task and the tag.

<!-- TO FILL -->

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
