// The controller API, read out of a controller (task W2-4).
//
// 29 recipes ship a JavaScript controller, every one of them declares what it
// exposes on a `// @ui:provides` line, and that line is inlined verbatim into
// the shipped `faqir-core.js` — and no surface an agent reads ever showed it.
// `faqir explain toast --json` returned ten keys and no `api`; `$ui.` appeared
// once in 228 KB of skill documentation. An agent that wanted to open a drawer
// from a table row had no way to learn that `open()` exists, short of opening
// the controller source.
//
// This module turns the annotation into structure: the method names in their
// declared order, each with the parameter list the function actually takes and
// the first sentence of its JSDoc. Everything downstream — the manifests, the
// explain command, the context payload, the generated skill — reads THIS, so a
// new method documents itself on every surface at once.
//
// Deliberately free of `node:*`: the same parser runs in the build script, in
// the CLI and in the MCP package.

/** One method a controller exposes. */
export interface ControllerMethod {
  /** Method name, exactly as `@ui:provides` lists it. */
  name: string;
  /** Parameter list as written, `""` for a nullary method. */
  params: string;
  /** First sentence of the method's JSDoc, when it has one. */
  description?: string;
}

/** A controller's public surface. */
export interface ControllerApi {
  /** Methods in the order `@ui:provides` declares them. */
  methods: ControllerMethod[];
}

/** The `@ui:provides` names, in declared order. `[]` when the line is absent. */
export function providedNames(source: string): string[] {
  const line = /^\s*\/\/\s*@ui:provides\s+(.+)$/m.exec(source);
  if (!line) return [];
  return line[1]
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !token.startsWith("l-") && !token.startsWith("$"));
}

/**
 * Every shape a controller declares a method in, in the order to try them.
 *
 * The registry uses four, and all four are load-bearing — a parser that knew
 * only the first missed thirteen of the 169 methods the recipes advertise:
 *
 *   function goTo(index) { … }              a declaration
 *   const next = () => goTo(index + 1)      an arrow bound to a const
 *   destroy() { … }                         object-method shorthand
 *   getIndex: () => index                   an arrow as an object property
 *
 * Each pattern captures exactly the parameter list.
 */
function declarationPatterns(name: string): RegExp[] {
  const id = escapeName(name);
  return [
    new RegExp(`\\bfunction\\s+${id}\\s*\\(([^)]*)\\)`),
    new RegExp(`\\b(?:const|let|var)\\s+${id}\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>`),
    new RegExp(`\\b(?:const|let|var)\\s+${id}\\s*=\\s*(?:async\\s*)?function\\s*\\(([^)]*)\\)`),
    // Object-method shorthand and property arrows. Anchored on the punctuation
    // that can precede a property so a plain call `destroy(x) {` cannot match.
    new RegExp(`[{,]\\s*${id}\\s*\\(([^)]*)\\)\\s*\\{`),
    new RegExp(`[{,]\\s*${id}\\s*:\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>`),
    new RegExp(`[{,]\\s*${id}\\s*:\\s*(?:async\\s*)?function\\s*\\(([^)]*)\\)`),
  ];
}

/**
 * The parameter list of `name` as this source declares it, or null when the
 * source does not declare it at all — which is a real answer, not a failure:
 * `alert-dialog` advertises four methods and implements none of them, because it
 * delegates wholesale to the `dialog` controller.
 */
function paramsOf(source: string, name: string): string | null {
  for (const pattern of declarationPatterns(name)) {
    const found = pattern.exec(source);
    if (found) return found[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

/**
 * The first sentence of the JSDoc block immediately above a function, cleaned of
 * its comment furniture. Tag lines (`@param`, `@returns`) are the reference; the
 * sentence is what an agent reads first, so only the sentence is kept.
 */
function descriptionOf(source: string, name: string): string | undefined {
  let at: RegExpExecArray | null = null;
  for (const pattern of declarationPatterns(name)) {
    at = pattern.exec(source);
    if (at) break;
  }
  if (!at) return undefined;

  const before = source.slice(0, at.index);
  const close = before.lastIndexOf("*/");
  if (close === -1) return undefined;
  // The comment must be adjacent — only whitespace between it and the function.
  if (before.slice(close + 2).trim() !== "") return undefined;
  const open = before.lastIndexOf("/**", close);
  if (open === -1) return undefined;

  const body = before
    .slice(open + 3, close)
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
    .join("\n");

  const prose: string[] = [];
  for (const line of body.split("\n")) {
    if (/^\s*@/.test(line)) break; // tags start the reference half
    prose.push(line.trim());
  }
  const text = prose.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;

  // First sentence: up to the first period that ends one, else the whole thing.
  const stop = /\.(\s|$)/.exec(text);
  return (stop ? text.slice(0, stop.index + 1) : text).trim();
}

/** Regex-safe method name — every real one is an identifier, but never trust it. */
function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The controller's public API, or null when the source declares none.
 *
 * `@ui:provides` is the authority on WHICH methods are public — a controller
 * declares plenty of local helpers that are not — and the source is the
 * authority on each one's shape.
 */
export function readControllerApi(
  source: string,
  /**
   * Sources to fall back to for a method this one advertises but does not
   * declare. `alert-dialog` IS `dialog` with a different `role`, and delegates
   * its whole surface — so its four methods are read from the controller it
   * delegates to rather than left blank. Keyed by nothing: the first source that
   * declares the method wins, and the order is the caller's.
   */
  fallbackSources: readonly string[] = [],
): ControllerApi | null {
  const names = providedNames(source);
  if (names.length === 0) return null;

  const methods: ControllerMethod[] = [];
  for (const name of names) {
    let from = source;
    let params = paramsOf(source, name);
    if (params === null) {
      for (const fallback of fallbackSources) {
        params = paramsOf(fallback, name);
        if (params !== null) { from = fallback; break; }
      }
    }
    if (params === null) continue; // declared nowhere we can see — never invent one
    const description = descriptionOf(from, name);
    methods.push(description ? { name, params, description } : { name, params });
  }
  return methods.length > 0 ? { methods } : null;
}

/**
 * Controllers this one delegates to, from its `import … from "../<name>/<name>.js"`
 * lines — the input for `readControllerApi`'s fallback list.
 */
export function delegatedControllers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/^\s*import\s[^\n]*?from\s+["']\.\.\/([a-z0-9-]+)\/\1\.js["']/gm)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** `open()` · `sort(columnIndex, direction)` — one method, as an agent reads it. */
export function formatMethod(method: ControllerMethod): string {
  return `${method.name}(${method.params})`;
}
