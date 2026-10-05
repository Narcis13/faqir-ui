// A project's manifests point their `$schema` at a file that exists, at any
// `output_dir` depth (task 1.1F-26).
//
// Registry manifests carry `../../../manifest.schema.json`, the path from
// `registry/<layer>/<name>/`. `faqir add` copied them byte for byte, so with
// `--dir web/ui` every installed manifest pointed one level short of the
// project root, and no command but `create` ever wrote the file at all.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { diff } from "../../src/commands/diff";
import { doctor } from "../../src/commands/doctor";
import { upgrade } from "../../src/commands/upgrade";
import { copyDir, getPackageRoot, getRegistryPath } from "../../src/utils/fs";
import { normalizeSchemaRef, readSchemaRef, schemaRefFor, withSchemaRef } from "../../src/utils/schema-ref";

const ROOT = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-schema-ref-test");
const FAKE_REGISTRY = join(TEST_DIR, "..", ".tmp-schema-ref-registry");
const SHIPPED_SCHEMA = readFileSync(join(getPackageRoot(), "manifest.schema.json"), "utf8");
const REGISTRY_BUTTON = join(getRegistryPath(), "primitives/button/button.manifest.json");

/** Capture console + stdout output and a mocked process.exit while running `fn`. */
async function run(fn: () => Promise<void>): Promise<{ output: string; code: number }> {
  const chunks: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit;
  const origExitCode = process.exitCode;
  let code = 0;
  console.log = (...a: unknown[]) => void chunks.push(a.map(String).join(" ") + "\n");
  console.error = console.log;
  (process.stdout as unknown as { write: (s: string) => boolean }).write = (s: string) => {
    chunks.push(s);
    return true;
  };
  process.exit = ((c: number) => {
    code = c;
    throw new Error("__exit__");
  }) as never;
  process.exitCode = 0;
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__exit__") throw e;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.stdout.write = origWrite;
    process.exit = origExit;
    if (code === 0 && typeof process.exitCode === "number") code = process.exitCode;
    process.exitCode = typeof origExitCode === "number" ? origExitCode : 0;
  }
  return { output: chunks.join(""), code };
}

function manifestAt(dir: string): { path: string; text: string; ref: string | null } {
  const path = join(TEST_DIR, dir, "primitives/button/button.manifest.json");
  const text = readFileSync(path, "utf8");
  return { path, text, ref: readSchemaRef(text) };
}

describe("schema-ref helpers", () => {
  const text = '{\n  "$schema": "../../../manifest.schema.json",\n  "name": "x"\n}\n';

  it("reads, rewrites and normalises only the $schema value", () => {
    expect(readSchemaRef(text)).toBe("../../../manifest.schema.json");
    const moved = withSchemaRef(text, "../../../../manifest.schema.json");
    expect(moved).toBe(text.replace("../../../", "../../../../"));
    expect(normalizeSchemaRef(moved, text)).toBe(text);
  });

  it("leaves a manifest without $schema, or a missing pristine, alone", () => {
    const bare = '{ "name": "x" }';
    expect(readSchemaRef(bare)).toBeNull();
    expect(withSchemaRef(bare, "./manifest.schema.json")).toBe(bare);
    expect(normalizeSchemaRef(bare, text)).toBe(bare);
    expect(normalizeSchemaRef(text, null)).toBe(text);
    expect(normalizeSchemaRef(text, "")).toBe(text);
  });

  it("computes the path from the manifest's directory to the project root", () => {
    expect(schemaRefFor("/p/ui/primitives/button", "/p")).toBe("../../../manifest.schema.json");
    expect(schemaRefFor("/p/web/ui/primitives/button", "/p")).toBe("../../../../manifest.schema.json");
    expect(schemaRefFor("/p", "/p")).toBe("./manifest.schema.json");
  });
});

