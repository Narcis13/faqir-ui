import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../../src/index";

async function makeTempProject(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "loom-phase9-"));
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

describe("loom phase 9", () => {
  test("gallery installs the full registry, stays class-free at the wrapper level, and audits clean", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["gallery"], cwd)).toBe(0);

      const config = JSON.parse(await readFile(join(cwd, "loom.config.json"), "utf8"));
      const gallery = await readFile(join(cwd, "ui", "gallery.html"), "utf8");
      const loomScript = await readFile(join(cwd, "ui", "loom.js"), "utf8");

      expect(config.installed.primitives).toHaveLength(17);
      expect(config.installed.recipes).toHaveLength(15);
      expect(config.installed.patterns).toHaveLength(6);
      expect(gallery).toContain("<!doctype html>");
      expect(gallery).toContain("data-gallery");
      expect(gallery).toContain('data-gallery-part="section"');
      expect(gallery).toContain('data-ui="button"');
      expect(gallery).toContain('data-ui="dialog"');
      expect(gallery).toContain('data-ui="dashboard-shell"');
      expect(gallery).toContain('<script type="module" src="./loom.js"></script>');
      expect(gallery).not.toContain('class="loom-');
      expect(loomScript).not.toContain("MutationObserver");

      const audit = await captureOutput(async () => await runCli(["audit", "--json"], cwd));
      const report = parseJsonOutput<{
        ok: boolean;
        summary: { critical: number; error: number; warning: number; total: number };
      }>(audit.output);

      expect(audit.code).toBe(0);
      expect(report.ok).toBe(true);
      expect(report.summary.critical).toBe(0);
      expect(report.summary.error).toBe(0);
      expect(report.summary.warning).toBeGreaterThan(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("audit flags the enforced Loom anti-patterns across html, css, and js assets", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button", "dropdown"], cwd)).toBe(0);

      await writeFile(
        join(cwd, "anti-patterns.html"),
        [
          "<!doctype html>",
          "<html lang=\"en\">",
          "  <body>",
          "    <button data-ui=\"button\" class=\"button-root\">Ship</button>",
          "  </body>",
          "</html>",
          "",
        ].join("\n"),
      );

      await writeFile(
        join(cwd, "ui", "primitives", "button", "button.css"),
        [
          '[data-ui="button"] {',
          "  color: var(--color-fg);",
          "}",
          "",
          '.button-root {',
          "  color: #111111 !important;",
          "  padding: 8px;",
          "  box-shadow: 0 0 0 #111111;",
          "}",
          "",
          '#bad-button {',
          "  margin: 4px;",
          "}",
          "",
        ].join("\n"),
      );

      const dropdownSource = await readFile(join(cwd, "ui", "recipes", "dropdown", "dropdown.js"), "utf8");
      await writeFile(
        join(cwd, "ui", "recipes", "dropdown", "dropdown.js"),
        [
          'import "react";',
          "const mode = import.meta.env.MODE;",
          "const observer = new MutationObserver(() => {});",
          'document.body?.classList.add("open");',
          "const template = `<div data-ui=\"button\"></div>`;",
          'fetch("/api/status");',
          "void mode;",
          "void observer;",
          "void template;",
          "",
          dropdownSource,
        ].join("\n"),
      );

      const audit = await captureOutput(async () => await runCli(["audit", "--file", "anti-patterns.html", "--json"], cwd));
      const report = parseJsonOutput<{ ok: boolean; results: Array<{ ruleId: string; filePath: string }> }>(audit.output);
      const ruleIds = report.results.map((result) => result.ruleId);

      expect(audit.code).toBe(1);
      expect(report.ok).toBe(false);
      expect(ruleIds).toEqual(
        expect.arrayContaining([
          "class-attribute",
          "class-selector",
          "id-selector",
          "important",
          "token-discipline",
          "external-dependency",
          "build-step",
          "runtime-lifecycle",
          "class-api",
          "html-generation",
          "app-runtime",
        ]),
      );
      expect(
        report.results.some(
          (result) => result.ruleId === "external-dependency" && result.filePath.endsWith("ui/recipes/dropdown/dropdown.js"),
        ),
      ).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
