// Compile-time only (no tests run here): `audit.d.ts` is hand-written, so this
// file pins it to `src/audit.ts` in both directions. `bun run typecheck`
// compiles it through packages/mcp/tsconfig.json; a declaration that drifts
// from the implementation fails the build there.
import type * as Declared from "../audit";
import * as Implemented from "../src/audit";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

export type ReportMatches = Assert<Equal<Declared.AuditReportJSON, Implemented.AuditReportJSON>>;
export type FindingMatches = Assert<Equal<Declared.AuditFindingJSON, Implemented.AuditFindingJSON>>;
export type OptionsMatch = Assert<Equal<Declared.AuditHtmlOptions, Implemented.AuditHtmlOptions>>;
export type FunctionMatches = Assert<Equal<typeof Declared.auditHtml, typeof Implemented.auditHtml>>;
export type VersionMatches = Assert<Equal<typeof Declared.AUDIT_SCHEMA_VERSION, typeof Implemented.AUDIT_SCHEMA_VERSION>>;
