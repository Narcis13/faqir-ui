import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { readConfig } from "../../src/utils/config";

const TEST_DIR = join(import.meta.dir, "../.tmp-add-test");

describe("loom add", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("fails without loom.config.json", async () => {
    let exitCode = 0;
    const origExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; throw new Error("exit"); }) as any;
    try {
      await add(["button"]);
    } catch {}
    process.exit = origExit;
    expect(exitCode).toBe(1);
  });

  it("adds a single primitive component", async () => {
    await init([]);
    await add(["button"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("button");

    const buttonDir = join(TEST_DIR, "ui/primitives/button");
    expect(existsSync(buttonDir)).toBe(true);
    expect(existsSync(join(buttonDir, "button.html"))).toBe(true);
    expect(existsSync(join(buttonDir, "button.css"))).toBe(true);
    expect(existsSync(join(buttonDir, "button.manifest.json"))).toBe(true);
  });

  it("adds multiple components at once", async () => {
    await init([]);
    await add(["button", "card", "input"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("button");
    expect(config.installed.primitives).toContain("card");
    expect(config.installed.primitives).toContain("input");
  });

  it("does not duplicate already installed components", async () => {
    await init([]);
    await add(["button"]);
    await add(["button"]);

    const config = await readConfig(TEST_DIR);
    const count = config.installed.primitives.filter((n) => n === "button").length;
    expect(count).toBe(1);
  });

  it("auto-adds dependencies", async () => {
    await init([]);
    // Card depends on button via composition.contains
    await add(["card"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("card");
    expect(config.installed.primitives).toContain("button");
  });

  it("skips dependencies with --no-deps", async () => {
    await init([]);
    await add(["card", "--no-deps"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("card");
    expect(config.installed.primitives).not.toContain("button");
  });

  it("dry run does not write files", async () => {
    await init([]);
    await add(["button", "--dry-run"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).not.toContain("button");
    expect(existsSync(join(TEST_DIR, "ui/primitives/button"))).toBe(false);
  });

  it("updates .loom/context.json with component data", async () => {
    await init([]);
    await add(["button"]);

    const context = await Bun.file(join(TEST_DIR, ".loom/context.json")).json();
    expect(context.components.button).toBeDefined();
    expect(context.components.button.kind).toBe("primitive");
    expect(context.meta.component_count.primitives).toBe(1);
  });

  it("adds all components with --layer primitives", async () => {
    await init([]);
    await add(["--layer", "primitives"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives.length).toBeGreaterThanOrEqual(7);
    expect(config.installed.primitives).toContain("button");
    expect(config.installed.primitives).toContain("input");
    expect(config.installed.primitives).toContain("card");
    expect(config.installed.primitives).toContain("badge");
    expect(config.installed.primitives).toContain("avatar");
    expect(config.installed.primitives).toContain("separator");
    expect(config.installed.primitives).toContain("label");
  });
});
