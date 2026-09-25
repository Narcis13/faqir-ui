# Release checklist

Everything between a clean `main` and seven packages on npm. `scripts/release.mjs`
automates the parts that can be automated and refuses to proceed past the parts
that cannot; this document is the list of what it does, what it deliberately does
not, and what a human has to do around it.

Run the rehearsal first. Always:

```bash
node scripts/release.mjs minor --dry-run
```

A dry run does the whole thing — guards, gates, version bump, ordered builds,
packed-tarball smoke — and then restores every tracked file it touched. It
publishes nothing, commits nothing and tags nothing. If it is not green, the
release is not ready.

---

## There is no CI

The GitHub Actions workflows were removed in `671941e` (no Actions minutes on the
free plan). That decision moves real work onto this checklist, and the honest
accounting is:

**Moved into the release script's preflight** (`PREFLIGHT` in
`scripts/release.mjs`) — these now run on the release machine, which is stricter
than CI ever was, because they cannot be skipped by pushing to a branch:

`typecheck` · `check:registry-index` · `check:manifest-api` · `check:core-package`
· `check:audit-browser` · `check:rules-plugin` · `check:schema-refs`
· `check:bindings` · `check:skill` · `check:theme-docs` · `check:docs`
· `audit:registry` · `size` · `test`

`tests/build/release.test.ts` fails when a `check:*` script exists that the
preflight does not run, and when this list stops matching it.

**Cannot be automated on this machine, and are therefore manual** — the visual,
print and a11y suites baseline inside a pinned Linux container, because font
rasterisation differs between machines and a macOS render will not match. With no
container to run them in, they are a judgement call before each release rather
than a gate:

| Suite | Command | What it protects |
|---|---|---|
| Visual regression | `bun run test:visual` | Every component's rendered pixels |
| Print / PDF | `bun run test:visual:print` | The document scaffolds' print output |
| Accessibility | `bun run test:a11y` | 3,013 axe cases across the registry |
| Browser smoke | `bun run test:browser` | Directives and controllers in a real browser |
| Layout ratchet | `bun run lint:layout` | Bleeds and overlaps at phone widths |

Run them locally before a release that touched CSS, markup or the engine. Expect
baseline noise on macOS: read the diffs, do not blanket-accept them, and never
run an `:update` variant to make a release go green.

The a11y suite also carries the docs site's one *interactive* case (task
1.1A-20): `docs__themes_axis_filter__{light,dark}` in
`tests/a11y/docs-site.pw.ts` drives the theme gallery's axis filter — selects
`depth = glass`, checks that only the cards whose derived axes say so remain and
that the live count follows — then runs axe on the filtered page. The filter's
markup is gated without a browser (`tests/generator/docs-themes.test.ts`); its
behaviour is this case, and it is as manual as the rest of the suite.

**How big those two suites are is a manifest fact, not a constant** (task
1.1A-13). The visual and a11y matrices are multiplicative in themes, so each theme
declares its own membership in `registry/themes/<name>.theme.json`:
`visual_matrix` absent (or `true`) buys the full sweep — every component × both
schemes, × both directions for the screenshots — and `visual_matrix: false` buys a
**patterns-only** sweep instead, 30 captures rather than 344. Absence means
membership, so a new theme is covered by default and nothing shrinks the gate by
omission. The twelve authored themes are all members; generated seed themes ship
opted out, and promoting one is a one-line manifest edit that adds cells and
renames no baseline. A release that adds themes should therefore check the
membership lines before assuming the suites got slower — and a release that
*promotes* a theme should expect a batch of new (not changed) baselines.

`tests/meta/visual-baselines.test.ts` and `tests/meta/print-visual-paths.test.ts`
hold the workflow invariants and go dormant while `.github/workflows/` is absent.
They wake up on their own if CI returns.

---

## Before you start

- [ ] The `faqir-ui` npm **organisation exists** and you are a member with publish
      rights. All six scoped packages publish under it (`publishConfig.access` is
      `public`); the root `faqir-ui-cli` is unscoped. `npm org ls faqir-ui` should
      list you.
- [ ] `npm whoami` is the account you intend to publish as.
- [ ] Two-factor is set up and you have the authenticator to hand — `npm publish`
      blocks on the OTP prompt. Pass `--otp <code>` to avoid seven prompts — a
      TOTP code lasts about 30 seconds, so a slow publish may still ask again.
- [ ] `gh auth status` is green, if you want the GitHub release created for you.
- [ ] `main` is clean, pushed, and identical to `origin/main`.
- [ ] `bun --version` prints exactly what `.bun-version` pins. `cdn.json`'s SRI
      hashes, `site/lib/faqir-audit.js` and `registry/core/plugins/faqir-rules.js`
      are byte-compared against a fresh `bun build --minify`, which is not stable
      across Bun releases, so the script refuses any other Bun. Bumping Bun on
      purpose is its own commit: update `.bun-version`, run
      `bun run build:core-package`, `bun run build:audit-browser` and
      `bun run build:rules-plugin`, and commit all of it together.

## New on npm in 1.1

`@faqir-ui/rules` is the one package 1.1 adds. It is a first publish of a new
name into the existing `faqir-ui` organisation — no org setup, nothing to
reserve — but it is the only name in the lockstep set npm has never seen, so:

