// A miniature cascade over a parsed stylesheet, shared by the layout-primitive
// suites (grid, switcher, cluster, and the patterns that delegate their
// responsive behaviour to one). Extracted from the resolver
// `tests/primitives/stack.test.ts` proved in task 0.8-03, with two
// generalizations: the component name is a parameter, and the viewport is passed
// per call instead of mocked onto `window.matchMedia` — the functions here are
// pure, so a suite can resolve the same attributes against two differently-
// ordered copies of the rules (the source-order independence proof task 0.8-04
// requires) without touching any global.
//
// Task 0.8-05 added the second axis the doctrine's middle rung needs: a rule can
// also be scoped by `@container <name> (min-width: …)`, and a resolution can
// target a CHILD of the component (`[data-ui="switcher"] > *`) rather than its
// root — which is the only way a container query can style the layout of the
// element that *is* the container, since `@container` matches descendants only.
//
// Deliberately NOT a CSS engine: it understands exactly the subset the
// registry's layout sheets use — compound attribute selectors on the component
// root, an optional single `>` child step, `:where()` at zero weight, and
// `@media` / `@container` preludes carrying a `min-width` in rem or px.
// Descendant combinators are still skipped; suites assert those by inspecting
// the rule list directly.

export interface CascadeRule {
  selectors: string[];
  decls: Record<string, string>;
  /** `(min-width: 48rem)` for a rule inside a media block, else null. */
  media: string | null;
  /** `faqir-switcher (min-width: 40rem)` for a rule inside a container block, else null. */
  container: string | null;
  /** Position in the sheet — the tie-breaker at equal specificity. */
  order: number;
}

/**
 * One attribute condition of a compound selector; `weight` is 0 inside
 * `:where()`, and a condition inside `:not()` is `negated` (keeping its weight,
 * as CSS specificity does).
 */
export interface AttrCondition {
  attr: string;
  value: string | null;
  weight: number;
  negated?: boolean;
}

export type ElementAttrs = Record<string, string | true>;

/** What a resolution is asked about, beyond the component name and property. */
export interface ResolveContext {
  /** Attributes on the component root. `data-ui` is filled in by the caller's `ui`. */
  attrs?: ElementAttrs;
  /**
   * Resolve for a child element of the component instead of its root. Only
   * `[data-ui="…"] > …` rules can match; root rules are ignored.
   */
  child?: ElementAttrs;
  /** Viewport width in px — `@media` rules apply only at or above their floor. */
  widthPx?: number;
  /** The component's own inline size in px — the same, for `@container` rules. */
  containerPx?: number;
}

export const ATTR_RE = /\[([a-z-]+)(?:="([^"]*)")?\]/g;

const ROOT_FONT_SIZE_PX = 16;

function parseDecls(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of body.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    out[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim();
  }
  return out;
}

function flatRules(
  css: string,
  scope: { media: string | null; container: string | null },
  next: () => number,
): CascadeRule[] {
  const rules: CascadeRule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    rules.push({
      selectors: m[1].split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean),
      decls: parseDecls(m[2]),
      media: scope.media,
      container: scope.container,
      order: next(),
    });
  }
  return rules;
}

/** The next `@media`/`@container` block start at or after `from`, or -1. */
function nextAtRule(css: string, from: number): { at: number; kind: "media" | "container" } | null {
  const media = css.indexOf("@media", from);
  const container = css.indexOf("@container", from);
  if (media === -1 && container === -1) return null;
  if (container === -1 || (media !== -1 && media < container)) return { at: media, kind: "media" };
  return { at: container, kind: "container" };
}

/** Every rule in the sheet, in document order, conditional blocks flattened. */
export function collectRules(source: string): CascadeRule[] {
  const css = source.replace(/\/\*[^]*?\*\//g, "");
  const rules: CascadeRule[] = [];
  let order = 0;
  const next = () => order++;
  const plain = { media: null, container: null };
  let i = 0;
  while (i < css.length) {
    const found = nextAtRule(css, i);
    if (!found) {
      rules.push(...flatRules(css.slice(i), plain, next));
      break;
    }
    rules.push(...flatRules(css.slice(i, found.at), plain, next));
    const open = css.indexOf("{", found.at);
    let depth = 0;
    let close = open;
    for (; close < css.length; close++) {
      if (css[close] === "{") depth++;
      else if (css[close] === "}" && --depth === 0) break;
    }
    const query = css.slice(found.at + `@${found.kind}`.length, open).trim();
    rules.push(
      ...flatRules(css.slice(open + 1, close), {
        media: found.kind === "media" ? query : null,
        container: found.kind === "container" ? query : null,
      }, next),
    );
    i = close + 1;
  }
  return rules;
}

/** Conditions of ONE compound selector — `null` if it uses syntax this subset does not model. */
function compoundConditions(part: string): AttrCondition[] | null {
  if (part === "*") return [];
  if (/\s/.test(part)) return null;
  const conds: AttrCondition[] = [];
  for (const where of part.matchAll(/:where\(([^)]*)\)/g)) {
    for (const a of where[1].matchAll(ATTR_RE)) {
      conds.push({ attr: a[1], value: a[2] ?? null, weight: 0 });
    }
  }
  // `:not()` keeps its argument's weight (CSS specificity) but inverts the test.
  for (const not of part.matchAll(/:not\(([^)]*)\)/g)) {
    for (const a of not[1].matchAll(ATTR_RE)) {
      conds.push({ attr: a[1], value: a[2] ?? null, weight: 1, negated: true });
    }
  }
  const positive = part.replace(/:where\([^)]*\)/g, "").replace(/:not\([^)]*\)/g, "");
  for (const a of positive.matchAll(ATTR_RE)) {
    conds.push({ attr: a[1], value: a[2] ?? null, weight: 1 });
  }
  return conds;
}

