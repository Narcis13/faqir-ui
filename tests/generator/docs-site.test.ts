// Documentation-site generator tests (task 0.7-13, FAQIR-PLAN §13).
//
// The site is the framework's own proof: it is built from registry components
// and design tokens only, and every word of its content comes from a manifest.
// These tests hold it to exactly that:
//
//  • coverage — every registry component gets a page, a nav entry and a live
//    example, and adding a component to a registry adds all three with no edit
//    to `site/` (proven against a real copied registry, not a mock).
//  • fidelity — page content matches the manifest (anatomy, variants, states,
//    a11y, tokens spot-asserted against the fixtures).
//  • the gates — every page the generator authors is `faqir audit`-clean at
//    every severity; example pages (verbatim registry markup) are held to the
//    document rules, the same scope the registry's own self-audit applies to
//    that markup, with a meta-test proving the split is content-derived and not
//    a per-component escape hatch.
//  • idempotence + links — regeneration is byte-identical, and no link the site
//    authors is broken.
//  • static hosting — the built directory is served over plain HTTP and every
//    page class is fetched and checked.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { dirname, join } from "node:path";
import {
  buildDocsSite,
  discoverDocsComponents,
  discoverThemes,
  hasOwnMain,
  isExamplePage,
  isFramePage,
  isShellPage,
  isSitePage,
  parseTokenReference,
  relUrl,
  sanitizeReferenceFragment,
  splitReferenceDemos,
  tokenAnchor,
  DOCS_GENERATION_MARKER,
  EXAMPLE_GUTTER,
  EXAMPLE_MEASURE,
  type DocsComponent,
  type SiteFile,
} from "../../src/generator/docs";
import { auditHtmlSource } from "../../src/audit/checker";
import { ALL_RULES, DOCUMENT_RULES } from "../../src/audit/rules";
import { parseDocument } from "../../src/parser/html-parser";
import { discoverComponents as discoverA11yComponents } from "../visual/matrix";
import type { Manifest } from "../../src/manifest";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const TMP = join(import.meta.dir, "../.tmp-docs-site");

const components = discoverDocsComponents(REGISTRY);
const themes = discoverThemes(REGISTRY);
const files = buildDocsSite();
const byPath = new Map(files.map((f) => [f.path, f.content]));
const sitePages = files.filter((f) => isSitePage(f.path));
const examplePages = files.filter((f) => isExamplePage(f.path));
// Site pages split into two layouts: the navigable ones carry the dashboard-shell,
// `frames/**` are rendered inside an <iframe> and carry no navigation. Both are held
// to the same audit + axe gate — the split is about layout, not about rigour.
const shellPages = files.filter((f) => isShellPage(f.path));
const framePages = files.filter((f) => isFramePage(f.path));

/** Manifests keyed the way `faqir audit` keys them: canonical names + aliases. */
function auditManifests(): Map<string, Manifest> {
  const map = new Map<string, Manifest>();
  for (const c of components) {
    map.set(c.name, c.manifest);
    for (const alias of c.manifest.aliases ?? []) map.set(alias, c.manifest);
  }
  return map;
}

function page(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`no such generated page: ${path}`);
  return content;
}

function find(name: string, layer: string): DocsComponent {
  const c = components.find((x) => x.name === name && x.layer === layer);
  if (!c) throw new Error(`fixture component missing from registry: ${layer}/${name}`);
  return c;
}

// ── coverage ────────────────────────────────────────────────────────────────

