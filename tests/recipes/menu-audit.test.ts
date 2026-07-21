import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { runAudit } from "../../src/audit/checker";

const project = mkdtempSync(join(tmpdir(), "faqir-menu-audit-"));

beforeAll(async () => {
  const previous = process.cwd();
  process.chdir(project);
  try {
    await init([]);
    await add(["context-menu", "menubar"]);
  } finally {
    process.chdir(previous);
  }
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("menu recipes registry contracts", () => {
  test("install with their shared helper", () => {
    expect(existsSync(join(project, "ui/core/menu-navigation.js"))).toBe(true);
    expect(existsSync(join(project, "ui/recipes/context-menu/context-menu.js"))).toBe(true);
    expect(existsSync(join(project, "ui/recipes/menubar/menubar.js"))).toBe(true);
  });

  test("canonical context-menu and menubar markup is audit-clean", async () => {
    const summary = await runAudit({ cwd: project });
    expect(summary.results).toEqual([]);
    expect(summary.passed).toBe(true);
  });
});
