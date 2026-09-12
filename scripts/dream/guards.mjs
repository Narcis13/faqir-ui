/**
 * The rules of the shift, as code  [task 1.1N-01]
 *
 * FAQIR-VISION §10.2 states them in prose: PR only, never merge, one dream per
 * run, never touch the frozen protocol, never add a dependency, never update a
 * visual baseline. Prose is what an agent is *asked* to follow; this file is
 * what it is *able* to do. Every guard here is a pure function over strings —
 * a branch name, a list of changed paths, an argv — so each one is testable
 * without a repository, and `tests/dream/guards.test.ts` is the proof the rules
 * hold rather than the proof they were written down.
 *
 * Two layers, in this order:
 *
 *   1. FORBIDDEN — the paths §10.2 names. Checked first so the refusal says
 *      *why this file in particular*, which is the sentence worth reading.
 *   2. ALLOWED — everything else must match. An allow-list is the only shape
 *      that survives a generator learning to write somewhere new: a deny-list
 *      is a list of the mistakes already made.
 *
 * Plain ESM with no dependencies.
 */

/**
 * The paths a dream may never touch, each with the reason it is named.
 *
 * `package.json` is here for its dependency block and stays here whole: a guard
 * that parsed the diff to decide whether `dependencies` moved would be a parser
 * standing between a dream and the one file it has no business editing. Nothing
 * a theme dream legitimately produces is in it.
 */
