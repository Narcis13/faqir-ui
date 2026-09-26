import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { readConfig } from "./config";
import { log } from "./logger";
import { FONTS_CSS_FILENAME, FONTS_DIR } from "../fonts/install";
import { installedStylesheetFile } from "./components";

export interface BundleOptions {
  output?: string;
  minify?: boolean;
  dryRun?: boolean;
  js?: boolean;
}

/** The token files, in cascade order — the order `faqir init` concatenates them into
 * `tokens/index.css` and the bundle links them. `density.css` re-declares alias
 * tokens at `:root` specificity, so it must stay last. */
export const TOKEN_FILES_ORDERED = [
  "palette.css",
  "spacing.css",
  "typography.css",
  "effects.css",
  "textures.css",
  "motion.css",
  "semantic.css",
  "aliases.css",
  "document.css",
  "doc-aliases.css",
  "density.css",
];

/** Functions whose `+` / `-` are arithmetic, where CSS REQUIRES the spaces. */
const MATH_FUNCTIONS = new Set(["calc", "min", "max", "clamp", "round", "mod", "rem", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "pow", "sqrt", "hypot", "log", "exp", "abs", "sign"]);

/**
 * Whitespace-and-comment minifier. A scanner rather than a chain of regexes,
 * because the space around a character means different things in different
 * places: `calc(1em + 2px)` is invalid as `calc(1em+2px)`, `a :hover` (any
 * hovered descendant) is not `a:hover`, and a string's contents are not CSS at
 * all. So strings are copied verbatim, comments dropped, whitespace runs
 * collapsed to one space, and a space is removed only where no reading of the
 * sheet can depend on it: around `{ } ; ,`, after `:` and `(`, before `)`, and
 * around the `> ~ +` combinators outside a math function.
 */
export function minifyCSS(css: string): string {
  let out = "";
  let pendingSpace = false;
  /** The function each open parenthesis belongs to ("" for a bare group). */
  const parens: string[] = [];
  const inMath = () => parens.some((fn) => MATH_FUNCTIONS.has(fn));
  const last = () => out[out.length - 1];

  for (let i = 0; i < css.length; i++) {
    const c = css[i];

    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 1;
      pendingSpace = pendingSpace || out.length > 0;
      continue;
    }

    if (/\s/.test(c)) {
      pendingSpace = out.length > 0;
      continue;
    }

    const tight = "{};,)".includes(c) || (">~+".includes(c) && !inMath());
    const afterTight = "{};,:(".includes(last() ?? "") || (">~+".includes(last() ?? "") && !inMath());
    if (pendingSpace && !tight && !afterTight) out += " ";
    pendingSpace = false;

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === "\\" ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j;
      continue;
    }

    if (c === "(") parens.push(/([\w-]*)$/.exec(out)![1].toLowerCase());
    else if (c === ")") parens.pop();

    if (c === "}" && last() === ";") out = out.slice(0, -1);
    out += c;
  }

  return out.trim();
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

  async function addFile(
    filePath: string,
    label: string,
    transform?: (css: string) => string,
  ): Promise<void> {
    if (!existsSync(filePath)) return;
    if (!isDryRun) {
      const content = await Bun.file(filePath).text();
      sections.push(`/* === ${label} === */\n${transform ? transform(content) : content}`);
    }
    includedFiles.push(label);
  }

  /**
   * Re-base `fonts.css`'s `url("fonts/…")` references on the bundle's own
   * directory.
   *
   * Inlining a stylesheet moves its relative urls: a `@font-face` resolves
   * against the file it is written in, so `fonts.css`'s paths are correct in the
   * bundle only while the bundle sits beside it — which is the default, and not
   * the case for a configured `bundle.output` somewhere else. Fonts are the
   * first asset reference the bundler has ever had to carry (component CSS has
   * none), and a 404 for a font is invisible: the page just renders in the
   * fallback face. So the paths are rewritten rather than left to break quietly.
   */
  function rebaseFontUrls(css: string): string {
    // `bundle.output` may be configured relative to the project root, so it is
    // resolved against `cwd` before the two directories are compared.
    const prefix = relative(dirname(resolve(cwd, bundleOutput)), outputDir).split(sep).join("/");
    if (!prefix) return css;
    return css.replace(
      new RegExp(`url\\((["']?)${FONTS_DIR}/`, "g"),
      (_match, quote: string) => `url(${quote}${prefix}/${FONTS_DIR}/`,
    );
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

    // 2b. Self-hosted fonts, AFTER the theme (task 1.1A-18).
    //
    // `fonts.css` sets the role tokens (`--font-heading`/`-body`/`-ui`) to the
    // families `faqir fonts add` installed. Both it and the theme declare on
    // `:root` at equal specificity, so the later one wins — which has to be this
    // one: a reader who installed Fraunces asked for Fraunces headings whatever
    // face the theme names. It is skipped when no family is installed.
    await addFile(join(outputDir, FONTS_CSS_FILENAME), FONTS_CSS_FILENAME, rebaseFontUrls);

    // 3. Base
    await addFile(join(outputDir, "base", "reset.css"), "base/reset.css");
    await addFile(join(outputDir, "base", "prose.css"), "base/prose.css");
    await addFile(join(outputDir, "base", "rhythm.css"), "base/rhythm.css");
    await addFile(join(outputDir, "base", "motion-presets.css"), "base/motion-presets.css");

    // 4. Primitives (alphabetical)
    for (const name of [...config.installed.primitives].sort()) {
      const dir = join(outputDir, "primitives", name);
      const file = installedStylesheetFile(dir, name);
      await addFile(join(dir, file), `primitives/${file}`);
    }

    // 5. Recipes (alphabetical)
    for (const name of [...config.installed.recipes].sort()) {
      const dir = join(outputDir, "recipes", name);
      const file = installedStylesheetFile(dir, name);
      await addFile(join(dir, file), `recipes/${file}`);
    }

    // 6. Patterns (alphabetical)
    for (const name of [...config.installed.patterns].sort()) {
      const dir = join(outputDir, "patterns", name);
      const file = installedStylesheetFile(dir, name);
      await addFile(join(dir, file), `patterns/${file}`);
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
