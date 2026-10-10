// The docs site covers everything the release ships — asserted, not eyeballed.
//
// One file, one question per surface: is there a live page or section for it?
//
//   • every registry component (primitive, recipe, pattern) → a contract page,
//     a live example page that mounts it, and a nav entry;
//   • every theme → a specimen page and a stylesheet the switcher can load;
//   • every design token, in every token family → an anchored reference row;
//   • every public engine directive, modifier and magic, and every official
//     plugin's directive, modifier and magic → used by a LIVE example (an
//     authored `<template data-docs-example>` the page mounts and runs), not
//     merely named in a table;
//   • every CLI command and every MCP tool → its own article.
//
// The per-surface suites (docs-site, docs-tooling, engine-page, …) check each
// page in depth; this one is the release's completeness gate across all of them.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDocsSite,
  discoverDocsComponents,
  discoverThemes,
  parseGuideExamples,
  parseTokenReference,
  themeDetailPath,
  tokenAnchor,
  pluginScriptPath,
  ENGINE_PAGE,
  STUDIO_PAGE,
} from "../../src/generator/docs";
import { parseEngineVocabulary } from "../../src/generator/skill";
import { loadPluginMetadata } from "../../src/generator/plugins";
import { COMMAND_NAMES } from "../../src/command-registry";
import { CLI_PAGE, INTEGRATIONS_PAGE } from "../../src/generator/docs-pages/tooling";
import { createFaqirMcpServer } from "../../packages/mcp/src/server";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const files = buildDocsSite();
const byPath = new Map(files.map((f) => [f.path, f.content]));
const page = (path: string): string => {
  const html = byPath.get(path);
  if (html === undefined) throw new Error(`the site has no ${path}`);
  return html;
};

/** Report every missing item at once, rather than the first. */
function expectNone(missing: string[], what: string): void {
  expect(missing, `${what} without coverage: ${missing.join(", ")}`).toEqual([]);
}

describe("every registry component has a live page", () => {
  const components = discoverDocsComponents(REGISTRY);

  it("discovers all three layers", () => {
    for (const layer of ["primitives", "recipes", "patterns"]) {
      expect(components.some((c) => c.layer === layer)).toBe(true);
    }
  });

  it("gives each one a contract page, a live example that mounts it, and a nav entry", () => {
    const nav = page("index.html");
    const missing: string[] = [];
    for (const c of components) {
      const example = byPath.get(c.examplePath) ?? "";
      // The root is `data-ui="<name>"`, or — for a pattern whose anatomy is a bare
      // element, like form-page's `form[l-data]` — its reference markup's root tag.
      const root = readFileSync(c.referencePath, "utf8").match(/^<(?!!)[^>]+>/m)?.[0] ?? "";
      if (!byPath.has(c.pagePath)) missing.push(`${c.layer}/${c.name}: page`);
      if (!example.includes(`data-ui="${c.name}"`) && !(root && example.includes(root))) {
        missing.push(`${c.layer}/${c.name}: live example`);
      }
      if (!nav.includes(`components/${c.layer}/${c.name}.html`)) missing.push(`${c.layer}/${c.name}: nav`);
    }
    expectNone(missing, "components");
  });

  it("loads the engine on the live example of every component with a controller", () => {
    const missing = components
      .filter((c) => c.manifest.files?.js)
      .filter((c) => !(byPath.get(c.examplePath) ?? "").includes("scripts/faqir-core.js"))
      .map((c) => c.name);
    expectNone(missing, "controller-driven examples");
  });
});

describe("every theme has a specimen page", () => {
  it("ships a stylesheet and a specimen page per theme, linked from the gallery", () => {
    const themes = discoverThemes(REGISTRY);
    expect(themes.length).toBeGreaterThan(20);
    const gallery = page("themes/index.html");
    const missing: string[] = [];
    for (const t of themes) {
      if (!byPath.has(t.stylePath)) missing.push(`${t.name}: stylesheet`);
      if (!byPath.has(themeDetailPath(t.name))) missing.push(`${t.name}: page`);
      if (!gallery.includes(`${themeDetailPath(t.name)}">Specimen sheet</a>`)) missing.push(`${t.name}: gallery link`);
    }
    expectNone(missing, "themes");
  });
});

describe("every design token, in every family, has a reference row", () => {
  it("anchors each token on the token reference", () => {
    const tokens = parseTokenReference(REGISTRY);
    const families = new Set(tokens.map((t) => t.group));
    expect(families.size).toBeGreaterThan(5);
    const html = page("tokens/index.html");
    const missing = tokens.filter((t) => !html.includes(`id="${tokenAnchor(t.name)}"`)).map((t) => `--${t.name}`);
    expectNone(missing, "tokens");
  });
});

// ── the engine and its plugins, exercised live ───────────────────────────────

const engineAuthored = readFileSync(join(REPO, "site", "content", "engine.html"), "utf8");
const studioAuthored = readFileSync(join(REPO, "site", "content", "studio.html"), "utf8");
const liveExamples = parseGuideExamples(engineAuthored).map((e) => e.html);