describe("docs site coverage", () => {
  it("emits a page, a nav entry and a live example for every registry component", () => {
    expect(components.length).toBeGreaterThan(50); // tripwire: discovery must not go empty

    const home = page("index.html");
    for (const c of components) {
      expect(byPath.has(c.pagePath), `missing page for ${c.layer}/${c.name}`).toBe(true);
      expect(byPath.has(c.examplePath), `missing example for ${c.layer}/${c.name}`).toBe(true);
      // The nav is rendered into every page from the same list, so the home page
      // is a sufficient witness that the component is reachable.
      expect(home, `${c.name} missing from the navigation shell`).toContain(
        `href="${c.pagePath}"`,
      );
    }
  });

  it("gives same-named components in different layers distinct pages", () => {
    // `empty-state` ships as both a primitive and a pattern — a name-keyed site
    // would silently drop one of them.
    const dupes = components.filter((c) => c.name === "empty-state");
    expect(dupes.length).toBe(2);
    const paths = new Set(dupes.map((c) => c.pagePath));
    expect(paths.size).toBe(2);
    for (const p of paths) expect(byPath.has(p)).toBe(true);
  });

  it("emits exactly one page class per file and nothing unclassified", () => {
    const html = files.filter((f) => f.path.endsWith(".html"));
    expect(html.length).toBe(sitePages.length + examplePages.length);
    expect(shellPages.length + framePages.length).toBe(sitePages.length);
    // home, component index, layout guide, responsive lab, tokens, playground,
    // theme gallery, and agents
    expect(shellPages.length).toBe(components.length + 8);
    // one gallery frame per theme
    expect(framePages.length).toBe(themes.length);
    const assets = files.filter((f) => !f.path.endsWith(".html")).map((f) => f.path);
    expect(assets.sort()).toEqual(
      [
        "_headers",
        "llms-full.txt",
        "llms.txt",
        "manifest.schema.json",
        "registry-index.json",
        "scripts/copy-snippet.js",
        "scripts/faqir-audit.js",
        "scripts/faqir-core.js",
        "scripts/faqir-manifests.js",
        "scripts/gallery.js",
        "scripts/playground.js",
        "styles/faqir.css",
        ...themes.map((t) => t.stylePath),
        // One copy-for-agents payload per component that ships reference markup
        // — a text payload, deliberately not a page (see `snippetPath`).
        ...examplePages.map((f) =>
          f.path.replace(/^examples\//, "snippets/").replace(/\.html$/, ".html.txt"),
        ),
      ].sort(),
    );
  });

  it("stamps every generated page with the generation marker", () => {
    for (const f of files.filter((x) => x.path.endsWith(".html"))) {
      expect(f.content, `${f.path} is not marked as generated`).toContain(
        DOCS_GENERATION_MARKER,
      );
    }
  });

  it("publishes a dedicated responsive layout lab", () => {
    const layouts = page("layouts/index.html");
    expect(layouts).toContain("Live layout lab");
    expect(layouts).toContain('data-ui="cluster"');
    expect(layouts).toContain('data-ui="switcher"');
    expect(layouts).toContain('data-cols-lg="4"');
    expect(layouts).toContain('scripts/faqir-core.js');
  });
});

// ── manifest fidelity ───────────────────────────────────────────────────────

describe("component pages match their manifest", () => {
  it("renders button's anatomy, full variant matrix, states and tokens", () => {
    const button = find("button", "primitives");
    const html = page(button.pagePath);
    const m = button.manifest;

    // Anatomy: the selector and tag come straight out of the manifest.
    expect(html).toContain(m.anatomy.selector);
    expect(html).toContain(`&lt;${m.anatomy.tag}&gt;`);
    expect(html).toContain(m.anatomy.content_model);

    // Variant matrix: every declared value, as the attribute an author writes.
    for (const [, variant] of Object.entries(m.variants)) {
      for (const value of variant.values) {
        expect(html, `missing ${variant.attr}="${value}"`).toContain(
          `<code>${variant.attr}="${value}"</code>`,
        );
      }
    }

    // States and their attributes.
    for (const [name, state] of Object.entries(m.states)) {
      expect(html, `missing state ${name}`).toContain(`>${name}<`);
      if (state.attr) expect(html).toContain(esc(state.attr));
    }

    // Tokens: linked into the token reference by anchor.
    expect(html).toContain(`#${tokenAnchor("color-primary")}`);
    expect(html).toContain("--radius-md");
  });

  it("renders dialog's accessibility contract from a11y", () => {
    const dialog = find("dialog", "recipes");
    const html = page(dialog.pagePath);
    const a = dialog.manifest.a11y;

    if (a.role) expect(html).toContain(`<code>${a.role}</code>`);
    if (a.focus_trap) expect(html).toContain("Focus trap");
    for (const key of Object.keys(a.keyboard ?? {})) {
      expect(html, `missing keyboard row for ${key}`).toContain(`<code>${key}</code>`);
    }
    // A recipe advertises its controller file.
    expect(html).toContain(dialog.manifest.files.js!);
  });

  it("renders slots as an anatomy tree plus a slot table", () => {
    const card = find("card", "primitives");
    const html = page(card.pagePath);
    for (const [name, slot] of Object.entries(card.manifest.slots)) {
      expect(html, `missing slot ${name}`).toContain(esc(slot.selector));
    }
    // The required/optional split is part of the contract, so it must be visible.
    expect(html).toContain("required");
    expect(html).toContain("optional");
  });

  it("links composition to the components it names", () => {
    const pricing = find("pricing", "patterns");
    const html = page(pricing.pagePath);
    for (const dep of pricing.manifest.composition.contains) {
      const target = components.find((c) => c.name === dep);
      if (!target) continue; // a name with no registry component stays plain text
      expect(html, `composition should link ${dep}`).toContain(
        relUrl(pricing.pagePath, target.pagePath),
      );
    }
  });

  it("frames each component's own live example", () => {
    for (const c of components) {
      const html = page(c.pagePath);
      expect(html, `${c.name} has no live example frame`).toContain(
        `src="${relUrl(c.pagePath, c.examplePath)}"`,
      );
      expect(html).toContain(`title="${c.name} live example"`);
    }
  });

  it("carries a token reference entry for every token a component declares", () => {
    const tokens = new Map(parseTokenReference(REGISTRY).map((t) => [t.name, t]));
    const tokenPage = page("tokens/index.html");
    expect(tokens.size).toBeGreaterThan(100);

    // Every token the reference lists is anchored, so component pages can link it.
    for (const name of tokens.keys()) {
      expect(tokenPage, `token --${name} has no anchor`).toContain(
        `id="${tokenAnchor(name)}"`,
      );
    }
  });
});

// ── the audit gate ──────────────────────────────────────────────────────────

describe("the site dogfoods faqir audit", () => {
  const manifests = auditManifests();

  it("finds zero issues at any severity on every page the site authors", () => {
    const findings: string[] = [];
    for (const f of sitePages) {
      for (const r of auditHtmlSource({ source: f.content, file: f.path, manifests })) {
        findings.push(`${f.path}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`);
      }
    }
    expect(findings.join("\n")).toBe("");
  });

  it("finds zero document-rule issues on every live-example page", () => {
    // Example pages wrap registry reference markup verbatim. The document rules
    // (duplicate-id, heading-order, landmark, field-wiring) are the framework's
    // page-level contract and are exactly what the registry self-audit runs over
    // this markup — so the wrapper this generator puts around it must not break
    // them (which is what the landmark placement logic exists for).
    const findings: string[] = [];
    for (const f of examplePages) {
      const doc = parseDocument(f.content, f.path);
      for (const rule of DOCUMENT_RULES) {
        for (const r of rule.check(doc)) {
          findings.push(`${f.path}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`);
        }
      }
    }
    expect(findings.join("\n")).toBe("");
  });

  it("satisfies controller-loaded on every example page — the one rule about the wrapper", () => {
    // `controller-loaded` is the only per-component rule that judges what the
    // *generator* put around the fragment (does the page load the engine?) rather
    // than the fragment itself, so it runs over example pages while the rest do
    // not. Recipe examples are live in the docs precisely because this holds.
    const skipRules = [
      ...ALL_RULES.map((r) => r.id).filter((id) => id !== "controller-loaded"),
      ...DOCUMENT_RULES.map((r) => r.id),
    ];
    const findings: string[] = [];
    for (const f of examplePages) {
      for (const r of auditHtmlSource({ source: f.content, file: f.path, manifests, skipRules })) {
        findings.push(`${f.path} [${r.rule_id}] ${r.message}`);
      }
    }
    expect(findings.join("\n")).toBe("");

    // …and the engine really is referenced, not merely rule-satisfying.
    const recipe = components.find((c) => c.manifest.kind === "recipe" && c.manifest.files.js)!;
    expect(page(recipe.examplePath)).toContain(
      `<script src="${relUrl(recipe.examplePath, "scripts/faqir-core.js")}" defer>`,
    );
  });

  it("the per-component rule split is content-derived: an example page IS its registry fragment", () => {
    // The reason example pages are held to a different rule set is that their
    // body is not the site's markup — it is the registry's, byte for byte. This
    // asserts that claim for every example page, so the split can never become a
    // per-component escape hatch for site markup the generator authored.
    //
    // Since 0.9-03 the fragment is *rendered* rather than pasted: each demo goes
    // into its own captioned block, so the claim is a reconstruction rather than
    // a substring. It is the stronger form of the same statement — every byte of
    // markup on the page is still the registry's, and now that is proven demo by
    // demo instead of in one lump.
    for (const c of components) {
      const fragment = sanitizeReferenceFragment(readFileSync(c.referencePath, "utf8"));
      const rendered = page(c.examplePath);
      if (hasOwnMain(fragment)) {
        expect(rendered, `${c.name}'s example is not the registry fragment`).toContain(fragment);
        continue;
      }
      const blocks = splitReferenceDemos(fragment);
      expect(blocks.length, `${c.name} split into no demos at all`).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(rendered, `${c.name}: a demo block is not registry markup`).toContain(block.html);
      }
      // …and nothing was dropped on the way: the blocks, rejoined, are the
      // fragment itself. Compared with every comment removed from both sides —
      // the top-level ones became captions, and comparing what is left is what
      // proves no *markup* was lost, reordered or invented.
      expect(
        markupOnly(blocks.map((b) => b.html).join("\n")),
        `${c.name}'s demos do not reconstitute its fragment`,
      ).toBe(markupOnly(fragment));
    }
  });

  it("every example page's markup is already covered by the registry a11y matrix", () => {
    // The other half of the same argument, for axe: the docs-site axe spec scans
    // only the pages the generator authors, on the grounds that example markup is
    // scanned where it lives. This proves that ground rather than asserting it —
    // if a component ever shipped a reference page the a11y matrix does not see,
    // the docs site would be publishing unscanned markup and this fails.
    const scanned = new Set(discoverA11yComponents().map((c) => c.name));
    for (const c of components) {
      expect(scanned.has(c.name), `${c.name}'s reference page is not in the a11y matrix`).toBe(
        true,
      );
    }
  });

  it("uses no class attributes and no inline styles anywhere it authors markup", () => {
    // The colour half of this used to be the whole of it: an inline `style` was
    // allowed as long as it referenced tokens. Task 0.9-03 closed the general
    // case — 0.8-03 had already banned one inline escape (`flex-wrap` in the
    // theme frames) and there were four left, each of them layout or paint that
    // a rule keyed on an attribute can express. A site that documents "CSS
    // targets attributes and tokens only" may not carry a style attribute at all.
    for (const f of sitePages) {
      expect(f.content, `${f.path} uses a class attribute`).not.toMatch(/\sclass\s*=/);
      const doc = parseDocument(f.content, f.path);
      const styled = doc.elements.filter((el) => el.attrs["style"] !== undefined);
      expect(
        styled.map((el) => `<${el.tag} style="${el.attrs["style"]}">`).join("\n"),
        `${f.path} carries an inline style attribute`,
      ).toBe("");
    }
  });

  it("keeps example pages outside the per-component audit gate", () => {
    // The 0.7-13 split is deliberate and load-bearing, so it is asserted in both
    // halves. First: no example page is in the set the strict gate iterates.
    expect(examplePages.map((f) => f.path).filter(isSitePage)).toEqual([]);
    expect(sitePages.map((f) => f.path).filter(isExamplePage)).toEqual([]);

    // Second: the split is not cosmetic. The per-component rules genuinely fire
    // on registry reference markup — those pages are deliberately partial demos
    // (a card showing just its header, a dialog with no live controller) — which
    // is why the gate runs them where that markup lives instead of here. If this
    // ever reaches zero the split has stopped being about anything and should be
    // deleted rather than silently kept. (Triaged by 0.9-04 / follow-up 0.7-17.)
    const skipRules = [
      "controller-loaded",
      ...DOCUMENT_RULES.map((r) => r.id),
    ];
    const findings = examplePages.flatMap((f) =>
      auditHtmlSource({ source: f.content, file: f.path, manifests, skipRules }),
    );
    expect(findings.length).toBeGreaterThan(0);
  });
});

