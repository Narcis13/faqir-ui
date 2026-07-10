// Lightweight HTML parser for audit — extracts data-ui components and their structure
// No jsdom, no heavy dependencies — simple regex/state-machine parser

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

// Match opening tags, closing tags, and self-closing tags
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^>]*?)?)?\s*\/?>/g;
const ATTR_RE = /([a-zA-Z_][\w.:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(attrString)) !== null) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[name] = value;
  }
  return attrs;
}

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
 * Parse HTML source into a flat list of elements with parent/child relationships.
 * Only tracks elements that have data-ui or data-part attributes, plus their ancestors.
 */
export function parseHTML(source: string): ParsedElement[] {
  const elements: ParsedElement[] = [];
  const stack: ParsedElement[] = [];
  const roots: ParsedElement[] = [];

  // Use a more robust approach: find all tags and build a tree
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;

  while ((match = TAG_RE.exec(source)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1].toLowerCase();
    const attrString = match[2] || "";
    const isClosing = fullMatch.startsWith("</");
    const isSelfClosing = fullMatch.endsWith("/>") || SELF_CLOSING_TAGS.has(tagName);

    if (isClosing) {
      // Pop from stack until we find the matching tag
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tagName) {
          stack.splice(i);
          break;
        }
      }
      continue;
    }

    // Opening tag
    const attrs = parseAttributes(attrString);
    const element: ParsedElement = {
      tag: tagName,
      attrs,
      selfClosing: isSelfClosing,
      start: match.index,
      tagEnd: match.index + fullMatch.length,
      children: [],
      parent: stack.length > 0 ? stack[stack.length - 1] : null,
    };

    if (element.parent) {
      element.parent.children.push(element);
    } else {
      roots.push(element);
    }

    elements.push(element);

    if (!isSelfClosing) {
      stack.push(element);
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
 * Comments and `<script>`/`<style>` bodies are masked (see `maskNonMarkup`)
 * before tag scanning, so an `id`/`<nav>`/heading that only appears inside a
 * comment or script string is never mistaken for real markup. Masking preserves
 * offsets, so `elements[*].start` still indexes into the returned `source`
 * (the original text) and `offsetToPosition` yields exact line/column.
 */
export function parseDocument(source: string, filePath: string): ParsedDocument {
  const masked = maskNonMarkup(source);
  const roots = parseHTML(masked);
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
    isFullDocument: FULL_DOCUMENT_RE.test(masked),
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
