// The component showcase: every component the expansion added or upgraded,
// live on one page, linked from the navigation and from the home page's
// release story.
//
// `docs-site.test.ts` already holds the page to the audit gate and the
// no-class/no-inline-style rule, like every site page. These cases hold it to
// what it claims: each component runs on the page (not only in a code block),
// each links its contract, every new chart kind is drawn, and the page loads
// the two scripts its demos need.

import { describe, expect, it } from "bun:test";
import { buildDocsSite, SHOWCASE_PAGE } from "../../src/generator/docs";

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

const SHOWN: [layer: string, name: string][] = [
  ["recipes", "calendar"],
  ["recipes", "date-picker"],
  ["recipes", "tree-view"],
  ["primitives", "stepper"],
  ["patterns", "wizard"],
  ["recipes", "list"],
  ["patterns", "chat"],
  ["primitives", "chat-thread"],
  ["primitives", "chat-message"],
  ["recipes", "composer"],
  ["recipes", "knob"],
  ["primitives", "image"],
  ["recipes", "lightbox"],
  ["recipes", "image-compare"],
  ["recipes", "video-player"],
  ["primitives", "chart"],
];

const NEW_CHART_KINDS = [
  "area",
  "stacked-column",
  "stacked-bar",
  "pie",
  "donut",
  "scatter",
  "sparkline",
  "radar",
  "gauge",
];

describe("component showcase", () => {
  it("is built, named in the navigation, and loads the engine and the chart plugin", () => {
    const page = file(SHOWCASE_PAGE);
    expect(page).toContain("<title>Component showcase");
    expect(page).toContain('src="../scripts/faqir-core.js"');
    expect(page).toContain('src="../scripts/plugins/faqir-chart.js"');
    expect(file("index.html")).toContain('href="showcase/index.html"');
    expect(file("components/index.html")).toContain(">Component showcase<");
  });

  it("runs every new and upgraded component live, and links its contract", () => {
    const page = live(SHOWCASE_PAGE);
    for (const [layer, name] of SHOWN) {
      expect(page, `${name} is not demonstrated live`).toContain(`data-ui="${name}"`);
      expect(page, `${name}'s page is not linked`).toContain(`href="../components/${layer}/${name}.html"`);
    }
  });

  it("draws every new chart kind", () => {
    const page = live(SHOWCASE_PAGE);
    for (const kind of NEW_CHART_KINDS) {
      expect(page, `chart kind ${kind} is not shown`).toContain(`data-ui="chart" data-variant="${kind}"`);
    }
    expect(page).not.toContain("@showcase:charts");
  });

  it("renders its examples as live demos with copyable markup", () => {
    const page = file(SHOWCASE_PAGE);
    const examples = page.match(/<figure data-docs-guide-example id="showcase-[a-z0-9-]+">/g) ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(30);
    expect(page).not.toContain('<template data-docs-example="');
  });

  it("keeps every id unique across the page", () => {
    const ids = [...live(SHOWCASE_PAGE).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const seen = new Set<string>();
    const dupes = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(dupes).toEqual([]);
  });

  it("is announced by the home page's release story", () => {
    const home = live("index.html");
    expect(home).toContain('id="release-expansion-heading"');
    expect(home).toMatch(/href="showcase\/index\.html"[^>]*>Open the component showcase/);
  });
});
