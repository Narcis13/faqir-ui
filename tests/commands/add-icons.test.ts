// ═══════════════════════════════════════════════════════════════════════════
// faqir add icons [--only …]  [task 0.4-05 · §B4]
// ═══════════════════════════════════════════════════════════════════════════
//
// End-to-end behaviour of the icon-subsetting command: routing through
// `faqir add icons`, the trimmed install (icons.css + subset manifest + subset
// reference page + license), merge-on-re-run, the unknown-name error with a
// nearest-match hint, dry-run, and the full-set install. Pure-transform tests
// live in tests/utils/icons.test.ts.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { addIcons } from "../../src/commands/icons";
import { readConfig } from "../../src/utils/config";
import { iconNamesFromCss } from "../../src/utils/icons";
import { runAudit } from "../../src/audit/checker";

const TEST_DIR = join(import.meta.dir, "../.tmp-add-icons-test");
const iconDir = () => join(TEST_DIR, "ui/primitives/icon");
const installedNames = () => iconNamesFromCss(readFileSync(join(iconDir(), "icons.css"), "utf8"));

describe("faqir add icons", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("--only installs a trimmed sheet of exactly the requested glyphs", async () => {
    await init([]);
    await addIcons(["--only", "check,x,chevron-down,plus,minus"]);

    // All four artifacts land in ui/primitives/icon/.
    for (const f of ["icons.css", "icon.manifest.json", "icon.html", "LICENSE.lucide"]) {
      expect(existsSync(join(iconDir(), f))).toBe(true);
    }
    // icons.css holds exactly the requested glyphs (sorted).
    expect(installedNames()).toEqual(["check", "chevron-down", "minus", "plus", "x"]);
    // Manifest is trimmed to match, and stays a valid enumerable icon set.
    const m = JSON.parse(readFileSync(join(iconDir(), "icon.manifest.json"), "utf8"));
    expect(m.variants.icon.values).toEqual(["check", "chevron-down", "minus", "plus", "x"]);
    expect(m.variants.icon.values).toContain(m.variants.icon.default);
    expect(m.icon_set.count).toBe(5);
    // The primitive is registered.
    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("icon");
  });

  it("routes through `faqir add icons` and audits clean", async () => {
    await init([]);
    await add(["icons", "--only", "check,x,chevron-down"]);

    expect(existsSync(join(iconDir(), "icons.css"))).toBe(true);
    expect(installedNames()).toEqual(["check", "chevron-down", "x"]);

    const summary = await runAudit({ cwd: TEST_DIR });
    expect(summary.results).toEqual([]);
    expect(summary.passed).toBe(true);
  });

  it("merges on re-run — a second --only adds glyphs rather than clobbering", async () => {
    await init([]);
    await addIcons(["--only", "check,x"]);
    expect(installedNames()).toEqual(["check", "x"]);

    await addIcons(["--only", "bell,circle"]);
    // Union of both runs, sorted.
    expect(installedNames()).toEqual(["bell", "check", "circle", "x"]);

    // The manifest merges too.
    const m = JSON.parse(readFileSync(join(iconDir(), "icon.manifest.json"), "utf8"));
    expect(m.variants.icon.values).toEqual(["bell", "check", "circle", "x"]);
    expect(m.icon_set.count).toBe(4);
  });

  it("re-adding an already-installed glyph is a no-op union (idempotent)", async () => {
    await init([]);
    await addIcons(["--only", "check,x"]);
    await addIcons(["--only", "check"]);
    expect(installedNames()).toEqual(["check", "x"]);
  });

  it("aborts on an unknown glyph and suggests the nearest match", async () => {
    await init([]);

    const origExit = process.exit;
    const origError = console.error;
    const errors: string[] = [];
    let exitCode = -1;
    process.exit = ((code: number) => { exitCode = code; throw new Error("exit"); }) as any;
    console.error = (msg?: any) => { errors.push(String(msg)); };
    try {
      await addIcons(["--only", "chekc"]);
    } catch { /* the mocked exit throws */ }
    process.exit = origExit;
    console.error = origError;

    expect(exitCode).toBe(1);
    expect(errors.some((e) => e.includes("chekc") && e.includes('did you mean "check"'))).toBe(true);
    // Nothing was written for the aborted install.
    expect(existsSync(join(iconDir(), "icons.css"))).toBe(false);
  });

  it("--dry-run writes nothing", async () => {
    await init([]);
    await addIcons(["--only", "check,x", "--dry-run"]);

    expect(existsSync(join(iconDir(), "icons.css"))).toBe(false);
    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).not.toContain("icon");
  });

  it("with no --only installs the full icon set", async () => {
    await init([]);
    await addIcons([]);

    expect(existsSync(join(iconDir(), "icons.css"))).toBe(true);
    // The complete curated set.
    expect(installedNames().length).toBe(120);
    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("icon");
  });
});
