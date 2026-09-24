// `faqir upgrade` / `add` / `doctor` and the framework files (1.1 release blocker).
//
// `faqir init` writes the token layer and base styles once. Until this change
// nothing refreshed them: a 1.0 project that ran `faqir upgrade` got 1.1
// components reading ~54 custom properties its 1.0 tokens never defined — a
// switch with no width, a dialog with no fill, a focus with no ring — and
// `faqir doctor` said healthy.
//
// The 1.0 project here is real: `tests/fixtures/v100-framework/` holds the
// token layer, theme and base styles `npx faqir-ui-cli@1.0.0 init` wrote
// (including the first-line banner the 1.0 Node bundle mangled). Each test
// lays those bytes over a fresh project that has 1.1 components installed —
// exactly the state the old `upgrade` left behind — and removes the framework
// baseline, which no 1.0 project has.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { upgrade } from "../../src/commands/upgrade";
import { doctor } from "../../src/commands/doctor";
import { getRegistryPath } from "../../src/utils/fs";
import { RELEASED_FRAMEWORK_HASHES } from "../../src/utils/framework-history";
import {
  appendMissingDeclarations,
  combinedTokens,
  frameworkAssets,
  installedStylesheets,
  isReleasedFrameworkFile,
  missingTokens,
  unresolvedReferences,
} from "../../src/utils/framework-assets";

const ROOT = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-upgrade-framework-test");
const FAKE_REGISTRY = join(import.meta.dir, "../.tmp-upgrade-framework-registry");
const FIXTURE = join(import.meta.dir, "../fixtures/v100-framework");
const UI = join(TEST_DIR, "ui");
const COMPONENTS = ["switch", "button", "dialog", "input", "card"];

const read = (rel: string) => readFileSync(join(UI, rel), "utf8");

/** Run a command in-process, capturing output and any exit code it sets. */
async function run(fn: () => Promise<void>): Promise<{ output: string; code: number }> {
  const chunks: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit;
  const savedExitCode = process.exitCode;
  process.exitCode = 0;
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
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__exit__") throw e;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.stdout.write = origWrite;
    process.exit = origExit;
    if (!code && typeof process.exitCode === "number") code = process.exitCode;
    process.exitCode = typeof savedExitCode === "number" ? savedExitCode : 0;
  }
  return { output: chunks.join(""), code };
}

/** Lay the 1.0 framework files over the project and forget any baseline. */
function regressTo10(): void {
  for (const rel of ["tokens/index.css", "tokens/imports.css", "tokens/theme.css", "base/reset.css", "base/prose.css", "base/rhythm.css", "base/motion-presets.css"]) {
    cpSync(join(FIXTURE, rel), join(UI, rel));
  }
  rmSync(join(TEST_DIR, ".faqir/pristine/framework"), { recursive: true, force: true });
}

/** Every custom property the installed components and base styles read, unresolved. */
function unresolved(): string[] {
  const config = JSON.parse(readFileSync(join(TEST_DIR, "faqir.config.json"), "utf8"));
  return missingTokens(UI, installedStylesheets(config, UI)).map((m) => m.token);
}

