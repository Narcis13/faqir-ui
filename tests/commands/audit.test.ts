import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../../src/index";

async function makeTempProject(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "loom-phase5-"));
}

async function copyFixture(name: string, cwd: string, targetName = name): Promise<string> {
  const sourcePath = join(process.cwd(), "tests", "fixtures", "audit", name);
  const targetPath = join(cwd, targetName);
  await writeFile(targetPath, await readFile(sourcePath, "utf8"));
  return targetPath;
}

async function captureOutput(callback: () => Promise<number>): Promise<{ code: number; output: string }> {
  const messages: string[] = [];
  const originalLog = console.log;
  const originalWrite = process.stdout.write.bind(process.stdout);

  console.log = (...args: unknown[]) => {
    messages.push(args.join(" "));
  };

  process.stdout.write = ((chunk: string | Uint8Array) => {
    messages.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;

  try {
    const code = await callback();
    return {
      code,
      output: messages.join("").replace(/\u001b\[[0-9;]*m/g, ""),
    };
  } finally {
    console.log = originalLog;
    process.stdout.write = originalWrite;
  }
}

function parseJsonOutput<T>(output: string): T {
  return JSON.parse(output.trim()) as T;
}

describe("loom audit and repair", () => {
  test("audit passes on a freshly installed project", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "dialog", "tabs", "dropdown", "button"], cwd)).toBe(0);

      const { code, output } = await captureOutput(async () => await runCli(["audit", "--json"], cwd));
      const report = parseJsonOutput<{
        ok: boolean;
        summary: { total: number };
      }>(output);

      expect(code).toBe(0);
      expect(report.ok).toBe(true);
      expect(report.summary.total).toBe(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("repair fixes a broken page deterministically and leaves audit clean", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "dialog", "button"], cwd)).toBe(0);
      await copyFixture("repairable-page.html", cwd);

      const before = await captureOutput(async () => await runCli(["audit", "--file", "repairable-page.html", "--json"], cwd));
      const beforeReport = parseJsonOutput<{
        ok: boolean;
        results: Array<{ ruleId: string }>;
      }>(before.output);

      expect(before.code).toBe(1);
      expect(beforeReport.ok).toBe(false);
      expect(beforeReport.results.map((result) => result.ruleId)).toEqual(
        expect.arrayContaining([
          "required-aria",
          "focus-trap",
          "controller-loaded",
          "valid-state",
          "valid-variant",
          "aria-describedby",
          "close-label",
        ]),
      );

      const repair = await captureOutput(async () => await runCli(["repair", "--file", "repairable-page.html", "--json"], cwd));
      const repairReport = parseJsonOutput<{
        repair: { applied: number };
        after: { ok: boolean; summary: { total: number } };
      }>(repair.output);

      expect(repair.code).toBe(0);
      expect(repairReport.repair.applied).toBeGreaterThan(0);
      expect(repairReport.after.ok).toBe(true);
      expect(repairReport.after.summary.total).toBe(0);

      const repairedSource = await readFile(join(cwd, "repairable-page.html"), "utf8");
      expect(repairedSource).toContain('data-state="closed"');
      expect(repairedSource).toContain('data-size="sm"');
      expect(repairedSource).toContain('aria-labelledby="confirm-title"');
      expect(repairedSource).toContain('aria-describedby="confirm-description"');
      expect(repairedSource).toContain('aria-label="Close dialog"');
      expect(repairedSource).toContain('<script type="module" src="./ui/loom.js"></script>');

      const after = await captureOutput(async () => await runCli(["audit", "--file", "repairable-page.html", "--json"], cwd));
      const afterReport = parseJsonOutput<{ ok: boolean; summary: { total: number } }>(after.output);

      expect(after.code).toBe(0);
      expect(afterReport.ok).toBe(true);
      expect(afterReport.summary.total).toBe(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("audit reports required slots, orphaned parts and panels, and CSS token issues", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "tabs", "dropdown", "card"], cwd)).toBe(0);
      await copyFixture("tabs-violations.html", cwd);
      await copyFixture("missing-dropdown-slot.html", cwd);

      await writeFile(
        join(cwd, "ui", "primitives", "card", "card.css"),
        [
          '[data-ui="card"] {',
          "  color: var(--missing-card-token);",
          "  transition: opacity 120ms linear;",
          "}",
          "",
        ].join("\n"),
      );

      const tabsAudit = await captureOutput(async () => await runCli(["audit", "--file", "tabs-violations.html", "--json"], cwd));
      const tabsReport = parseJsonOutput<{
        results: Array<{ ruleId: string; filePath: string }>;
      }>(tabsAudit.output);

      expect(tabsAudit.code).toBe(1);
      expect(tabsReport.results.map((result) => result.ruleId)).toEqual(
        expect.arrayContaining(["orphan-panel", "orphan-part", "token-exists", "reduced-motion"]),
      );
      expect(
        tabsReport.results.some(
          (result) => result.ruleId === "token-exists" && result.filePath.endsWith("ui/primitives/card/card.css"),
        ),
      ).toBe(true);

      const dropdownAudit = await captureOutput(async () => await runCli(["audit", "--file", "missing-dropdown-slot.html", "--json"], cwd));
      const dropdownReport = parseJsonOutput<{
        results: Array<{ ruleId: string }>;
      }>(dropdownAudit.output);

      expect(dropdownAudit.code).toBe(1);
      expect(dropdownReport.results.map((result) => result.ruleId)).toContain("required-slot");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
