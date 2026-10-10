// Landing craft — the three section upgrades for premium landing pages:
//
//   · toggle-group `data-variant="segmented"` — one track, one sliding thumb,
//     pure CSS over native radios, feature-detected and single-mode only;
//   · pricing's zero-JavaScript monthly/yearly billing switch — `billing`,
//     `monthly` and `yearly` slots swapped by `:has()`, hidden without it;
//   · hero `data-variant="cover"` (full-bleed display opener) and
//     `data-animate` (a staggered load entrance on the reveal tokens).
//
// None of this has a controller to drive, and happy-dom cannot evaluate a
// relative `:has()`, so what is pinned here is the contract: the manifests
// declare it, the sheets implement it behind the right guards (feature
// detection, reduced motion, print, forced colours), every value is a token,
// and the reference pages demonstrate it and stay audit-clean.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { extractComponents, type ParsedElement } from "../../src/parser/html-parser";
import {
  findClassSelectors,
  findHardcodedColorValues,
  findIdSelectors,
  findImportantDeclarations,
  findLogicalPropertyViolations,
} from "../../src/parser/css-parser";

const REGISTRY = join(import.meta.dir, "../../registry");

const COMPONENTS = {
  "toggle-group": "recipes/toggle-group",
  pricing: "patterns/pricing",
  hero: "patterns/hero",
} as const;
type Name = keyof typeof COMPONENTS;

const read = (name: Name, ext: string) =>
  readFileSync(join(REGISTRY, COMPONENTS[name], `${name}.${ext}`), "utf8");
const manifest = (name: Name): Manifest => JSON.parse(read(name, "manifest.json"));

/** One style rule of a sheet: its selector list, its body and the at-rules around it. */
interface Rule {
  selector: string;
  body: string;
  at: string[];
}

/** A small brace walker — enough for registry sheets (no strings holding braces). */
function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const stack: string[] = [];
  let buffer = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      const prelude = buffer.trim().replace(/\s+/g, " ");
      buffer = "";
      if (prelude.startsWith("@") && !prelude.startsWith("@keyframes")) {
        stack.push(prelude);
        continue;
      }
      // A style rule (or a keyframes block, captured whole): read to its close.
      let depth = 1;
      let j = i + 1;
      for (; j < src.length && depth > 0; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
      }
      out.push({ selector: prelude, body: src.slice(i + 1, j - 1), at: [...stack] });
      i = j - 1;
      continue;
    }
    if (c === "}") {
      stack.pop();
      buffer = "";
      continue;
    }
    buffer += c;
  }
  return out;
}

const sheets = Object.fromEntries(
  (Object.keys(COMPONENTS) as Name[]).map((n) => [n, rules(read(n, "css"))]),
) as Record<Name, Rule[]>;

const find = (name: Name, test: (r: Rule) => boolean) => sheets[name].filter(test);
const decl = (body: string, prop: string) =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());

const HAS = "@supports selector(:has(*))";
const REDUCED = (at: string[]) => at.some((a) => a.startsWith("@media (prefers-reduced-motion: reduce)"));

/** The custom-property knobs these additions introduce, per component. */
const NEW_KNOBS: Record<Name, string[]> = {
  "toggle-group": ["--toggle-group-track-bg", "--toggle-group-thumb-bg"],
  pricing: [],
  hero: ["--hero-display-size", "--hero-scrim"],
};

const manifests = await loadRegistryManifestMap(REGISTRY);

function componentsNamed(source: string, file: string, name: string) {
  return extractComponents(source, file, (component, slot) =>
    manifests.get(component)?.slots?.[slot] !== undefined,
  ).filter((c) => c.name === name);
}

function descendants(el: ParsedElement): ParsedElement[] {
  return el.children.flatMap((child) => [child, ...descendants(child)]);
}

// ── shared hygiene ──────────────────────────────────────────────────────────

