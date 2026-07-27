// Contract for the `stats-dashboard` pattern (task 0.7-09).
//
// A reporting page assembled out of components that already exist: the grid
// primitive holding stat cards, card panels, and the table recipe carrying its
// formatting contract. There is no controller, so what has to be pinned is the
// composition itself:
//
//   · zero JavaScript — no controller file, no <script>, no inline handler and
//     no reactive directive anywhere in the reference page;
//   · the page passes the same audit the CLI runs on a user project, including
//     the document-level rules;
//   · the manifest describes what the markup does — every declared slot is
//     used, every used slot is declared, every nested component is listed;
//   · the report table really is the *enhanced* table: formats declared on the
//     headers and repeated on the cells, raw data-value on numeric cells, and a
//     tfoot whose authored totals equal the sum of the column they aggregate;
//   · the responsive behaviour is real CSS — the KPI row delegates to grid.css
//     and the panel region splits at the canon lg floor (task 0.8-09 put this
//     sheet on the canon mobile-first: the stack is now the base, the split the
//     override, and both claims are resolved through the cascade helper).

import { describe, it, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { validateManifest, type Manifest } from "../../src/manifest";
import { extractComponents, parseDocument } from "../../src/parser/html-parser";
import { DOCUMENT_RULES } from "../../src/audit/rules";
import { BREAKPOINTS, TIERS, minWidth } from "../../src/utils/breakpoints";
import { buildMatrix, discoverComponents, SCHEMES } from "../visual/matrix";
import { buildA11yMatrix, A11Y_THEMES } from "../a11y/a11y-matrix";
import { collectRules, resolve, resolveDeepValue } from "../helpers/css-cascade";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const DIR = join(REGISTRY, "patterns", "stats-dashboard");

const HTML = readFileSync(join(DIR, "stats-dashboard.html"), "utf8");
const CSS = readFileSync(join(DIR, "stats-dashboard.css"), "utf8");
const MANIFEST = JSON.parse(
  readFileSync(join(DIR, "stats-dashboard.manifest.json"), "utf8"),
) as Manifest;

const manifests = await loadRegistryManifestMap(REGISTRY);

const componentsNamed = (name: string) =>
  extractComponents(HTML, "stats-dashboard.html").filter((c) => c.name === name);

/** The reference page mounted in a real DOM, for the table arithmetic. */
function mount(): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = HTML;
  return host;
}

/** Registry directory of a component, whatever kind it is. */
function componentDir(name: string): string | null {
  for (const kind of ["primitives", "recipes", "patterns"]) {
    const dir = join(REGISTRY, kind, name);
    if (existsSync(dir)) return dir;
  }
  return null;
}

describe("stats-dashboard — zero JavaScript", () => {
  it("ships no controller and no script", () => {
    expect(readdirSync(DIR).sort()).toEqual(
      ["stats-dashboard.css", "stats-dashboard.html", "stats-dashboard.manifest.json"].sort(),
    );
    expect(MANIFEST.files.js).toBeUndefined();
    expect(MANIFEST.kind).toBe("pattern");

    expect(HTML).not.toContain("<script");
    expect(HTML).not.toMatch(/\son[a-z]+\s*=/);
    expect(HTML).not.toMatch(/\sl-[a-z]+[=\s]/);
    expect(HTML).not.toMatch(/\s[:@][a-z-]+\s*=\s*"/);
  });
});

describe("stats-dashboard — reference page is audit-clean", () => {
  it("has zero component findings", () => {
    expect(
      auditHtmlSource({
        source: HTML,
        file: "registry/patterns/stats-dashboard/stats-dashboard.html",
        manifests,
      }),
    ).toEqual([]);
  });

  it("has zero document-rule findings", () => {
    const doc = parseDocument(HTML, "stats-dashboard.html");
    expect(DOCUMENT_RULES.flatMap((rule) => rule.check(doc))).toEqual([]);
  });

  it("manifest validates", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
  });
});

