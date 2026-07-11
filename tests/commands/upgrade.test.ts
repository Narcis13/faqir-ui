import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { upgrade } from "../../src/commands/upgrade";
import { getRegistryPath } from "../../src/utils/fs";
import { copyDir } from "../../src/utils/fs";
import { readPristineIndex } from "../../src/utils/pristine";

const ROOT = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-upgrade-test");
const FAKE_REGISTRY = join(TEST_DIR, "..", ".tmp-upgrade-registry");

const BUTTON_CSS = join(TEST_DIR, "ui/primitives/button/button.css");

/**
 * Capture stdout + a mocked process.exit while running an upgrade. Returns the
 * combined human/JSON output and the exit code (0 = clean, 2 = conflicts).
 */
async function runUpgrade(fn: () => Promise<void>): Promise<{ output: string; code: number }> {
  const chunks: string[] = [];
  const origLog = console.log;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit;
  let code = 0;
  console.log = (...a: unknown[]) => {
    chunks.push(a.map(String).join(" ") + "\n");
  };
  (process.stdout as unknown as { write: (s: string) => boolean }).write = (s: string) => {
    chunks.push(s);
    return true;
  };
  process.exit = ((c: number) => {
    code = c;
    throw new Error("__exit__");
  }) as never;
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__exit__") throw e;
  } finally {
    console.log = origLog;
    process.stdout.write = origWrite;
    process.exit = origExit;
  }
  return { output: chunks.join(""), code };
}

/**
 * Build a fixture registry containing a *newer* button by copying the real
 * button, then transforming its CSS and bumping the manifest. This is the
 * "theirs" side of the merge; the installed pristine snapshot is the "base".
 */
