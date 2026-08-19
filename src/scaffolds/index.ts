// The scaffold layer's public surface (task 1.0R-08).
//
// `faqir scaffold <name>` and the documentation site's scaffold gallery must
// show the same page — that is the whole point of the gallery. So both go
// through {@link scaffoldBody}: one dispatcher over the catalogue, returning the
// contents of the generated document's `<body>`. The CLI wraps it in a `<head>`
// full of project-relative stylesheet links; the site wraps it in a frame that
// links the site's own stylesheet. Neither re-derives the markup.

import { appScaffoldBody, APP_SCAFFOLD_NAMES, type AppScaffoldName } from "./app";
import { documentScaffoldBody, type DocumentScaffoldName } from "./documents";
import { landingScaffoldBody } from "./landing";
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

/**
 * The one command that produces a scaffold, as a reader would type it. Document
 * scaffolds pin their own theme, so the command that produces them says so.
 */
export function scaffoldCommand(name: string): string {
  const def = SCAFFOLDS[name];
  if (!def) throw new Error(`Unknown scaffold: '${name}'.`);
  return `faqir scaffold ${name} --output ${name}.html`;
}
