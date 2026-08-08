// Contract for the landing kit — the four composition-only patterns added in
// task 0.7-08: `hero`, `feature-grid`, `pricing`, and `site-footer`.
//
// They ship no controller, so there is no behaviour to drive here. What must be
// pinned instead is everything that makes them safe for an agent to compose:
//
//   · zero JavaScript — no controller file, no <script>, no inline handler, no
//     reactive directive anywhere in the reference pages;
//   · the reference pages pass the same audit the CLI runs on a user project,
//     including the document-level rules (ids, heading order, landmarks);
//   · the manifests actually describe what the markup does — every declared
//     slot appears, every composed component appears, required slots are there;
//   · the pages are swept by the visual and axe matrices in both colour schemes
//     across at least two themes (both matrices discover the registry at
//     runtime, so this asserts the discovery really picked them up rather than
//     duplicating the suites);
//   · the responsive column behaviour is real CSS on the breakpoint canon, not a
//     claim in prose — and since task 0.8-09 it is asserted by RESOLVING each
//     sheet at concrete viewport widths through the shared cascade helper rather
//     than by looking for strings inside a media block. That is what makes the
//     mobile-first inversion checkable: "one column at 390px" is a fact about
//     the cascade, whereas "the small block contains 1fr" was a fact about where
//     somebody typed a declaration.

