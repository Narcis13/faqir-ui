import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { runAudit } from "../../src/audit/checker";

// Task 0.7-07 · the canonical carousel reference page — two carousels, the
// `hidden` progressive-enhancement controls, the slide roledescriptions and the
// live region — must be audit-clean as shipped.

const project = mkdtempSync(join(tmpdir(), "faqir-carousel-audit-"));

beforeAll(async () => {
  const previous = process.cwd();
  process.chdir(project);
  try {
    await init([]);
    await add(["carousel"]);
  } finally {
    process.chdir(previous);
  }
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("carousel registry contract", () => {
  test("the canonical reference page is audit-clean", async () => {
    const summary = await runAudit({ cwd: project });
    expect(summary.results).toEqual([]);
    expect(summary.passed).toBe(true);
  });
});
