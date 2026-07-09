import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { trace } from "../../src/commands/trace";

const TEST_DIR = join(import.meta.dir, "../.tmp-trace-test");

describe("faqir trace", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("traces a component from registry", async () => {
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await trace(["button"]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("TRACE: button");
    expect(text).toContain("FILES");
    expect(text).toContain("SELECTORS");
    expect(text).toContain("[data-ui='button']");
    expect(text).toContain("TOKENS");
    expect(text).toContain("TESTS");
  });

  it("traces an installed component with installation status", async () => {
    await init([]);
    await add(["button"]);

    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await trace(["button"]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("installed");
    expect(text).toContain("button.html");
    expect(text).toContain("button.css");
    expect(text).toContain("button.manifest.json");
  });

  it("traces a recipe with controller info", async () => {
    await init([]);
    await add(["dialog"]);

    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await trace(["dialog"]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("dialog.js");
    expect(text).toContain("CONTROLLERS");
  });

  it("outputs JSON with --json flag", async () => {
    await init([]);
    await add(["dialog"]);

    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await trace(["dialog", "--json"]);
    console.log = origLog;

    const json = JSON.parse(output.join("\n"));
    expect(json.name).toBe("dialog");
    expect(json.kind).toBe("recipe");
    expect(json.installed).toBe(true);
    expect(json.files).toBeInstanceOf(Array);
    expect(json.selectors).toBeInstanceOf(Array);
    expect(json.tokens_declared).toBeInstanceOf(Array);
    expect(json.controllers).toBeInstanceOf(Array);
    expect(json.tests).toBeInstanceOf(Array);
  });

  it("shows dependency info", async () => {
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await trace(["dialog"]);
    console.log = origLog;

    const text = output.join("\n");
    // dialog contains button
    expect(text).toContain("DEPENDS ON");
    expect(text).toContain("button");
  });

  it("shows used_in info for button", async () => {
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await trace(["button"]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("USED BY");
  });

  it("fails for unknown component", async () => {
    let exitCode = 0;
    const origExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; throw new Error("exit"); }) as any;
    try {
      await trace(["nonexistent"]);
    } catch {}
    process.exit = origExit;
    expect(exitCode).toBe(1);
  });
});
