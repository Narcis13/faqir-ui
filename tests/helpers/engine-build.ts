/**
 * Which engine build a parameterised suite runs against.  [forecraft #50]
 *
 * A test file that loads the engine through this helper instead of a literal
 * `require("…/faqir-core.js")` is run twice by `scripts/test.mjs`: once in the
 * production partition, against `faqir-core.js`, and once more in the strict-CSP
 * partition with `FAQIR_ENGINE_BUILD=csp`, against `faqir-core.csp.js` — the same
 * directives, controllers and assertions with the expression interpreter in
 * place of `new Function`. Each build bootstraps on `require`, so each one gets
 * its own process; never load both builds in one file.
 *
 * `bun test tests/core/faqir-core.test.ts` runs the production build;
 * `FAQIR_ENGINE_BUILD=csp bun test tests/core/faqir-core.test.ts` the CSP one.
 */
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type EngineBuild = "default" | "csp";

export const ENGINE_BUILD: EngineBuild = process.env.FAQIR_ENGINE_BUILD === "csp" ? "csp" : "default";

export const ENGINE_PATH = join(
  resolve(fileURLToPath(new URL(".", import.meta.url)), "../.."),
  "registry",
  "core",
  ENGINE_BUILD === "csp" ? "faqir-core.csp.js" : "faqir-core.js",
);

/** The engine for this run — `require`d, so it bootstraps exactly as before. */
export function loadEngine(): any {
  return require(ENGINE_PATH);
}

/** True under the strict-CSP partition: for the few assertions that are about `new Function` itself. */
export const IS_CSP = ENGINE_BUILD === "csp";
