// ═══════════════════════════════════════════════════════════════════════════
// playground/landing-craft.html — the landing-craft showcase (docs/landing-craft.md)
// ═══════════════════════════════════════════════════════════════════════════
//
// The page is the proof that the additions compose: a full landing page built
// from registry components, tokens and directives only. What is pinned here is
// exactly that claim — it audits clean, it carries no page CSS and no script
// beyond the engine, every stylesheet it links exists, every component it names
// has its stylesheet linked, and it actually uses each shipped addition.

import { beforeAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { parseDocument } from "../../src/parser/html-parser";
import { DOCUMENT_RULES } from "../../src/audit/rules";

const ROOT = join(import.meta.dir, "../..");
const FILE = join(ROOT, "playground", "landing-craft.html");
const source = readFileSync(FILE, "utf8");
// Loaded in `beforeAll`, not at module scope — see tests/audit/reference-contract.test.ts.
let manifests: Awaited<ReturnType<typeof loadRegistryManifestMap>>;
beforeAll(async () => {
  manifests = await loadRegistryManifestMap(join(ROOT, "registry"));
});

describe("landing-craft showcase", () => {
  it("has zero component findings", () => {
    expect(auditHtmlSource({ source, file: "playground/landing-craft.html", manifests })).toEqual([]);
  });

  it("has zero document-rule findings", () => {
    const doc = parseDocument(source, "landing-craft.html");
    expect(DOCUMENT_RULES.flatMap((rule) => rule.check(doc))).toEqual([]);
  });

  it("carries no page stylesheet and no script but the engine", () => {
    expect(source).not.toMatch(/<style[\s>]/);
    const scripts = [...source.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    expect(scripts).toEqual([' src="../registry/core/faqir-core.js" defer']);
    expect(source).not.toMatch(/\son[a-z]+\s*=/);
    // Inline style is layout glue only: custom-property knobs a manifest declares.
    for (const [, style] of source.matchAll(/\sstyle="([^"]*)"/g)) {
      for (const decl of style.split(";").map((d) => d.trim()).filter(Boolean)) {
        expect(decl.startsWith("--"), `inline declaration "${decl}"`).toBe(true);
      }
    }
  });

  it("links a stylesheet that exists for every component it names", () => {
    const hrefs = [...source.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    for (const href of hrefs) expect(existsSync(resolve(dirname(FILE), href)), href).toBe(true);
    const names = new Set([...source.matchAll(/data-ui="([a-z-]+)"/g)].map((m) => m[1]));
    for (const name of names) {
      const m = manifests.get(name)!;
      expect(m, name).toBeDefined();
      const css = name === "icon" ? "icons.css" : `${name}.css`;
      expect(hrefs.some((h) => h.endsWith(`/${name}/${css}`)), `${name} stylesheet`).toBe(true);
    }
  });

  it("offers the four landing-craft themes", () => {
    for (const theme of ["deco", "clay", "memphis", "monolith"]) {
      expect(source).toContain(`href="../registry/themes/${theme}.css" id="theme-${theme}"`);
      expect(source).toContain(`value="${theme}" l-model="theme"`);
    }
  });

  it("uses every shipped landing-craft addition", () => {
    for (const marker of [
      'data-ui="hero" data-variant="cover" data-animate',
      'data-variant="segmented"',
      'data-part="billing"',
      'data-part="yearly"',
      'data-variant="foil"',
      'data-variant="echo"',
      'data-variant="eyebrow"',
      'data-style="ornament"',
      'data-ui="stamp"',
      'data-ui="spotlight"',
      'data-effect="arrow"',
      'data-effect="sink"',
    ]) {
      expect(source, marker).toContain(marker);
    }
  });

  it("has every landing section: nav, hero, logos, features, testimonial, pricing, CTA, footer", () => {
    for (const name of ["site-header", "hero", "logo-cloud", "bento", "testimonials", "pricing", "cta", "site-footer"]) {
      expect(source).toContain(`data-ui="${name}"`);
    }
  });
});
