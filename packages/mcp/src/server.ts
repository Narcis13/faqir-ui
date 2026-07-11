/**
 * The Faqir MCP server: boot + registration of the read tools.
 *
 * `createFaqirMcpServer()` returns a fully-wired {@link McpServer} that any
 * transport can drive — a stdio transport in production (`index.ts`), or an
 * in-memory transport in tests. Tools declare their input AND output shapes as
 * MCP tool schemas (via Zod → JSON Schema), so results are validated, not
 * free-form. All Faqir logic lives in `core.ts`, which wraps the CLI internals.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import pkg from "../package.json";
import {
  COMPONENT_KINDS,
  activeThemeName,
  getManifest,
  listComponents,
  listThemeSummaries,
  getTheme,
  readProjectContext,
  resolveProjectRoot,
  resolveRegistryPath,
  suggestComponent,
  suggestTheme,
} from "./core";

export interface FaqirMcpServerOptions {
  /** Registry root. Defaults to `FAQIR_REGISTRY_PATH` or the bundled registry. */
  registryPath?: string;
  /** Host project root for `faqir_project_context`. Defaults to `process.cwd()`. */
  projectRoot?: string;
}

// ── Reusable schema fragments ──────────────────────────────────────────────
// Output schemas are declared, but kept permissive (`.passthrough()`, optional
// derived fields) so every valid registry artifact validates. The always-present
// manifest fields are required; the rest are optional to tolerate schema growth.

const componentSummarySchema = z.object({
  name: z.string(),
  kind: z.string(),
  category: z.string(),
  description: z.string(),
  layer: z.string(),
  aliases: z.array(z.string()),
});

const manifestSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    kind: z.string(),
    category: z.string(),
    description: z.string(),
    aliases: z.array(z.string()).optional(),
    anatomy: z.record(z.string(), z.unknown()).optional(),
    slots: z.record(z.string(), z.unknown()).optional(),
    variants: z.record(z.string(), z.unknown()).optional(),
    states: z.record(z.string(), z.unknown()).optional(),
    a11y: z.record(z.string(), z.unknown()).optional(),
    tokens_used: z.array(z.string()).optional(),
    templates: z.record(z.string(), z.unknown()).optional(),
    safe_transforms: z.array(z.string()).optional(),
    unsafe_transforms: z.array(z.string()).optional(),
    composition: z.record(z.string(), z.unknown()).optional(),
    files: z.record(z.string(), z.unknown()).optional(),
    tests: z.array(z.string()).optional(),
  })
  .passthrough();

const themeEntrySchema = z
  .object({
    name: z.string(),
    version: z.string(),
    mood: z.array(z.string()),
    scheme: z.string(),
    dark_mode: z.string(),
    pairs_with: z.array(z.string()),
    preview: z.string(),
    tokens_overridden: z.array(z.string()).optional(),
    tokens_inherited: z.array(z.string()).optional(),
  })
  .passthrough();

