import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Task 0.4-22 · the §12.1 goal: every recipe controller must ship a behavior
// test. This meta-test discovers recipe controllers straight from disk and
// asserts each has a matching `tests/recipes/<name>.test.ts`, so the guarantee
// can't silently rot as new recipes land.
//
// It used to assert that the FILE EXISTS and nothing more (W3-5), which an empty
// file satisfies. "Every controller has a test" is a claim about behaviour being
// exercised, so the check is now about content: the file must import the
// controller's own factory, call it, and assert something. That is still a cheap
// structural check rather than a judgement about test quality — but it is a
// check a placeholder cannot pass.

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

  /**
   * The factory the controller actually exports, read from its own source.
   *
   * Not derived from the directory name: three of them do not follow the naive
   * kebab → PascalCase rule (`createInputOTP`, `createQRCode`,
   * `createToastContainer`), and a rule that has exceptions is a rule that will
   * mis-blame the next one.
   */
  const factoryName = (recipe: string): string => {
    const src = readFileSync(join(RECIPES_DIR, recipe, `${recipe}.js`), "utf8");
    const m = /export\s+function\s+(create\w+)/.exec(src);
    if (!m) throw new Error(`${recipe}.js exports no create* factory`);
    return m[1];
  };

  // One assertion per controller keeps the report legible: a regression names
  // the exact recipe that lost (or never had) its test.
  for (const name of CONTROLLERS) {
    it(`${name} has a test that actually drives its controller`, () => {
      const file = join(TESTS_DIR, `${name}.test.ts`);
      expect(existsSync(file), `tests/recipes/${name}.test.ts does not exist`).toBe(true);

      const src = readFileSync(file, "utf8");
      const factory = factoryName(name);

      // It imports the controller from the registry — not a copy, not a mock.
      expect(src, `${name}.test.ts does not import ${factory}`).toContain(factory);
      expect(src, `${name}.test.ts does not import from the registry`).toMatch(
        new RegExp(`registry/recipes/${name}/${name}\\.js`),
      );
      // …calls it…
      expect(src, `${name}.test.ts never calls ${factory}()`).toMatch(
        new RegExp(`${factory}\\s*\\(`),
      );
      // …and asserts something about what happened.
      const assertions = src.match(/\bexpect\s*\(/g) ?? [];
      expect(
        assertions.length,
        `${name}.test.ts has ${assertions.length} assertions — a file that exists is not a test`,
      ).toBeGreaterThanOrEqual(5);
    });
  }
});
