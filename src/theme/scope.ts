// Scoped themes — rewriting a theme stylesheet onto a subtree [task 1.1A-19].
//
// A theme declares its tokens on `:root`, which is the document element and
// therefore the whole page. `faqir theme bundle <name> --scope` rewrites those
// declarations onto `[data-skin="<name>"]` instead — the fourth sanctioned token
// modifier (SPEC-1.0 §4, added by 1.1A-09) — so two themes can be live on one
// page at once: a forms platform previewing a customer's brand inside its own
// admin, a docs site showing a gallery, a design review putting two candidates
// side by side.
//
// ── Why the rewrite is structural, not textual ──────────────────────────────
// A regex over `:root` would also hit the string `":root"` in a `content`
// declaration, the word inside a comment, and — the case that actually bites —
// the `:root` nested inside `@media print` in a document theme, which needs the
// same treatment but arrives at a different depth. So the sheet is parsed into
// blocks first (`parseBlocks`), and only a block's PRELUDE is ever edited. Every
// declaration is copied through byte for byte, which is what keeps `light-dark()`
// working: it resolves against `color-scheme`, not against the selector, so a
// scoped theme needs no colour surgery at all — only a `color-scheme` on the
// scope root, which is exactly what `base/reset.css` puts on `:root`.
//
// The token set is the invariant: `extractTokenDefinitions` reads the sheet
// before and after, and `scopeThemeCss` throws if the rewrite gained or lost a
// declaration. A transform that silently dropped a block would otherwise produce
// a theme that renders *almost* right.

import { extractTokenDefinitions } from "../parser/css-parser";
import { stripCssComments } from "../theme-manifest";

/** The `color-scheme` a scope root declares — what `light-dark()` reads. */
export type ScopeRootScheme = "light" | "dark";

/** One prelude the transform rewrote, for the report and the `--json` payload. */
export interface ScopeRewrite {
  /** The selector as the source wrote it, whitespace-normalized. */
  from: string;
  /** What it became, whitespace-normalized. */
  to: string;
  /** 1-based line of the prelude in the source stylesheet. */
  line: number;
}

/** One at-rule the transform deliberately left alone, and why. */
export interface ScopeSkip {
  /** The at-rule's prelude, whitespace-normalized (`@page`, `@keyframes spin`). */
  prelude: string;
  reason: string;
  line: number;
}

export interface ScopedTheme {
  /** The scoped stylesheet. */
  css: string;
  /** The selector every `:root` became. */
  selector: string;
  /** The `color-scheme` the scope root re-declares. */
  colorScheme: ScopeRootScheme;
  rewrites: ScopeRewrite[];
  untouched: ScopeSkip[];
  /** Every custom property the sheet declares — unchanged by the rewrite. */
  tokens: string[];
}

export interface ScopeThemeOptions {
  /** The selector `:root` becomes. Defaults to {@link defaultScopeSelector}. */
  selector: string;
  /**
   * The scheme the scope root pins. Defaults to the sheet's own `@ui:schemes`
   * header — see {@link scopeRootScheme}.
   */
  colorScheme?: ScopeRootScheme;
  /** Name for the generated header comment. Cosmetic. */
  name?: string;
}

/** The scope selector a theme takes when `--scope` is given no value. */
export function defaultScopeSelector(name: string): string {
  return `[data-skin="${name}"]`;
}

/**
 * Which `color-scheme` the scope root pins.
 *
 * `:root` is the light side of every theme in the registry — except a
 * single-scheme dark theme, which says so in its `@ui:schemes` header (`luxe`).
 * The header is the same one `schemeFromCss` reads, so the two cannot disagree
 * about a theme that states it; a theme that states nothing is dual or light,
 * and `light` is what `base/reset.css` puts on a bare `:root`.
 */
export function scopeRootScheme(css: string): ScopeRootScheme {
  const declared = /@ui:schemes\s+([a-z ,]+)/i.exec(css);
  if (declared) {
    const schemes = new Set(declared[1].toLowerCase().split(/[\s,]+/).filter(Boolean));
    if (schemes.has("dark") && !schemes.has("light")) return "dark";
  }
  return "light";
}

// ── The block walker ────────────────────────────────────────────────────────

/** One `{ … }` block: an at-rule or a style rule, with its extent in the source. */
export interface CssBlock {
  /** Prelude text, verbatim from the source (selector list or at-rule condition). */
  prelude: string;
  /** Offset of the prelude's first non-whitespace character. */
  preludeStart: number;
  /** Offset of the block's `{`. */
  braceAt: number;
  /** Offset of the matching `}`, or the source length if the sheet is unterminated. */
  closeAt: number;
  children: CssBlock[];
}

