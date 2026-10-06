// ═══════════════════════════════════════════════════════════════════════════
// The motion and content primitives: reveal, marquee, backdrop, glow,
// highlight, quote, rating, timeline, scroll-progress
// ═══════════════════════════════════════════════════════════════════════════
//
// Nine CSS-only primitives. Each ships a schema-valid manifest, a reference
// fragment that audits clean (the registry gate), and CSS whose colours,
// spacing and easings only ever reference tokens. What this file pins beyond
// the shared sweep is each one's own promise:
//   • every entrance and loop is cut from the choreography tokens, so a theme
//     re-points one family and all of them follow;
//   • scroll-linked behaviour is guarded by @supports and degrades to content
//     that is simply there — nothing is ever left hidden;
//   • reduced motion is honoured by everything that moves;
//   • decoration never duplicates content (marquee's second track is hidden,
//     highlight paints real text, rating is one labelled image).

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import {
  findClassSelectors,
  findHardcodedColorValues,
  findIdSelectors,
  findImportantDeclarations,
  findLogicalPropertyViolations,
  hasAnimationProperties,
  hasReducedMotionQuery,
} from "../../src/parser/css-parser";
import { extractComponents } from "../../src/parser/html-parser";

const REGISTRY = join(import.meta.dir, "../../registry");
const NAMES = [
  "reveal", "marquee", "backdrop", "glow", "highlight", "quote", "rating", "timeline", "scroll-progress",
] as const;

const read = (name: string, ext: string) =>
  readFileSync(join(REGISTRY, "primitives", name, `${name}.${ext}`), "utf8");
const manifest = (name: string): Manifest => JSON.parse(read(name, "manifest.json"));
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("motion primitives · manifests are schema-valid and declare what the CSS selects", () => {
  for (const name of NAMES) {
    it(`${name}.manifest.json passes validateManifest`, () => {
      expect(validateManifest(manifest(name))).toEqual([]);
    });
  }

  it("the nine are CSS-only: no controller file, no js in files", () => {
    for (const name of NAMES) expect(manifest(name).files.js).toBeUndefined();
  });

  it("every custom-property knob is documented as a prop with a default", () => {
    for (const name of NAMES) {
      const m = manifest(name);
      const knobs = new Set<string>();
      for (const match of stripComments(read(name, "css")).matchAll(/var\(\s*(--[a-z-]+)\s*,/g)) {
        if (match[1].startsWith(`--${name}-`)) knobs.add(match[1]);
      }
      for (const knob of knobs) {
        expect(m.props?.[knob], `${name}: ${knob} is read with a fallback but not declared`).toBeDefined();
        expect(m.props?.[knob]?.default, `${name}: ${knob} needs a documented default`).toBeDefined();
      }
    }
  });
});

describe("motion primitives · CSS uses tokens only", () => {
  for (const name of NAMES) {
    const css = read(name, "css");
    it(`${name}.css has no hardcoded colours, classes, ids or !important`, () => {
      expect(findHardcodedColorValues(css)).toEqual([]);
      expect(findClassSelectors(css)).toEqual([]);
      expect(findIdSelectors(css)).toEqual([]);
      expect(findImportantDeclarations(css)).toEqual([]);
    });

    it(`${name}.css is logical (direction-agnostic)`, () => {
      expect(findLogicalPropertyViolations(css)).toEqual([]);
    });

    it(`${name}.css gates its motion on prefers-reduced-motion`, () => {
      if (hasAnimationProperties(css)) expect(hasReducedMotionQuery(css)).toBe(true);
    });
  }
});

describe("reveal · entrances are token choreography", () => {
  const css = stripComments(read("reveal", "css"));

  it("every effect reads the --motion-reveal-* family, never a literal distance", () => {
    expect(css).toContain("var(--reveal-distance, var(--motion-reveal-distance))");
    expect(css).toContain("var(--motion-reveal-scale)");
    expect(css).toContain("var(--motion-reveal-blur)");
    expect(css).toContain("var(--reveal-duration, var(--motion-reveal-duration))");
    expect(css).toContain("var(--reveal-ease, var(--motion-reveal-ease))");
    expect(css).not.toMatch(/translate:\s*0\s+[\d.]+rem/);
  });

  it("the keyframes carry only a from-state, so the content ends as it is", () => {
    const block = /@keyframes faqir-reveal \{([\s\S]*?)\n\}/.exec(css)![1];
    expect(block).toContain("from {");
    expect(block).not.toContain("to {");
  });

  it("stagger moves the entrance to the children and counts twelve steps", () => {
    expect(css).toContain('[data-ui="reveal"][data-stagger]:not([data-state]) > *');
    expect(css).toContain(":nth-child(n+12) { --faqir-reveal-index: 11; }");
    expect(css).toContain("var(--motion-stagger) * var(--faqir-reveal-index)");
  });

  it("the scroll trigger is guarded by @supports and the load entrance stays outside it", () => {
    const guard = /@supports \(animation-timeline: view\(\)\) \{([\s\S]*?)\n\}/.exec(css)![1];
    expect(guard).toContain("animation-timeline: view();");
    expect(guard).toContain('[data-trigger="scroll"]');
    expect(css.replace(guard, "")).toContain("animation: faqir-reveal");
  });

  it("markup without data-state is never hidden; hidden is released by shown and by reduced motion", () => {
    expect(css).toContain('[data-ui="reveal"][data-state="hidden"]:not([data-stagger])');
    expect(css).not.toMatch(/\[data-ui="reveal"\](?:\[data-variant[^\]]*\])?\s*\{[^}]*opacity:\s*0/);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain('[data-state="hidden"]');
    expect(reduced).toContain("opacity: 1;");
  });

  it("nested reveals reset the four private properties on every root", () => {
    const root = /\[data-ui="reveal"\] \{([^}]*)\}/.exec(css)![1];
    for (const p of ["--faqir-reveal-translate", "--faqir-reveal-scale", "--faqir-reveal-filter", "--faqir-reveal-index"]) {
      expect(root).toContain(p);
    }
  });
});

