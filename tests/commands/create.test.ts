// `faqir create` scaffolding tests (task 1.0R-04).
//
// Two things are asserted about every scaffolded component, for every kind the
// command accepts:
//
//   1. The manifest validates against the published `manifest.schema.json` — the
//      same document CI validates the registry against. A scaffold that cannot
//      pass the project's own gate is a trap, and `create` shipped exactly that
//      until this task: seventeen keys and no `$schema`.
//   2. The `$schema` it carries RESOLVES from the created file's own directory,
//      by the rule `scripts/add-schema-refs.mjs` applies to the registry —
//      recomputed here independently, and checked at two `output_dir` depths so
//      a hardcoded `../../../` would fail.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { create } from "../../src/commands/create";
import { init } from "../../src/commands/init";
import { validateManifest } from "../../src/manifest";
import { validateAgainstSchema } from "../../src/utils/json-schema";
import { SCHEMA_VERSION } from "../../src/version";

const REPO = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-create-test");
const SCHEMA = JSON.parse(readFileSync(join(REPO, "manifest.schema.json"), "utf8")) as Record<
  string,
  unknown
>;

/** kind → the layer directory it is scaffolded into. */
const LAYERS = {
  primitive: "primitives",
  recipe: "recipes",
  pattern: "patterns",
} as const;

type Kind = keyof typeof LAYERS;

/**
 * `add-schema-refs.mjs`'s rule, reimplemented rather than imported: a POSIX path
 * from the manifest's own directory to the project root's `manifest.schema.json`,
 * dot-prefixed. Two implementations that agree is the point of the check.
 */
function expectedSchemaRef(manifestPath: string, projectRoot: string): string {
  const rel = relative(dirname(manifestPath), join(projectRoot, "manifest.schema.json"))
    .split("\\")
    .join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** Read the manifest `faqir create <name> --kind <kind>` just wrote. */
function manifestPathFor(root: string, outputDir: string, kind: Kind, name: string): string {
  return join(root, outputDir, LAYERS[kind], name, `${name}.manifest.json`);
}

async function runCreate(root: string, args: string[]): Promise<void> {
  const originalCwd = process.cwd();
  process.chdir(root);
  try {
    await create(args);
  } finally {
    process.chdir(originalCwd);
  }
}

describe("faqir create", () => {
  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
    await init([]);
    process.chdir(REPO);
  });

  afterEach(() => {
    process.chdir(REPO);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("scaffolds a manifest that validates against schema 1.0, for every kind", async () => {
    expect(SCHEMA.schema_version).toBe(SCHEMA_VERSION);
    for (const kind of Object.keys(LAYERS) as Kind[]) {
      const name = `widget-${kind}`;
      await runCreate(TEST_DIR, [name, "--kind", kind]);

      const path = manifestPathFor(TEST_DIR, "ui", kind, name);
      expect(existsSync(path), `${kind} was not scaffolded at ${path}`).toBe(true);
      const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

      // The published schema — the same document the registry is gated against.
      expect(validateAgainstSchema(SCHEMA, manifest), `${kind} fails manifest.schema.json`).toEqual([]);
      // And the CLI's own validator, which the loader runs on every read.
      expect(validateManifest(manifest), `${kind} fails validateManifest`).toEqual([]);
      expect(manifest.kind).toBe(kind);
    }
  });

  it("carries every field `required` names — all seventeen", async () => {
    await runCreate(TEST_DIR, ["complete-widget", "--kind", "primitive"]);
    const manifest = JSON.parse(
      readFileSync(manifestPathFor(TEST_DIR, "ui", "primitive", "complete-widget"), "utf8"),
    ) as Record<string, unknown>;

    const definitions = SCHEMA.definitions as Record<string, { required?: string[] }>;
    const required = definitions.componentManifest.required ?? [];
    expect(required.length).toBe(17);
    for (const field of required) {
      expect(Object.keys(manifest), `${field} is missing from the scaffold`).toContain(field);
    }
  });

  it("carries a `$schema` that resolves from the created file's own directory", async () => {
    for (const kind of Object.keys(LAYERS) as Kind[]) {
      const name = `resolvable-${kind}`;
      await runCreate(TEST_DIR, [name, "--kind", kind]);

      const path = manifestPathFor(TEST_DIR, "ui", kind, name);
      const raw = readFileSync(path, "utf8");
      const manifest = JSON.parse(raw) as Record<string, unknown>;

      expect(manifest.$schema, `${kind} has no $schema`).toBe(expectedSchemaRef(path, TEST_DIR));
      // Resolution is the actual claim: joined to the file's own directory it
      // must land on the project root's schema, not merely "look relative".
      expect(resolve(dirname(path), manifest.$schema as string)).toBe(
        join(TEST_DIR, "manifest.schema.json"),
      );
      // First property, exactly as `add-schema-refs.mjs` inserts it.
      expect(Object.keys(manifest)[0]).toBe("$schema");
      expect(raw.split("\n")[1].trim()).toStartWith('"$schema":');
    }
  });

  it("computes the depth from `output_dir` rather than assuming one", async () => {
    const configPath = join(TEST_DIR, "faqir.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    config.output_dir = "./src/vendor/faqir";
    await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");

    await runCreate(TEST_DIR, ["deep-widget", "--kind", "primitive"]);
    const path = manifestPathFor(TEST_DIR, "src/vendor/faqir", "primitive", "deep-widget");
    const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

    // Five levels up, not the three a shallower project needs.
    expect(manifest.$schema).toBe("../../../../../manifest.schema.json");
    expect(manifest.$schema).toBe(expectedSchemaRef(path, TEST_DIR));
    expect(resolve(dirname(path), manifest.$schema as string)).toBe(
      join(TEST_DIR, "manifest.schema.json"),
    );
  });

  it("writes a controller for a recipe and none for a primitive or pattern", async () => {
    for (const kind of Object.keys(LAYERS) as Kind[]) {
      const name = `controller-${kind}`;
      await runCreate(TEST_DIR, [name, "--kind", kind]);
      const dir = join(TEST_DIR, "ui", LAYERS[kind], name);
      const manifest = JSON.parse(
        readFileSync(join(dir, `${name}.manifest.json`), "utf8"),
      ) as { files: Record<string, string> };

      for (const file of [`${name}.html`, `${name}.css`, `${name}.manifest.json`]) {
        expect(existsSync(join(dir, file)), `${file} is missing`).toBe(true);
      }
      // `files.js` and the file on disk agree, both ways.
      expect(existsSync(join(dir, `${name}.js`))).toBe(kind === "recipe");
      expect(Boolean(manifest.files.js)).toBe(kind === "recipe");
    }
  });

  it("registers the component in the layer its kind names", async () => {
    for (const kind of Object.keys(LAYERS) as Kind[]) {
      await runCreate(TEST_DIR, [`registered-${kind}`, "--kind", kind]);
    }
    const config = JSON.parse(readFileSync(join(TEST_DIR, "faqir.config.json"), "utf8")) as {
      installed: Record<string, string[]>;
    };
    for (const kind of Object.keys(LAYERS) as Kind[]) {
      expect(config.installed[LAYERS[kind]]).toContain(`registered-${kind}`);
    }
  });
});
