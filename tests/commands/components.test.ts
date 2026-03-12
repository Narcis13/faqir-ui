import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../../src/index";

async function makeTempProject(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "loom-phase2-"));
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

describe("loom component commands", () => {
  test("loom add installs primitives, updates config, and keeps doctor passing", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button", "card", "input"], cwd)).toBe(0);
      expect(await runCli(["doctor"], cwd)).toBe(0);

      const config = JSON.parse(await readFile(join(cwd, "loom.config.json"), "utf8"));
      const context = JSON.parse(await readFile(join(cwd, ".loom", "context.json"), "utf8"));

      expect(config.installed).toEqual({
        primitives: ["button", "card", "input"],
        recipes: [],
        patterns: [],
      });

      expect(context.components.button.kind).toBe("primitive");
      expect(context.components.card.selector).toBe("[data-ui='card']");
      expect(context.components.input.variants.size.default).toBe("md");

      await expect(stat(join(cwd, "ui", "primitives", "button", "button.css"))).resolves.toBeDefined();
      await expect(stat(join(cwd, "ui", "primitives", "card", "card.manifest.json"))).resolves.toBeDefined();
      await expect(stat(join(cwd, "ui", "primitives", "input", "input.html"))).resolves.toBeDefined();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("loom list shows installed and available components", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button", "card", "input"], cwd)).toBe(0);

      const { code, output } = await captureLogs(async () => await runCli(["list"], cwd));

      expect(code).toBe(0);
      expect(output).toContain("Installed (3 components):");
      expect(output).toContain("PRIMITIVES (3)");
      expect(output).toContain("button");
      expect(output).toContain("card");
      expect(output).toContain("input");
      expect(output).toContain("Available (29 not installed):");
      expect(output).toContain("accordion");
      expect(output).toContain("avatar");
      expect(output).toContain("badge");
      expect(output).toContain("date-picker");
      expect(output).toContain("RECIPES:");
      expect(output).toContain("dialog");
      expect(output).toContain("dropdown");
      expect(output).toContain("label");
      expect(output).toContain("separator");
      expect(output).toContain("tabs");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("loom inspect prints the component manifest", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button"], cwd)).toBe(0);

      const { code, output } = await captureLogs(async () => await runCli(["inspect", "button"], cwd));

      expect(code).toBe(0);
      expect(output).toContain("Manifest for button");
      expect(output).toContain('"name": "button"');
      expect(output).toContain('"kind": "primitive"');
      expect(output).toContain('"html": "button.html"');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("loom doctor reports invalid installed manifests", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button"], cwd)).toBe(0);

      await writeFile(
        join(cwd, "ui", "primitives", "button", "button.manifest.json"),
        JSON.stringify({
          name: "Button",
          version: "not-semver"
        }),
      );

      expect(await runCli(["doctor"], cwd)).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("loom add --all installs the full MVP registry and regenerates context", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "--all"], cwd)).toBe(0);
      expect(await runCli(["doctor"], cwd)).toBe(0);

      const config = JSON.parse(await readFile(join(cwd, "loom.config.json"), "utf8"));
      const context = JSON.parse(await readFile(join(cwd, ".loom", "context.json"), "utf8"));
      const loomScript = await readFile(join(cwd, "ui", "loom.js"), "utf8");

      expect(config.installed.primitives).toHaveLength(17);
      expect(config.installed.recipes).toHaveLength(15);
      expect(config.installed.patterns).toEqual([]);

      expect(context.meta.component_count.primitives).toBe(17);
      expect(context.meta.component_count.recipes).toBe(15);
      expect(context.components.textarea.kind).toBe("primitive");
      expect(context.components.drawer.kind).toBe("recipe");
      expect(context.components["date-picker"].controller).toBe("date-picker.js");

      expect(loomScript).toContain('import { createAccordion } from "./recipes/accordion/accordion.js";');
      expect(loomScript).toContain('import { createDatePicker } from "./recipes/date-picker/date-picker.js";');
      expect(loomScript).toContain('import { createToast } from "./recipes/toast/toast.js";');

      await expect(stat(join(cwd, "ui", "primitives", "surface", "surface.css"))).resolves.toBeDefined();
      await expect(stat(join(cwd, "ui", "recipes", "command-palette", "command-palette.js"))).resolves.toBeDefined();
      await expect(stat(join(cwd, "ui", "recipes", "date-picker", "date-picker.manifest.json"))).resolves.toBeDefined();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
