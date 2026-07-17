# @faqir-ui/react

React bindings for [Faqir UI](https://github.com/Narcis13/faqir-ui). Every
component in `src/components/` is **generated from its registry manifest** by
`faqir bindings react`. The only hand-written code is `src/runtime.ts`
(~130 lines). Bindings are glue, not forks (FAQIR-NEXT §11.1): a CI drift gate
regenerates on every push and fails on any byte of difference, so the components
cannot drift from the manifests. The React and Vue targets share one
manifest-walking core (`src/bindings/ir.ts` in the CLI repo) — there is no
forked generation logic.

Requires React **18.2+ or 19**. Primitives are **RSC-safe**: no `"use client"`
directive, no hooks, no client-only APIs — import and render them directly in a
Server Component. (Interactive recipes with client controllers land in a
separate layer.)

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
