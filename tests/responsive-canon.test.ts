// ═══════════════════════════════════════════════════════════════════════════
// Responsive sweeps — the whole registry on the breakpoint canon  [0.8-08/09]
// ═══════════════════════════════════════════════════════════════════════════
//
// 0.8-01 wrote the canon down; this suite is what makes the registry obey it.
// Sweep A (0.8-08) moved primitives and recipes; sweep B (0.8-09) moved the
// patterns, and widened the guard below to cover all three trees rather than
// standing up a second copy of it — a rogue breakpoint anywhere in the registry
// now fails here, which is exactly the shape 0.8-10 promotes into an audit rule.
//
// Three kinds of assertion, in the order the tasks ask for them:
//
//   1. A SWEEP over every stylesheet under registry/primitives,
//      registry/recipes and registry/patterns: no width prelude may say anything
//      but a canon `min-width`. Feature queries (reduced motion, colour scheme,
//      forced colours) and the print media type are exempt because they carry no
//      width at all — the rule is about the ladder, not about `@media`. This is
//      the test 0.8-10 promotes into the `breakpoint-canon` audit rule, so it is
//      deliberately written as a predicate over parsed preludes rather than as a
//      list of files anybody has to maintain.
//
//   2. BEHAVIOUR through the real rules, per component. Each of the three
//      sheets this task rewrote is parsed and resolved at concrete widths with
//      the shared cascade helper — so what is asserted is the cascade the
//      browser would run, including the specificity interactions the table's
//      inversion depends on, not the presence of a string in a file.
//
//   3. ONE ladder, three files. `table` is the only component in the registry
//      whose responsive behaviour is split across CSS, a controller and a
//      manifest; all three are re-read here and compared to the canon module, so
//      the engine cannot become a second source of truth. The controller has to
//      carry the numbers as literals — scripts/build-core.mjs strips every
//      import when it inlines a controller into the UMD closure — which is
//      exactly why the equality is enforced from outside, against both the
//      recipe source and the built engine.

import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BREAKPOINTS, TIERS, containerQuery, minWidth } from "../src/utils/breakpoints";
import {
  collectRules,
  resolve,
  resolveDeepValue,
  type CascadeRule,
} from "./helpers/css-cascade";
import { createTable } from "../registry/recipes/table/table.js";

const ROOT = join(import.meta.dir, "..");
const PRIMITIVES = join(ROOT, "registry", "primitives");
const RECIPES = join(ROOT, "registry", "recipes");
const PATTERNS = join(ROOT, "registry", "patterns");

const sheet = (path: string) => readFileSync(path, "utf8");
const rulesOf = (path: string) => collectRules(sheet(path));

/** Every `.css` file under `dir`, recursively. */
function stylesheets(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...stylesheets(full));
    else if (entry.endsWith(".css")) out.push(full);
  }
  return out.sort();
}

interface Prelude {
  file: string;
  kind: "media" | "container";
  text: string;
}

