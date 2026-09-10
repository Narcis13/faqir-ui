#!/usr/bin/env node
/**
 * The release path (task 1.0-04, FAQIR-1.0-READINESS Wave 4).
 *
 * What changed, and why
 * ---------------------
 * The previous script bumped one package, published one package, and scored 1 of
 * 8 mechanics against its own plan task. It also tagged, then published, then
 * pushed — so a rejected push left a version live on npm that existed in no
 * pushed commit. Six packages now move in lockstep, the push happens before the
 * publish, and `--dry-run` is a real rehearsal rather than an error message.
 *
 * The larger change is that **this script is the CI**. The GitHub Actions
 * workflows were removed in 671941e (no Actions minutes on the free plan), which
 * left the repository with no automated gate of any kind. Every `check:*` script
 * that used to run on a pull request now runs here, at the one moment it matters
 * most and where it cannot be skipped by pushing to a branch. `--skip-preflight`
 * exists only for finishing a half-published release, and says so loudly.
 *
 * What it deliberately does not do
 * --------------------------------
 *   - **`--provenance`.** It needs an OIDC token from a CI provider. No Actions
 *     workflow means no `id-token: write` and nothing to attest with. A real gap,
 *     and a consequence of the CI decision rather than an oversight.
 *   - **The visual, print and a11y suites.** They baseline in a pinned Linux
 *     container because font rasterisation is machine-specific; a macOS run
 *     cannot gate anything. `docs/release-checklist.md` carries them as manual
 *     steps, which is the honest place for a check that cannot be automated here.
 *
 * Usage
 * -----
 *     node scripts/release.mjs <patch|minor|major|pre*|x.y.z> [options]
 *
 *     --dry-run          Rehearse everything, restore every tracked file, exit.
 *     --skip-preflight   Skip the gate run. For retrying a partial publish only.
 *     --otp=<code>       npm one-time password, passed to every publish.
 *     --branch=<name>    Release from a branch other than `main`.
 *     --no-github        Skip `gh release create`.
 *     --yes              Do not pause for confirmation before publishing.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_TIMEOUT_MS } from "./spawn.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(scriptDir, "..");

// ── What ships ──────────────────────────────────────────────────────────────

/**
 * The six published packages, in publish order. The root CLI is last on purpose:
 * it is the one people actually install, so if anything ahead of it fails, the
 * name that gets advertised has not moved.
 *
 * `dist` is the artifact that must exist and be non-empty before publishing —
 * the check `check:package` never made. `npm pack --dry-run` will happily pack
 * 365 files whose `bin` cannot resolve, which was proven by deleting `dist/`
 * entirely and watching it exit 0.
 */
const PACKAGES = [
  { name: "@faqir-ui/core", dir: "packages/core", dist: "packages/core/dist/faqir-core.mjs" },
  { name: "@faqir-ui/react", dir: "packages/react", dist: "packages/react/dist/index.js" },
  { name: "@faqir-ui/vue", dir: "packages/vue", dist: "packages/vue/dist/index.js" },
  { name: "@faqir-ui/forms", dir: "packages/forms", dist: "packages/forms/src/index.js" },
  { name: "@faqir-ui/mcp", dir: "packages/mcp", dist: "packages/mcp/dist/index.mjs" },
  { name: "faqir-ui-cli", dir: ".", dist: "dist/faqir.mjs" },
];

/** Every file carrying the release version. Rewritten in lockstep. */
const VERSION_FILES = [
  "package.json",
  ...PACKAGES.filter((p) => p.dir !== ".").map((p) => `${p.dir}/package.json`),
];
const CLI_VERSION_FILE = "src/version.ts";

/**
 * The gates, in the order a failure is cheapest to diagnose. `test` is last
 * because it is the slowest and the most likely to be a genuine regression
 * rather than a stale artifact; the `check:*` drift gates ahead of it fail in
 * under a second each and usually just mean "run the generator".
 */
