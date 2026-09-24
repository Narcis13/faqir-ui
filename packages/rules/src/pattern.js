/**
 * @faqir-ui/rules — how dangerous a regular expression is. [1.1 release]
 *
 * A leaf module: it imports nothing and reads no host global.
 *
 * `MAX_PATTERN_LENGTH` bounds how long a pattern may be, and that is not the
 * cost that matters: `^(a+)+$` is seven characters and takes seconds against
 * thirty `a`s and a `b`, because a backtracking engine tries every way of
 * splitting the run between the inner and the outer quantifier. No bound on the
 * subject fixes that either — the blow-up is exponential in its length.
 *
 * So the pattern's *shape* is read, before anything runs it. This is a
 * heuristic, deliberately pragmatic rather than a proof, and it has two levels:
 *
 *   · **catastrophic** — an unbounded quantifier (`*`, `+`, `{n,}`) on a group
 *     whose body can match through an unbounded quantifier *alone*, everything
 *     else in that alternative being optional: `(a+)+`, `(a*)*`, `(\w+\s?)+`,
 *     `((\d+)-?)*`. Nothing forces an iteration boundary, so the number of ways
 *     to match grows exponentially. `compile` refuses these, so the plugin and
 *     a server never run one.
 *   · **nested** — the same star height of two, but with something mandatory
 *     in the body (`([a-z]+\.)+`) or a bounded outer repeat (`(.*a){20}`).
 *     Often fine — a mandatory separator makes each split unambiguous — and
 *     sometimes polynomially slow. The lint warns; nothing refuses it.
 *
 * Overlapping alternation (`(a|a)+`) and backreference tricks are not read.
 * The README's "Security" section is the other half of this: a definition is
 * code, and one that arrives from someone untrusted must be linted before it
 * is run.
 */

/**
 * @typedef {object} Atom
 * @property {number} min the least number of times it must match
 * @property {boolean} unbounded its quantifier has no upper bound
 * @property {boolean} wide its quantifier allows more than one repeat
 * @property {boolean} zeroWidth an anchor or a lookaround: it consumes nothing
 * @property {boolean} innerUnbounded a group whose body contains an unbounded quantifier
 * @property {boolean} innerSole a group whose body can repeat through one atom alone
 */

/** @returns {Atom} */
function atom() {
  return { min: 1, unbounded: false, wide: false, zeroWidth: false, innerUnbounded: false, innerSole: false };
}

/** Can this atom, by itself, match an arbitrarily long run? @param {Atom} a */
function repeatsAlone(a) {
  return a.unbounded || a.innerSole;
}

/**
 * The quantifier at `source[i]`, if one starts there.
 *
 * @param {string} source @param {number} i
 * @returns {{ min: number, max: number, end: number } | null}
 */
function quantifierAt(source, i) {
  const c = source[i];
  let q = null;
  if (c === "*") q = { min: 0, max: Infinity, end: i + 1 };
  else if (c === "+") q = { min: 1, max: Infinity, end: i + 1 };
  else if (c === "?") q = { min: 0, max: 1, end: i + 1 };
  else if (c === "{") {
    const match = /^\{(\d+)(,(\d*))?\}/.exec(source.slice(i));
    if (!match) return null;
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : match[3] === "" ? Infinity : Number(match[3]);
    q = { min, max, end: i + match[0].length };
  }
  if (q && source[q.end] === "?") q.end += 1; // lazy: same shape, same risk
  return q;
}

/**
 * One past the escape starting at `source[i]` (a backslash). `\u{…}` and
 * `\p{…}` are read whole; any other escape is its next character — the hex
 * digits of a `\x41` read as literals after it, which can only make the
 * verdict milder, never harsher.
 *
 * @param {string} source @param {number} i
 */
function escapeEnd(source, i) {
  if (source[i + 2] === "{" && "upP".includes(source[i + 1])) {
    const close = source.indexOf("}", i + 3);
    if (close !== -1) return close + 1;
  }
  return i + 2;
}

