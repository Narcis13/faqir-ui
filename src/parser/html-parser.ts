export type HtmlNode = HtmlElement | HtmlText | HtmlComment;

export type HtmlAttribute = {
  name: string;
  value: string | null;
  start: number;
  end: number;
};

export type HtmlElement = {
  type: "element";
  tagName: string;
  attributes: HtmlAttribute[];
  children: HtmlNode[];
  parent: HtmlElement | HtmlDocument;
  start: number;
  end: number;
  startTagStart: number;
  startTagEnd: number;
  innerStart: number;
  innerEnd: number;
  endTagStart: number | null;
  endTagEnd: number | null;
  selfClosing: boolean;
};

export type HtmlText = {
  type: "text";
  value: string;
  parent: HtmlElement | HtmlDocument;
  start: number;
  end: number;
};

export type HtmlComment = {
  type: "comment";
  value: string;
  parent: HtmlElement | HtmlDocument;
  start: number;
  end: number;
};

export type HtmlDocument = {
  type: "document";
  source: string;
  children: HtmlNode[];
};

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export function parseHtml(source: string): HtmlDocument {
  const document: HtmlDocument = {
    type: "document",
    source,
    children: [],
  };
  const stack: Array<HtmlDocument | HtmlElement> = [document];
  let index = 0;

  while (index < source.length) {
    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      const commentEnd = end >= 0 ? end + 3 : source.length;
      appendChild(stack[stack.length - 1], {
        type: "comment",
        value: source.slice(index + 4, end >= 0 ? end : source.length),
        parent: stack[stack.length - 1],
        start: index,
        end: commentEnd,
      });
      index = commentEnd;
      continue;
    }

    if (source[index] !== "<") {
      const next = source.indexOf("<", index);
      const end = next >= 0 ? next : source.length;
      appendChild(stack[stack.length - 1], {
        type: "text",
        value: source.slice(index, end),
        parent: stack[stack.length - 1],
        start: index,
        end,
      });
      index = end;
      continue;
    }

    if (source.startsWith("</", index)) {
      const end = findTagEnd(source, index + 2);
      const tagName = source.slice(index + 2, end).trim().toLowerCase();
      closeElement(stack, tagName, index, end + 1, source.length);
      index = end + 1;
      continue;
    }

    if (source.startsWith("<!", index) || source.startsWith("<?", index)) {
      const end = findTagEnd(source, index + 2);
      index = end + 1;
      continue;
    }

    const tagEnd = findTagEnd(source, index + 1);
    const tagSource = source.slice(index + 1, tagEnd);
    const selfClosing = /\/\s*$/.test(tagSource);
    const normalizedTagSource = selfClosing ? tagSource.replace(/\/\s*$/, "") : tagSource;
    const tagNameMatch = normalizedTagSource.match(/^\s*([^\s/>]+)/);

    if (!tagNameMatch) {
      index = tagEnd + 1;
      continue;
    }

    const tagName = tagNameMatch[1].toLowerCase();
    const attrsOffset = index + 1 + tagNameMatch[0].length;
    const attrsSource = normalizedTagSource.slice(tagNameMatch[0].length);
    const element: HtmlElement = {
      type: "element",
      tagName,
      attributes: parseAttributes(attrsSource, attrsOffset),
      children: [],
      parent: stack[stack.length - 1],
      start: index,
      end: tagEnd + 1,
      startTagStart: index,
      startTagEnd: tagEnd + 1,
      innerStart: tagEnd + 1,
      innerEnd: tagEnd + 1,
      endTagStart: null,
      endTagEnd: null,
      selfClosing: selfClosing || VOID_TAGS.has(tagName),
    };

    appendChild(stack[stack.length - 1], element);

    if (element.selfClosing) {
      element.innerEnd = element.startTagEnd;
      element.end = element.startTagEnd;
    } else {
      stack.push(element);
    }

    index = tagEnd + 1;
  }

  while (stack.length > 1) {
    const element = stack.pop() as HtmlElement;
    element.innerEnd = source.length;
    element.end = source.length;
  }

  return document;
}

export function findElements(
  node: HtmlDocument | HtmlElement,
  predicate: (element: HtmlElement) => boolean,
): HtmlElement[] {
  const results: HtmlElement[] = [];

  for (const child of node.children) {
    if (child.type !== "element") {
      continue;
    }

    if (predicate(child)) {
      results.push(child);
    }

    results.push(...findElements(child, predicate));
  }

  return results;
}

