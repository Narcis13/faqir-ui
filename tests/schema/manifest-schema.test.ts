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
import { SCHEMA_VERSION } from "../../src/version";
import {
  THEME_AXIS_VALUES,
  THEME_DERIVED_AXES,
  THEME_SEED_AXES,
  THEME_SEED_DEFAULTS,
} from "../../src/theme-manifest";

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

  it("declares the frozen schema_version (task 1.0-01)", async () => {
    const schema = await loadSchema();
    // Exactly the constant, not merely "a string": the freeze is a number the
    // spec, the CLI and the published site path all repeat, and
    // `tests/spec/protocol-1.0.test.ts` compares all four.
    expect(schema.schema_version).toBe(SCHEMA_VERSION);
    expect(schema.stability).toBe("frozen");
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

// ── task 1.1A-07: schema 1.1 — the five optional theme-manifest fields ──
//
// The amendment SPEC-1.0 §8 classifies as `additive`, taken at its word: the
// required set does not move, every shipped manifest still validates, and the
// new fields are checked only when a manifest chooses to carry one.
//
// The second half of this block is a drift gate. The axis vocabulary exists
// twice on purpose — once in `manifest.schema.json` for whatever resolves the
// published contract, once in `src/theme-manifest.ts` for the CLI's own
// validator — and two copies of a vocabulary are two vocabularies unless
// something compares them. This does, in both directions.

describe("schema 1.1 · the theme manifest's optional fields", () => {
  /** The theme definition, carrying the document's `definitions` as its `$ref` root. */
  async function themeDefinition(): Promise<Record<string, unknown>> {
    const schema = await loadSchema();
    const defs = schema.definitions as Record<string, Record<string, unknown>>;
    return { ...defs.themeManifest, definitions: defs };
  }

  /** A shipped manifest, as the base every probe mutates. */
  async function shippedTheme(): Promise<Record<string, unknown>> {
    return (await Bun.file(join(ROOT, "registry/themes/midnight.theme.json")).json()) as Record<string, unknown>;
  }

  async function check(extra: Record<string, unknown>): Promise<string[]> {
    const def = await themeDefinition();
    const errors = validateAgainstSchema(def, { ...(await shippedTheme()), ...extra });
    return errors.map((e) => `${e.path} ${e.message}`);
  }

  const AXES = {
    accent_hue: 250,
    accent_chroma: 0.2,
    neutral: "cool",
    scheme: "both",
    type: { pairing: "system", scale: 1.2, base: 16, voice: { weight: "bold", tracking: "normal", transform: "none" } },
    shape: { radius: "soft", border: "hairline", corner: "round" },
    depth: "soft",
    material: "none",
    motion: "smooth",
    density: "comfortable",
    focus: "ring",
    decoration: { link: "offset", divider: "solid" },
    controls: { button: "soft", input: "box", checkbox: "square", switch: "pill" },
    contrast: "standard",
  };

  it("declares all five, and none of them required — the freeze", async () => {
    const schema = await loadSchema();
    const theme = (schema.definitions as Record<string, any>).themeManifest;
    for (const field of ["seed", "axes", "fonts", "distinctiveness", "visual_matrix"]) {
      expect(theme.properties[field], `${field} is not declared`).toBeDefined();
      expect(theme.required, `${field} was made required — that is a 2.0`).not.toContain(field);
    }
    // The 1.0 required set, verbatim. A manifest that validated then validates now.
    expect(theme.required).toEqual([
      "name",
      "version",
      "mood",
      "scheme",
      "dark_mode",
      "tokens_overridden",
      "tokens_inherited",
      "pairs_with",
      "preview",
    ]);
  });

  it("records the amendment in its own changelog, as not breaking", async () => {
    const schema = await loadSchema();
    const rows = schema.changelog as { version: string; task: string; breaking: boolean }[];
    const last = rows.at(-1)!;
    expect(last.version).toBe("1.1");
    expect(last.version).toBe(schema.schema_version as string);
    expect(last.task).toBe("1.1A-07");
    expect(last.breaking).toBe(false);
    // The protocol did not move with it.
    expect(schema.protocol_version).toBe("1.0");
  });

  it("validates a theme carrying all five", async () => {
    expect(
      await check({
        seed: { name: "midnight", accent: "oklch(0.62 0.2 250)", neutral: "cool", shape: { radius: "round" } },
        axes: AXES,
        fonts: [{ family: "Fraunces", license: "OFL-1.1", role: "heading", source: "google-fonts" }],
        distinctiveness: { nearest: "slate", axis_distance: 6, token_distance: 0.41 },
        visual_matrix: false,
      }),
    ).toEqual([]);
  });

  it("takes an accent and a name as a complete seed", async () => {
    expect(await check({ seed: { name: "x", accent: "oklch(0.62 0.2 40)" } })).toEqual([]);
    expect(await check({ seed: { name: "x", accent: "#3b82f6" } })).toEqual([]);
    expect(await check({ seed: { name: "x", accent: "white" } })).toEqual([]);
    // …and nothing less than that.
    expect((await check({ seed: { name: "x" } })).join(" ")).toContain("accent");
    expect((await check({ seed: { accent: "#3b82f6" } })).join(" ")).toContain("name");
    expect((await check({ seed: { name: "x", accent: "cornflowerblue" } })).join(" ")).toContain("pattern");
  });

  it("rejects a value outside an axis vocabulary, at any depth", async () => {
    expect((await check({ seed: { name: "x", accent: "#333", neutral: "beige" } })).join(" ")).toContain("enum");
    expect((await check({ seed: { name: "x", accent: "#333", type: { scale: 1.4 } } })).join(" ")).toContain("enum");
    expect(
      (await check({ seed: { name: "x", accent: "#333", type: { voice: { transform: "shouty" } } } })).join(" "),
    ).toContain("enum");
    expect(
      (await check({ seed: { name: "x", accent: "#333", controls: { switch: "rounded" } } })).join(" "),
    ).toContain("enum");
  });

  it("rejects a misspelled axis rather than ignoring it", async () => {
    expect((await check({ seed: { name: "x", accent: "#333", raduis: "soft" } })).join(" ")).toContain(
      "not allowed",
    );
    expect((await check({ axes: { ...AXES, extra: 1 } })).join(" ")).toContain("not allowed");
  });

  it("requires every derived axis, and holds the accent to its ranges", async () => {
    expect(await check({ axes: AXES })).toEqual([]);
    for (const axis of Object.keys(AXES)) {
      const { [axis]: _dropped, ...partial } = AXES as Record<string, unknown>;
      expect((await check({ axes: partial })).join(" "), `axes.${axis} is not required`).toContain(axis);
    }
    expect((await check({ axes: { ...AXES, accent_hue: 400 } })).join(" ")).toContain("maximum");
    expect((await check({ axes: { ...AXES, accent_chroma: -1 } })).join(" ")).toContain("minimum");
  });

  it("rejects a non-boolean visual_matrix and a malformed font", async () => {
    expect((await check({ visual_matrix: "yes" })).join(" ")).toContain("expected type boolean");
    expect(await check({ visual_matrix: false })).toEqual([]);
    expect((await check({ fonts: [{ family: "Fraunces", license: "OFL-1.1", role: "display" }] })).join(" ")).toContain(
      "enum",
    );
    expect((await check({ fonts: [{ family: "Fraunces", role: "heading" }] })).join(" ")).toContain("license");
    expect((await check({ distinctiveness: { nearest: "slate", axis_distance: 6.5, token_distance: 0.4 } })).join(" "))
      .toContain("integer");
  });
});

describe("schema 1.1 · the axis vocabulary exists twice and agrees", () => {
  /** Resolve one level of local `$ref`. */
  function deref(node: Record<string, any>, defs: Record<string, any>): Record<string, any> {
    return typeof node.$ref === "string" ? defs[node.$ref.split("/").pop()!] : node;
  }

  /** Every enumerated leaf under an object definition, by dotted path. */
  function vocabulary(
    node: Record<string, any>,
    defs: Record<string, any>,
    prefix = "",
    out: Record<string, unknown[]> = {},
  ): Record<string, unknown[]> {
    for (const [key, raw] of Object.entries((node.properties ?? {}) as Record<string, any>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const child = deref(raw, defs);
      if (Array.isArray(child.enum)) out[path] = child.enum;
      else if (child.type === "object") vocabulary(child, defs, path, out);
    }
    return out;
  }

  /** Every declared `default` under an object definition, by dotted path. */
  function defaults(
    node: Record<string, any>,
    defs: Record<string, any>,
    prefix = "",
    out: Record<string, unknown> = {},
  ): Record<string, unknown> {
    for (const [key, raw] of Object.entries((node.properties ?? {}) as Record<string, any>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const child = deref(raw, defs);
      if ("default" in child) out[path] = child.default;
      if (child.type === "object") defaults(child, defs, path, out);
    }
    return out;
  }

  it("states the same vocabulary as src/theme-manifest.ts", async () => {
    const defs = (await loadSchema()).definitions as Record<string, any>;
    expect(vocabulary(defs.themeSeed, defs)).toEqual(
      JSON.parse(JSON.stringify(THEME_AXIS_VALUES)) as Record<string, unknown[]>,
    );
  });

  it("states the same vocabulary on the derived side as on the seed side", () => {
    // What "themeAxes is the seed's vocabulary minus accent and document, plus
    // accent_hue and accent_chroma" means, mechanically. The four composite
    // axes cannot drift — one definition, two users — and this is what stops
    // the ten scalar ones from drifting instead.
    return loadSchema().then((schema) => {
      const defs = schema.definitions as Record<string, any>;
      expect(vocabulary(defs.themeAxes, defs)).toEqual(vocabulary(defs.themeSeed, defs));
      expect(Object.keys(defs.themeSeed.properties).filter((k) => k !== "name")).toEqual([...THEME_SEED_AXES]);
      expect(Object.keys(defs.themeAxes.properties)).toEqual([...THEME_DERIVED_AXES]);
      expect(defs.themeAxes.required).toEqual([...THEME_DERIVED_AXES]);
      // Fourteen axes, counted on both sides (FAQIR-VISION §5.2).
      expect(THEME_SEED_AXES.length).toBe(14);
      expect(THEME_DERIVED_AXES.length).toBe(14);
    });
  });

  it("states the same defaults as src/theme-manifest.ts, on every optional axis", async () => {
    const defs = (await loadSchema()).definitions as Record<string, any>;
    expect(defaults(defs.themeSeed, defs)).toEqual(
      JSON.parse(JSON.stringify(THEME_SEED_DEFAULTS)) as Record<string, unknown>,
    );
    // Every optional seed axis has one: that is what makes `{ name, accent }`
    // complete, and what 1.1A-10 reads instead of inventing its own.
    const missing = Object.keys(vocabulary(defs.themeSeed, defs)).filter(
      (path) => !(path in defaults(defs.themeSeed, defs)),
    );
    expect(missing).toEqual([]);
  });

  it("documents every default in prose too, not only as a keyword", async () => {
    // The acceptance criterion names the `description` strings specifically:
    // an agent reading the generated reference sees the markdown, not the JSON.
    const defs = (await loadSchema()).definitions as Record<string, any>;
    const declared = defaults(defs.themeSeed, defs);
    const undocumented: string[] = [];
    for (const [path, value] of Object.entries(declared)) {
      const node = path
        .split(".")
        .reduce<Record<string, any>>((n, key) => deref(n.properties[key], defs), defs.themeSeed);
      if (!String(node.description ?? "").includes(`Default \`${value}\``)) undocumented.push(path);
    }
    expect(undocumented).toEqual([]);
  });
});
