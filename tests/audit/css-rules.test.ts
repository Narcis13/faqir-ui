// ═══════════════════════════════════════════════════════════════════════════
// The stylesheet contract rules — undeclared-attribute + breakpoint-canon [0.8-10]
// ═══════════════════════════════════════════════════════════════════════════
//
// Two rules, three kinds of assertion:
//
//   1. UNITS over hand-written sheets — the shapes that actually occur in the
//      registry and that a naive regex would miss: a bareword boolean
//      (`[data-wrap]`), an attribute on a child (`> [data-span]`), one inside a
//      functional pseudo-class (`:not([data-col-hidden])`), a tier-suffixed form
//      of a group that never declared itself responsive, and the exemptions —
//      `[dir="rtl"]`, `[disabled]`, `aria-*`, and the protocol's own data-ui /
//      data-part. Both directions are tested: what the rule catches AND what it
//      must stay silent about, because a rule that fires on `[dir="rtl"]` would
//      have to be turned off, and a rule that is off finds nothing.
//
//   2. THE SWEEP — both rules at zero over all 86 registry components, run
//      exactly the way `bun run audit:registry` runs them (manifest + the sheet
//      its `files.css` names). This is the acceptance bar, not a baseline file:
//      the number that may appear here is 0.
//
//   3. THE SEEDED VIOLATION — take a real, clean component, break it in one
//      character, and prove the rule fires. A gate nobody has watched fail is a
//      gate nobody knows is wired up.
//
// Parity with the browser bundle is proven separately, in
// tests/generator/audit-browser.test.ts, against the committed bytes.

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { Glob } from "bun";
import {
  BREAKPOINT_CANON_RULE,
  CSS_RULES,
  UNDECLARED_ATTRIBUTE_RULE,
  buildBreakpointCanonResults,
  buildUndeclaredAttributeResults,
  declaredAttributes,
} from "../../src/audit/css-rules";
import { getRuleInventory } from "../../src/audit/rules";
import { findAtRulePreludes, findSelectedAttributes } from "../../src/parser/css-parser";
import { BREAKPOINTS, TIERS, minWidth, mediaQuery, containerQuery } from "../../src/utils/breakpoints";
import type { Manifest } from "../../src/manifest";

const REGISTRY = join(import.meta.dir, "../..", "registry");

/** A minimal manifest carrying only what these rules read. */
function manifest(partial: Partial<Manifest>): Manifest {
  return {
    name: "probe",
    version: "1.0.0",
    kind: "primitive",
    category: "layout",
    description: "probe",
    anatomy: { tag: "div", selector: "[data-ui='probe']", content_model: "block" },
    slots: {},
    variants: {},
    states: {},
    a11y: {},
    tokens_used: [],
    templates: {},
    safe_transforms: [],
    unsafe_transforms: [],
    composition: { contains: [], used_in: [] },
    files: { css: "probe.css", html: "probe.html", manifest: "probe.manifest.json" },
    tests: [],
    ...partial,
  } as Manifest;
}

const undeclared = (css: string, m: Manifest = manifest({})) =>
  buildUndeclaredAttributeResults(css, m, "probe.css").map((r) => r.message);

/** Just the attribute names a sheet is flagged for, in order. */
function flagged(css: string, m: Manifest = manifest({})): string[] {
  return buildUndeclaredAttributeResults(css, m, "probe.css").map(
    (r) => /^"([^"]+)"/.exec(r.message)![1],
  );
}

const canon = (css: string) =>
  buildBreakpointCanonResults(css, "probe", "probe.css").map((r) => r.message);

// ── 0 · the rules are in the inventory ──────────────────────────────────────

