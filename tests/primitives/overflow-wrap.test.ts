// Unbreakable tokens and shrinkable tracks — task 1.1F-16.
//
// An id, a hash or a path has no soft-wrap opportunity, so the element holding
// it is as wide as the token and every flex or grid parent sized by min-content
// grows with it. Three surfaces carry such tokens by design — headings, mono
// text and breadcrumbs — and each now declares `overflow-wrap: anywhere`.
//
// The value is the point. `break-word` breaks the painted line but leaves the
// min-content width alone, so a heading in a cluster row stayed 1117px wide in
// a 390px window with it; only `anywhere` lowers the intrinsic width.
//
// A table cell is the one place the break must not happen: auto table layout
// would squeeze every column to one character per line instead of letting the
// table scroll in its root. `table.css` hands the cell's own wrapping back.
//
// These are stylesheet assertions on purpose — happy-dom computes no layout.
// The geometry is pinned in Chromium by `tests/visual/wide-content.pw.ts`.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";

const REGISTRY = join(import.meta.dir, "../..", "registry");

function css(kind: string, name: string): string {
  return readFileSync(join(REGISTRY, kind, name, `${name}.css`), "utf8").replace(
    /\/\*[^]*?\*\//g,
    "",
  );
}

function manifest(kind: string, name: string): Manifest {
  return JSON.parse(
    readFileSync(join(REGISTRY, kind, name, `${name}.manifest.json`), "utf8"),
  ) as Manifest;
}

/** The declarations of the one rule whose selector list is exactly `selector`. */
function declsOf(sheet: string, selector: string): Record<string, string> {
  const found: Record<string, string>[] = [];
  for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].trim().replace(/\s+/g, " ") !== selector) continue;
    const decls: Record<string, string> = {};
    for (const decl of m[2].split(";")) {
      const colon = decl.indexOf(":");
      if (colon !== -1) decls[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim();
    }
    found.push(decls);
  }
  expect(found.length, `exactly one rule for ${selector}`).toBe(1);
  return found[0];
}

describe("overflow-wrap — unbreakable tokens break instead of widening the page", () => {
  const TEXT = css("primitives", "text");
  const BREADCRUMB = css("primitives", "breadcrumb");
  const TABLE = css("recipes", "table");

  it("headings, mono text and the breadcrumb root break anywhere", () => {
    expect(declsOf(TEXT, '[data-ui="heading"]')["overflow-wrap"]).toBe("anywhere");
    expect(declsOf(TEXT, '[data-ui="text"][data-variant="mono"]')["overflow-wrap"]).toBe(
      "anywhere",
    );
    expect(declsOf(BREADCRUMB, '[data-ui="breadcrumb"]')["overflow-wrap"]).toBe("anywhere");
  });

  it("never settles for break-word on those three — it leaves min-content alone", () => {
    expect(TEXT).not.toContain("break-word");
    expect(BREADCRUMB).not.toContain("break-word");
  });

  it("leaves body text alone — only the id-bearing surfaces opt in", () => {
    expect(declsOf(TEXT, '[data-ui="text"]')["overflow-wrap"]).toBeUndefined();
  });

  it("hands the cell's own wrapping back inside a table data cell", () => {
    const exception = declsOf(
      TABLE,
      '[data-ui="table"] [data-part="td"] :is([data-ui="text"], [data-ui="heading"], [data-ui="breadcrumb"])',
    );
    expect(exception).toEqual({ "overflow-wrap": "inherit" });
  });

  it("needs no exception for header cells — they never wrap at all", () => {
    // `white-space: nowrap` leaves `overflow-wrap` nothing to break, so an id in
    // a header keeps its column wide without a rule of its own.
    expect(declsOf(TABLE, '[data-ui="table"] [data-part="th"]')["white-space"]).toBe("nowrap");
  });

  it("records the change in each manifest", () => {
    for (const [kind, name, version] of [
      ["primitives", "text", "1.1.2"],
      ["primitives", "breadcrumb", "1.0.1"],
      ["recipes", "table", "3.2.1"],
    ] as const) {
      const m = manifest(kind, name);
      expect(validateManifest(m), name).toEqual([]);
      // The entry, not the current version: a later change bumps the manifest
      // past this one (text is 1.1.3 since 1.1F-18) and the record must stay.
      const entry = (m.changes ?? []).find((c) => c.version === version);
      expect(entry?.breaking, name).toBe(false);
      expect(entry?.note, name).toContain("overflow-wrap");
    }
  });
});

describe("description-list — the horizontal details track may shrink", () => {
  it("floors the details track at 0 and keeps the term track's 8rem floor", () => {
    const horizontal = declsOf(
      css("primitives", "description-list"),
      '[data-ui="description-list"][data-variant="horizontal"]',
    );
    expect(horizontal["grid-template-columns"]).toBe("minmax(8rem, auto) minmax(0, 1fr)");
  });

  it("records the change in its manifest", () => {
    const m = manifest("primitives", "description-list");
    expect(validateManifest(m)).toEqual([]);
    expect(m.version).toBe("1.0.1");
    const entry = (m.changes ?? []).find((c) => c.version === "1.0.1");
    expect(entry?.breaking).toBe(false);
    expect(entry?.note).toContain("minmax(0, 1fr)");
  });
});
