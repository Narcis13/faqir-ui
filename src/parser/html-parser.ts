// Lightweight HTML parser for audit — extracts data-ui components and their
// structure. No jsdom, no heavy dependencies. The tag scan is a small,
// spec-informed tokenizer (see ./html-tokenizer.ts, task 0.5-08) that correctly
// handles comments, raw-text elements (`<script>`/`<style>`), quoted attribute
// values containing `>`, void elements, unclosed tags, and CRLF input, and
// tracks the line/column of every node. This module builds the element tree and
// exposes the stable audit/generator API; the tokenizer stays private to it.

import { tokenizeHTML } from "./html-tokenizer";

export interface ParsedAttribute {
  name: string;
  value: string;
}

export interface ParsedElement {
  tag: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
  /** Byte offset of the opening '<' in the source */
  start: number;
  /** Byte offset after the closing '>' of the opening tag */
  tagEnd: number;
  /** 1-based line of the opening '<' (equal to offsetToPosition(source, start).line) */
  line: number;
  /** 1-based column of the opening '<' (equal to offsetToPosition(source, start).column) */
  column: number;
  children: ParsedElement[];
  parent: ParsedElement | null;
}

export interface ParsedComponent {
  /** The data-ui value (e.g., "dialog", "button") */
  name: string;
  /** The root element */
  root: ParsedElement;
  /** All descendant elements with data-part attributes, keyed by part name */
  parts: Record<string, ParsedElement[]>;
  /** Source file path */
  file: string;
  /** Line number of the component root */
  line: number;
}

/**
 * A whole HTML file parsed for document-level audit rules (task 0.4-15) —
 * `duplicate-id`, `heading-order`, `landmark`. Unlike `ParsedComponent` (one
 * `data-ui` subtree vs its manifest), these rules reason about the entire
 * document: every element in source order, plus whether the file is a full page
 * or a component fragment.
 */
export interface ParsedDocument {
  /** Source file path */
  file: string;
  /** Original, unmodified source (offsets in `elements` index into this). */
  source: string;
  /** Top-level elements. */
  roots: ParsedElement[];
  /** Every element in document (pre-order) order. */
  elements: ParsedElement[];
  /**
   * True when the source is a full HTML document (has a doctype, `<html>`, or
   * `<body>`) rather than a bare component fragment. Rules like "page must have
   * a main landmark" only apply to full pages — a reference fragment such as
   * `<button data-ui="button">` is not a page and must never be flagged.
   */
  isFullDocument: boolean;
}

const SELF_CLOSING_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Convert a byte offset into 1-based line and column. Column counts characters
 * from the start of the line (the offset itself → column 1 at line start).
 */
export function offsetToPosition(source: string, offset: number): { line: number; column: number } {
  const end = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < end; i++) {
    if (source[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
}

function countLines(source: string, offset: number): number {
  return offsetToPosition(source, offset).line;
}

/**
 * Blank out the *contents* of HTML comments, `<script>` blocks, and `<style>`
 * blocks while preserving every byte's position — newlines are kept and all
 * other characters become spaces, so the string stays the same length. This lets
 * the tag scanner ignore markup-looking text inside comments/scripts/styles
 * (e.g. `<!-- <div id="x"> -->` or an `id="…"` inside a JS string) without
 * shifting any offset, so line/column reported against the ORIGINAL source stay
 * exact.
 */
export function maskNonMarkup(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, blank)
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, blank);
}

/**
 * Parse HTML source into a tree of elements with parent/child relationships.
 * Returns the top-level (root) elements; every element carries its byte offsets
 * (`start`/`tagEnd`) and 1-based `line`/`column`.
 *
 * Tree shape matches the previous scanner: void/self-closing elements are never
 * pushed onto the open-element stack, and a close tag pops back to its nearest
 * matching ancestor (unmatched close tags are ignored). Comments, doctypes, and
 * raw-text bodies (`<script>`/`<style>`) never contribute elements.
 */