describe("stats-dashboard — manifest documents composition and slots", () => {
  it("declares every slot the reference page uses, and uses every slot it declares", () => {
    const declared = new Set(Object.keys(MANIFEST.slots));
    const used = new Set(
      componentsNamed("stats-dashboard").flatMap((c) => Object.keys(c.parts)),
    );
    expect([...used].filter((p) => !declared.has(p))).toEqual([]);
    expect([...declared].filter((p) => !used.has(p))).toEqual([]);
  });

  it("lists the components it actually nests, and they all exist in the registry", () => {
    const nested = new Set(
      extractComponents(HTML, "stats-dashboard.html")
        .map((c) => c.name)
        .filter((n) => n !== "stats-dashboard"),
    );
    for (const declared of MANIFEST.composition.contains) {
      expect(componentDir(declared), `${declared} is a registry component`).not.toBeNull();
      expect(nested.has(declared), `reference page nests ${declared}`).toBe(true);
    }
    for (const actual of nested) {
      expect(MANIFEST.composition.contains, `manifest documents nested ${actual}`).toContain(actual);
    }
  });

  it("spells out the slot expectations an agent needs", () => {
    for (const [name, slot] of Object.entries(MANIFEST.slots)) {
      expect(slot.description?.length ?? 0, `slot ${name} has a description`).toBeGreaterThan(20);
      expect(slot.selector).toBe(`[data-part='${name}']`);
    }
    const notes = ((MANIFEST.composition as unknown as { notes?: string[] }).notes ?? []).join(" ");
    expect(notes).toContain("data-part");
  });

  it("documents the data shape an agent binds — metrics, rows and totals", () => {
    const shape = (MANIFEST as unknown as { data_shape?: Record<string, any> }).data_shape;
    expect(shape, "manifest declares data_shape").toBeDefined();
    for (const key of ["metrics", "table_rows", "table_totals"]) {
      expect(shape![key]?.target, `data_shape.${key} names its target selector`).toContain("data-part");
      expect(Object.keys(shape![key].item).length).toBeGreaterThan(1);
    }
    // The two attributes an agent gets wrong first.
    expect(JSON.stringify(shape!.table_rows.item)).toContain("data-value");
    expect(JSON.stringify(shape!.table_totals.item)).toContain("data-aggregate");
  });
});

describe("stats-dashboard — swept by the visual and a11y matrices", () => {
  it("is discovered as a pattern reference page", () => {
    const found = discoverComponents().find((c) => c.name === "stats-dashboard");
    expect(found, "stats-dashboard discovered").toBeDefined();
    expect(found!.kind).toBe("pattern");
    expect(found!.htmlRel).toBe("registry/patterns/stats-dashboard/stats-dashboard.html");
  });

  it("is captured in both schemes across every theme", () => {
    const cases = buildMatrix().filter((c) => c.component.name === "stats-dashboard");
    expect(new Set(cases.map((c) => c.theme)).size).toBeGreaterThanOrEqual(2);
    expect([...new Set(cases.map((c) => c.scheme))].sort()).toEqual([...SCHEMES].sort());
  });

  it("is scanned by axe in both schemes on the default and contrast themes", () => {
    const cases = buildA11yMatrix().filter((c) => c.component.name === "stats-dashboard");
    expect(cases.length).toBe(A11Y_THEMES.length * SCHEMES.length);
    expect([...new Set(cases.map((c) => c.theme))].sort()).toEqual([...A11Y_THEMES].sort());
    expect([...new Set(cases.map((c) => c.scheme))].sort()).toEqual([...SCHEMES].sort());
  });
});

describe("stats-dashboard — structure", () => {
  it("is a section named by its own heading", () => {
    const pages = componentsNamed("stats-dashboard");
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.root.tag).toBe("section");
      const heading = page.parts["heading"][0];
      expect(heading.tag).toBe("h2");
      expect(page.root.attrs["aria-labelledby"]).toBe(heading.attrs["id"]);
    }
  });

  it("builds the KPI row out of the grid primitive, mobile-first", () => {
    for (const page of componentsNamed("stats-dashboard")) {
      const metrics = page.parts["metrics"][0];
      expect(metrics.attrs["data-ui"]).toBe("grid");
      // Column count is the grid's vocabulary, not this pattern's — and since
      // grid 2.0 it reads mobile-first: one column is the base, the tiers widen.
      expect(metrics.attrs["data-cols"]).toBe("1");
      expect(metrics.attrs["data-cols-md"]).toBeTruthy();
      expect(MANIFEST.variants).toEqual({});
    }
  });

  it("keeps the metric stats out of the part namespace", () => {
    // Slot ownership: the nearest data-ui ancestor of a metric is the grid, so a
    // data-part there would be an orphan part of grid (which declares no slots).
    for (const page of componentsNamed("stats-dashboard")) {
      const stats = page.parts["metrics"][0].children.filter(
        (el) => el.attrs["data-ui"] === "stat",
      );
      expect(stats.length).toBeGreaterThan(2);
      for (const stat of stats) {
        expect(stat.attrs["data-part"]).toBeUndefined();
        expect(stat.attrs["data-variant"]).toBe("card");
        expect(["up", "down", "neutral"]).toContain(stat.attrs["data-trend"]);
      }
    }
  });

  it("states every trend in words as well as in colour", () => {
    const host = mount();
    for (const stat of host.querySelectorAll('[data-part="metrics"] > [data-ui="stat"]')) {
      const change = stat.querySelector('[data-part="change"]');
      expect(change, "every metric carries a change line").not.toBeNull();
      expect(change!.textContent!.trim().length).toBeGreaterThan(2);
    }
  });

  it("builds every report panel from the card primitive", () => {
    const cardSlots = new Set(Object.keys(manifests.get("card")!.slots));
    for (const page of componentsNamed("stats-dashboard")) {
      expect(page.parts["report"].length).toBeGreaterThan(0);
      for (const report of page.parts["report"]) {
        expect(report.attrs["data-ui"]).toBe("card");
        expect(report.tag).toBe("section");
        expect(report.attrs["aria-labelledby"]).toBeTruthy();
      }
    }
    // Inside a panel the nearest data-ui ancestor is the card, so every part
    // there must be one of the card's own slots.
    for (const card of extractComponents(HTML, "stats-dashboard.html").filter((c) => c.name === "card")) {
      for (const part of Object.keys(card.parts)) {
        expect(cardSlots.has(part), `[data-part="${part}"] belongs to card`).toBe(true);
      }
    }
  });
});

