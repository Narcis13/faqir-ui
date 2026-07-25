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
  isExamplePage,
  isFramePage,
  isShellPage,
  isSitePage,
  parseTokenReference,
  relUrl,
  sanitizeReferenceFragment,
  tokenAnchor,
  DOCS_GENERATION_MARKER,
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
    // home, component index, tokens, the playground and the theme gallery
    expect(shellPages.length).toBe(components.length + 5);
    // one gallery frame per theme
    expect(framePages.length).toBe(themes.length);
    const assets = files.filter((f) => !f.path.endsWith(".html")).map((f) => f.path);
    expect(assets.sort()).toEqual(
      [
        "scripts/faqir-audit.js",
        "scripts/faqir-core.js",
        "scripts/faqir-manifests.js",
        "scripts/gallery.js",
        "scripts/playground.js",
        "styles/faqir.css",
        ...themes.map((t) => t.stylePath),
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
    for (const c of components) {
      const fragment = sanitizeReferenceFragment(readFileSync(c.referencePath, "utf8"));
      expect(page(c.examplePath), `${c.name}'s example is not the registry fragment`).toContain(
        fragment,
      );
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

  it("uses no class attributes and no hardcoded colours anywhere it authors markup", () => {
    for (const f of sitePages) {
      expect(f.content, `${f.path} uses a class attribute`).not.toMatch(/\sclass\s*=/);
      // `#rrggbb`/`rgb()`/`oklch()` literals would mean the site stopped using
      // tokens. Token *values* live on the token page inside <code>, so only
      // attribute positions are checked.
      const doc = parseDocument(f.content, f.path);
      for (const el of doc.elements) {
        const style = el.attrs["style"];
        if (!style) continue;
        expect(style, `${f.path} <${el.tag}> hardcodes a colour`).not.toMatch(
          /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch)\(/i,
        );
      }
    }
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
    writeFileSync(
      join(dir, "zz-probe.html"),
      '<!-- @ui:component zz-probe -->\n<span data-ui="zz-probe">Probe</span>\n',
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

    // And its stylesheet is in the bundle.
    expect(grownByPath.get("styles/faqir.css")).toContain('[data-ui="zz-probe"]');

    // The site grew by exactly one component's worth of files.
    expect(grown.length).toBe(files.length + 2);
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
    expect(home.body).toContain("<h1>Faqir UI</h1>");

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