describe("marquee · a seamless loop that assistive technology reads once", () => {
  const css = stripComments(read("marquee", "css"));
  const html = read("marquee", "html");

  it("every instance writes the track twice and hides the second", () => {
    const roots = extractComponents(html, "fragment.html").filter((c) => c.name === "marquee");
    expect(roots.length).toBeGreaterThan(2);
    for (const root of roots) {
      const tracks = root.root.children.filter((c) => c.attrs["data-part"] === "track");
      expect(tracks).toHaveLength(2);
      expect(tracks[0].attrs["aria-hidden"]).toBeUndefined();
      expect(tracks[1].attrs["aria-hidden"]).toBe("true");
      expect(root.root.attrs["role"]).toBe("group");
      expect(root.root.attrs["aria-label"]).toBeTruthy();
    }
  });

  it("the loop travels one track plus one gap, at constant speed, cut from the ambient duration", () => {
    expect(css).toContain("translate: calc((100% + var(--marquee-gap, var(--space-8))) * var(--faqir-marquee-flow)) 0;");
    expect(css).toContain("var(--marquee-duration, var(--motion-ambient-duration))");
    expect(css).toContain("var(--ease-linear) infinite");
    expect(css).toContain("animation-play-state: var(--motion-ambient-play);");
  });

  it("pauses under the pointer and the keyboard unless told never to", () => {
    expect(css).toContain(':not([data-pause="never"]):hover > [data-part="track"]');
    expect(css).toContain(':not([data-pause="never"]):focus-within > [data-part="track"]');
  });

  it("reduced motion drops the duplicate and wraps the strip", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain('[data-part="track"][aria-hidden="true"] {\n    display: none;');
    expect(reduced).toContain("flex-wrap: wrap;");
  });
});

describe("backdrop · light behind a section, drawn by the wrapper itself", () => {
  const css = stripComments(read("backdrop", "css"));

  it("paints with two pseudo-elements behind isolated content and never scrolls", () => {
    const root = /\[data-ui="backdrop"\] \{([^}]*)\}/.exec(css)![1];
    expect(root).toContain("isolation: isolate;");
    expect(root).toContain("overflow: clip;");
    const pseudo = /\[data-ui="backdrop"\]::before,\n\[data-ui="backdrop"\]::after \{([^}]*)\}/.exec(css)![1];
    expect(pseudo).toContain("z-index: -1;");
    expect(pseudo).toContain("pointer-events: none;");
    expect(pseudo).toContain("animation-play-state: var(--motion-ambient-play);");
  });

  it("every colour is the theme's: accent, info, success and the ink", () => {
    for (const t of ["--color-primary", "--color-info", "--color-success", "--color-fg"]) expect(css).toContain(`var(${t})`);
    expect(css).toContain("color-mix(in oklch, var(--faqir-backdrop-a)");
  });

  it("grid lines and dots are as heavy as the theme's edge", () => {
    expect(css.match(/var\(--border-width\)/g)!.length).toBeGreaterThanOrEqual(4);
  });

  it("forced colours and print drop the decoration; reduced motion only stops it", () => {
    expect(css).toContain("@media (forced-colors: active), print");
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)![1];
    expect(reduced).toContain("animation: none;");
    expect(reduced).not.toContain("display: none");
  });
});