describe("stats-dashboard — composes the enhanced table", () => {
  const host = mount();
  const tables = [...host.querySelectorAll('[data-ui="table"]')];

  it("puts a real table recipe in a report panel", () => {
    expect(tables.length).toBeGreaterThan(1);
    for (const table of tables) {
      expect(table.closest('[data-part="report"]')).not.toBeNull();
      expect(table.querySelector('[data-part="table"]')!.tagName.toLowerCase()).toBe("table");
    }
  });

  it("captions every report table and scopes every header cell", () => {
    for (const table of tables) {
      const caption = table.querySelector("caption");
      expect(caption, "table has a caption").not.toBeNull();
      expect(caption!.textContent!.trim().length).toBeGreaterThan(10);
      for (const th of table.querySelectorAll('[data-part="th"]')) {
        expect(th.getAttribute("scope")).toBe("col");
      }
    }
  });

  it("repeats each column's data-format on that column's body cells", () => {
    for (const table of tables) {
      const headers = [...table.querySelectorAll('[data-part="thead"] [data-part="th"]')];
      const formats = headers.map((th) => th.getAttribute("data-format"));
      expect(formats.some(Boolean), "the table declares formats").toBe(true);

      for (const row of table.querySelectorAll('[data-part="tbody"] > [data-part="tr"]')) {
        const cells = [...row.querySelectorAll('[data-part="td"]')];
        expect(cells.length).toBe(headers.length);
        cells.forEach((cell, i) => {
          expect(cell.getAttribute("data-format"), `column ${i} format matches its header`).toBe(
            formats[i],
          );
        });
      }
    }
  });

  it("carries the raw number on every formatted body cell", () => {
    for (const table of tables) {
      for (const cell of table.querySelectorAll('[data-part="tbody"] [data-part="td"][data-format]')) {
        const raw = cell.getAttribute("data-value");
        expect(raw, `${cell.textContent} carries data-value`).not.toBeNull();
        expect(Number.isNaN(Number(raw))).toBe(false);
        // The authored text is the no-JS fallback for that same number.
        expect(cell.textContent!.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("totals each aggregated column in the tfoot, and the authored totals add up", () => {
    let checked = 0;
    for (const table of tables) {
      const tfoot = table.querySelector('[data-part="tfoot"]');
      expect(tfoot, "the report table has a footer").not.toBeNull();

      for (const total of tfoot!.querySelectorAll('[data-part="td"][data-aggregate]')) {
        expect(total.getAttribute("data-aggregate")).toBe("sum");
        const col = Number(total.getAttribute("data-col"));
        expect(Number.isInteger(col), "an aggregate names its column index").toBe(true);

        let sum = 0;
        for (const row of table.querySelectorAll('[data-part="tbody"] > [data-part="tr"]')) {
          // The footer reads a whole column by index; the body cells opt into
          // nothing, they just carry the raw number.
          const cell = [...row.querySelectorAll('[data-part="td"]')][col];
          expect(cell.hasAttribute("data-aggregate"), `body cell ${col} declares no aggregate`).toBe(false);
          const raw = cell.getAttribute("data-value");
          expect(raw, `column ${col} is numeric all the way down`).not.toBeNull();
          sum += Number(raw);
        }

        // The authored footer must agree with the column it claims to total —
        // table.js recomputes it live, and the two may not disagree on ship.
        const authored = Number(total.textContent!.replace(/[^0-9.-]/g, ""));
        expect(authored, `tfoot total of column ${col}`).toBeCloseTo(sum, 2);
        checked++;
      }
    }
    expect(checked, "at least one live-aggregating total per table").toBeGreaterThanOrEqual(tables.length);
  });
});

describe("stats-dashboard — responsive behaviour", () => {
  it("delegates the KPI columns to the grid primitive", () => {
    // No column rule for the metrics row anywhere in this sheet: the 4 → 2 → 1
    // collapse is grid.css reacting to data-cols/data-cols-md/data-cols-lg.
    expect(CSS).not.toMatch(/\[data-part="metrics"\][^{]*\{[^}]*grid-template-columns/);
    const gridCss = readFileSync(join(REGISTRY, "primitives", "grid", "grid.css"), "utf8");
    expect(gridCss).toContain('[data-cols-md="2"]');
  });

  it("resolves the KPI collapse 4 → 2 → 1 through the rewritten grid", () => {
    // The authored attributes of the revenue page's metrics row, resolved
    // against grid.css itself — the mobile-first inversion of task 0.8-04 read
    // top-down: 1 on a phone, 2 from md, the full 4 from lg.
    const rules = collectRules(
      readFileSync(join(REGISTRY, "primitives", "grid", "grid.css"), "utf8"),
    );
    const metrics = componentsNamed("stats-dashboard")[0].parts["metrics"][0];
    const attrs = Object.fromEntries(
      Object.entries(metrics.attrs).filter(([name]) => name.startsWith("data-cols")),
    );
    const columnsAt = (width: number) =>
      resolve(rules, "grid", attrs, "grid-template-columns", width);

    expect(columnsAt(390)).toBe("repeat(1, 1fr)");
    // The 1.x range pair (max-width: 640px / min-width: 641px) matched neither
    // at 640.5px; the min-width canon leaves no such dead zone.
    expect(columnsAt(640.5)).toBe("repeat(1, 1fr)");
    expect(columnsAt(BREAKPOINTS.md.px)).toBe("repeat(2, 1fr)");
    expect(columnsAt(BREAKPOINTS.lg.px)).toBe("repeat(4, 1fr)");
    expect(columnsAt(1440)).toBe("repeat(4, 1fr)");

    // The support page's shorter ladder: 1 on a phone, 3 from md up.
    const support = componentsNamed("stats-dashboard")[1].parts["metrics"][0];
    const supportAttrs = Object.fromEntries(
      Object.entries(support.attrs).filter(([name]) => name.startsWith("data-cols")),
    );
    expect(resolve(rules, "grid", supportAttrs, "grid-template-columns", 390)).toBe("repeat(1, 1fr)");
    expect(resolve(rules, "grid", supportAttrs, "grid-template-columns", BREAKPOINTS.md.px)).toBe(
      "repeat(3, 1fr)",
    );
  });

  it("stacks the report panels until lg, then splits them 2fr 1fr", () => {
    const rules = collectRules(CSS);
    const columns = (widthPx: number) =>
      resolveDeepValue(rules, "stats-dashboard", "grid-template-columns", {
        subject: { "data-part": "reports" },
        widthPx,
      });
    // Mobile-first (0.8-09): the stack is the base rule, the split is the lg
    // override — a report table needs the width long before a KPI card does,
    // which is why this region gains its second column a tier later than the
    // metrics row above it.
    expect(columns(390)).toBe("1fr");
    expect(columns(BREAKPOINTS.md.px)).toBe("1fr");
    expect(columns(BREAKPOINTS.lg.px - 1)).toBe("1fr");
    expect(columns(BREAKPOINTS.lg.px)).toBe("2fr 1fr");

    const base = rules.find(
      (r) =>
        r.media === null && r.selectors.some((s) => s.endsWith('[data-part="reports"]')),
    );
    expect(base?.decls["grid-template-columns"]).toBe("1fr");
  });

  it("opens up the page frame at sm", () => {
    const rules = collectRules(CSS);
    const padding = (widthPx: number) =>
      resolve(rules, "stats-dashboard", {}, "padding-inline", widthPx);
    expect(padding(390)).toBe("var(--space-4)");
    expect(padding(BREAKPOINTS.sm.px - 1)).toBe("var(--space-4)");
    expect(padding(BREAKPOINTS.sm.px)).toBe("var(--space-6)");
  });

  it("stays on the canon, in mobile-first form", () => {
    const canon = new Set(TIERS.map((t) => minWidth(t)));
    const queries = [...CSS.replace(/\/\*[^]*?\*\//g, "").matchAll(/@media \(([^)]+)\)/g)].map(
      (m) => m[1],
    );
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      if (!/width/.test(query)) {
        expect(query, `stats-dashboard: ${query}`).toBe("prefers-reduced-motion: reduce");
        continue;
      }
      expect([...canon], `stats-dashboard: ${query}`).toContain(query);
    }
  });

  it("uses logical properties throughout", () => {
    expect(CSS).not.toMatch(/(^|[\s;{])(margin|padding|border)-(left|right)\s*:/);
    expect(CSS).not.toMatch(/text-align:\s*(left|right)/);
    expect(CSS).toContain("padding-inline");
    expect(CSS).toContain("min-inline-size");
  });
});