- [ ] `npm view @faqir-ui/rules` 404s before the release (the name is free and
      unclaimed), and your account can publish into the org.
- [ ] After the release, `npm view @faqir-ui/rules version` reports it like the
      other six.

Every other package is an ordinary version bump: `node scripts/release.mjs minor`.

## What the script does, in order

1. **Guards** — clean worktree, on `main`, in sync with `origin/main`, and
   `bun --version` equal to `.bun-version`. Any failure stops before anything is
   written, `--dry-run` and `--skip-preflight` included.
2. **Preflight** — the gate list above. `--skip-preflight` exists for a retry
   after a partial publish and prints a loud warning; do not use it otherwise.
3. **Version** — computes the next version and writes it to all seven
   `package.json` files and `src/version.ts`. Lockstep, always: no package
   depends on another by range, so there is no reason for them to differ and one
   good reason not to — "which versions go together" stops being a question. A
   file already carrying the target version is reported and left alone; only a
   *missing* version field is an error.
4. **Ordered builds** — `build:core` (which injects `Faqir.version`) →
   `build:cli` → `build:core-package` (regenerates `cdn.json` and its SRI
   hashes against the new version) → `build:bindings` → `build:mcp`.
5. **Artifact verification** — every dist exists and is non-empty, and the packed
   CLI tarball installs into a temp directory and answers `faqir --version` and
   `faqir context --skill` **under `node`** (pinned with `FAQIR_FORCE_NODE=1`, since
   the launcher prefers Bun whenever Bun is on PATH) **and under Bun** when Bun is
   installed. This is the check `check:package` never was: `npm pack --dry-run`
   will happily pack 365 files whose `bin` cannot resolve. The Bun leg is the one
   that catches a bundle Bun decodes as Latin-1 (a stray `// @bun` pragma turned
   every `—` into `â€”`).
6. **Commit, tag, push** — in that order, and **push before publish**. The old
   ordering was tag → publish → push, so a rejected push left a version live on
   npm that existed in no pushed commit. If the builds reproduce what is already
   committed there is nothing to commit, and HEAD is tagged as it stands rather
   than carrying an empty commit. An existing tag is reused only when it already
   points at HEAD; one pointing elsewhere aborts the release.
7. **Publish** — `@faqir-ui/core`, then the bindings (`react`, `vue`), then
   `@faqir-ui/forms` and `@faqir-ui/rules`, then `@faqir-ui/mcp`, then the root
   CLI last, so the package people actually install is the last thing to appear.
8. **GitHub release** — via `gh release create`, with notes. Skipped with a
   printed command if `gh` is missing.

## What it does not do

- **No `--provenance`.** npm provenance requires an OIDC token from a CI
  provider. With no Actions workflow there is no `id-token: write` and no
  attestation to sign. This is a genuine gap in every 1.x release so far and a
  consequence of the CI decision, not an oversight — say so in the release notes
  rather than leaving it looking unconsidered.
- **No automatic rollback.** npm has no transaction across seven packages. See
  below.

## If a publish fails partway

npm cannot un-publish a version after 72 hours, and un-publishing within 72 hours
burns the version number permanently — it can never be reused. So the rollback is
forward, not backward:

1. **Read the script's output.** It prints exactly which packages published and
   which did not, and stops on the first failure rather than continuing.
2. **The git side is already correct.** The commit and tag were pushed in step 6,
   before any publish, so `main` and the tag describe the intended release
   whatever npm did.
3. **Finish the publish by hand** for the packages that did not land:
   `npm publish --workspace @faqir-ui/<name>` from the repository root. The
   artifacts are already built and verified; nothing needs rebuilding.
4. **If the failure was in the artifacts themselves**, do not un-publish. Fix
   forward with a patch release. A published version that nobody was told about
   costs nothing; a burnt version number costs a permanent hole in the sequence.
5. **`--skip-preflight`** exists for exactly this retry, so a twenty-minute gate
   run does not stand between you and finishing a half-published release.

## After

- [ ] `npm view faqir-ui-cli version` and each scoped package report the new
      version.
- [ ] `npx faqir-ui-cli@latest --version` works from a clean directory.
- [ ] The CDN snippets resolve: `cdn.json`'s `base` is
      `https://cdn.jsdelivr.net/npm/@faqir-ui/core@<version>/dist/`, and jsDelivr
      serves a version within a few minutes of publish. Load one page from it and
      confirm the SRI hashes do not fail closed — a stale hash means a blank page
      and one console line.
- [ ] `bun run deploy:site` publishes the docs, if the site moved.
- [ ] The canonical spec URLs resolve. They are git refs
      (`src/canonical.ts`), so this means the tag is pushed:
      `https://github.com/Narcis13/faqir-ui/blob/v1.0.0/SPEC-1.0.md` and
      `https://raw.githubusercontent.com/Narcis13/faqir-ui/main/manifest.schema.json`
      (`SPEC_REF` stays `v1.0.0` in 1.x: those URLs keep serving the frozen text).
      Also open the new tag's copy, `…/blob/v<version>/SPEC-1.0.md`, which carries
      this release's amendments. The preflight refuses to release a spec whose pinned tag does not exist, but
      it cannot verify that you pushed it.
