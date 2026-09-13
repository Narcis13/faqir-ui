# Code evaluation, 1.1 "Personality" (2026-09-13)

A review of the repository at `main` after the 1.1 lanes landed (Theme System
2.0, the rules platform, Night Shift). Four independent passes: the runtime
(engine, plugins, packages), the CLI and tooling (`src/`, `scripts/`, MCP), the
docs site generator, and README accuracy. Every claim below was verified at the
cited line; two engine issues and two rules-package issues were reproduced.

## Verdict in one paragraph

The architecture is sound and unusually disciplined for a framework this size:
one command registry renders both `faqir help` and the agent skill, one audit
core (`auditHtmlSource`) is shared byte-for-byte by the CLI, the MCP server and
the browser playground, one axis vocabulary drives the theme validator, the
generator, the CLI flags and the docs, and the reactive engine's cleanup
ownership is explicit and reasoned. The gates are real: drift in any generated
artifact fails CI. The weaknesses are concentrated in a few places that the
gates do not cover: two input-handling holes in `@faqir-ui/rules` (prototype
pollution in `coerce`, an unbounded `pattern` subject), a handful of repair
paths that silently never apply, unguarded output paths in two commands, and a
Night Shift branch-cleanup step that cannot work from the detached worktree it
runs in. None of these is architectural; all are one-file fixes.

## What is genuinely well designed

- **One source, many surfaces.** `src/command-registry.ts` feeds `faqir help`,
  the skill's CLI reference and (now) the docs site; `src/theme-manifest.ts`
  feeds the seed validator, `theme generate`, the MCP tool and the gallery;
  `src/audit/rules.ts` feeds the CLI, `packages/mcp`, `site/lib/faqir-audit.js`
  and the audit-rules page. Drift in any of them is a test failure, not a doc bug.
- **Byte-faithful repair.** The tokenizer (`src/parser/html-tokenizer.ts`)
  keeps raw attribute quoting and byte offsets, so `faqir repair` rewrites the
  one tag it means to and nothing else.
- **Authored versus vendor findings** (`src/audit/checker.ts:80-99`): a fresh
  `init` plus `add` cannot fail the gate on framework bytes.
- **The theme generator is a pure function** (`generateThemeBundle`,
  `src/commands/theme-generate.ts:859-966`) that runs contrast, elevation,
  token parity and an axes round-trip through the real classifier before
  writing anything. The scope rewrite (`src/theme/scope.ts`) throws if the
  token set changes.
- **Fonts are verified before any write** (WOFF2 signature, declared length,
  SHA-256, `src/fonts/install.ts:302-330`) and `fonts.css` refuses to clobber
  a file it does not own.
- **Engine hygiene.** `l-model` never compiles user input; keyed `l-for` uses
  LIS reconciliation; controller failures are contained per component; a
  second `Faqir.start()` is idempotent; `l-source` guards requests with a
  sequence number, an `AbortController` and a destroyed latch.
- **The rules package** bounds its walk, uses closed keyword sets, treats a
  failed remote check as "could not check", not "pass", and proves
  isomorphism with a second-realm test.
- **Scripts spawn through one budgeted helper** (`scripts/spawn.mjs`) with
  argv arrays; a meta-test fails any script that bypasses it.

## Issues, ranked

Severity is about consequence, not effort. Each line names the file and the
one-line fix.

### High

1. **Prototype pollution in `coerce`.** `packages/rules/src/shape.js:193-206`:
   `setPath` reuses `current["__proto__"]` as a container, so
   `{"profile.__proto__.polluted":"yes"}` writes onto `Object.prototype`.
   This is the advertised server path (`coerce(def, req.body)`). Reject
   `__proto__`, `constructor` and `prototype` segments, or build with
   `Object.create(null)`.