const PREFLIGHT = [
  ["typecheck", "TypeScript across the CLI, both bindings, forms and mcp"],
  ["check:registry-index", "registry-index.json matches the registry"],
  ["check:manifest-api", "every controller's @ui:provides is in its manifest"],
  ["check:core-package", "packages/core/dist and cdn.json's 15 SRI hashes"],
  ["check:audit-browser", "site/lib/faqir-audit.js matches src/audit/browser.ts"],
  ["check:schema-refs", "every manifest carries a current $schema"],
  ["check:bindings", "the generated Vue and React components are current"],
  ["check:skill", "the shipped faqir-creator skill matches its generator"],
  ["check:docs", "the generated documentation site is current"],
  ["audit:registry", "the registry audits clean against its own rules"],
  ["size", "the engine and plugin gzip budgets"],
  ["test", "the full suite"],
];

/**
 * Builds, in dependency order. `build:core` first because it injects
 * `Faqir.version` into the assembled engine, and `build:core-package` consumes
 * that engine to produce `packages/core/dist` plus the SRI hashes in `cdn.json`
 * — hash a stale engine and every CDN snippet on the docs site fails closed.
 */
const BUILDS = [
  ["build:core", "assemble the engine with the new version baked in"],
  ["build:cli", "dist/faqir.mjs"],
  ["build:core-package", "packages/core/dist + cdn.json + SRI"],
  ["build:bindings", "packages/{react,vue}/dist"],
  ["build:mcp", "packages/mcp/dist"],
];

const VALID_BUMPS = new Set([
  "patch",
  "minor",
  "major",
  "prepatch",
  "preminor",
  "premajor",
  "prerelease",
]);

// ── Argument parsing ────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flags = {
  dryRun: argv.includes("--dry-run"),
  skipPreflight: argv.includes("--skip-preflight"),
  yes: argv.includes("--yes") || argv.includes("-y"),
  github: !argv.includes("--no-github"),
  otp: valueOf("--otp"),
  branch: valueOf("--branch") || "main",
};
const positional = argv.filter((a) => !a.startsWith("-"));
const target = positional[0];

function valueOf(name) {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = argv.indexOf(name);
  return idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith("-") ? argv[idx + 1] : "";
}

/** Validate the target. Deferred into `main()` so importing this file is inert. */
function validateTarget() {
  if (!target || argv.includes("--help") || argv.includes("-h")) {
    printUsage(target ? 0 : 1);
  }
  if (!isExplicitVersion(target) && !VALID_BUMPS.has(target)) {
    fail(
      `Unsupported version bump "${target}".\n` +
        `Expected one of: ${[...VALID_BUMPS].join(", ")} — or an explicit x.y.z.`,
    );
  }
}

// ── Output ──────────────────────────────────────────────────────────────────

const DRY = flags.dryRun ? "[dry-run] " : "";
let step = 0;

function heading(text) {
  step += 1;
  process.stdout.write(`\n${DRY}${step}. ${text}\n${"─".repeat(60)}\n`);
}
function info(text) {
  process.stdout.write(`   ${text}\n`);
}
function ok(text) {
  process.stdout.write(`   ✓ ${text}\n`);
}
function warn(text) {
  process.stdout.write(`   ! ${text}\n`);
}
function fail(message) {
  process.stderr.write(`\nRelease aborted: ${message}\n`);
  process.exit(1);
}
function printUsage(exitCode) {
  process.stdout.write(
    "Usage: node scripts/release.mjs <patch|minor|major|prepatch|preminor|premajor|prerelease|x.y.z> [options]\n\n" +
      "  --dry-run          rehearse everything, restore every file, publish nothing\n" +
      "  --skip-preflight   skip the gate run (only to finish a partial publish)\n" +
      "  --otp=<code>       npm one-time password\n" +
      "  --branch=<name>    release from a branch other than main\n" +
      "  --no-github        skip the GitHub release\n" +
      "  --yes              do not pause before publishing\n\n" +
      "See docs/release-checklist.md.\n",
  );
  process.exit(exitCode);
}

// ── Shell helpers ───────────────────────────────────────────────────────────

