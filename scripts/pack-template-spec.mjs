#!/usr/bin/env node
/**
 * `prepack` of @faqir-ui/template: copy the language specification,
 * `docs/template.md`, into the package as `template.md`, so that the tarball
 * carries it. npm consumers and agents reading `node_modules` otherwise have
 * the engine but no grammar, no diagnostic codes and no AST reference: the
 * README's pointer into the repository does not resolve inside a tarball.
 *
 * The copy is ignored by git (`packages/template/template.md`); the single
 * source stays `docs/template.md`. Runs on `npm pack` and `npm publish` in
 * `packages/template` (the release publishes from there).
 */
import { copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
copyFileSync(join(ROOT, "docs", "template.md"), join(ROOT, "packages", "template", "template.md"));
console.log("✓ Copied docs/template.md into packages/template/template.md");
