// Manifest-derived skill generator tests (task 0.5-07).
//
//  • Project skill: a section per installed component with anatomy + variants
//    matching the manifest; carries the generation header; regenerates
//    idempotently.
//  • Shipped skill: covers every registry component, carries the header, and the
//    committed files equal a fresh generation (the `check:skill` CI gate).
//  • Shipped artifact surface (1.0R-01): the generated directory is the only
//    shipped skill artifact — no packed `.skill` zip that no gate can see — and
//    FAQIR-PROTO-INTEGRATION.md's install paths resolve on disk.
//  • Token reference (1.0R-02): `references/tokens.md` is derived from
//    `registry/tokens/*.css` and cross-checked against it in BOTH directions.
//  • Directive reference (1.0R-03): `references/directives.md` is derived from
//    the engine's declared vocabulary plus the plugin headers, with a tripwire
//    that fails on any `l-…` or `$…` the engine has and the reference lacks.
//  • Manifest reference (1.0R-04): `references/manifest.md` is walked out of
//    `manifest.schema.json` — every property, the required/optional split and
//    every closed enum — so a field added to the contract cannot go undocumented.
//  • Surface completion (1.0R-05): the CLI section is derived from the command
//    registry, the Scaffolds and Themes sections from the scaffold catalogue and
//    `registry/themes/*.theme.json`, and every capability the frontmatter
//    advertises is backed by a section — all three checked in both directions.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { SCHEMA_VERSION } from "../../src/version";
import { TOKEN_MODIFIERS } from "../../src/protocol";
import {
  enginePath,
  FRONTMATTER_CAPABILITIES,
  generateSkill,
  generateShippedSkillFiles,
  manifestExample,
  parseEngineMap,
  parseEngineVocabulary,
  parseSourceController,
  renderDirectivesReference,
  renderManifestReference,
  renderScaffolds,
  renderThemes,
  renderTokensReference,
  shippedSkillDir,
  SKILL_GENERATION_MARKER,
  type KindFileSet,
} from "../../src/generator/skill";
import { loadPluginMetadata } from "../../src/generator/plugins";
import { COMMAND_DEFINITIONS, COMMAND_NAMES } from "../../src/command-registry";
import { SCAFFOLDS } from "../../src/scaffolds/registry";
import { validateManifest } from "../../src/manifest";
import { validateAgainstSchema } from "../../src/utils/json-schema";

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
    // The schema is versioned `<major>.<minor>` since the 1.0-01 freeze — the
    // patch digit said nothing, because a schema patch is not a thing that can
    // exist under "additive only". Asserted against the constant, not a shape.
    expect(content).toContain(`schema_version ${SCHEMA_VERSION}`);
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

  it("generates SKILL.md plus one reference file per layer, tokens, directives and the manifest", async () => {
    const files = await generateShippedSkillFiles();
    const rels = files.map((f) => f.relPath);
    expect(rels).toContain("SKILL.md");
    expect(rels).toContain(join("references", "primitives.md"));
    expect(rels).toContain(join("references", "recipes.md"));
    expect(rels).toContain(join("references", "patterns.md"));
    expect(rels).toContain(join("references", "tokens.md"));
    expect(rels).toContain(join("references", "directives.md"));
    expect(rels).toContain(join("references", "manifest.md"));
    // What `check:skill` counts — since 1.0R-04 that is the whole skill
    // directory: seven generated files, every one of them gated.
    expect(files.length).toBe(7);
    expect(readdirSync(join(shippedSkillDir(), "references")).sort()).toEqual(
      rels
        .filter((rel) => rel !== "SKILL.md")
        .map((rel) => rel.split(/[\\/]/).pop()!)
        .sort(),
    );
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


// ---------------------------------------------------------------------------
// Surface completion (task 1.0R-05)
//
// The skill's frontmatter is its routing surface — Claude Code matches tasks on
// it — so a promise there with nothing behind it routes work to a skill that
// cannot answer. Three surfaces had drifted: the CLI list was five commands
// behind the registry, `faqir scaffold` was never named at all (so an agent
// asked for an invoice hand-composed one), and not one of the twelve shipped
// themes was, so "make it dark" had nothing to choose from. All three are now
// derived, and checked here in BOTH directions.
// ---------------------------------------------------------------------------

/** The body of one `## Heading` section of a generated markdown file. */
function section(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** The first cell of every ``| `x` | …`` row in a markdown table. */
function tableKeys(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((line) => /^\| `/.test(line))
    .map((line) => line.split("|")[1]!.trim().replace(/`/g, ""));
}

describe("shipped skill CLI reference", () => {
  let skill = "";

  beforeEach(async () => {
    const files = await generateShippedSkillFiles();
    skill = files.find((f) => f.relPath === "SKILL.md")!.content;
  });

  /** Command names the CLI section actually invokes, in order. */
  function documentedCommands(md: string): string[] {
    return section(md, "## CLI Reference")
      .split("\n")
      .filter((line) => /^faqir \S/.test(line))
      .map((line) => line.split(/\s+/)[1]!);
  }

  it("gives every registered command a line", () => {
    const documented = documentedCommands(skill);
    for (const name of COMMAND_NAMES) expect(documented).toContain(name);
  });

  it("invokes nothing the registry does not dispatch", () => {
    for (const name of documentedCommands(skill)) expect(COMMAND_NAMES).toContain(name);
  });

  it("covers the five commands the hand-written list had fallen behind on", () => {
    const documented = documentedCommands(skill);
    for (const name of ["doctor", "variant", "scaffold", "dev", "bindings"]) {
      expect(documented).toContain(name);
    }
  });

  it("states each command's own args and gloss, not a paraphrase", () => {
    const cli = section(skill, "## CLI Reference");
    for (const [name, def] of Object.entries(COMMAND_DEFINITIONS)) {
      const invocation = `faqir ${name}${def.args ? ` ${def.args}` : ""}`;
      expect(cli).toContain(invocation);
      expect(cli).toContain(`# ${def.skillNote ?? def.summary}`);
    }
  });

  it("picks up a command registered with no generator edit", async () => {
    COMMAND_DEFINITIONS["teleport"] = {
      run: async () => {},
      category: "Development",
      summary: "Teleport a component",
      args: "<component> --to <page>",
      skillNote: "teleport a component onto another page",
    };
    try {
      const files = await generateShippedSkillFiles();
      const regenerated = files.find((f) => f.relPath === "SKILL.md")!.content;
      expect(documentedCommands(regenerated)).toContain("teleport");
      expect(section(regenerated, "## CLI Reference")).toContain(
        "faqir teleport <component> --to <page>",
      );
    } finally {
      delete COMMAND_DEFINITIONS["teleport"];
    }
  });

  it("groups commands under the same categories `faqir help` prints", () => {
    const cli = section(skill, "## CLI Reference");
    for (const category of new Set(Object.values(COMMAND_DEFINITIONS).map((d) => d.category))) {
      expect(cli).toContain(`**${category}**`);
    }
  });
});

describe("shipped skill scaffold catalogue", () => {
  let skill = "";

  beforeEach(async () => {
    const files = await generateShippedSkillFiles();
    skill = files.find((f) => f.relPath === "SKILL.md")!.content;
  });

  it("gives every registered scaffold a row, and invents none", () => {
    const rows = tableKeys(section(skill, "## Scaffolds — Whole Pages and Documents"));
    expect(rows.sort()).toEqual(Object.keys(SCAFFOLDS).sort());
  });

  it("names the five shipped scaffolds the frontmatter implies", () => {
    const rows = tableKeys(section(skill, "## Scaffolds — Whole Pages and Documents"));
    for (const name of ["landing-page", "admin-dashboard", "internal-tool", "invoice", "report"]) {
      expect(rows).toContain(name);
    }
  });

  it("carries each scaffold's own description and patterns", () => {
    const scaffolds = section(skill, "## Scaffolds — Whole Pages and Documents");
    for (const def of Object.values(SCAFFOLDS)) {
      expect(scaffolds).toContain(def.description);
      for (const pattern of def.patterns) expect(scaffolds).toContain(`\`${pattern}\``);
    }
  });

  it("tells an agent to run the generator rather than hand-compose", () => {
    const scaffolds = section(skill, "## Scaffolds — Whole Pages and Documents");
    expect(scaffolds).toContain("faqir scaffold ");
    expect(scaffolds).toContain("FAQIR_REPLACE");
  });

  it("picks up a scaffold registered with no generator edit", () => {
    SCAFFOLDS["press-kit"] = {
      name: "press-kit",
      title: "Press Kit",
      description: "Press kit with boilerplate, assets, and contacts",
      patterns: ["hero"],
      components: ["card"],
    };
    try {
      const rows = tableKeys(renderScaffolds().join("\n"));
      expect(rows).toContain("press-kit");
    } finally {
      delete SCAFFOLDS["press-kit"];
    }
  });
});

describe("shipped skill theme gallery", () => {
  const THEMES_DIR = join(REPO, "registry", "themes");
  let skill = "";

  beforeEach(async () => {
    const files = await generateShippedSkillFiles();
    skill = files.find((f) => f.relPath === "SKILL.md")!.content;
  });

  /** Every `{name}.theme.json` shipped in the registry. */
  function shippedThemes(): string[] {
    return readdirSync(THEMES_DIR)
      .filter((f) => f.endsWith(".theme.json"))
      .map((f) => f.replace(/\.theme\.json$/, ""))
      .sort();
  }

  it("gives every `*.theme.json` a row, and invents none", () => {
    expect(tableKeys(section(skill, "## Themes")).sort()).toEqual(shippedThemes());
  });

  it("carries each theme's mood and scheme, read from its manifest", () => {
    const themes = section(skill, "## Themes");
    for (const name of shippedThemes()) {
      const manifest = JSON.parse(readFileSync(join(THEMES_DIR, `${name}.theme.json`), "utf8"));
      const row = themes.split("\n").find((line) => line.startsWith(`| \`${name}\` |`))!;
      expect(row).toBeDefined();
      for (const mood of manifest.mood) expect(row).toContain(mood);
      expect(row).toContain(manifest.scheme);
      expect(row).toContain(manifest.dark_mode);
    }
  });

  it("gives an agent asked for dark a theme it can actually pass", () => {
    const themes = section(skill, "## Themes");
    const dark = themes
      .split("\n")
      .filter((line) => /^\| `/.test(line) && /\bdark\b/.test(line))
      .map((line) => line.split("|")[1]!.trim().replace(/`/g, ""));
    expect(dark.length).toBeGreaterThan(0);
    for (const name of dark) expect(existsSync(join(THEMES_DIR, `${name}.css`))).toBe(true);
    expect(themes).toContain("faqir theme set <name>");
  });

  it("picks up a theme manifest added with no generator edit", () => {
    const dir = join(TEST_DIR, "registry");
    mkdirSync(join(dir, "themes"), { recursive: true });
    try {
      writeFileSync(
        join(dir, "themes", "sepia.theme.json"),
        JSON.stringify({
          name: "sepia",
          version: "1.0.0",
          mood: ["warm", "archival"],
          scheme: "light",
          dark_mode: "none",
          tokens_overridden: ["color-bg"],
          tokens_inherited: [],
          pairs_with: ["paper"],
          preview: "sepia.preview.html",
        }),
      );
      const rendered = renderThemes(dir).join("\n");
      expect(tableKeys(rendered)).toEqual(["sepia"]);
      expect(rendered).toContain("warm, archival");
      expect(rendered).toContain("`paper`");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("shipped skill frontmatter promises", () => {
  let skill = "";
  let description = "";

  beforeEach(async () => {
    const files = await generateShippedSkillFiles();
    skill = files.find((f) => f.relPath === "SKILL.md")!.content;
    description = skill.split("\n").find((l) => l.startsWith("description: "))!.slice(13);
  });

  it("claims in the frontmatter only what the body has a section for", () => {
    for (const { claim, section: heading } of FRONTMATTER_CAPABILITIES) {
      expect(description).toContain(claim);
      expect(skill.split("\n")).toContain(heading);
    }
  });

  it("backs the three capabilities 1.0R-05 found unbacked", () => {
    const claims = FRONTMATTER_CAPABILITIES.map((c) => c.claim);
    expect(claims).toContain("page scaffolding");
    expect(claims).toContain("printable documents (invoices, reports, forms)");
    expect(claims).toContain("theme selection");
  });

  it("fails when a claimed capability loses its section", () => {
    // The tripwire itself: strike the Themes heading and the promise is unbacked.
    const withoutThemes = skill.split("\n").filter((l) => l !== "## Themes");
    const themeClaim = FRONTMATTER_CAPABILITIES.find((c) => c.section === "## Themes")!;
    expect(withoutThemes).not.toContain(themeClaim.section);
  });
});

// ---------------------------------------------------------------------------
// Shipped artifact surface (task 1.0R-01)
//
// The generated directory `.claude/skills/faqir-creator/` is the ONLY shipped
// agent surface, and `check:skill` gates it. A packed `.skill` zip alongside it
// would be a second artifact no gate can look inside, so none may be tracked —
// and the integration doc must point readers at the directory instead.
// ---------------------------------------------------------------------------

describe("shipped skill artifact surface", () => {
  const INTEGRATION_DOC = join(REPO, "FAQIR-PROTO-INTEGRATION.md");

  it("tracks no packed `.skill` archive at the repo root", async () => {
    const proc = Bun.spawn(["git", "ls-files", "-z", "--", "*.skill", ":(glob)*.skill"], {
      cwd: REPO,
      stdout: "pipe",
      stderr: "pipe",
    });
    const tracked = (await new Response(proc.stdout).text()).split("\0").filter(Boolean);
    expect(tracked).toEqual([]);
  });

  it("leaves no packed `.skill` archive on disk at the repo root", () => {
    const archives = readdirSync(REPO).filter((n) => n.endsWith(".skill"));
    expect(archives).toEqual([]);
  });

  it("FAQIR-PROTO-INTEGRATION.md no longer instructs unzipping an archive", async () => {
    const doc = await Bun.file(INTEGRATION_DOC).text();
    expect(doc).not.toMatch(/unzip/i);
    expect(doc).not.toMatch(/\.skill\b/);
  });

  it("FAQIR-PROTO-INTEGRATION.md points at the generated skill directory", async () => {
    const doc = await Bun.file(INTEGRATION_DOC).text();
    expect(doc).toContain("faqir/.claude/skills/faqir-creator/");
  });

  it("every faqir-repo path FAQIR-PROTO-INTEGRATION.md names resolves on disk", async () => {
    const doc = await Bun.file(INTEGRATION_DOC).text();
    // The doc is written from proto's side, where this repo is a sibling checkout:
    // a backticked path rooted at `faqir/`, `registry/` or `.claude/` refers here.
    // (`proto/...` paths are the reader's repo and are deliberately not matched.)
    const cited = new Set<string>();
    for (const [, path] of doc.matchAll(/`((?:faqir|registry|\.claude)\/[A-Za-z0-9._/-]*)`/g)) {
      cited.add(path.replace(/^faqir\//, "").replace(/\/$/, ""));
    }
    expect(cited.size).toBeGreaterThan(0);
    const missing = [...cited].filter((p) => !existsSync(join(REPO, p)));
    expect(missing).toEqual([]);
    // The install instruction's target specifically.
    expect(cited).toContain(".claude/skills/faqir-creator");
  });
});

// ---------------------------------------------------------------------------
// Token reference (task 1.0R-02)
//
// `references/tokens.md` is generated from `registry/tokens/*.css`. The check
// that matters runs BOTH ways (the shape 0.9-12 established): every token the
// sources declare is documented, and every token the reference names is
// declared. A hand-added row and a forgotten token fail the same test.
// ---------------------------------------------------------------------------

describe("shipped token reference", () => {
  const TOKENS_DIR = join(REPO, "registry", "tokens");
  const REFERENCE = renderTokensReference(join(REPO, "registry"), SCHEMA_VERSION);
  /** The reference minus its generation header (which carries `<!--`/`-->`). */
  const BODY = REFERENCE.split("\n").slice(1).join("\n");

  /** Every custom property declared anywhere under `registry/tokens/`. */
  function declaredTokens(): Set<string> {
    const out = new Set<string>();
    for (const file of new Bun.Glob("*.css").scanSync({ cwd: TOKENS_DIR })) {
      const css = readFileSync(join(TOKENS_DIR, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/--([a-z0-9-]+)\s*:/gi)) out.add(m[1]);
    }
    return out;
  }

  /** Every token name the reference mentions — table cell, value or prose alike. */
  function documentedTokens(markdown: string): Set<string> {
    const out = new Set<string>();
    // `[a-z0-9]` after the dashes so a `|---|` table rule is never read as a token.
    for (const m of markdown.matchAll(/--([a-z0-9][a-z0-9-]*)/g)) out.add(m[1]);
    return out;
  }

  /** The declarations of one `[data-density]` scope, parsed independently. */
  function densityScope(scope: string): Map<string, string> {
    const css = readFileSync(join(TOKENS_DIR, "density.css"), "utf8");
    const body = new RegExp(`\\[data-density="${scope}"\\]\\s*\\{([^}]*)\\}`).exec(css)![1];
    const out = new Map<string, string>();
    for (const m of body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      out.set(m[1], m[2].trim().replace(/\s+/g, " "));
    }
    return out;
  }

  const sorted = (values: Iterable<string>) => [...values].sort();

  it("documents every declared token and declares every documented token", () => {
    expect(sorted(documentedTokens(BODY))).toEqual(sorted(declaredTokens()));
  });

  it("carries every `:root` value verbatim", () => {
    for (const file of new Bun.Glob("*.css").scanSync({ cwd: TOKENS_DIR })) {
      // Comments go first: `document.css` documents `@page { … }` inside one,
      // and its `}` would otherwise close the `:root` block early.
      const css = readFileSync(join(TOKENS_DIR, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
        for (const m of block[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
          const value = m[2].trim().replace(/\s+/g, " ");
          expect(BODY, `--${m[1]}: ${value} (${file}) is not in the reference`).toContain(
            `| \`--${m[1]}\` | \`${value}\` |`,
          );
        }
      }
    }
  });

  it("carries the surface ramp, the measure ladder and the control-height ramp", () => {
    for (const token of [
      "--color-surface-1",
      "--color-surface-2",
      "--color-surface-1-border",
      "--color-surface-2-border",
      "--measure-narrow",
      "--measure-content",
      "--measure-wide",
      "--measure-prose",
      "--control-height-sm",
      "--control-height-md",
      "--control-height-lg",
      "--leading-loose",
    ]) {
      expect(BODY, `${token} is missing`).toContain(`| \`${token}\` |`);
    }
  });

  it("groups by the `@ui:tokens` header each source file carries", () => {
    for (const file of new Bun.Glob("*.css").scanSync({ cwd: TOKENS_DIR })) {
      if (file === "index.css") continue;
      const css = readFileSync(join(TOKENS_DIR, file), "utf8");
      const group = /@ui:tokens\s+(\S+)/.exec(css)![1];
      expect(BODY, `no section for the \`${group}\` group`).toContain(`## ${group}`);
      expect(BODY).toContain(`\`registry/tokens/${file}\``);
    }
  });

  it("states the token modifiers as TOKEN_MODIFIERS, row for row", () => {
    const rows = BODY.split("\n")
      .filter((line) => line.startsWith("| `data-"))
      .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()));
    expect(rows.map((r) => r[0])).toEqual(TOKEN_MODIFIERS.map((m) => `\`${m.attr}\``));
    for (const [i, m] of TOKEN_MODIFIERS.entries()) {
      expect(rows[i][1]).toBe(m.purpose);
      expect(rows[i][2]).toBe(m.values.map((v) => `\`${v}\``).join(", "));
      expect(rows[i][3]).toBe(m.owner);
      expect(rows[i][4]).toBe(m.scope);
    }
  });

  it("derives the density remap from density.css, both scopes", () => {
    const compact = densityScope("compact");
    const comfortable = densityScope("comfortable");
    expect(compact.size).toBeGreaterThan(0);
    for (const [name, value] of compact) {
      expect(BODY, `--${name} missing from the density table`).toContain(
        `| \`--${name}\` | \`${value}\` | \`${comfortable.get(name)}\` |`,
      );
    }
    // The invariants are computed, not written: `--space-0` and `--space-px` are
    // declared in `spacing` and absent from both scopes.
    expect(BODY).toContain("Invariant in `spacing`: `--space-0`, `--space-px`");
  });

  it("picks up a remap added to density.css without editing the generator", () => {
    const fixture = join(TEST_DIR, "fixture-registry");
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(fixture, "tokens"), { recursive: true });
    try {
      writeFileSync(
        join(fixture, "tokens", "index.css"),
        "/* @ui:tokens index */\n@import './spacing.css';\n@import './density.css';\n",
      );
      writeFileSync(
        join(fixture, "tokens", "spacing.css"),
        "/* @ui:tokens spacing — a two-step ladder */\n:root {\n  --space-1: 0.25rem; /* 4px */\n  --gap-invented: 3px;\n}\n",
      );
      writeFileSync(
        join(fixture, "tokens", "density.css"),
        '/* @ui:tokens density — scoped remap */\n[data-density="compact"] {\n' +
          "  --space-1: 0.125rem;\n  --gap-invented: 2px;\n}\n" +
          '[data-density="comfortable"] {\n  --space-1: 0.25rem;\n  --gap-invented: 3px;\n}\n',
      );
      const md = renderTokensReference(fixture, SCHEMA_VERSION);
      // The freshly invented token is remapped and documented as such — nothing
      // in the generator names it.
      expect(md).toContain("## spacing — a two-step ladder");
      expect(md).toContain("| `--gap-invented` | `3px` |");
      expect(md).toContain("| `--gap-invented` | `2px` | `3px` |");
      expect(md).toContain("Remapped by source group: `spacing` (2)");
    } finally {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Directive reference (task 1.0R-03)
//
// `references/directives.md` is generated from the engine's declared vocabulary
// (§3.0 of `src/core-src/engine.js`) and the plugin headers. The tripwire is the
// point: grep the engine for every `l-…` and `$…` name it mentions and hold it
// against the declarations, in both directions. A directive added to the engine
// without a declaration fails here; so does a declaration for something the
// engine does not implement.
// ---------------------------------------------------------------------------

describe("shipped directive reference", () => {
  const ENGINE = readFileSync(enginePath(), "utf8");
  const PLUGINS_DIR = join(REPO, "registry", "core", "plugins");
  const VOCAB = parseEngineVocabulary(ENGINE);
  const REFERENCE = renderDirectivesReference(ENGINE, PLUGINS_DIR, SCHEMA_VERSION);
  const plugins = loadPluginMetadata(PLUGINS_DIR);

  /**
   * Every `l-…` name the engine source mentions, code and comments alike.
   *
   * The word boundary is load-bearing: without it the scan reads `l-drawer` out
   * of the middle of `#detail-drawer` in a prose comment and demands
   * documentation for a directive that does not exist. A directive name is
   * always a whole token — quoted, backticked, or standing alone.
   */
  const implemented = new Set([...ENGINE.matchAll(/\bl-[a-z][a-z-]*/g)].map((m) => m[0]));
  /** Every `$…` name it mentions. */
  const implementedMagics = new Set([...ENGINE.matchAll(/\$[a-zA-Z][a-zA-Z0-9]*/g)].map((m) => m[0]));

  const sorted = (values: Iterable<string>) => [...values].sort();

  it("declares every `l-…` the engine mentions, and mentions every one it declares", () => {
    // Plugin directives appear in the engine only as comments about plugins;
    // they are documented from the plugin headers instead.
    const fromPlugins = new Set(
      plugins.flatMap((p) => p.provides).filter((v) => v.startsWith("l-")),
    );
    const declared = new Set(VOCAB.directives.map((d) => d.name));
    const internal = new Set(
      VOCAB.directives.filter((d) => d.placement === "internal").map((d) => d.name),
    );

    const undocumented = [...implemented].filter(
      (name) => !declared.has(name) && !fromPlugins.has(name),
    );
    expect(undocumented, "an `l-…` the engine has that nothing documents").toEqual([]);
    // Internal declarations must carry their reason, not just an exemption.
    for (const d of VOCAB.directives.filter((x) => internal.has(x.name))) {
      expect(d.description.length, `${d.name} is declared internal without a reason`).toBeGreaterThan(20);
    }
    // The other direction: nothing declared that the engine never mentions.
    expect(sorted([...declared].filter((name) => !implemented.has(name)))).toEqual([]);
  });

  it("declares every `$…` the engine mentions, naming the internals as internals", () => {
    const declared = new Set(VOCAB.magics.map((m) => m.name));
    expect(sorted(implementedMagics)).toEqual(sorted(declared));

    // `$scope` is the evaluator's own `with()` binding, not vocabulary: it must
    // be declared internal WITH a reason and must not sit in the magic table.
    const internal = VOCAB.magics.filter((m) => m.where === "internal");
    expect(internal.map((m) => m.name)).toContain("$scope");
    for (const m of internal) {
      expect(m.description.length, `${m.name} is declared internal without a reason`).toBeGreaterThan(20);
      expect(REFERENCE, `${m.name} is dropped rather than named`).toContain(m.name);
      expect(REFERENCE).not.toContain(`| \`${m.name}\` | every expression |`);
    }
    expect(REFERENCE).toContain("**Not vocabulary:**");
  });

  it("documents every declared directive, modifier and magic as a row", () => {
    for (const d of VOCAB.directives) {
      expect(REFERENCE, `${d.attribute} has no row`).toContain(`| \`${d.attribute}\` |`);
      expect(REFERENCE, `${d.attribute} has no example`).toContain(d.example.replace(/\|/g, "\\|"));
    }
    for (const m of VOCAB.modifiers) {
      expect(REFERENCE, `${m.directive}${m.modifier} has no row`).toContain(`| \`${m.modifier}\` |`);
    }
    for (const m of VOCAB.magics.filter((x) => x.where !== "internal")) {
      expect(REFERENCE, `${m.name} has no row`).toContain(`| \`${m.name}\` |`);
    }
  });

  it("covers what the hand-written file missed: transition, teleport, key, plugins", () => {
    for (const missing of ["l-transition", "l-teleport", "l-key", "data-motion"]) {
      expect(REFERENCE, `${missing} is still absent`).toContain(missing);
    }
    for (const provided of plugins.flatMap((p) => p.provides)) {
      expect(REFERENCE, `${provided} is not documented`).toContain(`\`${provided}\``);
    }
  });

  it("no longer documents key combos the engine never implemented", () => {
    // The hand-written file listed `.ctrl` / `.shift` / `.alt` / `.meta` as
    // modifiers; `handleOn` has never looked at them.
    for (const combo of ["`.ctrl`", "`.shift`", "`.alt`", "`.meta`"]) {
      expect(REFERENCE).not.toContain(`| ${combo} |`);
    }
  });

  it("reads the key modifiers out of KEY_MAP", () => {
    const keys = parseEngineMap(ENGINE, "KEY_MAP");
    expect(keys.length).toBeGreaterThan(10);
    for (const [modifier, key] of keys) {
      expect(REFERENCE, `.${modifier} is missing`).toContain(`| \`.${modifier}\` |`);
      if (key.trim()) expect(REFERENCE).toContain(`\`${key}\``);
    }
  });

  it("takes `data-motion`'s phases from TOKEN_MODIFIERS", () => {
    const motion = TOKEN_MODIFIERS.find((m) => m.attr === "data-motion")!;
    expect(motion.values.length).toBe(4);
    expect(REFERENCE).toContain(`- **Values:** ${motion.values.map((v) => `\`${v}\``).join(", ")}`);
    expect(REFERENCE).toContain(`- **Purpose:** ${motion.purpose}`);
    expect(REFERENCE).toContain(`- **Scope:** ${motion.scope}`);
    expect(REFERENCE).toContain(`show:  data-motion="${motion.values[0]}"`);
    expect(REFERENCE).toContain(`hide:  data-motion="${motion.values[2]}"`);
  });

  it("takes the `l-transition` presets from MOTION_PRESETS", () => {
    const presets = parseEngineMap(ENGINE, "MOTION_PRESETS").map(([name]) => name);
    expect(presets).toEqual(["fade", "slide-up", "scale"]);
    for (const preset of presets) expect(REFERENCE).toContain(`\`${preset}\``);
  });

  it("takes the `$source` controller API from the engine's own `ctrl` literal", () => {
    const methods = parseSourceController(ENGINE);
    // Cross-checked against an independent scan of the engine: every property
    // the controller is given, however it is written.
    const body = ENGINE.slice(ENGINE.indexOf("var ctrl = {"));
    const independent = [...body.slice(0, body.indexOf("\n    };")).matchAll(/^ {6}(\w+):/gm)].map(
      (m) => m[1],
    );
    expect(methods.map((m) => m.name)).toEqual(independent);
    expect(independent).toContain("startPolling");
    for (const m of methods) expect(REFERENCE).toContain(`\`${m.name}(${m.params})\``);
  });

  it("gives every plugin file a row, read from its `@ui:provides` header", () => {
    const files = readdirSync(PLUGINS_DIR).filter((f) => f.endsWith(".js"));
    expect(files.length).toBe(plugins.length);
    for (const p of plugins) {
      expect(REFERENCE, `${p.name} has no row`).toContain(`| \`${p.name}\` |`);
      expect(REFERENCE).toContain(`registry/core/plugins/${p.file}`);
      for (const provided of p.provides) expect(REFERENCE).toContain(`\`${provided}\``);
    }
  });

  it("picks up a sixth plugin with no generator edit", () => {
    const fixture = join(TEST_DIR, "fixture-plugins");
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(fixture, { recursive: true });
    try {
      writeFileSync(
        join(fixture, "faqir-invented.js"),
        "// @ui:plugin faqir-invented\n// @ui:provides l-invented, $invented()\n" +
          "/**\n * faqir-invented — a plugin no generator knows about. [9.9-99]\n *\n" +
          ' *   <div l-invented="x"></div>\n *\n * It exists only in this fixture.\n */\n',
      );
      const md = renderDirectivesReference(ENGINE, fixture, SCHEMA_VERSION);
      expect(md).toContain("| `faqir-invented` | `l-invented`, `$invented()` |");
      // Header prose and example travel with it — and the plan/spec reference
      // in the summary does not.
      expect(md).toContain('<div l-invented="x"></div>');
      expect(md).toContain("It exists only in this fixture.");
      expect(md).toContain("a plugin no generator knows about. |");
      expect(md).not.toContain("[9.9-99]");
    } finally {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("renders an internal directive declaration as a named exemption, not a row", () => {
    // No engine directive is internal today; the fixture proves the path an
    // engine hacker would use exists and does not silently drop the name.
    const fixture =
      "  // @ui:directive l-probe | — | internal | l-probe | Never bound — the walker only tests for it.\n" +
      "  // @ui:magic $el | every expression | The element.\n";
    const md = renderDirectivesReference(fixture, PLUGINS_DIR, SCHEMA_VERSION);
    expect(md).not.toContain("| `l-probe` |");
    const vocab = parseEngineVocabulary(fixture);
    expect(vocab.directives[0].placement).toBe("internal");
    expect(vocab.directives[0].description).toContain("the walker only tests for it");
  });

  it("is one of the files `check:skill` gates", async () => {
    const files = await generateShippedSkillFiles();
    expect(files.map((f) => f.relPath).sort()).toEqual(
      [
        "SKILL.md",
        join("references", "directives.md"),
        join("references", "manifest.md"),
        join("references", "patterns.md"),
        join("references", "primitives.md"),
        join("references", "recipes.md"),
        join("references", "tokens.md"),
      ].sort(),
    );
    const committed = readFileSync(
      join(shippedSkillDir(), "references", "directives.md"),
      "utf8",
    );
    expect(committed).toBe(REFERENCE);
  });
});

// ---------------------------------------------------------------------------
// Manifest reference (task 1.0R-04)
//
// `references/manifest.md` is walked out of `manifest.schema.json`. The old file
// was hand-maintained and wrong in a way nothing could see: nine categories
// against the schema's eleven, no `$schema` / `props` / `changes` / `aliases` /
// `variants.<group>.responsive`, and — worst — no statement that all seventeen
// component fields are required, so its "Full Schema" block read as if they
// were optional. The checks below run in both directions: every property and
// every enum value the schema declares must appear, and a property added to the
// schema must change the generated bytes (which is what fails `check:skill`).
// ---------------------------------------------------------------------------

describe("shipped manifest reference", () => {
  const SCHEMA = JSON.parse(readFileSync(join(REPO, "manifest.schema.json"), "utf8")) as Record<
    string,
    unknown
  >;
  const DEFINITIONS = SCHEMA.definitions as Record<string, Record<string, unknown>>;
  const REGISTRY = join(REPO, "registry");

  /** Per-kind controller counts, scanned independently of the generator. */
  function fileSets(): KindFileSet[] {
    const rows = new Map<string, KindFileSet>();
    for (const rel of new Bun.Glob("{primitives,recipes,patterns}/*/*.manifest.json").scanSync({
      cwd: REGISTRY,
    })) {
      const m = JSON.parse(readFileSync(join(REGISTRY, rel), "utf8")) as {
        kind: string;
        files?: { js?: string };
      };
      const row = rows.get(m.kind) ?? { kind: m.kind, count: 0, withJs: 0 };
      row.count++;
      if (m.files?.js) row.withJs++;
      rows.set(m.kind, row);
    }
    return [...rows.values()].sort((a, b) => a.kind.localeCompare(b.kind));
  }

  const EXAMPLE = manifestExample();
  const REFERENCE = renderManifestReference(SCHEMA, EXAMPLE, SCHEMA_VERSION, fileSets());

  /** Every `<definition>.<property>` pair the schema declares. */
  function declaredProperties(): { definition: string; property: string }[] {
    const out: { definition: string; property: string }[] = [];
    for (const [definition, node] of Object.entries(DEFINITIONS)) {
      const properties = (node.properties ?? {}) as Record<string, unknown>;
      for (const property of Object.keys(properties)) out.push({ definition, property });
    }
    return out;
  }

  /** Every `enum` in the document, found by an independent walk. */
  function declaredEnums(node: unknown, out: string[][] = []): string[][] {
    if (node === null || typeof node !== "object") return out;
    if (Array.isArray(node)) {
      for (const item of node) declaredEnums(item, out);
      return out;
    }
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.enum)) out.push(record.enum as string[]);
    for (const [key, value] of Object.entries(record)) {
      if (key !== "enum") declaredEnums(value, out);
    }
    return out;
  }

  it("carries the generation header and is gated by `check:skill`", async () => {
    expect(REFERENCE).toContain(SKILL_GENERATION_MARKER);
    const files = await generateShippedSkillFiles();
    expect(files.map((f) => f.relPath)).toContain(join("references", "manifest.md"));
    expect(files.length).toBe(7);
    const committed = readFileSync(join(shippedSkillDir(), "references", "manifest.md"), "utf8");
    expect(committed).toBe(REFERENCE);
  });

  it("documents every property the schema declares", () => {
    const properties = declaredProperties();
    // Sanity: the walk found the schema, not an empty object.
    expect(properties.length).toBeGreaterThan(40);
    for (const { definition, property } of properties) {
      expect(REFERENCE, `${definition}.${property} has no row`).toContain(`| \`${property}\` |`);
    }
  });

  it("states that every one of the seventeen component fields is required", () => {
    const required = DEFINITIONS.componentManifest.required as string[];
    expect(required.length).toBe(17);
    expect(REFERENCE).toContain(`### Required — all ${required.length}`);
    expect(REFERENCE).toContain(`**every one of these ${required.length} fields**`);

    // The split itself: a required field must not be listed as optional, and
    // vice versa. Slice the document at the two headings and check membership.
    const requiredBlock = REFERENCE.slice(
      REFERENCE.indexOf("### Required — all 17"),
      REFERENCE.indexOf("### Optional", REFERENCE.indexOf("### Required — all 17")),
    );
    for (const field of required) {
      expect(requiredBlock, `${field} is not in the required table`).toContain(`| \`${field}\` |`);
    }
    const properties = Object.keys(DEFINITIONS.componentManifest.properties as object);
    const optional = properties.filter((p) => !required.includes(p));
    expect(REFERENCE).toContain(`### Optional — ${optional.length}`);
    for (const field of optional) {
      expect(requiredBlock, `${field} is listed as required`).not.toContain(`| \`${field}\` |`);
    }
  });

  it("carries every value of every closed enum", () => {
    const enums = declaredEnums(SCHEMA.definitions);
    expect(enums.length).toBe(6);
    for (const values of enums) {
      expect(REFERENCE, `an enum is missing: ${values.join(", ")}`).toContain(
        values.map((v) => `\`${v}\``).join(", "),
      );
    }
    // The two the hand-written file dropped, named explicitly.
    expect(REFERENCE).toContain("`custom`");
    expect(REFERENCE).toContain("`marketing`");
  });

  it("documents the fields the hand-written file omitted outright", () => {
    for (const field of ["$schema", "props", "changes", "aliases", "responsive"]) {
      expect(REFERENCE, `${field} is still undocumented`).toContain(`| \`${field}\` |`);
    }
  });

  it("lifts the worked example from the shipped button manifest", () => {
    const shipped = readFileSync(
      join(REGISTRY, "primitives", "button", "button.manifest.json"),
      "utf8",
    );
    expect(EXAMPLE.manifestJson).toBe(shipped);
    expect(REFERENCE).toContain(shipped.replace(/\s+$/, ""));
    // Which means the example is the current file, not a stale transcription:
    // the old one said 1.0.0 and carried no `$schema`, `props` or `changes`.
    const manifest = JSON.parse(shipped) as { version: string };
    expect(REFERENCE).toContain(`"version": "${manifest.version}"`);
    expect(REFERENCE).toContain('"$schema": "../../../manifest.schema.json"');
  });

  it("counts the per-kind file sets off the registry", () => {
    for (const row of fileSets()) {
      expect(REFERENCE, `no file-set row for ${row.kind}`).toContain(
        `| \`${row.kind}\` | ${row.count} | ${row.withJs} |`,
      );
    }
    // Recipes are the kind that ships a controller — all of them, and only them.
    const recipes = fileSets().find((r) => r.kind === "recipe")!;
    expect(recipes.withJs).toBe(recipes.count);
    for (const other of fileSets().filter((r) => r.kind !== "recipe")) {
      expect(other.withJs).toBe(0);
    }
  });

  it("picks up a property added to the schema with no generator edit", () => {
    // What `check:skill` sees when the contract gains a field: the bytes move.
    const mutated = JSON.parse(JSON.stringify(SCHEMA)) as Record<string, unknown>;
    const component = (mutated.definitions as Record<string, Record<string, unknown>>)
      .componentManifest;
    (component.properties as Record<string, unknown>).experimental = {
      type: "boolean",
      description: "A field no generator knows about.",
    };
    (component.required as string[]).push("experimental");

    const md = renderManifestReference(mutated, EXAMPLE, SCHEMA_VERSION, fileSets());
    expect(md).not.toBe(REFERENCE);
    expect(md).toContain("| `experimental` | `boolean` | A field no generator knows about. |");
    expect(md).toContain("### Required — all 18");
    // A widened enum travels the same way.
    const widened = JSON.parse(JSON.stringify(SCHEMA)) as Record<string, unknown>;
    (
      (widened.definitions as Record<string, Record<string, unknown>>).category as {
        enum: string[];
      }
    ).enum.push("invented");
    expect(renderManifestReference(widened, EXAMPLE, SCHEMA_VERSION, fileSets())).toContain(
      "`invented`",
    );
  });

  it("is enough on its own: a manifest built only from what it states validates", () => {
    // Acceptance criterion, made mechanical. Nothing here reads the schema —
    // the tables are parsed back out of the MARKDOWN and a manifest is built
    // from them. A required field the reference forgets to name is a field this
    // manifest lacks, and `validateAgainstSchema` says so.
    const section = (heading: string): string => {
      const start = REFERENCE.indexOf(heading);
      expect(start, `${heading} is missing`).toBeGreaterThan(-1);
      const rest = REFERENCE.slice(start + heading.length);
      const end = rest.search(/\n#{2,3} /);
      return end === -1 ? rest : rest.slice(0, end);
    };
    /** `| \`x\` | type | … |` rows of the first table in a section. */
    const rows = (body: string): string[][] =>
      body
        .split("\n")
        .filter((line) => /^\| `/.test(line))
        .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()));
    const firstEnum = (notes: string): string | undefined =>
      /one of `([^`]+)`/.exec(notes)?.[1];

    const build = (type: string, notes: string): unknown => {
      if (/\[\]$/.test(type)) return [];
      if (type.startsWith("{")) return {};
      if (type.includes("`object`")) return {};
      if (type.includes("`boolean`")) return true;
      if (type.includes("`number`")) return 1;
      if (type.includes("`string`")) return firstEnum(notes) ?? "x";
      // A `$ref` to a nested type: read that type's own table.
      const name = /`([\w-]+)`/.exec(type)?.[1] ?? "";
      const body = section(`### \`${name}\``);
      const enumValue = /^- `([^`]+)`$/m.exec(body)?.[1];
      if (enumValue) return enumValue;
      const nested = rows(body);
      if (nested.length === 0) {
        // An open map with a minimum, e.g. `templates`.
        expect(body).toContain("Every value is `string`");
        expect(body).toContain("at least 1 entry");
        return { html: "<div data-ui=\"x\"></div>" };
      }
      const out: Record<string, unknown> = {};
      for (const [field, fieldType, required, fieldNotes] of nested) {
        if (required === "yes") out[field.replace(/`/g, "")] = build(fieldType, fieldNotes);
      }
      return out;
    };

    const manifest: Record<string, unknown> = {};
    for (const [field, type, notes] of rows(section("### Required — all 17"))) {
      manifest[field.replace(/`/g, "")] = build(type, notes);
    }
    // A name and a description have to be non-empty; everything else came out
    // of the tables. 17 fields, because the reference says so.
    expect(Object.keys(manifest).length).toBe(17);
    expect(validateAgainstSchema(SCHEMA, manifest)).toEqual([]);
    expect(validateManifest(manifest)).toEqual([]);
  });

  it("says where a manifest's `$schema` points and who writes it", () => {
    expect(REFERENCE).toContain("`faqir create` writes one");
    expect(REFERENCE).toContain("add-schema-refs.mjs --check");
  });
});