// ── the example-page shell (task 0.9-03) ────────────────────────────────────

describe("example pages carry a measure and a gutter", () => {
  it("mounts every fragment in a container with a bounded measure and a real gutter", () => {
    // A property over all 86, not a sample: 84 of them rendered flush to x = 0
    // before this shell existed, with `avatar` and `skeleton` clipped by the
    // viewport edge and a text input stretched across the whole window.
    const declared = JSON.parse(
      readFileSync(join(REGISTRY, "primitives", "container", "container.manifest.json"), "utf8"),
    ) as { variants: Record<string, { values: string[] }>; props: Record<string, { values: string[] }> };
    const measures = declared.variants.measure.values;
    const gutters = declared.props.gutter.values;

    // The measure and the gutter are the primitive's own vocabulary — the site
    // must not invent a value to fix its own showcase — and both must actually
    // bound something: `full` is the opt-out, `0` is no gutter at all.
    expect(measures).toContain(EXAMPLE_MEASURE);
    expect(EXAMPLE_MEASURE).not.toBe("full");
    expect(gutters).toContain(EXAMPLE_GUTTER);
    expect(EXAMPLE_GUTTER).not.toBe("0");

    const column =
      `<div data-ui="container" data-measure="${EXAMPLE_MEASURE}" data-gutter="${EXAMPLE_GUTTER}">`;
    const ownDocument: string[] = [];
    for (const c of components) {
      const fragment = sanitizeReferenceFragment(readFileSync(c.referencePath, "utf8"));
      if (hasOwnMain(fragment)) {
        ownDocument.push(c.name);
        continue;
      }
      expect(page(c.examplePath), `${c.name}'s example has no measure column`).toContain(column);
    }
    // The exemption is content-derived, never a per-component list: a fragment
    // that declares its own `main` is a whole app shell that runs edge to edge
    // and paints its own inset (layout-lint already measures a gutter on both).
    // Naming them here is the tripwire — a third one appearing is a decision,
    // not an accident.
    expect(ownDocument.sort()).toEqual(["dashboard-shell", "sidebar"]);
  });

  it("keeps the measure column out of the copy-for-agents payload", () => {
    // The payload is what someone pastes into an empty file, so it stays the
    // minimal example: the shell and the captions are a docs rendering.
    for (const c of components) {
      const snippet = byPath.get(`snippets/${c.layer}/${c.name}.html.txt`);
      if (!snippet) continue;
      expect(snippet, `${c.name}'s payload leaked the docs shell`).not.toContain(
        "data-docs-demo",
      );
      // The exact column, not just its attributes: `container`'s own reference
      // fragment demonstrates `data-gutter="4"`, and that is the component doing
      // its job rather than the shell leaking.
      expect(snippet).not.toContain(
        `<div data-ui="container" data-measure="${EXAMPLE_MEASURE}" data-gutter="${EXAMPLE_GUTTER}">`,
      );
    }
  });
});