describe("both rules are shipped, described and inventoried", () => {
  it("appears in the CLI rule inventory with a description that names the fix", () => {
    const ids = getRuleInventory().map((r) => r.id);
    expect(ids).toContain("undeclared-attribute");
    expect(ids).toContain("breakpoint-canon");
    expect(CSS_RULES.map((r) => r.id)).toEqual(["undeclared-attribute", "breakpoint-canon"]);
  });

  it("declares its scope and its exemptions as data, not as prose elsewhere", () => {
    expect(UNDECLARED_ATTRIBUTE_RULE.applies_to).toContain("manifest");
    expect(UNDECLARED_ATTRIBUTE_RULE.exempt?.join(" ")).toContain("data-part");
    expect(BREAKPOINT_CANON_RULE.exempt?.join(" ")).toContain("prefers-reduced-motion");
    // The canon values in the description are derived, never re-typed.
    for (const tier of TIERS) {
      expect(BREAKPOINT_CANON_RULE.description).toContain(`${tier} ${BREAKPOINTS[tier].rem}rem`);
    }
  });
});

// ── 1 · undeclared-attribute — the shapes it must catch ─────────────────────

describe("undeclared-attribute · catches", () => {
  it("a bareword boolean — the 0.7-20 species, [data-wrap]", () => {
    const messages = undeclared('[data-ui="probe"][data-wrap] { flex-wrap: wrap; }');
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('"data-wrap"');
    expect(messages[0]).toContain("no variant, prop or state");
  });

  it("an attribute on a child element", () => {
    expect(flagged('[data-ui="probe"] > [data-span="2"] { grid-column: span 2; }')).toEqual([
      "data-span",
    ]);
    expect(flagged('[data-ui="probe"] [data-part="cell"][data-align="end"] { }')).toEqual([
      "data-align",
    ]);
  });

  it("an attribute buried in :not() / :has()", () => {
    expect(flagged('[data-ui="probe"]:has([data-dragging]) { user-select: none; }')).toEqual([
      "data-dragging",
    ]);
    expect(flagged('[data-ui="probe"] [data-part="td"]:not([data-col-hidden]) { }')).toEqual([
      "data-col-hidden",
    ]);
  });

  it("a tier suffix of a group that never declared itself responsive", () => {
    const m = manifest({
      variants: { cols: { values: ["1", "2"], default: "1", attr: "data-cols" } },
    });
    const messages = undeclared(
      `[data-ui="probe"][data-cols="2"] { }\n@media (${minWidth("md")}) {\n  [data-ui="probe"][data-cols-md="2"] { }\n}`,
      m,
    );
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('"data-cols-md"');
    // The hint names the one-word fix rather than restating the problem.
    expect(messages[0]).toContain('"responsive": true');
  });

  it("a suffixed protocol attribute, with the reason it can never be declared", () => {
    const messages = undeclared('[data-ui="probe"][data-size-md="lg"] { }');
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("the responsive grammar never applies to a protocol attribute");
  });

  it("reports one finding per attribute, at its first line", () => {
    const css = [
      "/* a comment that must not shift the line numbers",
      "   across three lines */",
      '[data-ui="probe"][data-stacked] { display: block; }',
      '[data-ui="probe"][data-stacked] [data-part="row"] { display: flex; }',
    ].join("\n");
    const results = buildUndeclaredAttributeResults(css, manifest({}), "probe.css");
    expect(results.length).toBe(1);
    expect(results[0].line).toBe(3);
    expect(results[0].rule_id).toBe("undeclared-attribute");
    expect(results[0].severity).toBe("error");
    expect(results[0].component_name).toBe("probe");
  });
});

// ── 1b · undeclared-attribute — what it must stay silent about ──────────────

