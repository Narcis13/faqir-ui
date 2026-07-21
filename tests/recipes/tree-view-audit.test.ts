import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { runAudit } from "../../src/audit/checker";

const project = mkdtempSync(join(tmpdir(), "faqir-tree-view-audit-"));

beforeAll(async () => {
  const previous = process.cwd();
  process.chdir(project);
  try {
    await init([]);
    await add(["tree-view"]);
  } finally {
    process.chdir(previous);
  }
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("tree-view registry contract", () => {
  test("the nested canonical reference page is audit-clean", async () => {
    const summary = await runAudit({ cwd: project });
    expect(summary.results).toEqual([]);
    expect(summary.passed).toBe(true);
  });
});