describe("demo captions are lifted from the fragments' own comments", () => {
  it("splits a fragment at its top-level comments and nowhere else", () => {
    const blocks = splitReferenceDemos(
      [
        "<!-- Default -->",
        '<span data-ui="badge">Badge</span>',
        "<!-- Sizes -->",
        '<div data-ui="wrap">',
        "  <!-- not a boundary: this comment is nested -->",
        '  <span data-ui="badge" data-size="sm">Small</span>',
        "</div>",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.caption)).toEqual(["Default", "Sizes"]);
    expect(blocks[1].html).toContain("not a boundary");
    expect(blocks.every((b) => b.note === null)).toBe(true);
  });

  it("takes the caption from the nearest label and keeps the rest as a note", () => {
    const blocks = splitReferenceDemos(
      [
        "<!--",
        "  ─────────────────────────",
        "  Orientation prose the author wrote once, above the first demo.",
        "  ─────────────────────────",
        "-->",
        "<!-- Square (default) -->",
        '<div data-ui="aspect-ratio"></div>',
      ].join("\n"),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].caption).toBe("Square (default)");
    expect(blocks[0].note).toBe("Orientation prose the author wrote once, above the first demo.");
  });

  it("emits no caption element at all for a fragment that labels nothing", () => {
    const blocks = splitReferenceDemos('<div data-ui="tree-view"></div>');
    expect(blocks).toEqual([
      { caption: null, note: null, html: '<div data-ui="tree-view"></div>' },
    ]);
  });

  it("renders the labels a fragment already carries, in both directions", () => {
    // Direction one: a fragment WITH labels renders them, verbatim, as captions.
    const badge = find("badge", "primitives");
    const rendered = page(badge.examplePath);
    for (const caption of ["Default", "Variants", "Sizes"]) {
      expect(rendered, `badge's "${caption}" demo is unlabelled`).toContain(
        `<figcaption data-docs-demo-caption>${caption}</figcaption>`,
      );
    }
    expect((rendered.match(/<figure data-docs-demo>/g) ?? []).length).toBe(3);

    // Direction two: a fragment WITHOUT labels stays uncaptioned rather than
    // emitting an empty caption element. Derived, not hard-coded: every fragment
    // whose comments carry no label must produce no <figcaption> anywhere.
    const unlabelled = components.filter((c) => {
      const fragment = sanitizeReferenceFragment(readFileSync(c.referencePath, "utf8"));
      return (
        !hasOwnMain(fragment) &&
        splitReferenceDemos(fragment).every((b) => b.caption === null)
      );
    });
    expect(unlabelled.length).toBeGreaterThan(0);
    for (const c of unlabelled) {
      expect(page(c.examplePath), `${c.name} emitted an empty caption`).not.toContain(
        "<figcaption",
      );
      expect(page(c.examplePath)).toContain("<figure data-docs-demo>");
    }
  });

  it("captions no fragment that this task edited — the labels were already there", () => {
    // 0.9-03 is a rendering change, which is what keeps 0.9-04 mechanical. Every
    // caption on the site must be findable, character for character, in the
    // registry file it came from.
    let captions = 0;
    for (const c of components) {
      const source = readFileSync(c.referencePath, "utf8");
      for (const [, caption] of page(c.examplePath).matchAll(
        /<figcaption data-docs-demo-caption>([^<]*)<\/figcaption>/g,
      )) {
        captions++;
        expect(source, `${c.name}'s caption "${caption}" is not in its fragment`).toContain(
          caption.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
        );
      }
    }
    expect(captions).toBeGreaterThan(300);
  });
});

