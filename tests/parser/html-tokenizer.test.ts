import { describe, it, expect } from "bun:test";
import { tokenizeHTML, type Token } from "../../src/parser/html-tokenizer";

// Token-level tests for the spec-informed tokenizer (task 0.5-08, §9.1). The
// tree-level behavior lives in html-parser.test.ts; here we assert the raw
// token stream — types, offsets, and line/column — that the parser builds on.

const kinds = (tokens: Token[], type: Token["type"]) => tokens.filter((t) => t.type === type);

describe("HTML tokenizer", () => {
  it("emits start/text/end tokens with exact offsets", () => {
    const src = "<p>hi</p>";
    const tokens = tokenizeHTML(src);
    expect(tokens.map((t) => t.type)).toEqual(["startTag", "text", "endTag"]);
    const [start, text, end] = tokens;
    expect([start.start, start.end]).toEqual([0, 3]);
    expect([text.start, text.end]).toEqual([3, 5]);
    expect([end.start, end.end]).toEqual([5, 9]);
    expect(src.slice(start.start, start.end)).toBe("<p>");
    expect(src.slice(end.start, end.end)).toBe("</p>");
  });

  it("parses attributes, keeping names verbatim and values unescaped", () => {
    const [tag] = tokenizeHTML(`<div data-ui="dialog" aria-modal='true' hidden>`);
    expect(tag.type).toBe("startTag");
    expect(tag.name).toBe("div");
    expect(tag.attrs["data-ui"]).toBe("dialog");
    expect(tag.attrs["aria-modal"]).toBe("true");
    expect(tag.attrs.hidden).toBe(""); // boolean attribute → empty value
  });

  it("does not end a tag on a `>` inside a quoted attribute value", () => {
    const tokens = tokenizeHTML(`<a title="1 > 0">x</a>`);
    const [tag] = tokens;
    expect(tag.attrs.title).toBe("1 > 0");
    // Exactly one start, one text, one end — the inner `>` did not split the tag.
    expect(tokens.map((t) => t.type)).toEqual(["startTag", "text", "endTag"]);
  });

  it("distinguishes explicit self-closing from void inference", () => {
    const [selfClosed] = tokenizeHTML(`<br/>`);
    expect(selfClosed.selfClosing).toBe(true);
    const [voidNoSlash] = tokenizeHTML(`<br>`);
    // The tokenizer only reports the *explicit* slash; void inference is the
    // parser's job, so a bare <br> is not "selfClosing" at the token layer.
    expect(voidNoSlash.selfClosing).toBe(false);
  });

  it("emits one comment token and hides its markup-looking body", () => {
    const tokens = tokenizeHTML(`<!-- <div id="x"> --><p>after</p>`);
    const comments = kinds(tokens, "comment");
    expect(comments.length).toBe(1);
    // No start tag for the commented-out <div>; the real <p> is the only tag.
    expect(kinds(tokens, "startTag").map((t) => t.name)).toEqual(["p"]);
  });

  it("handles the abrupt-closing empty comment forms", () => {
    expect(kinds(tokenizeHTML(`<!-->x`), "comment")[0].end).toBe(5);
    expect(kinds(tokenizeHTML(`<!--->x`), "comment")[0].end).toBe(6);
  });

  it("emits a doctype token and recognizes a full document", () => {
    const tokens = tokenizeHTML(`<!DOCTYPE html><html><body></body></html>`);
    const doctype = kinds(tokens, "doctype");
    expect(doctype.length).toBe(1);
    expect(kinds(tokens, "startTag").map((t) => t.name)).toEqual(["html", "body"]);
  });

  it("emits a single raw-text token for <script> contents", () => {
    const src = `<script>if (a > b) { x = "<div>"; }</script>`;
    const tokens = tokenizeHTML(src);
    expect(tokens.map((t) => t.type)).toEqual(["startTag", "text", "endTag"]);
    const [, body, end] = tokens;
    expect(src.slice(body.start, body.end)).toBe(`if (a > b) { x = "<div>"; }`);
    expect(end.name).toBe("script");
  });

  it("runs an unclosed raw-text element to EOF", () => {
    const src = `<style>.a { color: red }`;
    const tokens = tokenizeHTML(src);
    expect(tokens.map((t) => t.type)).toEqual(["startTag", "text"]);
    expect(tokens[1].end).toBe(src.length);
  });

  it("tracks 1-based line/column, counting only \\n as a line break (CRLF safe)", () => {
    const src = "<a>\r\n  <b>\n<c>";
    const tokens = kinds(tokenizeHTML(src), "startTag");
    const [a, b, c] = tokens;
    expect([a.line, a.column]).toEqual([1, 1]);
    expect([b.line, b.column]).toEqual([2, 3]); // after CRLF + two spaces
    expect([c.line, c.column]).toEqual([3, 1]);
  });

  it("does not treat `<` as a tag when not followed by a name/comment/doctype", () => {
    const tokens = tokenizeHTML(`a < b</>`);
    // No start/end tags: the lone `<` and the nameless `</>` are text.
    expect(kinds(tokens, "startTag").length).toBe(0);
    expect(kinds(tokens, "endTag").length).toBe(0);
  });
});
