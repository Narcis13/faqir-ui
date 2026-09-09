import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { conform } from "../../src/commands/conform";

const TEST_DIR = join(import.meta.dir, "../.tmp-conform-test");

describe("faqir conform", () => {
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

  it("--dry-run counts each file once, and agrees with the real run", async () => {
    // `output_dir` is authored as "./ui" while Bun.Glob yields "ui/…", so the
    // skip that excludes already-processed component files compared "./ui/" to
    // "ui/…" and never fired: every component file was counted a second time and
    // --dry-run reported double. The listed files were always right — only the
    // total lied, which is why 89% line coverage did not catch it.
    await init([]);
    await add(["button"]);

    const html = '<button data-variant="primary" data-ui="button">Click</button>';
    await Bun.write(join(TEST_DIR, "page.html"), html);

    const countFrom = (lines: string[]) => {
      const m = lines.join("\n").match(/(\d+) file\(s\) would be updated/);
      return m ? Number(m[1]) : -1;
    };

    const origLog = console.log;
    const dry: string[] = [];
    console.log = (...a: unknown[]) => void dry.push(a.join(" "));
    await conform(["--dry-run"]);
    console.log = origLog;

    // Every file the preview names, and no more.
    const named = dry.filter((l) => l.includes("Would update:")).length;
    expect(countFrom(dry)).toBe(named);

    const applied: string[] = [];
    console.log = (...a: unknown[]) => void applied.push(a.join(" "));
    await conform([]);
    console.log = origLog;

    const realCount = Number(
      (applied.join("\n").match(/(\d+) file\(s\) updated/) ?? [])[1] ?? -1
    );
    expect(realCount).toBe(named);
  });

  it("does not touch non-faqir elements", async () => {
    await init([]);
    await add(["button"]);

    const html = '<div class="foo" id="bar" data-custom="baz">Content</div>';
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform([]);

    const result = await Bun.file(filePath).text();
    expect(result).toBe(html);
  });

  // ── the corruption that was  ───────────────────────────────────────────────
  //
  // `conform` rebuilt every attribute as `name="value"` — hardcoded double
  // quotes, no escaping — and ran a naked global regex over the whole file. It
  // reported `✓ N file(s) updated` and exited 0 while producing markup and
  // JavaScript that no longer parse. Each case below is one of the reproduced
  // failures; all of them are ordinary Faqir markup, not edge cases.

  it("preserves single quotes around a value containing double quotes", async () => {
    await init([]);
    await add(["button"]);

    // `l-data` is the framework's own primary directive, and a JSON object
    // literal in it is single-quoted precisely because its keys are not.
    const html =
      `<div l-data='{ "msg": "hi" }' data-part="panel" data-ui="card">x</div>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform([]);

    const result = await Bun.file(filePath).text();
    expect(result).toContain(`l-data='{ "msg": "hi" }'`);
    // Reordered, but still parseable: exactly one attribute value per delimiter.
    expect(result.indexOf("data-ui")).toBeLessThan(result.indexOf("data-part"));
    expect(result).not.toContain(`l-data="{ "msg"`);
  });

  it("preserves a double-quoted value containing single quotes, and vice versa", async () => {
    await init([]);
    await add(["button"]);

    const html = `<p title='He said "no"' data-part="quote" data-ui="card">x</p>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform([]);

    expect(await Bun.file(filePath).text()).toContain(`title='He said "no"'`);
  });

  it("leaves <script>, <style> and <textarea> content alone", async () => {
    await init([]);
    await add(["button"]);

    // The old global regex matched "tags" inside raw-text bodies and rewrote
    // them, turning this script into `SyntaxError: Unexpected identifier`.
    const html = [
      `<div data-part="host" data-ui="card">x</div>`,
      `<script>`,
      `  const s = "<span data-part='x' data-ui='y'>";`,
      `</script>`,
      `<style>/* <span data-part='x' data-ui='y'> */</style>`,
      `<textarea data-part="code"><span data-part='x' data-ui='y'></textarea>`,
    ].join("\n");
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform([]);

    const result = await Bun.file(filePath).text();
    expect(result).toContain(`const s = "<span data-part='x' data-ui='y'>";`);
    expect(result).toContain(`/* <span data-part='x' data-ui='y'> */`);
    expect(result).toContain(`<textarea data-part="code"><span data-part='x' data-ui='y'></textarea>`);
    // …while the real element outside them was still reordered.
    expect(result).toContain(`<div data-ui="card" data-part="host">`);
  });

  it("reorders a tag whose attribute value contains `>`", async () => {
    await init([]);
    await add(["button"]);

    // The old `[^>]*?` attribute run stopped at the first `>` wherever it
    // appeared, so this tag was silently skipped — no error, no change.
    const html = `<span l-if="a > b" data-part="label" data-ui="badge">x</span>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform([]);

    const result = await Bun.file(filePath).text();
    expect(result).toContain(`l-if="a > b"`);
    expect(result.indexOf("data-ui")).toBeLessThan(result.indexOf("data-part"));
  });

  it("keeps bare boolean attributes bare", async () => {
    await init([]);
    await add(["button"]);

    const html = `<button data-variant="primary" disabled data-ui="button">x</button>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform([]);

    const result = await Bun.file(filePath).text();
    expect(result).toContain(" disabled>");
    expect(result).not.toContain(`disabled=""`);
  });

  it("round-trips: conforming already-conformed output is a no-op", async () => {
    await init([]);
    await add(["button"]);

    const html =
      `<div l-data='{ "msg": "hi" }' l-if="a > b" title='He said "no"' ` +
      `data-part="panel" data-ui="card" hidden>x</div>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    await conform([]);
    const once = await Bun.file(filePath).text();
    await conform([]);
    expect(await Bun.file(filePath).text()).toBe(once);
  });

  // ── the walk ───────────────────────────────────────────────────────────────

  it("skips dist/, vendor/ and .orig backups by default", async () => {
    await init([]);
    await add(["button"]);

    const html = '<button data-variant="primary" data-ui="button">Click</button>';
    for (const rel of ["dist/page.html", "vendor/page.html", "page.orig.html", "src/page.html"]) {
      const full = join(TEST_DIR, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      await Bun.write(full, html);
    }

    await conform([]);

    for (const rel of ["dist/page.html", "vendor/page.html", "page.orig.html"]) {
      expect(await Bun.file(join(TEST_DIR, rel)).text()).toBe(html);
    }
    // The one real source file was still conformed.
    expect(await Bun.file(join(TEST_DIR, "src/page.html")).text()).not.toBe(html);
  });

  it("--exclude adds to the defaults; --include narrows the scan", async () => {
    await init([]);
    await add(["button"]);

    const html = '<button data-variant="primary" data-ui="button">Click</button>';
    for (const rel of ["a/page.html", "b/page.html"]) {
      mkdirSync(join(TEST_DIR, rel, ".."), { recursive: true });
      await Bun.write(join(TEST_DIR, rel), html);
    }

    await conform(["--exclude", "b/**"]);
    expect(await Bun.file(join(TEST_DIR, "b/page.html")).text()).toBe(html);
    expect(await Bun.file(join(TEST_DIR, "a/page.html")).text()).not.toBe(html);

    // Reset, then scan only b/.
    await Bun.write(join(TEST_DIR, "a/page.html"), html);
    await conform(["--include", "b/**"]);
    expect(await Bun.file(join(TEST_DIR, "b/page.html")).text()).not.toBe(html);
    expect(await Bun.file(join(TEST_DIR, "a/page.html")).text()).toBe(html);
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