// ── navigation shell ────────────────────────────────────────────────────────

describe("navigation shell", () => {
  it("wraps every navigable site page in the dashboard-shell landmarks", () => {
    for (const f of shellPages) {
      expect(f.content, `${f.path} has no shell`).toContain('data-ui="dashboard-shell"');
      expect(f.content).toContain('data-part="sidebar"');
      expect(f.content).toContain('role="banner"');
      expect(f.content).toContain('data-part="content" role="main"');
      expect(f.content).toContain('data-part="footer"');
    }
  });

  it("marks exactly one nav entry as the current page", () => {
    for (const f of shellPages) {
      // Counted on parsed ELEMENTS, not on the source text: `data-part="nav-item"`
      // and `aria-current="page"` also appear as *documentation* on the pages that
      // document dashboard-shell or breadcrumb, escaped inside a <code> block.
      const doc = parseDocument(f.content, f.path);
      const current = doc.elements.filter(
        (el) => el.attrs["data-part"] === "nav-item" && el.attrs["aria-current"] === "page",
      );
      expect(current.length, `${f.path} marks ${current.length} current nav entries`).toBe(1);
    }
    // …and it is the entry for the page itself.
    const button = find("button", "primitives");
    expect(page(button.pagePath)).toContain(
      `href="${relUrl(button.pagePath, button.pagePath)}" aria-current="page"`,
    );
  });

  it("names both navigation landmarks so they can be told apart", () => {
    const html = page("index.html");
    expect(html).toContain('aria-label="Documentation"');
    expect(html).toContain('aria-label="Site sections"');
  });
});

// ── links ───────────────────────────────────────────────────────────────────