describe("landing craft · manifests validate and the sheets use tokens only", () => {
  for (const name of Object.keys(COMPONENTS) as Name[]) {
    it(`${name}.manifest.json passes validateManifest`, () => {
      expect(validateManifest(manifest(name))).toEqual([]);
    });

    it(`${name}.css has no hardcoded colours, classes, ids, !important or physical properties`, () => {
      const css = read(name, "css");
      expect(findHardcodedColorValues(css)).toEqual([]);
      expect(findClassSelectors(css)).toEqual([]);
      expect(findIdSelectors(css)).toEqual([]);
      expect(findImportantDeclarations(css)).toEqual([]);
      expect(findLogicalPropertyViolations(css)).toEqual([]);
    });

    it(`${name}.html is audit-clean`, () => {
      const file = `registry/${COMPONENTS[name]}/${name}.html`;
      expect(auditHtmlSource({ source: read(name, "html"), file, manifests })).toEqual([]);
    });

    it(`${name}: every knob this work added is a documented prop with a default`, () => {
      const m = manifest(name);
      for (const knob of NEW_KNOBS[name]) {
        expect(read(name, "css")).toContain(`var(${knob},`);
        expect(m.props?.[knob], `${knob} is declared`).toBeDefined();
        expect(m.props?.[knob]?.default, `${knob} has a default`).toBeDefined();
      }
    });
  }
});

// ── toggle-group · segmented ────────────────────────────────────────────────