/** Capture a command's stdout. Used for git queries — never for release steps. */
function capture(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: BUILD_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  if (result.error) {
    if (allowFailure) return null;
    throw result.error;
  }
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${result.stderr ?? ""}`);
  }
  return (result.stdout ?? "").trim();
}

/**
 * Run a release step on inherited stdio.
 *
 * spawn-timeout-exempt: `npm publish` blocks on a 2FA prompt and `git push` on a
 * credential helper, both interactive. A wall-clock budget here would kill a
 * publish mid-flight, which is strictly worse than waiting for a human. The
 * preflight steps are separately budgeted below.
 */
function run(command, args, { cwd = ROOT } = {}) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

/** Run an npm script under a wall-clock budget. Returns true on exit 0. */
function runScript(script, { budgetMs = BUILD_TIMEOUT_MS } = {}) {
  const result = spawnSync("npm", ["run", "--silent", script], {
    cwd: ROOT,
    stdio: "inherit",
    // Spelled out rather than shorthand: `tests/meta/spawn-timeouts.test.ts`
    // scans for a literal `timeout:` in the options, and a gate that a valid
    // shorthand slips past is not a gate.
    timeout: budgetMs,
    killSignal: "SIGKILL",
  });
  if (result.error && result.error.code === "ETIMEDOUT") {
    fail(`\`npm run ${script}\` exceeded ${Math.round(budgetMs / 1000)}s and was killed.`);
  }
  return result.status === 0;
}

function readJSON(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

// ── Version arithmetic ──────────────────────────────────────────────────────

/** Does this argument name a version outright, rather than a bump keyword? */
export function isExplicitVersion(arg) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(arg);
}

/**
 * Compute the next version. Implemented here rather than shelling out to
 * `npm version` because that command wants to own the git side too, and the git
 * side is the part this script most needed to change.
 *
 * Exported and unit-tested (`tests/build/release.test.ts`) because it is the one
 * piece of this file with no I/O — and because the number it returns is the
 * thing that becomes permanent the moment npm accepts it.
 */
export function nextVersion(current, bump) {
  if (isExplicitVersion(bump)) return bump;

  const parsed = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(current);
  if (!parsed) throw new Error(`package.json version "${current}" is not semver`);
  const [, major, minor, patch, pre] = parsed;
  const n = { major: Number(major), minor: Number(minor), patch: Number(patch) };

  const release = (kind) => {
    if (kind === "major") return `${n.major + 1}.0.0`;
    if (kind === "minor") return `${n.major}.${n.minor + 1}.0`;
    // A patch bump off a prerelease drops the prerelease rather than adding to
    // it: 1.0.0-rc.1 → 1.0.0, which is what "release it" means.
    if (pre) return `${n.major}.${n.minor}.${n.patch}`;
    return `${n.major}.${n.minor}.${n.patch + 1}`;
  };

  switch (bump) {
    case "major":
    case "minor":
    case "patch":
      return release(bump);
    case "premajor":
      return `${n.major + 1}.0.0-0`;
    case "preminor":
      return `${n.major}.${n.minor + 1}.0-0`;
    case "prepatch":
      return `${n.major}.${n.minor}.${n.patch + 1}-0`;
    case "prerelease": {
      if (!pre) return `${n.major}.${n.minor}.${n.patch + 1}-0`;
      const parts = pre.split(".");
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) parts[parts.length - 1] = String(Number(last) + 1);
      else parts.push("0");
      return `${n.major}.${n.minor}.${n.patch}-${parts.join(".")}`;
    }
    default:
      throw new Error(`unreachable bump "${bump}"`);
  }
}

/**
 * Rewrite the `version` field of one package.json, preserving formatting.
 * Returns true if the file changed, false if it already declared `version`.
 *
 * The distinction matters because "already correct" and "the rewrite failed" are
 * not the same thing, and collapsing them made the first publish impossible: the
 * 1.0 prerelease commit put 1.0.0 into all six package.json files, so
 * `release.mjs 1.0.0` produced a no-op replace and aborted with "failed to
 * rewrite the version" — on the one release where nothing needed rewriting. A
 * missing `version` field is still a hard failure; an unchanged one is not.
 */