describe("link integrity", () => {
  /** Ids declared by a generated page, parsed with the framework's own tokenizer. */
  const idCache = new Map<string, Set<string>>();
  function idsOf(path: string): Set<string> {
    let ids = idCache.get(path);
    if (!ids) {
      const doc = parseDocument(page(path), path);
      ids = new Set(doc.elements.map((e) => e.attrs["id"]).filter(Boolean) as string[]);
      idCache.set(path, ids);
    }
    return ids;
  }

  /** Resolve a site-relative URL against the directory of the page holding it. */
  function resolveHref(fromPage: string, href: string): string {
    const parts = fromPage.includes("/") ? fromPage.slice(0, fromPage.lastIndexOf("/")).split("/") : [];
    for (const seg of href.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== "." && seg !== "") parts.push(seg);
    }
    return parts.join("/");
  }

  it("resolves every link and anchor the site itself authors", () => {
    const broken: string[] = [];
    for (const f of files) {
      if (!f.path.endsWith(".html")) continue;
      const site = isSitePage(f.path);
      const doc = parseDocument(f.content, f.path);
      for (const el of doc.elements) {
        // On an example page only the assets are the generator's — everything in
        // its <body> is verbatim registry demo markup whose `href="/"` and
        // `href="#pricing"` placeholders point at an imaginary host app.
        if (!site && el.tag !== "link" && el.tag !== "script") continue;
        for (const attr of ["href", "src"]) {
          const raw = el.attrs[attr];
          if (!raw || raw === "#" || /^(?:https?:|mailto:|tel:|data:)/i.test(raw)) continue;
          const [pathPart, anchor] = raw.split("#");
          const target = pathPart ? resolveHref(f.path, pathPart) : f.path;
          if (!byPath.has(target)) {
            broken.push(`${f.path} → ${raw} (no such file: ${target})`);
            continue;
          }
          if (anchor && site && !idsOf(target).has(anchor)) {
            broken.push(`${f.path} → ${raw} (no id="${anchor}" in ${target})`);
          }
        }
      }
    }
    expect(broken.join("\n")).toBe("");
  });

  it("keeps every page network-free — no external asset is referenced", () => {
    for (const f of files) {
      if (!f.path.endsWith(".html")) continue;
      const doc = parseDocument(f.content, f.path);
      for (const el of doc.elements) {
        const src = el.attrs["src"];
        if (!src) continue;
        expect(src, `${f.path} <${el.tag}> loads ${src} over the network`).not.toMatch(
          /^https?:/i,
        );
      }
    }
  });
});

// ── stylesheet ──────────────────────────────────────────────────────────────