describe("a 1.0 project with 1.1 components", () => {
  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
    await run(() => init([]));
    await run(() => add(COMPONENTS));
    regressTo10();
  });

  afterEach(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
    rmSync(FAKE_REGISTRY, { recursive: true, force: true });
  });

  it("the fixture really is 1.0: its components read tokens it does not define", () => {
    const missing = unresolved();
    for (const token of ["--switch-radius", "--panel-bg", "--focus-ring-color", "--border-width", "--disabled-opacity"]) {
      expect(missing).toContain(token);
    }
    expect(isReleasedFrameworkFile("tokens/index.css", read("tokens/index.css"))).toBe(true);
  });

  it("doctor fails, names the tokens and says to run faqir upgrade", async () => {
    const { output, code } = await run(() => doctor([]));
    expect(code).toBe(1);
    expect(output).toContain("Token coverage");
    expect(output).toContain("--border-width");
    expect(output).toContain("faqir upgrade");
  });

  it("upgrade brings the token layer and base up to date — every var() resolves", async () => {
    const theme = read("tokens/theme.css");
    const { output, code } = await run(() => upgrade(["--json"]));
    expect(code).toBe(0);
    const report = JSON.parse(output.slice(output.indexOf("{")));
    const status = Object.fromEntries(report.framework.files.map((f: { path: string; status: string }) => [f.path, f.status]));
    // Untouched 1.0 files are recognized by hash and fast-forwarded.
    expect(status["tokens/index.css"]).toBe("updated");
    expect(status["base/reset.css"]).toBe("updated");
    expect(read("tokens/index.css")).toBe(combinedTokens(getRegistryPath()));

    expect(unresolved()).toEqual([]);
    // The user's theme is theirs: byte-identical, and never in the report.
    expect(read("tokens/theme.css")).toBe(theme);
    expect(Object.keys(status)).not.toContain("tokens/theme.css");

    const after = await run(() => doctor([]));
    expect(after.output).toContain("Token coverage: Every custom property");
    // …and the bundle the page links carries the new layer.
    expect(read("faqir.bundle.css")).toContain("--switch-width:");
  });

  it("a 1.0 token file edited before any baseline existed keeps every edit and gains what it lacks", async () => {
    const edited = read("tokens/index.css").replace(/--color-bg:\s*var\(--palette-gray-25\);/, "--color-bg: hotpink;");
    expect(edited).toContain("hotpink");
    writeFileSync(join(UI, "tokens/index.css"), edited);

    const { output, code } = await run(() => upgrade(["--json"]));
    expect(code).toBe(0);
    const file = JSON.parse(output.slice(output.indexOf("{"))).framework.files.find(
      (f: { path: string }) => f.path === "tokens/index.css",
    );
    expect(file.status).toBe("appended");

    const merged = read("tokens/index.css");
    expect(merged.startsWith(edited)).toBe(true); // every byte the user had, in place
    expect(merged).toContain(":where(:root) {");
    expect(unresolved()).toEqual([]);

    // Idempotent: nothing is missing any more, so a second upgrade appends nothing.
    await run(() => upgrade([]));
    expect(read("tokens/index.css")).toBe(merged);
  });

  it("dry run plans the framework sync without writing", async () => {
    const before = read("tokens/index.css");
    const { output, code } = await run(() => upgrade(["--dry-run", "--json"]));
    expect(code).toBe(0);
    expect(JSON.parse(output.slice(output.indexOf("{"))).framework.changed).toBe(true);
    expect(read("tokens/index.css")).toBe(before);
    expect(existsSync(join(TEST_DIR, ".faqir/pristine/framework"))).toBe(false);
  });

  it("add refreshes the token layer when the component it installs reads a token it lacks", async () => {
    const { output } = await run(() => add(["toggle"]));
    expect(output).toContain("updating the token layer");
    expect(unresolved()).toEqual([]);
    expect(read("tokens/theme.css")).toBe(readFileSync(join(FIXTURE, "tokens/theme.css"), "utf8"));
  });
});

describe("after a baseline exists: three-way merge, conflicts reported", () => {
  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
    await run(() => init([]));
    await run(() => add(["button"]));
    regressTo10();
    await run(() => upgrade([])); // records the baseline at today's registry
    // A "next release": today's registry with one alias changed.
    rmSync(FAKE_REGISTRY, { recursive: true, force: true });
    mkdirSync(FAKE_REGISTRY, { recursive: true });
    cpSync(join(getRegistryPath(), "tokens"), join(FAKE_REGISTRY, "tokens"), { recursive: true });
    cpSync(join(getRegistryPath(), "base"), join(FAKE_REGISTRY, "base"), { recursive: true });
    const aliases = join(FAKE_REGISTRY, "tokens/aliases.css");
    writeFileSync(aliases, readFileSync(aliases, "utf8").replace("--card-padding:      var(--space-6);", "--card-padding:      var(--space-8);"));
  });

  afterEach(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
    rmSync(FAKE_REGISTRY, { recursive: true, force: true });
  });

  it("records the baseline the first upgrade synced to", () => {
    expect(existsSync(join(TEST_DIR, ".faqir/pristine/framework/framework.json"))).toBe(true);
  });

  it("an edit elsewhere merges cleanly with the registry's change", async () => {
    const mine = read("tokens/index.css").replace("--avatar-size-lg:    56px;", "--avatar-size-lg:    60px;");
    writeFileSync(join(UI, "tokens/index.css"), mine);
    const { code } = await run(() => upgrade([], { registryPath: FAKE_REGISTRY }));
    expect(code).toBe(0);
    expect(read("tokens/index.css")).toContain("--avatar-size-lg:    60px;");
    expect(read("tokens/index.css")).toContain("--card-padding:      var(--space-8);");
  });

  it("an edit on the same line conflicts: markers written, exit 2", async () => {
    const mine = read("tokens/index.css").replace("--card-padding:      var(--space-6);", "--card-padding:      2rem;");
    writeFileSync(join(UI, "tokens/index.css"), mine);
    const { output, code } = await run(() => upgrade(["--json"], { registryPath: FAKE_REGISTRY }));
    expect(code).toBe(2);
    const report = JSON.parse(output.slice(output.indexOf("{")));
    expect(report.hasConflicts).toBe(true);
    expect(report.framework.conflictedFiles).toEqual(["tokens/index.css"]);
    const merged = read("tokens/index.css");
    expect(merged).toContain("<<<<<<< ours");
    expect(merged).toContain("--card-padding:      2rem;");
    expect(merged).toContain("--card-padding:      var(--space-8);");
  });
});