/** Every attribute NAME written in a live example, e.g. `@click.prevent`, `l-model.trim`. */
const liveAttributes = liveExamples.flatMap((html) =>
  [...html.matchAll(/<[a-zA-Z][^\s>]*((?:\s+[^\s=>"']+(?:="[^"]*"|='[^']*')?)*)\s*\/?>/g)].flatMap((tag) =>
    [...tag[1]!.matchAll(/\s+([^\s=>"']+)/g)].map((a) => a[1]!),
  ),
);
const liveSource = liveExamples.join("\n");

/** The attribute-name prefixes a directive may be written with. */
function spellings(attribute: string, shorthand = "—"): string[] {
  const base = attribute.replace(/:<[^>]+>$/, ":");
  const forms = [base];
  if (shorthand !== "—") forms.push(shorthand.replace(/<[^>]+>$/, ""));
  return forms;
}

function usesDirective(attribute: string, shorthand?: string): boolean {
  return spellings(attribute, shorthand).some((prefix) =>
    liveAttributes.some((name) =>
      prefix.endsWith(":") || prefix.length === 1
        ? name.startsWith(prefix) && name.length > prefix.length
        : name === prefix || name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}:`),
    ),
  );
}

function usesModifier(attribute: string, modifier: string, shorthand?: string): boolean {
  const mod = modifier.replace(/^\./, "");
  return spellings(attribute, shorthand).some((prefix) =>
    liveAttributes.some(
      (name) =>
        name.startsWith(prefix) &&
        name
          .slice(prefix.length)
          .split(".")
          .slice(1)
          .some((part) => part === mod || new RegExp(`^${mod}\\d+(ms|s)$`).test(part)),
    ),
  );
}

const usesMagic = (name: string): boolean => new RegExp(`\\${name}(?![A-Za-z0-9_])`).test(liveSource);

describe("every engine directive, modifier and magic runs in a live example", () => {
  const vocab = parseEngineVocabulary(readFileSync(join(REPO, "src", "core-src", "engine.js"), "utf8"));
  const shorthand = new Map(vocab.directives.map((d) => [d.attribute.replace(/:<[^>]+>$/, ""), d.shorthand]));

  it("has live examples to look in", () => {
    expect(liveExamples.length).toBeGreaterThan(3);
  });

  it("uses every public directive", () => {
    const missing = vocab.directives
      .filter((d) => d.placement !== "internal")
      .filter((d) => !usesDirective(d.attribute, d.shorthand))
      .map((d) => d.attribute);
    expectNone(missing, "directives");
  });

  it("uses every modifier", () => {
    const missing = vocab.modifiers
      .filter((m) => !usesModifier(m.directive, m.modifier, shorthand.get(m.directive)))
      .map((m) => `${m.directive}${m.modifier}`);
    expectNone(missing, "modifiers");
  });

  it("uses every public magic", () => {
    // `$scope` and `$modelValue` are engine internals that page code never writes;
    // the page names them as such (asserted in docs-site.test.ts).
    const missing = vocab.magics.filter((m) => m.where !== "internal" && !usesMagic(m.name)).map((m) => m.name);
    expectNone(missing, "magics");
  });
});

describe("every official plugin runs live on the site", () => {
  const plugins = loadPluginMetadata(join(REGISTRY, "core", "plugins"));

  it("ships each plugin and loads it on the page that demonstrates it", () => {
    const missing = plugins
      .filter((p) => {
        const host = page(p.name === "faqir-tweak" ? STUDIO_PAGE : ENGINE_PAGE);
        return !byPath.has(pluginScriptPath(p.file)) || !host.includes(pluginScriptPath(p.file));
      })
      .map((p) => p.name);
    expectNone(missing, "plugins");
  });

  it("uses every directive and magic a plugin provides in a live example", () => {
    const missing: string[] = [];
    for (const p of plugins) {
      for (const provided of p.provides) {
        const name = provided.replace(/\(\)$/, "");
        const live = name.startsWith("$")
          ? usesMagic(name)
          : usesDirective(name) ||
            // The studio page is the tweak plugin's own live demo.
            (p.name === "faqir-tweak" &&
              new RegExp(`<[a-z]+ ${name}[\\s>=]`).test(studioAuthored) &&
              page(STUDIO_PAGE).includes(`<aside ${name}`));
        if (!live) missing.push(`${p.name}: ${provided}`);
      }
      for (const m of p.modifiers) {
        if (!usesModifier(m.attribute, m.modifier)) missing.push(`${p.name}: ${m.attribute}${m.modifier}`);
      }
    }
    expectNone(missing, "plugin vocabulary");
  });
});

describe("every CLI command and MCP tool has its own article", () => {
  it("documents each registered command", () => {
    const html = page(CLI_PAGE);
    expectNone(
      COMMAND_NAMES.filter((name) => !html.includes(`<article id="cmd-${name}" data-docs-cmd>`)),
      "commands",
    );
  });

  it("documents each tool the live MCP server registers", () => {
    const server = createFaqirMcpServer() as unknown as { _registeredTools: Record<string, unknown> };
    const tools = Object.keys(server._registeredTools);
    expect(tools.length).toBeGreaterThan(5);
    const html = page(INTEGRATIONS_PAGE);
    expectNone(
      tools.filter((t) => !html.includes(`<article id="mcp-${t}" data-docs-cmd data-docs-tooling-tool>`)),
      "MCP tools",
    );
  });
});
