/**
 * @faqir-ui/rules — the one error the package throws. [1.1B-01 · §8.2]
 *
 * A leaf module: it imports nothing and reads no host global. It lives apart
 * from `shape.js` so that `logic.js` and `rules.js` can report a bad definition
 * without importing the shape validator — the module graph stays a DAG, which
 * is what keeps the isomorphism gate in `tests/isomorphic.test.ts` cheap to
 * state ("every import is a sibling `./x.js`").
 */

/**
 * Thrown for anything wrong with the *definition* — an unknown keyword, an
 * unknown operator, a compute cycle, an uncompilable pattern. Never thrown for
 * bad *data*: that is what findings are for. `path` names the place in the
 * definition, so the message is actionable without a stack trace.
 */
export class DefinitionError extends Error {
  /** @param {string} message @param {string} [path] */
  constructor(message, path) {
    super(`@faqir-ui/rules: ${message}`);
    this.name = "DefinitionError";
    /** @type {string | undefined} */
    this.path = path;
  }
}
