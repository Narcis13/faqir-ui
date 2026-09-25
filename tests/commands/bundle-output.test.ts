import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ROOT = join(import.meta.dir, "../..");
const ENTRY = join(ROOT, "src", "index.ts");
const TEST_DIR = join(import.meta.dir, "../.tmp-bundle-output-test");

function cli(args: string[]) {
  return runSync("bun", [ENTRY, "bundle", ...args], {
    cwd: TEST_DIR,
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT.CLI,
  });
}

// `--output` was `join(cwd, arg)`: an absolute path landed under the project and
// `../x` wrote outside it. Now an absolute path is honoured and a relative one is
// held inside the project — the rule `theme --out` applies.
describe("faqir bundle --output", () => {
  const outside = mkdtempSync(join(tmpdir(), "faqir-bundle-out-"));

  beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init(["--yes"]);
    } finally {
      process.chdir(origCwd);
    }
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("writes a relative path inside the project", () => {
    const r = cli(["--output", "dist/site.css"]);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(existsSync(join(TEST_DIR, "dist", "site.css"))).toBe(true);
  });

  it("honours an absolute path as that path", () => {
    const target = join(outside, "site.css");
    const r = cli(["--output", target]);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(existsSync(target)).toBe(true);
    expect(existsSync(join(TEST_DIR, outside.slice(1), "site.css"))).toBe(false);
  });

  it("refuses a relative path that climbs out of the project", () => {
    const r = cli(["--output", "../escaped.css"]);
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("Refusing to write outside the project");
    expect(existsSync(join(TEST_DIR, "..", "escaped.css"))).toBe(false);
  });
});