/**
 * Blank out comment bodies and string CONTENTS, preserving every offset and
 * newline, so the structural scan below cannot be desynchronized by a `{` inside
 * a comment or a `;` inside `content: "a;b"`. Offsets in the mask are offsets in
 * the source, which is why prelude text is always sliced from the source.
 */
function maskCss(source: string): string {
  const out = source.split("");
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== "\n") out[i] = " ";
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < source.length && !(source[j] === c && source[j - 1] !== "\\")) j++;
      blank(i + 1, j); // the quotes stay, so the prelude still reads as a selector
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Every top-level block in the sheet, each carrying its own children. */
export function parseBlocks(source: string): CssBlock[] {
  const mask = maskCss(source);
  const roots: CssBlock[] = [];
  const stack: CssBlock[] = [];
  let start = -1;

  for (let i = 0; i < mask.length; i++) {
    const c = mask[i];
    if (c === "{") {
      const block: CssBlock = {
        prelude: start < 0 ? "" : source.slice(start, i),
        preludeStart: start < 0 ? i : start,
        braceAt: i,
        closeAt: source.length,
        children: [],
      };
      (stack.length ? stack[stack.length - 1].children : roots).push(block);
      stack.push(block);
      start = -1;
      continue;
    }
    if (c === "}") {
      stack.pop()!.closeAt = i;
      start = -1;
      continue;
    }
    if (c === ";") {
      start = -1;
      continue;
    }
    if (start < 0 && !/\s/.test(c)) start = i;
  }
  return roots;
}

// ── Selector rewriting ──────────────────────────────────────────────────────

/** At-rules whose children are style rules, so the walk descends into them. */
const NESTING_AT_RULES = new Set(["media", "supports", "container", "layer", "scope"]);

/** Why each non-nesting at-rule is left exactly as authored. */
const SKIP_REASONS: Record<string, string> = {
  page: "@page sizes the printed page itself — it has no subtree to scope",
  "font-face": "@font-face declares a family for the whole document",
  keyframes: "@keyframes has no selectors — its children are percentage stops",
  property: "@property registers a custom property document-wide",
  counterstyle: "@counter-style names a list style document-wide",
};

/**
 * The scoped form(s) of one comma-separated selector branch.
 *
 * `:root` is the scope root itself. Everything else a theme selects —
 * `[data-theme="dark"]`, `[data-theme="auto"]` — can be the scope root *or* live
 * inside it, so each becomes two branches: the compound form for a scope root
 * that also carries the attribute (`<div data-skin="x" data-theme="dark">`), and
 * the descendant form for a modifier written further down the subtree. Both are
 * (0,2,0), so either beats the page theme's own (0,1,0) `[data-theme="dark"]`
 * inside the island whatever order the two stylesheets are linked in.
 */
