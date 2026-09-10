# Release checklist

Everything between a clean `main` and six packages on npm. `scripts/release.mjs`
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

**Moved into `release.mjs --preflight`** — these now run on the release machine,
which is stricter than CI ever was, because they cannot be skipped by pushing to
a branch:

`typecheck` · `check:registry-index` · `check:manifest-api` · `check:core-package`
· `check:audit-browser` · `check:docs` · `check:skill` · `check:schema-refs`
· `check:bindings` · `size` · `test` · `audit:registry`

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

`tests/meta/visual-baselines.test.ts` and `tests/meta/print-visual-paths.test.ts`
hold the workflow invariants and go dormant while `.github/workflows/` is absent.
They wake up on their own if CI returns.

---

## Before you start

- [ ] The `faqir-ui` npm **organisation exists** and you are a member with publish
      rights. All five scoped packages publish under it (`publishConfig.access` is
      `public`); the root `faqir-ui-cli` is unscoped. `npm org ls faqir-ui` should
      list you.
- [ ] `npm whoami` is the account you intend to publish as.
- [ ] Two-factor is set up and you have the authenticator to hand — `npm publish`
      blocks on the OTP prompt. Pass `--otp=<code>` to avoid six prompts.
- [ ] `gh auth status` is green, if you want the GitHub release created for you.
- [ ] `main` is clean, pushed, and identical to `origin/main`.

## The first publish

Nothing has been published yet: all six names 404 on the registry, and the `v0.1`
–`v0.2.4` tags never reached npm. The first release differs from every later one
in two ways.

**The version is named, not bumped.** The 1.0 prerelease commit already put
`1.0.0` into all six `package.json` files and `src/version.ts`, and
`src/canonical.ts` pins `SPEC_REF = "v1.0.0"` — every canonical spec and schema
URL resolves through that tag. So the first release *is* 1.0.0, and it is passed
explicitly rather than derived:

```bash
node scripts/release.mjs 1.0.0 --dry-run   # rehearse
node scripts/release.mjs 1.0.0             # publish
```

Re-stamping a version that is already on disk rewrites nothing, which is fine and
expected — the script reports `already at 1.0.0` per file and asserts the release
commit contains only what it actually changed. A bump keyword would be wrong
here: `patch` resolves to 1.0.1 and would burn 1.0.0 without ever publishing it,
leaving `SPEC_REF` pointing at a tag no release created.

**The npm side does not exist yet.** Before the first run:

- [ ] `npm login` — the machine has no token at all until this is done
      (`npm whoami` currently errors `ENEEDAUTH`).
- [ ] Create the **`faqir-ui` organisation** on npm. The five scoped packages
      cannot publish into a scope that does not exist, and the error npm returns
      for a missing scope (`404`) reads identically to a name that is taken.
- [ ] Confirm the unscoped `faqir-ui-cli` is still free — an unscoped name is
      first-come, and the whole publish order ends with it.

Everything after the first release uses a bump keyword as normal.

## What the script does, in order

1. **Guards** — clean worktree, on `main`, in sync with `origin/main`. Any
   failure stops before anything is written.
2. **Preflight** — the gate list above. `--skip-preflight` exists for a retry
   after a partial publish and prints a loud warning; do not use it otherwise.
3. **Version** — computes the next version and writes it to all six
   `package.json` files and `src/version.ts`. Lockstep, always: no package
   depends on another by range, so there is no reason for them to differ and one
   good reason not to — "which versions go together" stops being a question. A
   file already carrying the target version is reported and left alone; only a
   *missing* version field is an error.
4. **Ordered builds** — `build:core` (which injects `Faqir.version`) →
   `build:cli` → `build:core-package` (regenerates `cdn.json` and its 15 SRI
   hashes against the new version) → `build:bindings` → `build:mcp`.
5. **Artifact verification** — every dist exists and is non-empty, and the packed
   CLI tarball installs into a temp directory and answers `faqir --version`
   **under `node`**, not Bun. This is the check `check:package` never was: `npm
   pack --dry-run` will happily pack 365 files whose `bin` cannot resolve.
6. **Commit, tag, push** — in that order, and **push before publish**. The old
   ordering was tag → publish → push, so a rejected push left a version live on
   npm that existed in no pushed commit. If the builds reproduce what is already
   committed there is nothing to commit, and HEAD is tagged as it stands rather
   than carrying an empty commit. An existing tag is reused only when it already
   points at HEAD; one pointing elsewhere aborts the release.
7. **Publish** — `@faqir-ui/core`, then the bindings, then `@faqir-ui/mcp`, then
   the root CLI last, so the package people actually install is the last thing to
   appear.
8. **GitHub release** — via `gh release create`, with notes. Skipped with a
   printed command if `gh` is missing.

## What it does not do

- **No `--provenance`.** npm provenance requires an OIDC token from a CI
  provider. With no Actions workflow there is no `id-token: write` and no
  attestation to sign. This is a genuine gap in the 1.0 release and it is a
  consequence of the CI decision, not an oversight — say so in the release notes
  rather than leaving it looking unconsidered.
- **No automatic rollback.** npm has no transaction across six packages. See
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
      `https://raw.githubusercontent.com/Narcis13/faqir-ui/main/manifest.schema.json`.
      The preflight refuses to release a spec whose pinned tag does not exist, but
      it cannot verify that you pushed it.
