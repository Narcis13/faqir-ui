// document-serif — formal contracts/legal theme  [task 0.6-09]

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseThemeSchemes } from "./theme-coverage";

const DIR = join(import.meta.dir, "../../registry/themes");
const CSS = readFileSync(join(DIR, "document-serif.css"), "utf8");
const PREVIEW = readFileSync(join(DIR, "document-serif.preview.html"), "utf8");

describe("document-serif theme", () => {
  it("is explicitly light-only and uses serif document typography", () => {
    expect(CSS).toContain("@ui:schemes light");
    expect(CSS).toMatch(/--doc-font:\s*'Georgia'/);
    expect(CSS).toMatch(/--doc-heading-font:\s*'Times New Roman'/);
    expect(parseThemeSchemes(CSS).dark.size).toBe(0);
  });

  it("removes screen-only decoration and defines deterministic print ink", () => {
    for (const token of ["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"]) {
      expect(CSS).toContain(`--${token}:`);
    }
    expect(CSS).toContain("@media print");
    expect(CSS).toContain("--doc-bg:");
    expect(CSS).toContain("--doc-fg:");
  });

  it("ships a document preview exercising watermark and barcode", () => {
    expect(existsSync(join(DIR, "document-serif.preview.html"))).toBe(true);
    expect(PREVIEW).toContain('data-ui="document"');
    expect(PREVIEW).toContain('data-ui="watermark"');
    expect(PREVIEW).toContain('data-ui="barcode"');
    expect(PREVIEW).toContain("../core/faqir-core.js");
  });
});
