import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "./config";
import { log } from "./logger";

export interface BundleOptions {
  output?: string;
  minify?: boolean;
  dryRun?: boolean;
  js?: boolean;
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
  const isJS = options?.js ?? false;
  const bundleOutput = options?.output ??
    (isJS ? join(outputDir, "faqir.bundle.js") : config.bundle?.output ?? join(outputDir, "faqir.bundle.css"));
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

  if (isJS) {
    // The assembled core must run first; classic-script plugins self-register
    // against its global Faqir API in stable filename order.
    await addFile(join(outputDir, "core", "faqir-core.js"), "core/faqir-core.js");
    const pluginsDir = join(outputDir, "core", "plugins");
    if (existsSync(pluginsDir)) {
      for (const file of readdirSync(pluginsDir).filter((name) => name.endsWith(".js")).sort()) {
        await addFile(join(pluginsDir, file), `core/plugins/${file}`);
      }
    }
  } else {
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
    await addFile(join(outputDir, "base", "motion-presets.css"), "base/motion-presets.css");

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
  }

  if (!isDryRun) {
    let bundleContent = isJS
      ? `/* Faqir UI JS Bundle */\n/* ${includedFiles.length} files */\n\n` + sections.join("\n\n")
      : `/* Faqir UI Bundle — generated ${new Date().toISOString()} */\n/* ${includedFiles.length} files */\n\n` + sections.join("\n\n");

    if (shouldMinify && !isJS) {
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
