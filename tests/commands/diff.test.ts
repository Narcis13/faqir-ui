import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { diff } from "../../src/commands/diff";
import { getRegistryPath } from "../../src/utils/fs";
import {
  readPristineIndex,
  pristineComponentDir,
  PRISTINE_STORE_SCHEMA,
} from "../../src/utils/pristine";

const ROOT = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-diff-test");

/** Capture console.log output while running `fn`. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const origLog = console.log;
  const origWrite = process.stdout.write.bind(process.stdout);
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" ") + "\n");
  };
  // diff writes raw patch text via process.stdout.write
  (process.stdout as unknown as { write: (s: string) => boolean }).write = (s: string) => {
    chunks.push(s);
    return true;
  };
  try {
    await fn();
  } finally {
    console.log = origLog;
    process.stdout.write = origWrite;
  }
  return chunks.join("");
}

/** Run a command capturing process.exit so aborts are observable. */
async function runCapturingExit(fn: () => Promise<void>): Promise<number> {
  let exitCode = 0;
  const origExit = process.exit;
  process.exit = ((code: number) => {
    exitCode = code;
    throw new Error("exit");
  }) as never;
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof Error) || err.message !== "exit") throw err;
  } finally {
    process.exit = origExit;
  }
  return exitCode;
}

describe("faqir add — pristine store", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("writes a pristine copy byte-equal to the registry source", async () => {
    await init([]);
    await add(["button"]);

    const index = await readPristineIndex(TEST_DIR);
    expect(index.schema).toBe(PRISTINE_STORE_SCHEMA);
    const entry = index.components.button;
    expect(entry).toBeDefined();
    expect(entry.layer).toBe("primitives");
    expect(entry.files).toContain("button.css");

    // Byte-for-byte equal to the registry source for every captured file.
    const registrySrc = join(getRegistryPath(), "primitives/button");
    const snapshotDir = pristineComponentDir(TEST_DIR, "button", entry.version);
    for (const rel of entry.files) {
      const got = readFileSync(join(snapshotDir, rel));
      const want = readFileSync(join(registrySrc, rel));
      expect(Buffer.compare(got, want)).toBe(0);
    }
  });

  it("snapshots auto-added dependencies too", async () => {
    await init([]);
    await add(["card"]); // card depends on button

    const index = await readPristineIndex(TEST_DIR);
    expect(index.components.card).toBeDefined();
    expect(index.components.button).toBeDefined();
  });

  it("dry run writes no pristine snapshot", async () => {
    await init([]);
    await add(["button", "--dry-run"]);
    const index = await readPristineIndex(TEST_DIR);
    expect(index.components.button).toBeUndefined();
  });
});

describe("faqir diff", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("reports no drift for an unmodified component (human + json)", async () => {
    await init([]);
    await add(["button"]);

    const human = await captureStdout(() => diff(["button"]));
    expect(human).toContain("no drift");
    // No unified-diff markers when clean.
    expect(human).not.toContain("@@");

    const jsonOut = await captureStdout(() => diff(["button", "--json"]));
    const parsed = JSON.parse(jsonOut);
    expect(parsed.schema).toBe("faqir-diff@1");
    expect(parsed.components).toHaveLength(1);
    expect(parsed.components[0]).toMatchObject({
      component: "button",
      pristine: true,
      clean: true,
    });
    expect(parsed.components[0].files).toEqual([]);
    expect(parsed.components[0].summary).toEqual({ filesChanged: 0, added: 0, removed: 0 });
  });

  it("shows correct hunks after the user edits a file", async () => {
    await init([]);
    await add(["button"]);

    // Introduce drift in the installed working copy.
    const cssPath = join(TEST_DIR, "ui/primitives/button/button.css");
    const original = readFileSync(cssPath, "utf8");
    writeFileSync(cssPath, original + "\n.custom { color: red; }\n");

    const human = await captureStdout(() => diff(["button"]));
    expect(human).toContain("--- a/button.css");
    expect(human).toContain("+++ b/button.css");
    expect(human).toContain("@@");
    expect(human).toContain("+.custom { color: red; }");

    const jsonOut = await captureStdout(() => diff(["button", "--json"]));
    const parsed = JSON.parse(jsonOut);
    const comp = parsed.components[0];
    expect(comp.clean).toBe(false);
    const cssDrift = comp.files.find((f: { path: string }) => f.path === "button.css");
    expect(cssDrift.status).toBe("modified");
    expect(cssDrift.added).toBeGreaterThanOrEqual(1);
    expect(comp.summary.filesChanged).toBe(1);
  });

  it("reports an added file as status=added", async () => {
    await init([]);
    await add(["button"]);
    writeFileSync(join(TEST_DIR, "ui/primitives/button/extra.css"), "/* mine */\n");

    const jsonOut = await captureStdout(() => diff(["button", "--json"]));
    const comp = JSON.parse(jsonOut).components[0];
    const extra = comp.files.find((f: { path: string }) => f.path === "extra.css");
    expect(extra.status).toBe("added");
  });

  it("stable --json shape has schema + envelope even with no drift", async () => {
    await init([]);
    await add(["button"]);
    const jsonOut = await captureStdout(() => diff(["--json"])); // all installed
    const parsed = JSON.parse(jsonOut);
    expect(parsed).toHaveProperty("schema", "faqir-diff@1");
    expect(Array.isArray(parsed.components)).toBe(true);
  });

  it("missing pristine → warns and degrades gracefully (exit 0)", async () => {
    await init([]);
    await add(["button"]);

    // Simulate a project whose component predates the pristine store: wipe the
    // store so no baseline exists for the installed component.
    rmSync(join(TEST_DIR, ".faqir/pristine"), { recursive: true, force: true });

    let human = "";
    const code = await runCapturingExit(async () => {
      human = await captureStdout(() => diff(["button"]));
    });
    expect(code).toBe(0);
    expect(human.toLowerCase()).toContain("no pristine baseline");

    // JSON degrades too: pristine=false, not an error.
    const jsonOut = await captureStdout(() => diff(["button", "--json"]));
    const comp = JSON.parse(jsonOut).components[0];
    expect(comp.pristine).toBe(false);
    expect(comp.version).toBeNull();
  });

  it("errors on an uninstalled component", async () => {
    await init([]);
    const code = await runCapturingExit(() => diff(["button"]));
    expect(code).toBe(1);
  });
});

describe("faqir add — pristine backfill", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("backfills a snapshot for a component that predates the store", async () => {
    await init([]);
    await add(["button"]);

    // Remove the store to simulate a pre-store install; component stays installed.
    rmSync(join(TEST_DIR, ".faqir/pristine"), { recursive: true, force: true });
    let index = await readPristineIndex(TEST_DIR);
    expect(index.components.button).toBeUndefined();

    // Re-adding an already-installed component backfills its baseline.
    await add(["button"]);
    index = await readPristineIndex(TEST_DIR);
    expect(index.components.button).toBeDefined();
    expect(index.components.button.backfilled).toBe(true);
  });
});
