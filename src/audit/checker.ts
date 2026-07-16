// DOM contract checker — walks HTML files and runs audit rules against manifests

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { extractComponents, parseDocument } from "../parser/html-parser";
import { extractTokenReferences, collectDefinedTokens, hasReducedMotionQuery, hasAnimationProperties, findImportantDeclarations, findClassSelectors, findIdSelectors, findHardcodedColorValues, findLogicalPropertyViolations } from "../parser/css-parser";
import { findExternalImports, findDataFetching } from "../parser/js-parser";
import { loadManifest, type Manifest } from "../manifest";
import { type AuditResult, type Severity, ALL_RULES, DOCUMENT_RULES, NO_FETCH_RULE, NO_EXTERNAL_IMPORT_RULE, LOGICAL_PROPERTIES_RULE } from "./rules";
import { checkThemeContrast, CONTRAST_TOKENS_RULE } from "./contrast-tokens";
import { readConfig } from "../utils/config";
import { getRegistryPath } from "../utils/fs";

export interface AuditOptions {
  /** Only audit a single file */
  file?: string;
  /** Working directory */
  cwd?: string;
  /** Skip specific rules by ID */
  skipRules?: string[];
}

export interface AuditSummary {
  results: AuditResult[];
  files_scanned: number;
  components_found: number;
  counts: Record<Severity, number>;
  passed: boolean;
}

export interface HtmlAuditInput {
  /** Raw HTML source to audit. */
  source: string;
  /** File label used in findings (offsets index into `source`, not this path). */
  file?: string;
  /** Manifests keyed by their `data-ui` name (canonical + aliases). */
  manifests: Map<string, Manifest>;
  /** Rule IDs to skip. */
  skipRules?: string[];
}

/**
 * Audit one HTML source string against in-memory manifests — the shared,
 * **filesystem-free** core behind both `faqir audit` (per file) and the MCP
 * `faqir_audit_html` tool (per string). Runs every HTML-derived rule: the
 * per-component manifest rules ({@link ALL_RULES}), the document-level rules
 * ({@link DOCUMENT_RULES}), and the file-level `controller-loaded` reconciliation.
 * CSS/JS/token/contrast checks are NOT here — they scan on-disk component sources
 * and stay in {@link runAudit}.
 *
 * Pure: it reads nothing and writes nothing. Unknown `data-ui` names (no manifest
 * in the map) are skipped for per-component rules, exactly as `runAudit` skips
 * not-installed components; document rules still run over the whole source.
 */
export function auditHtmlSource(input: HtmlAuditInput): AuditResult[] {
  const { source, manifests } = input;
  const file = input.file ?? "input.html";
  const skipRules = new Set(input.skipRules ?? []);
  const activeRules = ALL_RULES.filter((r) => !skipRules.has(r.id));
  const activeDocRules = DOCUMENT_RULES.filter((r) => !skipRules.has(r.id));

  const results: AuditResult[] = [];
  const components = extractComponents(source, file);

  for (const component of components) {
    const manifest = manifests.get(component.name);
    if (!manifest) continue; // unknown/not-installed component — skip per-component rules
    for (const rule of activeRules) {
      results.push(...rule.check(component, manifest));
    }
  }

  if (activeDocRules.length > 0) {
    const doc = parseDocument(source, file);
    for (const rule of activeDocRules) {
      results.push(...rule.check(doc));
    }
  }

  // File-level controller-loaded: replace the generic per-component reminders
  // (emitted by controllerLoadedRule) with the precise "is the script actually
  // referenced?" findings. When every controller is referenced, the generics are
  // simply dropped. Mirrors the reconciliation in runAudit.
  if (!skipRules.has("controller-loaded")) {
    const fileControllerResults = checkControllersInFile(source, file, components, manifests);
    const hasGeneric = results.some((r) => r.rule_id === "controller-loaded");
    if (hasGeneric) {
      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i].rule_id === "controller-loaded") results.splice(i, 1);
      }
      results.push(...fileControllerResults);
    }
  }

  return results;
}

/**
 * Run a full audit on the project.
 */