/**
 * Read a pattern's quantifier structure.
 *
 * @param {string} source
 * @returns {"catastrophic" | "nested" | null}
 */
export function patternRisk(source) {
  /** @typedef {{ alternatives: Atom[][], zeroWidth: boolean }} Frame */
  /** @type {Frame[]} */
  const stack = [{ alternatives: [[]], zeroWidth: false }];
  let nested = false;
  let catastrophic = false;

  /** @returns {Atom[]} */
  const current = () => {
    const frame = stack[stack.length - 1];
    return frame.alternatives[frame.alternatives.length - 1];
  };

  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") {
      current().push(atom());
      i = escapeEnd(source, i);
    } else if (c === "[") {
      let j = i + 1;
      while (j < source.length && source[j] !== "]") j = source[j] === "\\" ? j + 2 : j + 1;
      current().push(atom());
      i = j + 1;
    } else if (c === "(") {
      let j = i + 1;
      let zeroWidth = false;
      if (source[j] === "?") {
        if (source[j + 1] === "=" || source[j + 1] === "!") {
          zeroWidth = true;
          j += 2;
        } else if (source[j + 1] === "<" && (source[j + 2] === "=" || source[j + 2] === "!")) {
          zeroWidth = true;
          j += 3;
        } else if (source[j + 1] === "<") {
          const close = source.indexOf(">", j + 2);
          j = close === -1 ? j + 2 : close + 1;
        } else {
          j += 2; // `(?:`, and the modifier groups
        }
      }
      stack.push({ alternatives: [[]], zeroWidth });
      i = j;
    } else if (c === ")" && stack.length > 1) {
      const frame = /** @type {Frame} */ (stack.pop());
      const group = atom();
      group.zeroWidth = frame.zeroWidth;
      for (const alternative of frame.alternatives) {
        if (alternative.some((a) => a.unbounded || a.innerUnbounded)) group.innerUnbounded = true;
        const soloIndex = alternative.findIndex(repeatsAlone);
        if (soloIndex !== -1 &&
            alternative.every((a, index) => index === soloIndex || a.min === 0 || a.zeroWidth)) {
          group.innerSole = true;
        }
      }
      current().push(group);
      i += 1;
    } else if (c === "|") {
      stack[stack.length - 1].alternatives.push([]);
      i += 1;
    } else if (c === "^" || c === "$") {
      const anchor = atom();
      anchor.zeroWidth = true;
      current().push(anchor);
      i += 1;
    } else {
      const q = quantifierAt(source, i);
      const list = current();
      const target = list[list.length - 1];
      if (q && target) {
        target.min = target.min * q.min;
        target.unbounded = q.max === Infinity;
        target.wide = q.max > 1;
        // A lookaround matches once however it is quantified: no risk there.
        if (!target.zeroWidth && target.innerUnbounded && target.wide) nested = true;
        if (!target.zeroWidth && target.innerSole && target.unbounded) catastrophic = true;
        i = q.end;
      } else {
        current().push(atom());
        i += 1;
      }
    }
  }
  if (catastrophic) return "catastrophic";
  return nested ? "nested" : null;
}

/**
 * The sentence both `compile` and the lint use for a refused pattern. Short,
 * because it ships in the browser plugin; `pattern.js`'s header is the essay.
 *
 * @param {string} what `"pattern" at fields.x`, `the "regex" pattern at rules[0]`
 */
export function catastrophicMessage(what) {
  return `${what} nests unbounded repeats, like (a+)+, and can backtrack catastrophically.`;
}

/**
 * The lint's warning for the milder shape.
 *
 * @param {string} what
 */
export function nestedMessage(what) {
  return `${what} repeats a group that itself contains an unbounded quantifier; ` +
    "check that every repeat must start with something the previous one cannot " +
    "have matched, or it can backtrack for a very long time on a near-miss.";
}
