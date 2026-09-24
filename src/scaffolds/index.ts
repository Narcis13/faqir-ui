// The scaffold layer's public surface (task 1.0R-08).
//
// `faqir scaffold <name>` and the documentation site's scaffold gallery must
// show the same page — that is the whole point of the gallery. So both go
// through {@link scaffoldBody}: one dispatcher over the catalogue, returning the
// contents of the generated document's `<body>`. The CLI wraps it in a `<head>`
// full of project-relative stylesheet links; the site wraps it in a frame that
// links the site's own stylesheet. Neither re-derives the markup.

import { appScaffoldBody, generateAppPage, APP_SCAFFOLD_NAMES, type AppScaffoldName } from "./app";
import {
  documentScaffoldBody,
  generateDocumentScaffold,
  type DocumentScaffoldName,
} from "./documents";
import { generateLandingPage, landingScaffoldBody } from "./landing";
import { SCAFFOLDS } from "./registry";

export * from "./compose";
export * from "./registry";

/**
 * The `<body>` contents of the page `faqir scaffold <name>` writes.
 *
 * Throws on an unregistered name, for the same reason the marker extractor
 * throws on a missing block: a scaffold that the catalogue advertises and no
 * builder can produce is a bug, and returning a placeholder page would hide it.
 */
export function scaffoldBody(name: string, registryPath: string): string {
  if (!(name in SCAFFOLDS)) throw new Error(`Unknown scaffold: '${name}'.`);
  if (name === "landing-page") return landingScaffoldBody(registryPath);
  if ((APP_SCAFFOLD_NAMES as readonly string[]).includes(name)) {
    return appScaffoldBody(name as AppScaffoldName, registryPath);
  }
  return documentScaffoldBody(name as DocumentScaffoldName);
}

/** What the CLI knows about the project a scaffold is written into. */
export interface ScaffoldDocumentOptions {
  title: string;
  /** Pre-rendered `<link rel="stylesheet">` lines for the page head. */
  stylesheets: string;
  /** Absolute path to the registry the patterns are read from. */
  registryPath: string;
  /** Project-relative `src` of the engine (`<output_dir>/core/faqir-core.js`). */
  engineSrc: string;
  /** The project's `include_core` — whether an engine is installed to link. */
  includeCore: boolean;
}

/**
 * The whole document `faqir scaffold <name>` writes — the same dispatch as
 * {@link scaffoldBody}, over the same catalogue, so the command and the gallery
 * cannot disagree about which builder a name maps to. (The command used to
 * carry a `switch` of its own, which a new catalogue entry could miss.)
 *
 * App pages always link the engine: their dialog, dropdown and tabs are
 * recipes. Document scaffolds link it only when the project installs one.
 */
export function scaffoldDocument(name: string, options: ScaffoldDocumentOptions): string {
  if (!(name in SCAFFOLDS)) throw new Error(`Unknown scaffold: '${name}'.`);
  const { title, stylesheets, registryPath } = options;
  if (name === "landing-page") return generateLandingPage({ title, stylesheets, registryPath });
  if ((APP_SCAFFOLD_NAMES as readonly string[]).includes(name)) {
    return generateAppPage(name as AppScaffoldName, {
      title,
      stylesheets,
      registryPath,
      coreScriptSrc: options.engineSrc,
    });
  }
  return generateDocumentScaffold(name as DocumentScaffoldName, {
    title,
    stylesheets,
    coreScriptSrc: options.includeCore ? options.engineSrc : undefined,
  });
}

/**
 * The one command that produces a scaffold, as a reader would type it. Document
 * scaffolds pin their own theme, so the command that produces them says so.
 */
export function scaffoldCommand(name: string): string {
  const def = SCAFFOLDS[name];
  if (!def) throw new Error(`Unknown scaffold: '${name}'.`);
  return `faqir scaffold ${name} --output ${name}.html`;
}
