import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { context } from "../../src/commands/context";
import { generateContext, formatContextJSON, formatContextMarkdown, formatContextCursorRules, formatContextLlms, formatContextLlmsFull } from "../../src/generator/context";
import { generateSkill, writeSkillFile } from "../../src/generator/skill";
import { axisSummary } from "../../src/theme/describe";

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

  // ── Axes reach every surface [1.1A-20] ──────────────────────────────────
  //
  // The theme block embeds the manifest, so the fourteen derived axes (and the
  // seed, on a generated theme) must reach context.json as data and the prose
  // surfaces as words — an agent reading any one of them learns the theme is
  // flat, spacious and serif, not only "editorial".

  it("carries a generated theme's axes and seed into context.json, context.md and llms.txt", async () => {
    await init(["--theme", "editorial"]);
    await add(["button"]);

    const data = await generateContext(TEST_DIR);
    const theme = data.theme as any;
    expect(theme.name).toBe("editorial");
    expect(theme.axes).toBeDefined();
    expect(theme.axes.depth).toBe("flat");
    expect(theme.axes.type.pairing).toBe("serif-editorial");
    expect(theme.axes.density).toBe("spacious");
    expect(theme.seed).toBeDefined();
    expect(theme.seed.name).toBe("editorial");
    expect(theme.seed.accent).toBe("#1e3a5f");

    const parsed = JSON.parse(formatContextJSON(data));
    expect(parsed.theme.axes.depth).toBe("flat");
    expect(parsed.theme.seed.type.pairing).toBe("serif-editorial");

    const expected = axisSummary(theme.axes);
    const md = formatContextMarkdown(data);
    expect(md).toContain(`- Axes: ${expected}`);
    expect(md).toContain("- Seed: generated — `faqir theme generate editorial --seed editorial.seed.json`");
    expect(md).toContain("- Nearest theme: nordic (7 axes apart");

    const llms = formatContextLlms(data);
    expect(llms).toContain("Active theme `editorial`:");
    expect(llms).toContain(`- Axes: ${expected}`);
    expect(llms).toContain("- Seed: generated");

    const full = formatContextLlmsFull(data);
    expect(full).toContain(`- Axes: ${expected}`);

    const rules = formatContextCursorRules(data);
    expect(rules).toContain(`Theme axes: ${expected}.`);
  });

  it("carries an authored theme's axes (and no seed) into every surface", async () => {
    await init(["--theme", "glass"]);
    await add(["button"]);

    const data = await generateContext(TEST_DIR);
    const theme = data.theme as any;
    expect(theme.name).toBe("glass");
    expect(theme.axes.depth).toBe("glass");
    expect(theme.seed).toBeUndefined();

    const expected = axisSummary(theme.axes);
    expect(formatContextMarkdown(data)).toContain(`- Axes: ${expected}`);
    expect(formatContextMarkdown(data)).not.toContain("- Seed:");
    expect(formatContextLlms(data)).toContain(`- Axes: ${expected}`);
    expect(formatContextLlmsFull(data)).toContain(`- Axes: ${expected}`);
    expect(formatContextCursorRules(data)).toContain(`Theme axes: ${expected}.`);
  });

  it("says a print companion has no axes rather than leaving the block short", async () => {
    await init(["--theme", "editorial-document"]);
    await add(["button"]);

    const data = await generateContext(TEST_DIR);
    expect((data.theme as any).axes).toBeUndefined();
    const md = formatContextMarkdown(data);
    expect(md).toContain("- Axes: none — a print companion");
    expect(formatContextLlms(data)).toContain("- Axes: none — a print companion");
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

  it("documents density mode so agents discover it (task 0.7-11)", async () => {
    await init([]);
    await add(["button"]);

    const data = await generateContext(TEST_DIR);

    // The structured block — what an agent reads out of context.json.
    expect(data.density.attribute).toBe("data-density");
    expect(data.density.values).toEqual(["comfortable", "compact"]);
    expect(data.density.default).toBe("comfortable");
    expect(data.density.stylesheet).toBe("tokens/density.css");
    expect(data.density.example).toContain('data-density="compact"');
    expect(data.density.remaps.join(" ")).toContain("--control-height-");
    expect(data.density.remaps.join(" ")).toContain("--space-");
    // It must be described as what it is: not a sixth protocol attribute.
    expect(data.density.notes.join(" ")).toContain("five-attribute protocol");
    expect(Object.keys(data.protocol).filter((k) => k.startsWith("data-")).length).toBe(0);

    // It survives into context.json and both prose renderings.
    const parsed = JSON.parse(formatContextJSON(data));
    expect(parsed.density.attribute).toBe("data-density");
    // Each renderer keeps its own heading case ("Density Mode" / "Density mode").
    for (const text of [formatContextMarkdown(data), formatContextLlmsFull(data)]) {
      expect(text).toMatch(/^## Density [Mm]ode$/m);
      expect(text).toContain('data-density="compact"');
      expect(text).toContain("tokens/density.css");
    }
    expect(formatContextLlms(data)).toContain("llms-full.txt#density-mode");
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

// ── the rules vocabulary, on every surface an agent reads ──────────────────
//
// [1.1B-07] Rules are a plugin, a directive, a magic and a package, and an
// agent meets them through generated text rather than through this repo. What
// is asserted here is not the wording — that comes from the plugin's own header
// and moves with it — but that each surface carries the NAME and a contract
// beside it, so nothing in the set can be added to the registry and left
// undocumented on the way out.
describe("rules reach the generated agent surfaces", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("context.json names the plugin, both of the things it provides, and its contract", async () => {
    await init([]);
    const data = await generateContext(TEST_DIR);

    const plugin = data.plugins["faqir-rules"];
    expect(plugin).toBeDefined();
    expect(plugin.file).toBe("core/plugins/faqir-rules.js");
    // `$rules` is registered by the plugin, so it belongs in `provides` beside
    // the directive — `$persist()` has been there since 0.6 and this is the
    // same case. Derived from the `@ui:provides` header, not restated here.
    expect(plugin.provides).toEqual(["l-rules", "$rules"]);
    expect(plugin.description).toContain("one JSON definition");
    // The counter is what an agent reads first; six plugins, not four.
    expect(data.meta.plugin_count).toBe(Object.keys(data.plugins).length);
    expect(data.meta.plugin_count).toBeGreaterThanOrEqual(6);
  });

  it("every text surface carries the plugin with its one-line contract", async () => {
    await init([]);
    const data = await generateContext(TEST_DIR);
    const skill = await generateSkill(TEST_DIR);

    for (const [label, output] of [
      ["context.md", formatContextMarkdown(data)],
      [".cursorrules", formatContextCursorRules(data)],
      ["llms-full.txt", formatContextLlmsFull(data)],
      ["SKILL.md", skill],
    ] as const) {
      expect(output, `${label} does not name faqir-rules`).toContain("faqir-rules");
      expect(output, `${label} does not name l-rules`).toContain("l-rules");
      expect(output, `${label} does not name $rules`).toContain("$rules");
      expect(output, `${label} states no contract for it`).toContain("one JSON definition");
    }
  });

  it("documents `.async` as a validate modifier, in the skill's own directive reference", async () => {
    // The modifier half of the task: an agent writing an async check needs to
    // be told the spelling AND what it costs (`data-state="validating"`).
    const reference = await Bun.file(
      join(import.meta.dir, "../../.claude/skills/faqir-creator/references/directives.md"),
    ).text();
    expect(reference).toContain("l-validate:taken.async");
    // Not just present in an example — carried in the modifier table with the
    // sentence the plugin's own `@ui:modifier` line declares.
    const row = reference.split("\n").find((line) => line.startsWith("| `l-validate.async` |"));
    expect(row, "the directives reference has no modifier row for `.async`").toBeDefined();
    expect(row).toContain("promise");
    expect(row).toContain("validating");
    expect(reference).toContain("l-rules");
  });

  it("classifies l-rules as a data surface in the security block", async () => {
    await init([]);
    const data = await generateContext(TEST_DIR);
    expect(Object.keys(data.security.safe)).toContain("l-rules");
    expect(data.security.safe["l-rules"]).toContain("never compiled as JavaScript");
  });
});