export const FORBIDDEN_PATHS = [
  { pattern: /^SPEC-1\.0\.md$/, reason: "the frozen protocol — changing it needs SPEC-1.0 §8's amendment process, not a dream" },
  { pattern: /^src\/protocol\.ts$/, reason: "the frozen protocol as data; it may not move without SPEC-1.0.md" },
  { pattern: /^manifest\.schema\.json$/, reason: "the manifest contract; a schema change is a platform decision" },
  { pattern: /^package\.json$/, reason: "dependencies and scripts; a dream adds no dependency (§10.2)" },
  { pattern: /^bun\.lock$/, reason: "the dependency lock; a dream adds no dependency (§10.2)" },
  { pattern: /(^|\/)__screenshots__\//, reason: "a visual baseline; a dream never re-baselines what it changed (§10.2)" },
  { pattern: /^FAQIR-VISION\.md$/, reason: "the plan of record; a dream proposes themes, not directions" },
  { pattern: /^FAQIR-PLAN-1\.1\.md$/, reason: "the plan of record; /faqir-plan owns it" },
  { pattern: /^\.faqir-plan\//, reason: "the plan cursor; /faqir-plan owns it" },
];

/**
 * Where a theme dream's output is allowed to land, and what writes it.
 *
 * Derived from the pipeline rather than guessed: every entry is a path some
 * step in `THEME_GATES` actually produces, which is why each one names its
 * producer. A step that starts writing somewhere else fails this guard — which
 * is the point, because the alternative is finding out in a merged PR.
 */
export const ALLOWED_PATHS = [
  { pattern: /^registry\/themes\/[a-z0-9-]+\.(css|theme\.json|seed\.json|preview\.html)$/, by: "theme generate, gen:theme-manifests, gen:theme-previews" },
  { pattern: /^scripts\/gen-theme-manifests\.mjs$/, by: "the editorial seed — gen:theme-manifests REFUSES a theme with no mood and no pairs_with" },
  { pattern: /^src\/theme-preview\.ts$/, by: "the gallery spec — gen:theme-previews REFUSES a theme in neither GALLERY_PREVIEWS nor BESPOKE_PREVIEWS" },
  { pattern: /^README\.md$/, by: "gen:theme-docs" },
  { pattern: /^packages\/core\/cdn\.json$/, by: "build:core-package" },
  { pattern: /^\.claude\/skills\/faqir-creator\//, by: "gen:skill" },
  // The pins a new theme moves: the distinctiveness table, the byte-for-byte
  // regeneration cases, the axis roster and the visual matrix. Narrow on
  // purpose — `tests/**` would let a dream edit the gate that judges it.
  { pattern: /^tests\/themes\/[a-z0-9-]+\.test\.ts$/, by: "the theme gauntlet's pinned tables" },
  { pattern: /^tests\/visual\/matrix\.test\.ts$/, by: "the 1.1A-13 visual-matrix roster" },
  { pattern: /^\.faqir-dreams\//, by: "the shift itself — queue, seeds and bundles" },
  { pattern: /^dreams\.tsv$/, by: "the ledger" },
];

/**
 * Classify one changed path. Returns `null` when it is allowed, or the
 * violation — `kind` distinguishing "this file is named in §10.2" from "nothing
 * in the pipeline writes here", because the two need different answers from
 * whoever reads the refusal.
 */
export function classifyPath(path) {
  for (const entry of FORBIDDEN_PATHS) {
    if (entry.pattern.test(path)) return { path, kind: "forbidden", reason: entry.reason };
  }
  if (ALLOWED_PATHS.some((entry) => entry.pattern.test(path))) return null;
  return {
    path,
    kind: "outside-allow-list",
    reason:
      "no step of the dream pipeline writes here. If a step should, add it to ALLOWED_PATHS " +
      "in scripts/dream/guards.mjs with the name of the step that produces it.",
  };
}

/**
 * Check a whole diff. Returns `{ ok, violations }` rather than throwing, so the
 * caller can put the reasons in the ledger row before it discards the branch —
 * a guard that only throws records nothing about what it stopped.
 */
export function checkDiffPaths(paths) {
  const violations = paths.map(classifyPath).filter(Boolean);
  return { ok: violations.length === 0, violations };
}

/** The one-line reason a diff was refused, for the ledger's `description`. */
export function diffViolationSummary(violations) {
  const first = violations[0];
  const rest = violations.length - 1;
  return `${first.kind === "forbidden" ? "forbidden path" : "path outside the allow-list"} ${first.path}: ${first.reason}${rest > 0 ? ` (and ${rest} more)` : ""}`;
}

/** The protected branch a dream commits to only over this guard's objection. */
export const PROTECTED_BRANCH = "main";

/**
 * A dream must start from a clean tree.
 *
 * Not for tidiness: the shift commits *whatever the diff says* after its gates
 * pass, so an unrelated edit sitting in the tree when it starts is an edit that
 * ships inside a theme PR, having passed nobody's review. It is also the reason
 * the allow-list alone is not enough — a stray edit to `registry/themes/` is
 * allowed by path and still not this dream's work.
 */
export function assertCleanStart({ branch, dirty, files = [] }) {
  if (dirty) {
    const shown = files.slice(0, 5).join(", ");
    throw new Error(
      `Night Shift refuses to start on a dirty tree (${branch}): ${shown}${files.length > 5 ? `, …${files.length - 5} more` : ""}.\n` +
        `A dream commits the diff its gates passed over, so anything already in the tree would ` +
        `ship inside its PR. Commit or stash first.`,
    );
  }
}

/**
 * A dream never commits on `main`.
 *
 * §10.2's "PR only, never merge" read from the other end: the work has to live
 * somewhere a human can close without reverting anything. This is checked
 * immediately before the commit, not only at the start, because the branch is
 * created in between and a failed checkout would otherwise leave the commit on
 * whatever HEAD happened to be.
 */
export function assertNotProtected(branch, what = "commit") {
  if (branch === PROTECTED_BRANCH) {
    throw new Error(
      `Night Shift refuses to ${what} on '${PROTECTED_BRANCH}'. A dream's output is a branch and ` +
        `a PR; it never merges and never writes to the trunk (§10.2).`,
    );
  }
}

/**
 * The git subcommands a dream may run. Everything else is refused by name.
 *
 * `push`, `merge` and `rebase` are the three §10.2 forbids outright; the
 * allow-list is what makes "never merges, never pushes" a property of the
 * process rather than a habit of the prose. `gh pr create` is not git and is
 * guarded separately — opening a PR is the sanctioned output.
 */
export const ALLOWED_GIT_SUBCOMMANDS = [
  "status",
  "rev-parse",
  "symbolic-ref",
  "diff",
  "add",
  "commit",
  "checkout",
  "switch",
  "branch",
  // Undoing a discarded dream: the generator's output is untracked, so
  // `checkout -- .` alone leaves it behind. Never `-x`, so an ignored file
  // (`node_modules/`, a local `.faqir/`) is never in reach.
  "clean",
  "log",
  "remote",
];

/**
 * Flags that would undo a dream's isolation even under an allowed subcommand.
 *
 * Matched against BUNDLED short flags as well as standalone ones: `git clean -x`
 * and `git clean -fdx` do the same thing, and a guard that only sees the first
 * spelling is a guard with the second spelling as its hole.
 */
const FORBIDDEN_GIT_FLAGS = [
  {
    where: "clean",
    shown: "-x",
    match: (a) => a === "-x" || a === "--force-clean" || /^-[a-wyzA-Z]*x/.test(a),
    why: "would delete ignored files — node_modules, local caches, .faqir/",
  },
];

/**
 * Refuse a git invocation the shift is not allowed to make.
 *
 * The list is what makes "never merges, never pushes" a property of the process
 * rather than a habit of the prose: `push`, `merge`, `rebase`, `tag` and
 * `remote add` are absent, so the only way the work leaves this machine is the
 * PR a human opens. Moving HEAD back to the trunk is NOT refused here — a
 * discarded dream has to go home — because the invariant that matters is that
 * nothing is ever *committed* there, and `assertNotProtected` enforces that at
 * the commit itself, where it cannot be routed around.
 */
export function assertGitAllowed(args) {
  const subcommand = args.find((a) => !a.startsWith("-"));
  if (!ALLOWED_GIT_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(
      `Night Shift may not run 'git ${subcommand}'. Allowed: ${ALLOWED_GIT_SUBCOMMANDS.join(", ")}. ` +
        `The shift opens a PR; it never merges, pushes or rebases (§10.2).`,
    );
  }
  for (const rule of FORBIDDEN_GIT_FLAGS) {
    if (subcommand === rule.where && args.some((a) => a.startsWith("-") && rule.match(a))) {
      throw new Error(
        `Night Shift may not run 'git ${subcommand}' with ${rule.shown} (${args.join(" ")}): it ${rule.why}.`,
      );
    }
  }
  return args;
}

/**
 * `--allow-similar` overrides the distinctiveness refusal, which is the one
 * gate a theme dream exists to satisfy: §10.3 keeps a theme only when
 * "distinctiveness ≥ threshold against every shipped theme". A shift that may
 * wave it through is a shift that generates recolours all night.
 */
export function assertGenerateArgsAllowed(args) {
  if (args.includes("--allow-similar")) {
    throw new Error(
      `Night Shift may not pass --allow-similar. Distinctiveness IS the theme dream's keep ` +
        `condition (§10.3); a look-alike is a discard with a reason, not a flag.`,
    );
  }
  return args;
}