import { describe, it, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { validateManifest, type Manifest } from "../../src/manifest";
import { extractComponents, parseDocument } from "../../src/parser/html-parser";
import { DOCUMENT_RULES } from "../../src/audit/rules";
import { BREAKPOINTS, TIERS, minWidth } from "../../src/utils/breakpoints";
import { collectRules, resolve, resolveDeepValue } from "../helpers/css-cascade";
import { buildMatrix, discoverComponents, SCHEMES } from "../visual/matrix";
import { buildA11yMatrix, A11Y_THEMES } from "../a11y/a11y-matrix";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");

/** The four patterns this task adds, in landing-page composition order. */
const LANDING_KIT = ["hero", "feature-grid", "pricing", "site-footer"] as const;
type KitPattern = (typeof LANDING_KIT)[number];

function dir(pattern: string): string {
  return join(REGISTRY, "patterns", pattern);
}

function html(pattern: string): string {
  return readFileSync(join(dir(pattern), `${pattern}.html`), "utf8");
}

function css(pattern: string): string {
  return readFileSync(join(dir(pattern), `${pattern}.css`), "utf8");
}

function manifest(pattern: string): Manifest {
  return JSON.parse(
    readFileSync(join(dir(pattern), `${pattern}.manifest.json`), "utf8"),
  ) as Manifest;
}

/** The sheet's rules, flattened, with their media scope attached. */
function rules(pattern: string) {
  return collectRules(css(pattern));
}

/**
 * The sheet with comments stripped — the sheets explain their own tier blocks in
 * prose, and a comment saying `@media (min-width: …)` is not a media query.
 */
function uncommented(pattern: string): string {
  return css(pattern).replace(/\/\*[^]*?\*\//g, "");
}

/**
 * `grid-template-columns` for a `[data-part]` of `pattern` at a viewport of
 * `widthPx`, resolved through the real cascade — specificity first, document
 * order to break ties, media rules only above their floor.
 */
function columnsAt(
  pattern: string,
  part: string,
  root: Record<string, string>,
  widthPx: number,
): string | undefined {
  return resolveDeepValue(rules(pattern), pattern, "grid-template-columns", {
    root,
    subject: { "data-part": part },
    widthPx,
  });
}

/** Elements of one component in a reference page, by data-ui name. */
function componentsNamed(source: string, name: string) {
  return extractComponents(source, `${name}.html`, (component, slot) =>
    manifests.get(component)?.slots?.[slot] !== undefined,
  ).filter((c) => c.name === name);
}

const manifests = await loadRegistryManifestMap(REGISTRY);

describe("landing kit — zero JavaScript", () => {
  for (const pattern of LANDING_KIT) {
    it(`${pattern} ships no controller and no script`, () => {
      const files = readdirSync(dir(pattern));
      expect(files.filter((f) => f.endsWith(".js"))).toEqual([]);
      expect(files.sort()).toEqual(
        [`${pattern}.css`, `${pattern}.html`, `${pattern}.manifest.json`].sort(),
      );

      const m = manifest(pattern);
      expect(m.files.js).toBeUndefined();
      expect(m.kind).toBe("pattern");

      const source = html(pattern);
      expect(source).not.toContain("<script");
      // Inline handlers (onclick=…) and reactive directives (l-data, @click,
      // :hidden) would all make the page depend on a runtime.
      expect(source).not.toMatch(/\son[a-z]+\s*=/);
      expect(source).not.toMatch(/\sl-[a-z]+[=\s]/);
      expect(source).not.toMatch(/\s[:@][a-z-]+\s*=\s*"/);
    });
  }
});

describe("landing kit — reference pages are audit-clean", () => {
  for (const pattern of LANDING_KIT) {
    it(`${pattern}.html has zero component findings`, () => {
      const file = `registry/patterns/${pattern}/${pattern}.html`;
      expect(auditHtmlSource({ source: html(pattern), file, manifests })).toEqual([]);
    });

    it(`${pattern}.html has zero document-rule findings`, () => {
      const doc = parseDocument(html(pattern), `${pattern}.html`);
      expect(DOCUMENT_RULES.flatMap((rule) => rule.check(doc))).toEqual([]);
    });

    it(`${pattern} manifest validates`, () => {
      expect(validateManifest(manifest(pattern))).toEqual([]);
    });
  }
});

describe("landing kit — manifests document composition and slots", () => {
  for (const pattern of LANDING_KIT) {
    it(`${pattern} declares every slot its reference page uses, and uses every slot it declares`, () => {
      const m = manifest(pattern);
      const declared = new Set(Object.keys(m.slots));
      const used = new Set(
        componentsNamed(html(pattern), pattern).flatMap((c) => Object.keys(c.parts)),
      );

      // Audit already rejects an undeclared part; the reverse — a documented
      // slot no reference page demonstrates — is what rots first.
      expect([...used].filter((p) => !declared.has(p))).toEqual([]);
      expect([...declared].filter((p) => !used.has(p))).toEqual([]);
    });

    it(`${pattern} lists the components it actually nests`, () => {
      const m = manifest(pattern);
      expect(m.composition.contains.length).toBeGreaterThan(0);
      expect(m.composition.used_in).toContain("landing-page");

      const nested = new Set(
        extractComponents(html(pattern), `${pattern}.html`)
          .map((c) => c.name)
          .filter((n) => n !== pattern),
      );
      for (const declared of m.composition.contains) {
        expect(existsSync(join(REGISTRY, "primitives", declared)), `${declared} is a registry component`).toBe(true);
        expect(nested.has(declared), `${pattern} reference page nests ${declared}`).toBe(true);
      }
      for (const actual of nested) {
        expect(m.composition.contains, `${pattern} manifest documents nested ${actual}`).toContain(actual);
      }
    });

    it(`${pattern} spells out the slot expectations an agent needs`, () => {
      const m = manifest(pattern);
      for (const [name, slot] of Object.entries(m.slots)) {
        expect(slot.description?.length ?? 0, `slot ${name} has a description`).toBeGreaterThan(20);
        expect(slot.selector).toBe(`[data-part='${name}']`);
      }
      // The nesting rule that decides where a data-part may live is the one
      // thing an agent cannot infer from the markup alone.
      const notes = ((m.composition as unknown as { notes?: string[] }).notes ?? []).join(" ");
      expect(notes).toContain("data-part");
      expect(notes).toContain("scaffold landing-page");
    });
  }
});

describe("landing kit — swept by the visual and a11y matrices", () => {
  const discovered = discoverComponents();

  for (const pattern of LANDING_KIT) {
    it(`${pattern} is discovered as a pattern reference page`, () => {
      const found = discovered.find((c) => c.name === pattern);
      expect(found, `${pattern} discovered`).toBeDefined();
      expect(found!.kind).toBe("pattern");
      expect(found!.htmlRel).toBe(`registry/patterns/${pattern}/${pattern}.html`);
    });

    it(`${pattern} is captured in both schemes across every theme`, () => {
      const cases = buildMatrix().filter((c) => c.component.name === pattern);
      const themes = new Set(cases.map((c) => c.theme));
      const schemes = new Set(cases.map((c) => c.scheme));
      expect(themes.size).toBeGreaterThanOrEqual(2);
      expect([...schemes].sort()).toEqual([...SCHEMES].sort());
    });

    it(`${pattern} is scanned by axe in both schemes across every theme`, () => {
      const cases = buildA11yMatrix().filter((c) => c.component.name === pattern);
      expect(cases.length).toBe(A11Y_THEMES.length * SCHEMES.length);
      expect([...new Set(cases.map((c) => c.theme))].sort()).toEqual([...A11Y_THEMES].sort());
      expect([...new Set(cases.map((c) => c.scheme))].sort()).toEqual([...SCHEMES].sort());
    });
  }
});

describe("landing kit — responsive column behaviour", () => {
  // A phone, the sm floor, the lg floor — the three widths every claim below is
  // made at. 390 is an iPhone 14; the other two come from the canon (0.8-01), so
  // if the ladder ever moves these move with it.
  const PHONE = 390;
  const SM = BREAKPOINTS.sm.px;
  const LG = BREAKPOINTS.lg.px;

  it("feature-grid goes 1 → 2 → its declared count", () => {
    // Mobile-first (0.8-09): data-cols names the WIDEST count, reached at lg —
    // grid's own semantics since 0.8-04, now shared by the pattern that borrowed
    // its vocabulary. One column on a phone regardless of what was declared.
    for (const cols of ["2", "3", "4"]) {
      const root = { "data-cols": cols };
      expect(columnsAt("feature-grid", "items", root, PHONE), `cols=${cols} @${PHONE}`).toBe("1fr");
      expect(columnsAt("feature-grid", "items", root, SM - 1)).toBe("1fr");
      expect(columnsAt("feature-grid", "items", root, SM)).toBe("repeat(2, 1fr)");
      expect(columnsAt("feature-grid", "items", root, LG)).toBe(`repeat(${cols}, 1fr)`);
      expect(columnsAt("feature-grid", "items", root, 1440)).toBe(`repeat(${cols}, 1fr)`);
    }
    // No data-cols at all: the manifest's default of three, from lg up.
    expect(columnsAt("feature-grid", "items", {}, PHONE)).toBe("1fr");
    expect(columnsAt("feature-grid", "items", {}, LG)).toBe("repeat(3, 1fr)");
  });

  it("pricing goes 1 → 2 → its declared count of tier columns", () => {
    for (const cols of ["2", "3"]) {
      const root = { "data-cols": cols };
      expect(columnsAt("pricing", "tiers", root, PHONE), `cols=${cols} @${PHONE}`).toBe("1fr");
      expect(columnsAt("pricing", "tiers", root, SM)).toBe("repeat(2, 1fr)");
      expect(columnsAt("pricing", "tiers", root, LG)).toBe(`repeat(${cols}, 1fr)`);
    }
    expect(columnsAt("pricing", "tiers", {}, LG)).toBe("repeat(3, 1fr)");
  });

  it("site-footer stacks its link columns, then pairs them, then makes three", () => {
    expect(columnsAt("site-footer", "columns", {}, PHONE)).toBe("1fr");
    expect(columnsAt("site-footer", "columns", {}, SM)).toBe("repeat(2, 1fr)");
    expect(columnsAt("site-footer", "columns", {}, LG)).toBe("repeat(3, 1fr)");

    // The brand column joins the link columns only at lg — a root-level rule, so
    // this one resolves against the component root rather than a part.
    const columnsVariant = { "data-variant": "columns" };
    const split = (widthPx: number) =>
      resolve(rules("site-footer"), "site-footer", columnsVariant, "grid-template-columns", widthPx);
    expect(split(PHONE)).toBe("1fr");
    expect(split(SM)).toBe("1fr");
    expect(split(LG)).toBe("minmax(16rem, 1fr) 2fr");
  });

  it("hero splits only at lg, and stacks its actions below sm", () => {
    const split = { "data-variant": "split" };
    const columns = (widthPx: number) =>
      resolve(rules("hero"), "hero", split, "grid-template-columns", widthPx);
    expect(columns(PHONE)).toBe("1fr");
    expect(columns(LG - 1)).toBe("1fr");
    expect(columns(LG)).toBe("1fr 1fr");

    const direction = (widthPx: number) =>
      resolveDeepValue(rules("hero"), "hero", "flex-direction", {
        subject: { "data-part": "actions" },
        widthPx,
      });
    expect(direction(PHONE)).toBe("column");
    expect(direction(SM - 1)).toBe("column");
    expect(direction(SM)).toBe("row");
  });

  it("the phone case is the base rule — nothing is undone by an override", () => {
    // The inversion, stated directly: at 390px no media rule has fired at all,
    // so every value above must come from an unconditional rule.
    const pairs: Array<[string, string, string]> = [
      ["feature-grid", "items", "grid-template-columns"],
      ["pricing", "tiers", "grid-template-columns"],
      ["site-footer", "columns", "grid-template-columns"],
      ["hero", "actions", "flex-direction"],
    ];
    for (const [pattern, part, property] of pairs) {
      const winner = rules(pattern).find(
        (r) =>
          r.media === null &&
          r.decls[property] !== undefined &&
          r.selectors.some((s) => s.endsWith(`[data-part="${part}"]`)),
      );
      expect(winner, `${pattern} declares ${property} for ${part} unconditionally`).toBeDefined();
    }
  });

  it("every landing-kit stylesheet stays on the canon, in mobile-first form", () => {
    const canon = new Set(TIERS.map((t) => minWidth(t)));
    for (const pattern of LANDING_KIT) {
      const queries = [...uncommented(pattern).matchAll(/@media \(([^)]+)\)/g)].map((m) => m[1]);
      expect(queries.length, `${pattern} has media queries`).toBeGreaterThan(0);
      for (const query of queries) {
        if (!/width/.test(query)) {
          expect(query, `${pattern}: ${query}`).toBe("prefers-reduced-motion: reduce");
          continue;
        }
        expect([...canon], `${pattern}: ${query}`).toContain(query);
      }
    }
  });

  it("tier blocks are declared in ascending order — the sheets read mobile-first", () => {
    for (const pattern of LANDING_KIT) {
      const floors = [...uncommented(pattern).matchAll(/@media \(min-width:\s*([\d.]+)rem\)/g)].map(
        (m) => Number(m[1]),
      );
      expect(floors, `${pattern} tier blocks ascend`).toEqual([...floors].sort((a, b) => a - b));
    }
  });
});

describe("hero", () => {
  const source = html("hero");

  it("is a section named by its own headline", () => {
    const [first] = componentsNamed(source, "hero");
    expect(first.root.tag).toBe("section");
    const headline = first.parts["headline"][0];
    expect(headline.tag).toBe("h1");
    expect(first.root.attrs["aria-labelledby"]).toBe(headline.attrs["id"]);
  });

  it("defaults to the centered layout", () => {
    expect(manifest("hero").variants.layout.default).toBe("center");
    expect(componentsNamed(source, "hero")[0].root.attrs["data-variant"]).toBe("center");
  });

  it("keeps action buttons out of the part namespace", () => {
    // A nested button carrying both data-part and data-variant would have its
    // data-variant validated against hero's variant values (center|split).
    const actions = componentsNamed(source, "hero")[0].parts["actions"][0];
    const buttons = actions.children.filter((el) => el.attrs["data-ui"] === "button");
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) {
      expect(button.attrs["data-part"]).toBeUndefined();
      expect(button.attrs["data-variant"]).toBeTruthy();
    }
  });

  it("offers a split layout with a media column", () => {
    const split = componentsNamed(source, "hero").find(
      (c) => c.root.attrs["data-variant"] === "split",
    );
    expect(split).toBeDefined();
    expect(split!.parts["content"]).toBeDefined();
    expect(split!.parts["media"][0].attrs["data-ui"]).toBe("image");
  });
});

describe("feature-grid", () => {
  const source = html("feature-grid");

  it("keeps the features a real list", () => {
    for (const grid of componentsNamed(source, "feature-grid")) {
      expect(grid.parts["items"][0].tag).toBe("ul");
      for (const item of grid.parts["item"]) {
        expect(item.tag).toBe("li");
      }
    }
  });

  it("gives every item a heading one level below the section heading", () => {
    for (const grid of componentsNamed(source, "feature-grid")) {
      expect(grid.parts["heading"][0].tag).toBe("h2");
      expect(grid.parts["item"].length).toBe(grid.parts["item-title"].length);
      for (const title of grid.parts["item-title"]) {
        expect(title.tag).toBe("h3");
      }
    }
  });

  it("integrates the icon primitive as decoration only, inside a plate", () => {
    const plates = componentsNamed(source, "feature-grid").flatMap((g) => g.parts["icon"]);
    expect(plates.length).toBeGreaterThan(0);
    for (const plate of plates) {
      // The plate must WRAP the icon: the icon paints its glyph with
      // background-color:currentColor, so a background on the icon element
      // itself would repaint the glyph instead of framing it.
      expect(plate.attrs["data-ui"]).toBeUndefined();
      expect(plate.attrs["aria-hidden"]).toBe("true");
      expect(plate.children.length).toBe(1);
      expect(plate.children[0].attrs["data-ui"]).toBe("icon");
      expect(plate.children[0].attrs["data-icon"]).toBeTruthy();
    }
    expect(css("feature-grid")).not.toMatch(/\[data-ui="icon"\][^{]*\{[^}]*background/);
  });

  it("demonstrates every declared column count", () => {
    const declared = manifest("feature-grid").variants.columns.values;
    const used = componentsNamed(source, "feature-grid").map((g) => g.root.attrs["data-cols"]);
    expect([...declared].sort()).toEqual([...new Set(used)].sort());
  });
});

describe("pricing", () => {
  const source = html("pricing");

  it("declares row alignment on a real grid primitive", () => {
    for (const pricing of componentsNamed(source, "pricing")) {
      const tiers = pricing.parts["tiers"][0];
      expect(tiers.attrs["data-ui"]).toBe("grid");
      expect(tiers.attrs["data-align-rows"]).toBeDefined();
      expect(tiers.attrs["data-cols"]).toBe("1");
      expect(tiers.attrs["data-cols-sm"]).toBe("2");
      expect(tiers.attrs["data-cols-lg"]).toBe(pricing.root.attrs["data-cols"]);
    }
  });

  it("builds every tier from the card primitive", () => {
    for (const pricing of componentsNamed(source, "pricing")) {
      expect(pricing.parts["tier"].length).toBeGreaterThan(1);
      for (const tier of pricing.parts["tier"]) {
        expect(tier.attrs["data-ui"]).toBe("card");
        expect(tier.tag).toBe("article");
      }
    }
  });

  it("renders the price with the stat primitive", () => {
    const stats = extractComponents(source, "pricing.html").filter((c) => c.name === "stat");
    expect(stats.length).toBeGreaterThan(0);
    for (const stat of stats) {
      expect(stat.parts["value"]).toBeDefined();
      expect(stat.parts["label"]).toBeDefined();
    }
  });

  it("marks exactly one featured tier per pricing section, and says so in content", () => {
    for (const pricing of componentsNamed(source, "pricing")) {
      const featured = pricing.parts["tier"].filter(
        (t) => t.attrs["data-state"] === "featured",
      );
      expect(featured.length).toBe(1);
      // Colour alone must not carry the emphasis: a badge states it in text.
      const badge = featured[0].children
        .flatMap((child) => child.children)
        .find((el) => el.attrs["data-ui"] === "badge");
      expect(badge, "featured tier carries an in-content badge").toBeDefined();
    }
    expect(manifest("pricing").states.featured.applied_to).toBe("tier");
  });

  it("never puts a pricing part inside a tier card", () => {
    // Slot ownership: inside a tier the nearest data-ui ancestor is the card, so
    // a pricing-named data-part there would be an orphan part of the card.
    const cardSlots = new Set(Object.keys(manifests.get("card")!.slots));
    const cards = extractComponents(source, "pricing.html").filter((c) => c.name === "card");
    for (const card of cards) {
      expect(card.parts["divider"], "every aligned tier supplies the fourth card row").toHaveLength(1);
      for (const part of Object.keys(card.parts)) {
        expect(cardSlots.has(part), `[data-part="${part}"] belongs to card`).toBe(true);
      }
    }
  });

  it("ticks features with the icon primitive", () => {
    const icons = extractComponents(source, "pricing.html").filter((c) => c.name === "icon");
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon.root.attrs["data-icon"]).toBe("check");
      expect(icon.root.attrs["aria-hidden"]).toBe("true");
    }
  });
});

