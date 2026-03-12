import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { parseCss } from "../parser/css-parser";
import { findElements, getAttribute, parseHtml } from "../parser/html-parser";
import { readConfigFile } from "../utils/config";
import { fileExists, readTextFile } from "../utils/fs";
import { readManifestFile } from "../utils/manifest";
import { resolvePackagePath } from "../utils/paths";
import { REGISTRY_LAYERS, type RegistryLayer } from "../utils/registry";
import {
  type AuditHtmlFile,
  type AuditProject,
  type AuditResult,
  type KnownComponentEntry,
  COMPONENT_AUDIT_RULES,
  CSS_AUDIT_RULES,
} from "./rules";

export type AuditOptions = {
  file?: string;
};

export type AuditSummary = {
  critical: number;
  error: number;
  warning: number;
  info: number;
  total: number;
  files: number;
  components: number;
};

export type AuditReport = {
  ok: boolean;
  results: AuditResult[];
  summary: AuditSummary;
};

export async function auditProject(cwd: string, options: AuditOptions = {}): Promise<AuditReport> {
  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    throw new Error("Missing loom.config.json. Run `loom init` first.");
  }

  const config = await readConfigFile(configPath);
  const outputRoot = resolvePackagePath(cwd, config.output_dir);
  const componentsByName = await loadInstalledEntries(outputRoot, config.installed);
  const tokenCatalog = await loadTokenCatalog(outputRoot);
  const loomScriptPath = resolvePackagePath(outputRoot, "loom.js");
  const project: AuditProject = {
    cwd,
    outputRoot,
    loomScriptPath,
    componentsByName,
    tokenCatalog,
  };
  const htmlPaths = options.file ? [resolve(cwd, options.file)] : await findHtmlFiles(cwd);
  const htmlFiles = await Promise.all(htmlPaths.map(async (path) => await loadHtmlFile(path, componentsByName)));
  const results: AuditResult[] = [];
  let componentCount = 0;

  for (const file of htmlFiles) {
    for (const root of file.componentRoots) {
      const name = getAttribute(root, "data-ui");

      if (!name) {
        continue;
      }

      const entry = componentsByName.get(name);

      if (!entry) {
        continue;
      }

      componentCount += 1;

      const context = {
        project,
        file,
        entry,
        manifest: entry.manifest,
        component: {
          name,
          root,
          filePath: file.path,
          snippet: file.snippetComponentName === name,
          entry,
          manifest: entry.manifest,
        },
      };

      for (const rule of COMPONENT_AUDIT_RULES) {
        results.push(...rule.check(context));
      }
    }
  }

  for (const entry of componentsByName.values()) {
    if (!(await fileExists(entry.cssPath))) {
      continue;
    }

    const source = await readTextFile(entry.cssPath);
    const parsed = parseCss(source);

    for (const rule of CSS_AUDIT_RULES) {
      results.push(...rule.check({ project, entry, source, parsed }));
    }
  }

  results.sort(compareResults);

  const summary = summarize(results, htmlFiles.length, componentCount);
  return {
    ok: summary.critical === 0 && summary.error === 0,
    results,
    summary,
  };
}

async function loadInstalledEntries(
  outputRoot: string,
  installed: Record<RegistryLayer, string[]>,
): Promise<Map<string, KnownComponentEntry>> {
  const entries = new Map<string, KnownComponentEntry>();

  for (const layer of REGISTRY_LAYERS) {
    for (const name of installed[layer]) {
      const componentDir = resolvePackagePath(outputRoot, layer, name);
      const manifestPath = resolvePackagePath(componentDir, `${name}.manifest.json`);

      if (!(await fileExists(manifestPath))) {
        continue;
      }

      const manifest = await readManifestFile(manifestPath);
      entries.set(name, {
        name,
        layer,
        manifest,
        componentDir,
        htmlPath: resolvePackagePath(componentDir, manifest.files.html),
        cssPath: resolvePackagePath(componentDir, manifest.files.css),
        jsPath: manifest.files.js ? resolvePackagePath(componentDir, manifest.files.js) : undefined,
      });
    }
  }

  return entries;
}

async function loadTokenCatalog(outputRoot: string): Promise<Set<string>> {
  const tokensDir = resolvePackagePath(outputRoot, "tokens");
  const tokenCatalog = new Set<string>();

  if (!(await fileExists(tokensDir))) {
    return tokenCatalog;
  }

  for (const path of await findCssFiles(tokensDir)) {
    const parsed = parseCss(await readTextFile(path));

    for (const token of parsed.definedTokens) {
      tokenCatalog.add(token);
    }
  }

  return tokenCatalog;
}

async function loadHtmlFile(
  path: string,
  componentsByName: Map<string, KnownComponentEntry>,
): Promise<AuditHtmlFile> {
  const source = await readTextFile(path);
  const document = parseHtml(source);
  const componentRoots = findElements(document, (element) => getAttribute(element, "data-ui") !== null);
  const scripts = findElements(document, (element) => element.tagName === "script");
  const snippetComponentName = [...componentsByName.values()].find((entry) => entry.htmlPath === path)?.name ?? null;

  return {
    path,
    source,
    document,
    componentRoots,
    scriptSrcs: scripts.map((script) => getAttribute(script, "src")).filter((value): value is string => !!value),
    inlineScripts: scripts
      .map((script) => source.slice(script.innerStart, script.innerEnd))
      .filter((value) => value.trim().length > 0),
    snippetComponentName,
  };
}

async function findHtmlFiles(root: string): Promise<string[]> {
  return await walkFiles(root, (path) => path.endsWith(".html"));
}

async function findCssFiles(root: string): Promise<string[]> {
  return await walkFiles(root, (path) => path.endsWith(".css"));
}

async function walkFiles(root: string, predicate: (path: string) => boolean): Promise<string[]> {
  const files: string[] = [];

  async function visit(path: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === ".loom" || entry.name === "node_modules") {
        continue;
      }

      const nextPath = resolvePackagePath(path, entry.name);

      if (entry.isDirectory()) {
        await visit(nextPath);
        continue;
      }

      if (predicate(nextPath)) {
        files.push(nextPath);
      }
    }
  }

  if (await fileExists(root)) {
    await visit(root);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function summarize(results: AuditResult[], files: number, components: number): AuditSummary {
  const summary: AuditSummary = {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
    total: results.length,
    files,
    components,
  };

  for (const result of results) {
    summary[result.severity] += 1;
  }

  return summary;
}

function compareResults(left: AuditResult, right: AuditResult): number {
  const leftWeight = getSeverityWeight(left.severity);
  const rightWeight = getSeverityWeight(right.severity);

  if (leftWeight !== rightWeight) {
    return rightWeight - leftWeight;
  }

  if (left.filePath !== right.filePath) {
    return left.filePath.localeCompare(right.filePath);
  }

  if (left.location.offset !== right.location.offset) {
    return left.location.offset - right.location.offset;
  }

  if (left.ruleId !== right.ruleId) {
    return left.ruleId.localeCompare(right.ruleId);
  }

  return basename(left.filePath).localeCompare(basename(right.filePath));
}

function getSeverityWeight(severity: AuditResult["severity"]): number {
  switch (severity) {
    case "critical":
      return 4;
    case "error":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
  }
}
