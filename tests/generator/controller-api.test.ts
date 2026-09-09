// The controller API, on every surface that describes a component (task W2-4).
//
// 29 recipes ship a controller. Every one declares what it exposes on a
// `// @ui:provides` line, and every one of those lines is inlined verbatim into
// the shipped `faqir-core.js`. Nothing an agent reads ever showed it:
// `faqir explain toast --json` returned ten keys and no `api`, and `$ui.`
// appeared once in 228 KB of skill documentation.
//
// This holds the parser to the controllers, the manifests to the parser, and
// each surface to the manifests — so the chain from `@ui:provides` to the page
// an agent reads cannot break silently anywhere along it.

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  delegatedControllers,
  formatMethod,
  providedNames,
  readControllerApi,
} from "../../src/utils/controller-api";
import { renderComponentSection } from "../../src/generator/skill";
import { buildComponentEntry } from "../../src/generator/context";
import { loadManifest, type Manifest } from "../../src/manifest";

const ROOT = join(import.meta.dir, "../..");
const RECIPES = join(ROOT, "registry", "recipes");

/** Every recipe that ships a controller, with its source and manifest path. */
function recipesWithControllers(): { name: string; source: string; manifestPath: string }[] {
  const out: { name: string; source: string; manifestPath: string }[] = [];
  for (const name of readdirSync(RECIPES).sort()) {
    const js = join(RECIPES, name, `${name}.js`);
    const manifestPath = join(RECIPES, name, `${name}.manifest.json`);
    if (!existsSync(js) || !existsSync(manifestPath)) continue;
    out.push({ name, source: readFileSync(js, "utf8"), manifestPath });
  }
  return out;
}

const recipes = recipesWithControllers();

describe("readControllerApi · every advertised method resolves", () => {
  it("finds a signature for every name in every @ui:provides line", () => {
    expect(recipes.length).toBeGreaterThan(0);

    const unresolved: string[] = [];
    let total = 0;

    for (const { name, source } of recipes) {
      const fallbacks = delegatedControllers(source)
        .map((dep) => join(RECIPES, dep, `${dep}.js`))
        .filter((path) => existsSync(path))
        .map((path) => readFileSync(path, "utf8"));

      const advertised = providedNames(source);
      const resolved = new Set((readControllerApi(source, fallbacks)?.methods ?? []).map((m) => m.name));
      total += advertised.length;
      for (const method of advertised) {
        if (!resolved.has(method)) unresolved.push(`${name}.${method}`);
      }
    }

    // A name that resolves to nothing is a method an agent is told exists and
    // cannot call — the exact shape of the gap this task closes.
    expect(unresolved).toEqual([]);
    expect(total).toBeGreaterThan(150);
  });

  it("reads the four declaration shapes the registry actually uses", () => {
    const source = `
      // @ui:provides declared arrow shorthand property destroy
      export function createThing(root) {
        /** Does the declared thing. */
        function declared(index, options) {}
        const arrow = (a, b) => a + b;
        const api = {
          shorthand(x) {},
          property: (y) => y,
          destroy() {},
          declared,
          arrow,
        };
        return api;
      }`;
    const api = readControllerApi(source)!;
    expect(api.methods.map(formatMethod)).toEqual([
      "declared(index, options)",
      "arrow(a, b)",
      "shorthand(x)",
      "property(y)",
      "destroy()",
    ]);
    expect(api.methods[0].description).toBe("Does the declared thing.");
  });

  it("reads a delegating controller's surface from the one it delegates to", () => {
    // alert-dialog IS dialog with a different role — it declares none of its
    // four methods locally, and a parser that stopped at the file would show
    // an empty API for a component that has a full one.
    const alert = readFileSync(join(RECIPES, "alert-dialog", "alert-dialog.js"), "utf8");
    expect(delegatedControllers(alert)).toContain("dialog");

    const dialog = readFileSync(join(RECIPES, "dialog", "dialog.js"), "utf8");
    expect(readControllerApi(alert)).toBeNull(); // nothing local — proves the fallback matters
    const api = readControllerApi(alert, [dialog])!;
    expect(api.methods.map((m) => m.name)).toEqual(["open", "close", "toggle", "destroy"]);
  });

  it("never invents a signature for a method it cannot find", () => {
    const api = readControllerApi(`// @ui:provides ghost\nexport function createX() {}`);
    expect(api).toBeNull();
  });
});

describe("the manifests carry what the controllers declare", () => {
  it("every controller-backed recipe manifest has an api matching its source", () => {
    const drift: string[] = [];
    for (const { name, source, manifestPath } of recipes) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
      const fallbacks = delegatedControllers(source)
        .map((dep) => join(RECIPES, dep, `${dep}.js`))
        .filter((path) => existsSync(path))
        .map((path) => readFileSync(path, "utf8"));
      const expected = readControllerApi(source, fallbacks);

      if (JSON.stringify(manifest.api ?? null) !== JSON.stringify(expected)) {
        drift.push(name);
      }
    }
    expect(drift, "run `bun run build:manifest-api` and commit").toEqual([]);
  });

  it("a CSS-only primitive declares no api at all", async () => {
    const badge = await loadManifest(join(ROOT, "registry/primitives/badge/badge.manifest.json"));
    expect(badge.api).toBeUndefined();
  });
});

describe("every surface renders it", () => {
  it("the skill's component section lists the methods with their signatures", async () => {
    const drawer = await loadManifest(join(RECIPES, "drawer/drawer.manifest.json"));
    const section = renderComponentSection(drawer).join("\n");

    expect(section).toContain("**Controller API**");
    expect(section).toContain("$ui.<method>()");
    expect(section).toContain("createDrawer(root)");
    for (const method of ["open()", "close()", "toggle()", "destroy()"]) {
      expect(section).toContain(`\`${method}\``);
    }
  });

  it("the context entry carries the signatures", async () => {
    const table = await loadManifest(join(RECIPES, "table/table.manifest.json"));
    const entry = buildComponentEntry(table);
    const api = entry.api as string[];

    expect(Array.isArray(api)).toBe(true);
    expect(api).toContain("sort(columnIndex, direction)");
    expect(api).toContain("exportCsv(o = {})");
    expect(api).toContain("destroy()");
  });

  it("a primitive's context entry has no api key rather than an empty one", async () => {
    const badge = await loadManifest(join(ROOT, "registry/primitives/badge/badge.manifest.json"));
    expect(buildComponentEntry(badge).api).toBeUndefined();
  });
});
