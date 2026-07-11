import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { context } from "../../src/commands/context";
import { generateContext, formatContextJSON, formatContextMarkdown, formatContextCursorRules, formatContextLlms, formatContextLlmsFull } from "../../src/generator/context";
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

  it("embeds the active theme manifest block", async () => {
    await init([]);
    await add(["button"]);

    const data = await generateContext(TEST_DIR);
    const theme = data.theme as any;

    // Active theme is `default`, which ships a registry manifest.
    expect(theme.name).toBe("default");
    expect(theme.scheme).toBe("both");
    expect(theme.dark_mode).toBe("native");
    expect(theme.mood).toBeInstanceOf(Array);
    expect(theme.mood.length).toBeGreaterThan(0);
    expect(theme.tokens_overridden).toContain("color-primary");
  });

  it("renders the active theme block in JSON and markdown output", async () => {
    await init([]);
    await add(["button"]);

    const data = await generateContext(TEST_DIR);

    const parsed = JSON.parse(formatContextJSON(data));
    expect(parsed.theme.name).toBe("default");
    expect(parsed.theme.mood).toContain("neutral");

    const md = formatContextMarkdown(data);
    expect(md).toContain("## Active Theme");
    expect(md).toContain("Name: default");
    expect(md).toContain("Scheme: both");
  });

  it("llms output is derived only from the installed set", async () => {
    await init([]);
    await add(["button", "dialog", "card"]);

    const data = await generateContext(TEST_DIR);
    const index = formatContextLlms(data);
    const full = formatContextLlmsFull(data);

    // Only the three installed components are documented.
    expect(index).toContain("[button](llms-full.txt#button)");
    expect(index).toContain("[dialog](llms-full.txt#dialog)");
    expect(index).toContain("[card](llms-full.txt#card)");
    expect(full).toContain("### button");
    expect(full).toContain("### dialog");
    expect(full).toContain("### card");

    // A component that was never installed must not appear.
    expect(index).not.toContain("accordion");
    expect(full).not.toContain("### accordion");
  });

  it("llms.txt conforms to the llmstxt.org structure", async () => {
    await init([]);
    await add(["button", "dialog"]);

    const data = await generateContext(TEST_DIR);
    const index = formatContextLlms(data);
    const lines = index.split("\n");

    // Exactly one H1 project title as the first content line.
    const h1s = lines.filter((l) => /^# \S/.test(l));
    expect(h1s.length).toBe(1);
    expect(lines[0]).toMatch(/^# /);

    // A blockquote summary follows.
    expect(lines.some((l) => l.startsWith("> "))).toBe(true);

    // Sections are H2 with markdown link-list bodies.
    expect(index).toContain("## Primitives");
    expect(index).toContain("## Recipes");
    expect(lines.some((l) => /^- \[[^\]]+\]\([^)]+\)/.test(l))).toBe(true);
  });

  it("llms output is deterministic (no timestamp)", async () => {
    await init([]);
    await add(["button"]);

    const a = await generateContext(TEST_DIR);
    const b = await generateContext(TEST_DIR);
    expect(formatContextLlms(a)).toBe(formatContextLlms(b));
    expect(formatContextLlmsFull(a)).toBe(formatContextLlmsFull(b));
    expect(formatContextLlms(a)).not.toContain("generated_at");
    expect(formatContextLlmsFull(a)).not.toContain("generated_at");
  });

  it("writes llms.txt and llms-full.txt via --format llms", async () => {
    await init([]);
    await add(["button"]);

    await context(["--format", "llms"]);

    expect(existsSync(join(TEST_DIR, "llms.txt"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "llms-full.txt"))).toBe(true);

    const index = await Bun.file(join(TEST_DIR, "llms.txt")).text();
    expect(index).toMatch(/^# /);
    expect(index).toContain("[button](llms-full.txt#button)");
  });

  it("regenerating llms after faqir add includes the new component", async () => {
    await init([]);
    await add(["button"]);

    let index = formatContextLlms(await generateContext(TEST_DIR));
    expect(index).not.toContain("[dialog]");

    await add(["dialog"]);

    index = formatContextLlms(await generateContext(TEST_DIR));
    expect(index).toContain("[dialog](llms-full.txt#dialog)");
  });

  it("lists the llms format in --json metadata", async () => {
    await init([]);

    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await context(["--json"]);
    console.log = origLog;

    const parsed = JSON.parse(output.join("\n"));
    expect(parsed.command).toBe("context");
    const llms = parsed.formats.find((f: any) => f.format === "llms");
    expect(llms).toBeDefined();
    expect(llms.outputs).toContain("llms.txt");
    expect(llms.outputs).toContain("llms-full.txt");
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
