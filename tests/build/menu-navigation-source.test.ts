import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const HELPER = join(ROOT, "registry/core/menu-navigation.js");
const ENGINE = join(ROOT, "src/core-src/engine.js");

let buildCore: (opts?: Record<string, unknown>) => { code: string };
beforeAll(async () => {
  const mod = await import(join(ROOT, "scripts/build-core.mjs"));
  buildCore = mod.buildCore;
});

describe("menu navigation source structure", () => {
  test("dropdown, context-menu, and menubar import the same core module", () => {
    const expected = 'import { createMenuNavigation } from "../../core/menu-navigation.js";';
    for (const name of ["dropdown", "context-menu", "menubar"]) {
      const source = readFileSync(join(ROOT, `registry/recipes/${name}/${name}.js`), "utf8");
      expect(source).toContain(expected);
    }
  });

  test("there is one authored implementation and no engine copy", () => {
    const helper = readFileSync(HELPER, "utf8");
    const engine = readFileSync(ENGINE, "utf8");

    expect(helper.match(/export function createMenuNavigation\s*\(/g)).toHaveLength(1);
    expect(engine).toContain("// @faqir:menu-navigation");
    expect(engine).not.toMatch(/function createMenuNavigation\s*\(/);
  });

  test("build:core injects that implementation exactly once", () => {
    const { code } = buildCore({ write: false });
    expect(code.match(/function createMenuNavigation\s*\(/g)).toHaveLength(1);
    expect(code).not.toContain("export function createMenuNavigation");
  });
});