export function scopeBranch(branch: string, scope: string): string[] {
  const selector = branch.trim().replace(/\s+/g, " ");
  if (!selector) return [];
  if (selector === ":root") return [scope];
  if (selector.startsWith(":root")) {
    const rest = selector.slice(":root".length);
    // `:root[data-theme="dark"]` — a compound, so the two forms apply as above.
    if (/^[[.#:]/.test(rest)) return [scope + rest, `${scope} ${rest}`];
    // `:root > x`, `:root x` — the root is the scope, the combinator is kept.
    return [scope + rest];
  }
  // A compound that can attach directly to the scope root, or sit under it.
  if (/^[[.#:]/.test(selector)) return [scope + selector, `${scope} ${selector}`];
  // A type selector (`html`, `body`) or a complex selector: descendant only —
  // `[data-skin="x"]html` is not a selector.
  return [`${scope} ${selector}`];
}

/** The scoped form of a whole selector list. */
function scopeSelectorList(prelude: string, scope: string): string {
  const branches: string[] = [];
  for (const branch of prelude.split(",")) branches.push(...scopeBranch(branch, scope));
  return branches.join(",\n");
}

/** 1-based line of an offset. */
function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source[i] === "\n") line++;
  return line;
}

/** The whitespace a line starts with, so a rewritten multi-line prelude lines up. */
function indentOf(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  const text = source.slice(lineStart, offset);
  return /^\s*$/.test(text) ? text : "";
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * What the scope root restates from `base/reset.css`.
 *
 * Four of reset's declarations are theme-driven and land on elements a scoped
 * island is not: `color-scheme` on `:root`, `color` / `background` /
 * `font-family` on `html`, and the page texture on `body`. All four resolve
 * their `var()` at the element that DECLARES them, so an island inherits the
 * page theme's computed values and would render the host's ink, ground, face and
 * material with the skin's component colours — legible only by accident. The
 * scope root declares them again, which is what makes the island a theme rather
 * than a palette.
 */
function rootDeclarations(colorScheme: ScopeRootScheme, indent: string): string {
  return [
    `${indent}/* Restated from base/reset.css, which declares these on \`:root\`, \`html\` and`,
    `${indent}   \`body\` — elements a scoped subtree is not. Each resolves its var() at the`,
    `${indent}   element that declares it, so without this the island would inherit the host`,
    `${indent}   page's ink, ground, face and material. \`color-scheme\` is what light-dark()`,
    `${indent}   reads; a \`data-theme\` inside the island still overrides it. */`,
    `${indent}color-scheme: ${colorScheme};`,
    `${indent}color: var(--color-fg);`,
    `${indent}background-color: var(--color-bg);`,
    `${indent}background-image: var(--texture-page);`,
    `${indent}font-family: var(--font-body);`,
  ].join("\n");
}

/** The generated banner. Deliberately carries no `@ui:` directive of its own. */
function header(name: string | undefined, selector: string, source: string): string {
  const of = name ? ` of the '${name}' theme` : "";
  return (
    `/* Scoped theme — generated by \`faqir theme bundle\`. Do not edit; re-run the command.\n` +
    `   Every \`:root\` block${of} below declares on ${selector} instead, and every\n` +
    `   \`[data-theme]\` block is scoped to that subtree. Link it AFTER the page's own\n` +
    `   theme; the scope selector is (0,1,0) and wins for its subtree either way. */\n\n` +
    source
  );
}

/**
 * Rewrite a theme stylesheet so its declarations apply to a subtree.
 *
 * Pure: same input, same bytes out. Throws if the rewrite would change which
 * custom properties the sheet declares — the one invariant that says a block was
 * neither dropped nor duplicated.
 */
export function scopeThemeCss(source: string, options: ScopeThemeOptions): ScopedTheme {
  const { selector, name } = options;
  const colorScheme = options.colorScheme ?? scopeRootScheme(source);
  const rewrites: ScopeRewrite[] = [];
  const untouched: ScopeSkip[] = [];
  const edits: Edit[] = [];

  /** The top-level `:root` block that becomes the scope root, if there is one. */
  let scopeRoot: CssBlock | null = null;

  const walk = (blocks: CssBlock[], top: boolean): void => {
    for (const block of blocks) {
      const prelude = block.prelude.trim().replace(/\s+/g, " ");
      if (prelude.startsWith("@")) {
        const at = /^@([a-z-]+)/i.exec(prelude)?.[1].toLowerCase().replace(/-/g, "") ?? "";
        if (NESTING_AT_RULES.has(at)) {
          walk(block.children, false);
        } else {
          untouched.push({
            prelude,
            reason: SKIP_REASONS[at] ?? `@${at} declares no selector to scope`,
            line: lineOf(source, block.preludeStart),
          });
        }
        continue;
      }
      if (top && prelude === ":root" && !scopeRoot) scopeRoot = block;
      const indent = indentOf(source, block.preludeStart);
      const scoped = scopeSelectorList(block.prelude, selector);
      rewrites.push({ from: prelude, to: scoped.replace(/,\n/g, ", "), line: lineOf(source, block.preludeStart) });
      edits.push({
        start: block.preludeStart,
        end: block.braceAt,
        text: scoped.replace(/,\n/g, `,\n${indent}`) + " ",
      });
      // A style rule nested inside a style rule would be scoped twice by its
      // ancestor's rewrite; themes have none, and the walk stays shallow so a
      // future one is reported rather than mangled.
      for (const child of block.children) {
        untouched.push({
          prelude: child.prelude.trim().replace(/\s+/g, " "),
          reason: "nested inside a scoped rule — already covered by its ancestor",
          line: lineOf(source, child.preludeStart),
        });
      }
    }
  };

  walk(parseBlocks(source), true);

  if (scopeRoot) {
    const block = scopeRoot as CssBlock;
    const body = source.slice(block.braceAt + 1, block.closeAt);
    const indent = /\n([ \t]+)\S/.exec(body)?.[1] ?? "  ";
    edits.push({
      start: block.braceAt + 1,
      end: block.braceAt + 1,
      text: `\n${rootDeclarations(colorScheme, indent)}\n`,
    });
  }

  let css = source;
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    css = css.slice(0, edit.start) + edit.text + css.slice(edit.end);
  }
  css = header(name, selector, css);

  const tokens = (text: string): string[] =>
    [...new Set(extractTokenDefinitions(stripCssComments(text)).map((def) => def.name))].sort();
  const before = tokens(source);
  const after = tokens(css);
  if (before.join("\n") !== after.join("\n")) {
    const lost = before.filter((token) => !after.includes(token));
    const gained = after.filter((token) => !before.includes(token));
    throw new Error(
      `Scoping changed the theme's token set — this is a bug in the transform. ` +
        `${lost.length} lost (${lost.slice(0, 5).join(", ")}), ` +
        `${gained.length} gained (${gained.slice(0, 5).join(", ")}).`,
    );
  }

  return { css, selector, colorScheme, rewrites, untouched, tokens: after };
}
