// DOM contract checker — walks HTML files and runs audit rules against manifests

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { extractComponents, parseDocument } from "../parser/html-parser";
import { extractTokenReferences, extractTokenDefinitions, collectDefinedTokens, hasReducedMotionQuery, hasAnimationProperties, findImportantDeclarations, findClassSelectors, findIdSelectors, findHardcodedColorValues, findLogicalPropertyViolations } from "../parser/css-parser";
import { findExternalImports, findDataFetching } from "../parser/js-parser";
import { loadManifest, type Manifest } from "../manifest";
import { type AuditResult, type Severity, ALL_RULES, DOCUMENT_RULES, NO_FETCH_RULE, NO_EXTERNAL_IMPORT_RULE, LOGICAL_PROPERTIES_RULE } from "./rules";
import {
  checkThemeContrast,
  checkThemeElevation,
  CONTRAST_TOKENS_RULE,
  SURFACE_ELEVATION_RULE,
} from "./contrast-tokens";
import {
  BREAKPOINT_CANON_RULE,
  UNDECLARED_ATTRIBUTE_RULE,
  buildBreakpointCanonResults,
  buildUndeclaredAttributeResults,
} from "./css-rules";
import { readConfig } from "../utils/config";
import { getRegistryPath } from "../utils/fs";
import { auditHtmlSource, type HtmlAuditInput } from "./html-audit";