describe("undeclared-attribute · stays silent for", () => {
  it("the protocol's own structural attributes", () => {
    expect(
      flagged('[data-ui="probe"] [data-part="header"] { } [data-part="body"] > [data-ui="card"] { }'),
    ).toEqual([]);
  });

  it("a [dir]-scoped rule and every other non-data attribute", () => {
    const css = [
      '[dir="rtl"] [data-ui="probe"] { margin-left: 0; }',
      '[data-ui="probe"] [disabled] { opacity: 0.5; }',
      '[data-ui="probe"] [aria-expanded="true"] { }',
      '[data-ui="probe"] [hidden] { display: none; }',
      '[data-ui="probe"] input[type="checkbox"] { }',
    ].join("\n");
    expect(flagged(css)).toEqual([]);
  });

  it("every way a manifest can declare an attribute", () => {
    const m = manifest({
      variants: {
        cols: { values: ["1", "2"], default: "1", attr: "data-cols", responsive: true },
        tone: { values: ["a"], default: "a", attr: "data-variant" },
      },
      props: {
        wrap: { type: "boolean", description: "…", attr: "data-wrap" },
        gutter: { type: "enum", description: "…", values: ["0"] }, // no attr → data-gutter
      },
      states: {
        open: { attr: 'data-state="open"' },
        highlighted: { attr: "data-highlighted" },
        disabled: { attr: "disabled" },
      },
    });
    const css = [
      '[data-ui="probe"][data-cols="2"] { }',
      `@media (${minWidth("xl")}) { [data-ui="probe"][data-cols-xl="2"] { } }`,
      '[data-ui="probe"][data-variant="a"] { }',
      '[data-ui="probe"][data-wrap] { }',
      '[data-ui="probe"][data-gutter="0"] { }',
      '[data-ui="probe"][data-state="open"] { }',
      '[data-ui="probe"] [data-part="option"][data-highlighted] { }',
    ].join("\n");
    expect(flagged(css, m)).toEqual([]);

    // …and the declared set is exactly those attributes, tiers included.
    const declared = declaredAttributes(m);
    for (const tier of TIERS) expect(declared.has(`data-cols-${tier}`)).toBe(true);
    expect(declared.has("data-gutter")).toBe(true);
    expect(declared.has("data-state")).toBe(true);
    expect(declared.has("disabled")).toBe(true);
  });

  it("an attribute that appears only in an at-rule prelude, never in a selector", () => {
    // `@container` conditions are not selectors; a rule that scanned raw text
    // would flag `style(--data-x)` shapes and preludes generally.
    const css = `@media (${minWidth("sm")}) { [data-ui="probe"] { color: red; } }`;
    expect(flagged(css)).toEqual([]);
  });

  it("declarations that merely look like selectors", () => {
    // A value containing brackets must not be read as an attribute condition.
    const css = '[data-ui="probe"] { grid-template-areas: "[data-nope] a"; content: "[data-x]"; }';
    expect(flagged(css)).toEqual([]);
  });
});

// ── 2 · breakpoint-canon ────────────────────────────────────────────────────

describe("breakpoint-canon · catches", () => {
  it("a max-width query, and says how to invert it", () => {
    const messages = canon("@media (max-width: 40rem) { [data-ui=\"probe\"] { display: none; } }");
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("min-width-only and mobile-first");
    expect(messages[0]).toContain("40rem");
  });

  it("a max-width container query", () => {
    expect(canon("@container faqir-table (max-width: 30rem) { td { display: block; } }").length).toBe(1);
  });

  it("an off-canon min-width — the value, not the form", () => {
    const messages = canon("@media (min-width: 900px) { [data-ui=\"probe\"] { } }");
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('"min-width: 900px" is not a canon floor');
    // Every canon floor is named in the finding, so the fix is in the message.
    for (const tier of TIERS) expect(messages[0]).toContain(`${tier} (${BREAKPOINTS[tier].rem}rem)`);
  });

  it("a canon value written in the wrong unit", () => {
    // 640px IS the sm floor at a 16px root — but the ladder is authored in rem
    // so it scales with the user's font size. The rule takes the authored form.
    expect(canon(`@media (min-width: ${BREAKPOINTS.sm.px}px) { }`).length).toBe(1);
  });

  it("a compound range prelude", () => {
    const messages = canon("@media (min-width: 40rem) and (max-width: 64rem) { }");
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("min-width-only");
  });

  it("pins the finding to the prelude's own line", () => {
    const css = ["/* header */", "", "@media (max-width: 48rem) {", "  [data-ui=\"probe\"] { }", "}"].join("\n");
    const results = buildBreakpointCanonResults(css, "probe", "probe.css");
    expect(results.length).toBe(1);
    expect(results[0].line).toBe(3);
    expect(results[0].rule_id).toBe("breakpoint-canon");
    expect(results[0].severity).toBe("warning");
  });
});

