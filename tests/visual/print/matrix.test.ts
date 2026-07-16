import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { DOCUMENT_SCAFFOLDS } from "../../../src/scaffolds/documents";
import {
  EXPECTED_PAGE_COUNTS,
  REGISTRY,
  ROOT,
  buildPrintCaseHtml,
  buildPrintMatrix,
} from "./matrix";

function walkManifests(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkManifests(full, out);
    else if (entry.endsWith(".manifest.json")) out.push(full);
  }
  return out;
}

describe("print visual matrix", () => {
  test("includes every document scaffold and manifest-declared print reference", () => {
    // Ground truth stays independent from matrix discovery so a broken scan
    // cannot make both expected and actual silently omit the same page.
    const expectedSources = new Set(
      Object.keys(DOCUMENT_SCAFFOLDS).map((name) => `scaffold:${name}`),
    );

    for (const manifestPath of walkManifests(REGISTRY)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        files?: { print_reference?: string };
      };
      const printReference = manifest.files?.print_reference;
      if (!printReference) continue;
      const htmlPath = join(dirname(manifestPath), printReference);
      expect(existsSync(htmlPath), `${relative(ROOT, manifestPath)} print reference`).toBe(true);
      expectedSources.add(`registry:${relative(ROOT, htmlPath)}`);
    }

    const matrixSources = new Set(
      buildPrintMatrix().map((entry) =>
        entry.source.kind === "scaffold"
          ? `scaffold:${entry.source.name}`
          : `registry:${entry.source.reference.htmlRel}`,
      ),
    );

    expect(matrixSources).toEqual(expectedSources);
  });

  test("uses unique ids and explicit, positive page-count contracts", () => {
    const matrix = buildPrintMatrix();
    expect(matrix.length).toBeGreaterThan(0);
    expect(new Set(matrix.map((entry) => entry.id)).size).toBe(matrix.length);
    expect(Object.keys(EXPECTED_PAGE_COUNTS).sort()).toEqual(
      matrix.map((entry) => entry.id).sort(),
    );
    for (const entry of matrix) {
      expect(Number.isInteger(entry.expectedPages)).toBe(true);
      expect(entry.expectedPages).toBeGreaterThan(0);
    }
    expect(matrix.find((entry) => entry.id === "scaffold-invoice")?.expectedPages).toBe(2);
  });

  test("assembles self-contained document pages with running furniture", () => {
    for (const entry of buildPrintMatrix()) {
      const html = buildPrintCaseHtml(entry);
      expect(html).toContain('<article data-ui="document"');
      expect(html).toContain('data-part="doc-header"');
      expect(html).toContain('data-part="doc-footer"');
      expect(html).not.toMatch(/\bsrc\s*=\s*["']https?:\/\//i);
      expect(html).not.toMatch(/url\(\s*["']?https?:\/\//i);
    }
  });
});
