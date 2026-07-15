import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { bundle } from "../../src/commands/bundle";
import { generateContext } from "../../src/generator/context";
import { generateSkill } from "../../src/generator/skill";

const REPO = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-official-plugins");

describe("official plugin distribution + discovery", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(REPO);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("ships both plugins as separate scripts and through faqir bundle --js", async () => {
    await init([]);
    const persist = join(TEST_DIR, "ui/core/plugins/faqir-persist.js");
    const intersect = join(TEST_DIR, "ui/core/plugins/faqir-intersect.js");
    expect(existsSync(persist)).toBe(true);
    expect(existsSync(intersect)).toBe(true);

    await bundle(["--js"]);
    const output = join(TEST_DIR, "ui/faqir.bundle.js");
    const first = await Bun.file(output).text();
    expect(first).toContain("core/faqir-core.js");
    expect(first).toContain("@ui:plugin faqir-persist");
    expect(first).toContain("@ui:plugin faqir-intersect");
    expect(first.indexOf("core/faqir-core.js")).toBeLessThan(first.indexOf("@ui:plugin faqir-persist"));

    await bundle(["--js"]);
    expect(await Bun.file(output).text()).toBe(first);
  });

  it("documents plugin files and provided directives in context and skill output", async () => {
    await init([]);
    const context = await generateContext(TEST_DIR);

    expect(context.meta.plugin_count).toBeGreaterThanOrEqual(4);
    expect(context.plugins["faqir-persist"]).toEqual(expect.objectContaining({
      file: "core/plugins/faqir-persist.js",
      provides: ["l-persist", "$persist()"],
    }));
    expect(context.plugins["faqir-intersect"]).toEqual(expect.objectContaining({
      file: "core/plugins/faqir-intersect.js",
      provides: ["l-intersect"],
    }));

    const skill = await generateSkill(TEST_DIR);
    expect(skill).toContain("## Official Plugins");
    expect(skill).toContain("faqir-persist");
    expect(skill).toContain("faqir-intersect");
    expect(skill).toContain("faqir bundle --js");
  });
});
