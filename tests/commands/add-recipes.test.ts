import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { readConfig } from "../../src/utils/config";

const TEST_DIR = join(import.meta.dir, "../.tmp-add-recipes-test");

describe("faqir add (recipes)", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("adds a recipe with all files (html, css, js, manifest)", async () => {
    await init([]);
    await add(["dialog"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.recipes).toContain("dialog");

    const recipeDir = join(TEST_DIR, "ui/recipes/dialog");
    expect(existsSync(recipeDir)).toBe(true);
    expect(existsSync(join(recipeDir, "dialog.html"))).toBe(true);
    expect(existsSync(join(recipeDir, "dialog.css"))).toBe(true);
    expect(existsSync(join(recipeDir, "dialog.js"))).toBe(true);
    expect(existsSync(join(recipeDir, "dialog.manifest.json"))).toBe(true);
  });

  it("adds multiple recipes at once", async () => {
    await init([]);
    await add(["dialog", "tabs", "dropdown"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.recipes).toContain("dialog");
    expect(config.installed.recipes).toContain("tabs");
    expect(config.installed.recipes).toContain("dropdown");
  });

  it("auto-adds dependencies for recipes", async () => {
    await init([]);
    await add(["dialog"]);

    const config = await readConfig(TEST_DIR);
    // Dialog depends on button via composition.contains
    expect(config.installed.primitives).toContain("button");
  });

  it("generates faqir.js auto-init when recipes are installed", async () => {
    await init([]);
    await add(["dialog"]);

    const faqirJs = join(TEST_DIR, "ui/core/faqir.js");
    expect(existsSync(faqirJs)).toBe(true);

    const content = await Bun.file(faqirJs).text();
    expect(content).toContain("createDialog");
    expect(content).toContain('import { createDialog } from "../recipes/dialog/dialog.js"');
  });

  it("regenerates faqir.js with all installed recipes", async () => {
    await init([]);
    await add(["dialog"]);
    await add(["tabs"]);

    const faqirJs = join(TEST_DIR, "ui/core/faqir.js");
    const content = await Bun.file(faqirJs).text();
    expect(content).toContain("createDialog");
    expect(content).toContain("createTabs");
  });

  it("context.json includes recipe controller reference", async () => {
    await init([]);
    await add(["dialog"]);

    const context = await Bun.file(join(TEST_DIR, ".faqir/context.json")).json();
    expect(context.components.dialog).toBeDefined();
    expect(context.components.dialog.kind).toBe("recipe");
    expect(context.components.dialog.controller).toBe("dialog.js");
    expect(context.meta.component_count.recipes).toBe(1);
  });

  it("adds tabs recipe correctly", async () => {
    await init([]);
    await add(["tabs"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.recipes).toContain("tabs");

    const recipeDir = join(TEST_DIR, "ui/recipes/tabs");
    expect(existsSync(join(recipeDir, "tabs.js"))).toBe(true);
    expect(existsSync(join(recipeDir, "tabs.manifest.json"))).toBe(true);
  });

  it("adds dropdown recipe correctly", async () => {
    await init([]);
    await add(["dropdown"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.recipes).toContain("dropdown");

    const recipeDir = join(TEST_DIR, "ui/recipes/dropdown");
    expect(existsSync(join(recipeDir, "dropdown.js"))).toBe(true);
    expect(existsSync(join(recipeDir, "dropdown.manifest.json"))).toBe(true);
  });

  it("mixes primitives and recipes in one add command", async () => {
    await init([]);
    await add(["button", "dialog", "card", "tabs"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("button");
    expect(config.installed.primitives).toContain("card");
    expect(config.installed.recipes).toContain("dialog");
    expect(config.installed.recipes).toContain("tabs");
  });

  it("--layer recipes adds all recipes", async () => {
    await init([]);
    await add(["--layer", "recipes"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.recipes).toContain("dialog");
    expect(config.installed.recipes).toContain("tabs");
    expect(config.installed.recipes).toContain("dropdown");
  });
});
