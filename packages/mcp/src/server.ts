/**
 * The Faqir MCP server: boot + registration of the read tools.
 *
 * `createFaqirMcpServer()` returns a fully-wired {@link McpServer} that any
 * transport can drive — a stdio transport in production (`index.ts`), or an
 * in-memory transport in tests. Tools declare their input AND output shapes as
 * MCP tool schemas (via Zod → JSON Schema), so results are validated, not
 * free-form. All Faqir logic lives in `core.ts`, which wraps the CLI internals.
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
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
import type { Manifest } from "./core";
import { loadManifestMap, readTokenReference } from "./registry";
import {
  auditHtml,
  generateComponent,
  scaffoldPage,
  toAuditReport,
  GenerateError,
  type ScaffoldSection,
} from "./generate";
import { applyRepairsToSource } from "../../../src/audit/repairer";
import { auditHtmlSource } from "../../../src/audit/checker";
import {
  generateThemeBundle,
  themeScorecard,
  type ThemeGenerateInput,
} from "../../../src/commands/theme-generate";
import { densityTokenCss, themeBaseSources } from "../../../src/theme/sources";
import { mergeSeeds } from "../../../src/theme/seed";
import { THEME_AXIS_VALUES } from "../../../src/theme-manifest";
import {
  PROTOCOL_URI,
  TOKENS_URI,
  MANIFEST_INDEX_URI,
  MANIFEST_URI_PREFIX,
  buildProtocolSpec,
  buildManifestIndex,
} from "./resources";

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

const generatedContrastSchema = z.object({
  theme: z.string(),
  scheme: z.enum(["light", "dark"]),
  foreground: z.string(),
  background: z.string(),
  foreground_value: z.string(),
  background_value: z.string(),
  ratio: z.number(),
  threshold: z.number(),
  passes: z.boolean(),
  auto_adjusted: z.boolean(),
});

// ── Scorecard v2 [1.1A-11] ─────────────────────────────────────────────────
//
// The same object `faqir theme generate --json` prints, assembled by the same
// `themeScorecard()`. Its `generated` paths are where the CLI WOULD write —
// this tool writes nothing — while the css and manifests themselves come back
// in the top-level `generated` array, as they always have.

const scorecardFileSchema = z.object({
  kind: z.enum(["theme", "document"]),
  name: z.string(),
  css: z.string(),
  manifest: z.string(),
  preview: z.string(),
  seed: z.string().optional(),
});

const elevationSchema = z.object({
  theme: z.string(),
  scheme: z.enum(["light", "dark"]),
  from: z.string(),
  to: z.string(),
  delta: z.number().nullable(),
  threshold: z.number(),
  passes: z.boolean(),
});

const focusRingSchema = z.object({
  theme: z.string(),
  scheme: z.enum(["light", "dark"]),
  ring: z.string(),
  surface: z.string(),
  ratio: z.number().nullable(),
  translucent: z.boolean(),
  threshold: z.number(),
  passes: z.boolean(),
});

const tapTargetSchema = z.object({
  control: z.string(),
  density: z.string(),
  height_px: z.number().nullable(),
  threshold_px: z.number(),
  passes: z.boolean(),
});

// Distinctiveness [1.1A-12] is measured against the themes already in the
// OUTPUT DIRECTORY — the set the new theme would ship beside. This tool has no
// output directory (it writes nothing), so the block is `null` here for exactly
// the same reason it is null when the CLI generates into an empty folder: there
// is nothing to be distinct FROM. The shape is declared in full so that a
// caller which does supply peers gets a validated object rather than a
// passthrough.
const distinctivenessSchema = z.object({
  nearest: z.string(),
  axis_distance: z.number().int(),
  token_distance: z.number().nullable(),
  axes_differing: z.array(z.string()),
  schemes: z.array(z.enum(["light", "dark"])),
  samples: z.number().int(),
  thresholds: z.object({ axis_distance: z.number(), token_distance: z.number() }),
  passes: z.boolean(),
  allow_similar: z.boolean(),
});

const scorecardSchema = z
  .object({
    scorecard_version: z.number().int(),
    theme_generate_schema_version: z.number().int(),
    command: z.literal("theme generate"),
    name: z.string(),
    seed: z.record(z.string(), z.unknown()),
    axes: z.record(z.string(), z.unknown()),
    generated: z.array(scorecardFileSchema),
    contrast: z.array(generatedContrastSchema),
    elevation: z.array(elevationSchema),
    focus_ring: z.array(focusRingSchema),
    tap_targets: z.array(tapTargetSchema),
    distinctiveness: distinctivenessSchema.nullable(),
  })
  .passthrough();

/** One axis vocabulary, rendered for a tool description. */
function axisChoices(path: string): string {
  const values = (THEME_AXIS_VALUES as Record<string, readonly (string | number)[] | undefined>)[path];
  return values ? values.join(", ") : "";
}

