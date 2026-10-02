// Component token metadata (task 1.1F-15) — `tokens_used` and the `@ui:tokens`
// stylesheet header, both derived from the component's CSS.
//
// The contract (decision D5 in FAQIR-PLAN-1.1-FIXES.md):
//
//  - `tokens_used` lists every design token the component's CSS references
//    directly — every `var(--x)` whose `--x` the token layer defines, fallbacks
//    included (`var(--a, var(--b))` references both).
//  - It may also list a token the CSS only reaches through an alias, as
//    `color-ring` is reached through `--focus-ring-color`. Nothing else: an entry
//    no reference reaches is stale.
//  - The `@ui:tokens` header carries `tokens_used` verbatim, in the same order.
//
// Pure string functions, so the generator (`scripts/gen-component-tokens.mjs`),
// the registry gate (`scripts/registry-audit.mjs`) and the tests share one
// definition. Manifests are edited by text substitution, never a JSON round
// trip, which would reformat every hand-laid-out array in the file.

const VAR_REF_RE = /var\(\s*--([a-zA-Z][\w-]*)/g;
const CUSTOM_PROP_RE = /--([a-zA-Z][\w-]*)\s*:\s*([^;{}]*)/g;
const HEADER_RE = /\/\*\s*@ui:tokens\b([^*]*)\*\//;
const TOKENS_USED_RE = /("tokens_used"\s*:\s*)\[([^\]]*)\]/;

/** Replace block comments with spaces, keeping every newline so offsets map to lines. */
export function stripCssComments(css: string): string {
  return css.replace(/\/\*[^]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

/** One direct reference: the first line the CSS reads a design token on. */
export interface TokenRef {
  name: string;
  line: number;
}

/**
 * The design tokens a stylesheet reads, in order of first reference. Nested
 * fallbacks count; comments, local knobs and author knobs (names the token layer
 * does not define) do not.
 */
export function directTokenRefs(css: string, defined: Set<string>): TokenRef[] {
  const code = stripCssComments(css);
  const seen = new Map<string, TokenRef>();
  for (const m of code.matchAll(VAR_REF_RE)) {
    const name = m[1];
    if (!defined.has(name) || seen.has(name)) continue;
    seen.set(name, { name, line: lineAt(code, m.index!) });
  }
  return [...seen.values()];
}

/** Every custom property the token layer defines, and what each one reads. */
export interface TokenLayer {
  defined: Set<string>;
  /** token → the custom properties its definitions reference (any theme, any scheme). */
  aliases: Map<string, Set<string>>;
}

export function readTokenLayer(sources: string[]): TokenLayer {
  const defined = new Set<string>();
  const aliases = new Map<string, Set<string>>();
  for (const source of sources) {
    for (const m of stripCssComments(source).matchAll(CUSTOM_PROP_RE)) {
      defined.add(m[1]);
      let targets = aliases.get(m[1]);
      if (!targets) aliases.set(m[1], (targets = new Set()));
      for (const r of m[2].matchAll(VAR_REF_RE)) targets.add(r[1]);
    }
  }
  return { defined, aliases };
}

/** The direct references plus everything their alias chains reach. */
export function reachableTokens(direct: Iterable<string>, layer: TokenLayer): Set<string> {
  const reached = new Set<string>();
  const queue = [...direct];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (reached.has(name)) continue;
    reached.add(name);
    for (const next of layer.aliases.get(name) ?? []) queue.push(next);
  }
  return reached;
}

/** Namespace of a token: the segment before its first `-` (`color`, `space`, …). */
function family(name: string): string {
  return name.split("-")[0];
}

/**
 * The `tokens_used` a component should declare. Kept: current entries that are
 * referenced or alias-reachable. Added: references the list lacks, in the order
 * the CSS first reads them. The result is then grouped by family, in the order
 * each family first appears, so a regenerated list is stable: running it again
 * changes nothing.
 */
export function deriveTokensUsed(current: string[], direct: TokenRef[], layer: TokenLayer): string[] {
  const directNames = direct.map((r) => r.name);
  const reachable = reachableTokens(directNames, layer);
  const merged: string[] = [];
  for (const name of [...current, ...directNames]) {
    if (reachable.has(name) && !merged.includes(name)) merged.push(name);
  }
  const groups = new Map<string, string[]>();
  for (const name of merged) {
    const f = family(name);
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f)!.push(name);
  }
  return [...groups.values()].flat();
}

/** The `@ui:tokens` header line `faqir conform` and the generator both write. */
export function cssTokensHeader(tokens: string[]): string {
  return `/* @ui:tokens ${tokens.join(" ")} */`;
}

/** The token list a stylesheet's `@ui:tokens` header carries, or null when it has none. */
export function readCssTokensHeader(css: string): string[] | null {
  const m = HEADER_RE.exec(css);
  if (!m) return null;
  const body = m[1].trim();
  return body === "" ? [] : body.split(/\s+/);
}

