# Task

Goal: Raise how far Faqir can push landing-page design. Study the marketing, product, editorial and portfolio prompts in `opus-5.5-100-prompturi.md`, pull out the design moves that make those pages look premium, and add the reusable ones to Faqir as additive, protocol-safe enhancements to themes, the CTA/hero/pricing/button surface and the effect primitives. Ship one showcase landing page built only from Faqir parts to prove the result.
Done when:
- `docs/landing-craft.md` exists. It maps each extracted technique to the prompt(s) it came from (by number), to what Faqir already does, and to the change made, deferred or rejected, with a one-line reason for each.
- Every enhancement in that doc marked "shipped" exists as registry HTML + CSS + manifest (+ controller only where CSS cannot do it), has tests, has a preview, and appears in the regenerated skill and registry index.
- At least 3 new seed-generated themes cover landing aesthetics the current 25 themes don't (candidates: gilded Art Deco, claymorphism, Memphis, liquid chrome, Didone fashion editorial, warm craft/roastery, concrete brutalist-minimal). Each is a `<name>.seed.json` plus at most a short signature stylesheet, with manifests produced by `bun run gen:theme-manifests`.
- `playground/landing-craft.html` (or a few short pages, one per theme) is a full landing page: nav, hero, logo cloud, features, testimonial, pricing with a monthly/yearly toggle, CTA and footer. It uses only registry components, tokens and directives, with no page-local CSS beyond layout glue, renders correctly in each new theme, and has been looked at in Chrome at 1440px and 390px.
- `bun run test`, `bun run typecheck`, `bun run audit:registry`, `bun run test:a11y` and every `check:*` listed in AGENTS.md pass. Every generated artifact the change touches has been regenerated and committed with its source.
- No change counts as **major** under SPEC-1.0 §8.2, and `tests/spec/protocol-1.0.test.ts` passes untouched.
Scope: `registry/` (primitives, recipes, patterns, themes, tokens, base, plus `registry/core/` only via `bun run build:core`), `src/core-src/engine.js` (only if a new behaviour truly needs it), `src/theme-manifest.ts` and `scripts/gen-theme-*.mjs` (only to add axis values), `tests/`, `playground/`, `docs/landing-craft.md`, and the generated outputs AGENTS.md names. Everything else is read-only, including `SPEC-1.0.md`, `src/protocol.ts`, `manifest.schema.json`, `site/`, `packages/`, the release scripts and all `FAQIR-*.md` planning files.
Limit: 6 hours or 40 iterations, whichever comes first.
Subagents: 5
Branch: new — `feat/landing-craft`
PR: yes
Unattended: yes

If a missing detail would change the result, ask me one focused question (when unattended: pick the safest sensible default and record it under Decisions instead). For anything else, choose a sensible default, say what it is, and start.

## The feature brief

### Source material

`opus-5.5-100-prompturi.md` has 100 prompts for standalone showcase pages. Most are toys and simulations (fluid solvers, N-body, mazes, synths), and those are **out of scope**: Faqir does not ship canvas engines, WebGL or physics (FAQIR-VISION §3, invariant 4). Read the shared-requirements block and then only the page-shaped prompts. Start from 001, 006, 008, 010, 014, 015, 024, 035, 040, 043, 048, 058, 068, 081, 082, 085, 087 and 096, and add any others you find to be landing, product, editorial or portfolio pages. For each one, ask: *which part of this is a reusable, CSS-first design move, and which part is a one-off illustration?* Only the first kind goes into Faqir.

Typical reusable moves in those prompts, given as a starting point rather than a checklist:
- **Theme level:** fluid display type scale with extreme contrast; Didone and engraved small caps; wide tracking; hard offset shadows; glass with inner highlight and grain; clay (inner and outer shadows); foil or metallic gradient text; paper and concrete textures; a single acid accent on near-black; generous editorial measure.
- **CTA and button:** sheen or shimmer sweep, glow, press-down (shadow collapse), magnetic or pointer-follow highlight, an arrow that slides on hover, a sliding-pill segmented toggle, a sticky or banner CTA, a CTA over a backdrop effect.
- **Hero and sections:** full-bleed, split and centred-oversized heroes; kinetic or staggered headline reveal; eyebrow or kicker; marquee strips; section dividers and ornaments; scroll-driven reveal and progress; bento tiles with spotlight or tilt; pull quotes and drop caps; stamps and badges ("SOLD OUT", edition marks).
- **Pricing and social proof:** monthly/yearly toggle with an animated pill, a highlighted plan, and testimonial strips and walls.

Before adding anything, inventory what already exists: `cta`, `hero`, `pricing`, `bento`, `feature-grid`, `testimonials`, `logo-cloud`, `button`, `glow`, `backdrop`, `marquee`, `reveal`, `scroll-progress`, `highlight`, `surface`, `text`, the theme seeds and the axis enums in `src/theme-manifest.ts`. Prefer a new variant or prop on an existing component over a new component, and a seed axis value over hand-written theme CSS. Note which gaps you closed by *using* existing parts well in the showcase rather than by adding code.

