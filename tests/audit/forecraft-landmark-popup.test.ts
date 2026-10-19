// The `landmark` rule's "dialog nested inside <main>" check against the popup of
// an inline control (forecraft upstream note 15).
//
// A `format: "date"` field renders the date-picker recipe, whose calendar panel
// is `role="dialog"`. Every page with a date field got "Dialog <div> is nested
// inside <main>", and a form field cannot move out of `<main>`. The panel is a
// part of the control, not an overlay; real dialogs keep the warning.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "../../src/parser/html-parser";
import { landmarkRule } from "../../src/audit/rules";
import { renderForm } from "../../packages/forms/src/index.js";

const REGISTRY = join(import.meta.dir, "../../registry");

function nested(html: string) {
  return landmarkRule
    .check(parseDocument(html, "page.html"))
    .filter((r) => r.message.includes("nested inside <main>"));
}

/** The first canonical example of a registry component (its HTML up to the next blank-line-separated example). */
function canonical(layer: string, name: string): string {
  const source = readFileSync(join(REGISTRY, layer, name, `${name}.html`), "utf8");
  const start = source.indexOf(`<div data-ui="${name}"`);
  expect(start).toBeGreaterThan(-1);
  // The root's matching close: count <div / </div> from the root onward.
  let depth = 0;
  const tag = /<\/?div\b[^>]*>/g;
  tag.lastIndex = start;
  for (let m = tag.exec(source); m; m = tag.exec(source)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return source.slice(start, m.index + m[0].length);
  }
  throw new Error(`unbalanced canonical markup for ${name}`);
}

describe("landmark — a dialog that is a part of an inline control", () => {
  it("does not warn for the canonical date-picker inside <main>", () => {
    const html = `<main>\n${canonical("recipes", "date-picker")}\n</main>`;
    expect(html).toContain('data-part="calendar" role="dialog"');
    expect(nested(html)).toEqual([]);
  });

  it("does not warn for a @faqir-ui/forms date field inside <main>", () => {
    const form = renderForm({
      type: "object",
      properties: { startsOn: { type: "string", format: "date", title: "Starts on" } },
    });
    const html = typeof form === "string" ? form : (form as { html: string }).html;
    expect(html).toContain('role="dialog"');
    expect(nested(`<main>${html}</main>`)).toEqual([]);
  });

  it("does not warn for a project's own control of the same shape (no component name list)", () => {
    const html = `<main>
  <div data-ui="color-field">
    <button data-part="swatch" aria-haspopup="dialog" aria-expanded="false">Pick</button>
    <div data-part="panel" role="dialog" aria-label="Colour" hidden>…</div>
  </div>
</main>`;
    expect(nested(html)).toEqual([]);
  });

  it("accepts a combobox input as the opener", () => {
    const html = `<main>
  <div data-ui="picker">
    <input data-part="input" role="combobox" aria-expanded="false">
    <div data-part="popup" role="dialog" aria-label="Choices" hidden>…</div>
  </div>
</main>`;
    expect(nested(html)).toEqual([]);
  });
});

describe("landmark — real dialogs inside <main> still warn", () => {
  for (const name of ["alert-dialog", "drawer", "command-palette", "dialog", "sheet"]) {
    it(`warns for the canonical ${name} (a modal panel)`, () => {
      const html = `<main>\n${canonical("recipes", name)}\n</main>`;
      expect(nested(html).length).toBeGreaterThan(0);
    });
  }

  it("warns for a modal part even when its root holds a popup trigger", () => {
    const html = `<main>
  <div data-ui="picker">
    <button data-part="trigger" aria-haspopup="dialog">Open</button>
    <div data-part="panel" role="dialog" aria-modal="true" aria-label="Pick">…</div>
  </div>
</main>`;
    expect(nested(html).length).toBe(1);
  });

  it("warns for a dialog part whose root holds no control that opens it", () => {
    const html = `<main>
  <div data-ui="card">
    <div data-part="body" role="dialog" aria-label="Note">…</div>
  </div>
</main>`;
    expect(nested(html).length).toBe(1);
  });

  it("does not count a trigger INSIDE the dialog as its opener", () => {
    const html = `<main>
  <div data-ui="widget">
    <div data-part="panel" role="dialog" aria-label="Menu">
      <button aria-haspopup="menu">More</button>
    </div>
  </div>
</main>`;
    expect(nested(html).length).toBe(1);
  });

  it("warns for aria-haspopup=false", () => {
    const html = `<main>
  <div data-ui="widget">
    <button data-part="trigger" aria-haspopup="false">Open</button>
    <div data-part="panel" role="dialog" aria-label="Panel">…</div>
  </div>
</main>`;
    expect(nested(html).length).toBe(1);
  });

  it("warns for a dialog component root that is also a pattern's part", () => {
    const html = `<main>
  <div data-ui="crud-table">
    <button data-part="add" aria-haspopup="dialog">Add</button>
    <div data-ui="dialog" data-part="edit-dialog" data-state="closed">
      <div data-part="panel" role="dialog" aria-modal="true" aria-label="Edit">…</div>
    </div>
  </div>
</main>`;
    // The dialog root and its modal panel are both overlays.
    expect(nested(html).length).toBe(2);
  });

  it("warns for a bare role=dialog that is no part at all", () => {
    const html = `<main>
  <div data-ui="widget">
    <button aria-haspopup="dialog">Open</button>
    <div role="dialog" aria-label="Loose">…</div>
  </div>
</main>`;
    expect(nested(html).length).toBe(1);
  });
});
