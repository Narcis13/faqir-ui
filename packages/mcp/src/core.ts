/**
 * MCP core — the data layer behind the Faqir MCP tools.
 *
 * Every function here is a thin wrapper over the CLI's own TypeScript internals
 * (`src/…`). There is intentionally NO Faqir logic implemented here: components,
 * manifests, themes, and project detection all resolve through the same modules
 * the `faqir` CLI uses, so the two frontends can never drift. The server layer
 * (`server.ts`) turns these plain-data results into MCP tool responses.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { getRegistryPath } from "../../../src/utils/fs";
import {
  listRegistryComponentsWithMeta,
  loadRegistryManifest,
  type ComponentSummary,
} from "../../../src/utils/components";
import {
  listRegistryThemes,
  loadThemeManifest,
  type ThemeManifest,
} from "../../../src/theme-manifest";
import { configExists, readConfig, type FaqirConfig } from "../../../src/utils/config";
import { suggestClosest } from "../../../src/utils/suggest";
import type { Manifest } from "../../../src/manifest";

export type { ComponentSummary } from "../../../src/utils/components";
export type { Manifest } from "../../../src/manifest";
export type { ThemeManifest } from "../../../src/theme-manifest";

/**
 * Resolve where the bundled registry lives. Precedence: an explicit path, the
 * `FAQIR_REGISTRY_PATH` env override (useful for packaging/hosting), then the
 * CLI's own registry resolver (walks up to the shipped `registry/`).
 */
export function resolveRegistryPath(explicit?: string): string {
  return explicit ?? process.env.FAQIR_REGISTRY_PATH ?? getRegistryPath();
}

/** Resolve the host project root the server operates against. */
export function resolveProjectRoot(explicit?: string): string {
  return explicit ?? process.env.FAQIR_PROJECT_ROOT ?? process.cwd();
}

/** The valid `kind` values a component filter may use. */
export const COMPONENT_KINDS = ["primitive", "recipe", "pattern", "scaffold"] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

/**
 * Registry inventory (name/kind/category/description/layer/aliases), optionally
 * filtered by `kind` and/or `category`.
 */
export async function listComponents(
  registryPath: string,
  filter?: { kind?: string; category?: string }
): Promise<ComponentSummary[]> {
  return listRegistryComponentsWithMeta(registryPath, filter);
}

/** The distinct categories present in the registry, sorted — for filter discovery. */
export async function listCategories(registryPath: string): Promise<string[]> {
  const all = await listRegistryComponentsWithMeta(registryPath);
  return [...new Set(all.map((c) => c.category))].sort();
}

/**
 * Full manifest for a single component (aliases resolved to their canonical
 * component). Returns `null` when the component is unknown.
 */
export async function getManifest(
  registryPath: string,
  component: string
): Promise<Manifest | null> {
  return loadRegistryManifest(component, registryPath);
}

/**
 * Best "did you mean …?" hint for an unknown component name, or `null` when
 * nothing is close. Matches against real component names only.
 */
export async function suggestComponent(
  registryPath: string,
  name: string
): Promise<string | null> {
  const names = (await listRegistryComponentsWithMeta(registryPath)).map((c) => c.name);
  return suggestClosest(name, names, 3);
}

/** A theme's manifest, or `null` when no such registry theme exists. */
export async function getTheme(
  registryPath: string,
  name: string
): Promise<ThemeManifest | null> {
  const manifestPath = join(registryPath, "themes", `${name}.theme.json`);
  if (!existsSync(manifestPath)) return null;
  return loadThemeManifest(manifestPath);
}

/** Names of every registry theme, sorted. */
export function themeNames(registryPath: string): string[] {
  return listRegistryThemes(registryPath);
}

/** Best "did you mean …?" hint for an unknown theme name, or `null`. */
export function suggestTheme(registryPath: string, name: string): string | null {
  return suggestClosest(name, listRegistryThemes(registryPath), 3);
}

/**
 * A lightweight theme card (no derived token arrays) — what `faqir_theme_info`
 * returns when listing all themes, so an agent can pick a theme without pulling
 * every full manifest into context.
 */
export interface ThemeSummary {
  name: string;
  version: string;
  mood: string[];
  scheme: ThemeManifest["scheme"];
  dark_mode: ThemeManifest["dark_mode"];
  pairs_with: string[];
  preview: string;
}

function toThemeSummary(m: ThemeManifest): ThemeSummary {
  return {
    name: m.name,
    version: m.version,
    mood: m.mood,
    scheme: m.scheme,
    dark_mode: m.dark_mode,
    pairs_with: m.pairs_with,
    preview: m.preview,
  };
}

/** Summaries for every registry theme, sorted by name. */
export async function listThemeSummaries(registryPath: string): Promise<ThemeSummary[]> {
  const summaries: ThemeSummary[] = [];
  for (const name of listRegistryThemes(registryPath)) {
    const m = await getTheme(registryPath, name);
    if (m) summaries.push(toThemeSummary(m));
  }
  return summaries;
}

/**
 * The project's active theme name: the `theme` in its `faqir.config.json` when
 * `projectRoot` is a Faqir project, otherwise the framework default (`"default"`).
 */
export async function activeThemeName(projectRoot: string): Promise<string> {
  if (configExists(projectRoot)) {
    try {
      return (await readConfig(projectRoot)).theme;
    } catch {
      /* fall through to the default */
    }
  }
  return "default";
}

/** Result of {@link readProjectContext}. */
export interface ProjectContextResult {
  in_project: boolean;
  root: string;
  /** Parsed `faqir.config.json`, or `null` outside a project. */
  config: FaqirConfig | null;
  /** Parsed `.faqir/context.json`, or `null` when it has not been generated. */
  context: Record<string, unknown> | null;
  /** Human/agent-readable note about what was (or wasn't) found. */
  message: string;
}

/**
 * Inspect a directory as a host Faqir project: whether it is one (a
 * `faqir.config.json` is present), its config, and its generated
 * `.faqir/context.json` when available.
 */
export async function readProjectContext(projectRoot: string): Promise<ProjectContextResult> {
  if (!configExists(projectRoot)) {
    return {
      in_project: false,
      root: projectRoot,
      config: null,
      context: null,
      message:
        "Not a Faqir project — no faqir.config.json found. Run `faqir init` to start one.",
    };
  }

  let config: FaqirConfig | null = null;
  try {
    config = await readConfig(projectRoot);
  } catch {
    config = null;
  }

  const contextPath = join(projectRoot, ".faqir", "context.json");
  if (!existsSync(contextPath)) {
    return {
      in_project: true,
      root: projectRoot,
      config,
      context: null,
      message:
        "Faqir project found, but `.faqir/context.json` is missing. Run `faqir context` to generate it.",
    };
  }

  let context: Record<string, unknown> | null = null;
  try {
    context = (await Bun.file(contextPath).json()) as Record<string, unknown>;
  } catch {
    return {
      in_project: true,
      root: projectRoot,
      config,
      context: null,
      message: "Faqir project found, but `.faqir/context.json` could not be parsed as JSON.",
    };
  }

  return {
    in_project: true,
    root: projectRoot,
    config,
    context,
    message: "Faqir project context loaded from `.faqir/context.json`.",
  };
}
