/**
 * The write/verify engine: render component HTML from manifest templates,
 * scaffold whole pages, and shape audit/repair results — all pure functions over
 * an in-memory manifest map (no filesystem).
 *
 * `faqir_generate` renders a component from its `templates.html`, then audits the
 * result before returning it, so an agent never receives markup that violates its
 * own manifest. `faqir_scaffold_page` composes several such components into a full,
 * landmark-correct HTML document. Both lean on the same shared audit/repair core
 * the CLI uses (`auditHtmlSource` / `applyRepairsToSource`).
 */
import { auditHtmlSource } from "../../../src/audit/checker";
import { applyRepairsToSource, type SourceRepairChange } from "../../../src/audit/repairer";
import type { AuditResult, Severity } from "../../../src/audit/rules";
import type { Manifest, ManifestVariant } from "../../../src/manifest";

// Manifests carry an optional `props` block (placeholder metadata) that predates
// the typed Manifest interface; read it structurally.
type ManifestProp = { type?: string; default?: unknown; description?: string };
type ManifestWithProps = Manifest & { props?: Record<string, ManifestProp> };

const PLACEHOLDER_RE = /\{([a-z_][a-z0-9_]*)\}/gi;

// ── Findings ────────────────────────────────────────────────────────────────

export interface Finding {
  rule_id: string;
  severity: Severity;
  component_name: string;
  line: number;
  column?: number;
  message: string;
  fixable: boolean;
}

export interface AuditReport {
  passed: boolean;
  counts: Record<Severity, number>;
  findings: Finding[];
}

/** Shape raw audit results into the stable findings JSON the MCP tools return. */
export function toAuditReport(results: AuditResult[]): AuditReport {
  const counts: Record<Severity, number> = { critical: 0, error: 0, warning: 0, info: 0 };
  const findings: Finding[] = results.map((r) => {
    counts[r.severity]++;
    return {
      rule_id: r.rule_id,
      severity: r.severity,
      component_name: r.component_name,
      line: r.line,
      ...(r.column !== undefined ? { column: r.column } : {}),
      message: r.message,
      fixable: !!r.fix,
    };
  });
  return {
    passed: counts.critical === 0 && counts.error === 0,
    counts,
    findings,
  };
}

/** Audit an HTML string against the manifest map; returns the findings report. */
export function auditHtml(
  html: string,
  manifests: Map<string, Manifest>,
  skipRules?: string[],
): AuditReport {
  return toAuditReport(auditHtmlSource({ source: html, manifests, skipRules }));
}

// ── Component generation ──────────────────────────────────────────────────────

export class GenerateError extends Error {}

export interface GenerateInput {
  component: string;
  variant?: string;
  size?: string;
  /** Values for content placeholders (e.g. `{body}`, `{icon}`) by placeholder name. */
  slots?: Record<string, string>;
  /** Values for template placeholders (e.g. `{text}`, `{title}`) by name. */
  props?: Record<string, string | number | boolean>;
  /** Stable id for templates that need `{id}` (defaults to the component name). */
  id?: string;
  /** Named template variant from the manifest (defaults to "html"). */
  template?: string;
}

export interface GenerateResult {
  html: string;
  component: string;
  variant: string | null;
  size: string | null;
  /** Placeholder names present in the chosen template (what `props`/`slots` fill). */
  placeholders: string[];
  /** Fragment-level audit (controller wiring is a page concern, checked on the page). */
  audit: AuditReport;
  /** Set for recipes: the controller that must be loaded when the fragment is placed on a page. */
  requires_controller?: string;
  /** Repairs applied automatically to make the fragment audit-clean. */
  repairs: SourceRepairChange[];
}

/** The variant group whose values are driven by a given attribute, if any. */
function variantGroupByAttr(manifest: Manifest, attr: string): ManifestVariant | undefined {
  return Object.values(manifest.variants || {}).find((v) => v.attr === attr);
}

/** Distinct placeholder names in a template, in first-seen order. */
function placeholdersIn(template: string): string[] {
  const seen: string[] = [];
  let m: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(template)) !== null) {
    if (!seen.includes(m[1])) seen.push(m[1]);
  }
  return seen;
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER_RE, (_full, key: string) => values[key] ?? "");
}

/**
 * Render a single component's HTML from its manifest template. Validates
 * `variant`/`size` against the manifest (throwing a clean {@link GenerateError}
 * listing valid values), fills placeholders from `props`/`slots`, and leaves any
 * unfilled placeholder empty so the structural markup stays intact.
 *
 * Does NOT audit — callers that need verification use {@link generateComponent}.
 */
export function renderComponent(input: GenerateInput, manifests: Map<string, Manifest>): {
  html: string;
  variant: string | null;
  size: string | null;
  placeholders: string[];
} {
  const manifest = manifests.get(input.component) as ManifestWithProps | undefined;
  if (!manifest) {
    throw new GenerateError(`Unknown component '${input.component}'.`);
  }

  const templates = manifest.templates as Record<string, string>;
  const templateKey = input.template ?? "html";
  const template = templates?.[templateKey];
  if (!template) {
    const available = Object.keys(templates || {}).join(", ") || "(none)";
    throw new GenerateError(
      `Component '${manifest.name}' has no '${templateKey}' template. Available: ${available}.`,
    );
  }

  // Resolve + validate variant (attr=data-variant) and size (attr=data-size).
  const variantGroup = variantGroupByAttr(manifest, "data-variant");
  const sizeGroup = manifest.variants?.size?.attr === "data-size" ? manifest.variants.size : variantGroupByAttr(manifest, "data-size");

  const variant = resolveValue("variant", input.variant, variantGroup);
  const size = resolveValue("size", input.size, sizeGroup);

  const values: Record<string, string> = {};
  if (variant !== null) values.variant = variant;
  if (size !== null) values.size = size;
  values.id = input.id ?? manifest.name;

  // props/slots fill placeholders by exact name; scalar coercion only.
  for (const [key, val] of Object.entries(input.props ?? {})) {
    if (val !== null && val !== undefined && typeof val !== "object") values[key] = String(val);
  }
  for (const [key, val] of Object.entries(input.slots ?? {})) {
    values[key] = String(val);
  }

  return {
    html: fillTemplate(template, values),
    variant,
    size,
    placeholders: placeholdersIn(template),
  };
}

