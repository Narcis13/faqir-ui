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
 * A definition also carries `rules` — the six verbs (`show`, `require`,
 * `validate`, a remote `validate`, `compute`, `jump`) over a JSONLogic subset,
 * which is what fills the verdict's `computed`, `visible`, `required` and
 * `next` maps:
 *
 *   const definition = {
 *     version: "1",
 *     fields: { start: { type: "string", format: "date" },
 *               end:   { type: "string", format: "date" } },
 *     rules: [
 *       { id: "end-after-start", validate: { "date": [{ var: "start" }, "<", { var: "end" }] },
 *         path: "end", message: "The end date must come after the start date." },
 *     ],
 *   };
 *
 * See `README.md` for the definition format, the operators and the verbs, and
 * `tests/golden/` for the corpus that pins every verdict in this package.
 */

export {
  CompiledDefinition,
  DEFINITION_VERSION,
  DefinitionError,
  MAX_PATTERN_LENGTH,
  coerce,
} from "./shape.js";

export {
  REMOTE,
  RULE_VERBS,
  compile,
  evaluate,
  validate,
  validateAsync,
} from "./rules.js";

export {
  DATE_COMPARATORS,
  LOGIC_OPS,
  evaluateLogic,
  parseInstant,
  truthy,
} from "./logic.js";

export {
  MAX_LOGIC_DEPTH,
  MAX_LOGIC_NODES,
  MAX_REGEX_SUBJECT_LENGTH,
} from "./limits.js";

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
  RULE_MESSAGES,
  SHAPE_RULES,
  interpolate,
  resolveMessage,
} from "./messages.js";
