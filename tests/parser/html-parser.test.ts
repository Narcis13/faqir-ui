import { describe, it, expect } from "bun:test";
import { parseHTML, extractComponents, findAllUIElements } from "../../src/parser/html-parser";

describe("HTML Parser", () => {
  describe("parseHTML", () => {
    it("parses a simple element", () => {
      const roots = parseHTML('<div data-ui="button">text</div>');
      expect(roots.length).toBe(1);
      expect(roots[0].tag).toBe("div");
      expect(roots[0].attrs["data-ui"]).toBe("button");
    });

    it("handles self-closing tags", () => {
      const roots = parseHTML('<input type="text" /><br><hr>');
      expect(roots.length).toBe(3);
      expect(roots[0].tag).toBe("input");
      expect(roots[0].selfClosing).toBe(true);
      expect(roots[1].tag).toBe("br");
      expect(roots[2].tag).toBe("hr");
    });

    it("builds parent-child relationships", () => {
      const roots = parseHTML('<div data-ui="dialog"><button data-part="trigger">Open</button></div>');
      expect(roots.length).toBe(1);
      expect(roots[0].children.length).toBe(1);
      expect(roots[0].children[0].tag).toBe("button");
      expect(roots[0].children[0].attrs["data-part"]).toBe("trigger");
      expect(roots[0].children[0].parent).toBe(roots[0]);
    });

    it("handles nested components", () => {
      const html = `
        <div data-ui="dialog">
          <div data-part="footer">
            <button data-ui="button" data-variant="primary">OK</button>
          </div>
        </div>
      `;
      const roots = parseHTML(html);
      const dialog = roots.find(r => r.attrs["data-ui"] === "dialog");
      expect(dialog).toBeDefined();
    });

    it("parses multiple attributes", () => {
      const roots = parseHTML('<div data-ui="dialog" data-state="closed" id="my-dialog" role="dialog" aria-modal="true"></div>');
      const el = roots[0];
      expect(el.attrs["data-ui"]).toBe("dialog");
      expect(el.attrs["data-state"]).toBe("closed");
      expect(el.attrs.id).toBe("my-dialog");
      expect(el.attrs.role).toBe("dialog");
      expect(el.attrs["aria-modal"]).toBe("true");
    });
  });

  describe("extractComponents", () => {
    it("extracts a simple button component", () => {
      const html = '<button data-ui="button" data-variant="primary">Click</button>';
      const components = extractComponents(html, "test.html");
      expect(components.length).toBe(1);
      expect(components[0].name).toBe("button");
      expect(components[0].file).toBe("test.html");
    });

    it("extracts dialog with all parts", () => {
      const html = `
<div data-ui="dialog" data-state="closed" id="test">
  <button data-part="trigger">Open</button>
  <div data-part="overlay" hidden></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="test-title" hidden>
    <div data-part="header">
      <h2 id="test-title" data-part="title">Title</h2>
      <button data-part="close" aria-label="Close">X</button>
    </div>
    <div data-part="body"><p>Content</p></div>
    <div data-part="footer">
      <button data-ui="button" data-variant="primary">OK</button>
    </div>
  </div>
</div>`;
      const components = extractComponents(html, "dialog.html");
      const dialog = components.find(c => c.name === "dialog");
      expect(dialog).toBeDefined();
      expect(dialog!.parts.trigger).toBeDefined();
      expect(dialog!.parts.trigger.length).toBe(1);
      expect(dialog!.parts.overlay).toBeDefined();
      expect(dialog!.parts.panel).toBeDefined();
      expect(dialog!.parts.title).toBeDefined();
      expect(dialog!.parts.close).toBeDefined();
      expect(dialog!.parts.body).toBeDefined();
      expect(dialog!.parts.footer).toBeDefined();
    });

    it("does not attribute nested component parts to parent", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="trigger">Open</button>
  <div data-part="panel">
    <div data-part="footer">
      <button data-ui="button" data-variant="primary">
        <span data-part="icon">★</span>
        OK
      </button>
    </div>
  </div>
</div>`;
      const components = extractComponents(html, "test.html");
      const dialog = components.find(c => c.name === "dialog");
      // The icon part belongs to button, not dialog
      expect(dialog!.parts.icon).toBeUndefined();

      const button = components.find(c => c.name === "button");
      expect(button).toBeDefined();
      expect(button!.parts.icon).toBeDefined();
    });

    it("extracts multiple components from one file", () => {
      const html = `
<button data-ui="button" data-variant="primary">One</button>
<button data-ui="button" data-variant="secondary">Two</button>
<div data-ui="dialog" data-state="closed">
  <button data-part="trigger">Open</button>
</div>`;
      const components = extractComponents(html, "test.html");
      expect(components.length).toBe(3);
      const buttons = components.filter(c => c.name === "button");
      expect(buttons.length).toBe(2);
    });

    it("reports correct line numbers", () => {
      const html = `line1
line2
<button data-ui="button">Click</button>
line4`;
      const components = extractComponents(html, "test.html");
      expect(components[0].line).toBe(3);
    });
  });

  describe("findAllUIElements", () => {
    it("finds all data-ui elements", () => {
      const html = `
<button data-ui="button" data-variant="primary">A</button>
<div data-ui="dialog" data-state="closed">
  <button data-ui="button">B</button>
</div>`;
      const elements = findAllUIElements(html);
      expect(elements.length).toBe(3);
      expect(elements[0].name).toBe("button");
      expect(elements[1].name).toBe("dialog");
      expect(elements[2].name).toBe("button");
    });
  });
});
