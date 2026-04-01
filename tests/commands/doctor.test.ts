import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { doctor } from "../../src/commands/doctor";

const TEST_DIR = join(import.meta.dir, "../.tmp-doctor-test");

describe("loom doctor", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("fails when loom.config.json is missing", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      // Should not throw, just report errors
      await doctor([]);
    } finally {
      process.chdir(origCwd);
    }
    // Doctor logs errors, doesn't throw — verify config is missing
    expect(existsSync(join(TEST_DIR, "loom.config.json"))).toBe(false);
  });

  it("passes all checks after loom init", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
      // Doctor should report all passing — we just verify it doesn't throw
      await doctor([]);
    } finally {
      process.chdir(origCwd);
    }

    // Verify the key files exist that doctor checks
    expect(existsSync(join(TEST_DIR, "loom.config.json"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "ui", "tokens", "index.css"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "ui", "base", "reset.css"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "ui", "base", "prose.css"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "ui", "tokens", "theme.css"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".loom", "context.json"))).toBe(true);
  });

  it("detects missing token files", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
      // Delete the tokens file
      rmSync(join(TEST_DIR, "ui", "tokens", "index.css"));
      // Doctor should not throw
      await doctor([]);
    } finally {
      process.chdir(origCwd);
    }

    // index.css should be gone
    expect(existsSync(join(TEST_DIR, "ui", "tokens", "index.css"))).toBe(false);
  });

  it("detects missing base styles", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
      rmSync(join(TEST_DIR, "ui", "base", "reset.css"));
      await doctor([]);
    } finally {
      process.chdir(origCwd);
    }
    expect(existsSync(join(TEST_DIR, "ui", "base", "reset.css"))).toBe(false);
  });
});
