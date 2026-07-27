// Docs-site theme gallery (task 0.7-14, FAQIR-PLAN §13).
//
// The gallery's claim is that a theme is a stylesheet of design-token declarations
// and a colour scheme is one attribute — so switching either is a one-attribute
// change with nothing to rebuild and nothing to reload. These tests hold the
// generated site to the shape that claim requires:
//
//  • every registry theme is emitted, shown and described from its own manifest;
//  • every page of the site carries the theme as a swappable `<link>` under one
//    stable id, so the switcher's mechanism is the site's own mechanism;
//  • the cascade is still correct with the theme moved out of the bundle — which
//    rests on no component stylesheet declaring `:root`, asserted here rather
//    than assumed;
//  • JavaScript on the site is a closed, named list.
//
// The switcher's *behaviour* (a `data-theme` swap restyling a live document with
// no reload) is a browser fact, and is tested in a browser:
// `tests/visual/docs-switcher.pw.ts`.

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildDocsSite,
  discoverDocsComponents,
  discoverThemes,
  isSitePage,
  isFramePage,
  isShellPage,
  relUrl,
  themePreviewPath,
  PLAYGROUND_PAGE,
  THEMES_PAGE,
  THEME_LINK_ID,
  SITE_SCRIPTS,
} from "../../src/generator/docs";
import { parseDocument } from "../../src/parser/html-parser";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");

const components = discoverDocsComponents(REGISTRY);
const themes = discoverThemes(REGISTRY);
const files = buildDocsSite();
const byPath = new Map(files.map((f) => [f.path, f.content]));

function page(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`no such generated file: ${path}`);
  return content;
}

// ── coverage ────────────────────────────────────────────────────────────────

describe("theme coverage", () => {
  it("emits a stylesheet, a preview frame and a gallery card for every registry theme", () => {
    expect(themes.length).toBeGreaterThanOrEqual(10); // tripwire: discovery must not go empty
    const gallery = page(THEMES_PAGE);
    for (const theme of themes) {
      expect(byPath.has(theme.stylePath), `${theme.name} has no stylesheet`).toBe(true);
      expect(byPath.has(themePreviewPath(theme.name)), `${theme.name} has no frame`).toBe(true);
      expect(gallery, `${theme.name} is not in the gallery`).toContain(
        `data-theme-frame="${theme.name}"`,
      );
      expect(gallery, `${theme.name} has no switcher button`).toContain(
        `data-theme-pick="${theme.name}"`,
      );
    }
  });

  it("ships each theme stylesheet verbatim", () => {
    for (const theme of themes) {
      expect(page(theme.stylePath)).toContain(readFileSync(theme.cssPath, "utf8"));
    }
  });

  it("offers both colour schemes, and auto, on one axis", () => {
    const gallery = page(THEMES_PAGE);
    for (const scheme of ["light", "dark", "auto"]) {
      expect(gallery).toContain(`data-scheme-pick="${scheme}"`);
    }
    // Exactly one is pressed to begin with, and it is the one <html> is in.
    const doc = parseDocument(gallery, THEMES_PAGE);
    const pressed = doc.elements.filter(
      (el) => el.attrs["data-scheme-pick"] && el.attrs["aria-pressed"] === "true",
    );
    expect(pressed.length).toBe(1);
    expect(pressed[0].attrs["data-scheme-pick"]).toBe("auto");
    expect(gallery).toContain('<html lang="en" data-theme="auto">');
  });

  it("describes every theme from its own manifest, not from prose", () => {
    const gallery = page(THEMES_PAGE);
    for (const theme of themes) {
      const m = theme.manifest;
      expect(m, `${theme.name} ships no theme manifest`).not.toBeNull();
      expect(gallery).toContain(`${m!.scheme} scheme`);
      for (const mood of m!.mood) expect(gallery, `${theme.name}: ${mood}`).toContain(mood);
    }
  });

  it("derives each preview frame from the manifests, so a new variant appears in every theme", () => {
    // Looked up by the ATTRIBUTE an author types, not by the manifest's internal
    // name for the axis — `button` calls its `data-variant` axis `visual`.
    const c = components.find((x) => x.name === "button" && x.layer === "primitives")!;
    const buttonValues = Object.values(c.manifest.variants ?? {}).find(
      (v) => v.attr === "data-variant",
    )!.values;
    expect(buttonValues.length).toBeGreaterThan(3);

    for (const theme of themes) {
      const frame = page(themePreviewPath(theme.name));
      for (const value of buttonValues) {
        expect(frame, `${theme.name} is missing button/${value}`).toContain(
          `<button data-ui="button" data-variant="${value}"`,
        );
      }
    }
  });

  it("shows the semantic palette as swatches, never as text on a tinted surface", () => {
    // The frame is the first thing in the project that renders components in every
    // theme, and its axe gate found `badge`'s soft variants (--color-<sem> text on
    // --color-<sem>-subtle) below AA in 10 of 12 themes — a theme defect, filed as
    // task 0.7-19. Until those pairs clear AA the frame must not make that claim,
    // so it shows the tokens as swatches and components in their solid colours.
    for (const theme of themes) {
      const frame = page(themePreviewPath(theme.name));
      expect(frame, `${theme.name} renders text on a -subtle surface`).not.toMatch(
        /data-ui="badge" data-variant="(?:warning|success|destructive)"/,
      );
      // …and it does still show every semantic colour the theme owns.
      const swatches = [...frame.matchAll(/background: var\(--(color-[a-z-]+)\)/g)].map((m) => m[1]);
      expect(swatches.length).toBeGreaterThan(20);
      for (const token of ["color-warning", "color-success", "color-destructive", "color-primary"]) {
        expect(swatches, `${theme.name} hides --${token}`).toContain(token);
      }
    }
  });

  it("loads its own theme in each frame, before any script runs", () => {
    // The theme is right on first paint — the frame does not need JavaScript to
    // render the theme it is there to show; JavaScript only *changes* it.
    for (const theme of themes) {
      const path = themePreviewPath(theme.name);
      expect(page(path)).toContain(
        `<link rel="stylesheet" href="${relUrl(path, theme.stylePath)}" id="${THEME_LINK_ID}" ` +
          `data-theme-name="${theme.name}">`,
      );
    }
  });
});

