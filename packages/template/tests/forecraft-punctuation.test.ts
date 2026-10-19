// Upstream note 26 (forecraft): "every node renders on its own line, so `code`
// followed by piped `| .` renders `x .`". The punctuation rule of §12.1 (added
// in 3dfb0d6) covers it; these are the note's exact cases, kept as a guard.
import { describe, expect, it } from "bun:test";
import { html } from "./helpers";

describe("text after an inline node, starting with punctuation", () => {
  it("joins a code span followed by a piped | .", () => {
    expect(html("p\n  | Run\n  code x\n  | .\n")).toBe("<p>\n  Run\n  <code>x</code>.\n</p>\n");
  });

  it("joins a code span followed by a piped | , and the rest of the line", () => {
    expect(html("p\n  | Run\n  code x\n  | , then go\n")).toBe("<p>\n  Run\n  <code>x</code>, then go\n</p>\n");
  });

  it("joins any element followed by piped text starting with punctuation", () => {
    expect(html("p\n  strong Bold\n  | ; then\n  em it\n  | !\n")).toBe("<p>\n  <strong>Bold</strong>; then\n  <em>it</em>!\n</p>\n");
    expect(html('p\n  | See (\n  a(href="/d") docs\n  | ).\n')).toBe('<p>\n  See (<a href="/d">docs</a>).\n</p>\n');
    expect(html("ul\n  li\n    code x\n    | .\n")).toBe("<ul>\n  <li>\n    <code>x</code>.\n  </li>\n</ul>\n");
  });

  it("joins punctuation after an element written as inline text", () => {
    expect(html("p #[code x]\n  | .\n")).not.toMatch(/<\/code>\s+\./);
  });

  it("joins punctuation that a loop writes between items", () => {
    const source = "p\n  each t, i in tags\n    code {{ t }}\n    if i < tags.length - 1\n      | ,\n  | .\n";
    expect(html(source, { tags: ["a", "b"] })).toBe("<p>\n  <code>a</code>,\n  <code>b</code>.\n</p>\n");
  });

  it("leaves a straight quote or a dash on its own line, and the inline form joins them", () => {
    // §12.1: straight quotes and dashes can open or close, so they join
    // nothing; a sentence that needs them glued is written with #[…].
    expect(html("p\n  code x\n  | 's value\n")).toBe("<p>\n  <code>x</code>\n  's value\n</p>\n");
    expect(html("p The #[code x]'s value, #[kbd Ctrl]-click.\n")).toBe("<p>The <code>x</code>'s value, <kbd>Ctrl</kbd>-click.</p>\n");
  });
});
