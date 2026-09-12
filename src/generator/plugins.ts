import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface PluginMetadata {
  name: string;
  file: string;
  provides: string[];
  description?: string;
  /** The indented markup example the header carries, dedented. */
  example?: string;
  /** The prose paragraph following that example, collapsed onto one line. */
  notes?: string;
  /** `@ui:modifier` lines, in header order. */
  modifiers: PluginModifier[];
}

/**
 * One dot-suffix a plugin's directive accepts, declared the way the engine
 * declares its own (`@ui:modifier <attribute> <.modifier> | <what it does>`).
 *
 * A plugin's modifiers were invisible to every generated surface before this:
 * the header renderer takes the summary, the example and ONE paragraph, so
 * `l-validate.async` was in the example with nothing saying what it means, and
 * an agent copying the example had no way to learn that it is what buys
 * `data-state="validating"`. Declaring them makes them derived rather than
 * re-described — the same contract the engine's own modifier tables run on.
 */
export interface PluginModifier {
  /** The directive it attaches to, e.g. `l-validate`. */
  attribute: string;
  /** The modifier, leading dot included, e.g. `.async`. */
  modifier: string;
  /** One line: what it does. */
  description: string;
}

/**
 * The header comment of a plugin is written to one shape: a summary line, an
 * indented markup example, then prose. `references/directives.md` renders the
 * example and the first prose paragraph, so a plugin documents itself there
 * exactly as it documents itself in its own source (task 1.0R-03).
 */
function readHeaderBody(source: string): { example?: string; notes?: string } {
  const block = /\/\*\*([\s\S]*?)\*\//.exec(source)?.[1];
  if (!block) return {};
  // Strip the leading ` * ` of each line, keeping the relative indentation the
  // example depends on.
  const body = block.split("\n").slice(1).map((line) => line.replace(/^\s*\* ?/, ""));
  const paragraphs: string[][] = [];
  for (const line of body) {
    if (line.trim() === "") paragraphs.push([]);
    else (paragraphs[paragraphs.length - 1] ??= []).push(line);
  }
  const filled = paragraphs.filter((p) => p.length > 0);
  const exampleAt = filled.findIndex((p) => p.every((line) => /^\s{2,}\S/.test(line)));
  if (exampleAt < 0) return {};
  const indent = Math.min(...filled[exampleAt].map((line) => line.length - line.trimStart().length));
  const example = filled[exampleAt].map((line) => line.slice(indent)).join("\n");
  const prose = filled[exampleAt + 1];
  return {
    example,
    ...(prose ? { notes: prose.join(" ").replace(/\s+/g, " ").trim() } : {}),
  };
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
    // The trailing `[0.6-05 · §A5]` is plan/spec provenance for maintainers and
    // noise for an agent reading the generated skill — drop it here, once.
    const description = summary
      ?.replace(new RegExp(`^${name}\\s+[—-]\\s+`), "")
      .replace(/\s*\[[^\]]*\]\s*$/, "");

    const modifiers: PluginModifier[] = [];
    for (const line of source.matchAll(/^\/\/ @ui:modifier\s+(\S+)\s+(\.\S+)\s*\|\s*(.+)$/gm)) {
      modifiers.push({ attribute: line[1], modifier: line[2], description: line[3].trim() });
    }

    plugins.push({
      name,
      file,
      provides,
      ...(description ? { description } : {}),
      ...readHeaderBody(source),
      modifiers,
    });
  }
  return plugins;
}