/**
 * Conditions of a compound selector — duplicated conditions count twice, which
 * is how a repeated `[data-ui="…"]` raises specificity — or null for a rule
 * that targets a child rather than the component root.
 */
export function conditions(selector: string): AttrCondition[] | null {
  if (selector.includes(">") || selector.includes(" ")) return null;
  return compoundConditions(selector);
}

function satisfied(conds: AttrCondition[], attrs: ElementAttrs): boolean {
  return conds.every((c) => {
    const hit = c.value === null ? attrs[c.attr] !== undefined : attrs[c.attr] === c.value;
    return c.negated ? !hit : hit;
  });
}

/**
 * Specificity of `selector` against the described element, or `null` when it
 * does not match (or uses unmodelled syntax). A child resolution matches only
 * `root > subject` selectors; a root resolution only single-compound ones.
 */
function specificityFor(
  selector: string,
  ui: string,
  root: ElementAttrs,
  child: ElementAttrs | undefined,
): number | null {
  const parts = selector.split(">").map((s) => s.trim());
  if (parts.length > 2) return null;
  if ((parts.length === 2) !== (child !== undefined)) return null;

  const rootConds = compoundConditions(parts[0]);
  if (!rootConds || !satisfied(rootConds, root)) return null;
  let total = rootConds;

  if (child !== undefined) {
    const childConds = compoundConditions(parts[1]);
    if (!childConds || !satisfied(childConds, child)) return null;
    total = [...rootConds, ...childConds];
  }
  if (total.length === 0) return null;
  return total.reduce((n, c) => n + c.weight, 0);
}

function floorPx(query: string): number | null {
  const rem = /min-width:\s*([\d.]+)rem/.exec(query);
  const px = /min-width:\s*([\d.]+)px/.exec(query);
  return rem ? Number(rem[1]) * ROOT_FONT_SIZE_PX : px ? Number(px[1]) : null;
}

/** Does a media prelude match a viewport of `widthPx`? Only `min-width` floors match — by canon. */
export function mediaMatches(query: string, widthPx: number): boolean {
  const floor = floorPx(query);
  return floor !== null && widthPx >= floor;
}

/**
 * Does a container prelude — optionally named, e.g. `faqir-switcher (min-width:
 * 40rem)` — match a container whose inline size is `containerPx`? Same canon
 * rule: only `min-width` floors match.
 */
export function containerMatches(query: string, containerPx: number): boolean {
  const floor = floorPx(query);
  return floor !== null && containerPx >= floor;
}

/** The container name of a `@container` prelude, or null for an unnamed query. */
export function containerName(query: string): string | null {
  const m = /^([a-z][\w-]*)\s*\(/i.exec(query.trim());
  return m ? m[1] : null;
}

function applies(rule: CascadeRule, ctx: ResolveContext): boolean {
  if (rule.media) {
    if (ctx.widthPx === undefined || !mediaMatches(rule.media, ctx.widthPx)) return false;
  }
  if (rule.container) {
    if (ctx.containerPx === undefined || !containerMatches(rule.container, ctx.containerPx)) {
      return false;
    }
  }
  return true;
}

/**
 * The winning rule for one property, given the full context. Highest
 * specificity wins; document order breaks ties.
 */
export function resolveIn(
  rules: CascadeRule[],
  ui: string,
  property: string,
  ctx: ResolveContext = {},
): CascadeRule | undefined {
  const root: ElementAttrs = { "data-ui": ui, ...(ctx.attrs ?? {}) };
  let best: { spec: number; order: number; rule: CascadeRule } | undefined;
  for (const rule of rules) {
    if (!applies(rule, ctx)) continue;
    if (rule.decls[property] === undefined) continue;
    for (const selector of rule.selectors) {
      const spec = specificityFor(selector, ui, root, ctx.child);
      if (spec === null) continue;
      if (!best || spec > best.spec || (spec === best.spec && rule.order >= best.order)) {
        best = { spec, order: rule.order, rule };
      }
    }
  }
  return best?.rule;
}

/** {@link resolveIn}, returning the declared value rather than the rule. */
export function resolveValue(
  rules: CascadeRule[],
  ui: string,
  property: string,
  ctx: ResolveContext = {},
): string | undefined {
  return resolveIn(rules, ui, property, ctx)?.decls[property];
}

/**
 * Resolve one property for a `[data-ui="<ui>"]` element carrying `attrs` at a
 * viewport of `widthPx`: highest specificity wins, document order breaks ties,
 * media-scoped rules apply only when their prelude matches.
 */
export function resolve(
  rules: CascadeRule[],
  ui: string,
  attrs: ElementAttrs,
  property: string,
  widthPx: number,
): string | undefined {
  return resolveValue(rules, ui, property, { attrs, widthPx });
}

/** The winning rule itself, for suites that need its media scope, not just the value. */
export function resolveRule(
  rules: CascadeRule[],
  ui: string,
  attrs: ElementAttrs,
  property: string,
  widthPx: number,
): CascadeRule | undefined {
  return resolveIn(rules, ui, property, { attrs, widthPx });
}

/** Every `data-*` attribute the rules select on, anywhere in any selector. */
export function selectedAttributes(rules: CascadeRule[]): Set<string> {
  const found = new Set<string>();
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      for (const a of selector.matchAll(ATTR_RE)) found.add(a[1]);
    }
  }
  return found;
}

/** Every `[attr="value"]` pair the rules select on. */
export function selectedPairs(rules: CascadeRule[]): Set<string> {
  const found = new Set<string>();
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      for (const a of selector.matchAll(ATTR_RE)) {
        if (a[2] !== undefined) found.add(`${a[1]}=${a[2]}`);
      }
    }
  }
  return found;
}
