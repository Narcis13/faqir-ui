import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIGRATION_FROM_VERSION,
  MIGRATION_STEPS,
  LEGACY_RENAMES,
  collectBreakingChanges,
  extractSurface,
  listRegistryComponents,
  noteNamesLoss,
  parseMigrationDoc,
  readChanges,
  surfaceKey,
  surfaceLoss,
  uncoveredLosses,
  type ComponentSurface,
} from "../../src/migration";

// Task 1.0-03's two gates.
//
// The first is completeness: `docs/migration-1.0.md` must document every
// `breaking: true` changelog entry the registry carries, and must not invent one
// it does not. That is a cross-check, not a generator — the *edit* a break needs
// is written by a person; what is derived is the list they owe.
//
// The second is the harder one the plan asks for: "no undocumented breaking
// change exists". A changelog cannot be checked against itself, so the pinned
// surface of the v0.2.4 release (`tests/fixtures/v024/surface.json`, extracted
// from the tag by `scripts/gen-v024-surface.mjs`) is held against today's
// registry. Every attribute value that release honoured and this one does not
// has to be named in that component's own `changes` notes. A component may drop
// vocabulary; it may not drop it silently.

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const DOC_PATH = join(ROOT, "docs/migration-1.0.md");
const SURFACE_PATH = join(ROOT, "tests/fixtures/v024/surface.json");
const FIXTURE_PROJECT = join(ROOT, "tests/fixtures/v024-project");

const doc = readFileSync(DOC_PATH, "utf8");
const documented = parseMigrationDoc(doc);
const breaking = collectBreakingChanges(REGISTRY);
const pinned = JSON.parse(readFileSync(SURFACE_PATH, "utf8")) as {
  release: string;
  components: Record<string, ComponentSurface>;
};
const current = new Map(listRegistryComponents(REGISTRY).map((c) => [surfaceKey(c.layer, c.name), c]));

/** `component@version` for readable failure messages. */
const id = (c: { component: string; version: string }) => `${c.component}@${c.version}`;

