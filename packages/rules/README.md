# `@faqir-ui/rules`

Zero-dependency, isomorphic form rules. A **definition** says what a form's data
must look like; `validate` turns data into a **verdict**. Nothing in this package
imports anything outside it or touches a DOM, a filesystem or a process, so the
same definition means the same thing in the page, in a worker, on a server and
in an agent sandbox — which is the point, because the `faqir-rules` plugin
enforces it in the browser and your handler re-checks it before writing anything
down.

```js
import { coerce, validate } from "@faqir-ui/rules";

const definition = {
  version: "1",
  fields: {
    email: { type: "string", format: "email", required: true },
    age: { type: "integer", minimum: 18 },
  },
};

const data = coerce(definition, Object.fromEntries(new FormData(form)));
const { valid, findings } = validate(definition, data);
// findings → [{ path: "age", rule: "minimum", message: "Value is too small.", params: { limit: 18 } }]
```

A definition has two halves. **Fields** say what each value must look like, on
its own. **Rules** say everything that depends on the other fields — what is on
screen, what is required today, what agrees with what, what is derived, and
which page comes next. Both halves answer into one verdict.

## The definition

```js
{
  version: "1",                          // optional; "1" is the only value
  fields: { "<path>": <field schema> },  // dotted paths: "a.b", "rows[0].qty"
  required: ["<path>"],                  // optional alternative to required: true
  messages: { en: { "<key>": "…" } },    // optional
  defaultLocale: "en",                   // optional
  rules: [ <rule>, … ],                  // optional; the verbs, below
  rules: [ … ],                          // accepted, ignored until 1.1B-02
}
```

Anything else is a **definition error** — a thrown `DefinitionError` naming the
offending key and where it sits. That is deliberate and it applies to field
keywords too: a misspelled `maxlength` throws rather than doing nothing, because
a constraint that silently disappears is the worst failure a validator has.

## Field schemas

The JSON Schema 2020-12 subset below, plus one piece of Faqir sugar —
`required: true` on the field itself.