export async function runAudit(options: AuditOptions = {}): Promise<AuditSummary> {
  const cwd = options.cwd || process.cwd();
  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const registryPath = getRegistryPath();

  // Load all installed manifests
  const manifests = new Map<string, Manifest>();
  for (const name of config.installed.primitives) {
    const manifestPath = join(outputDir, "primitives", name, `${name}.manifest.json`);
    if (existsSync(manifestPath)) {
      manifests.set(name, await loadManifest(manifestPath));
    }
  }
  for (const name of config.installed.recipes) {
    const manifestPath = join(outputDir, "recipes", name, `${name}.manifest.json`);
    if (existsSync(manifestPath)) {
      manifests.set(name, await loadManifest(manifestPath));
    }
  }
  for (const name of config.installed.patterns) {
    const manifestPath = join(outputDir, "patterns", name, `${name}.manifest.json`);
    if (existsSync(manifestPath)) {
      manifests.set(name, await loadManifest(manifestPath));
    }
  }

  // Find HTML files to scan
  const htmlFiles: string[] = [];
  if (options.file) {
    htmlFiles.push(options.file);
  } else {
    // Scan project for HTML files (excluding node_modules, .faqir, ui/ component source)
    const glob = new Bun.Glob("**/*.html");
    for await (const path of glob.scan({ cwd, onlyFiles: true })) {
      // Skip node_modules
      if (path.includes("node_modules")) continue;
      // Skip .faqir directory
      if (path.startsWith(".faqir")) continue;
      // Include everything else (including ui/ component reference files)
      htmlFiles.push(join(cwd, path));
    }
  }

  const results: AuditResult[] = [];
  let componentsFound = 0;

  const skipRules = new Set(options.skipRules || []);

  // Audit each HTML file through the shared, filesystem-free source auditor —
  // the same engine the MCP `faqir_audit_html` tool drives on a bare string.
  for (const filePath of htmlFiles) {
    const source = await Bun.file(filePath).text();
    const relPath = relative(cwd, filePath);
    componentsFound += extractComponents(source, relPath).length;
    results.push(...auditHtmlSource({ source, file: relPath, manifests, skipRules: options.skipRules }));
  }

  // CSS-level checks: token-exists and reduced-motion
  if (!skipRules.has("token-exists")) {
    const tokenResults = await checkTokens(outputDir, config.installed, cwd);
    results.push(...tokenResults);
  }

  if (!skipRules.has("reduced-motion")) {
    const motionResults = await checkReducedMotion(outputDir, config.installed, cwd);
    results.push(...motionResults);
  }

  // CSS anti-pattern checks
  const CSS_AP_RULES = ["no-important", "no-class-selector", "no-id-selector", "no-hardcoded-values", "logical-properties"];
  if (CSS_AP_RULES.some(id => !skipRules.has(id))) {
    const cssApResults = await checkCssAntiPatterns(outputDir, config.installed, cwd);
    results.push(...cssApResults.filter(r => !skipRules.has(r.rule_id)));
  }

  // JS anti-pattern checks
  const JS_AP_RULES = ["no-external-import", "no-fetch"];
  if (JS_AP_RULES.some(id => !skipRules.has(id))) {
    const jsApResults = await checkJsAntiPatterns(outputDir, config.installed, cwd);
    results.push(...jsApResults.filter(r => !skipRules.has(r.rule_id)));
  }

  // Theme contrast check: the active theme's token pairs must clear WCAG AA.
  if (!skipRules.has(CONTRAST_TOKENS_RULE.id)) {
    const contrastResults = await checkContrastTokens(outputDir, config.theme, cwd);
    results.push(...contrastResults);
  }

  // Count severities
  const counts: Record<Severity, number> = { critical: 0, error: 0, warning: 0, info: 0 };
  for (const r of results) {
    counts[r.severity]++;
  }

  return {
    results,
    files_scanned: htmlFiles.length,
    components_found: componentsFound,
    counts,
    passed: counts.critical === 0 && counts.error === 0,
  };
}

/**
 * Check if recipe controllers are referenced in an HTML file via script tags or imports.
 */
function checkControllersInFile(
  source: string,
  filePath: string,
  components: ReturnType<typeof extractComponents>,
  manifests: Map<string, Manifest>,
): AuditResult[] {
  const results: AuditResult[] = [];
  const recipeComponents = components.filter(c => {
    const m = manifests.get(c.name);
    return m && m.kind === "recipe" && m.files.js;
  });

  if (recipeComponents.length === 0) return results;

  // Check for script tags or imports referencing the controllers
  const sourceLower = source.toLowerCase();
  for (const comp of recipeComponents) {
    const manifest = manifests.get(comp.name)!;
    const jsFile = manifest.files.js!;
    const controllerName = jsFile.replace(".js", "");

    // Check for a direct controller import or either assembled auto-init runtime.
    const hasScript = sourceLower.includes(jsFile)
      || sourceLower.includes("faqir-core.js")
      || sourceLower.includes("faqir.js")
      || sourceLower.includes("faqir.min.js");

    if (!hasScript) {
      results.push({
        rule_id: "controller-loaded",
        severity: "error",
        component_name: comp.name,
        file: filePath,
        line: comp.line,
        message: `Recipe [data-ui="${comp.name}"] needs its controller "${jsFile}" loaded via script tag or import`,
        fix: {
          type: "add-script",
          offset: 0,
          details: { src: jsFile, component: comp.name },
        },
      });
    }
  }

  return results;
}

