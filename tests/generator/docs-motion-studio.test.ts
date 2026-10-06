// The motion page and the theme studio: the showcase for the choreography
// primitives, the additive effect properties and the faqir-tweak plugin.
//
// `docs-site.test.ts` already holds both pages to the audit gate and the
// no-class/no-inline-style rule, like every site page. These cases hold them to
// what they claim: that every new primitive is demonstrated live (not only in a
// code block), that the token table is the registry's motion file and nothing
// else, and that the studio runs the plugin the registry ships, byte for byte.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDocsSite,
  MOTION_PAGE,
  parseTokenReference,
  STUDIO_PAGE,
  TWEAK_SCRIPT,
} from "../../src/generator/docs";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const files = buildDocsSite();
const byPath = new Map(files.map((file) => [file.path, file.content]));

function file(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`the docs site does not ship ${path}`);
  return content;
}

/** A page with its copyable code blocks removed: only what actually renders. */
function live(path: string): string {
  return file(path).replace(/<pre\b[\s\S]*?<\/pre>/g, "");
}

describe("motion page", () => {
  const CHOREOGRAPHY = [
    "reveal",
    "highlight",
    "backdrop",
    "glow",
    "marquee",
    "quote",
    "rating",
    "timeline",
    "scroll-progress",
  ];

  it("demonstrates every motion and content primitive live, and links its contract", () => {
    const page = live(MOTION_PAGE);
    for (const name of CHOREOGRAPHY) {
      expect(page, `${name} is not demonstrated live`).toContain(`data-ui="${name}"`);
      expect(page, `${name}'s page is not linked`).toContain(
        `href="../components/primitives/${name}.html"`,
      );
    }
  });

  it("shows the additive effect properties on the components that gained them", () => {
    const page = live(MOTION_PAGE);
    for (const hover of ["zoom", "raise", "tint", "lift"]) {
      expect(page).toMatch(new RegExp(`data-ui="card"[^>]*data-hover="${hover}"`));
    }
    for (const effect of ["shine", "pulse", "press"]) expect(page).toContain(`data-effect="${effect}"`);
    for (const effect of ["arrow", "slide"]) expect(page).toContain(`data-ui="link" data-effect="${effect}"`);
    for (const hover of ["zoom", "lift", "fade"]) expect(page).toMatch(new RegExp(`data-ui="image"[^>]*data-hover="${hover}"`));
    expect(page).toMatch(/data-ui="badge"[^>]*data-live/);
  });

  it("tabulates exactly the tokens registry/tokens/motion.css declares", () => {
    const page = file(MOTION_PAGE);
    const motion = parseTokenReference(REGISTRY).filter((entry) => entry.group === "motion");
    expect(motion.map((entry) => entry.name)).toContain("motion-reveal-duration");
    expect(motion.map((entry) => entry.name)).toContain("motion-ambient-play");
    expect(page).not.toContain("<!-- @faqir:motion-tokens -->");
    const tabulated = [...page.matchAll(/<code data-token="--([^"]+)">/g)].map((m) => m[1]);
    expect(tabulated).toEqual(motion.map((entry) => entry.name));
  });

  it("loads the engine for its interactive demos", () => {
    expect(file(MOTION_PAGE)).toContain('<script src="../scripts/faqir-core.js" defer>');
  });
});

describe("theme studio", () => {
  it("ships the registry's faqir-tweak plugin verbatim", () => {
    expect(file(TWEAK_SCRIPT)).toBe(
      readFileSync(join(REGISTRY, "core", "plugins", "faqir-tweak.js"), "utf8"),
    );
  });

  it("mounts l-tweak from a template, after the engine and the plugin load", () => {
    const page = file(STUDIO_PAGE);
    expect(page).toMatch(
      /<template data-docs-studio-mount>\s*<aside l-tweak aria-label="[^"]+"><\/aside>\s*<\/template>/,
    );
    const scripts = [...page.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    expect(scripts).toEqual([
      "../scripts/gallery.js",
      "../scripts/faqir-core.js",
      "../scripts/faqir-tweak.js",
      "../scripts/studio.js",
    ]);
  });

  it("waits for the theme stylesheet before mounting, and reloads on a new theme", () => {
    const studio = readFileSync(join(REPO, "site", "lib", "studio.js"), "utf8");
    const gallery = readFileSync(join(REPO, "site", "lib", "gallery.js"), "utf8");
    expect(gallery).toContain('link.setAttribute("data-theme-loading", "")');
    expect(studio).toContain('hasAttribute("data-theme-loading")');
    expect(studio).toContain("Faqir.initTree(panel)");
    expect(studio).toContain("faqir:appearance");
  });
});

describe("navigation and discovery", () => {
  it("lists both pages in the sidebar, the home map and the sitemap", () => {
    const home = file("index.html");
    const sitemap = file("sitemap.xml");
    for (const path of [MOTION_PAGE, STUDIO_PAGE]) {
      expect(home).toContain(`data-part="nav-item" href="${path}"`);
      expect(home).toContain(`href="${path}"`);
      expect(sitemap).toContain(path.replace(/index\.html$/, ""));
    }
  });

  it("introduces the new registry surface on the home page with the bento pattern", () => {
    const home = live("index.html");
    expect(home).toMatch(/<section data-ui="bento" data-animate aria-labelledby="new-heading"/);
    for (const pattern of ["site-header", "logo-cloud", "testimonials", "cta", "faq", "bento", "article", "post-list"]) {
      expect(home).toContain(`href="components/patterns/${pattern}.html"`);
    }
  });
});

describe("static-host headers", () => {
  it("allow the engine's evaluator, as docs/security.md requires", () => {
    // Without 'unsafe-eval' faqir-core loads and every l-* expression is
    // silently inert: the engine page, the responsive lab, the motion demos.
    expect(file("_headers")).toMatch(/script-src 'self' 'unsafe-eval';/);
  });
});
