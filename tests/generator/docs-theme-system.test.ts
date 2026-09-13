// Theme System 2.0 pages (`src/generator/docs-pages/themes.ts`).
//
// The pages under `themes/` are derived from the axis vocabulary, the family
// renderers, the gates' thresholds and the theme manifests. These tests hold
// them to the docs-site contract: one page per theme plus the axes and
// authoring references, every axis path on the axes page, every theme page
// framing its own preview, audit-clean at every severity, and no class or
// style attribute anywhere.

import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import {
  discoverDocsComponents,
  discoverThemes,
  parseTokenReference,
  readCdnPin,
  readSiteConfig,
  relUrl,
  themePreviewPath,
  THEMES_PAGE,
  type DocsComponent,
} from "../../src/generator/docs";
import type { PageContext } from "../../src/generator/docs-pages/context";
import {
  THEME_AXES_PAGE,
  THEME_AUTHORING_PAGE,
  generateInvocation,
  renderThemeSystemPages,
  themeDetailPath,
} from "../../src/generator/docs-pages/themes";
import { AXIS_PATHS, themeKind } from "../../src/theme/describe";
import { THEME_SEED_AXES } from "../../src/theme-manifest";
import { SEED_FLAGS } from "../../src/theme/seed";
import { FONT_CATALOG } from "../../src/fonts/catalog";
import { auditHtmlSource } from "../../src/audit/checker";
import { parseDocument } from "../../src/parser/html-parser";
import type { Manifest } from "../../src/manifest";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const SITE = join(REPO, "site");

const components = discoverDocsComponents(REGISTRY);
const themes = discoverThemes(REGISTRY);
const byName = new Map<string, DocsComponent>();
for (const c of components) if (!byName.has(c.name)) byName.set(c.name, c);

const ctx: PageContext = {
  config: readSiteConfig(SITE),
  components,
  themes,
  byName,
  tokenList: parseTokenReference(REGISTRY),
  registryRoot: REGISTRY,
  packageRoot: REPO,
  siteRoot: SITE,
  pin: readCdnPin(REPO),
};

const files = renderThemeSystemPages(ctx);
const byPath = new Map(files.map((f) => [f.path, f.content]));

function page(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`no such generated page: ${path}`);
  return content;
}

function auditManifests(): Map<string, Manifest> {
  const map = new Map<string, Manifest>();
  for (const c of components) {
    map.set(c.name, c.manifest);
    for (const alias of c.manifest.aliases ?? []) map.set(alias, c.manifest);
  }
  return map;
}