describe("glow · a ring outside one child", () => {
  const css = stripComments(read("glow", "css"));

  it("registers the angle so the orbit sweeps, and defaults the radius to the card's", () => {
    expect(css).toContain('@property --faqir-glow-angle {\n  syntax: "<angle>";');
    expect(css).toContain("border-radius: var(--glow-radius, var(--card-radius));");
    expect(css).toContain("to { --faqir-glow-angle: 360deg; }");
  });

  it("the ring is a masked frame drawn outside the child, the halo opt-in", () => {
    expect(css).toContain("inset: calc(var(--glow-width, var(--border-width-md)) * -1);");
    expect(css).toContain("mask: linear-gradient(black 0 0) content-box exclude, linear-gradient(black 0 0);");
    expect(css).toContain('[data-ui="glow"][data-halo]::after {\n  display: block;');
  });

  it("the gradient is written on the pseudo-elements, where the angle animates", () => {
    expect(css).not.toMatch(/\[data-ui="glow"\] \{[^}]*conic-gradient/);
    expect(css).toMatch(/::after \{[^}]*\}[\s\S]*conic-gradient\(from var\(--faqir-glow-angle\)/);
  });

  it("hover lights on focus-within too, and the orbit stops under reduced motion", () => {
    expect(css).toContain('[data-ui="glow"][data-trigger="hover"]:focus-within::before');
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)![1];
    expect(reduced).toContain("animation: none;");
  });
});

describe("highlight · effects on real text", () => {
  const css = stripComments(read("highlight", "css"));
  const html = read("highlight", "html");

  it("no instance duplicates its text or hides it from assistive technology", () => {
    for (const root of extractComponents(html, "fragment.html").filter((c) => c.name === "highlight")) {
      expect(root.root.children).toHaveLength(0);
      expect(root.root.attrs["aria-hidden"]).toBeUndefined();
    }
  });

  it("gradient prefers the theme's --gradient-accent and clips to the glyphs", () => {
    expect(css).toContain("var(--highlight-gradient, var(--gradient-accent, linear-gradient(135deg, var(--color-primary), var(--color-info))))");
    expect(css).toContain("background-clip: text;");
  });

  it("marker and underline keep the text colour and are drawn in from the line's start", () => {
    const marker = /\[data-variant="marker"\] \{([^}]*)\}/.exec(css)![1];
    expect(marker).not.toContain("color:");
    expect(css).toContain('[data-variant="marker"]:dir(rtl) {\n  background-position: 100% 88%;');
    expect(css).toContain("@keyframes faqir-highlight-draw {\n  from { background-size: 0% 46%; }");
    expect(css).toContain("background-size: 100% var(--border-width-lg);");
  });

  it("forced colours hand the text back", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain("-webkit-text-fill-color: currentColor;");
    expect(forced).toContain("background-image: none;");
  });
});

describe("quote · figure, blockquote, figcaption", () => {
  const html = read("quote", "html");
  const css = stripComments(read("quote", "css"));

  it("every instance is a figure whose text is a blockquote and whose author is the figcaption", () => {
    const roots = extractComponents(html, "fragment.html").filter((c) => c.name === "quote");
    expect(roots.length).toBeGreaterThan(3);
    for (const root of roots) {
      expect(root.root.tag).toBe("figure");
      const text = root.root.children.find((c) => c.attrs["data-part"] === "text")!;
      expect(text.tag).toBe("blockquote");
      const author = root.root.children.find((c) => c.attrs["data-part"] === "author");
      if (author) expect(author.tag).toBe("figcaption");
    }
  });

  it("the opening mark is generated content in the document's own quotation glyph, with an empty alternative", () => {
    expect(css).toContain("content: open-quote;");
    expect(css).toContain('content: open-quote / "";');
  });

  it("the card variant reads the card aliases and the hover lift", () => {
    const card = /\[data-ui="quote"\]\[data-variant="card"\] \{([^}]*)\}/.exec(css)![1];
    for (const t of ["--card-padding", "--card-border-width", "--card-border", "--card-radius", "--card-bg", "--card-shadow"]) expect(card).toContain(`var(${t})`);
    expect(css).toContain("translate: var(--motion-hover-lift);");
  });
});

