// ═══════════════════════════════════════════════════════════════════════════
// The release path                                          [1.0-04, Wave 4]
// ═══════════════════════════════════════════════════════════════════════════
//
// Two things are tested here, and the second is the one that matters.
//
// **The version arithmetic**, because the number it returns becomes permanent
// the moment npm accepts it — a version cannot be reused after it is published,
// and un-publishing burns it rather than freeing it. There is no second chance
// to get `1.0.0` right.
//
// **The script's declared shape**, because `scripts/release.mjs` is now the only
// automated gate this repository has. The GitHub Actions workflows were removed
// in `671941e`, so every `check:*` that used to run on a pull request runs there
// or nowhere. A gate list that quietly loses an entry is indistinguishable from
// no gate at all, so the list is asserted against `package.json`'s own scripts:
// a preflight step naming a script that does not exist would otherwise fail only
// during a release, which is the worst possible moment to discover it.

import { describe, expect, it } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUN_VERSION_FILE,
  CLI_VERSION_FILE,
  PACKAGES,
  PREFLIGHT,
  VERSION_FILES,
  checkBunVersion,
  isExplicitVersion,
  nextVersion,
  parseReleaseArgs,
  stampVersion,
} from "../../scripts/release.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = readFileSync(join(ROOT, "scripts/release.mjs"), "utf8");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  version: string;
  scripts: Record<string, string>;
};

describe("version arithmetic", () => {
  it("bumps the three release channels", () => {
    expect(nextVersion("1.0.0", "patch")).toBe("1.0.1");
    expect(nextVersion("1.0.0", "minor")).toBe("1.1.0");
    expect(nextVersion("1.0.0", "major")).toBe("2.0.0");
    expect(nextVersion("1.4.9", "minor")).toBe("1.5.0");
    expect(nextVersion("0.2.4", "major")).toBe("1.0.0");
  });

  it("a patch off a prerelease releases it rather than extending it", () => {
    // `1.0.0-rc.3` + patch is `1.0.0`, not `1.0.1`. The prerelease was already
    // aiming at 1.0.0; "release it" must not skip the number it was rehearsing.
    expect(nextVersion("1.0.0-rc.3", "patch")).toBe("1.0.0");
    expect(nextVersion("1.0.0-0", "patch")).toBe("1.0.0");
  });

  it("opens and advances a prerelease line", () => {
    expect(nextVersion("1.0.0", "preminor")).toBe("1.1.0-0");
    expect(nextVersion("1.0.0", "premajor")).toBe("2.0.0-0");
    expect(nextVersion("1.0.0", "prepatch")).toBe("1.0.1-0");
    expect(nextVersion("1.1.0-0", "prerelease")).toBe("1.1.0-1");
    expect(nextVersion("1.1.0-rc.1", "prerelease")).toBe("1.1.0-rc.2");
    expect(nextVersion("1.1.0-rc", "prerelease")).toBe("1.1.0-rc.0");
    // No prerelease to advance: open one on the next patch.
    expect(nextVersion("1.0.0", "prerelease")).toBe("1.0.1-0");
  });

  it("takes an explicit version verbatim", () => {
    expect(nextVersion("0.2.4", "1.0.0")).toBe("1.0.0");
    expect(nextVersion("1.0.0", "2.0.0-beta.1")).toBe("2.0.0-beta.1");
    expect(isExplicitVersion("1.0.0")).toBe(true);
    expect(isExplicitVersion("1.0.0-rc.1")).toBe(true);
    expect(isExplicitVersion("minor")).toBe(false);
    expect(isExplicitVersion("v1.0.0")).toBe(false);
    expect(isExplicitVersion("1.0")).toBe(false);
  });

  it("refuses a version it cannot parse rather than guessing", () => {
    expect(() => nextVersion("not-a-version", "patch")).toThrow(/semver/);
  });
});

