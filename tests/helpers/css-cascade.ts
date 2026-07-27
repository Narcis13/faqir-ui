// A miniature cascade over a parsed stylesheet, shared by the layout-primitive
// suites (grid, and the patterns that delegate their responsive behaviour to
// one). Extracted from the resolver `tests/primitives/stack.test.ts` proved in
// task 0.8-03, with two generalizations: the component name is a parameter, and
// the viewport is passed per call instead of mocked onto `window.matchMedia` —
// the functions here are pure, so a suite can resolve the same attributes
// against two differently-ordered copies of the rules (the source-order
// independence proof task 0.8-04 requires) without touching any global.
//
// Deliberately NOT a CSS engine: it understands exactly the subset the
// registry's layout sheets use — compound attribute selectors on the component
// root, `:where()` at zero weight, and `@media (min-width: …)` preludes in rem
// or px. Child-targeting rules (`>` or descendant) are skipped by `resolve`;
// suites assert those by inspecting the rule list directly.

export interface CascadeRule {
  selectors: string[];
  decls: Record<string, string>;
  /** `(min-width: 48rem)` for a rule inside a media block, else null. */
  media: string | null;
  /** Position in the sheet — the tie-breaker at equal specificity. */
  order: number;
}

/** One attribute condition of a compound selector; `weight` is 0 inside `:where()`. */
export interface AttrCondition {
  attr: string;
  value: string | null;
  weight: number;
}

export type ElementAttrs = Record<string, string | true>;

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

function flatRules(css: string, media: string | null, next: () => number): CascadeRule[] {
  const rules: CascadeRule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    rules.push({
      selectors: m[1].split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean),
      decls: parseDecls(m[2]),
      media,
      order: next(),
    });
  }
  return rules;
}

/** Every rule in the sheet, in document order, media blocks flattened. */
export function collectRules(source: string): CascadeRule[] {
  const css = source.replace(/\/\*[^]*?\*\//g, "");
  const rules: CascadeRule[] = [];
  let order = 0;
  const next = () => order++;
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@media", i);
    if (at === -1) {
      rules.push(...flatRules(css.slice(i), null, next));
      break;
    }
    rules.push(...flatRules(css.slice(i, at), null, next));
    const open = css.indexOf("{", at);
    let depth = 0;
    let close = open;
    for (; close < css.length; close++) {
      if (css[close] === "{") depth++;
      else if (css[close] === "}" && --depth === 0) break;
    }
    const query = css.slice(at + "@media".length, open).trim();
    rules.push(...flatRules(css.slice(open + 1, close), query, next));
    i = close + 1;
  }
  return rules;
}

/**
 * Conditions of a compound selector — duplicated conditions count twice, which
 * is how a repeated `[data-ui="…"]` raises specificity — or null for a rule
 * that targets a child rather than the component root.
 */
export function conditions(selector: string): AttrCondition[] | null {
  if (selector.includes(">") || selector.includes(" ")) return null;
  const conds: AttrCondition[] = [];
  for (const where of selector.matchAll(/:where\(([^)]*)\)/g)) {
    for (const a of where[1].matchAll(ATTR_RE)) {
      conds.push({ attr: a[1], value: a[2] ?? null, weight: 0 });
    }
  }
  for (const a of selector.replace(/:where\([^)]*\)/g, "").matchAll(ATTR_RE)) {
    conds.push({ attr: a[1], value: a[2] ?? null, weight: 1 });
  }
  return conds;
}

/** Does a media prelude match a viewport of `widthPx`? Only `min-width` floors match — by canon. */
export function mediaMatches(query: string, widthPx: number): boolean {
  const rem = /min-width:\s*([\d.]+)rem/.exec(query);
  const px = /min-width:\s*([\d.]+)px/.exec(query);
  const floor = rem ? Number(rem[1]) * ROOT_FONT_SIZE_PX : px ? Number(px[1]) : null;
  return floor !== null && widthPx >= floor;
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
  const all: ElementAttrs = { "data-ui": ui, ...attrs };
  let best: { spec: number; order: number; value: string } | undefined;
  for (const rule of rules) {
    if (rule.media && !mediaMatches(rule.media, widthPx)) continue;
    const value = rule.decls[property];
    if (value === undefined) continue;
    for (const selector of rule.selectors) {
      const conds = conditions(selector);
      if (!conds || conds.length === 0) continue;
      const ok = conds.every((c) =>
        c.value === null ? all[c.attr] !== undefined : all[c.attr] === c.value,
      );
      if (!ok) continue;
      const spec = conds.reduce((n, c) => n + c.weight, 0);
      if (!best || spec > best.spec || (spec === best.spec && rule.order >= best.order)) {
        best = { spec, order: rule.order, value };
      }
    }
  }
  return best?.value;
}

/** The winning rule itself, for suites that need its media scope, not just the value. */
export function resolveRule(
  rules: CascadeRule[],
  ui: string,
  attrs: ElementAttrs,
  property: string,
  widthPx: number,
): CascadeRule | undefined {
  const all: ElementAttrs = { "data-ui": ui, ...attrs };
  let best: { spec: number; order: number; rule: CascadeRule } | undefined;
  for (const rule of rules) {
    if (rule.media && !mediaMatches(rule.media, widthPx)) continue;
    if (rule.decls[property] === undefined) continue;
    for (const selector of rule.selectors) {
      const conds = conditions(selector);
      if (!conds || conds.length === 0) continue;
      const ok = conds.every((c) =>
        c.value === null ? all[c.attr] !== undefined : all[c.attr] === c.value,
      );
      if (!ok) continue;
      const spec = conds.reduce((n, c) => n + c.weight, 0);
      if (!best || spec > best.spec || (spec === best.spec && rule.order >= best.order)) {
        best = { spec, order: rule.order, rule };
      }
    }
  }
  return best?.rule;
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
