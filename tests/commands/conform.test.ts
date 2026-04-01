import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { conform } from "../../src/commands/conform";

const TEST_DIR = join(import.meta.dir, "../.tmp-conform-test");

describe("loom conform", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("reorders attributes to canonical order", async () => {
    await init([]);
    await add(["button"]);

    // Write an HTML file with non-canonical attribute order
    const html = '<button data-variant="primary" data-ui="button" class="custom" data-size="lg">Click</button>';
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform([]);

    const result = await Bun.file(filePath).text();
    // data-ui should come before data-variant and data-size
    const uiIdx = result.indexOf("data-ui");
    const variantIdx = result.indexOf("data-variant");
    const sizeIdx = result.indexOf("data-size");
    const classIdx = result.indexOf("class");

    expect(uiIdx).toBeLessThan(variantIdx);
    expect(variantIdx).toBeLessThan(sizeIdx);
    expect(sizeIdx).toBeLessThan(classIdx);
  });

  it("adds machine comments to component HTML files", async () => {
    await init([]);
    await add(["button"]);

    // Read the button HTML file
    const htmlPath = join(TEST_DIR, "ui", "primitives", "button", "button.html");
    if (existsSync(htmlPath)) {
      // Remove any existing machine comments
      const original = await Bun.file(htmlPath).text();
      const stripped = original.replace(/<!-- @ui:.*-->\n?/g, "");
      await Bun.write(htmlPath, stripped);

      await conform([]);

      const result = await Bun.file(htmlPath).text();
      expect(result).toContain("<!-- @ui:component button -->");
      expect(result).toContain("<!-- @ui:kind primitive -->");
    }
  });

  it("adds machine comments to CSS files", async () => {
    await init([]);
    await add(["button"]);

    const cssPath = join(TEST_DIR, "ui", "primitives", "button", "button.css");
    if (existsSync(cssPath)) {
      // Remove any existing machine comments
      const original = await Bun.file(cssPath).text();
      const stripped = original.replace(/\/\* @ui:.*\*\/\n?/g, "");
      await Bun.write(cssPath, stripped);

      await conform([]);

      const result = await Bun.file(cssPath).text();
      expect(result).toContain("/* @ui:component button */");
    }
  });

  it("is idempotent — second run changes nothing", async () => {
    await init([]);
    await add(["button"]);

    // Write a file with wrong order
    const html = '<button data-variant="primary" data-ui="button">Click</button>';
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    // First conform
    await conform([]);
    const afterFirst = await Bun.file(filePath).text();

    // Capture output from second run
    const origLog = console.log;
    const output: string[] = [];
    console.log = (...args: any[]) => output.push(args.join(" "));
    await conform([]);
    console.log = origLog;

    const afterSecond = await Bun.file(filePath).text();
    expect(afterSecond).toBe(afterFirst);

    const text = output.join("\n");
    expect(text).toContain("already conform");
  });

  it("supports --dry-run mode", async () => {
    await init([]);
    await add(["button"]);

    // Write a file with wrong order
    const html = '<button data-variant="primary" data-ui="button">Click</button>';
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform(["--dry-run"]);

    // File should be unchanged
    const result = await Bun.file(filePath).text();
    expect(result).toBe(html);
  });

  it("does not touch non-loom elements", async () => {
    await init([]);
    await add(["button"]);

    const html = '<div class="foo" id="bar" data-custom="baz">Content</div>';
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform([]);

    const result = await Bun.file(filePath).text();
    expect(result).toBe(html);
  });

  it("preserves data-part attribute order", async () => {
    await init([]);
    await add(["dialog"]);

    const html = '<div role="dialog" data-part="panel" aria-modal="true">Content</div>';
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform([]);

    const result = await Bun.file(filePath).text();
    const partIdx = result.indexOf("data-part");
    const roleIdx = result.indexOf("role");
    // data-part should come before role in canonical order
    expect(partIdx).toBeLessThan(roleIdx);
  });
});