// ── the switcher's mechanism is the site's mechanism ────────────────────────

describe("the theme link", () => {
  it("is on every page of the site, under one stable id", () => {
    for (const f of files) {
      if (!f.path.endsWith(".html")) continue;
      const doc = parseDocument(f.content, f.path);
      const links = doc.elements.filter((el) => el.attrs["id"] === THEME_LINK_ID);
      expect(links.length, `${f.path} has ${links.length} theme links`).toBe(1);
      expect(links[0].tag).toBe("link");
      expect(links[0].attrs["rel"]).toBe("stylesheet");
      expect(links[0].attrs["data-theme-name"]).toBeTruthy();
      // Site-relative and depth-correct, so replacing the basename is a valid
      // swap from any page — which is all the switcher does.
      expect(byPath.has(resolve(f.path, links[0].attrs["href"]!))).toBe(true);
    }
  });

  it("comes last in <head>, after the component stylesheet", () => {
    for (const f of files) {
      if (!f.path.endsWith(".html")) continue;
      const sheets = [...f.content.matchAll(/<link rel="stylesheet" href="([^"]+)"([^>]*)>/g)];
      expect(sheets.length, `${f.path} links ${sheets.length} stylesheets`).toBe(2);
      expect(sheets[0][1]).toContain("styles/faqir.css");
      expect(sheets[1][1]).toContain("styles/themes/");
      expect(sheets[1][2]).toContain(`id="${THEME_LINK_ID}"`);
    }
  });

  it("can move last safely: no component stylesheet declares :root", () => {
    // The whole reason the theme may load *after* the components — one step later
    // than `faqir init` concatenates it — is that nothing in component CSS
    // competes with a theme's token declarations. If a component ever declares
    // `:root`, that argument is void and the split has to be revisited.
    const offenders: string[] = [];
    for (const c of components) {
      const cssPath = join(REGISTRY, c.layer, c.name, c.manifest.files.css);
      if (!existsSync(cssPath)) continue;
      const css = readFileSync(cssPath, "utf8").replace(/\/\*[^]*?\*\//g, "");
      if (/(^|[\s,}])(:root)\b/.test(css)) offenders.push(`${c.layer}/${c.name}`);
    }
    expect(offenders).toEqual([]);
  });
});

// ── JavaScript on the site is a closed list ────────────────────────────────

