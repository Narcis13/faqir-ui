import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { inspect } from "../../src/commands/inspect";

const TEST_DIR = join(import.meta.dir, "../.tmp-inspect-test");

describe("loom inspect", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("inspects a component from registry without init", async () => {
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await inspect(["button"]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("BUTTON");
    expect(text).toContain("primitive");
    expect(text).toContain("data-variant");
  });

  it("outputs JSON with --json flag", async () => {
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await inspect(["button", "--json"]);
    console.log = origLog;

    const json = JSON.parse(output.join("\n"));
    expect(json.name).toBe("button");
    expect(json.kind).toBe("primitive");
    expect(json.variants.visual.values).toContain("primary");
  });

  it("inspects installed component from project", async () => {
    await init([]);
    await add(["button"]);

    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await inspect(["button"]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("BUTTON");
  });

  it("fails for unknown component", async () => {
    let exitCode = 0;
    const origExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; throw new Error("exit"); }) as any;
    try {
      await inspect(["nonexistent"]);
    } catch {}
    process.exit = origExit;
    expect(exitCode).toBe(1);
  });
});
