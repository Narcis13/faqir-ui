// CI-gating tests for the published manifest.schema.json (task 0.5-07).
//
//  1. The schema is versioned and is itself valid JSON Schema (meta-validation
//     against the Draft-07 meta-schema).
//  2. Every registry manifest — component and theme — validates against it.
//  3. Every manifest carries a resolvable `$schema` reference.

import { describe, it, expect } from "bun:test";
import { Glob } from "bun";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { validateAgainstSchema } from "../../src/utils/json-schema";
import { DRAFT_07_META_SCHEMA } from "../../src/utils/draft-07-meta";

const ROOT = join(import.meta.dir, "../..");
const SCHEMA_PATH = join(ROOT, "manifest.schema.json");

async function loadSchema(): Promise<Record<string, unknown>> {
  return (await Bun.file(SCHEMA_PATH).json()) as Record<string, unknown>;
}

async function listManifests(pattern: string): Promise<string[]> {
  const out: string[] = [];
  const glob = new Glob(pattern);
  for await (const rel of glob.scan({ cwd: ROOT })) out.push(join(ROOT, rel));
  return out.sort();
}

describe("manifest.schema.json", () => {
  it("exists and is valid JSON", async () => {
    expect(existsSync(SCHEMA_PATH)).toBe(true);
    const schema = await loadSchema();
    expect(typeof schema).toBe("object");
  });

  it("declares a schema_version (the 1.0-01 freeze builds on this)", async () => {
    const schema = await loadSchema();
    expect(typeof schema.schema_version).toBe("string");
    expect((schema.schema_version as string).length).toBeGreaterThan(0);
  });

  it("targets the Draft-07 meta-schema", async () => {
    const schema = await loadSchema();
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
  });

  it("is itself valid JSON Schema (meta-validation)", async () => {
    const schema = await loadSchema();
    const errors = validateAgainstSchema(DRAFT_07_META_SCHEMA, schema);
    expect(errors).toEqual([]);
  });

  it("covers both component and theme manifests", async () => {
    const schema = await loadSchema();
    const defs = schema.definitions as Record<string, unknown>;
    expect(defs.componentManifest).toBeDefined();
    expect(defs.themeManifest).toBeDefined();
    expect(defs.change).toBeDefined();
  });
});

describe("every registry manifest validates against the schema", () => {
  it("validates all component manifests", async () => {
    const schema = await loadSchema();
    const files = await listManifests("registry/**/*.manifest.json");
    expect(files.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const file of files) {
      const data = await Bun.file(file).json();
      const errors = validateAgainstSchema(schema, data);
      if (errors.length) failures.push(`${file}: ${errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
    }
    expect(failures).toEqual([]);
  });

  it("validates all theme manifests", async () => {
    const schema = await loadSchema();
    const files = await listManifests("registry/themes/*.theme.json");
    expect(files.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const file of files) {
      const data = await Bun.file(file).json();
      const errors = validateAgainstSchema(schema, data);
      if (errors.length) failures.push(`${file}: ${errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
    }
    expect(failures).toEqual([]);
  });

  it("every manifest carries a resolvable $schema reference", async () => {
    const files = [
      ...(await listManifests("registry/**/*.manifest.json")),
      ...(await listManifests("registry/themes/*.theme.json")),
    ];
    const missing: string[] = [];
    for (const file of files) {
      const data = (await Bun.file(file).json()) as Record<string, unknown>;
      const ref = data.$schema;
      if (typeof ref !== "string") {
        missing.push(`${file}: no $schema`);
        continue;
      }
      const resolved = resolve(dirname(file), ref);
      if (!existsSync(resolved)) missing.push(`${file}: $schema '${ref}' does not resolve`);
    }
    expect(missing).toEqual([]);
  });
});

describe("json-schema validator", () => {
  it("accepts a minimal valid component manifest", async () => {
    const schema = await loadSchema();
    const ok = {
      name: "x",
      version: "1.0.0",
      kind: "primitive",
      category: "test",
      description: "test",
      anatomy: { tag: "div", selector: "[data-ui='x']", content_model: "block" },
      slots: {},
      variants: {},
      states: {},
      a11y: {},
      tokens_used: [],
      templates: { html: "<div></div>" },
      safe_transforms: [],
      unsafe_transforms: [],
      composition: { contains: [], used_in: [] },
      files: { html: "x.html", css: "x.css", manifest: "x.manifest.json" },
      tests: [],
    };
    expect(validateAgainstSchema(schema, ok)).toEqual([]);
  });

  it("rejects an object that is neither a component nor a theme manifest", async () => {
    const schema = await loadSchema();
    const errors = validateAgainstSchema(schema, { name: "x" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a bad kind enum", async () => {
    const schema = await loadSchema();
    const compDef = { ...(schema.definitions as any).componentManifest, definitions: schema.definitions };
    const errors = validateAgainstSchema(compDef, {
      name: "x", version: "1", kind: "widget", category: "c", description: "d",
      anatomy: { tag: "div", selector: "s" }, slots: {}, variants: {}, states: {}, a11y: {},
      tokens_used: [], templates: { html: "<x>" }, safe_transforms: [], unsafe_transforms: [],
      composition: { contains: [], used_in: [] }, files: { html: "a", css: "b", manifest: "c" }, tests: [],
    });
    expect(errors.some((e) => e.path.includes("kind"))).toBe(true);
  });

  it("enforces required change-entry fields", async () => {
    const schema = await loadSchema();
    const changeDef = { ...(schema.definitions as any).change };
    expect(validateAgainstSchema(changeDef, { version: "1.0.0", note: "x", breaking: false })).toEqual([]);
    expect(validateAgainstSchema(changeDef, { version: "1.0.0", note: "x" }).length).toBeGreaterThan(0);
  });
});
