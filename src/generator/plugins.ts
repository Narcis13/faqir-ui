import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface PluginMetadata {
  name: string;
  file: string;
  provides: string[];
  description?: string;
}

/**
 * Read official plugin metadata from their deterministic source headers.
 * Plugins deliberately have no manifests; the two `@ui:` header lines are the
 * distribution and agent-discovery contract shared by project and shipped
 * generators.
 */
export function loadPluginMetadata(pluginsDir: string): PluginMetadata[] {
  if (!existsSync(pluginsDir)) return [];

  const plugins: PluginMetadata[] = [];
  for (const file of readdirSync(pluginsDir).filter((name) => name.endsWith(".js")).sort()) {
    const source = readFileSync(join(pluginsDir, file), "utf8");
    const name = source.match(/^\/\/ @ui:plugin\s+(.+)$/m)?.[1]?.trim();
    if (!name) continue;

    const provides = (source.match(/^\/\/ @ui:provides\s+(.+)$/m)?.[1] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const summary = source.match(/^\s*\*\s+([^\n]+)$/m)?.[1]?.trim();
    const description = summary?.replace(new RegExp(`^${name}\\s+[—-]\\s+`), "");

    plugins.push({
      name,
      file,
      provides,
      ...(description ? { description } : {}),
    });
  }
  return plugins;
}