function writePackageVersion(rel, version) {
  const path = join(ROOT, rel);
  const text = readFileSync(path, "utf8");
  const current = /^\s*"version":\s*"([^"]*)"/m.exec(text);
  if (!current) throw new Error(`${rel} declares no "version" field`);
  if (current[1] === version) return false;
  writeFileSync(path, text.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`));
  return true;
}

/**
 * Rewrite `VERSION` in src/version.ts — the CLI's own constant.
 * Returns true if the file changed. See `writePackageVersion` on why false is
 * not an error.
 */
function writeCliVersion(version) {
  const path = join(ROOT, CLI_VERSION_FILE);
  const text = readFileSync(path, "utf8");
  const current = /export const VERSION = "([^"]*)";/.exec(text);
  if (!current) throw new Error(`${CLI_VERSION_FILE} declares no VERSION constant`);
  if (current[1] === version) return false;
  writeFileSync(
    path,
    text.replace(/export const VERSION = "[^"]*";/, `export const VERSION = "${version}";`),
  );
  return true;
}

// ── 1. Repository guards ────────────────────────────────────────────────────

function guards() {
  heading("Repository guards");

  const status = capture("git", ["status", "--short"]);
  if (status) {
    fail(
      "the worktree is not clean. A release commit must contain the release and\n" +
        "nothing else — otherwise the tag describes work nobody reviewed.\n\n" +
        status,
    );
  }
  ok("worktree is clean");

  const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== flags.branch) {
    fail(
      `on branch "${branch}", expected "${flags.branch}".\n` +
        "The old script pushed to whatever branch happened to be checked out.\n" +
        "Pass --branch to override deliberately.",
    );
  }
  ok(`on ${branch}`);

  const remote = capture("git", ["rev-parse", "--verify", `origin/${branch}`], {
    allowFailure: true,
  });
  if (!remote) {
    warn(`origin/${branch} not found locally — skipping the sync check`);
  } else {
    capture("git", ["fetch", "origin", branch, "--quiet"], { allowFailure: true });
    const ahead = capture("git", ["rev-list", "--count", `origin/${branch}..HEAD`]);
    const behind = capture("git", ["rev-list", "--count", `HEAD..origin/${branch}`]);
    if (behind !== "0") {
      fail(`HEAD is ${behind} commit(s) behind origin/${branch}. Pull first.`);
    }
    if (ahead !== "0") {
      warn(`HEAD is ${ahead} commit(s) ahead of origin/${branch} — they will be pushed too`);
    } else {
      ok(`in sync with origin/${branch}`);
    }
  }
}

/**
 * The canonical spec URLs are git refs (`src/canonical.ts`), which is what makes
 * them resolve at all now that no domain backs them. That only holds if the ref
 * exists: shipping a schema whose `$id` and `amendment_policy` point at a tag
 * nobody created reproduces the exact dead-URL problem in a new place.
 */
function assertSpecRefExists(version) {
  const source = readFileSync(join(ROOT, "src/canonical.ts"), "utf8");
  const match = /export const SPEC_REF = "([^"]+)"/.exec(source);
  if (!match) {
    warn("src/canonical.ts declares no SPEC_REF — skipping the canonical-URL check");
    return;
  }
  const ref = match[1];
  if (ref === `v${version}`) {
    ok(`canonical spec ref ${ref} is the tag this release creates`);
    return;
  }
  const exists = capture("git", ["rev-parse", "--verify", `refs/tags/${ref}`], {
    allowFailure: true,
  });
  if (!exists) {
    fail(
      `the frozen spec's canonical URLs point at tag "${ref}", which does not exist.\n` +
        `Every URL in SPEC-1.0 §10 and the schema's own $id would 404.\n` +
        `Create the tag, or update SPEC_REF in src/canonical.ts.`,
    );
  }
  ok(`canonical spec ref ${ref} exists`);
}

// ── 2. Preflight ────────────────────────────────────────────────────────────

function preflight() {
  heading("Preflight gates (there is no CI — these are it)");

  if (flags.skipPreflight) {
    warn("--skip-preflight: NOTHING below was checked.");
    warn("This is for finishing a partial publish. Any other use ships unverified.");
    return;
  }

  const failures = [];
  for (const [script, what] of PREFLIGHT) {
    info(`${script} — ${what}`);
    // The suite is the long pole and spawns subprocesses of its own; give it a
    // budget of its own rather than the shared build budget.
    const budgetMs = script === "test" ? 20 * 60 * 1000 : BUILD_TIMEOUT_MS;
    if (runScript(script, { budgetMs })) ok(script);
    else {
      failures.push(script);
      process.stdout.write(`   ✗ ${script}\n`);
    }
  }

  if (failures.length > 0) {
    fail(
      `${failures.length} gate(s) failed: ${failures.join(", ")}.\n` +
        "A `check:*` failure usually means a generated artifact is stale — run the\n" +
        "matching `build:`/`gen:` script and commit the result.",
    );
  }
  ok(`all ${PREFLIGHT.length} gates green`);
}