describe("site stylesheet", () => {
  const css = page("styles/faqir.css");

  it("carries tokens, base and every component stylesheet", () => {
    expect(css).toContain("--space-4");           // spacing tokens
    expect(css).toContain('[data-ui="prose"]');   // base
    // Every component's CSS verbatim — asserted on the file bytes, not on a
    // selector, because a composition-only pattern (form-page) styles its parts
    // through the components it composes and declares no root selector at all.
    for (const c of components) {
      const cssPath = join(REGISTRY, c.layer, c.name, c.manifest.files.css);
      if (!existsSync(cssPath)) continue;
      expect(css, `stylesheet is missing ${c.layer}/${c.name}`).toContain(
        readFileSync(cssPath, "utf8").trim(),
      );
    }
  });

  it("inlines nothing and imports nothing — one file, no network", () => {
    expect(css).not.toContain("@import");
    expect(css).not.toMatch(/url\(\s*["']?https?:/i);
  });
});

// ── idempotence ─────────────────────────────────────────────────────────────

describe("regeneration", () => {
  it("is byte-identical when run twice", () => {
    const again = buildDocsSite();
    expect(again.map((f) => f.path)).toEqual(files.map((f) => f.path));
    for (let i = 0; i < again.length; i++) {
      expect(again[i].content, `${again[i].path} is not deterministic`).toBe(files[i].content);
    }
  });

  it("contains no timestamp that would break the drift gate", () => {
    for (const f of sitePages) {
      expect(f.content).not.toMatch(/\b20\d\d-\d\d-\d\dT\d\d:\d\d/);
    }
  });
});

// ── zero site edits ─────────────────────────────────────────────────────────

describe("adding a component to the registry", () => {
  const scratch = join(TMP, "registry-plus-one");

  beforeAll(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    cpSync(REGISTRY, scratch, { recursive: true });

    const dir = join(scratch, "primitives", "zz-probe");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "zz-probe.manifest.json"),
      JSON.stringify(
        {
          name: "zz-probe",
          version: "1.0.0",
          kind: "primitive",
          category: "feedback",
          description: "A probe component that exists only to prove the site needs no edits.",
          anatomy: { tag: "span", selector: "[data-ui='zz-probe']", content_model: "inline" },
          slots: {},
          variants: {
            visual: { values: ["default", "loud"], default: "default", attr: "data-variant", applied_to: "root" },
            // A responsive group (task 0.8-02): the page must grow a tier
            // column from the declaration alone, with no site-side edit.
            cols: { values: ["1", "2", "3"], default: "1", attr: "data-cols", applied_to: "root", responsive: true },
          },
          states: { default: { attr: 'data-state="default"', default: true } },
          a11y: { keyboard: {} },
          tokens_used: ["color-primary"],
          templates: { html: '<span data-ui="zz-probe">{text}</span>' },
          safe_transforms: [],
          unsafe_transforms: [],
          composition: { contains: [], used_in: [] },
          files: { html: "zz-probe.html", css: "zz-probe.css", manifest: "zz-probe.manifest.json" },
          tests: [],
        },
        null,
        2,
      ),
    );
    // The demo carries a label, the way every fragment in the registry does —
    // that is what the example page lifts into a visible caption (task 0.9-03),
    // and a probe with no label would prove the shell but not the rendering.
    writeFileSync(
      join(dir, "zz-probe.html"),
      '<!-- @ui:component zz-probe -->\n<!-- Probe row -->\n<span data-ui="zz-probe">Probe</span>\n',
    );
    writeFileSync(
      join(dir, "zz-probe.css"),
      '[data-ui="zz-probe"] { color: var(--color-primary); }\n',
    );
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("adds its page, nav entry, live example and CSS with no edit to site/", () => {
    const grown = buildDocsSite({ registryRoot: scratch });
    const grownByPath = new Map(grown.map((f) => [f.path, f.content]));

    expect(grownByPath.has("components/primitives/zz-probe.html")).toBe(true);
    expect(grownByPath.has("examples/primitives/zz-probe.html")).toBe(true);
    // …and its copy-for-agents payload (task 0.7-15), which is derived from the
    // same reference fragment and therefore appears for free.
    expect(grownByPath.has("snippets/primitives/zz-probe.html.txt")).toBe(true);

    // Nav: present on every page, including the ones that existed before.
    expect(grownByPath.get("index.html")).toContain(
      'href="components/primitives/zz-probe.html"',
    );
    expect(grownByPath.get("components/primitives/button.html")).toContain(
      'href="../../components/primitives/zz-probe.html"',
    );

    // Content: derived from the new manifest, not from a site template.
    const probe = grownByPath.get("components/primitives/zz-probe.html")!;
    expect(probe).toContain("A probe component that exists only to prove the site needs no edits.");
    expect(probe).toContain('<code>data-variant="loud"</code>');
    expect(probe).toContain(`#${tokenAnchor("color-primary")}`);

    // A responsive group renders the tier grammar in the variant matrix —
    // generic, derived from `"responsive": true` plus the breakpoint canon.
    expect(probe).toContain('<th scope="col">Responsive</th>');
    for (const tier of ["sm", "md", "lg", "xl"]) {
      expect(probe).toContain(`<code>data-cols-${tier}="…"</code>`);
    }
    // …and the non-responsive group in the same table stays dashed, so the
    // column reads as a per-group declaration rather than a page-wide claim.
    expect(probe).toMatch(/data-variant="loud"<\/code>[\s\S]*?<td>—<\/td>/);

    // A component with no responsive group grows no column at all.
    expect(grownByPath.get("components/primitives/button.html")).not.toContain("Responsive</th>");

    // And its stylesheet is in the bundle.
    expect(grownByPath.get("styles/faqir.css")).toContain('[data-ui="zz-probe"]');

    // Its example page gets the shell every other example page gets, with no
    // site-side edit either: the measure column, the gutter, and the caption
    // lifted out of the fragment's own comment (task 0.9-03).
    const example = grownByPath.get("examples/primitives/zz-probe.html")!;
    expect(example).toContain(
      `<div data-ui="container" data-measure="${EXAMPLE_MEASURE}" data-gutter="${EXAMPLE_GUTTER}">`,
    );
    expect(example).toContain(
      "<figure data-docs-demo>\n<figcaption data-docs-demo-caption>Probe row</figcaption>",
    );

    // The site grew by exactly one component's worth of files: page, live
    // example, agent snippet.
    expect(grown.length).toBe(files.length + 3);
  });

  it("keeps the new page audit-clean without any site-side special casing", () => {
    const grown = buildDocsSite({ registryRoot: scratch });
    const manifests = auditManifests();
    const probe = grown.find((f) => f.path === "components/primitives/zz-probe.html")!;
    const results = auditHtmlSource({ source: probe.content, file: probe.path, manifests });
    expect(results.map((r) => `${r.severity}/${r.rule_id}`).join(",")).toBe("");
  });
});

// ── static hosting ──────────────────────────────────────────────────────────

describe("the built directory is static-hostable", () => {
  const outDir = join(TMP, "dist");
  let server: import("node:http").Server | null = null;
  let port = 0;

  beforeAll(async () => {
    rmSync(outDir, { recursive: true, force: true });
    for (const f of files) {
      const abs = join(outDir, f.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, f.content);
    }
    // A deliberately dumb static server: map the URL path onto a file, no
    // rewrites, no index fallback beyond `/` → index.html. If the site needs
    // anything more than this, it is not statically hostable.
    server = createServer((req, res) => {
      const path =
        decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname).replace(/^\//, "") ||
        "index.html";
      const abs = join(outDir, path);
      if (!abs.startsWith(outDir) || !existsSync(abs)) {
        res.writeHead(404).end("not found");
        return;
      }
      const type = path.endsWith(".css")
        ? "text/css"
        : path.endsWith(".js")
          ? "text/javascript"
          : "text/html";
      res.writeHead(200, { "content-type": type }).end(readFileSync(abs));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    port = (server!.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    rmSync(TMP, { recursive: true, force: true });
  });

  it("serves the home page, a component page, an example, the stylesheet and the engine", async () => {
    const home = await get(port, "/");
    expect(home.status).toBe(200);
    expect(home.body).toContain("The interface is the contract.");

    const button = await get(port, "/components/primitives/button.html");
    expect(button.status).toBe(200);
    expect(button.body).toContain("<h1>button</h1>");

    const example = await get(port, "/examples/primitives/button.html");
    expect(example.status).toBe(200);
    expect(example.body).toContain('data-ui="button"');

    const css = await get(port, "/styles/faqir.css");
    expect(css.status).toBe(200);
    expect(css.body).toContain('[data-ui="button"]');

    const js = await get(port, "/scripts/faqir-core.js");
    expect(js.status).toBe(200);
    expect(js.body.length).toBeGreaterThan(1000);
  });

  it("resolves every asset a served page asks for", async () => {
    // Walk the links of one page from each class exactly as a browser would.
    for (const start of ["index.html", "components/recipes/dialog.html", "examples/recipes/dialog.html"]) {
      const res = await get(port, `/${start}`);
      expect(res.status).toBe(200);
      const doc = parseDocument(res.body, start);
      for (const el of doc.elements) {
        if (el.tag !== "link" && el.tag !== "script" && el.tag !== "iframe") continue;
        const raw = el.attrs["href"] ?? el.attrs["src"];
        if (!raw || /^(?:https?:|data:)/i.test(raw)) continue;
        const url = new URL(raw, `http://127.0.0.1:${port}/${start}`);
        const asset = await get(port, url.pathname);
        expect(asset.status, `${start} → ${raw}`).toBe(200);
      }
    }
  });
});

// ── the build script ────────────────────────────────────────────────────────

describe("bun run build:docs", () => {
  const outDir = join(TMP, "script-out");
  const script = join(REPO, "scripts", "build-docs.mjs");

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("writes a static directory, and --check gates it against drift", async () => {
    rmSync(outDir, { recursive: true, force: true });

    const build = Bun.spawnSync(["bun", script, "--out", outDir], { cwd: REPO });
    expect(build.exitCode, build.stderr.toString()).toBe(0);
    expect(build.stdout.toString()).toContain("site pages");

    // The directory a static host would serve.
    expect(existsSync(join(outDir, "index.html"))).toBe(true);
    expect(existsSync(join(outDir, "components", "primitives", "button.html"))).toBe(true);
    expect(existsSync(join(outDir, "examples", "primitives", "button.html"))).toBe(true);
    expect(existsSync(join(outDir, "tokens", "index.html"))).toBe(true);
    expect(existsSync(join(outDir, "styles", "faqir.css"))).toBe(true);

    // Fresh output matches a fresh generation…
    const check = Bun.spawnSync(["bun", script, "--check", "--out", outDir], { cwd: REPO });
    expect(check.exitCode, check.stderr.toString()).toBe(0);

    // …and the gate bites when it does not.
    writeFileSync(join(outDir, "index.html"), "<!doctype html><title>stale</title>");
    const stale = Bun.spawnSync(["bun", script, "--check", "--out", outDir], { cwd: REPO });
    expect(stale.exitCode).toBe(1);
    expect(stale.stderr.toString()).toContain("index.html");

    // A rebuild is idempotent on disk: same bytes, and nothing left behind.
    const rebuild = Bun.spawnSync(["bun", script, "--out", outDir], { cwd: REPO });
    expect(rebuild.exitCode).toBe(0);
    expect(readFileSync(join(outDir, "index.html"), "utf8")).toBe(page("index.html"));
  }, 60_000);
});

/**
 * A plain node:http GET. The suite registers happy-dom globally, whose `fetch`
 * enforces a same-origin policy against the document's origin and would refuse
 * to talk to the test server (same reason `tests/commands/dev.test.ts` does this).
 */
function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** Match the generator's body-text escaping when asserting on rendered output. */
function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Markup with every comment and every run of whitespace removed — the form in
 * which "these demo blocks are that fragment" is a meaningful comparison. The
 * top-level comments became captions and the whitespace between blocks is the
 * wrapper's, so what is left is exactly the markup, and it must match.
 */
function markupOnly(html: string): string {
  return html.replace(/<!--[^]*?-->/g, "").replace(/\s+/g, " ").trim();
}
