import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Task 0.4-22 · the §12.1 goal: every recipe controller must ship a behavior
// test. This meta-test discovers recipe controllers straight from disk and
// asserts each has a matching `tests/recipes/<name>.test.ts`, so the guarantee
// can't silently rot as new recipes land.

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const RECIPES_DIR = join(ROOT, "registry", "recipes");
const TESTS_DIR = join(ROOT, "tests", "recipes");

/** Recipe dirs whose `<name>.js` is tagged `@ui:controller`. */
function discoverControllers(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(RECIPES_DIR).sort()) {
    const abs = join(RECIPES_DIR, dir);
    if (!statSync(abs).isDirectory()) continue;
    let src: string;
    try {
      src = readFileSync(join(abs, `${dir}.js`), "utf8");
    } catch {
      continue;
    }
    if (/@ui:controller\s+/.test(src)) out.push(dir);
  }
  return out;
}

const CONTROLLERS = discoverControllers();

describe("recipe controller test coverage (§12.1)", () => {
  it("discovers the recipe controllers on disk", () => {
    // Sanity: the registry has grown well past a handful of recipes, so an empty
    // or tiny list means discovery broke, not that coverage is trivially met.
    expect(CONTROLLERS.length).toBeGreaterThanOrEqual(20);
    expect(CONTROLLERS).toContain("date-picker");
    expect(CONTROLLERS).toContain("table");
  });

  it("every recipe controller has a behavior test file", () => {
    const missing = CONTROLLERS.filter(
      (name) => !existsSync(join(TESTS_DIR, `${name}.test.ts`))
    );
    expect(missing).toEqual([]);
  });

  // One assertion per controller keeps the report legible: a regression names
  // the exact recipe that lost (or never had) its test.
  for (const name of CONTROLLERS) {
    it(`${name} has tests/recipes/${name}.test.ts`, () => {
      expect(existsSync(join(TESTS_DIR, `${name}.test.ts`))).toBe(true);
    });
  }
});
