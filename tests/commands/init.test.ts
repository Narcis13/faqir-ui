import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";

const TEST_DIR = join(import.meta.dir, "../.tmp-init-test");

describe("faqir init", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    // Also init a git repo so .gitignore logic is tested
    Bun.spawnSync(["git", "init"], { cwd: TEST_DIR });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("creates faqir.config.json", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
    } finally {
      process.chdir(origCwd);
    }

    expect(existsSync(join(TEST_DIR, "faqir.config.json"))).toBe(true);

    const config = await Bun.file(join(TEST_DIR, "faqir.config.json")).json();
    expect(config.version).toBe("1.0.0");
    expect(config.theme).toBe("default");
    expect(config.output_dir).toBe("./ui");
    expect(config.installed).toEqual({
      primitives: [],
      recipes: [],
      patterns: [],
    });
  });

  it("creates ui/ directory structure", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
    } finally {
      process.chdir(origCwd);
    }

    const ui = join(TEST_DIR, "ui");
    expect(existsSync(join(ui, "tokens"))).toBe(true);
    expect(existsSync(join(ui, "base"))).toBe(true);
    expect(existsSync(join(ui, "core"))).toBe(true);
    expect(existsSync(join(ui, "primitives"))).toBe(true);
    expect(existsSync(join(ui, "recipes"))).toBe(true);
    expect(existsSync(join(ui, "patterns"))).toBe(true);
  });

  it("creates concatenated tokens/index.css by default", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
    } finally {
      process.chdir(origCwd);
    }

    const indexCss = join(TEST_DIR, "ui", "tokens", "index.css");
    expect(existsSync(indexCss)).toBe(true);

    const content = await Bun.file(indexCss).text();
    // Should contain palette tokens
    expect(content).toContain("--palette-indigo-500");
    // Should contain semantic tokens
    expect(content).toContain("--color-primary");
    // Should contain spacing tokens
    expect(content).toContain("--space-4");
    // Should contain typography tokens
    expect(content).toContain("--font-sans");
    // Should contain effects tokens
    expect(content).toContain("--radius-md");
    // Should contain motion tokens
    expect(content).toContain("--ease-default");
    // Should not contain @import (concatenated mode)
    expect(content).not.toContain("@import");
  });

  it("creates split token files with --tokens-split", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init(["--tokens-split"]);
    } finally {
      process.chdir(origCwd);
    }

    const tokenDir = join(TEST_DIR, "ui", "tokens");
    expect(existsSync(join(tokenDir, "palette.css"))).toBe(true);
    expect(existsSync(join(tokenDir, "semantic.css"))).toBe(true);
    expect(existsSync(join(tokenDir, "spacing.css"))).toBe(true);
    expect(existsSync(join(tokenDir, "typography.css"))).toBe(true);
    expect(existsSync(join(tokenDir, "effects.css"))).toBe(true);
    expect(existsSync(join(tokenDir, "motion.css"))).toBe(true);
    expect(existsSync(join(tokenDir, "aliases.css"))).toBe(true);
    expect(existsSync(join(tokenDir, "index.css"))).toBe(true);
  });

  it("copies base styles (reset.css and prose.css)", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
    } finally {
      process.chdir(origCwd);
    }

    const baseDir = join(TEST_DIR, "ui", "base");
    expect(existsSync(join(baseDir, "reset.css"))).toBe(true);
    expect(existsSync(join(baseDir, "prose.css"))).toBe(true);

    const reset = await Bun.file(join(baseDir, "reset.css")).text();
    expect(reset).toContain("box-sizing: border-box");

    const prose = await Bun.file(join(baseDir, "prose.css")).text();
    expect(prose).toContain("[data-ui=\"prose\"]");
  });

  it("copies theme.css", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
    } finally {
      process.chdir(origCwd);
    }

    const themePath = join(TEST_DIR, "ui", "tokens", "theme.css");
    expect(existsSync(themePath)).toBe(true);

    const content = await Bun.file(themePath).text();
    expect(content).toContain("[data-theme=\"dark\"]");
  });

  it("creates .faqir/context.json", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
    } finally {
      process.chdir(origCwd);
    }

    const contextPath = join(TEST_DIR, ".faqir", "context.json");
    expect(existsSync(contextPath)).toBe(true);

    const context = await Bun.file(contextPath).json();
    expect(context.meta.framework).toBe("faqir");
    expect(context.protocol.identity).toBe("data-ui");
  });

  it("adds .faqir/ to .gitignore in git repos", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
    } finally {
      process.chdir(origCwd);
    }

    const gitignorePath = join(TEST_DIR, ".gitignore");
    expect(existsSync(gitignorePath)).toBe(true);

    const content = await Bun.file(gitignorePath).text();
    expect(content).toContain(".faqir/");
  });

  it("skips core modules with --no-core", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init(["--no-core"]);
    } finally {
      process.chdir(origCwd);
    }

    expect(existsSync(join(TEST_DIR, "ui", "core"))).toBe(false);

    const config = await Bun.file(join(TEST_DIR, "faqir.config.json")).json();
    expect(config.include_core).toBe(false);
  });

  it("uses custom directory with --dir", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init(["--dir", "./components"]);
    } finally {
      process.chdir(origCwd);
    }

    expect(existsSync(join(TEST_DIR, "components", "tokens"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "components", "base"))).toBe(true);

    const config = await Bun.file(join(TEST_DIR, "faqir.config.json")).json();
    expect(config.output_dir).toBe("./components");
  });
});
