import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { runAudit } from "../../src/audit/checker";
import { findDataFetching } from "../../src/parser/js-parser";

const project = mkdtempSync(join(tmpdir(), "faqir-file-upload-audit-"));
let summary: Awaited<ReturnType<typeof runAudit>>;

beforeAll(async () => {
  const previous = process.cwd();
  process.chdir(project);
  try {
    await init([]);
    await add(["file-upload"]);
    summary = await runAudit({ cwd: project });
  } finally {
    process.chdir(previous);
  }
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("file-upload registry contract", () => {
  test("the canonical native-input reference is audit-clean", () => {
    expect(summary.results).toEqual([]);
    expect(summary.passed).toBe(true);
  });

  test("explicitly passes the no-fetch audit rule", () => {
    expect(summary.results.filter((result) => result.rule_id === "no-fetch")).toEqual([]);

    const installedController = readFileSync(
      join(project, "ui/recipes/file-upload/file-upload.js"),
      "utf8",
    );
    expect(findDataFetching(installedController)).toEqual([]);
  });

  test("documents every agent-facing event and FileList payload", () => {
    const manifest = JSON.parse(readFileSync(
      join(project, "ui/recipes/file-upload/file-upload.manifest.json"),
      "utf8",
    ));

    expect(Object.keys(manifest.events).sort()).toEqual([
      "faqir:file-reject",
      "faqir:file-remove",
      "faqir:files",
    ]);
    expect(manifest.events["faqir:files"].detail).toContain("FileList");
    expect(manifest.events["faqir:file-reject"].detail).toContain("reason");
    expect(manifest.events["faqir:file-remove"].detail).toContain("FileList");
  });
});