describe("migration doc · completeness", () => {
  it("documents every breaking change in the registry", () => {
    const missing = breaking
      .filter((b) => !documented.some((d) => d.component === b.component && d.version === b.version))
      .map(id);
    expect(missing).toEqual([]);
    expect(breaking.length).toBeGreaterThanOrEqual(8); // the gate must not pass on an empty registry
  });

  it("documents nothing the registry does not ship", () => {
    const invented = documented
      .filter((d) => !breaking.some((b) => b.component === d.component && b.version === d.version))
      .map(id);
    expect(invented).toEqual([]);
  });

  it("gives every break a heading that names it and a body that says what to do", () => {
    for (const entry of documented) {
      expect(entry.heading.toLowerCase()).toContain(entry.component);
      expect(entry.heading).toContain(entry.version);
      // Long enough to be an instruction rather than a restatement of the fact
      // that something broke. Seven of the eight carry a diff or a table; the
      // eighth (auth-form) is a behaviour change with no markup edit, and says
      // what to write if the old width mattered.
      expect(entry.body.length).toBeGreaterThan(200);
    }
  });

  it("keeps one section per break — no duplicates", () => {
    const seen = documented.map(id);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("migration doc · the procedure it publishes", () => {
  it("lists every rename, and only real ones", () => {
    // The doc writes the default output directory where the table's rows carry
    // the `<output_dir>` placeholder.
    const concrete = (path: string) => path.replace("<output_dir>/", "ui/").replace(/\/$/, "");
    for (const rename of LEGACY_RENAMES) {
      expect(doc).toContain(concrete(rename.from));
      expect(doc).toContain(concrete(rename.to));
    }
    // Nothing else in the project carries the old name: any `loom` token in the
    // doc has to be one of the rename rows (or the sentence explaining them).
    const tokens = [...doc.matchAll(/[\w./-]*loom[\w./-]*/gi)].map((m) => m[0]);
    const known = new Set([
      ...LEGACY_RENAMES.map((r) => r.from.replace("<output_dir>/", "ui/")),
      ...LEGACY_RENAMES.map((r) => r.from.replace("<output_dir>/", "ui/").replace(/\/$/, "")),
      "Loom", // the framework's former name, in the sentence that explains it
      "window.Loom",
    ]);
    for (const token of tokens) expect(known).toContain(token);
  });

  it("publishes every step, in order, with its command", () => {
    let cursor = 0;
    for (const step of MIGRATION_STEPS) {
      const at = doc.indexOf(step.title.slice(0, 40), cursor);
      expect(at).toBeGreaterThan(-1);
      cursor = at;
      if (step.command && !step.command.includes("$(")) expect(doc).toContain(step.command);
    }
  });

  it("numbers as many steps as the procedure has", () => {
    const headings = [...doc.matchAll(/^### \d+\. /gm)];
    expect(headings).toHaveLength(MIGRATION_STEPS.length);
  });

  it("names the release it migrates from", () => {
    expect(doc).toContain(`v${MIGRATION_FROM_VERSION}`);
    expect(pinned.release).toBe(MIGRATION_FROM_VERSION);
  });
});

describe("no undocumented breaking change · the v0.2.4 surface gate", () => {
  it("pins the whole release", () => {
    expect(Object.keys(pinned.components).length).toBe(53);
    for (const surface of Object.values(pinned.components)) expect(surface.version).toBe("1.0.0");
  });

  it("agrees with the pinned project fixture, component for component", () => {
    // The fixture project's `ui/` holds real v0.2.4 component directories. Read
    // through the same extractor, each one must match what the pin recorded —
    // so the pin cannot drift from the bytes the end-to-end test migrates.
    for (const layer of ["primitives", "recipes", "patterns"] as const) {
      const dir = join(FIXTURE_PROJECT, "ui", layer);
      if (!existsSync(dir)) continue;
      for (const name of readdir(dir)) {
        const surface = extractSurface(join(dir, name), name);
        expect(surface).not.toBeNull();
        expect(surface).toEqual(pinned.components[surfaceKey(layer, name)]);
      }
    }
  });

  it("names every piece of vocabulary the registry stopped honouring", () => {
    const uncovered: string[] = [];
    for (const [key, before] of Object.entries(pinned.components)) {
      const component = current.get(key);
      const after = component ? extractSurface(component.dir, component.name) : null;
      const losses = surfaceLoss(before, after);
      if (losses.length === 0) continue;
      const changes = component ? readChanges(component.dir, component.name) : [];
      for (const loss of uncoveredLosses(changes, losses)) uncovered.push(`${key}: ${loss.token}`);
    }
    expect(uncovered).toEqual([]);
  });

  it("is actually looking at something — five components lost vocabulary", () => {
    const lost = new Map<string, string[]>();
    for (const [key, before] of Object.entries(pinned.components)) {
      const component = current.get(key);
      const after = component ? extractSurface(component.dir, component.name) : null;
      const losses = surfaceLoss(before, after);
      if (losses.length > 0) lost.set(key, losses.map((l) => l.token));
    }
    // A gate that reports nothing proves nothing. These five are the whole
    // inventory of vocabulary v0.2.4 honoured and 1.0 does not.
    expect([...lost.keys()].sort()).toEqual([
      "patterns/empty-state",
      "primitives/field-group",
      "primitives/surface",
      "recipes/date-picker",
      "recipes/table",
    ]);
    expect(lost.get("primitives/field-group")).toEqual(['data-state="error"']);
    expect(lost.get("patterns/empty-state")).toEqual(['data-part="action"', 'data-part="secondary-action"']);
  });

  it("requires a doc section for every component that lost vocabulary a page could carry", () => {
    for (const [key, before] of Object.entries(pinned.components)) {
      const component = current.get(key);
      const after = component ? extractSurface(component.dir, component.name) : null;
      const losses = surfaceLoss(before, after);
      if (losses.length === 0) continue;
      // `table` is the exception the rule needs: what it lost is
      // `data-variant="true"`/`"false"`, values its 1.x manifest declared and
      // its 1.x stylesheet never selected on. Nothing could have been written
      // against them, so they are documented in the changelog and belong in no
      // migration section.
      const documentedHere = documented.some((d) => d.component === component!.name);
      const onlyPhantomValues = losses.every((loss) =>
        readChanges(component!.dir, component!.name).some(
          (change) => !change.breaking && noteNamesLoss(String(change.note), loss),
        ),
      );
      expect(documentedHere || onlyPhantomValues).toBe(true);
    }
  });
});

describe("migration doc · reachability", () => {
  it("is linked from the README", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    expect(readme).toContain("docs/migration-1.0.md");
  });
});

/** Directory entries, sorted, directories only. */
function readdir(dir: string): string[] {
  return require("node:fs")
    .readdirSync(dir, { withFileTypes: true })
    .filter((e: { isDirectory(): boolean }) => e.isDirectory())
    .map((e: { name: string }) => e.name)
    .sort();
}