// ── 3-4. Version and builds ─────────────────────────────────────────────────

/**
 * Stamp the release version across every package, and return the set of files
 * that actually changed.
 *
 * That set is what `commitAndPush` asserts on. Asserting on the whole list
 * instead would fail the first publish and every retry of a partial one, where
 * the correct number is already on disk; asserting on nothing would let a
 * silently-failed bump through. The files not in the set are verified anyway —
 * `verifyArtifacts` reads each package.json back and compares.
 */
function applyVersion(version) {
  heading(`Version — ${version}, in lockstep across ${VERSION_FILES.length} packages`);
  const rewritten = new Set();
  for (const rel of VERSION_FILES) {
    if (writePackageVersion(rel, version)) {
      rewritten.add(rel);
      ok(rel);
    } else {
      ok(`${rel} — already at ${version}`);
    }
  }
  if (writeCliVersion(version)) {
    rewritten.add(CLI_VERSION_FILE);
    ok(CLI_VERSION_FILE);
  } else {
    ok(`${CLI_VERSION_FILE} — already at ${version}`);
  }
  return rewritten;
}

function build() {
  heading("Ordered builds");
  for (const [script, what] of BUILDS) {
    info(`${script} — ${what}`);
    if (!runScript(script)) fail(`\`npm run ${script}\` failed.`);
  }
  ok(`${BUILDS.length} builds complete`);
}

// ── 5. Artifact verification ────────────────────────────────────────────────

function verifyArtifacts(version) {
  heading("Artifact verification");

  for (const pkg of PACKAGES) {
    const path = join(ROOT, pkg.dist);
    if (!existsSync(path) || statSync(path).size === 0) {
      fail(
        `${pkg.name} has no usable artifact at ${pkg.dist}.\n` +
          "This is the check `npm pack --dry-run` never performed: it packs a\n" +
          "missing dist without complaint and exits 0.",
      );
    }
    const declared = readJSON(join(pkg.dir, "package.json")).version;
    if (declared !== version) fail(`${pkg.name} declares ${declared}, expected ${version}`);
    ok(`${pkg.name} — ${pkg.dist} (${(statSync(path).size / 1024).toFixed(1)} KB)`);
  }

  // The engine's runtime version. It is injected by build:core; if that seam
  // ever breaks, `Faqir.version` silently reports something else — which is
  // exactly how it came to report 0.1.0 from a package versioned 0.2.4.
  const engine = readFileSync(join(ROOT, "registry/core/faqir-core.js"), "utf8");
  const injected = /version:\s*'([^']*)',\s*\/\/ @faqir:version/.exec(engine);
  if (!injected) fail("registry/core/faqir-core.js carries no @faqir:version marker");
  if (injected[1] !== version) {
    fail(`Faqir.version reports ${injected[1]}, expected ${version}`);
  }
  ok(`Faqir.version reports ${version}`);

  // The CDN snippets on the docs site embed these hashes as `integrity="..."`.
  // SRI is fail-closed: a non-matching hash means the browser refuses to execute
  // the resource at all — no CSS, no engine, a blank page and one console line.
  const cdn = readJSON("packages/core/cdn.json");
  if (cdn.version !== version) fail(`cdn.json is at ${cdn.version}, expected ${version}`);
  if (!cdn.base.includes(`@${version}/`)) fail(`cdn.json's base URL is not at ${version}`);
  ok(`cdn.json — ${Object.keys(cdn.integrity).length} SRI hashes at ${version}`);

  packedCliSmoke(version);
}

/**
 * Pack the CLI, install the tarball into a temp directory, and run it **under
 * `node`** — the interpreter `bin/faqir` actually declares. The suite runs under
 * Bun, which is how a `--json` truncation on all 22 commands survived to a
 * release audit: the file guarding that contract spawned `process.execPath`,
 * which under `bun test` is Bun, whose stdout is synchronous.
 */
