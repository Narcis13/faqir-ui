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
//   · the responsive column behaviour is real CSS at the registry's two
//     breakpoints, not a claim in prose.

import { describe, it, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { validateManifest, type Manifest } from "../../src/manifest";
import { extractComponents, parseDocument } from "../../src/parser/html-parser";
import { DOCUMENT_RULES } from "../../src/audit/rules";
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

/**
 * Body of the first `@media (<query>)` block, via brace matching — enough to
 * assert what a breakpoint actually declares without pulling in a CSS parser.
 */
function mediaBlock(source: string, query: string): string {
  const at = source.indexOf(`@media (${query})`);
  expect(at, `no @media (${query}) block`).toBeGreaterThan(-1);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced @media (${query}) block`);
}

/** Elements of one component in a reference page, by data-ui name. */
function componentsNamed(source: string, name: string) {
  return extractComponents(source, `${name}.html`).filter((c) => c.name === name);
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

    it(`${pattern} is scanned by axe in both schemes on the default and contrast themes`, () => {
      const cases = buildA11yMatrix().filter((c) => c.component.name === pattern);
      expect(cases.length).toBe(A11Y_THEMES.length * SCHEMES.length);
      expect([...new Set(cases.map((c) => c.theme))].sort()).toEqual([...A11Y_THEMES].sort());
      expect([...new Set(cases.map((c) => c.scheme))].sort()).toEqual([...SCHEMES].sort());
    });
  }
});

describe("landing kit — responsive column behaviour", () => {
  // The registry's two breakpoints (see registry/primitives/grid/grid.css).
  const MEDIUM = "max-width: 1024px";
  const SMALL = "max-width: 640px";

  it("feature-grid goes 4/3 → 2 → 1 column", () => {
    const sheet = css("feature-grid");
    expect(sheet).toContain('[data-ui="feature-grid"][data-cols="4"] [data-part="items"]');
    expect(sheet).toMatch(/\[data-cols="4"\] \[data-part="items"\] \{\s*grid-template-columns: repeat\(4, 1fr\)/);

    const medium = mediaBlock(sheet, MEDIUM);
    expect(medium).toContain("grid-template-columns: repeat(2, 1fr)");
    expect(medium).toContain('[data-ui="feature-grid"][data-cols="4"] [data-part="items"]');

    const small = mediaBlock(sheet, SMALL);
    expect(small).toContain("grid-template-columns: 1fr");
    expect(small).toContain('[data-ui="feature-grid"][data-cols="2"] [data-part="items"]');
  });

  it("pricing goes 3 → 2 → 1 tier column", () => {
    const sheet = css("pricing");
    expect(sheet).toMatch(/\[data-cols="3"\] \[data-part="tiers"\] \{\s*grid-template-columns: repeat\(3, 1fr\)/);
    expect(mediaBlock(sheet, MEDIUM)).toContain("grid-template-columns: repeat(2, 1fr)");
    expect(mediaBlock(sheet, SMALL)).toContain("grid-template-columns: 1fr");
  });

  it("site-footer halves its link columns then stacks them", () => {
    const sheet = css("site-footer");
    expect(sheet).toMatch(/\[data-part="columns"\] \{[^}]*grid-template-columns: repeat\(3, 1fr\)/);

    const medium = mediaBlock(sheet, MEDIUM);
    // The brand/link split collapses first, then the link columns halve.
    expect(medium).toContain("grid-template-columns: 1fr");
    expect(medium).toContain("grid-template-columns: repeat(2, 1fr)");

    expect(mediaBlock(sheet, SMALL)).toContain("grid-template-columns: 1fr");
  });

  it("hero collapses its split layout before the small breakpoint", () => {
    const sheet = css("hero");
    expect(sheet).toMatch(/\[data-variant="split"\] \{[^}]*grid-template-columns: 1fr 1fr/);
    expect(mediaBlock(sheet, MEDIUM)).toContain("grid-template-columns: 1fr");
    expect(mediaBlock(sheet, SMALL)).toContain("flex-direction: column");
  });

  it("every landing-kit stylesheet stays inside the two registry breakpoints", () => {
    for (const pattern of LANDING_KIT) {
      const queries = [...css(pattern).matchAll(/@media \(([^)]+)\)/g)].map((m) => m[1]);
      for (const query of queries) {
        expect([MEDIUM, SMALL, "prefers-reduced-motion: reduce"], `${pattern}: ${query}`).toContain(query);
      }
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
