// Generated TS must compile — `vue-tsc` runs as part of the package test
// (task 0.6-12). The negative fixture proves the literal unions actually
// reject invalid values, so a green vue-tsc run means something.

import { describe, it, expect } from "bun:test";
import { join } from "node:path";

const PKG = join(import.meta.dir, "..");
const VUE_TSC = join(PKG, "node_modules", ".bin", "vue-tsc");

function runVueTsc(project: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync([VUE_TSC, "--noEmit", "-p", project], { cwd: PKG });
  return {
    exitCode: proc.exitCode,
    output: proc.stdout.toString() + proc.stderr.toString(),
  };
}

describe("vue-tsc", () => {
  it("the generated package compiles", () => {
    const { exitCode, output } = runVueTsc(join(PKG, "tsconfig.json"));
    expect(output.trim()).toBe("");
    expect(exitCode).toBe(0);
  }, 120000);

  it("an invalid variant literal fails to compile (unions are enforced)", () => {
    const { exitCode, output } = runVueTsc(join(PKG, "tests", "fixtures", "bad", "tsconfig.json"));
    expect(exitCode).not.toBe(0);
    expect(output).toContain("bad-usage.ts");
  }, 120000);
});