/** Every `@media` / `@container` prelude in a sheet, comments stripped first. */
function preludes(file: string): Prelude[] {
  const css = sheet(file).replace(/\/\*[^]*?\*\//g, "");
  const found: Prelude[] = [];
  for (const m of css.matchAll(/@(media|container)([^{]*)\{/g)) {
    found.push({ file, kind: m[1] as "media" | "container", text: m[2].trim() });
  }
  return found;
}

const rel = (file: string) => file.slice(ROOT.length + 1);

// The canon, as the sweep sees it: derived, never re-typed.
const CANON_REM = TIERS.map((t) => BREAKPOINTS[t].rem);
const CANON_CONDITIONS = new Set(TIERS.map((t) => minWidth(t)));

// ── 1 · The sweep ────────────────────────────────────────────────────────────

describe("canon sweep · registry/primitives + registry/recipes + registry/patterns", () => {
  const files = [...stylesheets(PRIMITIVES), ...stylesheets(RECIPES), ...stylesheets(PATTERNS)];
  const all = files.flatMap(preludes);
  // A prelude is about width if it mentions one at all; everything else
  // (prefers-reduced-motion, prefers-color-scheme, forced-colors, print) is a
  // feature or media-type query the canon has nothing to say about.
  const widthPreludes = all.filter((p) => /width/.test(p.text));

  it("sweeps a non-trivial number of sheets and preludes", () => {
    // Guards the whole section against passing vacuously if the walk breaks.
    expect(files.length).toBeGreaterThan(75);
    expect(widthPreludes.length).toBeGreaterThan(30);
  });

  it("covers every pattern stylesheet — the sweep-B tree is really in the walk", () => {
    const patternSheets = stylesheets(PATTERNS);
    expect(patternSheets.length).toBeGreaterThanOrEqual(15);
    // The nine sheets 0.8-09 rewrote all still carry width preludes; if one lost
    // its responsive behaviour entirely the sweep would pass by saying nothing.
    const rewritten = [
      "hero",
      "pricing",
      "feature-grid",
      "site-footer",
      "stats-dashboard",
      "inbox",
      "dashboard-shell",
      "auth-form",
      "document",
    ];
    for (const pattern of rewritten) {
      const file = join(PATTERNS, pattern, `${pattern}.css`);
      const widths = preludes(file).filter((p) => /width/.test(p.text));
      expect(widths.length, `${pattern} has width preludes`).toBeGreaterThan(0);
    }
  });

  it("no width prelude uses max-width — the canon is min-width only", () => {
    const offenders = all
      .filter((p) => /max-width|max-inline-size/.test(p.text))
      .map((p) => `${rel(p.file)}: @${p.kind} ${p.text}`);
    expect(offenders).toEqual([]);
  });

  it("every width prelude is exactly one canon min-width condition", () => {
    const offenders: string[] = [];
    for (const p of widthPreludes) {
      // `@container faqir-table (min-width: 48rem)` — an optional container name
      // then a single parenthesised condition.
      const m = /^(?:[a-z][\w-]*\s+)?\(\s*([^()]+?)\s*\)$/.exec(p.text);
      if (!m || !CANON_CONDITIONS.has(m[1].replace(/\s+/g, " "))) {
        offenders.push(`${rel(p.file)}: @${p.kind} ${p.text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every width value in a prelude is a canon rem step (never px, never ad hoc)", () => {
    const values = widthPreludes.flatMap((p) => [...p.text.matchAll(/([\d.]+)(rem|px)/g)]);
    expect(values.length).toBeGreaterThan(15);
    for (const v of values) {
      expect(v[2]).toBe("rem");
      expect(CANON_REM).toContain(Number(v[1]));
    }
  });

  it("named container queries name a container the same package declares", () => {
    // A `@container faqir-x (…)` whose name nothing sets is dead CSS — the
    // failure mode the table's inversion depends on NOT having.
    for (const p of preludes(join(RECIPES, "table", "table.css"))) {
      if (p.kind !== "container") continue;
      const name = /^([a-z][\w-]*)\s*\(/.exec(p.text)?.[1];
      expect(name).toBe("faqir-table");
      expect(sheet(p.file)).toContain(`container-name: ${name}`);
    }
  });
});

// ── 1b · sweep B's own guards over registry/patterns ────────────────────────

describe("canon sweep · patterns are page-level, mobile-first and ascending", () => {
  const files = stylesheets(PATTERNS);

  it("every tier block in a pattern is declared in ascending order", () => {
    // A sheet that reads sm → lg → md is still canon-legal and still correct
    // CSS, but it is no longer readable as a ladder — and 0.8-09's whole claim
    // is that these sheets read mobile-first top to bottom.
    for (const file of files) {
      const floors = preludes(file)
        .filter((p) => /width/.test(p.text))
        .map((p) => Number(/([\d.]+)rem/.exec(p.text)![1]));
      expect(floors, `${rel(file)} tier blocks ascend`).toEqual([...floors].sort((a, b) => a - b));
    }
  });

  it("patterns ask about the viewport, not about a container", () => {
    // The doctrine's third rung (FAQIR-NEXT §19) is reserved for whoever owns
    // the page. Patterns do; components do not, which is why table's ladder is
    // `@container` and every pattern's is `@media`.
    const containers = files
      .flatMap(preludes)
      .filter((p) => p.kind === "container")
      .map((p) => `${rel(p.file)}: @container ${p.text}`);
    expect(containers).toEqual([]);
  });

  it("no pattern reaches for a fifth tier — 480 and 641 are gone", () => {
    // The two ad-hoc numbers 0.8-09 retired: auth-form's 480px full bleed (the
    // `xs` that §19 declines to create) and grid's old off-by-one range floor.
    for (const file of files) {
      const css = sheet(file).replace(/\/\*[^]*?\*\//g, "");
      for (const m of css.matchAll(/@(?:media|container)([^{]*)\{/g)) {
        expect(m[1], `${rel(file)}: @media ${m[1].trim()}`).not.toMatch(/480px|641px|30rem/);
      }
    }
  });
});

// ── 2 · dashboard-shell — the off-canvas drawer, inverted onto md ───────────

describe("dashboard-shell · the sidebar is a drawer below md and a column above", () => {
  const rules = rulesOf(join(PATTERNS, "dashboard-shell", "dashboard-shell.css"));
  const MD = BREAKPOINTS.md.px;

  /** A property of the sidebar, for a shell carrying `root`, at `widthPx`. */
  const sidebar = (
    property: string,
    widthPx: number,
    subject: Record<string, string> = {},
    root: Record<string, string> = {},
  ) =>
    resolveDeepValue(rules, "dashboard-shell", property, {
      root,
      subject: { "data-part": "sidebar", ...subject },
      widthPx,
    });

  it("is fixed and off-canvas on a phone, static and in-flow from md", () => {
    expect(sidebar("position", 390)).toBe("fixed");
    expect(sidebar("position", MD - 1)).toBe("fixed");
    expect(sidebar("position", MD)).toBe("static");
    expect(sidebar("position", 1280)).toBe("static");
  });

  it("slides in on data-state=expanded, and only while it is a drawer", () => {
    expect(sidebar("transform", 390)).toBe("translateX(-100%)");
    expect(sidebar("transform", 390, { "data-state": "expanded" })).toBe("translateX(0)");
    // From md up the drawer machinery is off at EVERY specificity the base
    // declares it at — including the expanded state and the right variant.
    expect(sidebar("transform", MD)).toBe("none");
    expect(sidebar("transform", MD, { "data-state": "expanded" })).toBe("none");
    expect(sidebar("transform", MD, {}, { "data-variant": "right" })).toBe("none");
    expect(
      sidebar("transform", MD, { "data-state": "expanded" }, { "data-variant": "right" }),
    ).toBe("none");
  });

  it("the right variant slides in from the other edge, below md", () => {
    const right = { "data-variant": "right" };
    expect(sidebar("transform", 390, {}, right)).toBe("translateX(100%)");
    expect(sidebar("inset-inline-end", 390, {}, right)).toBe("0");
    expect(sidebar("inset", MD, {}, right)).toBe("auto");
  });

  it("the shell is one column on a phone and two from md — collapsed or not", () => {
    const columns = (widthPx: number, attrs: Record<string, string> = {}) =>
      resolve(rules, "dashboard-shell", attrs, "grid-template-columns", widthPx);
    expect(columns(390)).toBe("1fr");
    expect(columns(390, { "data-variant": "right" })).toBe("1fr");
    expect(columns(MD)).toBe("var(--shell-sidebar-width, 16rem) 1fr");

    // The two `:has(sidebar collapsed)` rules used to sit unconditionally, at
    // (0,3,0) against the single-column rule's (0,1,0) — so a collapsed sidebar
    // on a phone produced a 4rem column no grid area was ever placed in. They
    // now live in the md block, where the column they narrow actually exists.
    const collapsed = rules.filter((r) => r.selectors.some((s) => s.includes(":has(")));
    expect(collapsed.length).toBe(2);
    for (const rule of collapsed) expect(rule.media).toBe(`(${minWidth("md")})`);
  });
});

// ── 2 · auth-form — full bleed to the canon sm floor, with no `xs` ──────────

describe("auth-form · the card is the page below sm and a card above it", () => {
  const rules = rulesOf(join(PATTERNS, "auth-form", "auth-form.css"));
  const card = (property: string, widthPx: number) =>
    resolveDeepValue(rules, "auth-form", property, {
      subject: { "data-ui": "card" },
      widthPx,
    });

  it("goes full bleed on a phone and boxed from the sm floor up", () => {
    expect(card("max-width", 390)).toBe("100%");
    expect(card("border-radius", 390)).toBe("0");
    expect(card("box-shadow", 390)).toBe("none");
    expect(card("border-inline-start", 390)).toBe("none");

    const sm = BREAKPOINTS.sm.px;
    expect(card("max-width", sm)).toBe("var(--auth-form-max-width, 400px)");
    expect(card("border-radius", sm)).toBe("var(--card-radius, var(--radius-lg))");
    expect(card("box-shadow", sm)).toBe("var(--card-shadow, var(--shadow-sm))");
    expect(card("border-inline-start", sm)).toBe("1px solid var(--card-border, var(--color-border))");
  });

  it("the retired 480px floor is inside the sm tier, not below a fifth one", () => {
    // The plan's position (§19): there is no `xs`. Everything the old 480px
    // block did now runs to 640px, which is the same phones plus the large ones
    // in landscape — where full bleed is the better answer anyway.
    expect(card("max-width", 480)).toBe("100%");
    expect(card("max-width", BREAKPOINTS.sm.px - 1)).toBe("100%");
    expect(TIERS[0]).toBe("sm");
  });

  it("restates card.css's box rather than reverting to the user agent", () => {
    // `revert` would drop to the UA origin and take the card primitive's own
    // author rules with it. The sm block therefore names the values — through
    // card's own custom properties, so a theme override still reaches them.
    const declarations = sheet(join(PATTERNS, "auth-form", "auth-form.css")).replace(
      /\/\*[^]*?\*\//g,
      "",
    );
    expect(declarations).not.toContain("revert");
    for (const property of ["border-radius", "box-shadow", "border-inline-start"]) {
      expect(card(property, BREAKPOINTS.sm.px)).toContain("var(--card-");
    }
  });
});

// ── 2 · document — paper margins from md, and print still wins ──────────────

describe("document · the sheet fills a phone and gets its margins back at md", () => {
  const file = join(PATTERNS, "document", "document.css");
  const rules = rulesOf(file);
  const at = (property: string, widthPx: number) =>
    resolve(rules, "document", {}, property, widthPx);

  it("tightens margin, padding and corners below md", () => {
    expect(at("margin", 390)).toBe("var(--space-4) auto");
    expect(at("padding", 390)).toBe("var(--space-6) var(--space-4)");
    expect(at("border-radius", 390)).toBe("0");

    const md = BREAKPOINTS.md.px;
    expect(at("margin", md)).toBe("var(--space-8) auto");
    expect(at("padding", md)).toBe("var(--space-12) var(--space-8)");
    expect(at("border-radius", md)).toBe("var(--radius-md, 0.375rem)");
  });

  it("declares the tier block BEFORE @media print, so paper still wins", () => {
    // A `min-width` query is true on paper: a Letter page box is 8.5in ≈ 816px,
    // past the md floor. The pre-canon `max-width: 768px` form never matched a
    // page and could sit anywhere; the mobile-first form has to be outranked by
    // the print block, which at equal specificity means declared earlier.
    const css = sheet(file).replace(/\/\*[^]*?\*\//g, "");
    const tier = css.indexOf(`@media (${minWidth("md")})`);
    const print = css.indexOf("@media print");
    expect(tier).toBeGreaterThan(-1);
    expect(print).toBeGreaterThan(-1);
    expect(tier).toBeLessThan(print);
    expect(BREAKPOINTS.md.px).toBeLessThan(8.5 * 96);
  });
});

// ── 2 · hero — the page frame and the type scale open up at sm ──────────────

describe("hero · the phone case is the base rule", () => {
  const rules = rulesOf(join(PATTERNS, "hero", "hero.css"));
  const sm = BREAKPOINTS.sm.px;

  it("pads tightly and sets smaller type below sm", () => {
    expect(resolve(rules, "hero", {}, "padding-inline", 390)).toBe("var(--space-4)");
    expect(resolve(rules, "hero", {}, "padding-inline", sm)).toBe("var(--space-6)");

    const headline = (widthPx: number) =>
      resolveDeepValue(rules, "hero", "font-size", {
        subject: { "data-part": "headline" },
        widthPx,
      });
    expect(headline(390)).toBe("var(--text-3xl)");
    expect(headline(sm)).toBe("var(--text-4xl)");
  });

  it("the split variant keeps its own headline size on both sides of sm", () => {
    // The variant rule is (0,3,0) and the sm reveal (0,2,0), so the split hero
    // is unaffected by the tier — the pre-canon behaviour, preserved.
    for (const widthPx of [390, sm, 1280]) {
      expect(
        resolveDeepValue(rules, "hero", "font-size", {
          root: { "data-variant": "split" },
          subject: { "data-part": "headline" },
          widthPx,
        }),
      ).toBe("var(--text-3xl)");
    }
  });
});

// ── 2 · input — the fixed-width fallback, mobile-first ───────────────────────

describe("input · data-width=\"fixed\" caps from the canon sm tier up", () => {
  const rules = rulesOf(join(PRIMITIVES, "input", "input.css"));
  const fixed = { "data-width": "fixed" };
  const maxWidth = (px: number) => resolve(rules, "input", fixed, "max-width", px);

  it("is full-bleed below sm and capped at and above it", () => {
    expect(maxWidth(390)).toBe("100%");
    expect(maxWidth(BREAKPOINTS.sm.px - 1)).toBe("100%");
    expect(maxWidth(BREAKPOINTS.sm.px)).toBe("250px");
    expect(maxWidth(BREAKPOINTS.lg.px)).toBe("250px");
  });

  it("the cap comes from the canon sm media block, not the base rule", () => {
    const rule = rules.find(
      (r) => r.decls["max-width"] === "250px" && r.selectors.some((s) => s.includes("data-width")),
    );
    expect(rule?.media).toBe(`(${minWidth("sm")})`);
  });

  it("the base rule is the narrow case — nothing is undone by an override", () => {
    const base = rules.find(
      (r) => r.media === null && r.selectors.some((s) => s.includes('[data-width="fixed"]')),
    );
    expect(base?.decls["max-width"]).toBe("100%");
    expect(base?.decls["width"]).toBe("100%");
  });
});

// ── 2 · stepper — labels revealed, connector loosened, at sm ─────────────────

describe("stepper · labels are hidden on a phone and revealed at canon sm", () => {
  const rules = rulesOf(join(PRIMITIVES, "stepper", "stepper.css"));
  const at = (property: string, widthPx: number, part: string) =>
    resolveDeepValue(rules, "stepper", property, { subject: { "data-part": part }, widthPx });

  it("the label flips exactly at the sm floor", () => {
    expect(at("display", 390, "label")).toBe("none");
    expect(at("display", BREAKPOINTS.sm.px - 1, "label")).toBe("none");
    expect(at("display", BREAKPOINTS.sm.px, "label")).toBe("revert");
    expect(at("display", BREAKPOINTS.xl.px, "label")).toBe("revert");
  });

  it("the connector's tight metrics are the base, the roomy ones arrive at sm", () => {
    expect(at("min-width", 390, "connector")).toBe("var(--space-2)");
    expect(at("margin", 390, "connector")).toBe("0 var(--space-1)");
    expect(at("min-width", BREAKPOINTS.sm.px, "connector")).toBe("var(--space-4)");
    expect(at("margin", BREAKPOINTS.sm.px, "connector")).toBe("0 var(--space-2)");
  });

  it("an active step's label keeps its colour on both sides of the flip", () => {
    // The state rules sit at higher specificity and declare no `display`, so the
    // reveal must not be entangled with them.
    for (const widthPx of [390, BREAKPOINTS.sm.px]) {
      expect(
        resolveDeepValue(rules, "stepper", "color", {
          between: [{ "data-part": "step", "data-state": "active" }],
          subject: { "data-part": "label" },
          widthPx,
        }),
      ).toBe("var(--color-primary)");
    }
  });
});

// ── 2 · table CSS — priority column hiding, inverted ────────────────────────

describe("table · data-hide-below reveals from its canon tier up", () => {
  const rules = rulesOf(join(RECIPES, "table", "table.css"));
  const responsive = { "data-responsive": "stack" };
  /** `display` for a body cell of a prioritised column, in a container of `containerPx`. */
  const cell = (tier: string, containerPx: number | undefined, extra: Record<string, string | true> = {}) =>
    resolveDeepValue(rules, "table", "display", {
      root: responsive,
      subject: { "data-part": "td", "data-hide-below": tier, ...extra },
      containerPx,
    });

  it("each tier hides below its canon floor and shows at it", () => {
    for (const tier of ["sm", "md", "lg"] as const) {
      const floor = BREAKPOINTS[tier].px;
      expect(cell(tier, floor - 1)).toBe("none");
      expect(cell(tier, floor)).toBe("revert");
      expect(cell(tier, BREAKPOINTS.xl.px)).toBe("revert");
    }
  });

  it("the sm tier moved to the canon — 500px now hides what 1.x showed", () => {
    // The one threshold this task shifts: 1.x hid `sm` columns below 30rem/480px.
    expect(cell("sm", 500)).toBe("none");
    expect(cell("sm", 480)).toBe("none");
    expect(BREAKPOINTS.sm.px).toBe(640);
  });

  it("a table without data-responsive hides nothing — there is no container", () => {
    // No `container-name`, so no `@container` rule can match, and the base hide
    // is scoped to `[data-responsive]`. Both halves matter.
    expect(
      resolveDeepValue(rules, "table", "display", {
        subject: { "data-part": "td", "data-hide-below": "lg" },
      }),
    ).toBeUndefined();
    const base = rules.find(
      (r) =>
        r.container === null &&
        r.media === null &&
        r.selectors.some((s) => s.endsWith("[data-hide-below]")),
    );
    expect(base?.selectors[0]).toContain("[data-responsive]");
  });

  it("a controller-hidden column is not revealed by a widening container", () => {
    expect(cell("sm", BREAKPOINTS.xl.px, { "data-col-hidden": true })).toBe("none");
  });

  it("stacked mode still shows every column — the 1.x interaction, preserved", () => {
    for (const containerPx of [400, 800]) {
      expect(
        resolveDeepValue(rules, "table", "display", {
          root: { ...responsive, "data-stacked": true },
          subject: { "data-part": "td", "data-hide-below": "md" },
          containerPx,
        }),
      ).toBe("flex");
    }
  });

  it("the three container preludes ARE the canon's, rebuilt from the module", () => {
    const found = preludes(join(RECIPES, "table", "table.css"))
      .filter((p) => p.kind === "container")
      .map((p) => `@container ${p.text}`);
    expect(found).toEqual([
      containerQuery("sm", "faqir-table"),
      containerQuery("md", "faqir-table"),
      containerQuery("lg", "faqir-table"),
    ]);
  });

  it("tier blocks are declared in ascending order — the ladder reads mobile-first", () => {
    const floors = (rules.filter((r) => r.container) as CascadeRule[])
      .map((r) => Number(/min-width:\s*([\d.]+)rem/.exec(r.container!)![1]));
    expect(floors).toEqual([...floors].sort((a, b) => a - b));
  });
});

// ── 3 · table's controller — one ladder, no second source of truth ──────────

describe("table controller · STACK_BREAKPOINTS is the canon", () => {
  const CANON_PX = { sm: BREAKPOINTS.sm.px, md: BREAKPOINTS.md.px, lg: BREAKPOINTS.lg.px };

  /** The literal object out of a source file, parsed rather than imported. */
  function stackBreakpoints(source: string): Record<string, number> {
    const m = /const STACK_BREAKPOINTS = \{([^}]*)\}/.exec(source);
    expect(m).not.toBeNull();
    const out: Record<string, number> = {};
    for (const pair of m![1].matchAll(/([a-z]+)\s*:\s*(\d+)/g)) out[pair[1]] = Number(pair[2]);
    return out;
  }

  it("the recipe source carries the canon px values", () => {
    expect(stackBreakpoints(readFileSync(join(RECIPES, "table", "table.js"), "utf8"))).toEqual(
      CANON_PX,
    );
  });

  it("so does the built engine — the bundle cannot drift from the recipe", () => {
    for (const build of ["faqir-core.js", "faqir-core.dev.js"]) {
      expect(stackBreakpoints(readFileSync(join(ROOT, "registry", "core", build), "utf8"))).toEqual(
        CANON_PX,
      );
    }
  });

  it("and so do the framework bindings' vendored controllers", () => {
    for (const pkg of ["react", "vue"]) {
      const src = join(ROOT, "packages", pkg, "src", "controllers", "table.ts");
      expect(stackBreakpoints(readFileSync(src, "utf8"))).toEqual(CANON_PX);
    }
  });

  it("the manifest declares the same tiers the CSS and the controller use", () => {
    const manifest = JSON.parse(
      readFileSync(join(RECIPES, "table", "table.manifest.json"), "utf8"),
    );
    const tiers = Object.keys(CANON_PX);
    expect(manifest.props["stack-below"].values).toEqual(tiers);
    expect(manifest.props["hide-below"].values).toEqual(tiers);
    expect(manifest.props["stack-below"].default).toBe("md");
    // Every declared tier is a canon tier — no private fifth step can appear.
    for (const tier of tiers) expect(TIERS).toContain(tier as (typeof TIERS)[number]);
  });

  it("the threshold shift is recorded as breaking, for 1.0-03", () => {
    const manifest = JSON.parse(
      readFileSync(join(RECIPES, "table", "table.manifest.json"), "utf8"),
    );
    // Pinned to 3.0.0 rather than to `manifest.version`: 0.8-10 added a 3.1.0
    // entry (twenty attributes declared) and the entry that carries the canon
    // migration is the major one, wherever the version ends up.
    const entry = manifest.changes.find((c: { version: string }) => c.version === "3.0.0");
    expect(entry.breaking).toBe(true);
    expect(entry.note).toContain("data-stack-below");
    expect(entry.note).toContain("data-hide-below");
  });
});

// ── 3 · table's controller, driven — stack mode engages at the canon value ──

describe("table controller · stack mode engages at the declared tier", () => {
  const html = (tier: string) => `
    <div data-ui="table" data-responsive="stack" data-stack-below="${tier}">
      <table data-part="table">
        <thead data-part="thead"><tr data-part="tr"><th data-part="th" scope="col">Name</th></tr></thead>
        <tbody data-part="tbody"><tr data-part="tr"><td data-part="td">Alice</td></tr></tbody>
      </table>
    </div>`;

  /** Mount at a mocked width and let the init measurement run. */
  async function stackedAt(tier: string, widthPx: number): Promise<boolean> {
    document.body.innerHTML = html(tier);
    const root = document.querySelector("[data-ui='table']") as HTMLElement;
    Object.defineProperty(root, "clientWidth", { value: widthPx, configurable: true });
    const api = createTable(root);
    await new Promise((r) => setTimeout(r, 20));
    const stacked = root.hasAttribute("data-stacked");
    api.destroy();
    return stacked;
  }

  for (const tier of ["sm", "md", "lg"] as const) {
    it(`data-stack-below="${tier}" stacks under ${BREAKPOINTS[tier].px}px and not at it`, async () => {
      expect(await stackedAt(tier, BREAKPOINTS[tier].px - 1)).toBe(true);
      expect(await stackedAt(tier, BREAKPOINTS[tier].px)).toBe(false);
    });
  }

  it("sm stacks at 500px, which the 1.x 480 ladder did not", async () => {
    expect(await stackedAt("sm", 500)).toBe(true);
  });

  it("a raw pixel escape hatch still works — the 1.x sm value is reachable", async () => {
    expect(await stackedAt("480", 500)).toBe(false);
    expect(await stackedAt("480", 470)).toBe(true);
  });
});