describe("split token layout", () => {
  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
    await run(() => init(["--tokens-split"]));
    rmSync(join(TEST_DIR, ".faqir/pristine/framework"), { recursive: true, force: true });
  });

  afterEach(() => {
    process.chdir(ROOT);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("adds a token file the project never had, and never touches the theme", async () => {
    rmSync(join(UI, "tokens/textures.css"));
    writeFileSync(join(UI, "tokens/theme.css"), "/* mine */\n:root { --color-bg: red; }\n");
    const { output, code } = await run(() => upgrade(["--json"]));
    expect(code).toBe(0);
    const files = JSON.parse(output.slice(output.indexOf("{"))).framework.files;
    expect(files.find((f: { path: string }) => f.path === "tokens/textures.css").status).toBe("added");
    expect(existsSync(join(UI, "tokens/textures.css"))).toBe(true);
    expect(read("tokens/theme.css")).toBe("/* mine */\n:root { --color-bg: red; }\n");
  });

  it("frameworkAssets never lists the theme", () => {
    for (const split of [true, false]) {
      expect(frameworkAssets(getRegistryPath(), { tokens_split: split }).map((a) => a.path)).not.toContain(
        "tokens/theme.css",
      );
    }
  });
});

describe("the helpers", () => {
  it("unresolvedReferences follows fallbacks: a defined var never renders its fallback", () => {
    const css = "a { b: var(--x, var(--y)); c: var(--d, 1px); e: var(--def, var(--z)); f: var(--gone) }";
    expect(unresolvedReferences(css, new Set(["--def"]))).toEqual(["--gone", "--y"]);
  });

  it("appendMissingDeclarations keeps @supports nesting and density weight", () => {
    const theirs =
      ":root { --a: 1; --b: 2; }\n@supports (x: y) { :root { --b: 3; } }\n[data-density=\"compact\"] { --a: 0; }\n";
    const { content, added } = appendMissingDeclarations(":root { --a: 1; }\n", theirs, "test");
    expect(added).toEqual(["--b", "--a"]);
    expect(content).toContain(":where(:root) {\n  --b: 2;\n}");
    expect(content).toContain("@supports (x: y) {\n  :where(:root) {\n    --b: 3;\n  }\n}");
    expect(content).toContain('[data-density="compact"] {\n  --a: 0;\n}');
  });

  it("the released-hash table matches the tags it names (when the tags are present)", () => {
    let tags: string[] = [];
    try {
      tags = execFileSync("git", ["tag"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    } catch {
      // not a git checkout — nothing to recompute against
    }
    if (!tags.includes("v1.0.0")) return;
    const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    for (const rel of ["base/reset.css", "base/prose.css", "base/rhythm.css", "base/motion-presets.css", "tokens/aliases.css"]) {
      expect(RELEASED_FRAMEWORK_HASHES[rel], rel).toContain(sha(git("show", `v1.0.0:registry/${rel}`)));
    }
    // And the real 1.0 init output in the fixture is recognized, mangled banner and all.
    expect(isReleasedFrameworkFile("tokens/index.css", readFileSync(join(FIXTURE, "tokens/index.css"), "utf8"))).toBe(true);
    expect(isReleasedFrameworkFile("tokens/imports.css", readFileSync(join(FIXTURE, "tokens/imports.css"), "utf8"))).toBe(true);
  });
});
