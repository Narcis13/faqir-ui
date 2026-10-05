/**
 * How a component stylesheet reaches its parts — tasks 1.1F-20 … 1.1F-23.
 *
 * `[data-ui="tabs"] [data-part="trigger"]` styles every trigger below the tabs
 * root, including the `<summary data-part="trigger">` of a collapsible that
 * happens to sit in a panel. The fix is structural: a part is reached by child
 * combinators only, so a nested component's parts are out of reach by
 * construction. This module is the reader the registry gate and the nesting
 * tests share:
 *
 *   - `descendantPartSelectors()` — the selectors that still cross a descendant
 *     combinator on their way to a `[data-part=…]`, including the implicit one
 *     a bare `:has([data-part=…])` takes;
 *   - `findDescendantPartSelectors()` — that, over a set of stylesheets, as the
 *     `descendant-part-selector` gate of `audit:registry` (1.1F-23), with its
 *     allowlist (`DESCENDANT_PART_ALLOWED`) and the pattern sheets still waiting
 *     for 1.1F-39 (`DESCENDANT_PART_PENDING`);
 *   - `partSkeletons()` — each part rule reduced to its structural path, which a
 *     DOM can be queried with to prove nothing leaks into a nested component;
 *   - `specificity()` — so a conversion can be shown to move no rule in the
 *     cascade (the intermediate hops go in `:where()`).
 *
 * It models the subset component CSS uses: attribute, type and pseudo
 * selectors, the four combinators and the functional pseudo-classes. No nesting.
 */

/** A compound selector and the combinator that precedes it (`null` for the first). */
export interface Step {
  combinator: " " | ">" | "+" | "~" | null;
  compound: string;
}

export interface SheetSelector {
  /** One complex selector, whitespace-normalised. */
  selector: string;
  /** 1-based line of the rule's prelude in the source file. */
  line: number;
}

const FUNCTIONAL = /:(where|is|not|has)\(/g;

/** Comments blanked out, newlines kept, so offsets still map to source lines. */
function stripComments(css: string): string {
  return css.replace(/\/\*[^]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

/** Split at top-level commas — not inside `()`, `[]` or a string. */
export function splitSelectorList(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  out.push(prelude.slice(start));
  return out.map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
}

/** Every style-rule selector in the sheet, conditional blocks included. */
export function sheetSelectors(source: string): SheetSelector[] {
  const css = stripComments(source);
  const out: SheetSelector[] = [];
  let start = 0;
  let line = 1;
  // Depth of blocks whose body is declarations or keyframes, not rules.
  let opaque = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      const raw = css.slice(start, i);
      const prelude = raw.trim();
      if (opaque > 0) opaque++;
      else if (prelude.startsWith("@")) {
        if (!/^@(media|supports|container|layer)\b/.test(prelude)) opaque = 1;
      } else {
        const at = line + (raw.slice(0, raw.length - raw.trimStart().length).match(/\n/g) ?? []).length;
        for (const selector of splitSelectorList(prelude)) out.push({ selector, line: at });
        opaque = 1;
      }
      line += (raw.match(/\n/g) ?? []).length;
      start = i + 1;
    } else if (ch === "}" || ch === ";") {
      line += (css.slice(start, i).match(/\n/g) ?? []).length;
      if (ch === "}" && opaque > 0) opaque--;
      start = i + 1;
    }
  }
  return out;
}

/** The compounds of one complex selector, each with its leading combinator. */
export function steps(selector: string): Step[] {
  const out: Step[] = [];
  let depth = 0;
  let quote: string | null = null;
  let compound = "";
  let combinator: Step["combinator"] = null;
  const flush = () => {
    if (!compound) return;
    out.push({ combinator: out.length === 0 ? null : (combinator ?? " "), compound });
    compound = "";
    combinator = null;
  };
  for (const ch of selector.trim()) {
    if (quote) {
      compound += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      compound += ch;
    } else if (ch === "(" || ch === "[") {
      depth++;
      compound += ch;
    } else if (ch === ")" || ch === "]") {
      depth--;
      compound += ch;
    } else if (depth > 0) compound += ch;
    else if (ch === ">" || ch === "+" || ch === "~") {
      flush();
      combinator = ch;
    } else if (/\s/.test(ch)) {
      flush();
      combinator ??= " ";
    } else compound += ch;
  }
  flush();
  return out;
}

/** The argument of each top-level `:where()` / `:is()` / `:not()` / `:has()` in a compound. */
function functionalArgs(compound: string): { name: string; arg: string }[] {
  const out: { name: string; arg: string }[] = [];
  let end = 0;
  for (const m of compound.matchAll(FUNCTIONAL)) {
    if (m.index < end) continue;
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    for (; i < compound.length && depth > 0; i++) {
      if (compound[i] === "(") depth++;
      else if (compound[i] === ")") depth--;
    }
    out.push({ name: m[1], arg: compound.slice(from, i - 1) });
    end = i;
  }
  return out;
}

/**
 * Does this complex selector cross a descendant combinator into a part? A
 * `:has()` argument is a relative selector, and one that starts without a
 * combinator starts with a descendant one: `:has([data-part="thumb"])` asks
 * about every thumb below, `:has(> [data-part="thumb"])` about its own.
 */
export function crossesIntoPart(selector: string): boolean {
  return steps(selector).some((step) => {
    if (step.combinator === " " && step.compound.includes("[data-part")) return true;
    return functionalArgs(step.compound).some(({ name, arg }) =>
      splitSelectorList(arg).some(
        (s) =>
          (name === "has" && !/^[>+~]/.test(s) && steps(s)[0]?.compound.includes("[data-part")) ||
          crossesIntoPart(s),
      ),
    );
  });
}

/** The selectors of a stylesheet that reach a `[data-part=…]` across a descendant combinator. */
export function descendantPartSelectors(source: string): SheetSelector[] {
  return sheetSelectors(source).filter((s) => crossesIntoPart(s.selector));
}

/** `[a, b, c]` — ids, then classes/attributes/pseudo-classes, then types/pseudo-elements. */
export function specificity(selector: string): [number, number, number] {
  const total: [number, number, number] = [0, 0, 0];
  for (const { compound } of steps(selector)) {
    let rest = compound;
    for (const { name, arg } of functionalArgs(compound)) {
      rest = rest.replace(`:${name}(${arg})`, "");
      if (name === "where") continue;
      // `:is()`, `:not()` and `:has()` weigh as their most specific argument.
      const best = splitSelectorList(arg)
        .map(specificity)
        .sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0];
      if (best) for (let i = 0; i < 3; i++) total[i] += best[i];
    }
    total[2] += (rest.match(/::[\w-]+/g) ?? []).length;
    rest = rest.replace(/::[\w-]+/g, "");
    total[0] += (rest.match(/#[\w-]+/g) ?? []).length;
    total[1] += (rest.match(/\[[^\]]*\]|\.[\w-]+|:[\w-]+(\([^)]*\))?/g) ?? []).length;
    rest = rest.replace(/\[[^\]]*\]|\.[\w-]+|#[\w-]+|:[\w-]+(\([^)]*\))?/g, "");
    if (/^[a-zA-Z]/.test(rest)) total[2] += 1;
  }
  return total;
}