describe("rating · one labelled image", () => {
  const html = read("rating", "html");
  const css = stripComments(read("rating", "css"));

  it("every instance is an empty span with role=img and a label that states the score", () => {
    const roots = extractComponents(html, "fragment.html").filter((c) => c.name === "rating");
    expect(roots.length).toBeGreaterThan(4);
    for (const root of roots) {
      expect(root.root.tag).toBe("span");
      expect(root.root.children).toHaveLength(0);
      expect(root.root.attrs["role"]).toBe("img");
      expect(root.root.attrs["aria-label"]).toMatch(/Rated|rated/);
    }
  });

  it("the fill is value over five, in half steps, filling from the start edge", () => {
    expect(css).toContain("calc(var(--faqir-rating) * 20%)");
    for (const v of ["0.5", "2.5", "4.5"]) expect(css).toContain(`[data-value="${v}"]`);
    expect(css).toContain(':dir(rtl) {\n  background-image: linear-gradient(to left');
  });

  it("forced colours keep filled and empty distinct", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain("Highlight");
    expect(forced).toContain("GrayText");
  });
});

describe("timeline · an ordered list down a rail", () => {
  const html = read("timeline", "html");
  const css = stripComments(read("timeline", "css"));

  it("every instance is an <ol> of <li> items with aria-hidden markers and a content block", () => {
    const roots = extractComponents(html, "fragment.html").filter((c) => c.name === "timeline");
    expect(roots.length).toBe(3);
    for (const root of roots) {
      expect(root.root.tag).toBe("ol");
      for (const item of root.root.children) {
        expect(item.tag).toBe("li");
        expect(item.attrs["data-part"]).toBe("item");
        const marker = item.children.find((c) => c.attrs["data-part"] === "marker")!;
        expect(marker.attrs["aria-hidden"]).toBe("true");
        expect(item.children.some((c) => c.attrs["data-part"] === "content")).toBe(true);
      }
    }
  });

  it("each item draws its own rail segment and the last item none", () => {
    expect(css).toContain('[data-ui="timeline"] > [data-part="item"]::before {');
    expect(css).toContain('[data-ui="timeline"] > [data-part="item"]:last-child::before {\n  content: none;');
    expect(css).toContain("inset-block: 0 calc(var(--faqir-timeline-gap) * -1);");
  });

  it("status is declared on the item, progress is guarded by @supports, both stop under reduced motion", () => {
    expect(manifest("timeline").props?.status?.attr).toBe("data-status");
    const guard = /@supports \(animation-timeline: view\(\)\) \{([\s\S]*?)\n\}/.exec(css)![1];
    expect(guard).toContain("[data-progress]");
    expect(guard).toContain("animation-timeline: view();");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain('[data-status="current"] > [data-part="marker"]::after');
  });

  it("the alternate layout starts at the md floor and keeps the one-sided list below it", () => {
    expect(css).toContain("@media (min-width: 48rem)");
    expect(css.slice(0, css.indexOf("@media (min-width: 48rem)"))).not.toContain('[data-variant="alternate"]');
  });
});

describe("scroll-progress · hidden until it can report", () => {
  const css = stripComments(read("scroll-progress", "css"));

  it("is display:none outside the @supports guard and a scroll timeline inside it", () => {
    const root = /\[data-ui="scroll-progress"\] \{([^}]*)\}/.exec(css)![1];
    expect(root).toContain("display: none;");
    expect(root).toContain("pointer-events: none;");
    expect(root).toContain("scale: 0 1;");
    const guard = /@supports \(animation-timeline: scroll\(\)\) \{([\s\S]*?)\n\}/.exec(css)![1];
    expect(guard).toContain("display: block;");
    expect(guard).toContain("animation-timeline: scroll(root block);");
    expect(guard).toContain("animation-timeline: scroll(nearest block);");
  });

  it("grows from the start edge in either direction and reads the accent gradient", () => {
    expect(css).toContain("transform-origin: 0 50%;");
    expect(css).toContain(':dir(rtl) {\n  transform-origin: 100% 50%;');
    expect(css).toContain("var(--scroll-progress-color, var(--gradient-accent, var(--color-primary)))");
  });

  it("the nearest scope is sticky outside the guard, so the fixed-region rule sees it", () => {
    const outside = css.slice(0, css.indexOf("@supports"));
    expect(outside).toContain('[data-scope="nearest"] {\n  position: sticky;');
  });
});