describe("manifest $schema in a project (1.1F-26)", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
    rmSync(FAKE_REGISTRY, { recursive: true, force: true });
  });

  it("init writes the schema at the project root and lists it", async () => {
    const { output } = await run(() => init([]));
    expect(readFileSync(join(TEST_DIR, "manifest.schema.json"), "utf8")).toBe(SHIPPED_SCHEMA);
    expect(output).toContain("manifest.schema.json");
  });

  it("init leaves a schema file of the project's own alone", async () => {
    const own = '{ "$id": "https://example.com/own.schema.json" }\n';
    writeFileSync(join(TEST_DIR, "manifest.schema.json"), own);
    await run(() => init([]));
    expect(readFileSync(join(TEST_DIR, "manifest.schema.json"), "utf8")).toBe(own);
  });

  it("add with the default output_dir keeps the registry's bytes", async () => {
    await run(() => init([]));
    await run(() => add(["button"]));
    const m = manifestAt("ui");
    expect(m.text).toBe(readFileSync(REGISTRY_BUTTON, "utf8"));
    expect(existsSync(resolve(dirname(m.path), m.ref!))).toBe(true);
  });

  it("add with a nested output_dir points $schema at the project's schema", async () => {
    await run(() => init(["--dir", "web/ui"]));
    await run(() => add(["button"]));
    const m = manifestAt("web/ui");
    expect(m.ref).toBe("../../../../manifest.schema.json");
    expect(existsSync(resolve(dirname(m.path), m.ref!))).toBe(true);
    // Only the value moved: every other byte is the registry's.
    expect(normalizeSchemaRef(m.text, readFileSync(REGISTRY_BUTTON, "utf8"))).toBe(
      readFileSync(REGISTRY_BUTTON, "utf8"),
    );
  });

  it("add writes the schema in a project that has none", async () => {
    await run(() => init(["--dir", "web/ui"]));
    rmSync(join(TEST_DIR, "manifest.schema.json"));
    await run(() => add(["button"]));
    const m = manifestAt("web/ui");
    expect(existsSync(resolve(dirname(m.path), m.ref!))).toBe(true);
  });

  it("diff shows no $schema change after add, and still shows a real edit", async () => {
    await run(() => init(["--dir", "web/ui"]));
    await run(() => add(["button"]));

    const clean = await run(() => diff(["button", "--json"]));
    const report = JSON.parse(clean.output);
    expect(report.components[0].clean).toBe(true);
    expect(report.components[0].files).toEqual([]);

    const m = manifestAt("web/ui");
    writeFileSync(m.path, m.text.replace('"name": "button"', '"name": "button",\n  "x-local": true'));
    const edited = JSON.parse((await run(() => diff(["button", "--json"]))).output);
    expect(edited.components[0].files.map((f: { path: string }) => f.path)).toEqual(["button.manifest.json"]);
    expect(edited.components[0].summary.removed).toBe(0);
    const patch = (await run(() => diff(["button"]))).output;
    expect(patch).toContain("x-local");
    expect(patch).not.toMatch(/^[-+]\s*"\$schema"/m);
  });

  it("upgrade sees no local edit in $schema and writes the project's path back", async () => {
    await run(() => init(["--dir", "web/ui"]));
    await run(() => add(["button"]));
    const registry = { registryPath: FAKE_REGISTRY };

    // Same registry: the rewritten $schema is not a change to merge.
    await copyDir(join(getRegistryPath(), "primitives/button"), join(FAKE_REGISTRY, "primitives/button"));
    const same = JSON.parse((await run(() => upgrade(["button", "--json"], registry))).output);
    expect(same.components[0].status).toBe("up-to-date");

    // A newer manifest: merged cleanly, and still pointing at the project's schema.
    const manifest = JSON.parse(readFileSync(REGISTRY_BUTTON, "utf8"));
    manifest.version = "99.0.0";
    writeFileSync(
      join(FAKE_REGISTRY, "primitives/button/button.manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    const { output, code } = await run(() => upgrade(["button", "--json"], registry));
    expect(code).toBe(0);
    const report = JSON.parse(output);
    expect(report.components[0].status).toBe("upgraded");
    expect(report.components[0].conflictedFiles).toEqual([]);
    const m = manifestAt("web/ui");
    expect(JSON.parse(m.text).version).toBe("99.0.0");
    expect(m.ref).toBe("../../../../manifest.schema.json");
    expect(JSON.parse((await run(() => diff(["button", "--json"]))).output).components[0].clean).toBe(true);
  });

  it("doctor flags a deleted schema, and upgrade restores it", async () => {
    await run(() => init([]));
    await run(() => add(["button"]));
    expect((await run(() => doctor([]))).code).toBe(0);

    rmSync(join(TEST_DIR, "manifest.schema.json"));
    const broken = await run(() => doctor([]));
    expect(broken.code).toBe(1);
    expect(broken.output).toMatch(/Manifest schema: manifest\.schema\.json not found/);

    await run(() => upgrade([]));
    expect(readFileSync(join(TEST_DIR, "manifest.schema.json"), "utf8")).toBe(SHIPPED_SCHEMA);
    expect((await run(() => doctor([]))).code).toBe(0);
  });
});