### How Faqir changes are made (non-negotiable)

- Read `AGENTS.md`, `CONTRIBUTING.md`, `SPEC-1.0.md` §2–§4 and §8, and `FAQIR-VISION.md` §3 (simplicity invariants) and §5/§7 (themes, motion) before the first edit.
- **Five attributes, forever.** New knobs are component variant values, component props in the style of `data-cols`/`data-full`, sanctioned token modifiers, or directives. Never a sixth protocol attribute, and never a change to a value grammar. Allowed (additive): a new component, a new value in a component's own variant group, a new value for a sanctioned token modifier, a new info/warning audit rule. Anything else in §8.2's "major" rows is off-limits; if an idea needs one, record it in `docs/landing-craft.md` as deferred to 2.0.
- **Themes are data.** A new theme is a seed plus at most a short signature stylesheet. Never hand-write `tokens_overridden`/`tokens_inherited` or theme manifests. If a new axis value is needed (for example a `material` or `depth` value), add it to the enum and the generator, test the generator once, and regenerate every theme.
- Component CSS uses attribute selectors, `var(--token)` values only, no `!important`, no IDs, no classes for identity, low specificity, and a `prefers-reduced-motion` path for every animation. Native platform features (`@property`, scroll-driven animations, `@starting-style`, `linear()`, view transitions) must be feature-detected and degrade to static, correct, accessible output.
- Controllers only when CSS can't do it. They follow the recipe rules in AGENTS.md: `// @ui:controller`, `create{Name}(root)`, idempotent, root-scoped queries, `destroy()`, imports only from `registry/core/`, and zero dependencies. Pointer effects (magnetic, tilt, spotlight) must be off under reduced motion and on coarse pointers, and must never move focus or block keyboard use.
- Accessibility is part of the contract: contrast in every new theme (both schemes if it has two), visible `:focus-visible`, manifest `a11y` matching the behaviour, and decorative effects marked `aria-hidden`.
- Never hand-edit generated outputs. After changes, run the matching generators: `gen:component-tokens`, `gen:theme-manifests`, `gen:theme-previews`, `gen:theme-docs`, `gen:schema-refs`, `build:registry-index`, `gen:skill`, and `build:core` (plus `build:core-package` if the engine or a recipe controller changed). Commit each one with its source.

### Environment notes for this machine

- Use the system Bun (1.4.2, matching `.bun-version`). Run the full suite with `bun run test`, never a bare `bun test`.
- If the full suite shows the `tests/meta` happy-dom realm guard or `tree-view-reactive` flaking, that's the stale lockfile pinning happy-dom 20.10.6. Run `bun add -d happy-dom@20.11.2 @happy-dom/global-registrator@20.11.2 --no-save` and re-run. Don't commit lockfile or package.json changes for it; record it under Decisions.
- Docker isn't installed, so `bun run test:visual` can't produce canonical renders. Don't run `test:visual:update` and don't commit snapshots; report visual tests as "not run (no container)". `test:a11y` does run locally.
- The playground server is `bun playground/server.js` on port 5555, serving the repo root (for example `http://localhost:5555/playground/landing-craft.html`). Theme previews are under `registry/themes/*.preview.html`.
- Engine tests share one happy-dom realm: mount into a disposable container, never boot `document.body` (see AGENTS.md).

### Suggested order

1. Analysis → `docs/landing-craft.md` (commit). Rank the candidate changes by how much they lift the ceiling per line of code, and cap the shipped list at what the limit allows. Ten excellent additions beat thirty thin ones.
2. Theme axis values (if any) and generator test → new theme seeds → regenerate (commit).
3. CTA/button/hero/pricing variants and effect primitives, one component per milestone with its tests and preview (commit each).
4. The showcase page(s), Chrome-checked in every new theme (commit).
5. Finish.

## How to work

1. **Orient.** If `PROGRESS.md` exists, read it, confirm it still matches the code, and resume from its next step. Read only what the next decision needs.
2. **Baseline.** Run the checks before changing anything and note the result. Every change is measured against it.
3. **Small steps.** Make one bounded change and run the checks it affects. Keep it if it moves toward done; revert just that change if it doesn't. Don't repeat a failed approach without a new reason.
4. **Simpler wins.** When two solutions work equally well, keep the one with less code. Removing code without losing anything counts as progress. Don't add abstractions, config, or files the task doesn't need.
5. **Don't touch the evaluator.** Never edit, skip, or loosen a check, audit rule, gate or test to make it pass. If a check looks wrong, stop and record it under Decisions instead of working around it.

## Subagents

Use them when they save real time or context. Otherwise, do the work yourself.

