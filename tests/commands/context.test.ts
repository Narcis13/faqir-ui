import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../../src/index";

async function makeTempProject(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "loom-phase6-"));
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

describe("loom context", () => {
  test("generates context.json with proper structure", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button", "dialog"], cwd)).toBe(0);

      const { code } = await captureLogs(async () => await runCli(["context"], cwd));
      expect(code).toBe(0);

      const context = JSON.parse(await readFile(join(cwd, ".loom", "context.json"), "utf8"));

      expect(context.meta).toBeDefined();
      expect(context.meta.framework).toBe("loom");
      expect(context.meta.version).toBe("1.0.0");
      expect(context.meta.component_count.primitives).toBe(1);
      expect(context.meta.component_count.recipes).toBe(1);

      expect(context.protocol).toBeDefined();
      expect(context.protocol.identity).toBe("data-ui");
      expect(context.protocol.state).toBe("data-state");

      expect(context.components.button).toBeDefined();
      expect(context.components.button.kind).toBe("primitive");
      expect(context.components.button.selector).toBe("[data-ui='button']");

      expect(context.components.dialog).toBeDefined();
      expect(context.components.dialog.kind).toBe("recipe");
      expect(context.components.dialog.controller).toBe("dialog.js");

      expect(context.rules).toBeDefined();
      expect(context.rules.use_data_state_not_classes).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("generates context.md alongside context.json", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button"], cwd)).toBe(0);

      const { code } = await captureLogs(async () => await runCli(["context"], cwd));
      expect(code).toBe(0);

      const markdown = await readFile(join(cwd, ".loom", "context.md"), "utf8");

      expect(markdown).toContain("# Loom UI Context");
      expect(markdown).toContain("## Protocol");
      expect(markdown).toContain("## Components");
      expect(markdown).toContain("### button");
      expect(markdown).toContain("## Rules");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("generates .cursorrules with --format cursorrules", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button"], cwd)).toBe(0);

      const { code } = await captureLogs(
        async () => await runCli(["context", "--format", "cursorrules"], cwd),
      );
      expect(code).toBe(0);

      const rules = await readFile(join(cwd, ".cursorrules"), "utf8");

      expect(rules).toContain("# Loom UI Framework Rules");
      expect(rules).toContain("data-ui");
      expect(rules).toContain("data-state");
      expect(rules).toContain("button");
      expect(rules).toContain("Do NOT");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("generates SKILL.md", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button", "dialog"], cwd)).toBe(0);

      const { code } = await captureLogs(async () => await runCli(["context"], cwd));
      expect(code).toBe(0);

      const skill = await readFile(join(cwd, ".loom", "SKILL.md"), "utf8");

      expect(skill).toContain("# Loom UI Framework Skill");
      expect(skill).toContain("button");
      expect(skill).toContain("dialog");
      expect(skill).toContain("loom audit");
      expect(skill).toContain("loom explain");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("fails without loom.config.json", async () => {
    const cwd = await makeTempProject();

    try {
      const { code } = await captureLogs(async () => await runCli(["context"], cwd));
      expect(code).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects invalid --format value", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      const { code } = await captureLogs(
        async () => await runCli(["context", "--format", "invalid"], cwd),
      );
      expect(code).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("loom explain", () => {
  test("prints structured explanation for installed component", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "dialog"], cwd)).toBe(0);

      const { code, output } = await captureLogs(async () => await runCli(["explain", "dialog"], cwd));

      expect(code).toBe(0);
      expect(output).toContain("DIALOG");
      expect(output).toContain("PURPOSE:");
      expect(output).toContain("ANATOMY:");
      expect(output).toContain("[data-ui='dialog']");
      expect(output).toContain("[data-part='trigger']");
      expect(output).toContain("STATES:");
      expect(output).toContain("KEYBOARD:");
      expect(output).toContain("ACCESSIBILITY:");
      expect(output).toContain("SAFE TO MODIFY:");
      expect(output).toContain("DO NOT REMOVE:");
      expect(output).toContain("FILES:");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("explains registry component without installing", async () => {
    const cwd = await makeTempProject();

    try {
      const { code, output } = await captureLogs(async () => await runCli(["explain", "button"], cwd));

      expect(code).toBe(0);
      expect(output).toContain("BUTTON");
      expect(output).toContain("primitive");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("fails for unknown component", async () => {
    const cwd = await makeTempProject();

    try {
      const { code } = await captureLogs(async () => await runCli(["explain", "nonexistent"], cwd));
      expect(code).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("fails without component name", async () => {
    const cwd = await makeTempProject();

    try {
      const { code } = await captureLogs(async () => await runCli(["explain"], cwd));
      expect(code).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("loom trace", () => {
  test("prints full trace for installed component", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "dialog"], cwd)).toBe(0);

      const { code, output } = await captureLogs(async () => await runCli(["trace", "dialog"], cwd));

      expect(code).toBe(0);
      expect(output).toContain("TRACE: DIALOG");
      expect(output).toContain("FILES:");
      expect(output).toContain("dialog.html");
      expect(output).toContain("dialog.css");
      expect(output).toContain("dialog.js");
      expect(output).toContain("SELECTOR:");
      expect(output).toContain("[data-ui='dialog']");
      expect(output).toContain("TOKENS USED:");
      expect(output).toContain("CONTAINS:");
      expect(output).toContain("button");
      expect(output).toContain("TESTS:");
      expect(output).toContain("STATUS: installed");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("traces registry component without config", async () => {
    const cwd = await makeTempProject();

    try {
      const { code, output } = await captureLogs(async () => await runCli(["trace", "tabs"], cwd));

      expect(code).toBe(0);
      expect(output).toContain("TRACE: TABS");
      expect(output).toContain("tabs.js");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("fails for unknown component", async () => {
    const cwd = await makeTempProject();

    try {
      const { code } = await captureLogs(async () => await runCli(["trace", "nonexistent"], cwd));
      expect(code).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("loom conform", () => {
  test("reorders attributes to canonical order", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button"], cwd)).toBe(0);

      const htmlPath = join(cwd, "ui", "primitives", "button", "button.html");
      const originalHtml = await readFile(htmlPath, "utf8");

      const messyHtml = originalHtml.replace(
        'data-ui="button"',
        'id="test-btn" data-variant="primary" data-ui="button"',
      );
      const { writeFile } = await import("node:fs/promises");
      await writeFile(htmlPath, messyHtml);

      const { code, output } = await captureLogs(async () => await runCli(["conform"], cwd));

      expect(code).toBe(0);

      const conformedHtml = await readFile(htmlPath, "utf8");
      const firstButtonMatch = conformedHtml.match(/<button[^>]*data-ui="button"[^>]*>/);
      expect(firstButtonMatch).toBeDefined();

      if (firstButtonMatch) {
        const tag = firstButtonMatch[0];
        const dataUiPos = tag.indexOf("data-ui");
        const idPos = tag.indexOf('id="test-btn"');
        const variantPos = tag.indexOf("data-variant");

        expect(dataUiPos).toBeLessThan(variantPos);
        expect(variantPos).toBeLessThan(idPos);
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("reports no changes when already canonical", async () => {
    const cwd = await makeTempProject();

    try {
      expect(await runCli(["init"], cwd)).toBe(0);
      expect(await runCli(["add", "button"], cwd)).toBe(0);

      const { code, output } = await captureLogs(async () => await runCli(["conform"], cwd));

      expect(code).toBe(0);
      expect(output).toContain("canonical");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("fails without loom.config.json", async () => {
    const cwd = await makeTempProject();

    try {
      const { code } = await captureLogs(async () => await runCli(["conform"], cwd));
      expect(code).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
