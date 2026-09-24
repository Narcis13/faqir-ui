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
 *   const data = coerce(def, fromFormData(new FormData(form)));
 *   const { valid, findings } = validate(def, data);
 *
 * (`fromFormData`, not `Object.fromEntries`: the latter keeps one value of a
 * repeated name, and a checkbox group is exactly that.)
 *
 * A definition also carries `rules` — the five verbs (`show`, `require`,
 * `validate` in its logic and remote forms, `compute`, `jump`) over a JSONLogic subset,
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
 * A definition is also a *document*: `rules.schema.json` beside this file is the
 * schema a platform hands a model for structured output, `validateDefinition`
 * is that schema as code, and `lintDefinition` reports the seven things a
 * schema cannot say — a `var` naming no field, a compute cycle, an untranslated
 * message, a condition that folds to a constant. `faqir rules lint` is the same
 * function behind a CLI.
 *
 * See `README.md` for the definition format, the operators and the verbs, and
 * `tests/golden/` for the corpus that pins every verdict in this package.
 */

export {
  CompiledDefinition,
  DEFINITION_VERSION,
  DefinitionError,
  FIELD_KEYWORDS,
  MAX_ARRAY_INDEX,
  MAX_PATTERN_LENGTH,
  coerce,
  fromFormData,
} from "./shape.js";

export {
  DEFINITION_KEYWORDS,
  LINT_RULES,
  lintDefinition,
  validateDefinition,
} from "./lint.js";

export {
  REMOTE,
  RULE_KEYS,
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
