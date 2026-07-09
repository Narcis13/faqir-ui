import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { context } from "../../src/commands/context";
import { generateContext, formatContextJSON, formatContextMarkdown, formatContextCursorRules } from "../../src/generator/context";
import { generateSkill, writeSkillFile } from "../../src/generator/skill";

const TEST_DIR = join(import.meta.dir, "../.tmp-context-test");

describe("faqir context", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("generates valid context.json with installed components", async () => {
    await init([]);
    await add(["button", "dialog"]);

    const data = await generateContext(TEST_DIR);

    expect(data.meta.framework).toBe("faqir");
    expect(data.meta.component_count.primitives).toBe(1);
    expect(data.meta.component_count.recipes).toBe(1);
    expect(data.protocol.identity).toBe("data-ui");
    expect(data.components).toHaveProperty("button");
    expect(data.components).toHaveProperty("dialog");
    expect((data.components.button as any).kind).toBe("primitive");
    expect((data.components.dialog as any).kind).toBe("recipe");
  });

  it("includes component details in context", async () => {
    await init([]);
    await add(["button"]);

    const data = await generateContext(TEST_DIR);
    const button = data.components.button as any;

    expect(button.template).toContain("data-ui=\"button\"");
    expect(button.safe_transforms).toBeInstanceOf(Array);
    expect(button.safe_transforms.length).toBeGreaterThan(0);
  });

  it("formats context as JSON", async () => {
    await init([]);
    await add(["button"]);

    const data = await generateContext(TEST_DIR);
    const json = formatContextJSON(data);
    const parsed = JSON.parse(json);

    expect(parsed.meta.framework).toBe("faqir");
    expect(parsed.components.button).toBeDefined();
  });

  it("formats context as markdown", async () => {
    await init([]);
    await add(["button", "dialog"]);

    const data = await generateContext(TEST_DIR);
    const md = formatContextMarkdown(data);

    expect(md).toContain("# Faqir UI Context");
    expect(md).toContain("## Attribute Protocol");
    expect(md).toContain("## Components");
    expect(md).toContain("### button");
    expect(md).toContain("### dialog");
    expect(md).toContain("data-ui");
  });

  it("formats context as cursorrules", async () => {
    await init([]);
    await add(["button"]);

    const data = await generateContext(TEST_DIR);
    const rules = formatContextCursorRules(data);

    expect(rules).toContain("# Faqir UI Framework Rules");
    expect(rules).toContain("data-ui");
    expect(rules).toContain("data-state");
    expect(rules).toContain("button");
  });

  it("writes context.json file via command", async () => {
    await init([]);
    await add(["button"]);

    await context([]);

    const contextPath = join(TEST_DIR, ".faqir", "context.json");
    expect(existsSync(contextPath)).toBe(true);

    const content = await Bun.file(contextPath).json();
    expect(content.meta.framework).toBe("faqir");
    expect(content.components.button).toBeDefined();
  });

  it("writes markdown format with --format md", async () => {
    await init([]);
    await add(["button"]);

    await context(["--format", "md"]);

    const mdPath = join(TEST_DIR, ".faqir", "context.md");
    expect(existsSync(mdPath)).toBe(true);

    const content = await Bun.file(mdPath).text();
    expect(content).toContain("# Faqir UI Context");
  });

  it("writes .cursorrules with --format cursorrules", async () => {
    await init([]);
    await add(["button"]);

    await context(["--format", "cursorrules"]);

    const rulesPath = join(TEST_DIR, ".cursorrules");
    expect(existsSync(rulesPath)).toBe(true);

    const content = await Bun.file(rulesPath).text();
    expect(content).toContain("# Faqir UI Framework Rules");
  });

  it("outputs to stdout with --stdout", async () => {
    await init([]);
    await add(["button"]);

    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await context(["--stdout"]);
    console.log = origLog;

    const text = output.join("\n");
    const parsed = JSON.parse(text);
    expect(parsed.meta.framework).toBe("faqir");
  });

  it("includes rules section", async () => {
    await init([]);
    await add(["button"]);

    const data = await generateContext(TEST_DIR);
    expect(data.rules.use_data_state_not_classes).toBe(true);
    expect(data.rules.tokens_only_no_hardcoded_values).toBe(true);
  });

  it("context includes recipe a11y info", async () => {
    await init([]);
    await add(["dialog"]);

    const data = await generateContext(TEST_DIR);
    const dialog = data.components.dialog as any;

    expect(dialog.controller).toBe("dialog.js");
    expect(dialog.slots).toContain("trigger");
    expect(dialog.slots).toContain("panel");
    expect(dialog.states).toContain("open");
    expect(dialog.a11y).toContain("role=dialog");
  });
});

describe("skill generator", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("generates SKILL.md content", async () => {
    await init([]);
    await add(["button", "dialog"]);

    const content = await generateSkill(TEST_DIR);

    expect(content).toContain("# Faqir UI Framework Skill");
    expect(content).toContain("data-ui");
    expect(content).toContain("data-state");
    expect(content).toContain("faqir audit");
    expect(content).toContain("dialog");
    expect(content).toContain("button");
  });

  it("includes recipe controller imports", async () => {
    await init([]);
    await add(["dialog"]);

    const content = await generateSkill(TEST_DIR);
    expect(content).toContain("createDialog");
    expect(content).toContain("faqir.js");
  });

  it("writes SKILL.md file", async () => {
    await init([]);
    await add(["button"]);

    const path = await writeSkillFile(TEST_DIR);
    expect(existsSync(path)).toBe(true);

    const content = await Bun.file(path).text();
    expect(content).toContain("# Faqir UI Framework Skill");
  });

  it("context --skill generates both files", async () => {
    await init([]);
    await add(["button"]);

    await context(["--skill"]);

    expect(existsSync(join(TEST_DIR, ".faqir", "context.json"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".faqir", "SKILL.md"))).toBe(true);
  });
});
