import { existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "./config";
import { log } from "./logger";

export interface BundleOptions {
  output?: string;
  minify?: boolean;
  dryRun?: boolean;
}

const TOKEN_FILES_ORDERED = [
  "palette.css",
  "spacing.css",
  "typography.css",
  "effects.css",
  "motion.css",
  "semantic.css",
  "aliases.css",
  "document.css",
  "doc-aliases.css",
];

export function minifyCSS(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>+~])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

export async function generateBundle(
  cwd: string,
  options?: BundleOptions
): Promise<{ output: string; fileCount: number; files: string[] }> {
  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const bundleOutput = options?.output ?? config.bundle?.output ?? join(outputDir, "loom.bundle.css");
  const shouldMinify = options?.minify ?? config.bundle?.minify ?? false;

  const sections: string[] = [];
  const includedFiles: string[] = [];

  const isDryRun = options?.dryRun ?? false;

  async function addFile(filePath: string, label: string): Promise<void> {
    if (!existsSync(filePath)) return;
    if (!isDryRun) {
      const content = await Bun.file(filePath).text();
      sections.push(`/* === ${label} === */\n${content}`);
    }
    includedFiles.push(label);
  }

  // 1. Tokens
  if (config.tokens_split) {
    for (const file of TOKEN_FILES_ORDERED) {
      await addFile(join(outputDir, "tokens", file), `tokens/${file}`);
    }
  } else {
    await addFile(join(outputDir, "tokens", "index.css"), "tokens/index.css");
  }

  // 2. Theme
  await addFile(join(outputDir, "tokens", "theme.css"), "tokens/theme.css");

  // 3. Base
  await addFile(join(outputDir, "base", "reset.css"), "base/reset.css");
  await addFile(join(outputDir, "base", "prose.css"), "base/prose.css");

  // 4. Primitives (alphabetical)
  for (const name of [...config.installed.primitives].sort()) {
    await addFile(join(outputDir, "primitives", name, `${name}.css`), `primitives/${name}.css`);
  }

  // 5. Recipes (alphabetical)
  for (const name of [...config.installed.recipes].sort()) {
    await addFile(join(outputDir, "recipes", name, `${name}.css`), `recipes/${name}.css`);
  }

  // 6. Patterns (alphabetical)
  for (const name of [...config.installed.patterns].sort()) {
    await addFile(join(outputDir, "patterns", name, `${name}.css`), `patterns/${name}.css`);
  }

  if (!isDryRun) {
    let bundleContent = `/* Loom UI Bundle — generated ${new Date().toISOString()} */\n/* ${includedFiles.length} files */\n\n` + sections.join("\n\n");

    if (shouldMinify) {
      bundleContent = minifyCSS(bundleContent);
    }

    await Bun.write(bundleOutput, bundleContent);
  }

  return {
    output: bundleOutput,
    fileCount: includedFiles.length,
    files: includedFiles,
  };
}
