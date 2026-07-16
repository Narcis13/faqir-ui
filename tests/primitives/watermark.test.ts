// watermark — print-safe, non-interactive CSS primitive  [task 0.6-09]

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import {
  findClassSelectors,
  findHardcodedColorValues,
  findIdSelectors,
  findImportantDeclarations,
  findLogicalPropertyViolations,
} from "../../src/parser/css-parser";
import { extractComponents } from "../../src/parser/html-parser";

const DIR = join(import.meta.dir, "../../registry/primitives/watermark");
const CSS = readFileSync(join(DIR, "watermark.css"), "utf8");
const HTML = readFileSync(join(DIR, "watermark.html"), "utf8");
const MANIFEST = JSON.parse(
  readFileSync(join(DIR, "watermark.manifest.json"), "utf8"),
) as Manifest;

describe("watermark · manifest and markup contract", () => {
  it("ships a schema-valid CSS-only primitive", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
    expect(MANIFEST.kind).toBe("primitive");
    expect(MANIFEST.files.js).toBeUndefined();
    expect(MANIFEST.slots.mark.required).toBe(true);
  });

  it("documents fixed/absolute, single/repeated, and diagonal/horizontal variants", () => {
    expect(MANIFEST.variants.position.values).toEqual(["fixed", "absolute"]);
    expect(MANIFEST.variants.pattern.values).toEqual(["single", "repeated"]);
    expect(MANIFEST.variants.orientation.values).toEqual(["diagonal", "horizontal"]);
  });

  it("canonical roots are decorative and hidden from assistive technology", () => {
    const roots = extractComponents(HTML, "watermark.html").filter(
      (component) => component.name === "watermark",
    );
    expect(roots.length).toBe(1);
    expect(roots[0].root.attrs["aria-hidden"]).toBe("true");
    expect(roots[0].parts.mark).toHaveLength(9);
    for (const mark of roots[0].parts.mark) {
      expect(mark.attrs["data-text"]).toBe("Confidential");
    }
    expect(HTML).not.toContain(">Confidential<");
  });
});

describe("watermark · CSS behavior", () => {
  it("never intercepts pointer input", () => {
    const base = /\[data-ui="watermark"\]\s*\{[^}]*\}/.exec(CSS);
    expect(base).not.toBeNull();
    expect(base![0]).toContain("pointer-events: none");
  });

  it("defaults to fixed placement and supports a scoped absolute overlay", () => {
    expect(CSS).toMatch(/\[data-ui="watermark"\]\s*\{[^}]*position:\s*fixed/);
    expect(CSS).toMatch(
      /\[data-ui="watermark"\]\[data-variant="absolute"\]\s*\{[^}]*position:\s*absolute/,
    );
  });

  it("renders diagonal marks and a nine-cell repeated grid", () => {
    expect(CSS).toContain("transform: rotate(-35deg)");
    expect(CSS).toContain("content: attr(data-text)");
    expect(CSS).toMatch(
      /\[data-pattern="repeated"\]\s*\{[^}]*grid-template-columns:\s*repeat\(3/,
    );
    expect(CSS).toMatch(/grid-template-rows:\s*repeat\(3/);
  });

  it("has explicit print rules that preserve fixed placement and exact colors", () => {
    const print = CSS.slice(CSS.indexOf("@media print"));
    expect(print).toContain('[data-ui="watermark"]');
    expect(print).toContain("position: fixed");
    expect(print).toContain("print-color-adjust: exact");
    expect(print).toContain("-webkit-print-color-adjust: exact");
  });

  it("follows registry selector, color, and RTL conventions", () => {
    expect(findClassSelectors(CSS)).toEqual([]);
    expect(findIdSelectors(CSS)).toEqual([]);
    expect(findImportantDeclarations(CSS)).toEqual([]);
    expect(findHardcodedColorValues(CSS)).toEqual([]);
    expect(findLogicalPropertyViolations(CSS)).toEqual([]);
  });
});
