import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { checkForbidDirectives, doctor } from "../../src/commands/doctor";
import { add } from "../../src/commands/add";

const TEST_DIR = join(import.meta.dir, "../.tmp-doctor-test");

// `doctor` reports failure through `process.exitCode` (a CLI must, and it cannot
// use `process.exit` without cutting off the --json envelope). These tests invoke
// it in-process, so the exit code lands on the test runner itself: each block
// snapshots and restores it, or a suite with zero failing assertions still exits
// non-zero. Note `process.exitCode = undefined` is a no-op in Bun — restoring
// requires an explicit number, or the 1 simply stays.
describe("faqir doctor", () => {
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    savedExitCode = process.exitCode;
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    process.exitCode = typeof savedExitCode === "number" ? savedExitCode : 0;
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("fails when faqir.config.json is missing", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      // Should not throw, just report errors
      await doctor([]);
    } finally {
      process.chdir(origCwd);
    }
    // Doctor logs errors, doesn't throw — verify config is missing
    expect(existsSync(join(TEST_DIR, "faqir.config.json"))).toBe(false);
  });

  it("passes all checks after faqir init", async () => {
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
    expect(existsSync(join(TEST_DIR, "faqir.config.json"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "ui", "tokens", "index.css"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "ui", "base", "reset.css"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "ui", "base", "prose.css"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "ui", "tokens", "theme.css"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".faqir", "context.json"))).toBe(true);
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

// ── doctor's exit code is the only part a CI gate reads ─────────────────────
//
// `printResults` reported "N passed, M failed" and returned without ever
// touching the exit code, so `faqir doctor` exited 0 on a project it had just
// declared broken. A health check that returns success when it found failures
// is worse than no health check: it converts a real problem into a green light
// for every agent and pipeline that gates on it.
describe("faqir doctor exit code", () => {
  // Sibling describe: the outer block's beforeEach does not reach these.
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    savedExitCode = process.exitCode;
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(() => {
    process.exitCode = typeof savedExitCode === "number" ? savedExitCode : 0;
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("exits non-zero when a check fails", async () => {
    const origCwd = process.cwd();
    const origExit: typeof process.exitCode = process.exitCode;
    process.chdir(TEST_DIR);
    try {
      process.exitCode = 0;
      // Empty dir: no faqir.config.json, so checks fail.
      await doctor([]);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = typeof origExit === "number" ? origExit : 0;
      process.chdir(origCwd);
    }
  });

  it("leaves the exit code alone on a healthy project", async () => {
    const origCwd = process.cwd();
    const origExit: typeof process.exitCode = process.exitCode;
    process.chdir(TEST_DIR);
    try {
      await init(["--yes"]);
      process.exitCode = 0;
      await doctor([]);
      expect(process.exitCode ?? 0).toBe(0);
    } finally {
      process.exitCode = typeof origExit === "number" ? origExit : 0;
      process.chdir(origCwd);
    }
  });

  // `page-break` and `spinner` declare `content_model: "empty"`, which the schema
  // allows; the validator's own list once omitted it, so every invoice or report
  // scaffold failed doctor on a registry manifest it had installed verbatim.
  it("accepts components whose content model is empty", async () => {
    const origCwd = process.cwd();
    const origExit: typeof process.exitCode = process.exitCode;
    process.chdir(TEST_DIR);
    try {
      await init(["--yes"]);
      await add(["page-break", "spinner"]);
      process.exitCode = 0;
      await doctor([]);
      expect(process.exitCode ?? 0).toBe(0);
    } finally {
      process.exitCode = typeof origExit === "number" ? origExit : 0;
      process.chdir(origCwd);
    }
  });

  // Task 1.1F-27. There is no config schema, so `audit.forbid_directives` is
  // validated here: an entry that names no directive bans nothing, silently.
  async function doctorWithForbid(forbid: unknown): Promise<number> {
    const origCwd = process.cwd();
    const origExit: typeof process.exitCode = process.exitCode;
    process.chdir(TEST_DIR);
    try {
      await init(["--yes"]);
      const path = join(TEST_DIR, "faqir.config.json");
      const config = JSON.parse(readFileSync(path, "utf8"));
      writeFileSync(path, JSON.stringify({ ...config, audit: { forbid_directives: forbid } }, null, 2));
      process.exitCode = 0;
      await doctor([]);
      return process.exitCode ?? 0;
    } finally {
      process.exitCode = typeof origExit === "number" ? origExit : 0;
      process.chdir(origCwd);
    }
  }

  it('flags audit.forbid_directives: ["l-nope"]', async () => {
    expect(await doctorWithForbid(["l-nope"])).toBe(1);
  });

  it("accepts a forbid list of real directives, however written", async () => {
    expect(await doctorWithForbid(["l-html", ":src", "@click", "teleport"])).toBe(0);
  });
});

describe("checkForbidDirectives", () => {
  it("names each entry that is no directive", () => {
    const result = checkForbidDirectives(["l-html", "l-nope", "x-html"]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('names no directive: "l-nope", "x-html".');
  });

  it("rejects a value that is not a list of strings", () => {
    expect(checkForbidDirectives("l-html").passed).toBe(false);
    expect(checkForbidDirectives([1]).passed).toBe(false);
  });

  it("passes real directives and an empty list", () => {
    expect(checkForbidDirectives(["l-html", "l-on"]).passed).toBe(true);
    expect(checkForbidDirectives([]).passed).toBe(true);
  });
});
