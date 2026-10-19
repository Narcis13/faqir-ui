/**
 * `@faqir-ui/mcp/audit` — the Faqir auditor as a function, for apps that audit
 * HTML they render (a preview endpoint, a CMS save hook, a test) without
 * spawning `faqir audit --stdin --json` for every call.
 *
 *   import { auditHtml } from "@faqir-ui/mcp/audit";
 *   const report = await auditHtml(html);                 // the registry alone
 *   const report = await auditHtml(html, { root: cwd });  // + a project's components
 *
 * The report is the document `faqir audit --stdin --json` prints — the same
 * `audit_schema_version`, counts and `results` — because both run
 * `auditSourceReport` (`src/audit/string-report.ts`) over the same inputs.
 *
 * Importing this module starts nothing: no server, no stdio, no `process.exit`
 * (the package's `.` entry IS the stdio server, which is why this is a subpath
 * of its own). It runs on plain Node >= 18; the runtime shim stands in for the
 * `Bun.*` globals the shared internals use, and is a no-op under Bun.
 */
import "../../../src/utils/runtime-shim";

import { loadRegistryAuditInputs, withProjectAuditInputs, type RegistryAuditInputs } from "../../../src/audit/checker";
import { auditSourceReport } from "../../../src/audit/string-report";
import type { AuditReportJSON } from "../../../src/audit/reporter";
import { validateManifest, type Manifest } from "../../../src/manifest";
import { getRegistryPath } from "../../../src/utils/fs";

export type { AuditReportJSON, AuditFindingJSON } from "../../../src/audit/reporter";
export { AUDIT_SCHEMA_VERSION } from "../../../src/audit/reporter";

/** A component manifest, as its `<name>.manifest.json` holds it. Validated at call time. */
export interface ComponentManifest {
  name: string;
  [key: string]: unknown;
}

export interface AuditHtmlOptions {
  /**
   * A project directory. When it holds a `faqir.config.json`, its installed and
   * custom components, edited manifests, stylesheets and
   * `audit.forbid_directives` apply — what `faqir audit --stdin` does when run
   * from that directory. Omitted, the HTML is audited against the registry alone.
   */
  root?: string;
  /**
   * Extra component manifests laid over the registry (and over `root`'s), by
   * `name` — an app's own components that live outside a Faqir project. Each is
   * checked against the manifest schema; an invalid one throws.
   */
  components?: readonly ComponentManifest[] | Readonly<Record<string, ComponentManifest>>;
  /** Rule ids to skip (`faqir audit --skip-rules`). */
  skipRules?: readonly string[];
  /** Also report undeclared `data-*` attributes (rule `undeclared-markup-attribute`). */
  strict?: boolean;
  /** The registry to audit against. Defaults to the one this package ships. */
  registry?: string;
}

// The registry is read once per path and reused: it is the expensive half of an
// audit, and it does not change under a running process.
const registryCache = new Map<string, Promise<RegistryAuditInputs>>();

function registryInputs(path: string): Promise<RegistryAuditInputs> {
  let cached = registryCache.get(path);
  if (!cached) {
    cached = loadRegistryAuditInputs(path);
    registryCache.set(path, cached);
    cached.catch(() => registryCache.delete(path));
  }
  return cached;
}

function manifestList(components: AuditHtmlOptions["components"]): Manifest[] {
  if (!components) return [];
  const list = Array.isArray(components)
    ? (components as readonly ComponentManifest[])
    : Object.values(components as Readonly<Record<string, ComponentManifest>>);
  return list.map((manifest, i) => {
    const errors = validateManifest(manifest);
    if (errors.length > 0) {
      const label = typeof manifest?.name === "string" ? `'${manifest.name}'` : `#${i}`;
      const detail = errors.map((e) => `${e.field || "(root)"}: ${e.message}`).join("; ");
      throw new TypeError(`auditHtml: components ${label} is not a valid manifest — ${detail}`);
    }
    return manifest as unknown as Manifest;
  });
}

/**
 * Audit an HTML string against the Faqir manifests. Resolves to the
 * `faqir audit --stdin --json` report; `report.passed` is false when any finding
 * is critical or an error — the CLI's exit code 1.
 */
export async function auditHtml(html: string, options: AuditHtmlOptions = {}): Promise<AuditReportJSON> {
  if (typeof html !== "string") throw new TypeError("auditHtml: html must be a string");
  const extra = manifestList(options.components);
  const registry = await registryInputs(options.registry ?? getRegistryPath());
  const inputs = await withProjectAuditInputs(registry, options.root);
  if (extra.length > 0) {
    const manifests = new Map(inputs.manifests);
    const known = new Set(inputs.knownUiValues);
    for (const manifest of extra) {
      manifests.set(manifest.name, manifest);
      known.add(manifest.name);
    }
    inputs.manifests = manifests;
    inputs.knownUiValues = [...known];
  }
  return auditSourceReport(html, inputs, {
    skipRules: options.skipRules ? [...options.skipRules] : undefined,
    strict: options.strict,
  }).report;
}
