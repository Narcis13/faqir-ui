// Inline control row contract — task 0.9-08, FAQIR-SPEC §15.
//
// The component owns the tight box↔label step; cluster owns the wider step
// between complete control items. This suite pins the authored half of that
// contract across all four references. The browser geometry is exercised in
// tests/visual/inline-control-rows.pw.ts.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument, textInSubtree, type ParsedElement } from "../../src/parser/html-parser";

const ROOT = join(import.meta.dir, "../..");
const CONTROLS = ["checkbox", "radio", "switch", "toggle"] as const;
type Control = (typeof CONTROLS)[number];

const readReference = (name: Control) =>
  readFileSync(join(ROOT, "registry", "primitives", name, `${name}.html`), "utf8");
const readManifest = (name: Control) =>
  JSON.parse(
    readFileSync(join(ROOT, "registry", "primitives", name, `${name}.manifest.json`), "utf8"),
  ) as {
    description: string;
    a11y: { notes?: string };
    templates: Record<string, string>;
  };
const readCss = (name: Control) =>
  readFileSync(join(ROOT, "registry", "primitives", name, `${name}.css`), "utf8");

function ancestor(element: ParsedElement, name: string): ParsedElement | null {
  for (let current = element.parent; current; current = current.parent) {
    if (current.attrs["data-ui"] === name) return current;
  }
  return null;
}

describe("inline control references use the canonical row", () => {
  for (const name of CONTROLS) {
    it(`${name}: every control belongs to a cluster with the enforced gap`, () => {
      const document = parseDocument(readReference(name), `${name}.html`);
      const controls = document.elements.filter((el) => el.attrs["data-ui"] === name);
      expect(controls.length, `${name} reference contains no controls`).toBeGreaterThan(1);

      for (const control of controls) {
        const cluster = ancestor(control, "cluster");
        expect(cluster, `${name} at line ${control.line} is outside a cluster`).not.toBeNull();
        expect(cluster!.attrs["data-gap"], `${name} row gap at line ${cluster!.line}`).toBe("4");

        const peers = document.elements.filter(
          (candidate) =>
            candidate.attrs["data-ui"] === name && ancestor(candidate, "cluster") === cluster,
        );
        expect(peers.length, `${name} cluster at line ${cluster!.line} is not a row`).toBeGreaterThan(1);
      }
    });

    it(`${name}: the manifest documents both the row and lone-control cases`, () => {
      const manifest = readManifest(name);
      const prose = `${manifest.description}\n${manifest.a11y.notes ?? ""}`;
      expect(prose).toContain("cluster");
      expect(prose).toContain("data-gap=4");
      expect(prose.toLowerCase()).toMatch(/single|one option/);

      const row = manifest.templates.html;
      expect(row).toContain('data-ui="cluster"');
      expect(row).toContain('data-gap="4"');
      expect(Object.values(manifest.templates).some((template) => !template.includes('data-ui="cluster"')))
        .toBe(true);
    });

    it(`${name}: no component selector makes a lone control depend on cluster`, () => {
      expect(readCss(name)).not.toContain('[data-ui="cluster"]');
    });
  }
});

describe("visible labels retain their declared association", () => {
  for (const name of ["checkbox", "radio", "switch"] as const) {
    it(`${name}: every reference label points to its own control`, () => {
      const document = parseDocument(readReference(name), `${name}.html`);
      const controls = document.elements.filter((el) => el.attrs["data-ui"] === name);
      for (const control of controls) {
        const label = control.parent;
        expect(label?.tag).toBe("label");
        expect(label?.attrs.for).toBe(control.attrs.id);
        expect(control.attrs.id).toBeTruthy();
        const text = label!.children.find((child) => child.attrs["data-part"] === "label");
        expect(text && textInSubtree(text), `${name} at line ${control.line} has no visible label`)
          .toBeTruthy();
      }
    });
  }

  it("toggle keeps its accessible label inside the button", () => {
    const document = parseDocument(readReference("toggle"), "toggle.html");
    const controls = document.elements.filter((el) => el.attrs["data-ui"] === "toggle");
    for (const control of controls) expect(textInSubtree(control)).toBeTruthy();
  });
});
