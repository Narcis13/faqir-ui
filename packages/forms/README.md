# `@faqir-ui/forms`

Zero-dependency, isomorphic JSON Schema to Faqir HTML rendering. `renderForm`
only builds strings: it imports nothing and does not access a filesystem, DOM, or
runtime-specific global.

```js
import { renderForm } from "@faqir-ui/forms";

const html = renderForm(jsonSchema, uiSchema, { idPrefix: "signup" });
```

The emitted form uses `l-validate` and the normalized `field-group` contract,
and always carries `l-data` so faqir-core adopts it as a scope root with no
wrapper markup required. A served page needs `faqir-core.js` and
`faqir-validate.js` only — no `@faqir-ui/forms` in the browser; date fields also
use the date-picker and calendar controllers already assembled into Faqir core.
The HTML contains a machine-readable `@ui:requires` comment so page assemblers
can retain those runtime requirements.

## Widget mapping (§7.2)

| JSON Schema | Default Faqir widget |
| --- | --- |
| `string` | `input[type=text]` |
| `string` + `format: "email"` | `input[type=email]` |
| `string` + `format: "uri"` | `input[type=url]` |
| `string` + `format: "date"` | `date-picker` + `calendar` |
| `string` + `enum` (1–4 values) | radio group |
| `string` + `enum` (5+ values) | select |
| `number` | `input[type=number]` |
| `integer` | `input[type=number][step=1]` |
| `boolean` | checkbox (or `switch` via uiSchema) |
| `object` (nested) | fieldset card (`card` + `legend`), children recurse |
| `array` of `enum` (1–4 values) | checkbox group |
| `array` of `enum` (5+ values) | multi-select (`select[multiple]`) |
| `array` of `object` | repeatable group (`l-data` + keyed `l-for`, add/remove buttons) |
| uiSchema `ui:groups` | layout groups (fieldset cards, names unchanged) |
| uiSchema `ui:wizard` | multi-step wizard (stepper + card panels + Back/Next/Submit) |

The default cardinality threshold is **4** — shared by single enums
(radio vs select) and enum arrays (checkbox group vs multi-select) — and is
exported as `DEFAULT_RADIO_THRESHOLD`. Set `opts.radioThreshold` to change it,
or force one field via its UI schema `widget` (`"radio"`, `"select"`,
`"checkbox-group"`, `"multi-select"`, …). The mapping table above is mirrored
row-for-row by a checklist in `tests/forms.test.ts`.

## UI schema

```js
const uiSchema = {
  biography: { "ui:widget": "textarea", "ui:rows": 6 },
  plan: { widget: "radio" },
  notifications: { widget: "switch" },
  address: { street: { placeholder: "Street & number" } },   // mirrors the schema
  medications: {                                             // repeatable group
    addLabel: "Add medication",
    removeLabel: "Remove",
    items: { name: { placeholder: "e.g. Aspirin" } },
  },
};
```

Both the terse keys and their `ui:*` aliases are accepted; providing
conflicting aliases throws. Nested-object UI schemas mirror the schema
structure (child name → child UI). Repeatable groups take `items` (per-row
UI), `addLabel`, and `removeLabel`.

### Layout groups and wizard

Reserved root keys arrange the top-level fields (each property must appear
exactly once; combining both throws):

```js
const uiSchema = {
  "ui:groups": [
    { title: "Identity", description: "Who you are.", fields: ["fullName", "email"] },
    { title: "Preferences", fields: ["newsletter"] },
  ],
};

const uiSchema = {
  "ui:wizard": {
    label: "Signup steps",
    steps: [
      { title: "Profile", fields: ["fullName", "email"] },
      { title: "Plan", fields: ["plan"] },
    ],
  },
};
```

The wizard output stubs the 0.6-14 `wizard` pattern contract: a `stepper`,
one `card` panel per step, and Back/Next/Submit buttons, driven by an `l-data`
`{ step }` scope. Panel visibility and step states are binding-owned
(`:hidden`, `:data-state`); inactive steps' controls are `:disabled`-gated, so
`faqir-validate` validates exactly the active step before each advance — the
Next button is a submit, and the `l-validate` on-valid hook advances or, on the
final step, marks the form `data-state="submitted"`. Zero custom JS.

## Repeatable groups

Arrays of objects render one fieldset card whose rows are a keyed
`<template l-for>` over reactive state on the form's `l-data` scope. Add and
remove buttons mutate that array (`push`/`splice`); keyed reconciliation
preserves each surviving row's DOM state. Rows start at `max(minItems, 1)`;
remove disables at `minItems`, add disables at `maxItems`. Inside the template
each field carries static ids/names (deterministic, audit-clean) plus `:id` /
`:for` / `:name` / `:aria-describedby` bindings that derive row-unique values
from the row key and index at runtime. Row fields are scalars only; row enums
always render as selects.

Numeric `minimum`/`maximum` become `min`/`max`. Standard JSON Schema
`multipleOf` becomes `step`; the HTML-oriented `step` alias is also accepted,
but the two cannot be combined. String `minLength`, `maxLength`, and `pattern`
map to their native constraints.

Every field receives a deterministic label/control ID pair, an always-present
error part for `faqir-validate`, description/error `aria-describedby` wiring, and
`required` + `aria-required` when named by its level's `required` array.
Schema text and attribute values are HTML-escaped. A required checkbox group
renders the required marker only — group-level minimum selection is not
natively enforceable (multi-select `required` is native).

## Supported subset is strict

The root is an object whose properties are scalars, nested objects, enum
arrays (`items.enum` strings, optional `uniqueItems: true` and `default`), or
repeatable object arrays (scalar rows, `minItems`/`maxItems`). Unions,
conditional/composition keywords, unknown formats, unknown UI keys,
incompatible widgets, malformed group/wizard field partitions, and
expression-unsafe repeatable-row names throw a path-specific error. Nothing
unsupported is silently skipped.