describe("argument parsing", () => {
  it("a value flag consumes its value instead of leaving it as the target", () => {
    // The defect: `--otp 123456 patch` made `123456` the version target, because
    // every argument not starting with `-` was treated as positional.
    const parsed = parseReleaseArgs(["--otp", "123456", "patch"]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.target).toBe("patch");
    expect(parsed.flags.otp).toBe("123456");

    const branch = parseReleaseArgs(["minor", "--branch", "release/1.1", "--dry-run"]);
    expect(branch.target).toBe("minor");
    expect(branch.flags.branch).toBe("release/1.1");
    expect(branch.flags.dryRun).toBe(true);
  });

  it("accepts the --flag=value spelling too", () => {
    const parsed = parseReleaseArgs(["--otp=654321", "1.1.0", "--yes", "--no-github"]);
    expect(parsed.target).toBe("1.1.0");
    expect(parsed.flags.otp).toBe("654321");
    expect(parsed.flags.yes).toBe(true);
    expect(parsed.flags.github).toBe(false);
  });

  it("refuses what it cannot interpret rather than guessing", () => {
    expect(parseReleaseArgs(["patch", "--otp"]).errors).toEqual(["--otp needs a value"]);
    expect(parseReleaseArgs(["--otp", "--dry-run", "patch"]).errors).toEqual(["--otp needs a value"]);
    expect(parseReleaseArgs(["patch", "--bogus"]).errors[0]).toContain('unknown option "--bogus"');
    expect(parseReleaseArgs(["patch", "minor"]).errors[0]).toContain("one version target");
  });
});

