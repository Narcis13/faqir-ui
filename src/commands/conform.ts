import { readdir } from "node:fs/promises";

import { readConfigFile } from "../utils/config";
import { fileExists, readTextFile, writeTextFile } from "../utils/fs";
import { info, success, warn } from "../utils/logger";
import { resolvePackagePath } from "../utils/paths";
import { REGISTRY_LAYERS } from "../utils/registry";
import {
  parseHtml,
  findElements,
  getAttribute,
  type HtmlElement,
  type HtmlDocument,
} from "../parser/html-parser";

const CANONICAL_ATTR_ORDER = [
  "data-ui",
  "data-part",
  "data-state",
  "data-variant",
  "data-size",
  "data-orientation",
  "data-value",
  "role",
  "aria-modal",
  "aria-labelledby",
  "aria-describedby",
  "aria-label",
  "aria-selected",
  "aria-controls",
  "aria-expanded",
  "aria-haspopup",
  "tabindex",
  "id",
  "type",
  "hidden",
  "disabled",
];

export async function conformCommand(args: string[], cwd: string): Promise<number> {
  const options = parseConformArgs(args);
  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    throw new Error("Missing loom.config.json. Run `loom init` first.");
  }

  const config = await readConfigFile(configPath);
  const outputRoot = resolvePackagePath(cwd, config.output_dir);
  let totalFixed = 0;

  if (options.file) {
    totalFixed += await conformFile(resolvePackagePath(cwd, options.file));
  } else {
    const htmlFiles = await findHtmlFiles(outputRoot);
    for (const filePath of htmlFiles) {
      totalFixed += await conformFile(filePath);
    }
  }

  if (totalFixed === 0) {
    success("All component markup is already canonical.");
  } else {
    success(`Conformed ${totalFixed} attribute${totalFixed > 1 ? "s" : ""} to canonical order.`);
  }

  return 0;
}

async function conformFile(filePath: string): Promise<number> {
  if (!(await fileExists(filePath))) {
    warn(`File not found: ${filePath}`);
    return 0;
  }

  const source = await readTextFile(filePath);
  const doc = parseHtml(source);

  const loomElements = findElements(doc, (el) => {
    return (
      getAttribute(el, "data-ui") !== null ||
      getAttribute(el, "data-part") !== null
    );
  });

  if (loomElements.length === 0) {
    return 0;
  }

  let result = source;
  let fixCount = 0;

  const sorted = [...loomElements].sort((a, b) => b.startTagStart - a.startTagStart);

  for (const element of sorted) {
    const tagSource = source.slice(element.startTagStart, element.startTagEnd);
    const reordered = reorderAttributes(tagSource, element);

    if (reordered !== tagSource) {
      result =
        result.slice(0, element.startTagStart) +
        reordered +
        result.slice(element.startTagEnd);
      fixCount += 1;
    }
  }

  if (fixCount > 0) {
    await writeTextFile(filePath, result);
    info(`  Conformed ${fixCount} element${fixCount > 1 ? "s" : ""} in ${filePath}`);
  }

  return fixCount;
}

function reorderAttributes(tagSource: string, element: HtmlElement): string {
  const attrs = element.attributes;
  if (attrs.length <= 1) return tagSource;

  const sortedAttrs = [...attrs].sort((a, b) => {
    const aIndex = getCanonicalIndex(a.name);
    const bIndex = getCanonicalIndex(b.name);
    return aIndex - bIndex;
  });

  const alreadyOrdered = attrs.every(
    (attr, i) => attr.name === sortedAttrs[i].name,
  );

  if (alreadyOrdered) return tagSource;

  const tagNameMatch = tagSource.match(/^<\s*([^\s/>]+)/);
  if (!tagNameMatch) return tagSource;

  const selfClosing = /\/\s*>$/.test(tagSource);
  const tagName = tagNameMatch[1];

  const attrStrings = sortedAttrs.map((attr) => {
    if (attr.value === null) return attr.name;
    const quote = tagSource.includes(`${attr.name}='`) ? "'" : '"';
    return `${attr.name}=${quote}${attr.value}${quote}`;
  });

  return `<${tagName} ${attrStrings.join(" ")}${selfClosing ? " /" : ""}>`;
}

function getCanonicalIndex(name: string): number {
  const index = CANONICAL_ATTR_ORDER.indexOf(name);
  if (index >= 0) return index;

  if (name.startsWith("data-")) return CANONICAL_ATTR_ORDER.length;
  if (name.startsWith("aria-")) return CANONICAL_ATTR_ORDER.length + 1;

  return CANONICAL_ATTR_ORDER.length + 2;
}

async function findHtmlFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  if (!(await fileExists(dir))) return files;

  for (const layer of REGISTRY_LAYERS) {
    const layerDir = resolvePackagePath(dir, layer);
    if (!(await fileExists(layerDir))) continue;

    const entries = await readdir(layerDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const componentDir = resolvePackagePath(layerDir, entry.name);
      const htmlFile = resolvePackagePath(componentDir, `${entry.name}.html`);

      if (await fileExists(htmlFile)) {
        files.push(htmlFile);
      }
    }
  }

  return files;
}

type ConformArgs = {
  file?: string;
};

function parseConformArgs(args: string[]): ConformArgs {
  const options: ConformArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--file") {
      const value = args[index + 1];
      if (!value) throw new Error("--file requires a path");
      options.file = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}
