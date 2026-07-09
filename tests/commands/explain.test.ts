import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { explain } from "../../src/commands/explain";

const TEST_DIR = join(import.meta.dir, "../.tmp-explain-test");

describe("faqir explain", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("explains a component from registry", async () => {
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await explain(["button"]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("BUTTON");
    expect(text).toContain("PURPOSE");
    expect(text).toContain("ANATOMY");
    expect(text).toContain("[data-ui=\"button\"]");
    expect(text).toContain("SAFE TO MODIFY");
  });

  it("explains a recipe with a11y details", async () => {
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await explain(["dialog"]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("DIALOG");
    expect(text).toContain("KEYBOARD");
    expect(text).toContain("ACCESSIBILITY");
    expect(text).toContain("Escape");
    expect(text).toContain("focus-trap");
    expect(text).toContain("STATES");
    expect(text).toContain("DO NOT REMOVE");
  });

  it("explains an installed component", async () => {
    await init([]);
    await add(["button"]);

    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await explain(["button"]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("BUTTON");
    expect(text).toContain("FILES");
  });

  it("outputs JSON with --json flag", async () => {
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await explain(["dialog", "--json"]);
    console.log = origLog;

    const json = JSON.parse(output.join("\n"));
    expect(json.name).toBe("dialog");
    expect(json.anatomy).toBeInstanceOf(Array);
    expect(json.anatomy.length).toBeGreaterThan(0);
    expect(json.keyboard).toBeInstanceOf(Array);
    expect(json.accessibility).toBeInstanceOf(Array);
    expect(json.safe_to_modify).toBeInstanceOf(Array);
    expect(json.do_not_remove).toBeInstanceOf(Array);
    expect(json.files).toHaveProperty("HTML");
  });

  it("shows variants and states", async () => {
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await explain(["dialog"]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("VARIANTS");
    expect(text).toContain("sm");
    expect(text).toContain("md");
    expect(text).toContain("lg");
  });

  it("fails for unknown component", async () => {
    let exitCode = 0;
    const origExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; throw new Error("exit"); }) as any;
    try {
      await explain(["nonexistent"]);
    } catch {}
    process.exit = origExit;
    expect(exitCode).toBe(1);
  });

  it("fails with no component argument", async () => {
    let exitCode = 0;
    const origExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; throw new Error("exit"); }) as any;
    try {
      await explain([]);
    } catch {}
    process.exit = origExit;
    expect(exitCode).toBe(1);
  });
});
