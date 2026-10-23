# Task

Goal: Grow Faqir UI's library with a new wave of components: more chart types, a video player, complex lists, a WhatsApp-style chat UI and a rotary knob. Also upgrade the image, tree-view, stepper, calendar and date-picker components (with date-range selection in both of the last two), and update the docs site to showcase all of it. The bar is "outstanding and stunning". Each component must be polished in every theme, light and dark, and fully usable by keyboard and screen reader. It must be built only from the five-attribute protocol and design tokens.
Done when:
- New registry components exist. Each has canonical HTML, token-only CSS and a schema-valid manifest with `a11y` declarations, plus a controller where CSS cannot do the job. Each has tests: unit tests and a `tests/browser/*.pw.ts` covering pointer and keyboard behaviour.
  - **Video player** recipe over native `<video>`: play/pause, a scrubber with buffered range and hover time, elapsed/duration, volume and mute, playback rate, a captions toggle, picture-in-picture, fullscreen and keyboard shortcuts. It falls back to native controls when JS is off.
  - **Complex lists**: list item slots for leading media, title/subtitle/meta and trailing actions; grouped sections with sticky headers; single or multi selection with listbox keyboard semantics; and reordering that works from the keyboard.
  - **Chat UI**:
    - Bubbles, WhatsApp style: incoming and outgoing bubbles with tails, grouping of consecutive messages, timestamps, sent/delivered/read ticks, replies and quotes, reactions, attachments, date separators, system messages and a typing indicator.
    - A composer: an auto-growing input, Enter to send and an attachment slot.
    - A `chat` pattern that combines a conversation list with a thread.
  - **Knob** recipe: a rotary `role="slider"` with pointer drag, wheel and Arrow/Page/Home/End keys. It supports min/max/step, a value arc drawn from tokens, sizes, form participation and `l-model`.
- Existing components are upgraded additively. Existing markup and manifest values keep validating, and the components' existing tests pass unchanged.
  - **chart**: at least five new types (candidates: area, stacked column/bar, donut/pie, scatter, sparkline, radar, gauge). Charts are still SVG drawn from the data table, with aria-labels that read every value.
  - **image**: candidates are a blur-up or skeleton placeholder, focal-point and fit control, a caption, a lightbox/zoom and a before/after comparison.
  - **tree-view**: tri-state checkboxes, lazy-loaded children, type-ahead, filtering, guide lines and icons, multi-select, and drag-and-drop that also works from the keyboard. It keeps full APG tree semantics.
  - **stepper**: vertical and horizontal layouts; complete, current, error and optional states; and clickable step navigation that works with the `wizard` pattern.
  - **calendar**: a hover preview of the range, a multi-month view, preset ranges and a min/max range length.
  - **date-picker**: a range mode with presets, parsing of typed input in the page locale, a clear button and an inline mode.
- Docs site:
  - `bun run build:docs` produces a page with a live example for every new component.
  - A new hand-written showcase page in `site/content/`, registered in `src/generator/docs.ts` the way `motion.html` is, shows every new and upgraded component, live and interactive.
  - The showcase is linked from the nav and from a new release story on `site/content/home.html`.
  - It has been looked at in Chrome at 1440px and 390px, in light and dark, in at least three themes, with a clean console.
- These checks pass: `bun run test`, `bun run typecheck`, `bun run audit:registry`, `bun run size`, `bun run test:a11y` and every `check:*` listed in AGENTS.md.
- Every generated artifact the change touches is regenerated and committed with its source: core bundles, `packages/core/cdn.json`, registry index, skill, manifest-api, bindings, schema refs and component tokens.
- No change counts as **major** under SPEC-1.0 §8.2, and `tests/spec/protocol-1.0.test.ts` passes untouched.
Scope:
- Editable:
  - `registry/primitives/`, `registry/recipes/` and `registry/patterns/` (new components and the ones named above).
  - `registry/core/plugins/faqir-chart.js`.
  - `src/core-src/engine.js`, only if a component truly needs engine support.
  - `tests/`.
  - `site/content/`, `site/styles/` and `site/lib/`.
  - `src/generator/docs.ts`, only to register and wire the showcase page.
  - The budget lines named under Context.
  - The generated outputs AGENTS.md names, including `registry/core/faqir-core*.js`, `packages/core/cdn.json` and `packages/{vue,react}/src/components/`.
- Read-only: everything else, including `SPEC-1.0.md`, `src/protocol.ts`, `manifest.schema.json`, `registry/tokens/`, `registry/themes/`, the release scripts and every `FAQIR-*.md`.
Limit: 8 hours or 50 iterations, whichever comes first.
Subagents: 5
Branch: new, `feat/component-expansion`
PR: yes
Unattended: yes
Context:
- **Bundle budget (decided by me).** Every recipe controller is inlined into `faqir-core.js`, and the core budget had about 0.5 KB left. You may raise these budgets as far as the work needs:
  - `engineWithControllers` and `engineCsp` in `scripts/check-size.mjs`;
  - `ASSEMBLED_GZIP_BUDGET` in `scripts/build-core-package.mjs`;
  - the matching assertions in `tests/build/core-package.test.ts`;
  - the `faqir-chart.js` entry in `PLUGIN_BUDGETS`.

  Raise each to the measured size, rounded up to the next KB, with a rationale comment in the existing style. Those lines are the only exception to "Don't touch the evaluator".
