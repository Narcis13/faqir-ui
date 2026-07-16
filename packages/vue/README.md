# @faqir-ui/vue

Vue 3 bindings for [Faqir UI](https://github.com/Narcis13/faqir-ui). Every
component in `src/components/` is **generated from its registry manifest** by
`faqir bindings vue` — the only hand-written code is `src/runtime.ts`
(~130 lines). Bindings are glue, not forks (FAQIR-NEXT §11.1): a CI drift gate
regenerates on every push and fails on any byte of difference, so the
components cannot drift from the manifests.

This package ships **no CSS**. Style with the Faqir bundle your project
already uses — either your project's `faqir bundle` output or
`@faqir-ui/core/dist/faqir.{theme}.css`.

## Usage

```vue
<script setup lang="ts">
import { LButton, LCard, LFieldGroup } from "@faqir-ui/vue";
</script>

<template>
  <LCard>
    <template #title>Sign in</template>
    <template #body>
      <LFieldGroup :invalid="hasError">
        <template #label>Email</template>
        <template #input><input data-ui="input" type="email" /></template>
        <template #error>Email is required.</template>
      </LFieldGroup>
    </template>
    <template #footer>
      <LButton variant="primary" size="lg" :loading="saving">Save</LButton>
    </template>
  </LCard>
</template>
```

## Generation contract

Derived deterministically from each primitive's manifest
(`src/bindings/ir.ts` in the CLI repo is the authoritative spec):

- **Root** — the manifest anatomy tag carrying `data-ui="<name>"`. All
  non-prop attributes fall through to it (`<LInput type="email">`).
- **Variants → typed props.** Prop name is the attribute minus `data-`
  (`data-variant` → `variant`), typed as the literal union of manifest values.
  Reserved names get a suffix (`data-style` → `styleVariant`). The attribute
  is written only when the prop is set — defaults stay attribute-free, per
  registry convention.
- **States → boolean props.** `data-state="loading"` states write that value
  (first truthy state wins); bare attributes (`disabled`, `open`, `checked`)
  render as boolean attributes; bare `aria-*` states always render
  `"true"`/`"false"` (`<LToggle :pressed>` → `aria-pressed`). States applied
  to a named part (e.g. stepper's `active`) belong to your slot content, not
  to props.
- **Slots ↔ `data-part`.** Each manifest slot is a named Vue slot projected
  inside `<tag_hint data-part="name">`; required slots always render their
  wrapper. Slots whose hint is a void element (avatar's `image`) render your
  content as-is — you supply the `data-part` element. Content models
  `inline`/`text`/`block` add a trailing default slot; void roots (`input`,
  `hr`) render no children.

No faqir-core directives run inside Vue — the host framework owns reactivity
(§11.1). Recipe components (dialog, tabs, …) with controller lifecycles land
in task 0.6-13.

## Regenerating

```sh
faqir bindings vue          # rewrite src/components/ + src/index.ts
faqir bindings vue --check  # drift guard (CI runs this)
```
