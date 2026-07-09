import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { list } from "../../src/commands/list";

const TEST_DIR = join(import.meta.dir, "../.tmp-list-test");

describe("faqir list", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("runs without config (shows available only)", async () => {
    // Should not throw
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await list([]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("PRIMITIVES");
    expect(text).toContain("button");
  });

  it("shows installed components after adding", async () => {
    await init([]);
    await add(["button", "card"]);

    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await list([]);
    console.log = origLog;

    const text = output.join("\n");
    expect(text).toContain("2 installed");
    expect(text).toContain("button");
    expect(text).toContain("card");
  });
});