/** Shape a successful tool result: JSON text content + validated structured content. */
function ok(structured: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

/** Shape a clean tool-level error (never a protocol crash). */
function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

/**
 * Build the Faqir MCP server with the read tools registered. Pure and
 * transport-agnostic — connect it to any transport with `.connect(transport)`.
 */
export function createFaqirMcpServer(options: FaqirMcpServerOptions = {}): McpServer {
  const registryPath = resolveRegistryPath(options.registryPath);
  const projectRoot = resolveProjectRoot(options.projectRoot);

  const server = new McpServer({
    name: "faqir",
    version: pkg.version,
  });

  // ── faqir_list_components ────────────────────────────────────────────────
  server.registerTool(
    "faqir_list_components",
    {
      title: "List Faqir components",
      description:
        "List the Faqir registry inventory (primitives, recipes, patterns) with each " +
        "component's kind, category, description, layer, and aliases. Optionally filter " +
        "by `kind` and/or `category`.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        kind: z
          .enum(COMPONENT_KINDS)
          .optional()
          .describe("Filter to a single component kind."),
        category: z
          .string()
          .optional()
          .describe("Filter to a single manifest category (e.g. 'actions', 'overlay')."),
      },
      outputSchema: {
        components: z.array(componentSummarySchema),
        count: z.number().int(),
        filter: z.object({
          kind: z.string().optional(),
          category: z.string().optional(),
        }),
      },
    },
    async ({ kind, category }) => {
      const components = await listComponents(registryPath, { kind, category });
      return ok({
        components,
        count: components.length,
        filter: { ...(kind ? { kind } : {}), ...(category ? { category } : {}) },
      });
    }
  );

  // ── faqir_get_manifest ───────────────────────────────────────────────────
  server.registerTool(
    "faqir_get_manifest",
    {
      title: "Get a component manifest",
      description:
        "Return the full manifest for a single registry component (anatomy, slots, " +
        "variants, states, a11y, tokens, templates, transforms, composition). Accepts " +
        "aliases, which resolve to the canonical component.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        component: z.string().describe("Component name or alias, e.g. 'button' or 'alert'."),
      },
      outputSchema: {
        component: z.string(),
        manifest: manifestSchema,
      },
    },
    async ({ component }) => {
      const manifest = await getManifest(registryPath, component);
      if (!manifest) {
        const hint = await suggestComponent(registryPath, component);
        return fail(
          `Unknown component '${component}'.` +
            (hint ? ` Did you mean '${hint}'?` : " Run faqir_list_components to see all components.")
        );
      }
      return ok({ component: manifest.name, manifest });
    }
  );

  // ── faqir_theme_info ─────────────────────────────────────────────────────
  server.registerTool(
    "faqir_theme_info",
    {
      title: "Theme information",
      description:
        "Without `theme`: list every registry theme as a summary (mood, scheme, dark " +
        "mode, pairings). With `theme`: return that theme's full manifest including its " +
        "overridden/inherited token sets. `active_theme` reflects the host project's " +
        "configured theme when run inside one, else 'default'.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        theme: z
          .string()
          .optional()
          .describe("A specific theme name to fetch the full manifest for."),
      },
      outputSchema: {
        themes: z.array(themeEntrySchema),
        active_theme: z.string(),
        count: z.number().int(),
      },
    },
    async ({ theme }) => {
      const active_theme = await activeThemeName(projectRoot);

      if (theme) {
        const manifest = await getTheme(registryPath, theme);
        if (!manifest) {
          const hint = suggestTheme(registryPath, theme);
          return fail(
            `Unknown theme '${theme}'.` +
              (hint ? ` Did you mean '${hint}'?` : " Run faqir_theme_info with no argument to list themes.")
          );
        }
        return ok({ themes: [manifest], active_theme, count: 1 });
      }

      const themes = await listThemeSummaries(registryPath);
      return ok({ themes, active_theme, count: themes.length });
    }
  );

  // ── faqir_project_context ────────────────────────────────────────────────
  server.registerTool(
    "faqir_project_context",
    {
      title: "Host project context",
      description:
        "Read the host project's Faqir context. Reports whether the directory is a " +
        "Faqir project (has faqir.config.json), returns its config, and returns the " +
        "generated `.faqir/context.json` (installed components, active theme, protocol, " +
        "rules) when present. Defaults to the server's project root.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        root: z
          .string()
          .optional()
          .describe("Override the project root to inspect (defaults to the server's cwd)."),
      },
      outputSchema: {
        in_project: z.boolean(),
        root: z.string(),
        config: z.record(z.string(), z.unknown()).nullable(),
        context: z.record(z.string(), z.unknown()).nullable(),
        message: z.string(),
      },
    },
    async ({ root }) => {
      const result = await readProjectContext(root ?? projectRoot);
      return ok({
        in_project: result.in_project,
        root: result.root,
        config: (result.config as Record<string, unknown> | null) ?? null,
        context: result.context,
        message: result.message,
      });
    }
  );

  return server;
}