function packedCliSmoke(version) {
  info("packed-tarball smoke, under node");
  const dir = mkdtempSync(join(tmpdir(), "faqir-release-"));
  try {
    const packed = capture("npm", ["pack", "--pack-destination", dir, "--silent"]);
    const tarball = join(dir, packed.split("\n").pop().trim());
    if (!existsSync(tarball)) fail(`npm pack produced no tarball (looked for ${tarball})`);

    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "smoke", private: true }));
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent", tarball], {
      cwd: dir,
      stdio: "pipe",
      timeout: BUILD_TIMEOUT_MS,
    });

    const bin = join(dir, "node_modules", ".bin", "faqir");
    if (!existsSync(bin)) fail("the installed tarball has no `faqir` bin — the `bin` map is wrong");

    const reported = execFileSync(process.execPath, [bin, "--version"], {
      cwd: dir,
      encoding: "utf8",
      timeout: BUILD_TIMEOUT_MS,
    }).trim();
    if (!reported.includes(version)) {
      fail(`the installed CLI reports "${reported}", expected ${version}`);
    }
    ok(`installed tarball runs under node ${process.versions.node} and reports ${version}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── 6-8. Publish ────────────────────────────────────────────────────────────

function commitAndPush(version, rewritten) {
  heading("Commit, tag, push");

  // `-u` rather than a hand-written path list: the worktree was verified clean
  // in step 1, so every tracked modification now present is release output by
  // construction — the version bump, the reassembled engine, `cdn.json` and its
  // SRI hashes. A fixed list silently omits whatever a build starts touching
  // next, and leaves the omission behind as a dirty worktree nobody reads.
  // `-u` cannot sweep in untracked files, so there is nothing else it can catch.
  run("git", ["add", "-u"]);

  const staged = capture("git", ["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
  // Assert on the files this run rewrote, not on all of them. A version file
  // that already carried the release number has nothing to stage — and
  // `verifyArtifacts` has already read it back and confirmed the number.
  for (const rel of rewritten) {
    if (!staged.includes(rel)) fail(`${rel} is not in the release commit — the bump did not apply`);
  }

  if (staged.length === 0) {
    // Every tracked file already matches what the builds produce: the version
    // was committed earlier and the artifacts are reproducible. Tag HEAD as it
    // stands rather than manufacturing an empty commit to tag.
    warn(`nothing to commit — HEAD already contains v${version} exactly`);
  } else {
    info(`${staged.length} file(s) in the release commit:`);
    for (const rel of staged) info(`    ${rel}`);
    run("git", ["commit", "-m", `release: v${version}`]);
    ok(`committed release: v${version}`);
  }

  // An existing tag is only acceptable if it names the commit being released —
  // which is the shape of a retry after a publish failed partway. A tag pointing
  // anywhere else describes the wrong code, so stop rather than force it over.
  const tag = `v${version}`;
  const tagged = capture("git", ["rev-list", "-n", "1", tag], { allowFailure: true });
  if (!tagged) {
    run("git", ["tag", "-a", tag, "-m", tag]);
    ok(`tagged ${tag}`);
  } else if (tagged === capture("git", ["rev-parse", "HEAD"])) {
    ok(`${tag} already points at HEAD — reusing it`);
  } else {
    fail(
      `tag ${tag} already exists and points at ${tagged.slice(0, 8)}, not HEAD.\n` +
        "It describes different code than the one about to be published. Delete\n" +
        "it deliberately, or release a different version.",
    );
  }

  // Push BEFORE publish. The old order was tag → publish → push, so a rejected
  // push left a version live on npm that existed in no pushed commit — and npm
  // versions cannot be reused once burnt.
  run("git", ["push", "origin", flags.branch]);
  run("git", ["push", "origin", tag]);
  ok("pushed commit and tag — npm is now the only thing that can diverge");
}

function publish(version) {
  heading("Publish");

  const published = [];
  for (const pkg of PACKAGES) {
    const args = ["publish", "--access", "public"];
    if (flags.otp) args.push(`--otp=${flags.otp}`);
    // No --provenance: it needs an OIDC token from a CI provider, and there is
    // no workflow to mint one. See docs/release-checklist.md.
    try {
      run("npm", args, { cwd: join(ROOT, pkg.dir) });
      published.push(pkg.name);
      ok(`${pkg.name}@${version}`);
    } catch (error) {
      process.stderr.write(
        `\n✗ ${pkg.name} failed to publish.\n\n` +
          `  Published so far: ${published.length > 0 ? published.join(", ") : "(none)"}\n` +
          `  Not published:    ${PACKAGES.slice(published.length)
            .map((p) => p.name)
            .join(", ")}\n\n` +
          "  The commit and tag are already pushed, so git describes this release\n" +
          "  correctly whatever npm did. Do NOT un-publish — a burnt version number\n" +
          "  can never be reused. Finish by hand:\n\n" +
          PACKAGES.slice(published.length)
            .map((p) =>
              p.dir === "." ? "    npm publish" : `    npm publish --workspace ${p.name}`,
            )
            .join("\n") +
          "\n\n  See docs/release-checklist.md § If a publish fails partway.\n",
      );
      throw error;
    }
  }
  return published;
}

function githubRelease(version) {
  heading("GitHub release");

  if (!flags.github) {
    info("skipped (--no-github)");
    return;
  }
  const gh = capture("gh", ["--version"], { allowFailure: true });
  if (!gh) {
    warn("`gh` is not installed — create the release by hand:");
    info(`gh release create v${version} --generate-notes`);
    return;
  }

  const previous = capture("git", ["describe", "--tags", "--abbrev=0", `v${version}^`], {
    allowFailure: true,
  });
  const notes =
    `Six packages published at ${version}, in lockstep.\n\n` +
    PACKAGES.map((p) => `- \`${p.name}@${version}\``).join("\n") +
    "\n\n**No npm provenance attestation.** It requires an OIDC token from a CI " +
    "provider, and this repository runs no CI workflows. Verify the artifacts " +
    "against this tag instead.\n" +
    (previous ? `\nChanges since ${previous}.\n` : "");

  const args = ["release", "create", `v${version}`, "--title", `v${version}`, "--notes", notes];
  if (previous) args.push("--generate-notes");
  try {
    run("gh", args);
    ok(`released v${version}`);
  } catch {
    warn("`gh release create` failed — the npm publish and the git tag both stand.");
    info(`Retry with: gh release create v${version} --generate-notes`);
  }
}

