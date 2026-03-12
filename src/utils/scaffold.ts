import type { LoomConfig } from "./config";
import { readTextFile } from "./fs";
import { resolvePackagePath } from "./paths";

export type ScaffoldDefinition = {
  name: "landing-page" | "admin-dashboard" | "internal-tool";
  description: string;
  patterns: string[];
  title: string;
  intro: string;
  sections: Array<{ pattern: string; title: string; description: string }>;
};

const SCAFFOLDS: Record<ScaffoldDefinition["name"], ScaffoldDefinition> = {
  "landing-page": {
    name: "landing-page",
    description: "Marketing-style page composed from auth, empty-state, and search surfaces.",
    patterns: ["auth-form", "empty-state", "search-results"],
    title: "Loom landing page",
    intro: "A broad product page that shows entry points, product guidance, and a search-driven content block.",
    sections: [
      {
        pattern: "auth-form",
        title: "Signup conversion",
        description: "Centered authentication or waitlist entry block.",
      },
      {
        pattern: "empty-state",
        title: "Product activation",
        description: "Zero-data pitch for first-run experience.",
      },
      {
        pattern: "search-results",
        title: "Documentation search",
        description: "Searchable proof of product depth and documentation coverage.",
      },
    ],
  },
  "admin-dashboard": {
    name: "admin-dashboard",
    description: "Operations dashboard with shell chrome and a CRUD management surface.",
    patterns: ["dashboard-shell", "crud-table"],
    title: "Loom admin dashboard",
    intro: "An internal dashboard with navigation, metrics, and record management in one page shell.",
    sections: [
      {
        pattern: "dashboard-shell",
        title: "Dashboard shell",
        description: "Primary app shell with navigation and overview panels.",
      },
      {
        pattern: "crud-table",
        title: "Record management",
        description: "Operational data grid with search, pagination, and confirmation flows.",
      },
    ],
  },
  "internal-tool": {
    name: "internal-tool",
    description: "Settings-heavy internal tool with search and data management flows.",
    patterns: ["settings-page", "search-results", "crud-table"],
    title: "Loom internal tool",
    intro: "A settings-oriented page for internal operators, with search and record workflows included.",
    sections: [
      {
        pattern: "settings-page",
        title: "Workspace settings",
        description: "Tabbed settings, form controls, and confirmation flows.",
      },
      {
        pattern: "search-results",
        title: "Knowledge retrieval",
        description: "Search UI for reference material or task lookup.",
      },
      {
        pattern: "crud-table",
        title: "Operational table",
        description: "Table workflow for bulk actions and auditing.",
      },
    ],
  },
};

export function getScaffoldDefinition(name: string): ScaffoldDefinition | null {
  return SCAFFOLDS[name as ScaffoldDefinition["name"]] ?? null;
}

export function listScaffoldDefinitions(): ScaffoldDefinition[] {
  return Object.values(SCAFFOLDS).sort((left, right) => left.name.localeCompare(right.name));
}

export async function renderScaffoldHtml(
  projectRoot: string,
  config: LoomConfig,
  definition: ScaffoldDefinition,
): Promise<string> {
  const sections = await Promise.all(
    definition.sections.map(async (section) => {
      const source = await readPatternHtml(projectRoot, config, section.pattern);

      return [
        `<section data-scaffold-part="section" data-pattern="${section.pattern}">`,
        "  <div data-scaffold-part=\"copy\">",
        `    <p data-scaffold-part="eyebrow">${section.pattern}</p>`,
        `    <h2 data-scaffold-part="heading">${section.title}</h2>`,
        `    <p data-scaffold-part="description">${section.description}</p>`,
        "  </div>",
        source
          .trim()
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n"),
        "</section>",
      ].join("\n");
    }),
  );
  const cssLinks = [
    "../tokens/index.css",
    "../base/reset.css",
    "../base/prose.css",
    ...config.installed.primitives.map((name) => `../primitives/${name}/${name}.css`),
    ...config.installed.recipes.map((name) => `../recipes/${name}/${name}.css`),
    ...config.installed.patterns.map((name) => `../patterns/${name}/${name}.css`),
  ];

  return [
    "<!doctype html>",
    `<html lang="en" data-theme="${config.theme}">`,
    "  <head>",
    "    <meta charset=\"utf-8\" />",
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `    <title>${definition.title}</title>`,
    ...cssLinks.map((href) => `    <link rel="stylesheet" href="${href}" />`),
    "    <style>",
    "      body {",
    "        margin: 0;",
    "        background: var(--color-bg);",
    "        color: var(--color-fg);",
    "        font-family: var(--font-sans);",
    "      }",
    "      [data-scaffold] {",
    "        display: grid;",
    "        gap: var(--space-8);",
    "      }",
    "      [data-scaffold-part=\"hero\"] {",
    "        display: grid;",
    "        gap: var(--space-4);",
    "        padding: var(--space-8) var(--space-6) var(--space-2);",
    "      }",
    "      [data-scaffold-part=\"hero\"] h1 {",
    "        margin: 0;",
    "        font-size: clamp(2rem, 4vw, 3.5rem);",
    "        line-height: 1;",
    "      }",
    "      [data-scaffold-part=\"hero\"] p {",
    "        max-inline-size: 52rem;",
    "        margin: 0;",
    "        color: var(--color-fg-muted);",
    "        font-size: var(--text-base);",
    "      }",
    "      [data-scaffold-part=\"section\"] {",
    "        display: grid;",
    "        gap: var(--space-5);",
    "      }",
    "      [data-scaffold-part=\"copy\"] {",
    "        display: grid;",
    "        gap: var(--space-2);",
    "        padding-inline: var(--space-6);",
    "      }",
    "      [data-scaffold-part=\"eyebrow\"] {",
    "        margin: 0;",
    "        color: var(--color-primary);",
    "        font-size: var(--text-xs);",
    "        font-weight: var(--weight-semibold);",
    "        letter-spacing: var(--tracking-wide);",
    "        text-transform: uppercase;",
    "      }",
    "      [data-scaffold-part=\"heading\"], [data-scaffold-part=\"description\"] {",
    "        margin: 0;",
    "      }",
    "      [data-scaffold-part=\"description\"] {",
    "        color: var(--color-fg-muted);",
    "      }",
    "    </style>",
    "  </head>",
    "  <body>",
    "    <main data-scaffold>",
    "      <header data-scaffold-part=\"hero\">",
    `        <p data-scaffold-part="eyebrow">${definition.name}</p>`,
    `        <h1>${definition.title}</h1>`,
    `        <p>${definition.intro}</p>`,
    "      </header>",
    ...sections.map((section) => `      ${section.replace(/\n/g, "\n      ")}`),
    "    </main>",
    "    <script type=\"module\" src=\"../loom.js\"></script>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

async function readPatternHtml(projectRoot: string, config: LoomConfig, name: string): Promise<string> {
  return await readTextFile(
    resolvePackagePath(projectRoot, config.output_dir, "patterns", name, `${name}.html`),
  );
}