2. **`pattern` has no subject-length bound.** `shape.js:565` tests the field's
   regex against the raw value while the `regex` logic op caps its subject
   (`logic.js:386`). `^(a+)+$` against 29 characters took 428 ms. Apply
   `MAX_REGEX_SUBJECT_LENGTH` before `field.regex.test`.
3. **The `trigger-contract` fix never applies.** `src/audit/rules.ts:1106`
   emits `details.attribute`; `src/audit/repairer.ts:285` reads
   `details.attr`. The report says "auto-fixable"; `faqir repair` skips it
   every time. Rename the key (and the test at
   `tests/audit/trigger-contract.test.ts:68`).
4. **`addAttribute` ignores `fix.offset`.** `repairer.ts:294-312` searches by
   a string derived from the finding message; two dialogs in one file, or any
   hyphenated part name, mis-target the fix. Locate the tag from the offset as
   `renameId` does.
5. **Output paths escape the project.** `src/commands/scaffold.ts:192` and
   `src/commands/theme.ts:295,329,630` use `join(cwd, arg)`, so `--output
   /tmp/x.html` writes `<cwd>/tmp/x.html` and `../../x.html` escapes with no
   guard. Use `resolve` plus a containment check, as `add.ts:521-532` does.
6. **Night Shift cannot delete a discarded branch.**
   `scripts/dream/theme.mjs:419-425` runs from the detached worktree
   `nightly.sh:94` creates, so `startBranch` is the literal `HEAD`,
   `git checkout HEAD` is a no-op and `git branch -D` refuses. The next run of
   the same brief fails at `checkout -b`. Capture the SHA and detach to it
   first; check each command's status.
7. **`eval` of an interpolated brief.** `scripts/dream/nightly.sh:75,109`
   splices `BRIEF` into `DREAM_CMD` and `eval`s it. Validate against
   `^[a-z][a-z0-9-]*$` or build an argv array.

### Medium

8. `l-for` with duplicate keys leaks rows (`src/core-src/engine.js:1897-1900`;
   reproduced: two rows keyed `1`, re-rendered twice then cleared, leave three
   `<li>`). Map keys to arrays, or fall back to position with a dev warning.
9. `l-model.number.trim` throws (`engine.js:1592-1593`): `.number` yields a
   number, then `.trim()` is called. Trim before casting.
10. Remote validate accepts any truthy `message` in the browser
    (`packages/rules/src/plugin.js:376`, `faqir-validate.js:314-318`) but the
    server reports `remote-error` (`rules.js:620`). Require a string.
11. `api-source.js:134,169` and `engine.js:975,1015` build `${endpoint}/${id}`
    without encoding; an id like `../admin` rewrites the path. Use
    `encodeURIComponent(id)`.
12. Stale optimistic index in `apiSource.create` (`api-source.js:89,103`) and
    `l-source` (`engine.js:945-962`) after an interleaved `load()`/`remove()`.
    Locate the temp row by identity.
13. The collapse plugin never returns its effect (`faqir-collapse.js:57`), so
    the engine registers no disposer. `return Faqir.effect(...)`.
14. `registry/core/faqir.js` observes `addedNodes` only; controllers on removed
    nodes are never destroyed.
15. Unvalidated theme names in `theme set` and `theme bundle`
    (`theme.ts:711,552,636`); `bundle ../../foo --scope` writes outside
    `--out`. Apply `THEME_NAME_PATTERN` in the dispatcher.
16. `required-aria` and `aria-describedby` emit fixes with `value: ""`
    (`rules.ts:190,735`); `repairer.ts:324` writes a bare attribute and
    reports it fixed.
17. `faqir repair --json` is documented but not implemented (`repair.ts:19`);
    `audit --fix` forwards flags `repair` ignores (`audit.ts:133-136`).
18. The rule inventory omits `token-exists` and `reduced-motion`
    (`checker.ts:306,635`), and the browser legend omits the four vocabulary
    rules (`browser.ts:210-257`). The audit-rules page on the site now lists
    every rule the engine runs and marks the two the inventory misses.