- **Good fits:** the prompt-file analysis (split the page-shaped prompts across 2 readers that return technique lists, not prose), the existing-component inventory, independent components built in parallel, and a fresh-eyes review at the end. **Poor fits:** small tasks and tightly coupled edits (theme generator + regeneration; anything touching `engine.js`).
- **Pick the cheapest model that can do the job well.** Sonnet 5.5 for well-defined work: searching, mechanical edits, writing tests, following a clear plan. Opus 5.5 for ambiguous design, theme design and the final review.
- **Brief them fully.** A subagent doesn't see this conversation. Give it the goal, the files, its scope, the "How Faqir changes are made" rules above, and exactly what to return.
- **No overlapping edits.** Two subagents never edit the same files at the same time, and generators (`gen:*`, `build:*`) are run only by you after their edits land, because they rewrite shared files.
- **Verify before keeping.** A subagent saying "done" is a claim. Run the checks on its work yourself.
- **Only you commit and push.** Subagents edit files; they don't touch git.
- Stay within the subagent limit above, counting every agent you start.

## Visual check

For anything a person will look at (UI, layout, styles, charts, generated pages), open it in Chrome and look at it before calling it done.

- Start the dev server if needed, open the page in a new tab, and take a screenshot.
- Compare it with what was asked. Try the main interaction, check the console for errors, and check a phone-width viewport if layout matters.
- For this task, that means: the showcase in each new theme at 1440px and 390px; the CTA, button and pricing-toggle hover, focus and press states; one pass with reduced motion emulated; and no horizontal scroll at 360px. Judge it against the premium bar in the prompt file's shared requirements: a beautiful first frame, deliberate spacing, polished micro-interactions. "Renders without errors" isn't enough.
- Treat this as one of the checks: fix what looks wrong, then look again.
- Leave my other tabs and logged-in accounts alone.
- If Chrome isn't connected, say so. Never claim something looks right without seeing it.

## Git

Commits, pushes to the work branch, and opening the PR are pre-approved. You don't need to ask.

- **Branch.** If `Branch` is new, fetch and branch off the latest base branch. If it's current, work where you are. Unattended work never lands directly on `main`/`master`: if you're on it, create a branch first.
- **Commit at each milestone**, meaning a step that passes its checks and leaves nothing worse than the baseline. Stage only the files you changed. Never commit secrets, `.env` files, build output, or `PROGRESS.md`. Keep messages short: what changed and why. Don't commit `harness-*.md` or `opus-5.5-100-prompturi.md`.
- **Push after every commit.** If a push fails, keep committing locally, note it in `PROGRESS.md`, and try again at the next milestone.
- **Open the PR when finished** (if `PR` is yes), using `gh`, against the base branch. In the description, cover what changed, the check results, and what's unresolved. Open it as a draft if any check fails or the work is partial.
- **Never** force-push, rewrite pushed history, push to any other branch, merge the PR, or enable auto-merge.

## When I'm away (`Unattended: yes`)

- Don't wait for me. Where you'd normally ask, pick the safest reasonable option, record it under Decisions, and keep going.
- Anything on the ask-first list below: don't do it. Leave it as a next step for me.
- If one part is blocked, record why and move to another part. When nothing useful is left or the limit is reached, run Finish and stop. Don't spin.
- Keep `PROGRESS.md` current after every milestone. On a long run your context may get compacted, and this file is how you stay on track.

## Guardrails

- Stay inside scope.
- Ask before anything else irreversible or outward-facing: deploy, publish, delete data, send messages, spend money. For this repo that includes: no `npm publish`, no `deploy:site`, no `scripts/release.mjs`, no version bumps, no tags, and no changes to `.bun-version` or `bun.lock`.
- Commit before a risky edit so it can be undone.
- Before retrying an external write (push, PR), check whether the first attempt already landed.

## Progress file

You must keep this file when the task is unattended or spans sessions. Skip it for short attended tasks. Keep it out of git (add it to `.git/info/exclude`). Keep it short:

- **Done:** finished milestones and their check results
- **Decisions:** choices that shape the result, and why
- **Tried and failed:** what didn't work, and why
- **Git:** branch, last pushed commit, PR link
- **Next:** one concrete step to resume from

## Finish

1. Reread the full diff once with fresh eyes (a review subagent on Opus 5.5 works well for large changes). Look for bugs, leftover debug code, complexity you can remove, SPEC §8.2 "major" changes that slipped in, and hand-edited generated files.
2. Rerun all checks on the final version, including the Chrome check for visual changes.
3. Commit and push the final state. If `PR` is yes, open the PR.
4. Report briefly:
   - branch and PR link
   - what changed, with file paths: new themes, new or extended components and their new variants, the showcase page, and `docs/landing-craft.md`
   - each check: pass or fail, with the real output for failures (`test:visual`: not run, no container)
   - for visual changes, what you looked at in Chrome (pages, themes, widths, states)
   - if you used subagents: how many, which model, and for what
   - decisions made without me, techniques deferred to 2.0 or rejected and why, and anything unresolved

If the limit or a blocker stops you, say exactly what's left. Never report a result you didn't observe.
