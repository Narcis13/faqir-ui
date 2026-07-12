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

// Pre-order traversal is iterative (an explicit stack, children pushed in
// reverse so they pop in document order). A recursive walk overflows the call
// stack on pathologically deep input (thousands of unclosed tags); parseHTML
// itself is already iterative, and these walkers must be too so the whole
// pipeline stays crash-free on adversarial HTML (task 0.5-09).

/**
 * Find all elements in the tree with a specific attribute (pre-order).
 */
function findByAttr(roots: ParsedElement[], attr: string): ParsedElement[] {
  const results: ParsedElement[] = [];
  const stack: ParsedElement[] = [];
  for (let i = roots.length - 1; i >= 0; i--) stack.push(roots[i]);

  while (stack.length > 0) {
    const el = stack.pop()!;
    if (attr in el.attrs) results.push(el);
    for (let i = el.children.length - 1; i >= 0; i--) stack.push(el.children[i]);
  }
  return results;
}

/**
 * Extract all Faqir components from an HTML source file.
 *
 * A single iterative pre-order pass over the tree (O(n)). Each element carries
 * the nearest enclosing `data-ui` component down to its children, so a
 * `data-part` is attributed to its closest ancestor component and never to an
 * outer one. The earlier version re-scanned each component's whole subtree,
 * which is O(n²) in nesting depth and hangs on deeply nested components — the
 * fuzz suite (task 0.5-09) requires this to stay time-bounded.
 *
 * Boundary semantics preserved exactly: an element whose `data-ui` value is
 * empty starts no component but still ends the parent component's scope, so its
 * descendants' parts attach to nothing (an empty `data-ui` is a nesting
 * boundary). A component root's own `data-part` counts toward its *parent*
 * component, matching the descendant-only collection it replaces.
 */
export function extractComponents(source: string, filePath: string): ParsedComponent[] {
  const roots = parseHTML(source);
  const components: ParsedComponent[] = [];

  // Each stack frame pairs an element with the component that owns its parts
  // (its nearest ancestor `data-ui`, or null when none / past a boundary).
  const stack: Array<{ el: ParsedElement; owner: ParsedComponent | null }> = [];
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ el: roots[i], owner: null });

  while (stack.length > 0) {
    const { el, owner } = stack.pop()!;

    // A data-part belongs to the nearest ancestor component (independent of
    // whether this element itself opens a new one).
    if (owner && "data-part" in el.attrs) {
      const partName = el.attrs["data-part"];
      if (partName) {
        if (!owner.parts[partName]) owner.parts[partName] = [];
        owner.parts[partName].push(el);
      }
    }

    // Determine the owner passed down to this element's children.
    let childOwner = owner;
    if ("data-ui" in el.attrs) {
      const name = el.attrs["data-ui"];
      if (name) {
        // el.line is already computed once by the tokenizer (binary search) and
        // equals countLines(source, el.start); reusing it keeps this O(1) rather
        // than O(offset), so a document with many components stays linear.
        childOwner = { name, root: el, parts: {}, file: filePath, line: el.line };
        components.push(childOwner);
      } else {
        childOwner = null; // empty data-ui: a boundary that opens no component
      }
    }

    for (let i = el.children.length - 1; i >= 0; i--) {
      stack.push({ el: el.children[i], owner: childOwner });
    }
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
  // Iterative pre-order (see findByAttr) — deeply nested input would overflow a
  // recursive walk here even though parseHTML built the tree without recursing.
  const elements: ParsedElement[] = [];
  const stack: ParsedElement[] = [];
  for (let i = roots.length - 1; i >= 0; i--) stack.push(roots[i]);
  while (stack.length > 0) {
    const el = stack.pop()!;
    elements.push(el);
    for (let i = el.children.length - 1; i >= 0; i--) stack.push(el.children[i]);
  }

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
    line: el.line, // == countLines(source, el.start), precomputed by the tokenizer
    attrs: el.attrs,
  }));
}