/**
 * Write `tokens` into the stylesheet's header. An existing `@ui:tokens` comment is
 * replaced in place; otherwise the line goes after `@ui:component`, or — for a
 * sheet with no machine header at all — a full two-line header is prepended.
 */
export function writeCssTokensHeader(css: string, component: string, tokens: string[]): string {
  const line = cssTokensHeader(tokens);
  if (HEADER_RE.test(css)) return css.replace(HEADER_RE, line);
  const componentLine = `/* @ui:component ${component} */`;
  const at = css.indexOf(componentLine);
  if (at >= 0) {
    const end = at + componentLine.length;
    return css.slice(0, end) + "\n" + line + css.slice(end);
  }
  return `${componentLine}\n${line}\n` + css;
}

/**
 * Rewrite the `tokens_used` array inside a manifest's source text: wrapped
 * before 100 columns, indented one step deeper than the key, matching how the
 * registry lays out its manifests. A manifest that is exactly
 * `JSON.stringify(manifest, null, 2)` keeps that form — one entry per line —
 * because `build:manifest-api` round-trips recipe manifests through it and
 * byte-compares the result.
 */
export function writeManifestTokensUsed(manifestText: string, tokens: string[]): string {
  const m = TOKENS_USED_RE.exec(manifestText);
  if (!m) throw new Error(`manifest has no "tokens_used" array`);
  const lineStart = manifestText.lastIndexOf("\n", m.index) + 1;
  const indent = /^[ \t]*/.exec(manifestText.slice(lineStart))![0];
  let array: string;
  if (tokens.length === 0) {
    array = "[]";
  } else if (manifestText === `${JSON.stringify(JSON.parse(manifestText), null, 2)}\n`) {
    array = JSON.stringify(tokens, null, 2).replace(/\n/g, "\n" + indent);
  } else {
    const inner = indent + "  ";
    const lines: string[] = [];
    let current = "";
    for (const name of tokens) {
      const item = JSON.stringify(name);
      if (current && inner.length + current.length + 2 + item.length + 1 > 100) {
        lines.push(current + ",");
        current = "";
      }
      current = current ? `${current}, ${item}` : item;
    }
    lines.push(current);
    array = "[\n" + lines.map((l) => inner + l).join("\n") + "\n" + indent + "]";
  }
  return manifestText.slice(0, m.index) + m[1] + array + manifestText.slice(m.index + m[0].length);
}

/** 1-based line of a `tokens_used` entry in the manifest source (the key's line if absent). */
export function manifestTokenLine(manifestText: string, name: string): number {
  const m = TOKENS_USED_RE.exec(manifestText);
  if (!m) return 1;
  const within = m[0].indexOf(JSON.stringify(name));
  return lineAt(manifestText, m.index + (within >= 0 ? within : 0));
}

/** A gate finding, already located in the file a fix belongs in. */
export interface ComponentTokenFinding {
  file: string;
  line: number;
  kind: "undeclared" | "stale" | "duplicate" | "header";
  message: string;
}

export interface ComponentTokenInput {
  name: string;
  manifestRel: string;
  manifestText: string;
  tokensUsed: string[];
  cssRel: string;
  css: string;
}

/**
 * Gate 8 of `scripts/registry-audit.mjs`: the three lists agree. Every token the
 * CSS reads is declared, every declared token is reached, and the header is the
 * declared list exactly.
 */
export function checkComponentTokens(input: ComponentTokenInput, layer: TokenLayer): ComponentTokenFinding[] {
  const { name, manifestRel, manifestText, tokensUsed, cssRel, css } = input;
  const findings: ComponentTokenFinding[] = [];
  const direct = directTokenRefs(css, layer.defined);
  const declared = new Set(tokensUsed);

  for (const ref of direct) {
    if (declared.has(ref.name)) continue;
    findings.push({
      file: cssRel,
      line: ref.line,
      kind: "undeclared",
      message: `var(--${ref.name}) is not in ${name}'s tokens_used`,
    });
  }

  const reachable = reachableTokens(direct.map((r) => r.name), layer);
  const counted = new Set<string>();
  for (const token of tokensUsed) {
    if (counted.has(token)) {
      findings.push({
        file: manifestRel,
        line: manifestTokenLine(manifestText, token),
        kind: "duplicate",
        message: `"${token}" is listed twice in tokens_used`,
      });
      continue;
    }
    counted.add(token);
    if (reachable.has(token)) continue;
    findings.push({
      file: manifestRel,
      line: manifestTokenLine(manifestText, token),
      kind: "stale",
      message: `"${token}" is in tokens_used but ${cssRel} never reads it, directly or through an alias`,
    });
  }

  const header = readCssTokensHeader(css);
  if (header === null) {
    findings.push({ file: cssRel, line: 1, kind: "header", message: `${cssRel} has no @ui:tokens header` });
  } else if (header.join(" ") !== tokensUsed.join(" ")) {
    findings.push({
      file: cssRel,
      line: lineAt(css, HEADER_RE.exec(css)!.index),
      kind: "header",
      message: `the @ui:tokens header differs from ${name}'s tokens_used`,
    });
  }
  return findings;
}