describe("site JavaScript", () => {
  /** Every `<script src>` the site authors, page by page. */
  function scriptsOf(path: string): string[] {
    return [...page(path).matchAll(/<script src="([^"]+)"[^>]*><\/script>/g)].map((m) =>
      resolve(path, m[1]),
    );
  }

  it("runs on exactly the pages that need it, from exactly six files", () => {
    const shipped = files
      .filter((f) => f.path.startsWith("scripts/"))
      .map((f) => f.path)
      .sort();
    expect(shipped).toEqual(
      ["scripts/faqir-core.js", "scripts/faqir-manifests.js", ...SITE_SCRIPTS.map((n) => `scripts/${n}`)].sort(),
    );

    const withScripts = files
      .filter((f) => f.path.endsWith(".html") && /<script src=/.test(f.content))
      .map((f) => f.path);
    const expected = [
      PLAYGROUND_PAGE,
      THEMES_PAGE,
      ...themes.map((t) => themePreviewPath(t.name)),
      ...files.filter((f) => f.path.startsWith("examples/")).map((f) => f.path),
      // A component page carries the copy-for-agents wiring (task 0.7-15) — and
      // only when it has a payload to copy, which is exactly the set of
      // components that ship reference markup, i.e. the set with an example.
      ...files
        .filter((f) => f.path.startsWith("examples/"))
        .map((f) => f.path.replace(/^examples\//, "components/")),
    ];
    expect(withScripts.sort()).toEqual(expected.sort());
  });

  it("gives each page only the scripts it needs, and every one exists", () => {
    expect(scriptsOf(PLAYGROUND_PAGE)).toEqual([
      "scripts/faqir-audit.js",
      "scripts/faqir-manifests.js",
      "scripts/playground.js",
    ]);
    expect(scriptsOf(THEMES_PAGE)).toEqual(["scripts/gallery.js"]);
    expect(scriptsOf("components/primitives/button.html")).toEqual(["scripts/copy-snippet.js"]);
    for (const theme of themes) {
      expect(scriptsOf(themePreviewPath(theme.name))).toEqual(["scripts/gallery.js"]);
    }
    for (const f of files) {
      if (!f.path.endsWith(".html")) continue;
      for (const src of scriptsOf(f.path)) {
        expect(byPath.has(src), `${f.path} loads a missing script ${src}`).toBe(true);
      }
    }
  });

  it("keeps the documentation pages script-free apart from the copy button", () => {
    // The index, the token reference, the layout guide, the agents page and the
    // home page are pure static HTML; a component page's only script is the
    // copy-for-agents wiring, and it is one `<script src>` — no inline script
    // anywhere. The site did not become an application.
    const documentation = files.filter(
      (f) =>
        isShellPage(f.path) &&
        f.path !== PLAYGROUND_PAGE &&
        f.path !== THEMES_PAGE,
    );
    expect(documentation.length).toBe(components.length + 5);
    for (const f of documentation) {
      const scripts = [...f.content.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
      const isComponentPage = components.some((c) => c.pagePath === f.path);
      const allowed = isComponentPage
        ? [`<script src="${relUrl(f.path, "scripts/copy-snippet.js")}" defer>`]
        : [];
      expect(scripts, `${f.path} ships unexpected JavaScript`).toEqual(allowed);
    }
  });

  it("ships the authored wiring verbatim out of site/lib", () => {
    for (const name of SITE_SCRIPTS) {
      expect(page(`scripts/${name}`)).toBe(
        readFileSync(join(REPO, "site", "lib", name), "utf8"),
      );
    }
  });

  it("wires the gallery to both switch axes and nothing else", () => {
    const gallery = readFileSync(join(REPO, "site", "lib", "gallery.js"), "utf8");
    // The theme axis is an href swap; the scheme axis is a data-theme swap.
    expect(gallery).toContain('replace(/[^/]+\\.css$/');
    expect(gallery).toContain('setAttribute("data-theme", scheme)');
    // Frames are told, never reached into: a docs site opened from file:// has no
    // usable same-origin access to its own frames.
    expect(gallery).toContain("postMessage");
    expect(gallery).not.toMatch(/contentDocument|contentWindow\.document/);
    // Nothing fetches, nothing reloads.
    expect(gallery).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|location\s*=|location\.(?:reload|href)/);
  });
});

/** Resolve a site-relative href against the directory of the page holding it. */
function resolve(fromPage: string, href: string): string {
  const parts = fromPage.includes("/")
    ? fromPage.slice(0, fromPage.lastIndexOf("/")).split("/")
    : [];
  for (const seg of href.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

// ── frames are pages, held to the page gate ────────────────────────────────

describe("gallery frames", () => {
  it("are site pages: generator-authored, no class attribute, no hardcoded colour", () => {
    for (const f of files.filter((x) => isFramePage(x.path))) {
      expect(isSitePage(f.path)).toBe(true);
      expect(f.content, `${f.path} uses a class attribute`).not.toMatch(/\sclass\s*=/);
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

  it("carry no navigation — there is nowhere to navigate from inside a frame", () => {
    for (const f of files.filter((x) => isFramePage(x.path))) {
      expect(f.content).not.toContain('data-ui="dashboard-shell"');
      expect(f.content).toContain("<main");
    }
  });
});
