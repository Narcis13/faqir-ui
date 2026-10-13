// `faqir template` (docs/template.md §15.4): installs the engine's files and the
// project's component table — built from its installed manifests, a
// project-made component included — and `--check` reports drift.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { add } from "../../src/commands/add";
import { create } from "../../src/commands/create";
import { init } from "../../src/commands/init";
import { engineFiles, template } from "../../src/commands/template";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ROOT = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-template-command-test");
const OUT = join(TEST_DIR, "ui", "template");

describe("faqir template", () => {
  beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
    await init([]);
    await add(["dialog"]);
    await create(["note-box", "--kind", "primitive"]);
    // The scaffold's template is `<!-- content -->`, which the bindings IR's
    // template reader does not accept (a comment); the author's first edit
    // gives it a real one.
    const manifestPath = join(TEST_DIR, "ui", "primitives", "note-box", "note-box.manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.templates.html = '<div data-ui="note-box">{content}</div>';
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    await template([]);
  });

  afterAll(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("copies every engine file from its single source, byte for byte", () => {
    for (const [name, content] of engineFiles()) {
      expect(readFileSync(join(OUT, name), "utf8")).toBe(content);
      expect(content).toBe(readFileSync(join(ROOT, "packages", "template", "src", name), "utf8"));
    }
  });

  it("writes the project's table, project-made components included", async () => {
    const { components } = await import(join(OUT, "table.js"));
    expect(Object.keys(components.components)).toEqual(expect.arrayContaining(["dialog", "button", "note-box"]));
    expect(components.components).not.toHaveProperty("tabs");
  });

  it("installs an engine that compiles and renders with that table", async () => {
    const { compile } = await import(join(OUT, "compile.js"));
    const { render } = await import(join(OUT, "index.js"));
    const { components } = await import(join(OUT, "table.js"));
    const { ast, diagnostics } = compile("+dialog(title=t)\n  @body\n    p Body\n", { components });
    expect(diagnostics).toEqual([]);
    expect(render(ast, { t: "Hi" })).toContain('<h2 id="t-1-title" data-part="title">Hi</h2>');
  });

  it("reports drift with --check", () => {
    const cli = (args: string[]) => runSync("bun", [join(ROOT, "src", "index.ts"), "template", ...args], { cwd: TEST_DIR, encoding: "utf8", timeout: SPAWN_TIMEOUT.CLI });
    const clean = cli(["--check", "--json"]);
    expect(clean.status).toBe(0);
    expect(JSON.parse(clean.stdout).drifted).toEqual([]);
    writeFileSync(join(OUT, "render.js"), "// edited by hand\n");
    const drifted = cli(["--check", "--json"]);
    expect(drifted.status).toBe(1);
    expect(JSON.parse(drifted.stdout)).toMatchObject({ ok: false, drifted: ["render.js"] });
    expect(cli([]).status).toBe(0);
    expect(existsSync(join(OUT, "render.js")) && readFileSync(join(OUT, "render.js"), "utf8")).not.toContain("edited by hand");
  });
});
