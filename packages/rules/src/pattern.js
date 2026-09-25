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
 *   · **catastrophic** — a group repeated without a small bound (`*`, `+`,
 *     `{n,}`, or `{n,m}` above `LIMIT`) that can match the same text more than
 *     one way per iteration boundary. Two shapes are read:
 *       – its body can repeat through one variable-count quantifier *alone*,
 *         everything else in that alternative being optional: `(a+)+`,
 *         `(a*)*`, `(\w+\s?)+`, `((\d+)-?)*`, `(a+){20}`, `(a{1,5})+`;
 *       – its body holds an alternation whose branches can start with the same
 *         character: `(a|a)+`, `(\w|\d)+`, `(a|ab)*`, `(.|\s)*`. Classes are
 *         compared by the characters they admit, so `(\d|[a-f])+` and
 *         `(\w|-)+` pass. Branches that share only a later character are not
 *         read, and `(ab|ac)+` is refused although it is harmless — the check
 *         errs towards refusing.
 *     Nothing forces a unique split, so the number of ways to fail grows
 *     exponentially. `compile` refuses these, so the plugin and a server never
 *     run one.
 *   · **nested** — the same star height of two, but with something mandatory
 *     in the body (`([a-z]+\.)+`) or a bounded outer repeat (`(.*a){20}`).
 *     Often fine — a mandatory separator makes each split unambiguous — and
 *     sometimes polynomially slow. The lint warns; nothing refuses it.
 *
 * Backreference tricks are not read. Whatever slips past is still bounded on
 * the other side: no subject longer than `MAX_REGEX_SUBJECT_LENGTH` is ever
 * matched. The README's "Security" section is the other half of this: a
 * definition is code, and one that arrives from someone untrusted must be
 * linted before it is run.
 */

/** A bounded repeat above this many iterations is read like an unbounded one. */
const LIMIT = 10;

/** A first-character pattern that matches nothing: what a zero-width atom starts with. */
const NONE = "(?!)";

/**
 * @typedef {object} Atom
 * @property {number} min the least number of times it must match
 * @property {boolean} unbounded its quantifier has no upper bound
 * @property {boolean} wide its quantifier allows more than one repeat
 * @property {boolean} flex its quantifier allows more than one repeat, and a varying number of them
 * @property {boolean} zeroWidth an anchor or a lookaround: it consumes nothing
 * @property {boolean} empty it can match the empty string
 * @property {string} first a pattern for one character its match can start with
 * @property {boolean} innerUnbounded a group whose body contains an unbounded quantifier
 * @property {boolean} innerSole a group whose body can repeat through one atom alone
 * @property {boolean} ambiguous a group whose body holds an alternation with branches that start alike
 */

/** @param {string} first @returns {Atom} */
function atom(first) {
  return {
    min: 1, unbounded: false, wide: false, flex: false, zeroWidth: false, empty: false, first,
    innerUnbounded: false, innerSole: false, ambiguous: false,
  };
}

/** Can this atom, by itself, match a run of varying length? @param {Atom} a */
function repeatsAlone(a) {
  return a.flex || a.innerSole;
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
 * `\p{…}` are read whole; any other escape is its next character.
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
 * Whether two of these first-character patterns admit a common character. The
 * engine answers, not a model of it: each is compiled on its own and run over
 * ASCII, a few Unicode spaces and every character the pattern itself spells —
 * which holds every literal and every class endpoint the branches can name. A
 * branch this cannot compile is read as overlapping, the harsher verdict.
 *
 * @param {string[]} firsts @param {Set<string>} probes
 */
function overlap(firsts, probes) {
  let tests;
  try {
    tests = firsts.map((first) => new RegExp(`^(?:${first})$`));
  } catch {
    return true;
  }
  for (const probe of probes) {
    if (tests.filter((test) => test.test(probe)).length > 1) return true;
  }
  return false;
}

/**
 * What a sequence of atoms can start with, and whether it can match nothing.
 *
 * @param {Atom[]} sequence
 * @returns {{ first: string, empty: boolean }}
 */
function lead(sequence) {
  const firsts = [NONE];
  for (const a of sequence) {
    firsts.push(a.first);
    if (!a.empty) return { first: firsts.join("|"), empty: false };
  }
  return { first: firsts.join("|"), empty: true };
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
  const probes = new Set(`${source}\u00a0\u2028\ufeff`);
  for (let code = 0; code < 128; code += 1) probes.add(String.fromCharCode(code));

  /** @returns {Atom[]} */
  const current = () => {
    const frame = stack[stack.length - 1];
    return frame.alternatives[frame.alternatives.length - 1];
  };
  /** A zero-width atom: an anchor, a word boundary, a lookaround. @returns {Atom} */
  const zero = () => Object.assign(atom(NONE), { zeroWidth: true, empty: true });

  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") {
      const end = escapeEnd(source, i);
      current().push("bB".includes(source[i + 1]) ? zero() : atom(source.slice(i, end)));
      i = end;
    } else if (c === "[") {
      let j = i + 1;
      while (j < source.length && source[j] !== "]") j = source[j] === "\\" ? j + 2 : j + 1;
      current().push(atom(source.slice(i, j + 1)));
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
      const leads = frame.alternatives.map(lead);
      const group = frame.zeroWidth ? zero() : atom(leads.map((l) => l.first).join("|"));
      group.empty ||= leads.some((l) => l.empty);
      group.ambiguous = leads.length > 1 && overlap(leads.map((l) => l.first), probes);
      for (const alternative of frame.alternatives) {
        if (alternative.some((a) => a.unbounded || a.innerUnbounded)) group.innerUnbounded = true;
        if (alternative.some((a) => a.ambiguous)) group.ambiguous = true;
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
      current().push(zero());
      i += 1;
    } else {
      const q = quantifierAt(source, i);
      const list = current();
      const target = list[list.length - 1];
      if (q && target) {
        target.min = target.min * q.min;
        target.unbounded = q.max === Infinity;
        target.wide = q.max > 1;
        target.flex = target.wide && q.max > q.min;
        if (q.min === 0) target.empty = true;
        // A lookaround matches once however it is quantified: no risk there.
        if (!target.zeroWidth && target.innerUnbounded && target.wide) nested = true;
        if (!target.zeroWidth && q.max > LIMIT && (target.innerSole || target.ambiguous)) catastrophic = true;
        i = q.end;
      } else {
        current().push(atom(c));
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
  return `${what} repeats a group that can match the same text more than one way, ` +
    "like (a+)+ or (a|a)+, and can backtrack catastrophically.";
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
