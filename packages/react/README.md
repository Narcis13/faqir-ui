# @faqir-ui/react

React bindings for [Faqir UI](https://github.com/Narcis13/faqir-ui). Every
component in `src/components/` (primitives) and `src/recipes/` (interactive
recipes with controllers) is **generated from its registry manifest** by
`faqir bindings react`; recipe controllers in `src/controllers/` are vendored
verbatim from the registry. The only hand-written code is `src/runtime.ts`
(primitives, ~130 lines) and `src/recipe-runtime.ts` (recipes). Bindings are
glue, not forks (FAQIR-NEXT §11.1): a CI drift gate regenerates on every push
and fails on any byte of difference, so the components cannot drift from the
manifests. The React and Vue targets share one manifest-walking core
(`src/bindings/ir.ts` + `recipe-ir.ts` in the CLI repo) — there is no forked
generation logic.

Requires React **18.2+ or 19** (recipe wrappers use `useId` for SSR-stable ids).
Primitives are **RSC-safe**: no `"use client"` directive, no hooks, no
client-only APIs — import and render them directly in a Server Component. Recipe
wrappers are the client boundary — each carries `"use client"` because it uses
hooks to attach its controller.

This package ships **no CSS**. Style with the Faqir bundle your project already
uses — either your project's `faqir bundle` output or
`@faqir-ui/core/dist/faqir.{theme}.css`.

## Usage

```tsx
import { LButton, LCard, LFieldGroup } from "@faqir-ui/react";

export function SignIn({ hasError, saving }: { hasError: boolean; saving: boolean }) {
  return (
    <LCard
      title="Sign in"
      body={
        <LFieldGroup
          invalid={hasError}
          label="Email"
          input={<input data-ui="input" type="email" />}
          error="Email is required."
        />
      }
      footer={
        <LButton variant="primary" size="lg" loading={saving}>
          Save
        </LButton>
      }
    />
  );
}
```

Every component is a `forwardRef` — a `ref` forwards to the root element:

```tsx
const ref = useRef<HTMLButtonElement>(null);
<LButton ref={ref}>Save</LButton>;
```

## Recipes (dialog, tabs, toast, …)

Every registry recipe is wrapped as a typed `forwardRef` component that renders
the manifest's reference markup and attaches the recipe's own controller on
mount (in a `useEffect`), destroys it on unmount, and forwards its `faqir:*`
events to `on<Event>` callback props:

```tsx
"use client";
import { useRef } from "react";
import { LDialog, type RecipeHandle } from "@faqir-ui/react";

function Example() {
  const dialog = useRef<RecipeHandle & { open: () => void }>(null);
  return (
    <>
      <button onClick={() => dialog.current?.open()}>Edit</button>
      <LDialog
        ref={dialog}
        title="Edit profile"
        body={<p>…</p>}
        footer={<button data-part="close">Done</button>}
        onConfirm={(detail, event) => { /* event.preventDefault() to stay open */ }}
      />
    </>
  );
}
```

- **Named parts are props** (`title`, `body`, `footer`, …) typed as `ReactNode`
  — the React analogue of Vue slots. A "bring-your-own" recipe (tabs, accordion,
  table) instead takes `children` that replace the whole anatomy.
- **The imperative handle** exposes the controller API on the ref
  (`dialog.current.open()`) plus `controller()` for the live instance. React
  nulls `ref.current` on unmount; the exposed methods then no-op.
- **Events → callbacks.** A `faqir:confirm` CustomEvent becomes `onConfirm`,
  called `(detail, event)`. The raw event rides along, so `event.preventDefault()`
  keeps its native semantics (e.g. an alert-dialog stays open for async work).
  Swapping a callback never re-creates the controller — the latest is read at
  dispatch time.
- **`id`** — pass `id` to pin the root/ARIA ids; otherwise `useId` generates a
  stable, SSR-safe one per instance.

**StrictMode-safe** by construction: the dev create→destroy→create effect
double-invoke re-attaches cleanly (the controller's own double-init guard is
cleared by `destroy()`), so nothing leaks or breaks.

### Low-level escape hatch: `useFaqirController`

Attach any recipe controller to an element ref you own — the same lifecycle
(StrictMode-safe create/destroy, event forwarding) without the generated wrapper.
Pass the controller factory (each is re-exported: `createDialog`, `createTabs`, …):

```tsx
"use client";
import { useRef } from "react";
import { useFaqirController, createDialog } from "@faqir-ui/react";

function Custom() {
  const ref = useRef<HTMLDivElement>(null);
  const dialog = useFaqirController(ref, createDialog, {
    on: { confirm: (detail) => console.log(detail) },
  });
  return <div ref={ref} data-ui="dialog" data-state="closed">{/* your markup */}</div>;
  // dialog.current?.open()
}
```

> The plan sketched this as `useFaqirController(ref, "dialog")`; it takes the
> factory instead of a name string so the hook stays tree-shakeable and zero-
> coupled (a name registry would pull every controller into any consumer).

## Generation contract

Derived deterministically from each primitive's manifest
(`src/bindings/ir.ts` in the CLI repo is the authoritative spec):

- **Root** — the manifest anatomy tag carrying `data-ui="<name>"`. All
  non-Faqir props fall through to it (`<LInput type="email" />`), and the
  `ref` forwards to it.
- **Variants → typed props.** Prop name is the attribute minus `data-`
  (`data-variant` → `variant`), typed as the literal union of manifest values.
  Reserved names get a suffix (`data-style` → `styleVariant`). The attribute is
  written only when the prop is set — defaults stay attribute-free, per registry
  convention.
- **States → boolean props.** `data-state="loading"` states write that value
  (first truthy state wins); bare attributes (`disabled`, `open`, `checked`)
  render as boolean attributes; bare `aria-*` states always render
  `"true"`/`"false"` (`<LToggle pressed />` → `aria-pressed`). States applied to
  a named part (e.g. stepper's `active`) belong to your children, not to props.
- **Named slots → `ReactNode` props.** Each manifest slot is a prop projected
  inside `<tag_hint data-part="name">`; required slots always render their
  wrapper. Slots whose hint is a void element (avatar's `image`) render your
  content as-is — you supply the `data-part` element. Content models
  `inline`/`text`/`block` also render `children`; void roots (`input`, `hr`)
  render none.
- **Props types.** Each `L<Name>Props` extends the intrinsic element's props
  (`ComponentPropsWithoutRef<"button">`) with the Faqir-declared names Omitted
  first — several collide with DOM attributes at an incompatible type (`size` is
  `number` on `<input>`, `title` is `string` everywhere) — then re-declared with
  their Faqir types.

No faqir-core directives run inside React — the host framework owns reactivity
(§11.3).

## RSC / server components

Primitives carry no client boundary, so they render in a Server Component and
via `react-dom/server`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { LButton } from "@faqir-ui/react";

renderToStaticMarkup(<LButton variant="primary">Save</LButton>);
// → <button data-ui="button" data-variant="primary">Save</button>
```

If you need a client boundary (event handlers, interactive controllers), add
`"use client"` in **your** module that consumes the primitive — the primitive
itself stays server-safe.

## Regenerate

```sh
faqir bindings react          # regenerate packages/react/src
faqir bindings react --check  # CI drift gate: fails on any diff
```
