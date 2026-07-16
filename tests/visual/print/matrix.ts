import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCUMENT_SCAFFOLDS,
  type DocumentScaffoldName,
} from "../../../src/scaffolds/documents";
import { buildDocumentScaffoldPage } from "../../scaffolds/document-pages";
import { buildPrintReferencePageHtml } from "../matrix";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..", "..");
export const REGISTRY = join(ROOT, "registry");

export interface RegistryPrintReference {
  name: string;
  kind: string;
  manifestRel: string;
  htmlRel: string;
  htmlPath: string;
}

export interface PrintCase {
  id: string;
  title: string;
  source:
    | { kind: "scaffold"; name: DocumentScaffoldName }
    | { kind: "registry-reference"; reference: RegistryPrintReference };
  expectedPages: number;
}

/**
 * Pagination is a public print contract, so a new case must explicitly bless
 * its page count. This is deliberately not inferred from forced page breaks:
 * natural overflow is exactly the regression the cheap count assertion catches.
 */
export const EXPECTED_PAGE_COUNTS: Readonly<Record<string, number>> = {
  "scaffold-invoice": 2,
  "scaffold-report": 2,
  "pattern-document-print": 3,
};

function walk(dir: string, suffix: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, suffix, out);
    else if (entry.endsWith(suffix)) out.push(full);
  }
  return out;
}

/** Every registry manifest that opts into print visual coverage. */
export function discoverRegistryPrintReferences(): RegistryPrintReference[] {
  const references: RegistryPrintReference[] = [];

  for (const manifestPath of walk(REGISTRY, ".manifest.json")) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      name?: string;
      kind?: string;
      files?: { print_reference?: string };
    };
    const printReference = manifest.files?.print_reference;
    if (!printReference) continue;

    const htmlPath = join(dirname(manifestPath), printReference);
    if (!existsSync(htmlPath)) {
      throw new Error(
        `${relative(ROOT, manifestPath)} declares missing print reference ${printReference}`,
      );
    }

    references.push({
      name: manifest.name ?? basename(manifestPath, ".manifest.json"),
      kind: manifest.kind ?? "registry",
      manifestRel: relative(ROOT, manifestPath),
      htmlRel: relative(ROOT, htmlPath),
      htmlPath,
    });
  }

  return references.sort((a, b) => a.htmlRel.localeCompare(b.htmlRel));
}

function pageCountFor(id: string): number {
  const count = EXPECTED_PAGE_COUNTS[id];
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Print case ${id} needs an explicit expected page count`);
  }
  return count;
}

/** Invoice/report scaffolds plus every manifest-declared print reference. */
export function buildPrintMatrix(): PrintCase[] {
  const cases: PrintCase[] = [];

  for (const name of Object.keys(DOCUMENT_SCAFFOLDS).sort() as DocumentScaffoldName[]) {
    const id = `scaffold-${name}`;
    cases.push({
      id,
      title: `${DOCUMENT_SCAFFOLDS[name].title} scaffold`,
      source: { kind: "scaffold", name },
      expectedPages: pageCountFor(id),
    });
  }

  for (const reference of discoverRegistryPrintReferences()) {
    const id = `${reference.kind}-${basename(reference.htmlPath, ".html")}`;
    cases.push({
      id,
      title: `${reference.name} print reference`,
      source: { kind: "registry-reference", reference },
      expectedPages: pageCountFor(id),
    });
  }

  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildPrintCaseHtml(printCase: PrintCase): string {
  if (printCase.source.kind === "scaffold") {
    return buildDocumentScaffoldPage(printCase.source.name);
  }

  return buildPrintReferencePageHtml(
    readFileSync(printCase.source.reference.htmlPath, "utf8"),
    printCase.title,
  );
}
