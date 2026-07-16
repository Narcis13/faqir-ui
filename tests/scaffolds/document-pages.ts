import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCUMENT_SCAFFOLDS,
  generateDocumentScaffold,
  type DocumentScaffoldName,
} from "../../src/scaffolds/documents";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY = join(ROOT, "registry");

const TOKEN_ORDER = [
  "palette",
  "spacing",
  "typography",
  "effects",
  "motion",
  "semantic",
  "aliases",
  "document",
  "doc-aliases",
] as const;
const BASE_ORDER = ["reset", "prose", "motion-presets"] as const;

function read(relativePath: string): string {
  return readFileSync(join(REGISTRY, relativePath), "utf8");
}

function componentCss(name: DocumentScaffoldName): string {
  const definition = DOCUMENT_SCAFFOLDS[name];
  const components = [...definition.components, ...definition.patterns];
  const css: string[] = [];

  for (const component of components) {
    const layer = (["primitives", "recipes", "patterns"] as const).find((candidate) =>
      existsSync(join(REGISTRY, candidate, component, `${component}.css`)),
    );
    if (!layer) throw new Error(`Missing stylesheet for scaffold component: ${component}`);
    css.push(read(`${layer}/${component}/${component}.css`));
  }

  return css.join("\n");
}

function pageCss(name: DocumentScaffoldName): string {
  const tokens = TOKEN_ORDER.map((file) => read(`tokens/${file}.css`)).join("\n");
  const base = BASE_ORDER.map((file) => read(`base/${file}.css`)).join("\n");
  return `${tokens}\n${read("themes/document.css")}\n${base}\n${componentCss(name)}`;
}

const CORE_DATA_SRC = `data:text/javascript;base64,${Buffer.from(
  read("core/faqir-core.js"),
).toString("base64")}`;

/** Self-contained output from the production generator for browser gates. */
export function buildDocumentScaffoldPage(name: DocumentScaffoldName): string {
  return generateDocumentScaffold(name, {
    title: DOCUMENT_SCAFFOLDS[name].title,
    stylesheets: `  <style>${pageCss(name)}</style>`,
    coreScriptSrc: CORE_DATA_SRC,
  });
}