- **Toolchain.** This Windows checkout is CRLF and has no Bun, so the byte-comparing gates are red here before any change. Work in a fresh LF clone inside WSL Ubuntu:
  - Use the pinned Bun 1.4.2 and Node 22 from `~/faqir-tools`, with Node first on PATH and `sysroot/` on `LD_LIBRARY_PATH` for Playwright.
  - Deliver commits with `git bundle` and push from Windows, where `gh` is authenticated.
  - WSL Chromium needs `--disable-gpu --disable-software-rasterizer --disable-dev-shm-usage --no-sandbox`.
  - If `test:a11y` hangs in AxeBuilder, use the top-frame axe substitute in `~/r13-axe.mjs` and record that you did.
- **Protocol.** Stay additive: new components and new variant values only, no new attributes, and no runtime dependencies. Charts stay SVG/CSS, with no canvas or WebGL. Use existing tokens; component-scoped custom properties derived from them are fine.
- **Order.** Land one component area per milestone, complete with registry files, tests, regenerated artifacts and its docs example, before starting the next, so a partial run is still shippable. Suggested order: calendar/date-picker ranges, tree-view, stepper, lists, chat, knob, image, video player, charts, then the showcase page.
- **Media.** Keep any committed demo media small (≤ 1 MB per file) and same-origin. Don't run `deploy:site`.

If a missing detail would change the result, ask me one focused question (when unattended: pick the safest sensible default and record it under Decisions instead). For anything else, choose a sensible default, say what it is, and start.

## How to work

1. **Orient.** If `PROGRESS.md` exists, read it, confirm it still matches the code, and resume from its next step. Read only what the next decision needs.
2. **Baseline.** Run the checks before changing anything and note the result. Every change is measured against it.
3. **Small steps.** Make one bounded change and run the checks it affects. Keep it if it moves toward done; revert just that change if it doesn't. Don't repeat a failed approach without a new reason.
4. **Simpler wins.** When two solutions work equally well, keep the one with less code. Removing code without losing anything counts as progress. Don't add abstractions, config, or files the task doesn't need.
5. **Don't touch the evaluator.** Never edit, skip, or loosen a check to make it pass. If a check looks wrong, stop and tell me.

## Subagents

Use them when they save real time or context. Otherwise, do the work yourself.

- **Good fits:** independent pieces that can run in parallel, wide codebase searches, a fresh-eyes review at the end. **Poor fits:** small tasks and tightly coupled edits.
- **Pick the cheapest model that can do the job well.** Sonnet 5.5 for well-defined work: searching, mechanical edits, writing tests, following a clear plan. Opus 5.5 for ambiguous design, hard debugging, and the final review.
- **Brief them fully.** A subagent doesn't see this conversation. Give it the goal, the files, its scope, and exactly what to return.
- **No overlapping edits.** Two subagents never edit the same files at the same time.
- **Verify before keeping.** A subagent saying "done" is a claim. Run the checks on its work yourself.
- **Only you commit and push.** Subagents edit files; they don't touch git.
- Stay within the subagent limit above, counting every agent you start.

## Visual check

For anything a person will look at (UI, layout, styles, charts, generated pages), open it in Chrome and look at it before calling it done.

- Start the dev server if needed, open the page in a new tab, and take a screenshot.
- Compare it with what was asked. Try the main interaction, check the console for errors, and check a phone-width viewport if layout matters.
- Treat this as one of the checks: fix what looks wrong, then look again.
- Leave my other tabs and logged-in accounts alone.
- If Chrome isn't connected, say so. Never claim something looks right without seeing it.

## Git

Commits, pushes to the work branch, and opening the PR are pre-approved. You don't need to ask.

- **Branch.** If `Branch` is new, fetch and branch off the latest base branch. If it's current, work where you are. Unattended work never lands directly on `main`/`master`: if you're on it, create a branch first.
- **Commit at each milestone**, meaning a step that passes its checks and leaves nothing worse than the baseline. Stage only the files you changed. Never commit secrets, `.env` files, build output, or `PROGRESS.md`. Keep messages short: what changed and why.
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
- Ask before anything else irreversible or outward-facing: deploy, publish, delete data, send messages, spend money.
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

1. Reread the full diff once with fresh eyes (a review subagent works well for large changes). Look for bugs, leftover debug code, and complexity you can remove.
2. Rerun all checks on the final version, including the Chrome check for visual changes.
3. Commit and push the final state. If `PR` is yes, open the PR.
4. Report briefly:
   - branch and PR link
   - what changed, with file paths
   - each check: pass or fail, with the real output for failures
   - for visual changes, what you looked at in Chrome
   - if you used subagents: how many, which model, and for what
   - decisions made without me, and anything unresolved

If the limit or a blocker stops you, say exactly what's left. Never report a result you didn't observe.
