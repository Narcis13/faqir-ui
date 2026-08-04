// The reference-fragment contract (task 0.9-04, resolving follow-up 0.7-17).
//
// Three claims, each of which was false before this task and each of which a
// later task could silently break:
//
//  1. Every reference fragment satisfies EVERY rule it can — zero findings under
//     the full rule set, not just the document rules `audit:registry` was
//     running. This is the same sweep `bun run audit:registry` gate 7 performs;
//     it lives here too so `bun test` fails on it without a separate script.
//  2. The runtime-presence rules are scoped by CONTENT, not by path: a fragment
//     is exempt, the page built from the same markup is not.
//  3. Recomposition changed how the demos are *composed*, never WHAT is
//     demonstrated — every fragment still parses to the component multiset it
//     had before, except for a small list of deliberate corrections named and
//     justified below.

import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { auditHtmlSource, RUNTIME_PRESENCE_RULES } from "../../src/audit/html-audit";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { maskNonMarkup } from "../../src/parser/html-parser";
import BASELINE_ROOTS from "../fixtures/registry-component-roots.json";

const REGISTRY = join(import.meta.dir, "../../registry");

const FRAGMENTS = ["primitives", "recipes", "patterns"]
  .flatMap((layer) => [...new Glob(`${layer}/**/*.html`).scanSync(REGISTRY)])
  .sort();

// Loaded in `beforeAll`, never at module scope: a top-level `await` in a test
// file makes `bun test` serialise the whole run behind this file's evaluation
// and the suite stops finishing (task 0.9-04 — found the slow way).
let manifests: Awaited<ReturnType<typeof loadRegistryManifestMap>>;
beforeAll(async () => {
  manifests = await loadRegistryManifestMap(REGISTRY);
});

const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

/** Every `data-ui` value in the file, counted, comments excluded. */
function componentRoots(source: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [, name] of maskNonMarkup(source).matchAll(/data-ui="([^"]*)"/g)) {
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * The deliberate changes to what a fragment demonstrates — everything NOT in
 * this list must be byte-identical in its component multiset. Each entry is a
 * defect the sweep found, not a recomposition:
 */
const INTENDED_ROOT_CHANGES: Record<string, string> = {
  // A dismissible filter pill is a `chip`: `chip` declares (and styles) the
  // `label` + `dismiss` parts the markup was already using, `badge` declares no
  // slots at all, so the two dismiss buttons were orphan parts on a component
  // that cannot have parts.
  "patterns/crud-table/crud-table.html": "badge→chip for the two dismissible filter pills",
  // The layout-cell decision (0.9-04 acceptance #2): a layout primitive
  // demonstrated with bare text shows nothing, so every demo cell is now a
  // `surface` — one mechanism, chosen once, across all five.
  "primitives/grid/grid.html": "37 bare <div> cells → surface",
  "primitives/stack/stack.html": "20 bare <div> cells → surface",
  "primitives/cluster/cluster.html": "5 bare cells → surface",
  "primitives/switcher/switcher.html": "5 body-only cards → surface (2 richer cards kept)",
  "primitives/container/container.html": "each measure column's content bounded by a surface",
};

describe("the registry's own markup satisfies its own rules", () => {
  it("covers every shipped fragment", () => {
    expect(FRAGMENTS.length).toBeGreaterThanOrEqual(86);
    expect(Object.keys(BASELINE_ROOTS).sort()).toEqual(FRAGMENTS);
  });

  it("reports zero findings under the full rule set", () => {
    const findings = FRAGMENTS.flatMap((rel) =>
      auditHtmlSource({ source: read(rel), file: rel, manifests }).map(
        (r) => `${r.file}:${r.line} [${r.rule_id}] ${r.message}`,
      ),
    );
    expect(findings).toEqual([]);
  });

  // The registry is not special-cased: a project that copied these fragments in
  // gets the same answer, which is the whole of follow-up 0.7-17's user-facing
  // half ("a fresh init + add crud-table reports a wall of findings").
  it("reports zero findings at every severity, per rule", () => {
    const byRule: Record<string, number> = {};
    for (const rel of FRAGMENTS) {
      for (const r of auditHtmlSource({ source: read(rel), file: rel, manifests })) {
        byRule[r.rule_id] = (byRule[r.rule_id] ?? 0) + 1;
      }
    }
    expect(byRule).toEqual({});
  });
});

describe("runtime-presence rules are scoped by content, not by path", () => {
  const DIALOG_FRAGMENT = read("recipes/dialog/dialog.html");


  it("exempts a fragment, which cannot carry a runtime", () => {
    const ids = auditHtmlSource({
      source: DIALOG_FRAGMENT,
      file: "recipes/dialog/dialog.html",
      manifests,
    }).map((r) => r.rule_id);
    for (const id of RUNTIME_PRESENCE_RULES) expect(ids).not.toContain(id);
  });

  it("applies to the same markup the moment it is a page", () => {
    const page = `<!doctype html>\n<html lang="en"><head><title>Dialog</title></head><body><main>\n${DIALOG_FRAGMENT}\n</main></body></html>`;
    const ids = auditHtmlSource({ source: page, file: "page.html", manifests }).map((r) => r.rule_id);
    for (const id of RUNTIME_PRESENCE_RULES) expect(ids).toContain(id);
  });

  it("is satisfied by a page that loads the runtime", () => {
    const page =
      `<!doctype html>\n<html lang="en"><head><title>Dialog</title>` +
      `<script type="module" src="https://cdn.example/faqir-core.js"></script></head><body><main>\n` +
      `${DIALOG_FRAGMENT}\n</main></body></html>`;
    const ids = auditHtmlSource({ source: page, file: "page.html", manifests }).map((r) => r.rule_id);
    for (const id of RUNTIME_PRESENCE_RULES) expect(ids).not.toContain(id);
  });

  it("names exactly the two rules that ask for a runtime", () => {
    expect([...RUNTIME_PRESENCE_RULES]).toEqual(["controller-loaded", "focus-trap"]);
  });
});

describe("recomposition preserved what each fragment demonstrates", () => {
  it.each(FRAGMENTS)("%s parses to the same component multiset", (rel) => {
    const before = (BASELINE_ROOTS as Record<string, Record<string, number>>)[rel];
    const after = componentRoots(read(rel));
    if (rel in INTENDED_ROOT_CHANGES) {
      // Named and justified above — asserted to have actually changed, so a
      // stale entry cannot sit here pretending to excuse something.
      expect(after).not.toEqual(before);
      return;
    }
    expect(after).toEqual(before);
  });

  it("changes what is demonstrated in exactly the files that say so", () => {
    const changed = FRAGMENTS.filter(
      (rel) =>
        JSON.stringify(componentRoots(read(rel))) !==
        JSON.stringify((BASELINE_ROOTS as Record<string, Record<string, number>>)[rel]),
    );
    expect(changed.sort()).toEqual(Object.keys(INTENDED_ROOT_CHANGES).sort());
  });

  // The cell decision, asserted rather than described: all five layout
  // primitives demo with the same bounded cell, and none of them still demos
  // with bare text.
  it.each(["grid", "stack", "cluster", "switcher", "container"])(
    "%s demos with a visible surface cell",
    (name) => {
      const source = read(`primitives/${name}/${name}.html`);
      expect(source).toContain('data-ui="surface"');
      expect(maskNonMarkup(source)).not.toMatch(/^\s*<(div|span)>[^<]*<\/\1>\s*$/m);
    },
  );
});
