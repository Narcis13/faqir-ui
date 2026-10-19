// The registry half of a downstream app's notes on 1.2.5 (forecraft, items 6,
// 14, 16, 17, 27, 29): what @faqir-ui/forms now emits is declared and styled by
// the components it names. The layout itself is measured in Chromium by
// tests/visual/forecraft-form-layout.pw.ts; this file keeps the declarations in
// `bun run test`.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import { componentDefinedUiValues } from "../../src/utils/components";

const REGISTRY = join(import.meta.dir, "../..", "registry");
const read = (kind: string, name: string, ext: string) =>
  readFileSync(join(REGISTRY, kind, name, `${name}.${ext}`), "utf8");
const manifest = (kind: string, name: string) => JSON.parse(read(kind, name, "manifest.json")) as Manifest;
/** CSS with comments stripped and whitespace collapsed, for substring checks. */
const css = (kind: string, name: string) =>
  read(kind, name, "css").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

describe("checkbox-group is a declared, styled wrapper (item 14)", () => {
  it("the checkbox stylesheet defines it, so the registry knows the name", () => {
    expect(css("primitives", "checkbox")).toContain('[data-ui="checkbox-group"] { border: none; padding: 0; margin: 0; display: flex; flex-direction: column;');
    expect(componentDefinedUiValues(REGISTRY)).toContain("checkbox-group");
  });

  it("the checkbox manifest documents it with a group template", () => {
    const m = manifest("primitives", "checkbox");
    expect(validateManifest(m)).toEqual([]);
    expect(m.templates!.html_group).toContain('<fieldset data-ui="checkbox-group">');
  });
});

describe("data-orientation on radio-group and checkbox-group, and a scale's captions (item 17)", () => {
  for (const name of ["radio", "checkbox"] as const) {
    it(`${name}: the prop is declared and the row is styled`, () => {
      const m = manifest("primitives", name);
      expect(validateManifest(m)).toEqual([]);
      expect(m.props!.orientation).toMatchObject({ type: "enum", values: ["vertical", "horizontal"], attr: "data-orientation" });
      expect(css("primitives", name)).toContain(
        `[data-ui="${name}-group"][data-orientation="horizontal"] { flex-direction: row; flex-wrap: wrap; column-gap: var(--space-4); }`,
      );
    });
  }

  it("radio declares the captions part and lays it under the options", () => {
    expect(manifest("primitives", "radio").slots!.captions).toMatchObject({ selector: "[data-part='captions']", required: false });
    const sheet = css("primitives", "radio");
    expect(sheet).toContain('[data-ui="radio-group"] > [data-part="captions"] {');
    expect(sheet).toContain("flex-basis: 100%;");
  });
});

describe("data-span on field-group (item 6)", () => {
  it("is a declared prop with the three widths", () => {
    const m = manifest("primitives", "field-group");
    expect(validateManifest(m)).toEqual([]);
    expect(m.props!.span).toMatchObject({ type: "enum", values: ["full", "half", "third"], attr: "data-span" });
  });

  it("shares rows only from the md tier, on a six-track grid", () => {
    const sheet = css("primitives", "field-group");
    const md = sheet.slice(sheet.indexOf("@media (min-width: 48rem)"));
    expect(md).toContain("grid-template-columns: repeat(6, minmax(0, 1fr));");
    expect(md).toContain('[data-span="half"] { grid-column: span 3; }');
    expect(md).toContain('[data-span="third"] { grid-column: span 2; }');
    // Nothing outside the md block mentions data-span: a phone is one column.
    expect(sheet.slice(0, sheet.indexOf("@media (min-width: 48rem)"))).not.toContain("data-span");
  });
});

describe("a fieldset card and the field rhythm inside a form (items 16 and 27)", () => {
  it("card resets a fieldset and floats its legend into the card", () => {
    const sheet = css("primitives", "card");
    expect(sheet).toContain('fieldset[data-ui="card"] { min-inline-size: 0; margin: 0; padding: 0; }');
    expect(sheet).toContain('fieldset[data-ui="card"] > legend[data-part="title"] { float: inline-start; inline-size: 100%; }');
    expect(validateManifest(manifest("primitives", "card"))).toEqual([]);
  });

  it("a card body continues the form's rhythm — inside forms only, at zero weight", () => {
    expect(css("primitives", "card")).toContain(
      ':where(form [data-ui="card"] > [data-part="body"] > :is([data-ui="field-group"], [data-ui="card"]) + :is([data-ui="field-group"], [data-ui="card"])) { margin-block-start: var(--flow-space, var(--section-gap-sm)); }',
    );
  });

  it("form-page spaces its children by the form's gap and drops the rhythm margin", () => {
    const sheet = css("patterns", "form-page");
    expect(sheet).toContain("row-gap: var(--flow-space, var(--space-5));");
    expect(sheet).toContain(":where(form[l-data]:not([data-ui])) > :where(*) { margin-block-start: 0; }");
    expect(sheet).not.toMatch(/(?<!row-)gap: var\(--space-5\)/);
    expect(validateManifest(manifest("patterns", "form-page"))).toEqual([]);
  });
});

describe("date-picker's value part (item 29)", () => {
  it("is a declared, optional slot, and the canonical markup carries it", () => {
    const m = manifest("recipes", "date-picker");
    expect(validateManifest(m)).toEqual([]);
    expect(m.slots!.value).toMatchObject({ selector: "[data-part='value']", required: false, tag_hint: "input" });
    expect(m.api!.methods.map((method) => method.name)).toContain("clear");
    expect(read("recipes", "date-picker", "html")).toContain('<input data-part="value" type="hidden" name="due-date">');
    // The form shape is its own template; the plain one (what the bindings render) has no name to carry.
    expect(m.templates!.html_form).toContain('<input data-part="value" type="hidden" name="{name}">');
    expect(m.templates!.html).not.toContain('data-part="value"');
  });
});