describe("breakpoint-canon · passes", () => {
  it("every canon floor, as a media query and as a container query", () => {
    for (const tier of TIERS) {
      expect(canon(`${mediaQuery(tier)} { [data-ui="probe"] { } }`)).toEqual([]);
      expect(canon(`${containerQuery(tier)} { [data-ui="probe"] { } }`)).toEqual([]);
      expect(canon(`${containerQuery(tier, "faqir-probe")} { [data-ui="probe"] { } }`)).toEqual([]);
    }
  });

  it("every prelude that carries no width at all — exempt by construction", () => {
    const exempt = [
      "@media (prefers-reduced-motion: reduce)",
      "@media (prefers-color-scheme: dark)",
      "@media (forced-colors: active)",
      "@media (hover: hover)",
      "@media print",
      "@media screen",
      "@media (orientation: landscape)",
      "@container (min-height: 20rem)",
    ];
    for (const prelude of exempt) {
      expect(canon(`${prelude} { [data-ui="probe"] { } }`), prelude).toEqual([]);
    }
  });

  it("a canon floor inside a nested at-rule", () => {
    expect(
      canon(`@media (prefers-color-scheme: dark) { ${mediaQuery("md")} { [data-ui="probe"] { } } }`),
    ).toEqual([]);
  });
});

// ── 2b · the parser primitives the rules stand on ───────────────────────────

describe("the selector/prelude scanners", () => {
  it("keeps the value of each attribute condition, quoted or not", () => {
    const found = findSelectedAttributes('[data-a="x"] [data-b] [data-c=y] [data-d~="z"] { }');
    expect(found.map((f) => [f.attr, f.value])).toEqual([
      ["data-a", "x"],
      ["data-b", null],
      ["data-c", "y"],
      ["data-d", "z"],
    ]);
  });

  it("reports the branch of a multi-line selector list the attribute is really on", () => {
    const css = ['[data-ui="probe"][data-a],', '[data-ui="probe"][data-b] {', "  color: red;", "}"].join("\n");
    expect(findSelectedAttributes(css).filter((f) => f.attr === "data-b")[0].line).toBe(2);
  });

  it("reads @media and @container preludes and nothing else", () => {
    const css = "@supports (display: grid) { @media (min-width: 40rem) { a { } } }";
    expect(findAtRulePreludes(css)).toEqual([
      { kind: "media", text: "(min-width: 40rem)", line: 1 },
    ]);
  });
});

// ── 3 · the sweep — the whole registry, at zero ─────────────────────────────

interface Component {
  name: string;
  rel: string;
  css: string;
  manifest: Manifest;
}

/** Every registry component paired with the stylesheet its manifest names. */
function registryComponents(): Component[] {
  const out: Component[] = [];
  for (const layer of ["primitives", "recipes", "patterns"]) {
    for (const rel of [...new Glob(`${layer}/*/*.manifest.json`).scanSync(REGISTRY)].sort()) {
      const m = JSON.parse(readFileSync(join(REGISTRY, rel), "utf8")) as Manifest;
      const cssRel = join(dirname(rel), m.files?.css ?? `${m.name}.css`);
      if (!existsSync(join(REGISTRY, cssRel))) continue;
      out.push({ name: m.name, rel: cssRel, css: readFileSync(join(REGISTRY, cssRel), "utf8"), manifest: m });
    }
  }
  return out;
}

