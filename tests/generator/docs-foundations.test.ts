// Publish-ready foundation surfaces: icon catalogue, typography specimens, and
// static-host discovery/security files. The pages are contract-derived rather
// than parallel inventories, so these tests compare them back to the registry.

import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { join } from "node:path";
import {
  buildDocsSite,
  canonicalUrl,
  DEMO_MESSAGES_API,
  discoverDocsComponents,
  ICONS_PAGE,
  isRetiredPage,
  isShellPage,
  RETIRED_PAGES,
  NOT_FOUND_PAGE,
  parseTokenReference,
  ROBOTS_FILE,
  SITEMAP_FILE,
  TYPOGRAPHY_PAGE,
} from "../../src/generator/docs";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const SITE_URL = "https://faqir.dev";
const files = buildDocsSite();
const byPath = new Map(files.map((file) => [file.path, file.content]));
const components = discoverDocsComponents(REGISTRY);

function file(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`the docs site does not ship ${path}`);
  return content;
}

describe("icon foundation page", () => {
  const icon = components.find(
    (component) => component.layer === "primitives" && component.name === "icon",
  )!;
  const names = [...new Set(icon.manifest.variants.icon.values)].sort();

  it("renders every manifest-declared icon exactly once as a searchable tile", () => {
    const page = file(ICONS_PAGE);
    const rendered = [...page.matchAll(/data-docs-icon-copy="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(rendered).toEqual(names);
    expect(page).toContain(`${names.length} of ${names.length} icons`);
    expect(page).toContain('data-docs-icon-search');
    expect(page).toContain(`href="../${icon.pagePath}"`);
    for (const name of names) {
      expect(page).toContain(`data-icon="${name}"`);
    }
  });

  it("filters by name and copies complete decorative markup", async () => {
    const window = new Window({
      url: `${SITE_URL}/${ICONS_PAGE}`,
      settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
    });
    window.document.write(file(ICONS_PAGE));
    const writes: string[] = [];
    const navigator = {
      clipboard: {
        writeText(text: string) {
          writes.push(text);
          return Promise.resolve();
        },
      },
    };
    new Function(
      "window",
      "document",
      "globalThis",
      "navigator",
      "setTimeout",
      "clearTimeout",
      "CustomEvent",
      `${file("scripts/gallery.js")}\n//# sourceURL=scripts/gallery.js`,
    )(
      window,
      window.document,
      window,
      navigator,
      window.setTimeout.bind(window),
      window.clearTimeout.bind(window),
      window.CustomEvent,
    );
    window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

    const search = window.document.querySelector("[data-docs-icon-search]")!;
    (search as unknown as { value: string }).value = "arrow";
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
    const visible = [...window.document.querySelectorAll("[data-docs-icon-card]")]
      .filter((card) => !(card as unknown as HTMLElement).hidden)
      .map((card) => card.getAttribute("data-docs-icon-copy"));
    expect(visible).toEqual(names.filter((name) => name.includes("arrow")));
    expect(window.document.getElementById("icon-result-count")!.textContent).toBe(
      `${visible.length} of ${names.length} icons`,
    );

    const button = window.document.querySelector('[data-docs-icon-copy="arrow-right"]')!;
    button.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes).toEqual([
      '<span data-ui="icon" data-icon="arrow-right" aria-hidden="true"></span>',
    ]);
    expect(window.document.getElementById("icon-copy-status")!.textContent).toContain(
      "Copied arrow-right",
    );
    await window.happyDOM.close();
  });
});

describe("typography foundation page", () => {
  const tokens = parseTokenReference(REGISTRY).filter((entry) => entry.group === "typography");

  it("documents and renders every typography token from the registry", () => {
    const page = file(TYPOGRAPHY_PAGE);
    const css = file("styles/faqir.css");
    expect(tokens.length).toBeGreaterThan(15);
    for (const token of tokens) {
      expect(page, `typography page omits --${token.name}`).toContain(`--${token.name}`);
      const property = token.name.startsWith("font-")
        ? "font-family"
        : token.name.startsWith("text-")
          ? "font-size"
          : token.name.startsWith("weight-")
            ? "font-weight"
            : "line-height";
      expect(css, `--${token.name} has no live preview rule`).toContain(
        `[data-docs-token-preview="${token.name}"] { ${property}: var(--${token.name}); }`,
      );
    }
    expect(page).toContain("Semantic hierarchy");
    expect(page).toContain("Long-form prose");
    expect(page).toContain('data-ui="heading" data-size="1"');
  });
});

describe("static publishing surfaces", () => {
  const config = {
    title: "Faqir UI",
    tagline: "Interfaces agents can understand",
    description: "Faqir UI",
    url: SITE_URL,
    theme: "aurora",
    footer: "Faqir UI",
  };

  it("gives every navigable document one canonical public URL", () => {
    for (const page of files.filter((candidate) => isShellPage(candidate.path))) {
      expect(page.content, `${page.path} has no canonical URL`).toContain(
        `<link rel="canonical" href="${canonicalUrl(config, page.path)}">`,
      );
    }
  });

  it("ships a 404, robots file, and deterministic sitemap of public pages", () => {
    expect(file(NOT_FOUND_PAGE)).toContain("This route has no contract.");
    expect(file(ROBOTS_FILE)).toContain(`Sitemap: ${SITE_URL}/${SITEMAP_FILE}`);
    const sitemap = file(SITEMAP_FILE);
    const publicPages = files
      .filter(
        (candidate) =>
          isShellPage(candidate.path) &&
          candidate.path !== NOT_FOUND_PAGE &&
          // A retired URL resolves; it is not advertised (task 1.0R-09).
          !isRetiredPage(candidate.path),
      )
      .map((candidate) => candidate.path);
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locations).toEqual(publicPages.map((path) => canonicalUrl(config, path)));
    expect(sitemap).not.toContain(NOT_FOUND_PAGE);
    for (const entry of RETIRED_PAGES) {
      expect(sitemap, `${entry.path} is retired and must not be in the sitemap`).not.toContain(
        canonicalUrl(config, entry.path),
      );
    }
    expect(sitemap).not.toMatch(/<lastmod>/);
  });

  it("sets a same-origin static-site security baseline", () => {
    const headers = file("_headers");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("Referrer-Policy: strict-origin-when-cross-origin");
    expect(headers).toContain("Permissions-Policy: camera=(), geolocation=(), microphone=()");
    expect(headers).toContain("Content-Security-Policy: default-src 'self'");
    expect(headers).toContain("connect-src 'self'");
    expect(headers).toContain("frame-src 'self'");
  });

  it("backs the source-bound inbox demo with static same-origin JSON", () => {
    const messages = JSON.parse(file(DEMO_MESSAGES_API)) as Array<Record<string, unknown>>;
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((message) => typeof message.id === "string")).toBe(true);
    expect(file("_headers")).toContain(
      `/${DEMO_MESSAGES_API}\n  Content-Type: application/json`,
    );
  });

  it("links every foundation from the homepage and the persistent navigation", () => {
    const home = file("index.html");
    for (const path of [
      "components/index.html",
      ICONS_PAGE,
      TYPOGRAPHY_PAGE,
      "layout/index.html",
      "spacing/index.html",
      "themes/index.html",
    ]) {
      expect(home).toContain(`href="${path}"`);
    }
  });
});
