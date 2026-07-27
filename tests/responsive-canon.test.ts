// ═══════════════════════════════════════════════════════════════════════════
// Responsive sweep A — primitives & recipes on the breakpoint canon  [0.8-08]
// ═══════════════════════════════════════════════════════════════════════════
//
// 0.8-01 wrote the canon down; this suite is what makes the registry obey it.
// Three kinds of assertion, in the order the task asks for them:
//
//   1. A SWEEP over every stylesheet under registry/primitives and
//      registry/recipes: no width prelude may say anything but a canon
//      `min-width`. Feature queries (reduced motion, colour scheme, forced
//      colours) and the print media type are exempt because they carry no
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

describe("canon sweep · registry/primitives + registry/recipes", () => {
  const files = [...stylesheets(PRIMITIVES), ...stylesheets(RECIPES)];
  const all = files.flatMap(preludes);
  // A prelude is about width if it mentions one at all; everything else
  // (prefers-reduced-motion, prefers-color-scheme, forced-colors, print) is a
  // feature or media-type query the canon has nothing to say about.
  const widthPreludes = all.filter((p) => /width/.test(p.text));

  it("sweeps a non-trivial number of sheets and preludes", () => {
    // Guards the whole section against passing vacuously if the walk breaks.
    expect(files.length).toBeGreaterThan(60);
    expect(widthPreludes.length).toBeGreaterThan(15);
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
    const entry = manifest.changes.find((c: { version: string }) => c.version === manifest.version);
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