const COMPONENTS = registryComponents();

describe("registry sweep · both rules at zero", () => {
  it("pairs every component with a stylesheet, including icon's icons.css", () => {
    // Guards the two sweeps below against passing vacuously, and pins the one
    // component whose sheet is not named after it.
    expect(COMPONENTS.length).toBe(86);
    const icon = COMPONENTS.find((c) => c.name === "icon");
    expect(icon?.rel).toBe(join("primitives", "icon", "icons.css"));
  });

  it("no component's CSS selects on an attribute its manifest never declares", () => {
    const offenders = COMPONENTS.flatMap((c) =>
      buildUndeclaredAttributeResults(c.css, c.manifest, c.rel).map((r) => `${c.rel}:${r.line} ${r.message}`),
    );
    expect(offenders).toEqual([]);
  });

  it("no component's CSS carries an off-canon width prelude", () => {
    const offenders = COMPONENTS.flatMap((c) =>
      buildBreakpointCanonResults(c.css, c.name, c.rel).map((r) => `${c.rel}:${r.line} ${r.message}`),
    );
    expect(offenders).toEqual([]);
  });

  it("the sweep really looked at width preludes — 25+ of them", () => {
    // Zero findings is only meaningful if there was something to find: without
    // this, deleting every @media in the registry would also pass.
    const widths = COMPONENTS.flatMap((c) => findAtRulePreludes(c.css)).filter((p) =>
      /width/.test(p.text),
    );
    expect(widths.length).toBeGreaterThan(25);
  });

  it("and at thousands of attribute conditions", () => {
    const attrs = COMPONENTS.flatMap((c) => findSelectedAttributes(c.css)).filter((a) =>
      a.attr.startsWith("data-"),
    );
    expect(attrs.length).toBeGreaterThan(1000);
  });
});

// ── 4 · seeded violations — the gate is wired up ────────────────────────────

describe("a seeded violation fails", () => {
  const table = COMPONENTS.find((c) => c.name === "table")!;
  const grid = COMPONENTS.find((c) => c.name === "grid")!;

  it("undeclared-attribute: one attribute removed from a real manifest", () => {
    // table declares data-stacked as a state; take that declaration away and the
    // rule finds the eleven rules that select on it — as one finding.
    const states = { ...table.manifest.states };
    delete (states as Record<string, unknown>)["stacked"];
    const crippled = { ...table.manifest, states } as Manifest;
    const results = buildUndeclaredAttributeResults(table.css, crippled, table.rel);
    expect(results.map((r) => /^"([^"]+)"/.exec(r.message)![1])).toEqual(["data-stacked"]);
  });

  it("undeclared-attribute: one new attribute added to a real stylesheet", () => {
    const seeded = grid.css + '\n[data-ui="grid"][data-dense] { grid-auto-flow: dense; }\n';
    const results = buildUndeclaredAttributeResults(seeded, grid.manifest, grid.rel);
    expect(results.map((r) => /^"([^"]+)"/.exec(r.message)![1])).toEqual(["data-dense"]);
    // …and the clean sheet it was seeded into is still clean.
    expect(buildUndeclaredAttributeResults(grid.css, grid.manifest, grid.rel)).toEqual([]);
  });

  it("breakpoint-canon: one canon floor flipped to max-width", () => {
    const seeded = grid.css.replace(`(${minWidth("md")})`, "(max-width: 48rem)");
    expect(seeded).not.toBe(grid.css); // the replacement really happened
    const results = buildBreakpointCanonResults(seeded, grid.name, grid.rel);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain("min-width-only");
  });

  it("breakpoint-canon: one canon floor nudged off the ladder", () => {
    const seeded = grid.css.replace(`(${minWidth("lg")})`, "(min-width: 65rem)");
    expect(seeded).not.toBe(grid.css);
    const results = buildBreakpointCanonResults(seeded, grid.name, grid.rel);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain("65rem");
  });
});
