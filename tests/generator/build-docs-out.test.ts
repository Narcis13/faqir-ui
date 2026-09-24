// `scripts/build-docs.mjs --out <dir>` starts with an `rm -rf` of <dir>.
//
// It used to take the value unvalidated, so `--out .` deleted the repository
// and `--out src` the CLI source. `resolveOutDir` is the gate; it is tested as a
// pure function here — spawning the script with a bad `--out` to prove it
// refuses would, if the gate ever regressed, delete the tree the suite runs in.

import { describe, expect, it } from "bun:test";
import { join, resolve } from "node:path";
import { resolveOutDir } from "../../scripts/build-docs.mjs";

const ROOT = resolve(import.meta.dir, "../..");
const none = () => [] as string[];

describe("build-docs --out", () => {
  it("defaults to site/dist", () => {
    expect(resolveOutDir([], ROOT, none)).toEqual({ outDir: join(ROOT, "site", "dist") });
  });

  it("accepts an output directory inside the repository", () => {
    expect(resolveOutDir(["--out", "site/dist"], ROOT, none).outDir).toBe(join(ROOT, "site", "dist"));
    expect(resolveOutDir(["--out", "out/docs"], ROOT, none).outDir).toBe(join(ROOT, "out", "docs"));
    expect(resolveOutDir(["--out", join(ROOT, "tests", ".tmp-docs", "x")], ROOT, none).outDir).toBe(
      join(ROOT, "tests", ".tmp-docs", "x"),
    );
  });

  it("refuses a missing value", () => {
    expect(resolveOutDir(["--out"], ROOT, none).error).toContain("--out needs a directory");
    expect(resolveOutDir(["--out", "--check"], ROOT, none).error).toContain("--out needs a directory");
  });

  it("refuses the repository root and anything outside it", () => {
    expect(resolveOutDir(["--out", "."], ROOT, none).error).toContain("repository root");
    expect(resolveOutDir(["--out", ROOT], ROOT, none).error).toContain("repository root");
    expect(resolveOutDir(["--out", ".."], ROOT, none).error).toContain("inside the repository");
    expect(resolveOutDir(["--out", "/tmp/docs"], ROOT, none).error).toContain("inside the repository");
  });

  it("refuses a source directory, or a directory inside one", () => {
    for (const dir of ["src", "registry", "packages/core", "scripts", "site", "site/lib", "docs", "tests"]) {
      expect(resolveOutDir(["--out", dir], ROOT, none).error, dir).toContain("source directory");
    }
  });

  it("refuses a directory that holds tracked files, whatever its name", () => {
    const tracked = () => ["out/keep.md"];
    expect(resolveOutDir(["--out", "out"], ROOT, tracked).error).toContain("tracked files");
  });

  it("asks git by default, and the default output holds nothing tracked", () => {
    expect(resolveOutDir(["--out", "site/dist"], ROOT).error).toBeUndefined();
  });
});
