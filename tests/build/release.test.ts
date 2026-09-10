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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isExplicitVersion, nextVersion } from "../../scripts/release.mjs";

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
    const call = SOURCE.indexOf("publish(version);", SOURCE.indexOf("commitAndPush(version);"));
    expect(push).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(0);
    expect(SOURCE.indexOf("commitAndPush(version);", call - 200)).toBeLessThan(call);
  });

  it("publishes the root CLI last", () => {
    const order = [...SOURCE.matchAll(/\{ name: "([^"]+)", dir:/g)].map((m) => m[1]);
    expect(order.length).toBe(6);
    expect(order[order.length - 1]).toBe("faqir-ui-cli");
    expect(order[0]).toBe("@faqir-ui/core");
  });

  it("bumps every published package, not just the root", () => {
    // The defect: the old script bumped `package.json` and nothing else, so four
    // of the six packages sat at 0.1.0 while the root moved to 0.2.4.
    for (const dir of ["packages/core", "packages/forms", "packages/mcp", "packages/react", "packages/vue"]) {
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

  it("names the suites that cannot run without a Linux container", () => {
    for (const cmd of ["test:visual", "test:visual:print", "test:a11y", "lint:layout"]) {
      expect(CHECKLIST, `${cmd} is not carried as a manual step`).toContain(`bun run ${cmd}`);
    }
  });
});