describe("toggle-group · data-variant=\"segmented\"", () => {
  const m = manifest("toggle-group");
  const segmented = find("toggle-group", (r) => r.selector.includes('[data-variant="segmented"]'));

  it("declares a data-variant style group: default and segmented, default by default", () => {
    const groups = Object.values(m.variants).filter((v) => v.attr === "data-variant");
    expect(groups).toHaveLength(1);
    expect(groups[0].values).toEqual(["default", "segmented"]);
    expect(groups[0].default).toBe("default");
    expect(m.version).toBe("1.2.0");
    expect(m.props?.["--toggle-group-track-bg"]?.default).toBe("var(--color-bg-muted)");
    expect(m.props?.["--toggle-group-thumb-bg"]?.default).toBe("var(--color-bg)");
    expect((m.a11y as { notes?: string }).notes).toContain("single mode");
    expect(m.templates.html_segmented).toContain('data-variant="segmented"');
  });

  it("the default value has no rule of its own — the group renders exactly as before", () => {
    expect(read("toggle-group", "css")).not.toContain('[data-variant="default"]');
  });

  it("every segmented rule is feature-detected and single-mode only", () => {
    expect(segmented.length).toBeGreaterThan(10);
    for (const r of segmented) {
      if (r.at.some((a) => a.startsWith("@media (forced-colors"))) continue;
      expect(r.at, r.selector).toContain(HAS);
      for (const sel of r.selector.split(/,\s*/)) {
        expect(sel, sel).toContain(':not([data-mode="multi"])');
      }
    }
  });

  it("draws ONE thumb — the root's ::before — that translates by the checked index", () => {
    const thumb = segmented.find((r) => /\)::before$/.test(r.selector) && decl(r.body, "translate").length);
    expect(thumb).toBeDefined();
    const body = thumb!.body;
    expect(decl(body, "content")).toEqual(['""']);
    expect(decl(body, "position")).toEqual(["absolute"]);
    expect(decl(body, "translate")[0]).toContain("var(--faqir-tg-index)");
    expect(decl(body, "translate")[0]).toContain("100%");
    expect(decl(body, "inline-size")[0]).toContain("var(--faqir-tg-count)");
    expect(decl(body, "box-shadow")).toEqual(["var(--shadow-sm)"]);
    expect(decl(body, "background")[0]).toContain("var(--color-bg)");
    expect(decl(body, "transition")[0]).toMatch(/^translate var\(--duration-[a-z]+\) var\(--ease-[a-z]+\)$/);
    // The thumb sits under the labels.
    expect(decl(body, "z-index")).toEqual(["-1"]);
  });

  it("the track and the thumb follow the theme's control radius", () => {
    const root = segmented.find((r) => r.selector.endsWith(':not([data-mode="multi"])') && decl(r.body, "display").length);
    expect(decl(root!.body, "border-radius")).toEqual(["var(--button-radius)"]);
    expect(decl(root!.body, "display")).toEqual(["inline-grid"]);
    expect(decl(root!.body, "grid-auto-columns")).toEqual(["1fr"]);
    expect(decl(root!.body, "background")[0]).toContain("var(--color-bg-muted)");
  });

  it("counts two to six items and locates the checked one by its native :checked", () => {
    for (let n = 2; n <= 6; n++) {
      const count = segmented.find((r) => r.selector.includes(`:has(> :nth-child(${n}))`) && r.body.includes("--faqir-tg-count"));
      expect(count, `count ${n}`).toBeDefined();
      expect(count!.body).toContain(`--faqir-tg-count: ${n}`);
      const index = segmented.find((r) => r.selector.includes(`:has(> :nth-child(${n}) > input:checked)`));
      expect(index, `index ${n - 1}`).toBeDefined();
      expect(index!.body).toContain(`--faqir-tg-index: ${n - 1}`);
      // A data-state written into static markup must not steer the thumb.
      expect(index!.selector).not.toContain("data-state");
    }
    // Beyond six the thumb stands down rather than lying about its width.
    const seven = segmented.find((r) => r.selector.endsWith(":has(> :nth-child(7))::before"));
    expect(decl(seven!.body, "display")).toEqual(["none"]);
  });

  it("keeps the item's visible focus ring and the controller-free checked fallback", () => {
    const css = read("toggle-group", "css");
    const focus = find("toggle-group", (r) => r.selector.includes(":focus-visible"));
    expect(focus).toHaveLength(1);
    expect(focus[0].at).toEqual([]);
    expect(decl(focus[0].body, "outline")[0]).toContain("var(--focus-ring-width)");
    // The default checked fill survives an engine without :has() — the
    // data-state branch is its own rule, not a member of an unforgiving list.
    const stateOn = find("toggle-group", (r) => r.selector === '[data-ui="toggle-group"] > [data-part="item"][data-state="on"]');
    expect(stateOn).toHaveLength(1);
    expect(stateOn[0].at).toEqual([]);
    expect(decl(stateOn[0].body, "background")).toEqual(["var(--color-primary-subtle)"]);
  });

  it("is reduced-motion safe and has a forced-colours fallback", () => {
    const reduced = find("toggle-group", (r) => REDUCED(r.at));
    expect(reduced.some((r) => r.selector.includes("::before") && decl(r.body, "transition")[0] === "none")).toBe(true);
    const forced = find("toggle-group", (r) => r.at.includes("@media (forced-colors: active)"));
    expect(forced.some((r) => decl(r.body, "background")[0] === "Highlight")).toBe(true);
    expect(forced.some((r) => r.selector.includes("::before") && decl(r.body, "display")[0] === "none")).toBe(true);
  });

  it("the controller is untouched: the variant is CSS only", () => {
    expect(readFileSync(join(REGISTRY, "recipes/toggle-group/toggle-group.js"), "utf8")).not.toContain("segmented");
  });

  it("the reference page demonstrates segmented single-mode radiogroups", () => {
    const groups = componentsNamed(read("toggle-group", "html"), "toggle-group.html", "toggle-group").filter(
      (c) => c.root.attrs["data-variant"] === "segmented",
    );
    expect(groups.length).toBeGreaterThanOrEqual(2);
    for (const g of groups) {
      expect(g.root.attrs["data-mode"]).toBe("single");
      expect(g.root.attrs["role"]).toBe("radiogroup");
      expect(g.root.attrs["aria-label"]).toBeTruthy();
      const controls = g.parts["control"];
      expect(controls.length).toBeLessThanOrEqual(6);
      for (const c of controls) expect(c.attrs["type"]).toBe("radio");
      expect(controls.filter((c) => "checked" in c.attrs)).toHaveLength(1);
    }
  });
});

// ── pricing · billing switch ────────────────────────────────────────────────