/** Resolve a variant/size value against its group, or throw listing valid values. */
function resolveValue(
  label: string,
  requested: string | undefined,
  group: ManifestVariant | undefined,
): string | null {
  if (!group) {
    if (requested !== undefined) {
      throw new GenerateError(`This component has no '${label}' variant to set.`);
    }
    return null;
  }
  if (requested === undefined) return group.default;
  if (!group.values.includes(requested)) {
    throw new GenerateError(
      `Invalid ${label} '${requested}'. Valid values: ${group.values.join(", ")}.`,
    );
  }
  return requested;
}

/**
 * Render a component AND verify it audit-clean before returning. Fragment-level
 * rules only: `controller-loaded`/`focus-trap` are page-integration concerns
 * (is the controller script on the page?), reported via `requires_controller`
 * rather than as fragment findings. Any auto-fixable finding is repaired in place.
 */
export function generateComponent(input: GenerateInput, manifests: Map<string, Manifest>): GenerateResult {
  const rendered = renderComponent(input, manifests);
  const skip = ["controller-loaded", "focus-trap"];

  let html = rendered.html;
  let results = auditHtmlSource({ source: html, manifests, skipRules: skip });
  let repairs: SourceRepairChange[] = [];

  if (results.some((r) => r.severity === "critical" || r.severity === "error")) {
    const repaired = applyRepairsToSource(html, results);
    if (repaired.source !== html) {
      html = repaired.source;
      repairs = repaired.changes;
      results = auditHtmlSource({ source: html, manifests, skipRules: skip });
    }
  }

  const manifest = manifests.get(input.component)!;
  const requires_controller =
    manifest.kind === "recipe" && manifest.files?.js ? manifest.files.js : undefined;

  return {
    html,
    component: manifest.name,
    variant: rendered.variant,
    size: rendered.size,
    placeholders: rendered.placeholders,
    audit: toAuditReport(results),
    ...(requires_controller ? { requires_controller } : {}),
    repairs,
  };
}

// ── Page scaffolding ──────────────────────────────────────────────────────────

export type ScaffoldSection =
  | { component: string; variant?: string; size?: string; props?: Record<string, string | number | boolean>; slots?: Record<string, string> }
  | { heading: string; level?: number }
  | { html: string };

export interface ScaffoldInput {
  title?: string;
  /** Container the sections are wrapped in: stack | grid | none (default "stack"). */
  layout?: "stack" | "grid" | "none";
  sections: ScaffoldSection[];
  /** Stylesheet href to link (default "ui/faqir.bundle.css"). */
  stylesheet?: string;
}

export interface ScaffoldResult {
  html: string;
  components_used: string[];
  audit: AuditReport;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Compose a full, landmark-correct HTML page from a list of sections. Component
 * sections are rendered from their manifests; a `<main>` wraps the content (so the
 * `landmark` rule is satisfied) and, when any recipe is used, the auto-init
 * controller script is included (so `controller-loaded` passes). The finished
 * page is audited and returned with its findings.
 */
export function scaffoldPage(input: ScaffoldInput, manifests: Map<string, Manifest>): ScaffoldResult {
  const title = input.title ?? "Untitled";
  const layout = input.layout ?? "stack";
  const stylesheet = input.stylesheet ?? "ui/faqir.bundle.css";

  const used = new Set<string>();
  let hasRecipe = false;
  const blocks: string[] = [];
  let idSeq = 0;

  for (const section of input.sections) {
    if ("component" in section) {
      const manifest = manifests.get(section.component);
      if (!manifest) throw new GenerateError(`Unknown component '${section.component}'.`);
      used.add(manifest.name);
      if (manifest.kind === "recipe") hasRecipe = true;
      const { html } = renderComponent(
        { ...section, id: `${manifest.name}-${++idSeq}` },
        manifests,
      );
      blocks.push(indent(html, 6));
    } else if ("heading" in section) {
      const level = Math.min(6, Math.max(1, section.level ?? 2));
      blocks.push(`      <h${level}>${escapeHtml(section.heading)}</h${level}>`);
    } else {
      blocks.push(indent(section.html, 6));
    }
  }

  const inner = blocks.join("\n");
  const body =
    layout === "none"
      ? inner
      : `    <div data-ui="${layout}">\n${inner}\n    </div>`;

  const scripts = hasRecipe
    ? '\n  <script type="module" src="ui/core/faqir.js"></script>'
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${stylesheet}">
</head>
<body>
  <main>
${body}
  </main>${scripts}
</body>
</html>`;

  return {
    html,
    components_used: [...used].sort(),
    audit: auditHtml(html, manifests),
  };
}

function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}
