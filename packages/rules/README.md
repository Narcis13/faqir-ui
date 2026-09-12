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

This release ships the **shape** half. `rules` is accepted in a definition and
ignored; 1.1B-02 gives its verbs meaning and fills the verdict's `visible`,
`required` and `computed` maps, which are present and empty here so consumers
can be written against the final shape today.

## The definition

```js
{
  version: "1",                          // optional; "1" is the only value
  fields: { "<path>": <field schema> },  // dotted paths: "a.b", "rows[0].qty"
  required: ["<path>"],                  // optional alternative to required: true
  messages: { en: { "<key>": "…" } },    // optional
  defaultLocale: "en",                   // optional
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
  valid: boolean,
  findings: [{ path, rule, message, params }],
  computed: {},   // 1.1B-02
  visible: {},    // 1.1B-02
  required: {},   // 1.1B-02
}
```

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
| `validate(def, data, { locale })` | the verdict |
| `coerce(def, rawData)` | form strings → declared types |
| `compile(def)` | pre-compiled definition; idempotent, pass it to `validate` in a hot path |
| `DefinitionError` | thrown for a bad *definition*; bad *data* produces findings |
| `registerFormat`, `hasFormat`, `formatNames`, `checkFormat`, `BUILT_IN_FORMATS` | the format registry |
| `resolveMessage`, `interpolate`, `DEFAULT_MESSAGES`, `DEFAULT_LOCALE`, `SHAPE_RULES` | the message layer |
| `DEFINITION_VERSION`, `MAX_PATTERN_LENGTH` | the limits above, as values |

## Tests

`tests/golden/` is the corpus: 90-odd authored cases, each a definition, its
data and the exact verdict expected down to the sentence and the params. Nothing
in it is captured from the implementation, so a behaviour change shows up as a
diff against an intention. `tests/isomorphic.test.ts` replays the whole corpus in
two realms — this process with happy-dom registered, and a bare `bun` child with
no DOM — and requires identical output, case by case.
