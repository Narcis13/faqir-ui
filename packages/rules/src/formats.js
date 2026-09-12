/**
 * @faqir-ui/rules — the `format` registry. [1.1B-01 · §8.2]
 *
 * A leaf module: imports nothing, reads no host global, allocates no regex at
 * call time. Every checker takes the already-type-checked string and returns a
 * boolean; none of them throws.
 *
 * These are **form** formats, not RFC conformance suites. The bar is the one a
 * person filling in a field would recognise: reject what is plainly wrong,
 * never reject something a real registrar, postal service or phone network
 * would accept. Where a spec is stricter than practice (RFC 3339 demanding a
 * UTC offset on every time, RFC 5321 permitting `user@localhost`) the comment
 * on the checker says which way it leans and why.
 *
 * `registerFormat(name, fn)` adds a platform-specific one — a national ID, an
 * internal ticket shape. It is the only mutable state in the package, so it is
 * process-global on purpose: a definition naming `format: "nino"` must mean the
 * same thing in the browser plugin and on the server, and the registration is
 * what the host does to make that true.
 */

/** `YYYY-MM-DD`, calendar-checked (2026-02-30 is not a date). */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** `HH:MM`, `HH:MM:SS`, optional fraction, optional `Z`/`±HH:MM` offset. */
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/i;
/** Any UUID version, plus the nil UUID. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A scheme, then anything without whitespace or control characters. */
const URI_RE = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s\x00-\x1f]+$/;
/** One `@`, no whitespace, and a dotted domain with a ≥2-char final label. */
const EMAIL_RE = /^[^\s@,;<>()[\]\\"]+@[^\s@.,;<>()[\]\\"]+(?:\.[^\s@.,;<>()[\]\\"]+)*\.[A-Za-z]{2,}$/;
/** E.164-lenient: optional `+`, human separators allowed, 7–15 digits. */
const PHONE_SHAPE_RE = /^\+?[0-9 ().-]{6,24}$/;
/** Country-agnostic postal code: alphanumerics with inner spaces or hyphens. */
const POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,10}[A-Za-z0-9]$/;
/** IBAN registry shape: 2 letters, 2 check digits, then 11–30 alphanumerics. */
const IBAN_SHAPE_RE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** @param {number} year */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** @param {string} value */
function isDate(value) {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const limit = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day <= limit;
}

/** @param {string} value */
function isTime(value) {
  const m = TIME_RE.exec(value);
  if (!m) return false;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  // 60 is allowed in the seconds slot: a leap second is a real wall-clock time.
  const second = m[3] === undefined ? 0 : Number(m[3]);
  return hour <= 23 && minute <= 59 && second <= 60;
}

/**
 * `<date>T<time>`. A lowercase `t` and a space separator are both accepted —
 * RFC 3339 §5.6 permits them, and a `datetime-local` input emits no offset at
 * all, so requiring one would reject the platform's own control.
 * @param {string} value
 */
function isDateTime(value) {
  const split = /^(.+?)[Tt ](.+)$/.exec(value);
  if (!split) return false;
  return isDate(split[1]) && isTime(split[2]);
}

/**
 * E.164-lenient. The separators people type — spaces, dashes, dots, brackets —
 * are allowed and ignored; what is checked is that 7 to 15 digits remain, which
 * is E.164's own range (§6.2.1: a subscriber number is at most 15 digits, and
 * no national numbering plan has fewer than 7 including the country code).
 * @param {string} value
 */
function isPhone(value) {
  if (!PHONE_SHAPE_RE.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * ISO 13616 IBAN: shape, then the ISO 7064 MOD-97-10 check.
 *
 * The remainder is taken in chunks rather than on one huge integer, because the
 * expanded numeric string runs to 40+ digits — past `Number.MAX_SAFE_INTEGER`
 * — and BigInt is not available on every runtime this package promises to run
 * on. Nine digits at a time keeps every intermediate under 2^53.
 * @param {string} value
 */
function isIban(value) {
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  if (!IBAN_SHAPE_RE.test(compact)) return false;

  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let expanded = "";
  for (const ch of rearranged) {
    expanded += ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
  }

  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    remainder = Number(String(remainder) + expanded.slice(i, i + 7)) % 97;
  }
  return remainder === 1;
}

/**
 * Country-agnostic and deliberately lenient: 2–12 characters of letters and
 * digits, with single spaces or hyphens allowed between them. It accepts
 * `10115`, `SW1A 1AA`, `K1A 0B1` and `1234 AB`; it rejects empty strings,
 * punctuation and anything long enough to be a street address. A country-exact
 * check is a `registerFormat` away — it needs a country, which a lone field
 * value does not carry.
 * @param {string} value
 */
function isPostalCode(value) {
  if (value.length < 2 || value.length > 12) return false;
  if (!POSTAL_RE.test(value)) return false;
  return !/[ -]{2}/.test(value);
}

/** The built-in checkers. Extended, never replaced, by `registerFormat`. */
const registry = new Map(/** @type {[string, (value: string) => boolean][]} */ ([
  ["email", (value) => EMAIL_RE.test(value) && value.length <= 254],
  ["uri", (value) => URI_RE.test(value)],
  ["date", isDate],
  ["time", isTime],
  ["date-time", isDateTime],
  ["phone", isPhone],
  ["iban", isIban],
  ["uuid", (value) => UUID_RE.test(value)],
  ["postal-code", isPostalCode],
]));

/** The names that shipped with the package, for docs and error messages. */
export const BUILT_IN_FORMATS = Object.freeze([...registry.keys()]);

/**
 * Register a checker, or override a built-in one.
 *
 * @param {string} name the `format` value a field schema will name
 * @param {(value: string) => boolean} check called with a string; must not throw
 * @returns {void}
 */
export function registerFormat(name, check) {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("@faqir-ui/rules: registerFormat(name, check) needs a non-empty name.");
  }
  if (typeof check !== "function") {
    throw new TypeError(`@faqir-ui/rules: registerFormat("${name}", check) needs a function.`);
  }
  registry.set(name, check);
}

/** Whether `name` names a known format. @param {string} name */
export function hasFormat(name) {
  return registry.has(name);
}

/** Every registered format name, sorted, for error messages. */
export function formatNames() {
  return [...registry.keys()].sort();
}

/**
 * Run a format checker. Unknown names return `true` — the caller
 * (`shape.js`) rejects those as *definition* errors before any data is seen,
 * so reaching here with one would mean the definition was never compiled.
 *
 * @param {string} name
 * @param {string} value
 * @returns {boolean}
 */
export function checkFormat(name, value) {
  const check = registry.get(name);
  if (!check) return true;
  return check(value) === true;
}
