// The scaffold catalogue — every whole-page template `faqir scaffold <name>`
// can generate, in one side-effect-free table (task 1.0R-05).
//
// This used to live inside `src/commands/scaffold.ts`, which meant the shipped
// skill could not enumerate it without importing a command module. The skill's
// frontmatter advertises "page scaffolding" and "building printable documents
// (invoices, reports, forms)"; an agent that cannot see this table hand-composes
// an invoice instead of running the tested generator. Both the command's
// `--help` and the skill's Scaffolds section now read this map, so registering a
// scaffold documents it in both places with no further edit.

import { APP_SCAFFOLD_COMPONENTS, APP_SCAFFOLD_PATTERNS } from "./app";
import { DOCUMENT_SCAFFOLDS } from "./documents";
import { LANDING_COMPONENTS, LANDING_PATTERNS } from "./landing";

export interface ScaffoldDef {
  name: string;
  title: string;
  description: string;
  /** Registry patterns the page is composed from, in layout order. */
  patterns: string[];
  /** Components the composed page references, auto-installed unless `--no-add`. */
  components: string[];
  /** Theme applied when `--theme` is not given (page scaffolds keep the project's). */
  defaultTheme?: string;
}

export const SCAFFOLDS: Record<string, ScaffoldDef> = {
  "landing-page": {
    name: "landing-page",
    title: "Landing Page",
    description: "Marketing landing page composed from the hero, feature-grid, pricing, and site-footer patterns",
    patterns: [...LANDING_PATTERNS],
    components: [...LANDING_COMPONENTS],
  },
  "admin-dashboard": {
    name: "admin-dashboard",
    title: "Admin Dashboard",
    description:
      "Admin dashboard composed from the dashboard-shell and crud-table patterns — sidebar, header, metrics, and a records table",
    patterns: [...APP_SCAFFOLD_PATTERNS["admin-dashboard"]],
    components: [...APP_SCAFFOLD_COMPONENTS["admin-dashboard"]],
  },
  "internal-tool": {
    name: "internal-tool",
    title: "Internal Tool",
    description:
      "Internal tool composed from the settings-page and crud-table patterns — tabbed settings, forms, and data management",
    patterns: [...APP_SCAFFOLD_PATTERNS["internal-tool"]],
    components: [...APP_SCAFFOLD_COMPONENTS["internal-tool"]],
  },
  ...DOCUMENT_SCAFFOLDS,
};

/** Names of every registered scaffold, in catalogue order. */
export const SCAFFOLD_NAMES: string[] = Object.keys(SCAFFOLDS);

/** Scaffolds that produce a print-ready document (they pin a document theme). */
export const DOCUMENT_SCAFFOLD_NAMES: string[] = Object.keys(DOCUMENT_SCAFFOLDS);
