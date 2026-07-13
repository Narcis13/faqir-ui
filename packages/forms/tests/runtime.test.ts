import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { renderForm } from "../src/index.js";

const ENTRY = join(import.meta.dir, "../src/index.js");
const SCHEMA = { type: "object", properties: { name: { type: "string" } } };

describe("@faqir-ui/forms runtimes", () => {
  it("renders directly under Bun", () => {
    expect(renderForm(SCHEMA)).toContain('<input data-ui="input"');
  });

  it("imports and renders under plain Node", () => {
    const entry = pathToFileURL(ENTRY).href;
    const script = `import { renderForm } from ${JSON.stringify(entry)};\n` +
      `const html = renderForm(${JSON.stringify(SCHEMA)});\n` +
      `if (!html.includes('data-ui="field-group"')) process.exit(2);`;
    const result = spawnSync("node", ["--input-type=module", "--eval", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  it("builds for browsers with no filesystem or DOM dependency in the render path", async () => {
    const source = readFileSync(ENTRY, "utf8");
    const executableSource = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    expect(executableSource).not.toMatch(/(?:from|require\()\s*["'](?:node:|fs(?:\/|["'])|path(?:\/|["']))/);
    expect(executableSource).not.toMatch(/\b(?:document|window|HTMLElement|Node)\b/);

    const build = await Bun.build({ entrypoints: [ENTRY], target: "browser", write: false });
    expect(build.success, build.logs.map(String).join("\n")).toBe(true);
    expect(build.outputs).toHaveLength(1);
    expect(await build.outputs[0].text()).toContain("function renderForm");
  });
});