/**
 * Check that all tokens referenced in component CSS files exist in the token definitions.
 */
async function checkTokens(
  outputDir: string,
  installed: { primitives: string[]; recipes: string[]; patterns: string[] },
  cwd: string,
): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  // Load all token definitions
  const tokenSources: string[] = [];
  const tokenDir = join(outputDir, "tokens");
  const tokenGlob = new Bun.Glob("*.css");
  if (existsSync(tokenDir)) {
    for await (const path of tokenGlob.scan({ cwd: tokenDir, onlyFiles: true })) {
      tokenSources.push(await Bun.file(join(tokenDir, path)).text());
    }
  }
  const definedTokens = collectDefinedTokens(tokenSources);

  // Check each installed component's CSS
  const allComponents = [
    ...installed.primitives.map(n => ({ name: n, layer: "primitives" })),
    ...installed.recipes.map(n => ({ name: n, layer: "recipes" })),
    ...installed.patterns.map(n => ({ name: n, layer: "patterns" })),
  ];

  for (const { name, layer } of allComponents) {
    const cssPath = join(outputDir, layer, name, `${name}.css`);
    if (!existsSync(cssPath)) continue;

    const cssSource = await Bun.file(cssPath).text();
    const refs = extractTokenReferences(cssSource);
    const relPath = relative(cwd, cssPath);

    for (const ref of refs) {
      // Skip palette references (they reference within tokens)
      if (ref.name.startsWith("palette-")) continue;
      // Skip component aliases (they use fallbacks)
      if (ref.name.startsWith(`${name}-`)) continue;
      // Skip well-known browser properties
      if (ref.name.startsWith("button-") || ref.name.startsWith("card-") || ref.name.startsWith("dialog-")) continue;

      if (!definedTokens.has(ref.name)) {
        results.push({
          rule_id: "token-exists",
          severity: "warning",
          component_name: name,
          file: relPath,
          line: ref.line,
          message: `Token "--${ref.name}" referenced in ${name}.css is not defined in any token file`,
        });
      }
    }
  }

  return results;
}

/**
 * Static WCAG-AA contrast gate over the active theme's token pairs (task 0.4-16).
 *
 * The active theme lands at `<output>/tokens/theme.css`; the base palette /
 * semantic / aliases tokens live beside it. We hand both to `checkThemeContrast`,
 * which resolves each declared pair through the token graph and computes the
 * ratio from the oklch values — no browser. If the theme file isn't present
 * (nothing installed yet), there's nothing to check.
 */
async function checkContrastTokens(
  outputDir: string,
  themeName: string,
  cwd: string,
): Promise<AuditResult[]> {
  const tokenDir = join(outputDir, "tokens");
  const themePath = join(tokenDir, "theme.css");
  if (!existsSync(themePath)) return [];

  // Base token layers the theme inherits from and resolves var() chains into.
  const baseParts: string[] = [];
  for (const name of ["palette.css", "semantic.css", "aliases.css"]) {
    const p = join(tokenDir, name);
    if (existsSync(p)) baseParts.push(await Bun.file(p).text());
  }
  // Without the palette/semantic base there's nothing to resolve against.
  if (baseParts.length === 0) return [];

  const themeCss = await Bun.file(themePath).text();
  return checkThemeContrast({
    themeName: themeName || "theme",
    themeCss,
    baseCss: baseParts.join("\n"),
    file: relative(cwd, themePath),
  });
}

/**
 * Check component CSS files for anti-patterns:
 * no-important (#8), no-class-selector (#1), no-id-selector (#9), no-hardcoded-values (#2).
 */
async function checkCssAntiPatterns(
  outputDir: string,
  installed: { primitives: string[]; recipes: string[]; patterns: string[] },
  cwd: string,
): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  const allComponents = [
    ...installed.primitives.map(n => ({ name: n, layer: "primitives" })),
    ...installed.recipes.map(n => ({ name: n, layer: "recipes" })),
    ...installed.patterns.map(n => ({ name: n, layer: "patterns" })),
  ];

  for (const { name, layer } of allComponents) {
    const cssPath = join(outputDir, layer, name, `${name}.css`);
    if (!existsSync(cssPath)) continue;

    const source = await Bun.file(cssPath).text();
    const relPath = relative(cwd, cssPath);

    for (const v of findImportantDeclarations(source)) {
      results.push({
        rule_id: "no-important",
        severity: "error",
        component_name: name,
        file: relPath,
        line: v.line,
        message: `!important used in ${name}.css — keep specificity low`,
      });
    }

    for (const v of findClassSelectors(source)) {
      results.push({
        rule_id: "no-class-selector",
        severity: "error",
        component_name: name,
        file: relPath,
        line: v.line,
        message: `Class selector "${v.text}" in ${name}.css — use [data-ui] or [data-part] attribute selectors instead`,
      });
    }

    for (const v of findIdSelectors(source)) {
      results.push({
        rule_id: "no-id-selector",
        severity: "error",
        component_name: name,
        file: relPath,
        line: v.line,
        message: `ID selector "${v.text}" in ${name}.css — IDs are for ARIA relationships only, not CSS selectors`,
      });
    }

    for (const v of findHardcodedColorValues(source)) {
      results.push({
        rule_id: "no-hardcoded-values",
        severity: "error",
        component_name: name,
        file: relPath,
        line: v.line,
        message: `Hardcoded color value "${v.text}" in ${name}.css — use a token via var(--token-name) instead`,
      });
    }

    results.push(...buildLogicalPropertyResults(source, name, relPath));
  }

  return results;
}