describe("site-footer", () => {
  const source = html("site-footer");

  it("is a real footer element", () => {
    for (const footer of componentsNamed(source, "site-footer")) {
      expect(footer.root.tag).toBe("footer");
    }
  });

  it("names every navigation landmark", () => {
    const navs = extractComponents(source, "site-footer.html").filter((c) => c.name === "nav");
    expect(navs.length).toBeGreaterThan(2);
    for (const nav of navs) {
      const named =
        !!nav.root.attrs["aria-label"]?.trim() || !!nav.root.attrs["aria-labelledby"]?.trim();
      expect(named, `nav at line ${nav.line} has an accessible name`).toBe(true);
    }
  });

  it("points each column nav at its column title", () => {
    for (const footer of componentsNamed(source, "site-footer")) {
      for (const column of footer.parts["column"] ?? []) {
        const title = column.children.find((el) => el.attrs["data-part"] === "column-title");
        const nav = column.children.find((el) => el.attrs["data-ui"] === "nav");
        expect(title?.attrs["id"]).toBeTruthy();
        expect(nav?.attrs["aria-labelledby"]).toBe(title!.attrs["id"]);
      }
    }
  });

  it("labels the icon-only social links", () => {
    const social = componentsNamed(source, "site-footer")
      .flatMap((f) => f.parts["social"] ?? [])
      .flatMap((el) => el.children);
    expect(social.length).toBeGreaterThan(0);
    for (const link of social) {
      expect(link.attrs["aria-label"]?.trim()).toBeTruthy();
      expect(link.children[0].attrs["aria-hidden"]).toBe("true");
    }
  });

  it("leaves the copyright year out so the template never goes stale", () => {
    const lines = componentsNamed(source, "site-footer").flatMap((f) => f.parts["copyright"]);
    expect(lines.length).toBeGreaterThan(0);
    expect(source).not.toMatch(/&copy; (19|20)\d\d/);
  });
});
