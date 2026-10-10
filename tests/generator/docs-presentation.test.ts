/**
 * Presentation contracts of the generated docs pages that a layout review
 * caught: reference tables scroll inside themselves on a phone, prose from
 * manifests and documents renders its inline markdown instead of leaking
 * backticks, and counts agree with their nouns.
 */
import { describe, it, expect } from "bun:test";
import {
  buildDocsSite,
  inlineMarkdown,
  plural,
  renderMarkdownBlocks,
  table,
} from "../../src/generator/docs";

describe("docs presentation — reference tables", () => {
  it("puts every table in a keyboard-reachable horizontal scroller", () => {
    const html = table(["Name", "Value"], [["<code>a</code>", "b"]], "none");
    expect(html).toContain(`<div data-docs-table tabindex="0">`);
    expect(html.indexOf("<div data-docs-table")).toBeLessThan(html.indexOf("<table>"));
    expect(html.trimEnd().endsWith("</div>")).toBe(true);
  });

  it("lets a table of long values opt out of unbroken code", () => {
    const html = table(["Token", "Value"], [["a", "b"]], "none", { wrap: true });
    expect(html).toContain(`<div data-docs-table="wrap" tabindex="0">`);
  });

  it("keeps the empty note a plain paragraph", () => {
    expect(table(["A"], [], "Nothing here.")).toBe("      <p><em>Nothing here.</em></p>");
  });

  it("wraps every generated table on every page", () => {
    for (const file of buildDocsSite()) {
      if (!file.path.endsWith(".html") || file.path.startsWith("examples/")) continue;
      const html = String(file.content);
      // A bare prose table (no data-part: registry `table` components own
      // their own scroller) must sit directly inside a [data-docs-table].
      for (const m of html.matchAll(/<table>/g)) {
        const before = html.slice(Math.max(0, m.index! - 80), m.index!);
        expect(before, `${file.path}: an unwrapped <table>`).toMatch(/<div data-docs-table(?:="wrap")? tabindex="0">\s*$/);
      }
    }
  });
});

describe("docs presentation — inline markdown", () => {
  it("renders code, bold, emphasis and http links, escaping everything else", () => {
    expect(inlineMarkdown("use `data-ui` and **never** <b>")).toBe(
      "use <code>data-ui</code> and <strong>never</strong> &lt;b&gt;",
    );
    expect(inlineMarkdown("*read the brief and write the seed*")).toBe(
      "<em>read the brief and write the seed</em>",
    );
    expect(inlineMarkdown("see [the spec](https://example.com/x)")).toContain(
      `<a data-ui="link" href="https://example.com/x">the spec</a>`,
    );
  });

  it("never reads a star inside a code span, or a bare data-*, as emphasis", () => {
    expect(inlineMarkdown("every `data-*` hook and `--space-*` token")).toBe(
      "every <code>data-*</code> hook and <code>--space-*</code> token",
    );
    expect(inlineMarkdown("an application's own data-* hooks, 5 * 3")).not.toContain("<em>");
  });

  it("keeps a code span's contents escaped", () => {
    expect(inlineMarkdown("`<div data-ui=\"x\">`")).toBe(`<code>&lt;div data-ui="x"&gt;</code>`);
  });

  it("renders a thematic break as <hr>, not as a paragraph of dashes", () => {
    const html = renderMarkdownBlocks("One.\n\n---\n\nTwo.");
    expect(html).toContain("<hr>");
    expect(html).not.toContain("<p>---</p>");
    expect(html).toContain("<p>One.</p>");
    expect(html).toContain("<p>Two.</p>");
  });

  it("leaks no raw markdown code spans into any page's rendered text", () => {
    for (const file of buildDocsSite()) {
      if (!file.path.endsWith(".html") || file.path.startsWith("examples/")) continue;
      const text = String(file.content)
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(pre|script|style|template|textarea|code)\b[\s\S]*?<\/\1>/g, " ")
        .replace(/<[^>]+>/g, " ");
      const leak = text.match(/`[^`\n]{1,60}`/);
      expect(leak?.[0], `${file.path} shows a raw code span`).toBeUndefined();
      expect(text.includes(" --- "), `${file.path} shows a raw thematic break`).toBe(false);
    }
  });
});

describe("docs presentation — counts", () => {
  it("agrees a noun with its count", () => {
    expect(plural(1, "pattern")).toBe("1 pattern");
    expect(plural(2, "pattern")).toBe("2 patterns");
    expect(plural(0, "component")).toBe("0 components");
  });

  it("never prints `1 patterns` on the scaffold gallery", () => {
    const page = buildDocsSite().find((f) => f.path === "scaffolds/index.html");
    expect(page).toBeDefined();
    expect(String(page!.content)).not.toMatch(/\b1 patterns\b/);
  });
});