describe("theme system pages · coverage", () => {
  it("emits the axes page, the authoring page and one page per theme", () => {
    expect(themes.length).toBeGreaterThanOrEqual(10);
    expect(byPath.has(THEME_AXES_PAGE)).toBe(true);
    expect(byPath.has(THEME_AUTHORING_PAGE)).toBe(true);
    for (const theme of themes) {
      expect(byPath.has(themeDetailPath(theme.name)), `${theme.name} has no page`).toBe(true);
    }
    expect(files.length).toBe(themes.length + 2);
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
  });

  it("names every axis path, every top-level axis and every flag on the axes page", () => {
    const axes = page(THEME_AXES_PAGE);
    for (const path of AXIS_PATHS) expect(axes, path).toContain(`<code>${path}</code>`);
    for (const axis of THEME_SEED_AXES) expect(axes).toContain(`id="axis-${axis}"`);
    for (const flag of Object.keys(SEED_FLAGS)) expect(axes, flag).toContain(`--${flag}`);
    expect(axes).toContain("axesFromCss");
    expect(axes).toContain("data-skin");
    expect(axes).toContain('data-density="spacious"');
  });

  it("links every axis-carrying theme from the axes page, and every theme page back to the axes", () => {
    const axes = page(THEME_AXES_PAGE);
    for (const theme of themes) {
      if (!theme.manifest?.axes) continue;
      expect(axes, theme.name).toContain(`href="${relUrl(THEME_AXES_PAGE, themeDetailPath(theme.name))}"`);
    }
    for (const theme of themes) {
      const p = themeDetailPath(theme.name);
      expect(page(p)).toContain(`href="${relUrl(p, THEME_AXES_PAGE)}`);
      expect(page(p)).toContain(`href="${relUrl(p, THEMES_PAGE)}"`);
    }
  });

  it("frames its own preview on every theme page", () => {
    for (const theme of themes) {
      const p = themeDetailPath(theme.name);
      const html = page(p);
      expect(html).toContain(`<iframe src="${relUrl(p, themePreviewPath(theme.name))}"`);
      expect(html).toContain(`data-docs-theme-frame="${theme.name}"`);
    }
  });

  it("describes each theme from its manifest: kind, moods, scheme, scorecard and seed", () => {
    for (const theme of themes) {
      const m = theme.manifest!;
      const html = page(themeDetailPath(theme.name));
      const kind = themeKind(m);
      expect(html).toContain(`>${kind}</span>`);
      for (const mood of m.mood) expect(html, `${theme.name}: ${mood}`).toContain(`>${mood}</span>`);
      expect(html).toContain(`${m.scheme} scheme`);
      expect(html).toContain(`Overridden (${m.tokens_overridden.length})`);
      if (m.distinctiveness) {
        expect(html).toContain(`>${m.distinctiveness.nearest}</a>`);
        expect(html).toContain(`>${m.distinctiveness.axis_distance}</span>`);
      }
      if (m.seed) {
        expect(html).toContain(`faqir theme generate ${theme.name} --seed registry/themes/${theme.name}.seed.json`);
        expect(html).toContain(`--accent`);
        expect(html).toContain(`"accent": "${m.seed.accent}"`);
      } else {
        expect(html).not.toContain("faqir theme generate " + theme.name);
      }
      expect(html).toContain(`faqir theme set ${theme.name}`);
      expect(html).toContain(`faqir theme bundle ${theme.name} --scope`);
    }
  });

  it("threads prev/next through the themes in name order", () => {
    const sorted = [...themes].sort((a, b) => (a.name < b.name ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      const p = themeDetailPath(sorted[i].name);
      const html = page(p);
      if (i > 0) expect(html).toContain(`href="${relUrl(p, themeDetailPath(sorted[i - 1].name))}"`);
      if (i < sorted.length - 1) expect(html).toContain(`href="${relUrl(p, themeDetailPath(sorted[i + 1].name))}"`);
    }
  });

  it("tables the whole font catalogue and the seed format on the authoring page", () => {
    const html = page(THEME_AUTHORING_PAGE);
    for (const entry of FONT_CATALOG) expect(html, entry.id).toContain(`<code>${entry.id}</code>`);
    for (const path of AXIS_PATHS) expect(html, path).toContain(`<code>${path}</code>`);
    expect(html).toContain("light-dark(");
    expect(html).toContain("faqir fonts add");
    expect(html).toContain("visual_matrix");
    for (const id of ["generate", "scorecard", "gate", "light-dark", "rules", "scoped", "fonts", "manifest"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("renders the exact generate invocation, one flag per seed leaf", () => {
    const luxe = themes.find((t) => t.manifest?.seed)!;
    const cmd = generateInvocation(luxe.manifest!.seed!);
    expect(cmd.startsWith(`faqir theme generate ${luxe.name}`)).toBe(true);
    for (const flag of Object.keys(SEED_FLAGS)) expect(cmd, flag).toContain(`--${flag} `);
  });
});

describe("theme system pages · the gates", () => {
  const manifests = auditManifests();

  it("is faqir audit-clean at every severity", () => {
    const findings: string[] = [];
    for (const f of files) {
      for (const r of auditHtmlSource({ source: f.content, file: f.path, manifests })) {
        findings.push(`${f.path}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`);
      }
    }
    expect(findings.join("\n")).toBe("");
  });

  it("carries no class or style attribute and no duplicate id", () => {
    for (const f of files) {
      expect(f.content, f.path).not.toMatch(/\sclass=/);
      expect(f.content, f.path).not.toMatch(/\sstyle=/);
      const doc = parseDocument(f.content, f.path);
      const ids = doc.elements.map((el) => el.attrs.id).filter(Boolean) as string[];
      expect(new Set(ids).size, f.path).toBe(ids.length);
    }
  });

  it("resolves every internal link and anchor it authors", () => {
    const all = new Set(files.map((f) => f.path));
    // Pages the lead's generator emits that these pages may point at.
    const external = new Set<string>([THEMES_PAGE, ...themes.map((t) => themePreviewPath(t.name)), ...themes.map((t) => t.stylePath)]);
    for (const f of files) {
      const doc = parseDocument(f.content, f.path);
      const ids = new Set(doc.elements.map((el) => el.attrs.id).filter(Boolean));
      for (const el of doc.elements) {
        const href = el.attrs.href ?? el.attrs.src;
        if (!href || /^(https?:|mailto:|data:)/.test(href)) continue;
        const [target, anchor] = href.split("#");
        if (target === "") {
          expect(ids.has(anchor), `${f.path}: missing anchor #${anchor}`).toBe(true);
          continue;
        }
        const resolved = join(f.path, "..", target).replace(/\\/g, "/");
        // Only follow links into this module's own pages and the gallery's frames.
        if (all.has(resolved)) {
          if (anchor) {
            const targetIds = new Set(parseDocument(byPath.get(resolved)!, resolved).elements.map((el) => el.attrs.id));
            expect(targetIds.has(anchor), `${f.path}: ${href} has no #${anchor}`).toBe(true);
          }
        } else if (!external.has(resolved)) {
          // The shell's own nav links are the lead's; anything else is ours and must resolve.
          if (target.includes("themes/")) throw new Error(`${f.path}: unresolved link ${href}`);
        }
      }
    }
  });

  it("is deterministic", () => {
    const again = renderThemeSystemPages(ctx);
    expect(again.map((f) => f.content)).toEqual(files.map((f) => f.content));
  });
});