export function findFirst(
  node: HtmlDocument | HtmlElement,
  predicate: (element: HtmlElement) => boolean,
): HtmlElement | null {
  for (const child of node.children) {
    if (child.type !== "element") {
      continue;
    }

    if (predicate(child)) {
      return child;
    }

    const nested = findFirst(child, predicate);

    if (nested) {
      return nested;
    }
  }

  return null;
}

export function getAttribute(element: HtmlElement, name: string): string | null {
  const attribute = element.attributes.find((entry) => entry.name === name);
  return attribute?.value ?? null;
}

export function getAttributeNode(element: HtmlElement, name: string): HtmlAttribute | null {
  return element.attributes.find((entry) => entry.name === name) ?? null;
}

export function hasAttribute(element: HtmlElement, name: string): boolean {
  return getAttributeNode(element, name) !== null;
}

export function getTextContent(element: HtmlElement): string {
  const parts: string[] = [];

  for (const child of element.children) {
    if (child.type === "text") {
      parts.push(child.value);
      continue;
    }

    if (child.type === "element") {
      parts.push(getTextContent(child));
    }
  }

  return parts.join("");
}

export function matchesSelector(element: HtmlElement, selector: string): boolean {
  const match = selector.trim().match(/^(?:(?<tag>[a-zA-Z0-9_-]+))?(?<attrs>(?:\[[^\]]+\])*)$/);

  if (!match?.groups) {
    return false;
  }

  if (match.groups.tag && element.tagName !== match.groups.tag.toLowerCase()) {
    return false;
  }

  const attrMatches = [...match.groups.attrs.matchAll(/\[([^=\]\s]+)(?:=(['"]?)([^'"\]]+)\2)?\]/g)];

  for (const attrMatch of attrMatches) {
    const name = attrMatch[1];
    const expected = attrMatch[3];
    const actual = getAttribute(element, name);

    if (expected === undefined) {
      if (actual === null && !hasAttribute(element, name)) {
        return false;
      }
      continue;
    }

    if (actual !== expected) {
      return false;
    }
  }

  return true;
}

export function findAllBySelector(node: HtmlDocument | HtmlElement, selector: string): HtmlElement[] {
  return findElements(node, (element) => matchesSelector(element, selector));
}

function parseAttributes(source: string, baseOffset: number): HtmlAttribute[] {
  const attributes: HtmlAttribute[] = [];
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }

    if (index >= source.length) {
      break;
    }

    const start = index;

    while (index < source.length && /[^\s=]/.test(source[index])) {
      index += 1;
    }

    const name = source.slice(start, index);

    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }

    let value: string | null = null;

    if (source[index] === "=") {
      index += 1;

      while (index < source.length && /\s/.test(source[index])) {
        index += 1;
      }

      if (source[index] === "\"" || source[index] === "'") {
        const quote = source[index];
        index += 1;
        const valueStart = index;

        while (index < source.length && source[index] !== quote) {
          index += 1;
        }

        value = source.slice(valueStart, index);
        index += 1;
      } else {
        const valueStart = index;

        while (index < source.length && /[^\s]/.test(source[index])) {
          index += 1;
        }

        value = source.slice(valueStart, index);
      }
    }

    attributes.push({
      name,
      value,
      start: baseOffset + start,
      end: baseOffset + index,
    });
  }

  return attributes;
}

function appendChild(parent: HtmlDocument | HtmlElement, child: HtmlNode): void {
  parent.children.push(child);
}

function findTagEnd(source: string, start: number): number {
  let quote: "\"" | "'" | null = null;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }

    if (character === ">") {
      return index;
    }
  }

  return source.length - 1;
}

function closeElement(
  stack: Array<HtmlDocument | HtmlElement>,
  tagName: string,
  endTagStart: number,
  endTagEnd: number,
  fallbackEnd: number,
): void {
  for (let index = stack.length - 1; index >= 1; index -= 1) {
    const entry = stack[index];

    if (entry.type !== "element" || entry.tagName !== tagName) {
      continue;
    }

    while (stack.length - 1 >= index) {
      const element = stack.pop() as HtmlElement;
      element.innerEnd = element === entry ? endTagStart : fallbackEnd;
      element.endTagStart = element === entry ? endTagStart : null;
      element.endTagEnd = element === entry ? endTagEnd : null;
      element.end = element === entry ? endTagEnd : fallbackEnd;
    }

    return;
  }
}