export function parseHTML(source: string): ParsedElement[] {
  const stack: ParsedElement[] = [];
  const roots: ParsedElement[] = [];

  for (const token of tokenizeHTML(source)) {
    if (token.type === "startTag") {
      const selfClosing = token.selfClosing || SELF_CLOSING_TAGS.has(token.name);
      const element: ParsedElement = {
        tag: token.name,
        attrs: token.attrs,
        selfClosing,
        start: token.start,
        tagEnd: token.end,
        line: token.line,
        column: token.column,
        children: [],
        parent: stack.length > 0 ? stack[stack.length - 1] : null,
      };

      if (element.parent) element.parent.children.push(element);
      else roots.push(element);

      if (!selfClosing) stack.push(element);
    } else if (token.type === "endTag") {
      // Pop back to the nearest matching open element; ignore if none.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === token.name) {
          stack.length = i;
          break;
        }
      }
    }
  }

  return roots;
}

/**
 * Find all elements in the tree with a specific attribute.
 */
function findByAttr(roots: ParsedElement[], attr: string): ParsedElement[] {
  const results: ParsedElement[] = [];

  function walk(el: ParsedElement) {
    if (attr in el.attrs) {
      results.push(el);
    }
    for (const child of el.children) {
      walk(child);
    }
  }

  for (const root of roots) {
    walk(root);
  }
  return results;
}

/**
 * Find all descendant elements with a given attribute within a subtree.
 */
function findDescendantsByAttr(root: ParsedElement, attr: string): ParsedElement[] {
  const results: ParsedElement[] = [];

  function walk(el: ParsedElement) {
    for (const child of el.children) {
      if (attr in child.attrs) {
        results.push(child);
      }
      walk(child);
    }
  }

  walk(root);
  return results;
}

/**
 * Extract all Faqir components from an HTML source file.
 */
export function extractComponents(source: string, filePath: string): ParsedComponent[] {
  const roots = parseHTML(source);
  const uiElements = findByAttr(roots, "data-ui");
  const components: ParsedComponent[] = [];

  for (const el of uiElements) {
    const name = el.attrs["data-ui"];
    if (!name) continue;

    // Collect parts
    const partElements = findDescendantsByAttr(el, "data-part");
    const parts: Record<string, ParsedElement[]> = {};
    for (const partEl of partElements) {
      // Skip parts that belong to a nested data-ui component
      let belongsToNested = false;
      let parent = partEl.parent;
      while (parent && parent !== el) {
        if ("data-ui" in parent.attrs && parent !== el) {
          belongsToNested = true;
          break;
        }
        parent = parent.parent;
      }
      if (belongsToNested) continue;

      const partName = partEl.attrs["data-part"];
      if (!partName) continue;
      if (!parts[partName]) parts[partName] = [];
      parts[partName].push(partEl);
    }

    components.push({
      name,
      root: el,
      parts,
      file: filePath,
      line: countLines(source, el.start),
    });
  }

  return components;
}

const FULL_DOCUMENT_RE = /<!doctype\s+html|<html[\s>]|<body[\s>]/i;

/**
 * Parse a whole HTML file for document-level audit rules (task 0.4-15).
 *
 * The tokenizer natively skips comment and `<script>`/`<style>` bodies, so an
 * `id`/`<nav>`/heading that only appears inside a comment or script string never
 * becomes an element. `elements[*].start` indexes into the returned `source`
 * (the original text), so `offsetToPosition` yields exact line/column.
 *
 * `isFullDocument` is still computed from a masked copy so a `<html>`/`<body>`/
 * doctype that appears only inside a comment does not flip a fragment into a
 * "page" — matching the long-standing behavior of the document rules.
 */
export function parseDocument(source: string, filePath: string): ParsedDocument {
  const roots = parseHTML(source);
  const elements: ParsedElement[] = [];
  const walk = (el: ParsedElement) => {
    elements.push(el);
    for (const child of el.children) walk(child);
  };
  for (const root of roots) walk(root);

  return {
    file: filePath,
    source,
    roots,
    elements,
    isFullDocument: FULL_DOCUMENT_RE.test(maskNonMarkup(source)),
  };
}

/**
 * Find all data-ui elements in HTML source, including nested ones.
 * Returns a flat list useful for quick scanning.
 */
export function findAllUIElements(source: string): Array<{ name: string; line: number; attrs: Record<string, string> }> {
  const roots = parseHTML(source);
  const uiElements = findByAttr(roots, "data-ui");
  return uiElements.map(el => ({
    name: el.attrs["data-ui"],
    line: countLines(source, el.start),
    attrs: el.attrs,
  }));
}
