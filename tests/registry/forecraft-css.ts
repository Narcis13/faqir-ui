// Shared by the forecraft-* registry tests: read a stylesheet as flat rules.
//
// Deliberately small — the registry's CSS is plain (no nesting), so a rule is a
// selector list and a declaration block, optionally inside one at-rule. Comments
// are stripped first, so a selector quoted in a comment never matches.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const REPO = join(import.meta.dir, "../..");
export const REGISTRY = join(REPO, "registry");

export interface CssRule {
  /** Each selector of the list, whitespace collapsed. */
  selectors: string[];
  /** Declarations, property → value (last one wins), whitespace collapsed. */
  decls: Record<string, string>;
  /** The enclosing at-rule prelude (`@media (min-width: 48rem)`), or "" at top level. */
  at: string;
}

const flat = (s: string): string => s.replace(/\s+/g, " ").trim();

function parseBlock(src: string, at: string, out: CssRule[]): void {
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open === -1) break;
    const head = flat(src.slice(i, open));
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    if (head.startsWith("@")) {
      parseBlock(body, head, out);
    } else {
      const decls: Record<string, string> = {};
      for (const part of body.split(";")) {
        const colon = part.indexOf(":");
        if (colon === -1) continue;
        decls[flat(part.slice(0, colon))] = flat(part.slice(colon + 1));
      }
      out.push({ selectors: splitSelectors(head), decls, at });
    }
    i = j;
  }
}

/** Split a selector list on top-level commas (not the ones inside `:where(…)`). */
export function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(flat(cur));
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(flat(cur));
  return out;
}

/** Every rule of a CSS source, in order. */
export function parseCss(source: string): CssRule[] {
  const out: CssRule[] = [];
  parseBlock(source.replace(/\/\*[\s\S]*?\*\//g, ""), "", out);
  return out;
}

/** Every rule of `registry/<rel>`. */
export function registryCss(rel: string): CssRule[] {
  return parseCss(readFileSync(join(REGISTRY, rel), "utf8"));
}

/** Rules one of whose selectors is exactly `selector` (whitespace-insensitive). */
export function rulesFor(rules: CssRule[], selector: string, at = ""): CssRule[] {
  const want = flat(selector);
  return rules.filter((r) => r.at === at && r.selectors.includes(want));
}