function confirm(version) {
  if (flags.yes || flags.dryRun) return;
  heading("Confirm");
  info(`About to publish ${PACKAGES.length} packages at ${version} — this cannot be undone.`);
  info("npm versions are permanent: un-publishing burns the number forever.");
  info("");
  info("Press Ctrl-C to abort. Continuing in 10 seconds…");
  // A deliberate pause rather than a prompt: the script runs on inherited stdio
  // and a readline prompt here fights with npm's own OTP prompt later.
  execFileSync(process.execPath, ["-e", "setTimeout(()=>{},10000)"], { stdio: "ignore" });
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  validateTarget();

  const current = readJSON("package.json").version;
  const version = nextVersion(current, target);

  process.stdout.write(
    `\n${DRY}Releasing faqir-ui-cli and 5 workspace packages\n` +
      `  ${current} → ${version}\n` +
      (flags.dryRun ? "  Nothing will be committed, tagged or published.\n" : ""),
  );

  let restoreNeeded = false;

  try {
    guards();
    assertSpecRefExists(version);
    preflight();

    const rewritten = applyVersion(version);
    restoreNeeded = true;
    build();
    verifyArtifacts(version);

    if (flags.dryRun) {
      heading("Restore");
      // The worktree was verified clean at the start, so this is exact: it undoes
      // the version bump and every generated artifact the builds rewrote, and
      // touches nothing else. Untracked build output under dist/ is left alone.
      run("git", ["checkout", "--", "."]);
      restoreNeeded = false;
      ok("every tracked file restored to HEAD");

      process.stdout.write(
        `\n${DRY}Rehearsal complete. ${version} is ready to release.\n` +
          `  Run without --dry-run to publish.\n`,
      );
      return;
    }

    confirm(version);
    commitAndPush(version, rewritten);
    restoreNeeded = false;
    publish(version);
    githubRelease(version);

    process.stdout.write(
      `\nReleased v${version} — ${PACKAGES.length} packages on npm, tag pushed.\n` +
        `  Post-release checks: docs/release-checklist.md § After\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\nRelease failed: ${message}\n`);

    if (restoreNeeded) {
      process.stderr.write(
        "\nThe version bump and builds were applied but nothing was committed.\n" +
          "Restore with:  git checkout -- .\n",
      );
    }
    process.exit(1);
  }
}

// Only when run directly. Importing this file — which `tests/build/release.test.ts`
// does, to unit-test the version arithmetic — must never start a release.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
