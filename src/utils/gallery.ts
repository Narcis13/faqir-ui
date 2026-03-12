import type { LoomConfig } from "./config";
import { readTextFile } from "./fs";
import { readManifestFile } from "./manifest";
import { resolvePackagePath } from "./paths";
import { REGISTRY_LAYERS, type RegistryLayer } from "./registry";

type GalleryComponent = {
  name: string;
  layer: RegistryLayer;
  description: string;
  html: string;
};

export async function renderGalleryHtml(projectRoot: string, config: LoomConfig): Promise<string> {
  const sections = await Promise.all(
    REGISTRY_LAYERS.map(async (layer) => ({
      layer,
      components: await Promise.all(
        config.installed[layer].map(async (name) => await readGalleryComponent(projectRoot, config, layer, name)),
      ),
    })),
  );
  const totalComponents = sections.reduce((sum, section) => sum + section.components.length, 0);
  const cssLinks = [
    "./tokens/index.css",
    "./base/reset.css",
    "./base/prose.css",
    ...config.installed.primitives.map((name) => `./primitives/${name}/${name}.css`),
    ...config.installed.recipes.map((name) => `./recipes/${name}/${name}.css`),
    ...config.installed.patterns.map((name) => `./patterns/${name}/${name}.css`),
  ];

  return [
    "<!doctype html>",
    `<html lang="en" data-theme="${config.theme}">`,
    "  <head>",
    "    <meta charset=\"utf-8\" />",
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "    <title>Loom component gallery</title>",
    ...cssLinks.map((href) => `    <link rel="stylesheet" href="${href}" />`),
    "    <style>",
    "      body {",
    "        margin: 0;",
    "        background:",
    "          radial-gradient(circle at top, var(--color-primary-subtle), transparent 32rem),",
    "          linear-gradient(180deg, var(--color-bg-subtle), var(--color-bg));",
    "        color: var(--color-fg);",
    "        font-family: var(--font-sans);",
    "      }",
    "      [data-gallery] {",
    "        display: grid;",
    "        gap: var(--space-8);",
    "        padding: var(--space-8) var(--space-6) var(--space-8);",
    "      }",
    "      [data-gallery-part=\"hero\"] {",
    "        display: grid;",
    "        gap: var(--space-4);",
    "      }",
    "      [data-gallery-part=\"eyebrow\"] {",
    "        margin: 0;",
    "        color: var(--color-primary);",
    "        font-size: var(--text-xs);",
    "        font-weight: var(--weight-semibold);",
    "        letter-spacing: var(--tracking-wide);",
    "        text-transform: uppercase;",
    "      }",
    "      [data-gallery-part=\"hero\"] h1,",
    "      [data-gallery-part=\"hero\"] p,",
    "      [data-gallery-part=\"section-header\"] h2,",
    "      [data-gallery-part=\"section-header\"] p,",
    "      [data-gallery-part=\"component-header\"] h3,",
    "      [data-gallery-part=\"component-header\"] p {",
    "        margin: 0;",
    "      }",
    "      [data-gallery-part=\"hero\"] h1 {",
    "        font-size: clamp(2.5rem, 5vw, 4.5rem);",
    "        line-height: 0.95;",
    "      }",
    "      [data-gallery-part=\"hero\"] p {",
    "        max-inline-size: 52rem;",
    "        color: var(--color-fg-muted);",
    "        font-size: var(--text-base);",
    "      }",
    "      [data-gallery-part=\"summary\"] {",
    "        display: flex;",
    "        flex-wrap: wrap;",
    "        gap: var(--space-3);",
    "      }",
    "      [data-gallery-part=\"pill\"] {",
    "        display: inline-flex;",
    "        align-items: center;",
    "        min-block-size: var(--button-height-sm);",
    "        padding-inline: var(--space-3);",
    "        border: var(--space-px) solid var(--color-border);",
    "        border-radius: var(--radius-full);",
    "        background: var(--color-bg-elevated);",
    "        color: var(--color-fg-muted);",
    "        font-size: var(--text-sm);",
    "        font-weight: var(--weight-medium);",
    "      }",
    "      [data-gallery-part=\"nav\"] {",
    "        display: flex;",
    "        flex-wrap: wrap;",
    "        gap: var(--space-2);",
    "      }",
    "      [data-gallery-part=\"nav\"] a {",
    "        color: var(--color-link);",
    "        font-weight: var(--weight-medium);",
    "        text-decoration: none;",
    "      }",
    "      [data-gallery-part=\"sections\"] {",
    "        display: grid;",
    "        gap: var(--space-8);",
    "      }",
    "      [data-gallery-part=\"section\"] {",
    "        display: grid;",
    "        gap: var(--space-5);",
    "      }",
    "      [data-gallery-part=\"section-header\"] {",
    "        display: grid;",
    "        gap: var(--space-2);",
    "      }",
    "      [data-gallery-part=\"section-header\"] p {",
    "        color: var(--color-fg-muted);",
    "      }",
    "      [data-gallery-part=\"grid\"] {",
    "        display: grid;",
    "        gap: var(--space-4);",
    "        grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));",
    "      }",
    "      [data-gallery-part=\"card\"] {",
    "        display: grid;",
    "        gap: var(--space-4);",
    "        padding: var(--space-4);",
    "        border: var(--space-px) solid var(--color-border);",
    "        border-radius: var(--radius-xl);",
    "        background: color-mix(in oklch, var(--color-bg-elevated) 92%, transparent);",
    "        box-shadow: var(--shadow-xs);",
    "        overflow: hidden;",
    "      }",
    "      [data-gallery-part=\"component-header\"] {",
    "        display: grid;",
    "        gap: var(--space-1);",
    "      }",
    "      [data-gallery-part=\"meta\"] {",
    "        display: flex;",
    "        flex-wrap: wrap;",
    "        gap: var(--space-2);",
    "      }",
    "      [data-gallery-part=\"meta\"] span {",
    "        display: inline-flex;",
    "        align-items: center;",
    "        min-block-size: var(--button-height-sm);",
    "        padding-inline: var(--space-2);",
    "        border-radius: var(--radius-full);",
    "        background: var(--color-bg-muted);",
    "        color: var(--color-fg-muted);",
    "        font-size: var(--text-xs);",
    "      }",
    "      [data-gallery-part=\"canvas\"] {",
    "        display: grid;",
    "        gap: var(--space-4);",
    "        padding: var(--space-4);",
    "        border: var(--space-px) dashed var(--color-border);",
    "        border-radius: var(--radius-lg);",
    "        background: var(--color-bg);",
    "      }",
    "      [data-gallery-part=\"canvas\"][data-kind=\"pattern\"] {",
    "        padding: 0;",
    "        border-style: solid;",
    "      }",
    "      @media (max-width: 48rem) {",
    "        [data-gallery] {",
    "          padding-inline: var(--space-4);",
    "        }",
    "      }",
    "    </style>",
    "  </head>",
    "  <body>",
    "    <main data-gallery>",
    "      <header data-gallery-part=\"hero\">",
    "        <p data-gallery-part=\"eyebrow\">Loom UI</p>",
    "        <h1>Component gallery</h1>",
    "        <p>Self-hosted examples for every primitive, recipe, and pattern shipped by Loom. Open this file directly in a browser or regenerate it after registry changes with <code>loom gallery</code>.</p>",
    "        <div data-gallery-part=\"summary\">",
    `          <span data-gallery-part="pill">${totalComponents} components</span>`,
    ...sections.map(
      (section) =>
        `          <span data-gallery-part="pill">${section.layer}: ${section.components.length}</span>`,
    ),
    "        </div>",
    "        <nav data-gallery-part=\"nav\" aria-label=\"Gallery sections\">",
    ...sections.map(
      (section) =>
        `          <a href="#gallery-${section.layer}">${section.layer}</a>`,
    ),
    "        </nav>",
    "      </header>",
    "      <div data-gallery-part=\"sections\">",
    ...sections.map((section) =>
      [
        `        <section data-gallery-part="section" id="gallery-${section.layer}">`,
        "          <header data-gallery-part=\"section-header\">",
        `            <p data-gallery-part="eyebrow">${section.layer}</p>`,
        `            <h2>${titleCase(section.layer)}</h2>`,
        `            <p>${describeLayer(section.layer)}</p>`,
        "          </header>",
        "          <div data-gallery-part=\"grid\">",
        ...section.components.map((component) =>
          [
            `            <article data-gallery-part="card" data-kind="${component.layer}" data-name="${component.name}">`,
            "              <header data-gallery-part=\"component-header\">",
            `                <h3>${component.name}</h3>`,
            `                <p>${component.description}</p>`,
            "                <div data-gallery-part=\"meta\">",
            `                  <span>${component.layer}</span>`,
            `                  <span>${component.name}</span>`,
            "                </div>",
            "              </header>",
            `              <div data-gallery-part="canvas" data-kind="${component.layer}">`,
            ...component.html.trim().split("\n").map((line) => `                ${line}`),
            "              </div>",
            "            </article>",
          ].join("\n"),
        ),
        "          </div>",
        "        </section>",
      ].join("\n"),
    ),
    "      </div>",
    "    </main>",
    "    <script type=\"module\" src=\"./loom.js\"></script>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

async function readGalleryComponent(
  projectRoot: string,
  config: LoomConfig,
  layer: RegistryLayer,
  name: string,
): Promise<GalleryComponent> {
  const componentDir = resolvePackagePath(projectRoot, config.output_dir, layer, name);
  const manifest = await readManifestFile(resolvePackagePath(componentDir, `${name}.manifest.json`));

  return {
    name,
    layer,
    description: manifest.description,
    html: await readTextFile(resolvePackagePath(componentDir, manifest.files.html)),
  };
}

function describeLayer(layer: RegistryLayer): string {
  switch (layer) {
    case "primitives":
      return "Single-purpose building blocks with a strict DOM contract.";
    case "recipes":
      return "Interactive compositions that attach small controllers to existing markup.";
    case "patterns":
      return "Full page regions assembled from Loom primitives and recipes.";
  }
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