/**
 * What a compound requires structurally: its part, or else its tag. A
 * `:not([data-ui])` is structural too — it says "no component starts here" —
 * so it is kept, and so is a `[data-ui="stack"]` hop, which says which one may;
 * every other condition is state and is dropped.
 */
function core(compound: string): string {
  const fns = functionalArgs(compound);
  const hop = fns.find((f) => f.name === "where" || f.name === "is");
  if (hop && compound === `:${hop.name}(${hop.arg})`) {
    // A `:where(a, b)` hop keeps its alternatives.
    const alts = splitSelectorList(hop.arg).map(core);
    return alts.length === 1 ? alts[0] : `:is(${alts.join(", ")})`;
  }
  const part = /\[data-part="[^"]*"\]/.exec(compound);
  if (part) return part[0];
  const tag = /^[a-zA-Z][\w-]*/.exec(compound)?.[0];
  const ui = /\[data-ui="[^"]*"\]/.exec(compound)?.[0];
  if (ui) return (tag ?? "") + ui;
  return (tag ?? "*") + (fns.some((f) => f.name === "not" && f.arg === "[data-ui]") ? ":not([data-ui])" : "");
}

/**
 * Each part rule as a bare structural path from `root`: states, variants and
 * pseudo-classes dropped, `:where()` hops unwrapped. `[data-ui="tabs"]
 * [data-variant="pill"] > :where([data-part="list"]) > [data-part="trigger"]:hover`
 * becomes `ROOT > [data-part="list"] > [data-part="trigger"]`. A DOM queried
 * with it answers "could this rule ever reach that element", whatever state the
 * component is in. Rules whose subject is not a part are left out.
 */
export function partSkeletons(source: string, root: string): string[] {
  const out = new Set<string>();
  for (const { selector } of sheetSelectors(source)) {
    const path = steps(selector);
    if (path.length < 2 || !path[path.length - 1].compound.includes("[data-part")) continue;
    out.add(
      root +
        path
          .slice(1)
          .map((s) => (s.combinator === " " ? " " : ` ${s.combinator} `) + core(s.compound))
          .join(""),
    );
  }
  return [...out];
}

// ── the gate ─────────────────────────────────────────────────────────────────

