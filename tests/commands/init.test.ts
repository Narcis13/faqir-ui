import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/index";

async function makeTempProject(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "loom-phase1-"));
}

describe("loom init", () => {
  test("creates a bundled token project and passes doctor", async () => {
    const cwd = await makeTempProject();

    try {
      const initCode = await runCli(["init"], cwd);
      const doctorCode = await runCli(["doctor"], cwd);

      expect(initCode).toBe(0);
      expect(doctorCode).toBe(0);

      const config = JSON.parse(await readFile(join(cwd, "loom.config.json"), "utf8"));
      const tokenBundle = await readFile(join(cwd, "ui", "tokens", "index.css"), "utf8");
      const loomScript = await readFile(join(cwd, "ui", "loom.js"), "utf8");

      expect(config).toEqual({
        version: "1.0.0",
        theme: "default",
        output_dir: "./ui",
        tokens_split: false,
        include_core: true,
        installed: {
          primitives: [],
          recipes: [],
          patterns: [],
        },
      });
      expect(tokenBundle).toContain("Source: palette.css");
      expect(tokenBundle).toContain("Source: theme.css");
      expect(loomScript).toContain("const controllers = {");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("supports split tokens and skipping core modules", async () => {
    const cwd = await makeTempProject();

    try {
      const initCode = await runCli(["init", "--tokens-split", "--no-core", "--dir", "design-system"], cwd);
      const doctorCode = await runCli(["doctor"], cwd);

      expect(initCode).toBe(0);
      expect(doctorCode).toBe(0);

      const indexCss = await readFile(join(cwd, "design-system", "tokens", "index.css"), "utf8");
      const themeCss = await readFile(join(cwd, "design-system", "tokens", "theme.css"), "utf8");

      expect(indexCss).toContain('@import "./palette.css";');
      expect(indexCss).toContain('@import "./theme.css";');
      expect(themeCss).toContain("[data-theme=\"dark\"]");
      await expect(stat(join(cwd, "design-system", "loom.js"))).resolves.toBeDefined();
      await expect(stat(join(cwd, "design-system", "core", "dom.js"))).rejects.toThrow();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