async function buildFakeButton(opts: {
  version: string;
  cssTransform: (css: string) => string;
  breaking?: boolean;
}): Promise<void> {
  rmSync(FAKE_REGISTRY, { recursive: true, force: true });
  const realButton = join(getRegistryPath(), "primitives/button");
  const fakeButton = join(FAKE_REGISTRY, "primitives/button");
  await copyDir(realButton, fakeButton);

  const css = readFileSync(join(realButton, "button.css"), "utf8");
  writeFileSync(join(fakeButton, "button.css"), opts.cssTransform(css));

  const manifest = JSON.parse(readFileSync(join(realButton, "button.manifest.json"), "utf8"));
  manifest.version = opts.version;
  manifest.changes = [
    { version: opts.version, note: "Renamed data-tone to data-variant.", breaking: opts.breaking ?? false },
  ];
  writeFileSync(join(fakeButton, "button.manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

const upgradeButton = (args: string[]) => upgrade(args, { registryPath: FAKE_REGISTRY });

describe("faqir upgrade — three-way merge", () => {
  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
    await init([]);
    await add(["button"]); // pristine + working copy == registry button@1.0.0
  });

  afterEach(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
    rmSync(FAKE_REGISTRY, { recursive: true, force: true });
  });

  it("fast-forwards an unmodified component and advances the pristine store", async () => {
    await buildFakeButton({ version: "1.1.0", cssTransform: (css) => css + "\n/* registry v1.1 */\n" });

    const { output, code } = await runUpgrade(() => upgradeButton(["button"]));
    expect(code).toBe(0);
    expect(output).toContain("1.0.0 → 1.1.0");
    expect(output.toLowerCase()).toContain("upgrade complete");

    // Working copy received the registry change.
    expect(readFileSync(BUTTON_CSS, "utf8")).toContain("/* registry v1.1 */");

    // Pristine store now reflects the new version; the old snapshot is gone.
    const index = await readPristineIndex(TEST_DIR);
    expect(index.components.button.version).toBe("1.1.0");
    expect(index.components.button.dir).toBe("button@1.1.0");
    expect(existsSync(join(TEST_DIR, ".faqir/pristine/button@1.0.0"))).toBe(false);
    expect(existsSync(join(TEST_DIR, ".faqir/pristine/button@1.1.0/button.css"))).toBe(true);
  });

  it("applies non-overlapping edits from both sides", async () => {
    // Registry appends at the bottom.
    await buildFakeButton({ version: "1.1.0", cssTransform: (css) => css + "\n/* registry footer */\n" });
    // User prepends at the top.
    const original = readFileSync(BUTTON_CSS, "utf8");
    writeFileSync(BUTTON_CSS, "/* user header */\n" + original);

    const { code } = await runUpgrade(() => upgradeButton(["button"]));
    expect(code).toBe(0);

    const merged = readFileSync(BUTTON_CSS, "utf8");
    expect(merged).toContain("/* user header */"); // user edit kept
    expect(merged).toContain("/* registry footer */"); // registry edit applied
  });

  it("writes git-style conflict markers on overlapping edits and exits 2", async () => {
    const firstLine = "/* @ui:component button */";
    // Registry rewrites the first line...
    await buildFakeButton({
      version: "1.1.0",
      breaking: true,
      cssTransform: (css) => css.replace(firstLine, "/* @ui:component button v1.1 */"),
    });
    // ...and the user rewrote the same first line differently.
    const original = readFileSync(BUTTON_CSS, "utf8");
    writeFileSync(BUTTON_CSS, original.replace(firstLine, "/* my custom button */"));

    const { output, code } = await runUpgrade(() => upgradeButton(["button"]));
    expect(code).toBe(2);

    const merged = readFileSync(BUTTON_CSS, "utf8");
    expect(merged).toContain("<<<<<<< ours");
    expect(merged).toContain("=======");
    expect(merged).toContain(">>>>>>> theirs");
    expect(merged).toContain("/* my custom button */"); // ours recoverable
    expect(merged).toContain("/* @ui:component button v1.1 */"); // theirs recoverable

    expect(output).toContain("conflict");
    // Breaking changelog surfaced prominently.
    expect(output).toContain("BREAKING");
  });

  it("--dry-run reports without writing and predicts the conflict exit code", async () => {
    const firstLine = "/* @ui:component button */";
    await buildFakeButton({
      version: "1.1.0",
      cssTransform: (css) => css.replace(firstLine, "/* registry rewrite */"),
    });
    const original = readFileSync(BUTTON_CSS, "utf8");
    writeFileSync(BUTTON_CSS, original.replace(firstLine, "/* user rewrite */"));

    const before = readFileSync(BUTTON_CSS, "utf8");
    const { output, code } = await runUpgrade(() => upgradeButton(["button", "--dry-run"]));

    // Predicted conflict → exit 2, but nothing written.
    expect(code).toBe(2);
    expect(output).toContain("Dry run");
    expect(readFileSync(BUTTON_CSS, "utf8")).toBe(before); // no markers written
    // Pristine store untouched.
    const index = await readPristineIndex(TEST_DIR);
    expect(index.components.button.version).toBe("1.0.0");
  });

  it("--json emits the stable faqir-upgrade@1 envelope", async () => {
    await buildFakeButton({
      version: "1.1.0",
      breaking: true,
      cssTransform: (css) => css + "\n/* registry v1.1 */\n",
    });

    const { output } = await runUpgrade(() => upgradeButton(["button", "--json", "--dry-run"]));
    const parsed = JSON.parse(output);
    expect(parsed.schema).toBe("faqir-upgrade@1");
    expect(parsed.dryRun).toBe(true);
    expect(Array.isArray(parsed.components)).toBe(true);
    const comp = parsed.components[0];
    expect(comp).toMatchObject({
      component: "button",
      layer: "primitives",
      fromVersion: "1.0.0",
      toVersion: "1.1.0",
      status: "upgraded",
      breaking: true,
    });
    expect(comp.changes[0]).toMatchObject({ version: "1.1.0", breaking: true });
    expect(comp.summary).toHaveProperty("conflicts");
    expect(Array.isArray(comp.files)).toBe(true);
    expect(parsed.hasConflicts).toBe(false);
  });

  it("reports up-to-date when the registry version matches", async () => {
    await buildFakeButton({ version: "1.0.0", cssTransform: (css) => css }); // same version

    const { output, code } = await runUpgrade(() => upgradeButton(["button"]));
    expect(code).toBe(0);
    expect(output.toLowerCase()).toContain("up to date");

    // Nothing changed on disk.
    const index = await readPristineIndex(TEST_DIR);
    expect(index.components.button.version).toBe("1.0.0");
  });

  it("errors on an uninstalled component", async () => {
    const { code } = await runUpgrade(() => upgradeButton(["nonexistent"]));
    expect(code).toBe(1);
  });

  it("warns and skips a component with no pristine baseline", async () => {
    rmSync(join(TEST_DIR, ".faqir/pristine"), { recursive: true, force: true });
    await buildFakeButton({ version: "1.1.0", cssTransform: (css) => css + "\n/* x */\n" });

    const { output, code } = await runUpgrade(() => upgradeButton(["button"]));
    expect(code).toBe(0); // degrades gracefully, not an error
    expect(output.toLowerCase()).toContain("no pristine baseline");
  });
});
