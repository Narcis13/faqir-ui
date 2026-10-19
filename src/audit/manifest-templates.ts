// Manifest templates under the real auditor (forecraft #12).
//
// The registry gate (`scripts/registry-audit.mjs` gate 7) holds every reference
// fragment — `registry/<layer>/<name>/<name>.html` — to every rule. The other
// markup a component ships was never audited: the manifest's `templates`, which
// is what the skill prints as the component's example, what `faqir template`
// fills and what an agent copies first. `auth-form`'s template put its header,
// form and footer straight into a `card` with no `[data-part="body"]` — a
// `required-slot` critical from `card`'s own manifest — while the reference
// fragment beside it was clean, and downstream copied the template.
//
// A template is a fragment with `{placeholders}`. The one thing the audit
// cannot judge in it is a value that is still a placeholder: `data-variant=
// "{variant}"` is the caller's to fill, and every value rule reports it. Those
// findings — and only those — are dropped: a finding whose message quotes a
// whole `{name}` as the offending value. Everything else must be zero at
// `error` and `critical`.
//
// Filesystem-bound (it reads the manifests), so it is not part of the
// browser-bundled audit core.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Manifest } from "../manifest";
import { auditHtmlSource } from "./html-audit";
import type { AuditResult } from "./rules";

/** The layers that ship templates, in registry order. */
export const TEMPLATE_LAYERS = ["primitives", "recipes", "patterns"] as const;

/** Severities the template gate fails on. */
export const TEMPLATE_GATE_SEVERITIES: ReadonlySet<string> = new Set(["critical", "error"]);

/**
 * Templates known to fail, keyed `<layer>/<name>#<key>`, with the reason. Each
 * is owned by another area and is reported, not failed, until it is fixed;
 * an entry whose template has become clean is reported as stale so it can go.
 */
export const TEMPLATE_AUDIT_PENDING: Readonly<Record<string, string>> = Object.freeze({});

/** One HTML template a manifest ships. */
export interface ManifestTemplate {
  layer: (typeof TEMPLATE_LAYERS)[number];
  name: string;
  /** The `templates` key: `html`, `html_split`, … */
  key: string;
  html: string;
}

/** A gate finding: the template it is in and the auditor's result. */
export interface TemplateFinding {
  /** `<layer>/<name>#<key>` — the key {@link TEMPLATE_AUDIT_PENDING} uses. */
  id: string;
  result: AuditResult;
}

/** A value that is still a placeholder, quoted whole: `"{variant}"`, `"{cols}"`. */
const PLACEHOLDER_VALUE_RE = /"\{[A-Za-z_][\w-]*\}"/;

/** True when the finding is about a `{placeholder}` the template leaves to the caller. */
export function isPlaceholderFinding(result: AuditResult): boolean {
  return PLACEHOLDER_VALUE_RE.test(result.message);
}

/** Every HTML template in the registry's manifests, sorted by layer, name and key. */
export function listManifestTemplates(registryPath: string): ManifestTemplate[] {
  const out: ManifestTemplate[] = [];
  for (const layer of TEMPLATE_LAYERS) {
    const dir = join(registryPath, layer);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name, `${name}.manifest.json`);
      if (!existsSync(path)) continue;
      const manifest = JSON.parse(readFileSync(path, "utf8")) as Manifest;
      const templates = (manifest.templates ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(templates).sort()) {
        const html = templates[key];
        if (typeof html !== "string" || !html.trimStart().startsWith("<")) continue;
        out.push({ layer, name, key, html });
      }
    }
  }
  return out;
}

/**
 * Audit templates with the same engine and inputs the reference-fragment gate
 * uses, and return the findings the gate fails on: `error` and `critical`,
 * minus findings about an unfilled placeholder value.
 */
export function auditManifestTemplates(input: {
  templates: ManifestTemplate[];
  manifests: Map<string, Manifest>;
  styles?: Map<string, string>;
  knownUiValues?: Iterable<string>;
}): TemplateFinding[] {
  const known = input.knownUiValues ? [...input.knownUiValues] : undefined;
  const findings: TemplateFinding[] = [];
  for (const t of input.templates) {
    const id = `${t.layer}/${t.name}#${t.key}`;
    for (const result of auditHtmlSource({
      source: t.html,
      file: id,
      manifests: input.manifests,
      styles: input.styles,
      knownUiValues: known,
    })) {
      if (!TEMPLATE_GATE_SEVERITIES.has(result.severity)) continue;
      if (isPlaceholderFinding(result)) continue;
      findings.push({ id, result });
    }
  }
  return findings;
}
