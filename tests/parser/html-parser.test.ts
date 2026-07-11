import { describe, it, expect } from "bun:test";
import { parseHTML, extractComponents, findAllUIElements, offsetToPosition } from "../../src/parser/html-parser";

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

  // ── Spec-informed tokenizer edge cases (task 0.5-08) ──────────────────────
  describe("tokenizer edge cases", () => {
    it("treats <script> body as raw text — <div> inside is not an element", () => {
      const html = `<section><script>var t = "<div data-ui='button'>x</div>";</script><p data-part="body">real</p></section>`;
      const roots = parseHTML(html);
      expect(roots.length).toBe(1);
      const section = roots[0];
      // Only <script> and <p> are real children — the <div> lives in JS text.
      expect(section.children.map((c) => c.tag)).toEqual(["script", "p"]);
      expect(section.children[0].children.length).toBe(0); // script has no element children
      // The bogus data-ui inside the script string must not surface as a component.
      expect(findAllUIElements(html).length).toBe(0);
    });

    it("treats <style> body as raw text (a '>' in a selector is not a tag close)", () => {
      const html = `<style>.a > .b { color: red }</style><span data-part="x">hi</span>`;
      const roots = parseHTML(html);
      expect(roots.map((r) => r.tag)).toEqual(["style", "span"]);
      expect(roots[0].children.length).toBe(0);
    });

    it("closes a comment at the first --> and keeps trailing markup", () => {
      // Comment body then a real element; the div must be parsed, not swallowed.
      const html = `<!-- a <div id="ghost"> b --><div id="real"></div>`;
      const roots = parseHTML(html);
      expect(roots.length).toBe(1);
      expect(roots[0].tag).toBe("div");
      expect(roots[0].attrs.id).toBe("real");
    });

    it("handles a comment whose body contains a stray --> edge", () => {
      // First `-->` closes the comment; `after` is then ordinary text, and the
      // following <b> is a real element (the `-->` did not desync the scanner).
      const html = `<!-- x --> after --><b data-part="y">z</b>`;
      const roots = parseHTML(html);
      expect(roots.length).toBe(1);
      expect(roots[0].tag).toBe("b");
      expect(roots[0].attrs["data-part"]).toBe("y");
    });

    it("keeps a quoted attribute value that contains > intact", () => {
      const roots = parseHTML(`<div data-x="a>b" id="ok"><span>c</span></div>`);
      expect(roots.length).toBe(1);
      expect(roots[0].attrs["data-x"]).toBe("a>b");
      expect(roots[0].attrs.id).toBe("ok");
      // The `>` inside the value must not have ended the tag early.
      expect(roots[0].children.map((c) => c.tag)).toEqual(["span"]);
    });

    it("keeps a single-quoted attribute value that contains > intact", () => {
      const roots = parseHTML(`<div data-x='p>q'></div>`);
      expect(roots[0].attrs["data-x"]).toBe("p>q");
    });

    it("parses an unclosed tag as an open element (no closing >)", () => {
      const roots = parseHTML(`<div class="x"`);
      expect(roots.length).toBe(1);
      expect(roots[0].tag).toBe("div");
      expect(roots[0].attrs.class).toBe("x");
    });

    it("nests unclosed elements by document order", () => {
      const roots = parseHTML(`<section><p>one<p>two`);
      // No closes at all — everything nests under the last-opened element.
      expect(roots.length).toBe(1);
      expect(roots[0].tag).toBe("section");
      const p1 = roots[0].children[0];
      expect(p1.tag).toBe("p");
      expect(p1.children[0].tag).toBe("p"); // second <p> nests inside the first
    });

    it("treats void elements as self-closing with or without a trailing slash", () => {
      const roots = parseHTML(`<img src="a.png"><br/><hr /><input type="text">`);
      expect(roots.map((r) => r.tag)).toEqual(["img", "br", "hr", "input"]);
      for (const r of roots) expect(r.selfClosing).toBe(true);
      // None of them opened a scope, so a following element stays a sibling.
      const withChild = parseHTML(`<br><span>after</span>`);
      expect(withChild.map((r) => r.tag)).toEqual(["br", "span"]);
    });

    it("marks an explicit self-closing non-void element and does not nest into it", () => {
      const roots = parseHTML(`<div/><span>sibling</span>`);
      expect(roots.map((r) => r.tag)).toEqual(["div", "span"]);
      expect(roots[0].selfClosing).toBe(true);
    });

    it("handles CRLF input for tree shape and line tracking", () => {
      const html = "<div data-ui=\"card\">\r\n  <p data-part=\"body\">hi</p>\r\n</div>";
      const roots = parseHTML(html);
      expect(roots.length).toBe(1);
      expect(roots[0].tag).toBe("div");
      const p = roots[0].children[0];
      expect(p.tag).toBe("p");
      // <div> on line 1, <p> on line 2 despite CRLF terminators.
      expect(roots[0].line).toBe(1);
      expect(p.line).toBe(2);
      expect(p.column).toBe(3); // two spaces of indentation → column 3
    });

    it("does not treat `<` in text as a tag when not followed by a letter", () => {
      const roots = parseHTML(`<p data-part="body">a < b && c > d</p>`);
      expect(roots.length).toBe(1);
      expect(roots[0].tag).toBe("p");
      expect(roots[0].children.length).toBe(0); // the lone `<` is text, not a tag
    });
  });

  describe("line/column tracking", () => {
    it("records accurate line and column for nested elements", () => {
      const html = [
        "<div data-ui=\"dialog\">",       // line 1
        "  <div data-part=\"panel\">",    // line 2, col 3
        "    <button data-part=\"close\">X</button>", // line 3, col 5
        "  </div>",
        "</div>",
      ].join("\n");
      const roots = parseHTML(html);
      const dialog = roots[0];
      expect(dialog.line).toBe(1);
      expect(dialog.column).toBe(1);
      const panel = dialog.children[0];
      expect(panel.line).toBe(2);
      expect(panel.column).toBe(3);
      const close = panel.children[0];
      expect(close.line).toBe(3);
      expect(close.column).toBe(5);
    });

    it("component line/column agree with offsetToPosition for every element", () => {
      const html = "line1\nline2\n  <button data-ui=\"button\">Click</button>\n";
      const roots = parseHTML(html);
      const btn = roots[0];
      const pos = offsetToPosition(html, btn.start);
      expect(btn.line).toBe(pos.line);
      expect(btn.column).toBe(pos.column);
      expect(btn.line).toBe(3);
      expect(btn.column).toBe(3);
    });
  });
});
