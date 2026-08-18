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

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { SCHEMA_VERSION } from "../../src/version";
import { TOKEN_MODIFIERS } from "../../src/protocol";
import {
  generateSkill,
  generateShippedSkillFiles,
  renderTokensReference,
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

  it("generates SKILL.md plus one reference file per layer and the token reference", async () => {
    const files = await generateShippedSkillFiles();
    const rels = files.map((f) => f.relPath);
    expect(rels).toContain("SKILL.md");
    expect(rels).toContain(join("references", "primitives.md"));
    expect(rels).toContain(join("references", "recipes.md"));
    expect(rels).toContain(join("references", "patterns.md"));
    expect(rels).toContain(join("references", "tokens.md"));
    // What `check:skill` counts — five generated files, every one of them gated.
    expect(files.length).toBe(5);
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