describe("a dry-run version bump reaches every version file", () => {
  it("propagates 1.1.0 to all seven package.json files and src/version.ts", () => {
    // Runs the same function `applyVersion` calls, against a copy of the real
    // version files — so a package added to PACKAGES without its package.json in
    // the lockstep set, or a version.ts whose literal stops matching, fails here
    // instead of mid-release.
    const tmp = mkdtempSync(join(tmpdir(), "faqir-release-stamp-"));
    try {
      for (const rel of [...VERSION_FILES, CLI_VERSION_FILE]) {
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        cpSync(join(ROOT, rel), join(tmp, rel));
      }
      stampVersion("1.1.0", tmp);

      expect(VERSION_FILES.length).toBe(7);
      expect(VERSION_FILES.length).toBe(PACKAGES.length);
      for (const rel of VERSION_FILES) {
        const pkg = JSON.parse(readFileSync(join(tmp, rel), "utf8"));
        expect(pkg.version, rel).toBe("1.1.0");
      }
      expect(readFileSync(join(tmp, CLI_VERSION_FILE), "utf8")).toContain(
        'export const VERSION = "1.1.0";',
      );

      // A second stamp at the same version is a no-op, not a failure.
      const again = stampVersion("1.1.0", tmp);
      expect([...again.rewritten]).toEqual([]);
      expect(again.unchanged.length).toBe(8);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("the package list includes rules and the preflight includes its gate", () => {
    expect(PACKAGES.map((p: { name: string }) => p.name)).toContain("@faqir-ui/rules");
    const gates = PREFLIGHT.map(([script]: string[]) => script);
    expect(gates).toContain("check:rules-plugin");
    expect(gates).toContain("check:theme-docs");
  });

  it("no stale package count survives in the script", () => {
    // The count was written out by hand in five places — including the GitHub
    // release body — and went stale the moment @faqir-ui/rules joined.
    expect(SOURCE).not.toMatch(/\b(six|Six) packages\b/);
    expect(SOURCE).not.toContain("5 workspace packages");
    expect(SOURCE).not.toMatch(/\d+ SRI hashes"/);
  });
});

describe("the Bun pin", () => {
  // Three committed artifacts — cdn.json's SRI hashes, the audit-browser bundle
  // and the faqir-rules plugin — are byte-compared against a fresh
  // `bun build --minify`, so they are only reproducible on one Bun. The pin used
  // to live in the deleted ci.yml; it now lives in `.bun-version`, and the
  // release guards refuse to run on any other Bun.
  const PIN = readFileSync(join(ROOT, ".bun-version"), "utf8");

  it("is one plain version in .bun-version", () => {
    expect(BUN_VERSION_FILE).toBe(".bun-version");
    expect(PIN).toMatch(/^\d+\.\d+\.\d+\n?$/);
    expect(checkBunVersion(PIN, PIN.trim())).toEqual({ ok: true, version: PIN.trim() });
  });

  it("accepts an exact match, ignoring surrounding whitespace", () => {
    expect(checkBunVersion("1.3.8\n", "1.3.8\n")).toEqual({ ok: true, version: "1.3.8" });
    expect(checkBunVersion("  1.3.8  ", "1.3.8")).toEqual({ ok: true, version: "1.3.8" });
  });

  it("rejects any other Bun, patch releases included", () => {
    for (const actual of ["1.3.9", "1.3.7", "1.4.0", "1.3.8-canary.1", "1.3"]) {
      const result = checkBunVersion("1.3.8", actual);
      expect(result.ok, actual).toBe(false);
      expect(result.reason).toContain(`is ${actual}, but .bun-version pins 1.3.8`);
    }
  });

  it("explains the byte-compared artifacts and the intentional-bump path", () => {
    const { ok, reason } = checkBunVersion("1.3.8", "1.3.9");
    expect(ok).toBe(false);
    for (const needle of [
      "packages/core/cdn.json",
      "SRI is fail-closed",
      "site/lib/faqir-audit.js",
      "registry/core/plugins/faqir-rules.js",
      "bun run build:core-package",
      "bun run build:audit-browser",
      "bun run build:rules-plugin",
      "commit .bun-version together",
    ]) {
      expect(reason, needle).toContain(needle);
    }
  });

  it("fails when bun cannot be run", () => {
    for (const actual of [null, undefined, "", "  "]) {
      const result = checkBunVersion("1.3.8", actual);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("could not run `bun --version`");
    }
  });

  it("fails on a missing or malformed pin rather than matching anything", () => {
    for (const pinned of ["", "   ", "latest", "1.3", "1.3.8\n1.3.9", ">=1.3.8"]) {
      const result = checkBunVersion(pinned, "1.3.8");
      expect(result.ok, JSON.stringify(pinned)).toBe(false);
      expect(result.reason).toContain(".bun-version must contain exactly one version");
    }
  });

  it("is a repository guard, so --dry-run and --skip-preflight are held to it", () => {
    // guards() runs unconditionally in main(); the preflight is the part
    // --skip-preflight skips, so the pin must not live there.
    const body = SOURCE.slice(SOURCE.indexOf("function guards()"));
    const fn = body.slice(0, body.indexOf("\n}\n"));
    expect(fn).toContain("checkBunVersion(");
    const main = SOURCE.slice(SOURCE.indexOf("function main()"));
    expect(main.indexOf("guards();")).toBeGreaterThan(0);
    expect(main.indexOf("guards();")).toBeLessThan(main.indexOf("if (flags.dryRun)"));
  });
});

describe("failure paths clean up", () => {
  it("fail() throws instead of exiting, so finally blocks run", () => {
    // packedCliSmoke called fail() — then process.exit — inside a try whose
    // finally removes its temp directory. process.exit skips finally.
    const body = SOURCE.slice(SOURCE.indexOf("function fail(message)"));
    const fn = body.slice(0, body.indexOf("\n}\n"));
    expect(fn).toContain("throw new ReleaseAbort");
    expect(fn).not.toContain("process.exit");
  });

  it("the packed smoke pins each runtime rather than trusting the launcher", () => {
    expect(SOURCE).toContain('FAQIR_FORCE_NODE: "1"');
    expect(SOURCE).toContain("FAQIR_BUN: bun");
    expect(SOURCE).toContain('"context", "--skill"');
  });
});

describe("the release script is the only gate there is", () => {
  const preflight = [...SOURCE.matchAll(/^\s*\["([a-z:-]+)", "/gm)].map((m) => m[1]);

  it("every preflight and build step names a script that exists", () => {
    const missing = preflight.filter((script) => !(script in PKG.scripts));
    expect(missing, `release.mjs runs scripts package.json does not define`).toEqual([]);
    expect(preflight.length).toBeGreaterThan(15);
  });

  it("runs every drift gate the repository defines", () => {
    // The `check:*` scripts exist to catch a generated artifact that was not
    // regenerated. With no CI, a check that is defined but never run is a file
    // nobody looks at. Every one of them belongs in the preflight — and if a new
    // one is added, this fails until it is wired in.
    //
    // One exemption, written down rather than tolerated: `check:package` is
    // `npm pack --dry-run`, which asserts nothing — delete `dist/` entirely and
    // it still exits 0, packing 365 files whose `bin` cannot resolve. The check
    // it was supposed to be now lives in `packedCliSmoke()`, which installs the
    // real tarball and runs it under node. Remove this exemption if and when
    // `check:package` starts checking something.
    const defined = Object.keys(PKG.scripts).filter((s) => s.startsWith("check:"));
    const unwired = defined.filter((s) => !preflight.includes(s) && s !== "check:package");
    expect(PKG.scripts["check:package"], "check:package changed — revisit the exemption").toBe(
      "npm pack --dry-run",
    );
    expect(
      unwired,
      `these check: scripts run nowhere — add them to PREFLIGHT in scripts/release.mjs`,
    ).toEqual([]);
  });

  it("pushes before it publishes", () => {
    // The defect this ordering fixes: tag → publish → push meant a rejected push
    // left a version live on npm that existed in no pushed commit, and npm
    // versions cannot be reused once burnt.
    const push = SOURCE.indexOf('run("git", ["push", "origin", flags.branch]);');
    const publish = SOURCE.indexOf("function publish(version)");
    // Locate the two call sites by name, inside main(), rather than by their full
    // argument lists — the ordering is the invariant here, and pinning the
    // signature made an unrelated change to commitAndPush() fail this test.
    const main = SOURCE.indexOf("function main()");
    const commitCall = SOURCE.indexOf("commitAndPush(", main);
    const publishCall = SOURCE.indexOf("publish(version);", commitCall);
    expect(push).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(0);
    expect(commitCall).toBeGreaterThan(main);
    expect(commitCall).toBeLessThan(publishCall);
  });

  it("publishes the root CLI last", () => {
    const order = [...SOURCE.matchAll(/\{ name: "([^"]+)", dir:/g)].map((m) => m[1]);
    expect(order.length).toBe(7);
    expect(order[order.length - 1]).toBe("faqir-ui-cli");
    expect(order[0]).toBe("@faqir-ui/core");
  });

  it("bumps every published package, not just the root", () => {
    // The defect: the old script bumped `package.json` and nothing else, so four
    // of the six packages sat at 0.1.0 while the root moved to 0.2.4.
    for (const dir of [
      "packages/core",
      "packages/forms",
      "packages/mcp",
      "packages/react",
      "packages/rules",
      "packages/vue",
    ]) {
      expect(SOURCE, `${dir} is not in the lockstep set`).toContain(`dir: "${dir}"`);
    }
    expect(SOURCE).toContain('const CLI_VERSION_FILE = "src/version.ts"');
  });

  it("--dry-run is implemented, not merely accepted", () => {
    // It previously printed "Unsupported version bump" — a mandatory acceptance
    // criterion of 1.0-04 that no code implemented.
    expect(SOURCE).toContain("flags.dryRun");
    expect(SOURCE).toContain("Rehearsal complete");
    expect(SOURCE).toContain('run("git", ["checkout", "--", "."]);');
  });

  it("documents that npm provenance is absent and why", () => {
    // Unmet in 1.0-04 and now unmeetable: provenance needs an OIDC token from a
    // CI provider, and there is no workflow to mint one. An unmet requirement
    // that is explained is a decision; one that is silent is an oversight.
    expect(SOURCE).toContain("provenance");
    expect(SOURCE).not.toContain("--provenance\"");
  });
});

describe("the release checklist", () => {
  const CHECKLIST = readFileSync(join(ROOT, "docs/release-checklist.md"), "utf8");

  it("exists and covers the rollback story", () => {
    expect(CHECKLIST).toContain("If a publish fails partway");
    expect(CHECKLIST).toContain("un-publish");
  });

  it("lists the preflight the script actually runs, in its order", () => {
    // The checklist's list went stale twice — it lacked check:rules-plugin and
    // check:theme-docs while the script ran both. Read it back and compare.
    const start = CHECKLIST.indexOf("`typecheck` ·");
    const block = CHECKLIST.slice(start, CHECKLIST.indexOf("\n\n", start));
    const listed = [...block.matchAll(/`([a-z:-]+)`/g)].map((m) => m[1]);
    expect(listed).toEqual(PREFLIGHT.map(([script]: string[]) => script));
  });

  it("counts the packages the script publishes", () => {
    expect(CHECKLIST).toContain("seven packages on npm");
    expect(CHECKLIST).not.toMatch(/\bsix packages\b/);
    expect(CHECKLIST).toContain("@faqir-ui/rules");
  });

  it("names the suites that cannot run without a Linux container", () => {
    for (const cmd of ["test:visual", "test:visual:print", "test:a11y", "lint:layout"]) {
      expect(CHECKLIST, `${cmd} is not carried as a manual step`).toContain(`bun run ${cmd}`);
    }
  });
});
