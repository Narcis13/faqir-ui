import { describe, it, expect } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildRegistryIndex,
  serializeRegistryIndex,
  hashComponentFiles,
  validateRegistryIndex,
  indexToMap,
  REGISTRY_INDEX_SCHEMA,
} from "../../src/utils/registry-index";
import { getRegistryPath } from "../../src/utils/fs";

const REGISTRY = getRegistryPath();

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("buildRegistryIndex", () => {
  it("is complete — every registry component appears with kind/layer/version/deps", () => {
    const index = buildRegistryIndex(REGISTRY);

    expect(index.schema).toBe(REGISTRY_INDEX_SCHEMA);
    expect(index.count).toBe(index.components.length);
    expect(index.count).toBeGreaterThan(30);

    const map = indexToMap(index);
    const button = map.get("button");
    expect(button).toBeDefined();
    expect(button!.kind).toBe("primitive");
    expect(button!.layer).toBe("primitives");
    expect(button!.version).toBe("1.0.0");
    expect(button!.deps).toEqual([]);

    // card composes button → recorded as a dependency
    const card = map.get("card");
    expect(card!.deps).toContain("button");
  });

  it("records EVERY file in a component dir, not just manifest-declared ones", () => {
    const index = buildRegistryIndex(REGISTRY);
    const icon = indexToMap(index).get("icon");
    expect(icon).toBeDefined();
    const paths = icon!.files.map((f) => f.path);
    // icons.css and LICENSE.lucide exist on disk but are not all in files{}
    expect(paths).toContain("icons.css");
    expect(paths).toContain("LICENSE.lucide");
    expect(paths).toContain("icon.manifest.json");
  });

  it("has hashes that match the actual file bytes", () => {
    const index = buildRegistryIndex(REGISTRY);
    for (const entry of index.components) {
      for (const file of entry.files) {
        const bytes = readFileSync(join(REGISTRY, entry.layer, entry.name, file.path));
        expect(file.sha256).toBe(sha256(bytes));
      }
      // aggregate component hash is consistent with its files
      expect(entry.hash).toBe(hashComponentFiles(entry.files));
    }
  });

  it("is deterministic — regenerating yields byte-identical output", () => {
    const a = serializeRegistryIndex(buildRegistryIndex(REGISTRY));
    const b = serializeRegistryIndex(buildRegistryIndex(REGISTRY));
    expect(a).toBe(b);
  });

  it("orders components by layer then name, and files by path", () => {
    const index = buildRegistryIndex(REGISTRY);
    const layerRank = { primitives: 0, recipes: 1, patterns: 2 } as const;
    for (let i = 1; i < index.components.length; i++) {
      const prev = index.components[i - 1];
      const cur = index.components[i];
      const pr = layerRank[prev.layer];
      const cr = layerRank[cur.layer];
      expect(pr <= cr).toBe(true);
      if (pr === cr) expect(prev.name < cur.name).toBe(true);
    }
    for (const entry of index.components) {
      const paths = entry.files.map((f) => f.path);
      expect(paths).toEqual([...paths].sort());
    }
  });

  it("matches the committed registry/registry-index.json (no drift)", () => {
    const committed = join(REGISTRY, "registry-index.json");
    if (!existsSync(committed)) return; // generated artifact; skip if absent
    const current = readFileSync(committed, "utf8");
    expect(current).toBe(serializeRegistryIndex(buildRegistryIndex(REGISTRY)));
  });
});

describe("validateRegistryIndex", () => {
  const good = () => buildRegistryIndex(REGISTRY);

  it("accepts a well-formed index", () => {
    const result = validateRegistryIndex(JSON.parse(serializeRegistryIndex(good())));
    expect(result.ok).toBe(true);
  });

  it("rejects non-objects and missing top-level fields", () => {
    expect(validateRegistryIndex(null).ok).toBe(false);
    expect(validateRegistryIndex({ schema: "x" }).ok).toBe(false);
    expect(validateRegistryIndex({ components: [] }).ok).toBe(false);
  });

  it("rejects an entry with a bad layer or missing files", () => {
    expect(
      validateRegistryIndex({
        schema: "x",
        components: [{ name: "button", layer: "nope", hash: "h", files: [{ path: "a", sha256: "b" }] }],
      }).ok
    ).toBe(false);
    expect(
      validateRegistryIndex({
        schema: "x",
        components: [{ name: "button", layer: "primitives", hash: "h", files: [] }],
      }).ok
    ).toBe(false);
  });
});
