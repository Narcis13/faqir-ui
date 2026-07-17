# @faqir-ui/vue

Vue 3 bindings for [Faqir UI](https://github.com/Narcis13/faqir-ui). Every
component in `src/components/` (primitives) and `src/recipes/` (interactive
recipes with controllers) is **generated from its registry manifest** by
`faqir bindings vue`; recipe controllers in `src/controllers/` are vendored
verbatim from the registry. The only hand-written code is `src/runtime.ts`
and `src/recipe-runtime.ts` (~150 lines each). Bindings are glue, not forks
(FAQIR-NEXT §11.1): a CI drift gate regenerates on every push and fails on
any byte of difference, so the components cannot drift from the manifests.

Requires Vue **3.5+** (recipe wrappers use `useId` for SSR-stable ids).

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
(§11.1).

## Recipes (dialog, tabs, toast, …)

Every registry recipe is wrapped as a typed component that renders the
manifest's reference markup and attaches the recipe's own controller:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { LButton, LDialog } from "@faqir-ui/vue";

const dialog = ref<InstanceType<typeof LDialog>>();
function onConfirm(detail: { variant: string }, event: Event) {
  // event.preventDefault() keeps the dialog open for async work
}
</script>

<template>
  <LButton variant="primary" @click="dialog!.open()">Save</LButton>

  <LDialog ref="dialog" size="sm" tone="danger" @confirm="onConfirm">
    <template #title>Are you sure?</template>
    <template #body>This cannot be undone.</template>
    <template #footer><LButton variant="outline">Cancel</LButton></template>
  </LDialog>
</template>
```

The recipe generation contract (`src/bindings/recipe-ir.ts` in the CLI repo
is the authoritative spec):

- **Markup** — the manifest reference template, verbatim: `role`/`aria-*`
  wiring, `data-state` defaults, and `hidden` FOUC guards all render exactly
  as the registry ships them. `l-*` directives are stripped.
- **Lifecycle** — the vendored controller attaches in `onMounted` and is
  destroyed in `onBeforeUnmount`; nothing runs at render time.
- **Exposed API** — the controller's `@ui:provides` methods are exposed on
  the component ref: `dialog.value.open()`, `tabs.value.activate(1)`,
  `toast.value.add({ message })`.
- **Events** — controller `faqir:<name>` CustomEvents re-emit as Vue events
  with `(detail, event)` payloads (`@confirm`, `@cancel`, `@change`,
  `@page-change`, …). The raw event rides along so cancelable contracts
  (dialog confirm) keep working.
- **Props** — variant groups become literal-union props written onto the
  right part (`size` → `data-size` on the dialog panel); template text
  placeholders backed by manifest props become string props (`title`,
  `triggerText`); attribute-position placeholders become boolean props
  (`confirmRequired`). `id` is a prop everywhere, auto-generated per
  instance (SSR-stable) when unset.
- **Slots** — manifest parts that appear exactly once in the template are
  named slots whose content replaces the template fallback (`#title`,
  `#body`, `#footer`). The default slot replaces the entire anatomy for
  bring-your-own-markup recipes (accordion items, tab lists, select options).
- Controllers attach **once** — prop changes patch attributes but do not
  re-create the controller; use the exposed API (`setValue`, `update`,
  `setPage`) for dynamic behavior.

## SSR, Inertia, Nuxt

The wrappers are SSR-safe by construction: the server renders plain contract
HTML (it *is* plain HTML — a test suite renders every recipe with zero DOM
globals registered), controllers attach on client mount, and the template's
`hidden` attributes mean closed overlays never flash. Hydration over the
server output is warning-free for every recipe.

With **Inertia** (Laravel/Rails + Vue — Formery's stack), nothing special is
required: use `createSSRApp` in your SSR entry as usual and import Faqir CSS
globally once:

```ts
// resources/js/app.ts
import { createSSRApp, h } from "vue";
import { createInertiaApp } from "@inertiajs/vue3";
import "@faqir-ui/core/dist/faqir.default.css"; // or your project bundle

createInertiaApp({
  resolve: (name) => pages[`./Pages/${name}.vue`],
  setup({ el, App, props, plugin }) {
    createSSRApp({ render: () => h(App, props) }).use(plugin).mount(el);
  },
});
```

```ts
// ssr.ts (inertia-laravel / @inertiajs/server entry)
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
// identical setup — recipe components render inert, hidden-closed HTML here
```

Notes for SSR/Inertia apps:

- Give recipes an explicit `id` when the same component renders in different
  server/client orders (auto-ids are per-app-instance sequential).
- Controller events fire only on the client (there is no controller on the
  server); event handlers need no guards.
- On Inertia page navigations components unmount normally, so controllers
  destroy and re-attach — no leaked listeners (tested for every recipe).

## Regenerating

```sh
faqir bindings vue          # rewrite src/{components,recipes,controllers}/ + src/index.ts
faqir bindings vue --check  # drift guard (CI runs this)
```