describe("pricing · the zero-JavaScript billing switch", () => {
  const m = manifest("pricing");
  const YEARLY_ON = '[data-ui="pricing"]:has(> [data-part="billing"] input[value="yearly"]:checked)';

  it("declares billing, monthly and yearly as optional slots, and composes toggle-group", () => {
    expect(m.version).toBe("1.3.0");
    for (const slot of ["billing", "monthly", "yearly"]) {
      expect(m.slots[slot]?.required, slot).toBe(false);
      expect(m.slots[slot]?.selector).toBe(`[data-part='${slot}']`);
    }
    expect(m.slots.billing.description).toContain("value='monthly'");
    expect(m.slots.billing.description).toContain("value='yearly'");
    expect(m.slots.billing.description).toContain("DIRECT child");
    expect(m.composition.contains).toContain("toggle-group");
    expect(m.templates.html_billing).toContain('value="monthly" checked');
    expect(m.templates.html_billing).toContain('value="yearly"');
    expect(m.templates.html_billing).toContain('data-variant="segmented"');
    expect((m.a11y as { notes?: string }).notes).toContain("display:none");
  });

  it("hides the billing part unless :has() is supported", () => {
    const base = find("pricing", (r) => r.selector === '[data-ui="pricing"] > [data-part="billing"]');
    expect(base.find((r) => r.at.length === 0)!.body).toMatch(/display:\s*none/);
    expect(decl(base.find((r) => r.at.includes(HAS))!.body, "display")).toEqual(["flex"]);
    expect(decl(base.find((r) => r.at.includes(HAS))!.body, "justify-content")).toEqual(["center"]);
  });

  it("swaps the wrappers off the yearly radio, with display:none on the hidden half", () => {
    const hide = find("pricing", (r) => r.at.includes(HAS) && decl(r.body, "display")[0] === "none");
    const selectors = hide.flatMap((r) => r.selector.split(/,\s*/));
    expect(selectors).toContain(`[data-ui="pricing"]:not(:has(> [data-part="billing"] input[value="yearly"]:checked)) [data-part="yearly"]`);
    expect(selectors).toContain(`${YEARLY_ON} [data-part="monthly"]`);
    // Without :has() the yearly wrappers never show.
    const fallback = find("pricing", (r) => r.at.includes("@supports not selector(:has(*))"));
    expect(fallback.map((r) => r.selector)).toEqual(['[data-ui="pricing"] [data-part="yearly"]']);
    expect(decl(fallback[0].body, "display")).toEqual(["none"]);
  });

  it("settles the arriving price on the motion tokens, and not under reduced motion or in print", () => {
    const swap = find("pricing", (r) => r.at.includes(HAS) && decl(r.body, "animation").length > 0);
    expect(swap).toHaveLength(1);
    expect(swap[0].selector).toContain(`${YEARLY_ON} [data-part="yearly"]`);
    expect(decl(swap[0].body, "animation")[0]).toBe(
      "faqir-pricing-swap var(--motion-enter-duration) var(--motion-enter-ease) both",
    );
    const reduced = find("pricing", (r) => REDUCED(r.at) && decl(r.body, "animation")[0] === "none");
    expect(reduced).toHaveLength(1);
    expect(reduced[0].at[0]).toBe("@media (prefers-reduced-motion: reduce), print");
    // Same selectors as the swap, so it meets it at equal weight and wins later.
    expect(reduced[0].selector).toBe(swap[0].selector);
    const keyframes = find("pricing", (r) => r.selector === "@keyframes faqir-pricing-swap");
    expect(keyframes[0].body).toContain("opacity: 0");
    expect(keyframes[0].body).toContain("var(--motion-slide-distance)");
    expect(keyframes[0].body).not.toMatch(/\bto\s*\{/);
  });

  it("keeps the featured ring and adds the accent wash without touching it", () => {
    const ring = find("pricing", (r) => r.selector === '[data-ui="pricing"] [data-part="tier"][data-state="featured"]');
    expect(decl(ring[0].body, "outline")).toEqual(["var(--border-width-strong) solid var(--color-primary)"]);
    const wash = find("pricing", (r) => r.selector.endsWith('> [data-part="tier"][data-state="featured"]'));
    expect(wash).toHaveLength(1);
    expect(wash[0].body).toContain("color-mix(in oklch, var(--color-primary)");
    expect(wash[0].body).toContain("var(--card-bg, var(--color-surface-1))");
  });

  it("the reference page demonstrates a three-tier billing switch", () => {
    const source = read("pricing", "html");
    const withBilling = componentsNamed(source, "pricing.html", "pricing").filter((p) => p.parts["billing"]);
    expect(withBilling).toHaveLength(1);
    const pricing = withBilling[0];
    expect(pricing.parts["tier"]).toHaveLength(3);
    expect(pricing.parts["tier"].filter((t) => t.attrs["data-state"] === "featured")).toHaveLength(1);

    // billing is a direct child of the section.
    const billing = pricing.parts["billing"][0];
    expect(pricing.root.children).toContain(billing);
    const group = billing.children.find((el) => el.attrs["data-ui"] === "toggle-group")!;
    expect(group.attrs["data-variant"]).toBe("segmented");
    expect(group.attrs["data-mode"]).toBe("single");
    expect(group.attrs["role"]).toBe("radiogroup");
    const radios = descendants(group).filter((el) => el.tag === "input");
    expect(radios.map((r) => r.attrs["value"])).toEqual(["monthly", "yearly"]);
    expect("checked" in radios[0].attrs).toBe(true);
    expect("checked" in radios[1].attrs).toBe(false);

    // Every tier's price is written twice, a pair in the stat's value and label.
    const stats = descendants(pricing.root).filter((el) => el.attrs["data-ui"] === "stat");
    expect(stats).toHaveLength(3);
    for (const stat of stats) {
      for (const slot of ["value", "label"]) {
        const part = stat.children.find((el) => el.attrs["data-part"] === slot)!;
        const kids = part.children.map((el) => `${el.tag}:${el.attrs["data-part"]}`);
        expect(kids, `${slot} holds a monthly/yearly pair`).toEqual(["span:monthly", "span:yearly"]);
      }
    }
    // The ownership walk hands the wrappers to pricing, not to stat or card.
    expect(pricing.parts["monthly"]).toHaveLength(6);
    expect(pricing.parts["yearly"]).toHaveLength(6);
    // One price per tier is announced; the grid is not a live region.
    expect(source).not.toMatch(/\saria-live=/);
    expect(source).not.toContain("<script");
  });
});

// ── hero · cover + data-animate ─────────────────────────────────────────────

describe("hero · data-variant=\"cover\"", () => {
  const m = manifest("hero");
  const cover = find("hero", (r) => r.selector.includes('[data-variant="cover"]'));

  it("declares cover as a layout value", () => {
    expect(m.version).toBe("1.3.0");
    expect(m.variants.layout.values).toEqual(["center", "split", "cover"]);
    expect(m.variants.layout.default).toBe("center");
    expect(m.templates.html_cover).toContain('data-variant="cover"');
  });

  it("fills the small viewport, with a vh fallback declared first", () => {
    const root = cover.find((r) => r.selector === '[data-ui="hero"][data-variant="cover"]' && r.at.length === 0)!;
    expect(decl(root.body, "min-block-size")).toEqual(["88vh", "88svh"]);
    expect(decl(root.body, "align-content")).toEqual(["end"]);
    expect(decl(root.body, "isolation")).toEqual(["isolate"]);
    expect(decl(root.body, "overflow")).toEqual(["clip"]);
    expect(decl(root.body, "grid-template-columns")).toEqual(["minmax(0, 1fr)"]);
    // Print: as tall as its words.
    const print = cover.find((r) => r.at.includes("@media print"))!;
    expect(decl(print.body, "min-block-size")).toEqual(["auto"]);
  });

  it("sets a fluid display headline on the theme's type tokens that wraps long words", () => {
    const headline = cover.find((r) => r.selector.includes('[data-part="headline"]'))!;
    const size = decl(headline.body, "font-size")[0];
    expect(size).toStartWith("var(--hero-display-size, clamp(min(var(--text-4xl), 11vw),");
    expect(size).toContain("vw");
    expect(decl(headline.body, "overflow-wrap")).toEqual(["anywhere"]);
    expect(decl(headline.body, "text-wrap")).toEqual(["balance"]);
    expect(decl(headline.body, "line-height")[0]).toContain("var(--leading-tight)");
    // The heading role (family, weight, tracking, case) comes from the base
    // headline rule, which the cover does not override.
    const base = find("hero", (r) => r.selector === '[data-ui="hero"] [data-part="headline"]' && r.at.length === 0)[0];
    for (const token of ["--font-heading", "--heading-weight", "--heading-tracking", "--heading-transform"]) {
      expect(base.body).toContain(`var(${token})`);
    }
    expect(m.props?.["--hero-display-size"]).toBeDefined();
  });

  it("puts the media behind the words under a token-coloured scrim", () => {
    const media = cover.find((r) => r.selector.endsWith('> [data-part="media"]') && decl(r.body, "position").length)!;
    expect(decl(media.body, "position")).toEqual(["absolute"]);
    expect(decl(media.body, "z-index")).toEqual(["-1"]);
    const scrim = cover.find((r) => r.selector.endsWith("::after"))!;
    expect(decl(scrim.body, "z-index")).toEqual(["-1"]);
    expect(scrim.body).toContain("var(--hero-scrim,");
    expect(scrim.body).toContain("var(--hero-bg, var(--color-bg))");
  });

  it("the reference page demonstrates cover with a backdrop image and without media", () => {
    const covers = componentsNamed(read("hero", "html"), "hero.html", "hero").filter(
      (c) => c.root.attrs["data-variant"] === "cover",
    );
    expect(covers.length).toBeGreaterThanOrEqual(2);
    const withMedia = covers.find((c) => c.parts["media"])!;
    const media = withMedia.parts["media"][0];
    // The variant belongs to the nested image, never to the part.
    expect(media.attrs["data-variant"]).toBeUndefined();
    expect(media.children[0].attrs["data-ui"]).toBe("image");
    expect(media.children[0].attrs["data-variant"]).toBe("cover");
    expect(covers.some((c) => !c.parts["media"])).toBe(true);
  });
});

describe("hero · data-animate", () => {
  const m = manifest("hero");
  const animated = find("hero", (r) => r.selector.includes("[data-animate]"));

  it("is a declared boolean prop", () => {
    expect(m.props?.animate).toMatchObject({ type: "boolean", default: false, attr: "data-animate" });
  });

  it("staggers eyebrow → headline → description → actions → note → media on the reveal tokens", () => {
    const entrance = animated.find((r) => r.at.length === 0 && decl(r.body, "animation").length)!;
    expect(decl(entrance.body, "animation")[0]).toBe(
      "faqir-hero-rise var(--motion-reveal-duration) var(--motion-reveal-ease) both",
    );
    expect(decl(entrance.body, "animation-delay")[0]).toBe("calc(var(--motion-stagger) * var(--faqir-hero-step))");
    const order = ["headline", "description", "actions", "note", "media"];
    order.forEach((part, i) => {
      const step = animated.find(
        (r) => r.selector.startsWith(`[data-ui="hero"][data-animate] > [data-part="${part}"]`) && r.body.includes("--faqir-hero-step"),
      );
      expect(step, part).toBeDefined();
      expect(step!.body).toContain(`--faqir-hero-step: ${i + 1}`);
    });
    // Copy inside [data-part="content"] (split, cover) takes part as well.
    expect(entrance.selector).toContain(':where([data-part="content"]) >');
    const rise = find("hero", (r) => r.selector === "@keyframes faqir-hero-rise")[0];
    expect(rise.body).toContain("var(--motion-reveal-distance)");
    expect(rise.body).not.toMatch(/\bto\s*\{/);
  });

  it("removes the entrance under reduced motion and in print, and never hides anything at rest", () => {
    const off = find("hero", (r) => REDUCED(r.at) && decl(r.body, "animation")[0] === "none");
    expect(off).toHaveLength(1);
    expect(off[0].at[0]).toBe("@media (prefers-reduced-motion: reduce), print");
    // Every animated selector is neutralised there.
    const animatedSelectors = animated
      .filter((r) => r.at.length === 0 && (decl(r.body, "animation").length || decl(r.body, "animation-name").length))
      .flatMap((r) => r.selector.split(/,\s*(?![^(]*\))/));
    for (const sel of animatedSelectors) expect(off[0].selector, sel).toContain(sel);
    // Opacity 0 lives only in keyframes: with animations off, everything shows.
    for (const r of sheets.hero.filter((r) => !r.selector.startsWith("@keyframes"))) {
      expect(decl(r.body, "opacity"), r.selector).not.toContain("0");
    }
  });

  it("the reference page demonstrates it", () => {
    const animatedHeroes = componentsNamed(read("hero", "html"), "hero.html", "hero").filter(
      (c) => "data-animate" in c.root.attrs,
    );
    expect(animatedHeroes.length).toBeGreaterThanOrEqual(1);
  });
});
