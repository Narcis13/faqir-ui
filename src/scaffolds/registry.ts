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
    description: "Full admin dashboard with sidebar, data tables, and charts",
    patterns: ["dashboard-shell", "crud-table"],
    components: [
      "button", "card", "input", "badge", "avatar", "separator", "spinner",
      "grid", "stack", "surface", "table", "dialog", "dropdown", "tabs", "toast",
      "pagination",
    ],
  },
  "internal-tool": {
    name: "internal-tool",
    title: "Internal Tool",
    description: "Internal tool with settings, forms, and data management",
    patterns: ["settings-page", "crud-table"],
    components: [
      "button", "card", "input", "label", "select", "checkbox", "switch",
      "badge", "separator", "spinner", "grid", "stack",
      "tabs", "dialog", "dropdown", "toast", "table", "pagination",
    ],
  },
  ...DOCUMENT_SCAFFOLDS,
};

/** Names of every registered scaffold, in catalogue order. */
export const SCAFFOLD_NAMES: string[] = Object.keys(SCAFFOLDS);

/** Scaffolds that produce a print-ready document (they pin a document theme). */
export const DOCUMENT_SCAFFOLD_NAMES: string[] = Object.keys(DOCUMENT_SCAFFOLDS);
