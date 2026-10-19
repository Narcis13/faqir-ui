/**
 * Types for `@faqir-ui/mcp/audit` (`dist/audit.mjs`, built from `src/audit.ts`).
 *
 * Hand-written so the package ships no build-time type emit; held to the
 * implementation by `tests/forecraft-audit-types.ts`, which `bun run typecheck`
 * compiles — a signature that drifts from `src/audit.ts` fails there.
 */

export type Severity = "critical" | "error" | "warning" | "info";

/** One finding, as `faqir audit --json` prints it. */
export interface AuditFindingJSON {
  rule_id: string;
  severity: Severity;
  component_name: string;
  file: string;
  line: number;
  column?: number;
  message: string;
  fixable: boolean;
}

/** The `faqir audit --stdin --json` document. */
export interface AuditReportJSON {
  audit_schema_version: 1;
  passed: boolean;
  files_scanned: number;
  components_found: number;
  counts: Record<Severity, number>;
  vendor_counts: Record<Severity, number>;
  results: AuditFindingJSON[];
}

/** The version every report carries as `audit_schema_version`. */
export declare const AUDIT_SCHEMA_VERSION: 1;

/** A component manifest, as its `<name>.manifest.json` holds it. Validated at call time. */
export interface ComponentManifest {
  name: string;
  [key: string]: unknown;
}

export interface AuditHtmlOptions {
  /** A project directory whose `faqir.config.json` components and audit settings apply. */
  root?: string;
  /** Extra component manifests laid over the registry, by `name`. */
  components?: readonly ComponentManifest[] | Readonly<Record<string, ComponentManifest>>;
  /** Rule ids to skip (`faqir audit --skip-rules`). */
  skipRules?: readonly string[];
  /** Also report undeclared `data-*` attributes (rule `undeclared-markup-attribute`). */
  strict?: boolean;
  /** The registry to audit against. Defaults to the one this package ships. */
  registry?: string;
}

/** Audit an HTML string; resolves to the `faqir audit --stdin --json` report. */
export declare function auditHtml(html: string, options?: AuditHtmlOptions): Promise<AuditReportJSON>;
