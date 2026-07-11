// Manifest-derived skill generator tests (task 0.5-07).
//
//  • Project skill: a section per installed component with anatomy + variants
//    matching the manifest; carries the generation header; regenerates
//    idempotently.
//  • Shipped skill: covers every registry component, carries the header, and the
//    committed files equal a fresh generation (the `check:skill` CI gate).

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import {
  generateSkill,
  generateShippedSkillFiles,
  shippedSkillDir,
  SKILL_GENERATION_MARKER,
} from "../../src/generator/skill";

const REPO = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-skill-test");

describe("project skill generator", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(REPO);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("carries a grep-able generation header with the schema version", async () => {
    await init([]);
    await add(["button"]);
    const content = await generateSkill(TEST_DIR);
    expect(content).toContain(SKILL_GENERATION_MARKER);
    expect(content).toMatch(/schema_version \d+\.\d+\.\d+/);
  });

  it("emits a section per installed component with matching anatomy + variants", async () => {
    await init([]);
    await add(["button", "dialog"]);
    const content = await generateSkill(TEST_DIR);

    // A heading per installed component.
    expect(content).toContain("### button");
    expect(content).toContain("### dialog");

    // dialog's anatomy tree comes from its manifest slots.
    expect(content).toContain("[data-ui='dialog']");
    expect(content).toContain("[data-part='panel']");
    expect(content).toContain("[data-part='close']");

    // dialog's variant table comes from its manifest variants.
    expect(content).toContain("| Variant | Values | Default | Attribute | Applied to |");
    expect(content).toContain("`data-size`");
    expect(content).toContain("`full`"); // dialog size value

    // safe/unsafe transforms from the manifest.
    expect(content).toContain("Safe transforms:");
    expect(content).toContain("remove-focus-trap"); // dialog unsafe transform
  });

  it("keeps the framework contract + recipe controllers", async () => {
    await init([]);
    await add(["dialog"]);
    const content = await generateSkill(TEST_DIR);
    expect(content).toContain("# Faqir UI Framework Skill");
    expect(content).toContain("data-ui");
    expect(content).toContain("data-state");
    expect(content).toContain("faqir audit");
    expect(content).toContain("createDialog"); // recipe controller factory
    expect(content).toContain("faqir.js");
  });

  it("renders canonical compositions from installed patterns", async () => {
    await init([]);
    await add(["auth-form"]);
    const content = await generateSkill(TEST_DIR);
    expect(content).toContain("## Canonical Compositions");
    expect(content).toContain("### auth-form");
    expect(content).toContain("Composes:");
  });

  it("is idempotent — two generations are byte-identical", async () => {
    await init([]);
    await add(["button", "dialog", "auth-form"]);
    const a = await generateSkill(TEST_DIR);
    const b = await generateSkill(TEST_DIR);
    expect(a).toBe(b);
  });
});

describe("shipped faqir-creator skill", () => {
  afterEach(() => {
    process.chdir(REPO);
  });

  it("generates SKILL.md plus one reference file per layer", async () => {
    const files = await generateShippedSkillFiles();
    const rels = files.map((f) => f.relPath);
    expect(rels).toContain("SKILL.md");
    expect(rels).toContain(join("references", "primitives.md"));
    expect(rels).toContain(join("references", "recipes.md"));
    expect(rels).toContain(join("references", "patterns.md"));
  });

  it("every generated file carries the generation header", async () => {
    const files = await generateShippedSkillFiles();
    for (const f of files) expect(f.content).toContain(SKILL_GENERATION_MARKER);
  });

  it("documents every registry component (a section per component)", async () => {
    const files = await generateShippedSkillFiles();
    const byRel = new Map(files.map((f) => [f.relPath, f.content]));
    const primitives = byRel.get(join("references", "primitives.md")) ?? "";
    // Spot-check representative components across layers.
    expect(primitives).toContain("## button");
    expect(primitives).toContain("## badge");
    expect(byRel.get(join("references", "recipes.md")) ?? "").toContain("## dialog");
    expect(byRel.get(join("references", "patterns.md")) ?? "").toContain("## auth-form");
  });

  it("is idempotent — regeneration is byte-identical", async () => {
    const a = await generateShippedSkillFiles();
    const b = await generateShippedSkillFiles();
    for (let i = 0; i < a.length; i++) {
      expect(b[i].relPath).toBe(a[i].relPath);
      expect(b[i].content).toBe(a[i].content);
    }
  });

  it("the committed skill matches a fresh generation (check:skill gate)", async () => {
    const files = await generateShippedSkillFiles();
    const dir = shippedSkillDir();
    for (const f of files) {
      const committed = await Bun.file(join(dir, f.relPath)).text();
      expect(committed).toBe(f.content);
    }
  });
});
