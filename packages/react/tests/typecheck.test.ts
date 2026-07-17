// Generated TS must compile — `tsc --noEmit` runs as part of the package test
// (task 0.7-01). The negative fixture proves the literal unions actually reject
// invalid values, so a green tsc run means something. `tsc` (not vue-tsc): the
// React target is plain TypeScript with the automatic JSX runtime.

import { describe, it, expect } from "bun:test";
import { join } from "node:path";

const PKG = join(import.meta.dir, "..");
const REPO_ROOT = join(PKG, "..", "..");
const TSC = join(REPO_ROOT, "node_modules", ".bin", "tsc");

function runTsc(project: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync([TSC, "--noEmit", "-p", project], { cwd: PKG });
  return {
    exitCode: proc.exitCode,
    output: proc.stdout.toString() + proc.stderr.toString(),
  };
}

describe("tsc", () => {
  it("the generated package compiles", () => {
    const { exitCode, output } = runTsc(join(PKG, "tsconfig.json"));
    expect(output.trim()).toBe("");
    expect(exitCode).toBe(0);
  }, 120000);

  it("an invalid variant literal fails to compile (unions are enforced)", () => {
    const { exitCode, output } = runTsc(join(PKG, "tests", "fixtures", "bad", "tsconfig.json"));
    expect(exitCode).not.toBe(0);
    expect(output).toContain("bad-usage.ts");
  }, 120000);
});
