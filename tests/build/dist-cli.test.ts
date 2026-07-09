import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = join(ROOT, "dist", "faqir.mjs");

/**
 * Run the compiled CLI with the Node runtime. `node` has no global `Bun`, so
 * this exercises the exact code path a machine with no Bun installed would take.
 */
function runNode(args: string[], cwd: string) {
  return spawnSync("node", [DIST, ...args], { cwd, encoding: "utf8" });
}

let tmp: string;

beforeAll(() => {
  if (!existsSync(DIST)) {
    const build = spawnSync("bun", ["run", "build:cli"], { cwd: ROOT, encoding: "utf8" });
    if (build.status !== 0) {
      throw new Error(`build:cli failed:\n${build.stdout ?? ""}${build.stderr ?? ""}`);
    }
  }
  tmp = mkdtempSync(join(tmpdir(), "faqir-dist-"));
});

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("compiled dist/faqir.mjs runs on plain Node", () => {
  test("the bundle exists after building", () => {
    expect(existsSync(DIST)).toBe(true);
  });

  test("--version prints the version and exits 0", () => {
    const r = runNode(["--version"], tmp);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("help exits 0", () => {
    const r = runNode(["help"], tmp);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("faqir");
  });

  test("list resolves the shipped registry and exits 0", () => {
    const r = runNode(["list"], tmp);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("PRIMITIVES");
  });

  test("init then add --dry-run works end-to-end", () => {
    const init = runNode(["init"], tmp);
    expect(init.status).toBe(0);
    expect(existsSync(join(tmp, "faqir.config.json"))).toBe(true);

    const dry = runNode(["add", "button", "--dry-run"], tmp);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("button");
    // --dry-run must not write the component
    expect(existsSync(join(tmp, "ui", "primitives", "button"))).toBe(false);
  });

  test("a real add installs component files (glob + write shims)", () => {
    const add = runNode(["add", "button"], tmp);
    expect(add.status).toBe(0);
    expect(existsSync(join(tmp, "ui", "primitives", "button", "button.css"))).toBe(true);
    expect(existsSync(join(tmp, "ui", "primitives", "button", "button.manifest.json"))).toBe(true);
  });
});
