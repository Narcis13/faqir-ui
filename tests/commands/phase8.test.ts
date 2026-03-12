import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../../src/index";

async function makeTempProject(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "loom-phase8-"));
}

async function captureLogs(callback: () => Promise<number>): Promise<{ code: number; output: string }> {
  const messages: string[] = [];
  const originalLog = console.log;

  console.log = (...args: unknown[]) => {
    messages.push(args.join(" "));
  };

  try {
    const code = await callback();
    const output = messages.join("\n").replace(/\u001b\[[0-9;]*m/g, "");
    return { code, output };
  } finally {
    console.log = originalLog;
  }
}

describe("loom phase 8", () => {
  test("installs a pattern with its dependent components", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "auth-form"], cwd)).toBe(0);

      const config = JSON.parse(await readFile(join(cwd, "loom.config.json"), "utf8"));
      const context = JSON.parse(await readFile(join(cwd, ".loom", "context.json"), "utf8"));

      expect(config.installed.patterns).toEqual(["auth-form"]);
      expect(config.installed.primitives).toEqual(["button", "card", "input", "label", "separator"]);
      expect(context.meta.component_count.patterns).toBe(1);
      expect(context.patterns["auth-form"].uses).toEqual(["button", "card", "input", "label", "separator"]);
      await expect(stat(join(cwd, "ui", "patterns", "auth-form", "auth-form.html"))).resolves.toBeDefined();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("creates, lists, and activates themes", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init", "--tokens-split"], cwd)).toBe(0);
      expect(await runCli(["theme", "create", "studio-notes"], cwd)).toBe(0);

      const customTheme = await readFile(join(cwd, "ui", "themes", "studio-notes.css"), "utf8");
      expect(customTheme).toContain("theme-studio-notes");
      expect(customTheme).toContain("/* --color-bg: ; */");

      const listed = await captureLogs(async () => await runCli(["theme", "list"], cwd));
      expect(listed.code).toBe(0);
      expect(listed.output).toContain("default");
      expect(listed.output).toContain("midnight");
      expect(listed.output).toContain("paper");
      expect(listed.output).toContain("brutalist");
      expect(listed.output).toContain("studio-notes");

      expect(await runCli(["theme", "set", "midnight"], cwd)).toBe(0);

      const config = JSON.parse(await readFile(join(cwd, "loom.config.json"), "utf8"));
      const activeTheme = await readFile(join(cwd, "ui", "tokens", "theme.css"), "utf8");

      expect(config.theme).toBe("midnight");
      expect(activeTheme).toContain("theme-midnight");

      expect(await runCli(["theme", "set", "studio-notes"], cwd)).toBe(0);

      const customActiveTheme = await readFile(join(cwd, "ui", "tokens", "theme.css"), "utf8");
      expect(customActiveTheme).toContain("theme-studio-notes");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("generates scaffolds and auto-adds required patterns", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["scaffold", "admin-dashboard"], cwd)).toBe(0);
      expect(await runCli(["doctor"], cwd)).toBe(0);

      const config = JSON.parse(await readFile(join(cwd, "loom.config.json"), "utf8"));
      const scaffold = await readFile(join(cwd, "ui", "scaffolds", "admin-dashboard.html"), "utf8");

      expect(config.installed.patterns).toEqual(["crud-table", "dashboard-shell"]);
      expect(scaffold).toContain("<!doctype html>");
      expect(scaffold).toContain('data-ui="dashboard-shell"');
      expect(scaffold).toContain('data-ui="crud-table"');
      expect(scaffold).toContain('../patterns/dashboard-shell/dashboard-shell.css');
      expect(scaffold).toContain('<script type="module" src="../loom.js"></script>');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("adds and removes variant values on installed components", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button"], cwd)).toBe(0);
      expect(await runCli(["variant", "add", "button", "visual=brand"], cwd)).toBe(0);

      const manifestAfterAdd = JSON.parse(
        await readFile(join(cwd, "ui", "primitives", "button", "button.manifest.json"), "utf8"),
      );
      const cssAfterAdd = await readFile(join(cwd, "ui", "primitives", "button", "button.css"), "utf8");
      const contextAfterAdd = JSON.parse(await readFile(join(cwd, ".loom", "context.json"), "utf8"));

      expect(manifestAfterAdd.variants.visual.values).toContain("brand");
      expect(cssAfterAdd).toContain("[data-ui='button'][data-variant=\"brand\"]");
      expect(contextAfterAdd.components.button.variants.visual.values).toContain("brand");

      expect(await runCli(["variant", "remove", "button", "visual=brand"], cwd)).toBe(0);

      const manifestAfterRemove = JSON.parse(
        await readFile(join(cwd, "ui", "primitives", "button", "button.manifest.json"), "utf8"),
      );
      const cssAfterRemove = await readFile(join(cwd, "ui", "primitives", "button", "button.css"), "utf8");

      expect(manifestAfterRemove.variants.visual.values).not.toContain("brand");
      expect(cssAfterRemove).not.toContain("customize visual=\"brand\"");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
