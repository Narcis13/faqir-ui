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
import { MANIFEST_CATEGORIES, validateManifest } from "../../src/manifest";
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

// ── task 0.8-02: `props`, responsive variants, and the category vocabulary ──

/** A schema-complete probe manifest; each test mutates one field of a copy. */
function probeManifest(): Record<string, unknown> {
  return {
    name: "zz-probe",
    version: "1.0.0",
    kind: "primitive",
    category: "layout",
    description: "Probe",
    anatomy: { tag: "div", selector: "[data-ui='zz-probe']", content_model: "block" },
    slots: {},
    variants: {
      cols: {
        values: ["1", "2", "3"],
        default: "1",
        attr: "data-cols",
        applied_to: "root",
        responsive: true,
      },
    },
    props: {
      dense: { type: "boolean", default: false, description: "data-dense on root" },
      locale: { type: "string", default: "", description: "data-locale for Intl formatting" },
      mode: { type: "enum", values: ["a", "b"], default: "a", description: "data-mode", attr: "data-mode" },
    },
    states: {},
    a11y: {},
    tokens_used: [],
    templates: { html: '<div data-ui="zz-probe"></div>' },
    safe_transforms: [],
    unsafe_transforms: [],
    composition: { contains: [], used_in: [] },
    files: { html: "p.html", css: "p.css", manifest: "p.manifest.json" },
    tests: [],
  };
}

describe("props + responsive variants (0.8-02)", () => {
  it("validates a manifest declaring a responsive group and props", async () => {
    const schema = await loadSchema();
    expect(validateAgainstSchema(schema, probeManifest())).toEqual([]);
    expect(validateManifest(probeManifest())).toEqual([]);
  });

  it("declares both fields in the published schema", async () => {
    const schema = await loadSchema();
    const defs = schema.definitions as Record<string, any>;
    expect(defs.componentManifest.properties.props).toBeDefined();
    expect(defs.prop).toBeDefined();
    expect(defs.variant.properties.responsive).toEqual(
      expect.objectContaining({ type: "boolean" }),
    );
  });

  it("rejects a malformed prop (bad type, missing description)", async () => {
    const schema = await loadSchema();
    const badType = probeManifest();
    (badType.props as any).dense.type = "object";
    expect(validateAgainstSchema(schema, badType).length).toBeGreaterThan(0);
    expect(validateManifest(badType).some((e) => e.field === "props.dense.type")).toBe(true);

    const noDescription = probeManifest();
    delete (noDescription.props as any).locale.description;
    expect(validateAgainstSchema(schema, noDescription).length).toBeGreaterThan(0);
    expect(validateManifest(noDescription).some((e) => e.field === "props.locale.description")).toBe(true);
  });

  it("rejects a non-boolean `responsive`", async () => {
    const schema = await loadSchema();
    const bad = probeManifest();
    (bad.variants as any).cols.responsive = "yes";
    expect(validateAgainstSchema(schema, bad).length).toBeGreaterThan(0);
    expect(validateManifest(bad).some((e) => e.field === "variants.cols.responsive")).toBe(true);
  });

  it("rejects a responsive PROTOCOL attribute — the protocol is frozen", () => {
    const bad = probeManifest();
    (bad.variants as any).cols.attr = "data-size";
    const errors = validateManifest(bad);
    expect(errors.some((e) => e.field === "variants.cols.responsive")).toBe(true);
  });

  it("keeps `props` legal for the registry manifests that already ship it", async () => {
    const schema = await loadSchema();
    const files = await listManifests("registry/**/*.manifest.json");
    const withProps = [] as string[];
    for (const file of files) {
      const data = (await Bun.file(file).json()) as Record<string, unknown>;
      if (data.props) withProps.push(file);
      expect(validateAgainstSchema(schema, data), file).toEqual([]);
    }
    // The field was de-facto — it is now declared, so this is a real check.
    expect(withProps.length).toBeGreaterThan(50);
  });
});

describe("the category vocabulary is closed and documented", () => {
  it("agrees across the schema, the TypeScript validator and CONTRIBUTING.md", async () => {
    const schema = await loadSchema();
    const enumValues = ((schema.definitions as any).category.enum as string[]).slice().sort();
    expect(enumValues).toEqual([...MANIFEST_CATEGORIES].sort());

    // CONTRIBUTING documents the same list in prose; parse it back out so the
    // two cannot drift (the 0.8-01 drift-test discipline).
    const contributing = await Bun.file(join(ROOT, "CONTRIBUTING.md")).text();
    const line = contributing
      .split("\n")
      .find((l) => l.startsWith("- `category` —"));
    expect(line, "CONTRIBUTING.md must document the category vocabulary").toBeDefined();
    const documented = [
      ...new Set(
        (line!.match(/`[a-z-]+`/g) ?? [])
          .map((x) => x.slice(1, -1))
          .filter((x) => x !== "category"),
      ),
    ].sort();
    expect(documented).toEqual([...MANIFEST_CATEGORIES].sort());
  });

  it("every registry manifest uses one spelling from that list", async () => {
    const files = await listManifests("registry/**/*.manifest.json");
    const offenders: string[] = [];
    for (const file of files) {
      const data = (await Bun.file(file).json()) as Record<string, unknown>;
      const category = data.category as string;
      // `custom` is what `faqir create` scaffolds OUTSIDE the registry.
      if (!MANIFEST_CATEGORIES.includes(category as never) || category === "custom") {
        offenders.push(`${file}: ${category}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("rejects the old `form` spelling", async () => {
    const schema = await loadSchema();
    const bad = { ...probeManifest(), category: "form" };
    expect(validateAgainstSchema(schema, bad).length).toBeGreaterThan(0);
    expect(validateManifest(bad).some((e) => e.field === "category")).toBe(true);
  });
});

describe("json-schema validator", () => {
  it("accepts a minimal valid component manifest", async () => {
    const schema = await loadSchema();
    const ok = {
      name: "x",
      version: "1.0.0",
      kind: "primitive",
      category: "layout",
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