// The string-in/findings-out core lives in `./html-audit` because it must stay
// free of `node:*` to be bundlable for the browser (the docs-site playground,
// task 0.7-14). Re-exported here so every existing importer — and this file's own
// `runAudit` — keeps using one implementation.
export { auditHtmlSource, type HtmlAuditInput };

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

  // The installed stylesheets, keyed like the manifests — the second half of the
  // input the markup+css rules decide from (`trigger-contract`, task 0.9-05;
  // `single-fixed-region`, task 0.9-06). A component with no sheet on disk is
  // simply absent, and those rules skip it.
  const styles = new Map<string, string>();
  for (const [layer, names] of [
    ["primitives", config.installed.primitives],
    ["recipes", config.installed.recipes],
    ["patterns", config.installed.patterns],
  ] as const) {
    for (const name of names) {
      const cssPath = join(outputDir, layer, name, `${name}.css`);
      if (existsSync(cssPath)) styles.set(name, await Bun.file(cssPath).text());
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
    results.push(
      ...auditHtmlSource({ source, file: relPath, manifests, styles, skipRules: options.skipRules }),
    );
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

  // CSS anti-pattern checks (+ the stylesheet-contract rules of task 0.8-10,
  // which need the manifests `runAudit` already loaded above).
  const CSS_AP_RULES = [
    "no-important", "no-class-selector", "no-id-selector", "no-hardcoded-values", "logical-properties",
    UNDECLARED_ATTRIBUTE_RULE.id, BREAKPOINT_CANON_RULE.id,
  ];
  if (CSS_AP_RULES.some(id => !skipRules.has(id))) {
    const cssApResults = await checkCssAntiPatterns(outputDir, config.installed, cwd, manifests);
    results.push(...cssApResults.filter(r => !skipRules.has(r.rule_id)));
  }

  // JS anti-pattern checks
  const JS_AP_RULES = ["no-external-import", "no-fetch"];
  if (JS_AP_RULES.some(id => !skipRules.has(id))) {
    const jsApResults = await checkJsAntiPatterns(outputDir, config.installed, cwd);
    results.push(...jsApResults.filter(r => !skipRules.has(r.rule_id)));
  }

  // Theme contrast check: the active theme's token pairs must clear WCAG AA.
  if (!skipRules.has(CONTRAST_TOKENS_RULE.id) || !skipRules.has(SURFACE_ELEVATION_RULE.id)) {
    const contrastResults = await checkContrastTokens(outputDir, config.theme, cwd, skipRules);
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
  skipRules: Set<string>,
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
  const input = {
    themeName: themeName || "theme",
    themeCss,
    baseCss: baseParts.join("\n"),
    file: relative(cwd, themePath),
  };
  return [
    ...(!skipRules.has(CONTRAST_TOKENS_RULE.id) ? checkThemeContrast(input) : []),
    ...(!skipRules.has(SURFACE_ELEVATION_RULE.id) ? checkThemeElevation(input) : []),
  ];
}

/**
 * Check component CSS files for anti-patterns:
 * no-important (#8), no-class-selector (#1), no-id-selector (#9), no-hardcoded-values (#2).
 */
async function checkCssAntiPatterns(
  outputDir: string,
  installed: { primitives: string[]; recipes: string[]; patterns: string[] },
  cwd: string,
  manifests: Map<string, Manifest>,
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

    // Stylesheet contract vs the manifest (task 0.8-10). `breakpoint-canon`
    // needs only the sheet; `undeclared-attribute` needs the manifest that is
    // supposed to declare what the sheet selects on, so a component whose
    // manifest is missing from the project is skipped rather than guessed at.
    results.push(...buildBreakpointCanonResults(source, name, relPath));
    const manifest = manifests.get(name);
    if (manifest) {
      results.push(...buildUndeclaredAttributeResults(source, manifest, relPath));
    }
  }

  return results;
}

/**
 * Every `var()` reference in a stylesheet that cannot be proven to resolve
 * (task 0.8-07). A pure function of (source, token layer) so the registry gate
 * and its test drive the identical logic.
 *
 * ── Why this exists next to `token-exists` rather than inside it ──
 * `token-exists` is a *project* rule: `checkTokens` walks `<project>/ui/**`
 * driven by `.faqir/config.json`'s installed list. Nothing ever pointed it at
 * `registry/` — `scripts/registry-audit.mjs` ran logical-properties, theme
 * manifests and document rules and no CSS-token gate at all. That, and not a
 * skip or a blind spot in the extractor, is why `settings-page.css` shipped
 * `var(--space-48, 12rem)` against an undefined token: the sweep never ran.
 *
 * ── Why the predicate is not simply "defined in tokens/" ──
 * Registry CSS legitimately reads three kinds of custom property:
 *
 *  1. **design tokens** — declared in `registry/tokens/*.css`. Always fine.
 *  2. **component knobs** — `--sidebar-width`, `--grid-min`, `--icon`: declared
 *     by the component's own stylesheet, on its own root. Fine, and the
 *     declaration is right there to prove it.
 *  3. **author/runtime knobs** — `--shell-sidebar-width`, `--pos`: nothing in
 *     the registry declares them; a page or a controller sets them. Fine ONLY
 *     with a fallback, which is what makes the component render regardless.
 *
 * Anything else is dangling. In particular a fallback does NOT excuse a name
 * that lives in a token FAMILY the token layer defines (`--space-*`, `--z-*`,
 * `--color-*`, …): such a name reads as a token to every agent and human, so an
 * undefined one is a typo or a missing scale step wearing a fallback as a
 * disguise. The family list is derived from the token layer, never listed here.
 */
export interface DanglingTokenFinding {
  /** Referenced token name, without the `--` prefix. */
  token: string;
  line: number;
  /** `family` — reads as a token but the token layer never defines it.
   *  `unresolved` — not a token, not declared locally, and no fallback. */
  kind: "family" | "unresolved";
  message: string;
}

/** Namespace of a custom property: the segment before its first `-`. */
function tokenFamily(name: string): string {
  return name.split("-")[0];
}

export function findDanglingTokenReferences(
  source: string,
  definedTokens: Set<string>,
): DanglingTokenFinding[] {
  const families = new Set([...definedTokens].map(tokenFamily));
  const local = new Set(extractTokenDefinitions(source).map(d => d.name));
  const findings: DanglingTokenFinding[] = [];

  for (const ref of extractTokenReferences(source)) {
    if (definedTokens.has(ref.name)) continue;
    if (local.has(ref.name)) continue;

    // `var(--x, …)` — a fallback is present when the expression carries a comma.
    const hasFallback = ref.expression.includes(",");
    const family = tokenFamily(ref.name);

    if (families.has(family)) {
      findings.push({
        token: ref.name,
        line: ref.line,
        kind: "family",
        message:
          `"--${ref.name}" is not defined in the token layer, but "--${family}-*" is a token ` +
          `family — either add the token or give the knob a name outside the token vocabulary` +
          (hasFallback ? " (the fallback hides it at runtime, not from a reader)" : ""),
      });
    } else if (!hasFallback) {
      findings.push({
        token: ref.name,
        line: ref.line,
        kind: "unresolved",
        message:
          `"--${ref.name}" is neither a design token nor declared in this stylesheet — ` +
          `declare it on the component root, or give the reference a fallback`,
      });
    }
  }

  return findings;
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