| Type | Keywords |
| --- | --- |
| every type | `type`, `title`, `description`, `required`, `enum`, `const` |
| `string` | `pattern`, `format`, `minLength`, `maxLength` |
| `number`, `integer` | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` |
| `boolean` | — |
| `object` | `properties`, `required: [names]` |
| `array` | `items`, `minItems`, `maxItems`, `uniqueItems` |

Notes that are easier to state than to discover:

- **Requiredness** has three spellings, all equivalent: `required: true` on a
  field, a top-level `required: ["path"]` array, and an object field's
  `required: ["child"]`. On an object, `required: true` means *the object* is
  required; to say both, mark the children individually.
- **Blank** means absent: `undefined`, `null`, `""`, and `[]` (a checkbox group
  with nothing ticked). `false` and `0` are values, not blanks. A blank optional
  field is skipped entirely — no `minLength` finding on an empty box.
- **A type finding stops there.** `minLength` on a number answers a question
  nobody asked, so the other constraints are not run for that value.
- **Lengths count code points**, so `"🙂"` fits a `maxLength` of 1.
- **`multipleOf` tolerates binary floating point** — `0.3` is three `0.1`s.
- **Equality is by value** for `enum`, `const` and `uniqueItems`: object key
  order does not matter.
- **`pattern` is unanchored** unless you anchor it, and is capped at 1000
  characters (`MAX_PATTERN_LENGTH`).

## Verdict

```js
{
  valid: boolean,                        // no findings, and nothing left to check
  findings: [{ path, rule, message, params }],
  computed: { "<path>": value },         // what the `compute` verbs produced
  visible:  { "<path>": boolean },       // what the `show` verbs decided
  required: { "<path>": boolean },       // what the `require` verbs decided
  next:     { "<fromPage>": "<toPage>" },// what the `jump` verbs decided
  pending:  ["<ruleId>"],                // remote rules that have not run
}
```

The four maps hold only what a rule decided: a path no rule mentions is absent
from `visible` and `required`, because the definition already says whether it is
required and nothing ever hid it.

Findings come out in definition order — the insertion order of `fields`, then of
each object's `properties`, then array index — and within one value in the fixed
order of `SHAPE_RULES`. The order is part of the contract: the plugin focuses the
first offender, so "first" has to mean the same thing everywhere.

`params` says what the rule was checking against (`{ limit: 3, actual: 1 }`,
`{ format: "email" }`), which is what a custom message interpolates and what a
UI needs to render a hint without re-reading the definition.

## Formats

`email`, `uri`, `date`, `time`, `date-time`, `phone`, `iban`, `uuid`,
`postal-code`.

These are *form* formats, not RFC conformance suites: reject what is plainly
wrong, never reject what a real registrar, postal service or phone network would
accept. `date` is calendar-checked (`2025-02-29` is not a date), `iban` runs the
ISO 7064 mod-97 check, `phone` is E.164-lenient (separators allowed, 7–15
digits), and `postal-code` is deliberately country-agnostic.

Add your own — a national ID, an internal ticket shape — with
`registerFormat(name, value => boolean)`. It is process-global on purpose: a
definition naming `format: "nino"` has to mean the same thing on both sides of
the wire.

## Messages

A finding's sentence is resolved through:

1. `messages[locale]`
2. `messages[defaultLocale]`
3. the built-in English default for the rule
4. the rule name itself

and within each `messages[…]` layer, `"<path>.<rule>"` is tried before
`"<rule>"` — so one field's wording can be special without restating the other
twenty.

```js
messages: {
  en: {
    required: "Don't leave this empty.",
    "email.required": "We need an address to reply to.",
    minLength: "Use at least {limit} characters — you typed {actual}.",
  },
}
```

`{name}` placeholders are filled from the finding's `params`, plus `{path}` and
`{title}`. A placeholder nothing fills is left standing rather than blanked, so a
typo in a message is visible instead of invisible.

The built-in English defaults (`DEFAULT_MESSAGES`) are the same sentences the
`faqir-validate` plugin shows for the equivalent `ValidityState` flag. A field
checked natively in the browser and re-checked on a server must not disagree
about its own wording; a test in this package fails if the two tables drift.

## Rules

Every rule carries an `id` — unique in the definition, the `rule` a finding
reports under, and the key a message is addressed to — and exactly one verb.

| Verb | Shape | What it does |
| --- | --- | --- |
| `show` | `{ id, show: "<path>", when }` | the field is on screen only while `when` holds |
| `require` | `{ id, require: "<path>", when }` | the field must be filled in while `when` holds |
| `validate` | `{ id, validate: <logic>, path, message }` | a finding on `path` when the logic is falsy |
| `validate` (remote) | `{ id, validate: "remote", path, remote, message }` | asks the server; see below |
| `compute` | `{ id, compute: "<path>", value: <logic> }` | a derived value |
| `jump` | `{ id, jump: "<toPage>", from: "<fromPage>", when }` | a wizard's next page |

```js
rules: [
  { id: "vat-for-companies", show: "vat", when: { "==": [{ var: "kind" }, "company"] } },
  { id: "vat-required", require: "vat", when: { "==": [{ var: "kind" }, "company"] } },
  { id: "total", compute: "total", value: { "*": [{ var: "qty" }, { var: "price" }] } },
  { id: "under-limit", validate: { "<=": [{ var: "total" }, 900] }, path: "total",
    message: "This order is over your credit limit." },
  { id: "to-approval", jump: "approval", from: "cart", when: { ">": [{ var: "total" }, 500] } },
]
```

**The order a pass runs in**

1. `compute`, in dependency order — the graph comes from the literal `var`
   paths, and a cycle is a `DefinitionError`. Each value is written into the
   data the rest of the pass reads, so a computed total can be validated and can
   drive a `show`. The caller's data is never mutated.
2. `show`, then `require`. Several `show` rules on one path **AND** together
   (any of them may hide it); several `require` rules **OR** (any may demand
   it). A hidden field is never required.
3. Shape validation, over the computed data, with the requiredness step 2
   decided folded in.
4. Findings about a hidden field — and about anything nested inside it — are
   dropped. A field nobody can see cannot be wrong.
5. `validate` rules, in document order, appended after the shape findings.
6. `jump`: the first rule whose `when` holds wins for a given `from`; a rule
   with no `when` is that page's default.

A cross-field `validate` rule is **skipped while its own field is blank** — "is
the end date after the start date" has no answer without an end date, and
`required` is the rule that should be complaining. A rule whose `path` is not a
declared field (a form-level check, a section) always runs; nothing else is
speaking for it.

A rule that quietly does nothing is the failure this package refuses to have, so
a missing `id`, a duplicate one, two verbs in one rule, a `show` with no `when`,
an unknown key, a `require` on a path that is not a declared field and a compute
cycle are each a `DefinitionError`, thrown when the definition is read.

### Messages for a rule

A cross-field finding reports under the rule's `id`, so its sentence resolves
through the same chain with `id` in place of the constraint name:
`messages[locale]["<path>.<id>"]` → `messages[locale]["<id>"]` → the same two in
`defaultLocale` → the rule's own `message` → `"Please check this value."`

### Remote rules

`{ validate: "remote" }` needs the network, which this package never touches.
Such a rule runs only through `validateAsync`:

```js
const verdict = await validateAsync(definition, data, {
  remote: async (rule, value, data) => {
    const response = await fetch(`${rule.remote}?q=${encodeURIComponent(String(value))}`);
    return response.ok ? true : "That address is already registered.";
  },
});
```

The resolver answers `true` (pass), `false` (fail with the rule's message), or a
string (fail with that sentence) — or a promise of one of those. A rejection, or
anything else, is a finding under `remote-error`: **a check that could not run
never passes.** Resolvers run concurrently and the findings still come out in
rule order, so two runs over the same data read the same.

Sync `validate` cannot run them and does not pretend to: their ids come back in
`pending`, and a verdict with anything pending is not `valid`. That is the
difference between "this data is good" and "nothing has told me it is bad yet".
`validateAsync` throws if a definition has remote rules and no resolver was
given.

## Logic

Conditions and computed values are **JSONLogic**: a literal, an array, or a
one-key `{ "<op>": <args> }` object. The implemented subset:

| Family | Operators |
| --- | --- |
| data | `var`, `missing`, `missing_some` |
| logic | `if`, `and`, `or`, `!`, `!!` |
| compare | `==`, `===`, `!=`, `!==`, `<`, `<=`, `>`, `>=` (3-ary is `between`) |
| arithmetic | `+`, `-`, `*`, `/`, `%`, `min`, `max` |
| string | `cat`, `substr`, `in` |
| arrays | `some`, `all`, `none` |
| Faqir | `date`, `regex` |

Anything else — `map`, `filter`, `reduce`, `merge`, a typo — is a
`DefinitionError` naming the operator. There is no "unknown operators evaluate
to null" mode, because a condition that answers `null` is a field that silently
stays hidden.

Semantics are the reference implementation's, vendored vectors and all
(`tests/vendor/jsonlogic-tests.json`), including the parts that surprise:

- **truthiness** is JavaScript's, except that an empty array is falsy — so
  `{ "missing": [...] }`, which answers with a list, drops straight into `if`;
- `and`/`or` answer with the deciding *value*, not with a boolean;
- `==` is loose and `===` is strict, so `{ "==": [1, "1"] }` is true — which is
  what form data needs, and why `===` is there for when it is not;
- arithmetic coerces with `parseFloat`: `{ "+": ["1", 1] }` is 2;
- `all` over an empty array is **false**; `none` over an empty array is true.

The two Faqir operators:

```js
{ "date": ["2026-01-01", "<=", { "var": "start" }] }   // ==, !=, <, <=, >, >=
{ "regex": ["^[A-Z]{2}\\d{3}$", { "var": "code" }] }
```

`date` parses ISO 8601 itself rather than calling `Date.parse`, and reads a
date-time with no zone as **UTC** — otherwise the same rule would answer
differently on a laptop in Berlin and on the server that re-checks it. A value
that is not a parseable instant makes the comparison `false`.

`regex` takes a *literal* pattern, compiled and bounded when the definition is
read, and answers `false` for a non-string subject or one longer than
`MAX_REGEX_SUBJECT_LENGTH`. A definition is often user-supplied data one layer
up, so an expression is also refused for exceeding `MAX_LOGIC_NODES` (1000) or
`MAX_LOGIC_DEPTH` (64) — checked while it is walked, so an oversized expression
is never evaluated.

## Coercion

A form produces strings. `coerce(definition, rawData)` turns them into the types
the definition declares, so the browser and a server reading `FormData` hand
`validate` identical data. Two things happen, in order:

1. **Un-flattening.** HTML `name` attributes are flat and dotted —
   `address.geo.lat`, `contacts[0].name` is what `@faqir-ui/forms` emits — so a
   key whose first segment names a declared field is written into its nested
   position. Keys the definition knows nothing about are carried through
   untouched: coercion narrows types, it never drops data.
2. **Typing.** Numeric strings become numbers; `"on"`, `"true"`, `"yes"`, `"1"`
   become `true` and `"off"`, `"false"`, `"no"`, `"0"` become `false`; a lone
   value for an array field becomes a one-item list; a blank or whitespace-only
   entry becomes *absent*, so an empty required box reports `required` rather
   than a type error about `""`.

A string that is not a number is left alone rather than turned into `NaN`, so
the verdict names the field. A `string` field keeps its value verbatim — no
silent trimming, because a passphrase may legitimately contain spaces.

`coerce` is a fixed point: running it twice changes nothing.

## API

| Export | What it is |
| --- | --- |
| `validate(def, data, { locale })` | the verdict; remote rules land in `pending` |
| `validateAsync(def, data, { locale, remote })` | the same, with the remote rules resolved |
| `evaluate(def, data)` | `{ visible, required, computed, next }` — the verbs, nothing validated |
| `evaluateLogic(expr, data)` | one JSONLogic expression |
| `coerce(def, rawData)` | form strings → declared types |
| `compile(def)` | pre-compiled definition; idempotent, pass it to `validate` in a hot path |
| `DefinitionError` | thrown for a bad *definition*; bad *data* produces findings |
| `registerFormat`, `hasFormat`, `formatNames`, `checkFormat`, `BUILT_IN_FORMATS` | the format registry |
| `resolveMessage`, `interpolate`, `DEFAULT_MESSAGES`, `RULE_MESSAGES`, `DEFAULT_LOCALE`, `SHAPE_RULES` | the message layer |
| `truthy`, `parseInstant`, `LOGIC_OPS`, `DATE_COMPARATORS`, `RULE_VERBS`, `REMOTE` | the logic vocabulary |
| `DEFINITION_VERSION`, `MAX_PATTERN_LENGTH`, `MAX_LOGIC_NODES`, `MAX_LOGIC_DEPTH`, `MAX_REGEX_SUBJECT_LENGTH` | the limits above, as values |

## Tests

`tests/golden/` is the corpus: 136 authored cases, each a definition, its
data and the exact verdict expected down to the sentence and the params. Nothing
in it is captured from the implementation, so a behaviour change shows up as a
diff against an intention. `tests/isomorphic.test.ts` replays the whole corpus in
two realms — this process with happy-dom registered, and a bare `bun` child with
no DOM and a different `TZ` — and requires identical output, case by case; the
time zone is what proves `date` is not reading the host's clock settings.

`tests/vendor/jsonlogic-tests.json` is the public JSONLogic conformance suite,
vendored. Every vector built on an implemented operator must produce the
expected value, and every vector naming one this package does not implement must
be refused with an error that names it.