// ── Audit / repair schema fragments ────────────────────────────────────────
const severitySchema = z.enum(["critical", "error", "warning", "info"]);

const findingSchema = z.object({
  rule_id: z.string(),
  severity: severitySchema,
  component_name: z.string(),
  line: z.number().int(),
  column: z.number().int().optional(),
  message: z.string(),
  fixable: z.boolean(),
});

const countsSchema = z.object({
  critical: z.number().int(),
  error: z.number().int(),
  warning: z.number().int(),
  info: z.number().int(),
});

const auditReportSchema = z.object({
  passed: z.boolean(),
  counts: countsSchema,
  findings: z.array(findingSchema),
});

const repairChangeSchema = z.object({
  rule_id: z.string(),
  type: z.string(),
  message: z.string(),
});

// Section shapes for faqir_scaffold_page: a component, a heading, or raw HTML.
const propsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
const slotsSchema = z.record(z.string(), z.string());
const sectionSchema = z.union([
  z.object({
    component: z.string(),
    variant: z.string().optional(),
    size: z.string().optional(),
    props: propsSchema.optional(),
    slots: slotsSchema.optional(),
  }),
  z.object({ heading: z.string(), level: z.number().int().min(1).max(6).optional() }),
  z.object({ html: z.string() }),
]);

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

  // The manifest map that backs every write/verify tool. Loaded once, lazily, and
  // cached — so the audit/repair handlers themselves do zero filesystem access
  // per call (they only touch the input string and this in-memory map).
  let manifestMapPromise: Promise<Map<string, Manifest>> | null = null;
  const manifests = (): Promise<Map<string, Manifest>> =>
    (manifestMapPromise ??= loadManifestMap(registryPath));

  // ── faqir_generate ───────────────────────────────────────────────────────
  server.registerTool(
    "faqir_generate",
    {
      title: "Generate a component",
      description:
        "Render one Faqir component to HTML from its manifest template, then audit " +
        "the result before returning it — so the markup is guaranteed to satisfy its " +
        "own manifest (valid variant/size, required slots and ARIA present). " +
        "`variant`/`size` are validated against the manifest; `props`/`slots` fill the " +
        "template's `{placeholders}` by name. Recipes report the controller they need " +
        "via `requires_controller` (a page concern, not a fragment finding).",
      inputSchema: {
        component: z.string().describe("Component name or alias, e.g. 'button' or 'alert'."),
        variant: z.string().optional().describe("Visual variant (data-variant); defaults to the manifest default."),
        size: z.string().optional().describe("Size variant (data-size); defaults to the manifest default."),
        slots: slotsSchema.optional().describe("Content placeholder values by name, e.g. { body: '…' }."),
        props: propsSchema.optional().describe("Template placeholder values by name, e.g. { text: 'Save' }."),
        id: z.string().optional().describe("Stable id for templates that need {id} (defaults to the component name)."),
        template: z.string().optional().describe("Named template variant from the manifest (defaults to 'html')."),
      },
      outputSchema: {
        html: z.string(),
        component: z.string(),
        variant: z.string().nullable(),
        size: z.string().nullable(),
        placeholders: z.array(z.string()),
        requires_controller: z.string().optional(),
        repairs: z.array(repairChangeSchema),
        audit: auditReportSchema,
      },
    },
    async (input) => {
      try {
        const result = generateComponent(input, await manifests());
        return ok({ ...result });
      } catch (err) {
        if (err instanceof GenerateError) return fail(err.message);
        throw err;
      }
    }
  );

  // ── faqir_scaffold_page ──────────────────────────────────────────────────
  server.registerTool(
    "faqir_scaffold_page",
    {
      title: "Scaffold a full page",
      description:
        "Compose several components into a complete, landmark-correct HTML document. " +
        "`sections` is an ordered list of components ({ component, variant?, size?, " +
        "props?, slots? }), headings ({ heading, level? }), or raw HTML ({ html }). The " +
        "content is wrapped in a <main> landmark and, when any recipe is used, the " +
        "auto-init controller script is included — then the whole page is audited.",
      inputSchema: {
        title: z.string().optional().describe("Document <title> (default 'Untitled')."),
        layout: z.enum(["stack", "grid", "none"]).optional().describe("Container wrapping the sections (default 'stack')."),
        stylesheet: z.string().optional().describe("Stylesheet href to link (default 'ui/faqir.bundle.css')."),
        sections: z.array(sectionSchema).min(1).describe("Ordered page sections."),
      },
      outputSchema: {
        html: z.string(),
        components_used: z.array(z.string()),
        audit: auditReportSchema,
      },
    },
    async (input) => {
      try {
        const result = scaffoldPage(
          { ...input, sections: input.sections as ScaffoldSection[] },
          await manifests(),
        );
        return ok({ ...result });
      } catch (err) {
        if (err instanceof GenerateError) return fail(err.message);
        throw err;
      }
    }
  );

  // ── faqir_audit_html ─────────────────────────────────────────────────────
  server.registerTool(
    "faqir_audit_html",
    {
      title: "Audit HTML",
      description:
        "Audit an HTML **string** against the Faqir manifests and return findings JSON " +
        "(rule id, severity, line, message, whether it is auto-fixable). String in, " +
        "no filesystem needed — cloud agents without disk can validate their own output. " +
        "`skip_rules` opts out of specific rule ids.",
      inputSchema: {
        html: z.string().describe("The HTML to audit."),
        skip_rules: z.array(z.string()).optional().describe("Rule ids to skip."),
      },
      outputSchema: {
        passed: z.boolean(),
        counts: countsSchema,
        findings: z.array(findingSchema),
      },
    },
    async ({ html, skip_rules }) => {
      const report = auditHtml(html, await manifests(), skip_rules);
      return ok({ ...report });
    }
  );

  // ── faqir_repair_html ────────────────────────────────────────────────────
  server.registerTool(
    "faqir_repair_html",
    {
      title: "Repair HTML",
      description:
        "Apply Faqir's deterministic auto-fixes to an HTML **string** and return the " +
        "repaired HTML plus a change log and before/after audits. String in, string out, " +
        "no filesystem. Fixes cover missing ARIA (aria-label/labelledby/describedby, " +
        "roles), safe duplicate-id renames, and field-group wiring.",
      inputSchema: {
        html: z.string().describe("The HTML to repair."),
        skip_rules: z.array(z.string()).optional().describe("Rule ids to skip when auditing."),
      },
      outputSchema: {
        html: z.string(),
        applied: z.number().int(),
        skipped: z.number().int(),
        changes: z.array(repairChangeSchema),
        before: auditReportSchema,
        after: auditReportSchema,
      },
    },
    async ({ html, skip_rules }) => {
      const manifestMap = await manifests();
      const before = auditHtmlSource({ source: html, manifests: manifestMap, skipRules: skip_rules });
      const repaired = applyRepairsToSource(html, before);
      const after = auditHtmlSource({ source: repaired.source, manifests: manifestMap, skipRules: skip_rules });
      return ok({
        html: repaired.source,
        applied: repaired.applied,
        skipped: repaired.skipped,
        changes: repaired.changes,
        before: toAuditReport(before),
        after: toAuditReport(after),
      });
    }
  );

  // ── faqir_generate_theme ─────────────────────────────────────────────────
  server.registerTool(
    "faqir_generate_theme",
    {
      title: "Generate a contrast-verified theme",
      description:
        "Generate a deterministic theme from a SEED: one accent color plus any of the " +
        "fourteen character axes (type, shape, depth, material, motion, density, focus, " +
        "decoration, controls, contrast). Returns the CSS, derived manifest, and the same " +
        "scorecard `faqir theme generate --json` prints — contrast ratios, elevation ΔE, " +
        "focus-ring ratios and tap targets — entirely in memory. Optionally includes a " +
        "matching print/document variant.",
      inputSchema: {
        seed: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "A complete theme seed (manifest.schema.json definitions.themeSeed): " +
              "{ name, accent, neutral, scheme, type, shape, depth, material, motion, " +
              "density, focus, decoration, controls, contrast, document }. Every axis is " +
              "optional and takes its documented default. The fields below override it.",
          ),
        accent: z
          .string()
          .optional()
          .describe("Opaque oklch(), #rgb, or #rrggbb accent color."),
        name: z
          .string()
          .optional()
          .describe("Lowercase kebab-case theme name."),
        neutral: z.string().optional().describe(`Neutral tone: ${axisChoices("neutral")}.`),
        radius: z.string().optional().describe("1.0 compatibility flag for shape.radius: sm, md, lg."),
        scheme: z.string().optional().describe(`Color scheme: ${axisChoices("scheme")}.`),
        document: z.boolean().optional().describe("Also emit a print/document companion."),
      },
      outputSchema: {
        name: z.string(),
        accent: z.object({
          input: z.string(),
          oklch: z.string(),
          lightness: z.number(),
          chroma: z.number(),
          hue: z.number(),
        }),
        neutral: z.string(),
        radius: z.enum(["sm", "md", "lg"]),
        scheme: z.enum(["light", "dark", "both"]),
        document: z.boolean(),
        generated: z.array(z.object({
          kind: z.enum(["theme", "document"]),
          name: z.string(),
          css: z.string(),
          manifest: themeEntrySchema,
          contrast: z.array(generatedContrastSchema),
        })),
        scorecard: scorecardSchema,
      },
    },
    async ({ seed, accent, name, neutral, radius, scheme, document }) => {
      try {
        // One code path with the CLI: the scalars are merged over the seed
        // exactly as `--depth hard` is merged over `--seed x.seed.json`
        // (flags win), and every validation error comes from `normalizeSeed`
        // inside `generateThemeBundle` — so an invalid axis prints the same
        // sentence here as it does in the terminal. The two defaults below are
        // this tool's own, kept from 1.0 so an argument-free call still works.
        const explicit: Record<string, unknown> = {};
        for (const [key, value] of Object.entries({ name, accent, neutral, scheme, document })) {
          if (value !== undefined) explicit[key] = value;
        }
        const input = mergeSeeds(seed ?? {}, explicit) as Record<string, unknown>;
        if (input.name === undefined) input.name = "generated-theme";
        if (input.accent === undefined) input.accent = "oklch(0.55 0.2 250)";

        const baseCssSources = themeBaseSources(registryPath);
        const bundle = generateThemeBundle(
          { ...(input as unknown as ThemeGenerateInput), ...(radius ? { radius: radius as never } : {}) },
          baseCssSources,
        );
        const scorecard = themeScorecard(bundle, baseCssSources, {
          densityCss: densityTokenCss(registryPath),
        });
        return ok({
          name: bundle.name,
          accent: bundle.accent,
          neutral: bundle.neutral,
          radius: bundle.radius,
          scheme: bundle.scheme,
          document: bundle.document,
          generated: bundle.generated.map((file) => ({
            kind: file.kind,
            name: file.name,
            css: file.css,
            manifest: file.manifest,
            contrast: file.contrast,
          })),
          scorecard,
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── Resources: protocol spec, token reference, manifests ──────────────────
  server.registerResource(
    "faqir-protocol",
    PROTOCOL_URI,
    {
      title: "Faqir attribute protocol",
      description: "The data-ui/data-part/data-variant/data-size/data-state protocol and authoring rules.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildProtocolSpec() }],
    })
  );

  server.registerResource(
    "faqir-tokens",
    TOKENS_URI,
    {
      title: "Faqir token reference",
      description: "Every design token (var(--…)) as CSS, assembled from the registry token files.",
      mimeType: "text/css",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/css", text: readTokenReference(registryPath) }],
    })
  );

  server.registerResource(
    "faqir-manifests",
    MANIFEST_INDEX_URI,
    {
      title: "Faqir manifest index",
      description: "Index of every registry component manifest, each with its faqir://manifest/{name} URI.",
      mimeType: "application/json",
    },
    async (uri) => {
      const index = buildManifestIndex(await manifests());
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(index, null, 2) }] };
    }
  );

  server.registerResource(
    "faqir-manifest",
    new ResourceTemplate(`${MANIFEST_URI_PREFIX}{name}`, {
      list: async () => ({
        resources: buildManifestIndex(await manifests()).components.map((c) => ({
          uri: c.uri,
          name: c.name,
          description: c.description,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Faqir component manifest",
      description: "The full manifest for a single component, by name (aliases resolve).",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const name = String(variables.name);
      const manifest = (await manifests()).get(name);
      if (!manifest) throw new Error(`Unknown component '${name}'.`);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(manifest, null, 2) }],
      };
    }
  );

  return server;
}