/**
 * Build `logical-properties` findings for a single CSS source (task 0.3-09).
 *
 * Pure function of (source, component name, file path) so it can be exercised
 * directly against the registry and repair fixtures. Every finding carries a 1:1
 * `rewrite-css` fix, since every physical → logical mapping is deterministic.
 */
export function buildLogicalPropertyResults(source: string, name: string, relPath: string): AuditResult[] {
  const results: AuditResult[] = [];
  for (const v of findLogicalPropertyViolations(source)) {
    const noun = v.kind === "property" ? "property" : "value";
    results.push({
      rule_id: LOGICAL_PROPERTIES_RULE.id,
      severity: LOGICAL_PROPERTIES_RULE.severity,
      component_name: name,
      file: relPath,
      line: v.line,
      message: `Physical ${noun} "${v.from}" in ${name}.css — use logical equivalent: ${v.from} → ${v.to}`,
      fix: {
        type: "rewrite-css",
        offset: 0,
        details: { kind: v.kind, physical: v.physical, logical: v.logical, property: v.property },
      },
    });
  }
  return results;
}

/**
 * Check component JS controller files for anti-patterns:
 * no-external-import (#4), no-fetch (#7).
 *
 * Both rules are scoped, by construction, to recipe controller JS — we only
 * ever open registry/recipes/<name>/<name>.js. That is where the `no-fetch`
 * exemption lives as code (task 0.3-08): the `l-source` directive and
 * `apiSource()` are page/application code, never a recipe controller, so they
 * are structurally out of scope here and never scanned. See NO_FETCH_RULE for
 * the encoded scope + exemptions.
 */
async function checkJsAntiPatterns(
  outputDir: string,
  installed: { primitives: string[]; recipes: string[]; patterns: string[] },
  cwd: string,
): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  // Only recipe controllers are in scope — see NO_FETCH_RULE.applies_to.
  for (const name of installed.recipes) {
    const jsPath = join(outputDir, "recipes", name, `${name}.js`);
    if (!existsSync(jsPath)) continue;

    const source = await Bun.file(jsPath).text();
    const relPath = relative(cwd, jsPath);

    for (const v of findExternalImports(source)) {
      results.push({
        rule_id: NO_EXTERNAL_IMPORT_RULE.id,
        severity: NO_EXTERNAL_IMPORT_RULE.severity,
        component_name: name,
        file: relPath,
        line: v.line,
        message: `External import "${v.text}" in ${name}.js — only import from ../../core/ or relative paths`,
      });
    }

    for (const v of findDataFetching(source)) {
      results.push({
        rule_id: NO_FETCH_RULE.id,
        severity: NO_FETCH_RULE.severity,
        component_name: name,
        file: relPath,
        line: v.line,
        message: `Data fetching or routing pattern "${v.text}" in ${name}.js — controllers must not fetch data or manage routing (l-source in page markup is exempt)`,
      });
    }
  }

  return results;
}

/**
 * Check that components with animations include prefers-reduced-motion query.
 */
async function checkReducedMotion(
  outputDir: string,
  installed: { primitives: string[]; recipes: string[]; patterns: string[] },
  cwd: string,
): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  const allComponents = [
    ...installed.primitives.map(n => ({ name: n, layer: "primitives" })),
    ...installed.recipes.map(n => ({ name: n, layer: "recipes" })),
    ...installed.patterns.map(n => ({ name: n, layer: "patterns" })),
  ];

  for (const { name, layer } of allComponents) {
    const cssPath = join(outputDir, layer, name, `${name}.css`);
    if (!existsSync(cssPath)) continue;

    const cssSource = await Bun.file(cssPath).text();

    if (hasAnimationProperties(cssSource) && !hasReducedMotionQuery(cssSource)) {
      results.push({
        rule_id: "reduced-motion",
        severity: "info",
        component_name: name,
        file: relative(cwd, cssPath),
        line: 1,
        message: `${name}.css has animation/transition but no @media (prefers-reduced-motion: reduce) block`,
      });
    }
  }

  return results;
}