19. `@faqir-ui/forms` emits `type="number"` without `step`
    (`packages/forms/src/index.js:1094`), so browsers reject decimals the rules
    package accepts. Emit `step="any"` when there is no `multipleOf`.
20. `scripts/build-docs.mjs:52` passes an unvalidated `--out` to `rmSync`
    with `recursive` and `force`. Require the path to sit inside the repo.
21. `scripts/release.mjs:138-146` treats `--otp 123456 patch` as a version
    target; `packedCliSmoke` exits inside `try/finally` and leaks its temp dir.
22. `scaffold.ts:32-84` re-implements install by raw copy with no pristine
    snapshot, so `upgrade`/`diff` have no baseline; two scaffold dispatchers
    (`scaffold.ts:224-256`, `scaffolds/index.ts:25-32`) can disagree.

### Low

23. Dialog stacks focus traps when `open()` runs while already open
    (`dialog.js:76-84`); toast arms a second exit wait on double dismiss
    (`toast.js:141-166`); the engine drops pending effects silently after 100
    flush iterations (`engine.js:161-165`).
24. MCP error handling is inconsistent (`server.ts:530-538,650-653` have no
    `try/catch`; `faqir_project_context` reads JSON from any absolute root).
25. The mask plugin prevents every `delete*` input but only handles two
    (`faqir-mask.js:130-138,262-265`), so word deletes are no-ops.
26. Twenty-five direct `process.exit` sites in `theme.ts` while sibling
    commands throw; four commands read a missing flag value as the next flag
    (`scaffold.ts:191`, `context.ts:70`, `bindings.ts:65`, `dev.ts:40`).
27. Duplication worth collapsing: three `declaredAttributes()` helpers, three
    void-tag lists, byte-identical Vue/React package emitters, two near-identical
    bundlers in `scripts/`, the engine's hand-ported copies of `dom.js`,
    `events.js`, `focus.js`, `motion.js` and `utils.js` (only
    `menu-navigation.js` is single-sourced), and the rules compute graph built
    twice (`rules.js:268-306`, `lint.js:576-623`).
28. Oversized units: `src/audit/rules.ts` (2,138 lines with a 400-line CSS
    cascade resolver inside), `src/generator/skill.ts` (2,466), `src/generator/docs.ts`
    (5,300 before this refactor; the 1.1 sections now live in
    `src/generator/docs-pages/`), `theme-generate.ts` (1,279).
29. Stale text: the engine header still says `v0.1.0`; `rules/src/index.js:24`
    says "six verbs" for five; `release.mjs` says six packages for seven.

## Test coverage

216 test files. `tests/core` holds 562 cases, `tests/recipes` 732; the packages
are well covered (rules 173 cases plus a golden corpus and a second-realm
isomorphism gate; forms 56 with 22 golden fixtures; react 60; vue 59 with SSR;
mcp 47). The gaps map one-to-one onto the issues above: no adversarial-key test
for `coerce`, no long-subject `pattern` test, no duplicate-key `l-for` test, no
combined `l-model` modifier test, no removal test for `faqir.js`, no collapse
disposer test, no remote check with a non-string message.

## Documentation drift found and fixed in this pass

- README claimed 31 audit rules across nine scopes (35 in the inventory, 37
  the engine runs), twelve themes (27), engine sizes 9.5 KB and 43 KB gzip
  (10.26 KB and 44.49 KB), skill reference counts 22/15/6 (42/29/15), and a
  project tree missing every 1.1 module. Rewritten; the theme tables stay
  generated and gated.
- The docs site had no page for the audit rules, the rules platform, the CLI,
  MCP and bindings, Night Shift, the fourteen axes, theme authoring, or any
  single theme. The reactive-engine page rendered empty because its authored
  comment nested a `-->`. All added or fixed; see `docs/docs-site.md`.
