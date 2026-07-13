# `@faqir-ui/forms`

Zero-dependency, isomorphic JSON Schema to Faqir HTML rendering. `renderForm`
only builds strings: it imports nothing and does not access a filesystem, DOM, or
runtime-specific global.

```js
import { renderForm } from "@faqir-ui/forms";

const html = renderForm(jsonSchema, uiSchema, { idPrefix: "signup" });
```

The emitted form uses `l-validate` and the normalized `field-group` contract. A
served page needs `faqir-core.js` and `faqir-validate.js`; date fields also use the
date-picker and calendar controllers already assembled into Faqir core. The HTML
contains a machine-readable `@ui:requires` comment so page assemblers can retain
those runtime requirements.

## Scalar mapping

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
| `boolean` | checkbox |

The default radio cardinality threshold is **4** and is exported as
`DEFAULT_RADIO_THRESHOLD`. Set `opts.radioThreshold` to change it, or force one
enum field with `widget: "radio"` / `widget: "select"` in its UI schema.

```js
const uiSchema = {
  biography: { "ui:widget": "textarea", "ui:rows": 6 },
  plan: { widget: "radio" },
  notifications: { widget: "switch" },
};
```

Both the terse keys and their `ui:*` aliases are accepted. Supported UI keys are
`widget`, `placeholder`, `rows`, and `enumLabels`. Providing conflicting aliases
throws.

Numeric `minimum`/`maximum` become `min`/`max`. Standard JSON Schema
`multipleOf` becomes `step`; the HTML-oriented `step` alias is also accepted,
but the two cannot be combined. String `minLength`, `maxLength`, and `pattern`
map to their native constraints.

Every field receives a deterministic label/control ID pair, an always-present
error part for `faqir-validate`, description/error `aria-describedby` wiring, and
`required` + `aria-required` when named by the root schema's `required` array.
Schema text and attribute values are HTML-escaped.

## Supported subset is strict

This release accepts an object root containing scalar `properties`. Nested
objects, arrays, unions, conditional/composition keywords, unknown formats,
unknown UI keys, and incompatible widgets throw a path-specific error. Nothing
unsupported is silently skipped; composite schema support belongs to the next
forms milestone.