/**
 * Descendant part selectors the registry keeps on purpose, as `<registry-relative
 * path> <selector>`. Named one by one, like `GLYPH_RULES` in the shape-focus
 * tests, so the exception cannot quietly grow.
 *
 * tree-view: an item's group holds items at any depth, which no chain of child
 * combinators can express. Each rule takes exactly one descendant step, from
 * the root to the item or group the recursion is made of; the rest are child
 * hops. The sheet carries the same note.
 */
export const DESCENDANT_PART_ALLOWED: ReadonlySet<string> = new Set(
  [
    `[data-ui="tree-view"] :where([data-part="item"]) > [data-part="group"]`,
    `[data-ui="tree-view"] :where([data-part="group"]) > [data-part="item"]`,
    `[data-ui="tree-view"] :where([data-part="item"]) > [data-part="label"]`,
    `[data-ui="tree-view"] :where([data-part="group"]) > [data-part="item"]:not([aria-disabled="true"]) > [data-part="label"]:hover`,
    `[data-ui="tree-view"] :where([data-part="group"]) > [data-part="item"]:focus-visible > [data-part="label"]`,
    `[data-ui="tree-view"] :where([data-part="group"]) > [data-part="item"][aria-selected="true"] > [data-part="label"]`,
    `[data-ui="tree-view"] :where([data-part="group"]) > [data-part="item"][aria-disabled="true"] > [data-part="label"]`,
    `[data-ui="tree-view"] :where([data-part="item"]) > :where([data-part="label"]) > [data-part="toggle"]`,
    `[data-ui="tree-view"] :where([data-part="group"]) > [data-part="item"]:not([aria-expanded]) > [data-part="label"] > [data-part="toggle"]`,
    `[data-ui="tree-view"] :where([data-part="group"]) > [data-part="item"][aria-expanded="true"] > [data-part="label"] > [data-part="toggle"]`,
  ].map((selector) => `recipes/tree-view/tree-view.css ${selector}`),
);

/**
 * Pattern stylesheets not converted yet: follow-up 1.1F-39 converts them and
 * empties this list. Every other sheet in the registry is held to the gate, a
 * new one included; a sheet listed here that has nothing left to convert fails,
 * so the list only shrinks.
 */
export const DESCENDANT_PART_PENDING: ReadonlySet<string> = new Set([
  "patterns/auth-form/auth-form.css",
  "patterns/crud-table/crud-table.css",
  "patterns/dashboard-shell/dashboard-shell.css",
  "patterns/document/document.css",
  "patterns/feature-grid/feature-grid.css",
  "patterns/hero/hero.css",
  "patterns/pricing/pricing.css",
  "patterns/search-results/search-results.css",
  "patterns/settings-page/settings-page.css",
  "patterns/site-footer/site-footer.css",
  "patterns/stats-dashboard/stats-dashboard.css",
  "patterns/wizard/wizard.css",
]);

export interface DescendantPartFinding {
  /** Registry-relative stylesheet path. */
  file: string;
  /** 1-based line of the rule, or 0 for an allowlist entry that matches nothing. */
  line: number;
  kind: "descendant-part-selector" | "stale-allowlist" | "stale-pending";
  message: string;
}

/**
 * The `descendant-part-selector` gate: every selector in `sheets` that reaches
 * a part across a descendant combinator, unless allowlisted or its sheet is
 * pending. Allowlist entries and pending sheets that no longer match anything
 * are findings too.
 */
export function findDescendantPartSelectors(
  sheets: readonly { rel: string; css: string }[],
  allowed: ReadonlySet<string> = DESCENDANT_PART_ALLOWED,
  pending: ReadonlySet<string> = DESCENDANT_PART_PENDING,
): DescendantPartFinding[] {
  const out: DescendantPartFinding[] = [];
  const used = new Set<string>();
  const scanned = new Set<string>();
  for (const { rel, css } of sheets) {
    scanned.add(rel);
    const found = descendantPartSelectors(css);
    if (pending.has(rel)) {
      if (found.length === 0) {
        out.push({ file: rel, line: 0, kind: "stale-pending", message: "has no descendant part selector left: take it off DESCENDANT_PART_PENDING" });
      }
      continue;
    }
    for (const { selector, line } of found) {
      const key = `${rel} ${selector}`;
      if (allowed.has(key)) {
        used.add(key);
        continue;
      }
      out.push({
        file: rel,
        line,
        kind: "descendant-part-selector",
        message: `${selector} — reaches a part across a descendant combinator, so it also styles that part of a nested component. Use child combinators with :where() hops.`,
      });
    }
  }
  for (const key of allowed) {
    const rel = key.slice(0, key.indexOf(" "));
    if (scanned.has(rel) && !used.has(key)) {
      out.push({ file: rel, line: 0, kind: "stale-allowlist", message: `allowlisted selector no longer in the sheet: ${key.slice(rel.length + 1)}` });
    }
  }
  return out;
}
