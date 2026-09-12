/**
 * `@faqir-ui/rules` — the form-rules platform. [1.1B-01 · §8.2]
 *
 * Zero dependencies and no host coupling: nothing in this package imports
 * anything outside it, and no module names `window`, `document`, `process` or
 * a filesystem. A definition therefore means exactly one thing in a browser,
 * in a worker, in Bun, in Node and in an agent sandbox — which is the whole
 * point, because the same definition is what the `faqir-rules` plugin enforces
 * in the page and what a server re-checks before it writes anything down.
 *
 *   import { validate, coerce } from "@faqir-ui/rules";
 *
 *   const def = {
 *     version: "1",
 *     fields: {
 *       email: { type: "string", format: "email", required: true },
 *       age:   { type: "integer", minimum: 18 },
 *     },
 *   };
 *
 *   const data = coerce(def, Object.fromEntries(new FormData(form)));
 *   const { valid, findings } = validate(def, data);
 *
 * This release ships the **shape** half — the JSON Schema 2020-12 subset, the
 * formats registry, the message chain and coercion. `rules` is accepted in a
 * definition and ignored; 1.1B-02 gives it meaning and fills the verdict's
 * `visible`, `required` and `computed` maps, which are present and empty here
 * so that consumers can be written against the final shape today.
 *
 * See `README.md` for the definition format and `tests/golden/` for the corpus
 * that pins every verdict in this file.
 */

export {
  CompiledDefinition,
  DEFINITION_VERSION,
  DefinitionError,
  MAX_PATTERN_LENGTH,
  coerce,
  compile,
  validate,
} from "./shape.js";

export {
  BUILT_IN_FORMATS,
  checkFormat,
  formatNames,
  hasFormat,
  registerFormat,
} from "./formats.js";

export {
  DEFAULT_LOCALE,
  DEFAULT_MESSAGES,
  SHAPE_RULES,
  interpolate,
  resolveMessage,
} from "./messages.js";
