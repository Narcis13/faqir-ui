/**
 * @faqir-ui/rules — the bounds a definition is held to. [1.1B-02 · §8.2]
 *
 * A leaf module: it imports nothing and reads no host global.
 *
 * A definition is data, and data is frequently one layer removed from someone
 * untrusted — a form builder, a CMS field, an agent's output. Every knob here
 * bounds work whose cost the *author* of the definition chooses, so that a
 * hostile or merely careless definition fails loudly at compile time instead of
 * spending the process. All four are compared against at the point the work
 * would start, never after it: a 10,000-node expression is rejected while it is
 * being walked, not evaluated and then measured.
 */

/**
 * A `pattern` (or a `regex` operand) longer than this is refused at compile
 * time. A regex is the one keyword whose cost is author-controlled; a bound
 * here is cheaper than a bound on every subject string.
 */
export const MAX_PATTERN_LENGTH = 1000;

/**
 * The longest string a `regex` operator will run its pattern against. A subject
 * longer than this answers `false` rather than risking a pathological match —
 * the pattern is bounded, but the product of pattern and subject is not.
 */
export const MAX_REGEX_SUBJECT_LENGTH = 10000;

/**
 * How many nodes one logic expression may contain — every operator object,
 * every array and every literal inside it. A form's conditions are small; four
 * figures is already a generated monster.
 */
export const MAX_LOGIC_NODES = 1000;

/** How deeply one logic expression may nest. Deep enough for any hand-written condition. */
export const MAX_LOGIC_DEPTH = 64;

/**
 * The largest array index a flat form key may un-flatten into: `contacts[9999].name`
 * is written into position 9999 by `coerce`, and `contacts[10000].name` is not —
 * it is carried through as a flat key the definition does not know, like any
 * other. The key is attacker-chosen on a server, and without this bound
 * `contacts[100000000].name` alone builds a sparse array that every later pass
 * walks the whole length of. Ten thousand rows is already more than any form
 * renders; a list longer than that arrives as JSON, not as `FormData`.
 */
export const MAX_ARRAY_INDEX = 9999;
