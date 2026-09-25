// ═══════════════════════════════════════════════════════════════════════════
// The nightly runner: a worktree per run, and nothing on main [task 1.1N-02]
// ═══════════════════════════════════════════════════════════════════════════
//
// `nightly.sh` is the one piece of the shift written in shell, and shell is the
// language where an unset variable deletes a directory. So it is tested the two
// ways shell can be: parsed (`bash -n`, plus a grep for the verbs §10.2 forbids)
// and RUN, against a real but disposable git repository in a temp directory.
//
// Running it is the half that matters, because every claim the script makes is
// about git state: that the worktree is created, that the dream runs inside it,
// that the bundle is carried out before the worktree is destroyed, and that the
// branch the run started from is exactly where it was. None of that can be
// asserted by reading the file.
//
// The repository is a fake with one commit and no remote — `git worktree` is
// the only real git this file needs, and `DREAM_CMD` stands in for the agent, so
// nothing here launches Claude, Bun or a browser.

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const NIGHTLY = join(ROOT, "scripts", "dream", "nightly.sh");

const temps: string[] = [];
afterAll(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

let source: string;
beforeAll(() => {
  source = readFileSync(NIGHTLY, "utf8");
});

const git = (cwd: string, args: string[]) =>
  runSync("git", args, { cwd, encoding: "utf8", timeout: SPAWN_TIMEOUT.QUICK });

/**
 * A repository the runner can work in: `main` with one commit, a copy of the
 * script under `scripts/dream/`, and nothing else. The script finds its own
 * root with `rev-parse --show-toplevel`, so a copy in a temp repo behaves
 * exactly as the real one does in this one.
 */
function fakeRepo(): { root: string } {
  // realpath, because macOS hands out /var/… for a /private/var/… directory and
  // git reports the resolved one — comparing the two spellings fails on nothing.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "faqir-nightly-")));
  temps.push(root);
  git(root, ["init", "-b", "main", "--quiet"]);
  git(root, ["config", "user.email", "night@example.invalid"]);
  git(root, ["config", "user.name", "Night Shift"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  mkdirSync(join(root, "scripts", "dream"), { recursive: true });
  copyFileSync(NIGHTLY, join(root, "scripts", "dream", "nightly.sh"));
  writeFileSync(join(root, "tracked.txt"), "the tree the dream starts from\n");
  writeFileSync(join(root, ".gitignore"), "node_modules/\n.faqir-dreams/out/\n");
  git(root, ["add", "--all"]);
  git(root, ["commit", "--quiet", "-m", "the repository before the night"]);
  return { root };
}

/** Run the script in `root`. Never inherits stdio; always budgeted. */
function nightly(root: string, args: string[] = [], env: Record<string, string> = {}) {
  const result = runSync("bash", ["scripts/dream/nightly.sh", ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT.CLI,
    env: { ...process.env, ...env },
  });
  return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

const worktrees = (root: string) =>
  git(root, ["worktree", "list", "--porcelain"])
    .stdout.split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));

/** The worktree path the script printed, so the test asserts on the real one. */
function worktreePath(out: string): string {
  const match = /worktree:\s+(\S+)/.exec(out);
  expect(match, `no worktree path in output:\n${out}`).toBeTruthy();
  const path = match![1];
  return existsSync(path) ? realpathSync(path) : path;
}

describe("the script as text", () => {
  it("parses as bash", () => {
    const checked = runSync("bash", ["-n", NIGHTLY], { encoding: "utf8", timeout: SPAWN_TIMEOUT.QUICK });
    expect(`${checked.stderr ?? ""}`).toBe("");
    expect(checked.status).toBe(0);
  });

  it("refuses unset variables and half-failed pipelines", () => {
    expect(source).toContain("set -euo pipefail");
  });

  it("never names a git verb §10.2 forbids", () => {
    // The shift opens a branch and stops; a human merges. The guards enforce
    // that for the pipeline (`guards.mjs`), and this is the same rule for the
    // one part of the shift that is not JavaScript.
    const code = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    for (const verb of ["push", "merge", "rebase", "reset", "cherry-pick", "tag"]) {
      expect(code, verb).not.toMatch(new RegExp(`git[^\\n]*\\b${verb}\\b`));
    }
  });

  it("only ever runs worktree, branch listing and status", () => {
    const invocations = [...source.matchAll(/^\s*(?:[A-Z_]+="\$\()?git (?:-C "\$[A-Z_]+" )?([a-z-]+)/gm)].map(
      (m) => m[1],
    );
    expect(new Set(invocations)).toEqual(new Set(["rev-parse", "worktree", "branch", "status"]));
  });

  it("documents both scheduling paths §10.6 names", () => {
    expect(source).toContain("crontab");
    expect(source).toContain("launchd");
    expect(source).toContain("/schedule");
    expect(source).toContain("/faqir-dream");
  });
});

describe("--dry-run", () => {
  it("creates the worktree, removes it, and runs no dream", () => {
    const { root } = fakeRepo();
    const { status, out } = nightly(root, ["--dry-run"]);
    expect(status).toBe(0);
    expect(out).toContain("worktree added (detached at main)");
    expect(out).toContain("the dream was not run");
    expect(out).toContain("worktree removed");
    expect(existsSync(worktreePath(out))).toBe(false);
    expect(worktrees(root)).toEqual([root]);
  });

  it("leaves main exactly where it was, and the tree clean", () => {
    const { root } = fakeRepo();
    const before = git(root, ["rev-parse", "main"]).stdout.trim();
    nightly(root, ["--dry-run"]);
    expect(git(root, ["rev-parse", "main"]).stdout.trim()).toBe(before);
    expect(git(root, ["status", "--porcelain"]).stdout).toBe("");
    expect(git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim()).toBe("main");
  });

  it("prints the command it would have run, and the brief it would have asked for", () => {
    const { root } = fakeRepo();
    const { out } = nightly(root, ["--dry-run", "--brief", "arcade"]);
    expect(out).toContain("/faqir-dream arcade");
  });

  it("says there was no new branch when nothing was dreamt", () => {
    const { root } = fakeRepo();
    expect(nightly(root, ["--dry-run"]).out).toContain("no new dream branch");
  });
});

describe("a run that dreams", () => {
  it("runs the command inside the worktree, not in the repository", () => {
    const { root } = fakeRepo();
    const { out, status } = nightly(root, [], { DREAM_CMD: "pwd" });
    expect(status).toBe(0);
    expect(out).toContain(worktreePath(out));
    expect(out).toContain("dream command exited 0");
  });

  it("harvests the bundle before the worktree is removed — it is the only copy", () => {
    // The scorecard and the PNGs are gitignored, so a worktree removed with the
    // bundle still inside takes the one thing the morning review looks at.
    const { root } = fakeRepo();
    const { out } = nightly(root, [], {
      DREAM_CMD: "mkdir -p .faqir-dreams/out/arcade && echo '{\"theme\":\"arcade\"}' > .faqir-dreams/out/arcade/scorecard.json",
    });
    expect(out).toContain("bundles harvested");
    expect(out).toContain("worktree removed");
    expect(existsSync(worktreePath(out))).toBe(false);
    expect(readFileSync(join(root, ".faqir-dreams/out/arcade/scorecard.json"), "utf8")).toContain("arcade");
  });

  it("reports the branch the dream left behind, and keeps it after the worktree goes", () => {
    const { root } = fakeRepo();
    const { out } = nightly(root, [], {
      DREAM_CMD: "git checkout -q -b dream/theme-arcade && echo x > t2.txt && git add -A && git commit -q -m 'a theme'",
    });
    expect(out).toContain("tonight's branches:");
    expect(out).toContain("dream/theme-arcade");
    // The branch is in the shared .git, so removing the checkout keeps the work.
    expect(git(root, ["rev-parse", "--verify", "dream/theme-arcade"]).status).toBe(0);
    expect(existsSync(worktreePath(out))).toBe(false);
  });

  it("keeps a dirty worktree rather than deleting a discard's ledger row", () => {
    // A discarded dream deletes its branch and leaves the row uncommitted, on
    // purpose. Removing the worktree here would delete the only record of a
    // night that produced a reason.
    const { root } = fakeRepo();
    const { out } = nightly(root, [], { DREAM_CMD: "echo 'a discard row' >> tracked.txt" });
    expect(out).toContain("the worktree is dirty");
    expect(out).toContain("kept for review:");
    const worktree = worktreePath(out);
    expect(existsSync(worktree)).toBe(true);
    expect(worktrees(root)).toContain(worktree);
    // Clean up after ourselves — the repo is a temp, but the assertion is real.
    git(root, ["worktree", "remove", "--force", worktree]);
  });

  it("--keep leaves a clean worktree in place and says where", () => {
    const { root } = fakeRepo();
    const { out } = nightly(root, ["--keep"], { DREAM_CMD: "true" });
    expect(out).toContain("--keep: worktree left at");
    const worktree = worktreePath(out);
    expect(existsSync(worktree)).toBe(true);
    git(root, ["worktree", "remove", "--force", worktree]);
  });

  it("passes the dream's exit status through, and still cleans up after a failure", () => {
    const { root } = fakeRepo();
    const { status, out } = nightly(root, [], { DREAM_CMD: "exit 3" });
    expect(status).toBe(3);
    expect(out).toContain("dream command exited 3");
    expect(out).toContain("worktree removed");
    expect(worktrees(root)).toEqual([root]);
  });

  it("never leaves main or the starting tree touched, whatever the dream did", () => {
    const { root } = fakeRepo();
    const before = git(root, ["rev-parse", "main"]).stdout.trim();
    nightly(root, [], {
      DREAM_CMD: "git checkout -q -b dream/theme-x && echo y > t3.txt && git add -A && git commit -q -m x",
    });
    expect(git(root, ["rev-parse", "main"]).stdout.trim()).toBe(before);
    expect(git(root, ["status", "--porcelain"]).stdout).toBe("");
  });
});

describe("refusals", () => {
  it("refuses a base ref that does not exist, before creating anything", () => {
    const { root } = fakeRepo();
    const { status, out } = nightly(root, ["--dry-run", "--base", "nope"]);
    expect(status).toBe(1);
    expect(out).toContain("no ref 'nope'");
    expect(worktrees(root)).toEqual([root]);
  });

  it("refuses an option it does not know", () => {
    const { root } = fakeRepo();
    const { status, out } = nightly(root, ["--merge-it"]);
    expect(status).toBe(2);
    expect(out).toContain("unknown option '--merge-it'");
  });

  it("refuses a brief id that is not one, before building any command from it", () => {
    // The id is spliced into the command the dream runs; the default used to
    // reach the shell through `eval`, so a crafted id was a command.
    const { root } = fakeRepo();
    const marker = join(root, "pwned");
    for (const brief of [`x"; touch ${marker}; echo "`, "$(touch pwned)", "Arcade", "-x"]) {
      const { status, out } = nightly(root, ["--dry-run", "--brief", brief]);
      expect(status, brief).toBe(2);
      expect(out, brief).toMatch(/is not a brief id|needs a value/);
    }
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(join(root, "pwned"))).toBe(false);
    expect(worktrees(root)).toEqual([root]);
  });

  it("refuses a value flag with no value", () => {
    const { root } = fakeRepo();
    for (const flag of ["--brief", "--base", "--worktree"]) {
      const { status, out } = nightly(root, ["--dry-run", flag]);
      expect(status, flag).toBe(2);
      expect(out, flag).toContain(`${flag} needs a value`);
    }
  });

  it("runs the default dream command as an argument vector, not through eval", () => {
    // A stand-in `claude` on PATH records the argv it was given.
    const { root } = fakeRepo();
    const bin = join(root, ".bin");
    mkdirSync(bin, { recursive: true });
    const record = join(root, "argv.txt");
    writeFileSync(join(bin, "claude"), `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(record)}\n`);
    chmodSync(join(bin, "claude"), 0o755);
    const env: Record<string, string> = { PATH: `${bin}:${process.env.PATH ?? ""}` };
    const { status } = nightly(root, ["--brief", "arcade"], { ...env, DREAM_CMD: "" });
    expect(status).toBe(0);
    expect(readFileSync(record, "utf8").split("\n").filter(Boolean)).toEqual([
      "-p",
      "/faqir-dream arcade",
      "--permission-mode",
      "acceptEdits",
    ]);
    expect(source).toContain('"${DREAM_ARGV[@]}"');
  });

  it("prints its own header for --help and does nothing", () => {
    const { root } = fakeRepo();
    const { status, out } = nightly(root, ["--help"]);
    expect(status).toBe(0);
    expect(out).toContain("The nightly runner");
    expect(worktrees(root)).toEqual([root]);
  });
});

// The runner symlinks the checkout's node_modules into the dream worktree. A
// `node_modules/` pattern matches directories only, so git reported the symlink
// as untracked: every dream refused to start on a "dirty" tree, and every
// discard was kept for the same reason. The ignore rule must cover a symlink.
describe("the repository's ignore rules", () => {
  it("ignore a node_modules symlink, not just a node_modules directory", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "faqir-ignore-")));
    temps.push(root);
    git(root, ["init", "-b", "main", "--quiet"]);
    copyFileSync(join(ROOT, ".gitignore"), join(root, ".gitignore"));
    git(root, ["add", ".gitignore"]);
    git(root, ["-c", "user.email=n@example.invalid", "-c", "user.name=N", "-c", "commit.gpgsign=false", "commit", "-qm", "init"]);
    mkdirSync(join(root, "elsewhere"));
    writeFileSync(join(root, "elsewhere", ".keep"), "");
    git(root, ["add", "elsewhere/.keep"]);
    git(root, ["-c", "user.email=n@example.invalid", "-c", "user.name=N", "-c", "commit.gpgsign=false", "commit", "-qm", "dir"]);
    symlinkSync(join(root, "elsewhere"), join(root, "node_modules"));
    expect(git(root, ["status", "--porcelain"]).stdout).toBe("");
  });
});
