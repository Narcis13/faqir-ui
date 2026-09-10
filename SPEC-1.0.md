# Faqir Protocol 1.0

**Status:** Frozen · **Protocol version:** 1.0 · **Manifest schema version:** 1.0

This is the normative specification of the Faqir contract: the five DOM attributes,
their value grammars, the three sanctioned token modifiers, the responsive tier
suffix, and the manifest schema every component ships beside its markup.

It is a *contract*, not a tour. `README.md` teaches the framework, `docs/layout.md`
teaches page structure, and `FAQIR-SPEC.md` records how the whole system was
designed and built. This file says only what an implementation — a component
author, a code generator, an agent, or a second implementation of the audit engine
— must do to be correct.

Every table below is parsed back out of this file by `tests/spec/protocol-1.0.test.ts`
and compared against `src/protocol.ts`, and every ```html block in it is audited
against the shipped registry manifests on every test run. The spec cannot describe
a protocol the framework does not implement, and it cannot show markup the
framework would reject.

---

## 1. Scope and conformance

### 1.1 What this specifies

1. **The attribute protocol** — the five `data-*` attributes that form the contract
   between HTML, CSS, JavaScript controllers, and tooling (§2, §3).
2. **The sanctioned token modifiers** — three further attributes that re-declare
   design tokens for a subtree and are part of the frozen surface, without being
   protocol attributes (§4).
3. **The responsive tier suffix** — `data-<attr>-<tier>`, introduced in v0.8 (§5).
4. **Manifest schema 1.0** — the machine-readable contract shipped beside every
   component and theme (§6).
5. **The freeze and its amendment process** (§8) and the schema's history (§9).

### 1.2 What this does not specify

The token vocabulary, the component set, the CSS of any component, the controller
API, the CLI surface, and the audit engine's implementation are all **outside** the
freeze. They change on their own schedules, under semantic versioning, and none of
them can change what §2–§6 promise.

Per-component vocabularies are specifically out of scope by design. The protocol
says `data-variant` carries one lower-case identifier drawn from the component's own
declared group; it never says which identifiers. That is what a manifest is for, and
it is why adding a component or a variant value is not a protocol change.

### 1.3 Conformance

A **conforming document** is HTML in which every one of the five attributes, every
token modifier, and every tier-suffixed attribute obeys §2–§5, judged against the
manifests of the components it uses.

A **conforming manifest** is a JSON document that validates against
`manifest.schema.json` at `schema_version` 1.0.

A **conforming implementation** is one that accepts every conforming document and
manifest, and reports every non-conforming one. `faqir audit` is the reference
implementation; the rule named in the last column of §2.1 is the rule that reports
each violation.

The key words MUST, MUST NOT, SHOULD and MAY are used in their ordinary RFC 2119
sense.

---

## 2. The five attributes

### 2.1 The table

<!-- @faqir:protocol-attributes -->

| Attribute | Purpose | Written by | Legal values come from | Enforced by |
|-----------|---------|------------|------------------------|-------------|
| `data-ui` | Component identity — what this element IS. | author | A manifest's `name`, or one of its `aliases`. | — |
| `data-part` | The slot this element fills inside the nearest enclosing component. | author | A key of that component manifest's `slots`. | `orphan-part` |
| `data-state` | Runtime state. The only attribute a controller writes to express state. | controller | A key of the manifest's `states`. | `valid-state` |
| `data-variant` | Visual variant — authored once, rarely changed. | author | A value of the manifest variant group whose `attr` is `data-variant`. | `valid-variant` |
| `data-size` | Size variant, held apart from the visual one so the two compose. | author | A value of `variants.size.values`. | `valid-size` |

`data-ui` has no enforcing rule and that is deliberate, not an omission: an
unrecognised component name is a component that is **not installed**, which is a
project-configuration fact rather than a markup defect. Every other rule skips such
an element rather than reporting it, so a page may safely mix Faqir components with
markup Faqir knows nothing about.

### 2.2 All five on one element

```html
<button data-ui="button" data-variant="primary" data-size="lg">Save changes</button>
```

`data-part` and `data-state` join them the moment the element is part of something
larger, or has a controller:

```html
<article data-ui="card">
  <div data-part="header">
    <h3 data-part="title">Invoice 0042</h3>
  </div>
  <div data-part="body">
    <p>Due in 14 days.</p>
  </div>
</article>
```

### 2.3 The rules

<!-- @faqir:protocol-rules -->

1. `data-ui` marks the root element of a component. A component nested inside another marks its own root.
2. `data-part` names a slot of the nearest enclosing component that declares it; a part with no such declaration is an error.
3. `data-state` is the only attribute a controller may write to express state, and the only one CSS should read for it.
4. `data-variant` and `data-size` are authored in markup and take exactly one value each.
5. State and visual identity never live in `class`. A class attribute on a component root is an error.
6. Standard HTML and ARIA (`role`, `aria-*`, `hidden`, `disabled`) are used alongside these five, never replaced by them.
7. None of the five takes a responsive tier suffix; the grammar in §5 reaches component attributes only.

Rule 2 is resolved by **composition**, not by depth: a `data-part` belongs to the
nearest ancestor whose manifest declares that slot. This is what lets a pattern's
own slot stay its own when a primitive that declares a same-named slot sits between
them.

Rule 5 is why there is no class-based escape hatch anywhere in the framework: the
DOM says what a thing is and what state it is in, and a stylesheet reads that. A
component whose state lived in a class would be invisible to every tool in §1.3.

### 2.4 A complete component

Every rule above, at once. The controller owns `data-state` on the root; everything
else is authored, and ARIA sits alongside rather than instead:

```html
<div data-ui="dialog" data-state="closed" id="confirm-delete">
  <button data-part="trigger" data-ui="button" data-variant="destructive">Delete account</button>

  <div data-part="overlay" hidden></div>

  <div
    data-part="panel"
    data-size="sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-delete-title"
    aria-describedby="confirm-delete-description"
    hidden
  >
    <div data-part="header">
      <h2 id="confirm-delete-title" data-part="title">Are you sure?</h2>
      <button data-part="close" aria-label="Close dialog">&#x2715;</button>
    </div>
    <div data-part="body">
      <p id="confirm-delete-description" data-part="description">This action cannot be undone.</p>
    </div>
    <div data-part="footer">
      <button data-ui="button" data-part="close" data-variant="outline">Cancel</button>
      <button data-ui="button" data-variant="destructive">Delete</button>
    </div>
  </div>
</div>
```

Note the two elements carrying both `data-ui` and `data-part`: a `button` that is
also the dialog's `close` slot is one element wearing two hats, which is legal and
common. `data-ui` identifies what it *is*; `data-part` identifies the role it plays
in its parent.

---

## 3. Value grammars

### 3.1 The shared grammar

All five attributes take **exactly one identifier**:

```text
value  ::= word ( "-" word )*
word   ::= [a-z0-9]+
```

That is `^[a-z0-9]+(?:-[a-z0-9]+)*$`: lower-case ASCII letters and digits,
hyphen-separated, non-empty. `2xl`, `16-9` and `bottom-left` are all legal;
`Primary`, `is_open` and `card ` are not.

**Never a list.** `data-variant="primary outline"` is two variants in a protocol
that has one, and there is no separator that would make it one. A component needing
two independent visual axes declares a second variant group with its own attribute —
which is a component attribute, not a protocol one, and is therefore free to exist:

```html
<div data-ui="badge" data-variant="success" data-size="sm">Paid</div>
```

The single-value rule is what keeps CSS targeting exact. `[data-variant="primary"]`
is an equality match, so a stylesheet never needs `~=`, never accidentally matches
`primary-muted`, and never depends on attribute-value ordering.

### 3.2 CSS targeting

The contract is the selector shape, not just the attribute name. A conforming
stylesheet targets components this way and no other:

```css
[data-ui="button"]                                   { /* base            */ }
[data-ui="button"][data-variant="primary"]           { /* visual variant  */ }
[data-ui="button"][data-size="lg"]                   { /* size variant    */ }
[data-ui="dialog"][data-state="open"] [data-part="panel"] { /* state       */ }
[data-ui="dialog"] [data-part="overlay"]             { /* part, scoped    */ }
```

Two consequences follow, and both are audited: a component stylesheet MUST NOT use
a class selector or an id selector, and every attribute it selects on MUST be
declared by that component's manifest.

### 3.3 Defaults

A variant group declares a `default`. The default MUST render without the attribute
being present — that is, `[data-ui="button"]` and `[data-ui="button"][data-variant="default"]`
resolve to the same computed style. Markup may therefore always omit an attribute
whose value is the default, and a generator may always add it, without either
changing what is on screen.

---

## 4. Sanctioned token modifiers

Three attributes are part of the frozen surface without being protocol attributes.
Each re-declares design tokens for a subtree and is inherited by every descendant
through the cascade; none of them names a component, fills a slot, or carries a
per-component vocabulary. That is exactly why they are not a sixth attribute — and
why they need no manifest declaration, which the documentation cross-checks exempt.

<!-- @faqir:token-modifiers -->

| Attribute | Purpose | Values | Written by |
|-----------|---------|--------|------------|
| `data-density` | Re-declares the spacing and control-height ramps for a subtree. | `compact` \| `comfortable` | author |
| `data-motion` | The transition phase of one enter/leave cycle, driven by the engine. | `enter` \| `enter-active` \| `leave` \| `leave-active` | controller |
| `data-theme` | Selects the colour scheme a theme's token blocks resolve to. | `light` \| `dark` \| `auto` | author |

`data-density` and `data-theme` are legal on **any** element and scope their effect
to that element's subtree; `data-theme` is conventionally written on the document
root. Nesting is supported and resolves innermost-first:

```html
<div data-theme="dark" data-density="comfortable">
  <div data-ui="callout" data-variant="info">
    <div data-part="content">
      <p>Both modifiers cascade to every descendant.</p>
    </div>
  </div>
</div>
```

`data-motion` is different in kind: the engine writes it, moves it through the phases
of one enter/leave cycle, and removes it again. Markup never authors it, and CSS
reads it exactly as it reads `data-state`:

```html
<div data-ui="stat" data-motion="enter">
  <span data-part="label">Revenue</span>
  <span data-part="value">$12,400</span>
</div>
```

The values above are the complete vocabulary at 1.0. Adding one is additive (§8);
removing or renaming one is not.

---

## 5. The responsive tier suffix

Introduced in v0.8 and frozen here. A responsive value is a **suffixed attribute**,
`data-<attr>-<tier>`, read as "this value, from that tier up".

<!-- @faqir:responsive-rules -->

- `data-<attr>-<tier>` reads "this value, from that tier up". The unsuffixed attribute is the mobile-first base.
- The tiers are sm, md, lg, xl — `sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem — applied as `min-width` floors and nothing else.
- A suffix is legal only on an attribute whose manifest variant group declares `responsive: true`.
- The five protocol attributes never take a suffix: `data-cols-md` is a component attribute, `data-size-md` is a sixth protocol attribute in all but name.

The ladder is `min-width`-only by construction. A tier names the **floor** of a range
that never ends, so consecutive tiers cannot leave a gap and no author reasons about
±1px arithmetic. There is no fifth number and no `max-width` tier.

```html
<section data-density="compact">
  <div data-ui="grid" data-cols="1" data-cols-md="2" data-cols-lg="4" data-gap="4">
    <div data-ui="surface">One</div>
    <div data-ui="surface">Two</div>
  </div>
</section>
```

Precedence is encoded in **selector specificity at declaration time**, not in source
order: a tier's rule outranks the tier below it whatever order the rules ship in.
An implementation that resolved tiers by source order would produce different results
from a stylesheet the bundler happened to reorder, so it would not be conforming.

The values a suffixed attribute may take are exactly the values of its unsuffixed
group — the suffix changes *when* a value applies, never *which* values exist.

---

## 6. Manifest schema 1.0

Every component ships `<name>.manifest.json`; every theme ships `<name>.theme.json`.
Both validate against one document, `manifest.schema.json`, whose `schema_version` is
`1.0`. The schema is JSON Schema draft-07 and is itself meta-validated on every test
run.

### 6.1 Required fields — component manifest

`name`, `version`, `kind`, `category`, `description`, `anatomy`, `slots`, `variants`,
`states`, `a11y`, `tokens_used`, `templates`, `safe_transforms`, `unsafe_transforms`,
`composition`, `files`, `tests`.

`kind` is one of `primitive`, `recipe`, `pattern`, `scaffold`. `category` is a closed
enum, documented in `CONTRIBUTING.md` and enforced by the schema.

### 6.2 Optional fields

`$schema`, `aliases`, `changes`, and `props`.

`props` (v0.8) declares the attributes that are **not** variant groups: booleans,
free-form strings and numbers read by a controller or by CSS. It exists because an
attribute a stylesheet selects on must be declared somewhere, and a boolean toggle is
not a visual variant group.

`changes` is the component's own changelog — one `{ version, note, breaking }` entry
per release — and is what `faqir upgrade` reads to decide whether a component can be
merged automatically.

### 6.3 The two v0.8 fields, together

```json
{
  "variants": {
    "cols": {
      "values": ["1", "2", "3", "4"],
      "default": "1",
      "attr": "data-cols",
      "applied_to": "root",
      "responsive": true
    }
  },
  "props": {
    "gap": {
      "type": "enum",
      "values": ["0", "2", "4", "6"],
      "default": "4",
      "attr": "data-gap",
      "description": "Track gap, in spacing steps."
    }
  }
}
```

`responsive: true` is what makes `data-cols-md="2"` legal. The schema rejects it on a
group whose `attr` is one of the five, because §5 rule 4 is a property of the protocol
rather than a convention a manifest may opt out of.

### 6.4 Theme manifests

A theme manifest declares `name`, `version`, `mood`, `scheme`, `dark_mode`,
`tokens_overridden`, `tokens_inherited`, `pairs_with` and `preview`. `scheme` is
`light`, `dark` or `both`; `dark_mode` is `native` or `none`.

---

## 7. Enforcement

Conformance is machine-checked, and the check is the same code everywhere it runs:
the CLI (`faqir audit`), the MCP server, and the in-browser playground all call one
audit engine over one set of manifests.

- **Markup rules** validate a parsed document against the manifests of the components
  it uses — §2 and §3, plus the accessibility contract each manifest declares.
- **Stylesheet rules** validate a component's CSS against its own manifest — §3.2,
  including `undeclared-attribute`, which is what makes "every selected attribute is
  declared" true rather than aspirational.
- **Document rules** validate a whole page: duplicate ids, heading order, landmarks.

A rule that asserts a runtime is present (`controller-loaded`, `focus-trap`) applies
only to full documents, never to fragments — a fragment is by construction something
that gets included into a page, and the page owns its scripts.

---

## 8. Stability and the amendment process

### 8.1 The freeze

**Protocol 1.0 is frozen: until 2.0 the contract may only grow. Nothing already
published here may be renamed, removed, narrowed, or given a new meaning.**

Concretely: markup that conforms to 1.0 conforms to every 1.x release, and a manifest
that validates against schema 1.0 validates against every 1.x schema. Neither promise
has an escape clause for "we found a better name".

### 8.2 What requires which release

<!-- @faqir:amendments -->

| Change | Level | Because |
|--------|-------|---------|
| Add a component to the registry. | additive | A manifest is the component's own contract; the protocol gains nothing to break. |
| Add a value to a component's own variant group. | additive | Existing markup keeps validating; only the component's manifest and its minor version move. |
| Add an optional field to the manifest schema. | additive | Every manifest written against 1.0 still validates, because the field is optional. |
| Add a value to a sanctioned token modifier — a third density, say. | additive | The vocabulary grows; no existing value changes meaning. |
| Add an audit rule at `info` or `warning`. | additive | It reports; it does not redefine what conforming markup is. |
| Add, remove or rename one of the five attributes. | major | The five ARE the contract. A sixth is a different contract. |
| Change a protocol attribute's value grammar — accept a space-separated list, say. | major | Every parser, selector and audit rule reads the grammar; widening it re-specifies all of them. |
| Extend the tier suffix grammar to a protocol attribute. | major | `data-size-md` is a sixth attribute under another name — the previous row, indirectly. |
| Promote a token modifier to a protocol attribute (or demote one). | major | It moves an attribute across the line that decides whether a manifest must declare it. |
| Change the breakpoint canon — a tier's name or its floor. | major | Every suffixed attribute in every project silently re-targets a different width. |
| Make an optional manifest field required, or remove/rename an existing one. | major | Manifests that validate against 1.0 would stop validating — the definition of breaking. |
| Change the meaning of a published attribute value framework-wide. | major | Markup that still validates would render something else, which is worse than failing. |

**additive** ships in any 1.x release. **major** waits for 2.0, however small it looks.

Two cases the table does not cover, stated so nobody has to guess:

- **Raising an existing audit rule's severity** is not a protocol amendment — the
  markup it judges is unchanged — but it *is* a breaking change to anyone's CI, so it
  ships in a minor release with a changelog entry, never a patch.
- **Fixing a rule that was wrong** (accepting markup the spec forbids, or rejecting
  markup it allows) is a bug fix. The spec is the authority; the engine agreeing with
  the spec more closely is never an amendment.

### 8.3 How an amendment is proposed

1. Open an issue that names the section being amended and quotes the current text.
2. State the level from §8.2 and, for a `major`, why no additive form of the change
   exists. "It would be tidier" is not an argument; a contract that can be tidied is
   not frozen.
3. An accepted additive change lands with: the spec edit, the `src/protocol.ts` edit,
   a `manifest.schema.json` bump if the schema moved, a row in §9, and tests. The
   drift tests in `tests/spec/protocol-1.0.test.ts` fail on any subset of those, which
   is what makes the process enforceable rather than aspirational.
4. A `major` change is collected into a 2.0 branch and does not ship before it, no
   matter how many of them accumulate.

---

## 9. Manifest schema changelog

<!-- @faqir:schema-changelog -->

| Schema | Task | Change | Breaking |
|--------|------|--------|----------|
| 0.5 | 0.5-07 | First published as a file: component and theme manifests in one document, `changes[]` changelog entries, an `$id`, and a resolvable `$schema` on every registry manifest. Before this the contract existed only as the validator in `src/manifest.ts`. | no |
| 0.8 | 0.8-02 | `props` — the non-variant attributes — declared; `variants.<group>.responsive` added for the tier suffix grammar; `category` closed to a documented enum, which retired the `form` spelling in favour of `forms`. | yes |
| 1.0 | 1.0-01 | Frozen. `schema_version` is `1.0`, `stability` and `amendment_policy` are declared in the file, this changelog is carried in it, and the schema is published at a versioned URL beside the spec. No field changed shape. | no |
| 1.0 | W2-4 | `api` — a component's controller surface, generated from the controller's `@ui:provides` annotation. Optional, so every 1.0 manifest still validates; additive under SPEC-1.0 §8. It exists because the data was already in every controller and on no surface an agent reads: `faqir explain <recipe> --json` returned no `api` for any of the 29 JS-backed recipes. | no |

One thing this table records rather than tidies away: the schema file has carried
`schema_version: "1.0.0"` since its first commit, before there was a freeze to back
the claim. This task is where the claim becomes true, and the spelling is normalised
to `1.0` — the version the *protocol* is frozen at, which is the thing actually being
promised.

---

## 10. Published locations

The contract is published from the repository itself, addressed by git ref. The
published bytes and the repository bytes are therefore the same bytes by
construction: there is no copy step that can drift, no host that can lapse, and no
window in which a deployment is stale relative to the tag it claims to serve.

| What | URL | Notes |
|------|-----|-------|
| This document | `https://github.com/Narcis13/faqir-ui/blob/v1.0.0/SPEC-1.0.md` | Rendered. Pinned to the release tag that froze 1.0. |
| This document, as markdown | `https://raw.githubusercontent.com/Narcis13/faqir-ui/v1.0.0/SPEC-1.0.md` | The same bytes as `SPEC-1.0.md` in the repository. |
| Manifest schema 1.0 | `https://raw.githubusercontent.com/Narcis13/faqir-ui/v1.0.0/manifest.schema.json` | Pinned copy. Serves the schema 1.0 froze with, after 1.1 exists. |
| Manifest schema (alias) | `https://raw.githubusercontent.com/Narcis13/faqir-ui/main/manifest.schema.json` | The schema's own `$id`; always the newest 1.x schema. |

Two refs, doing two different jobs. `main` is the alias: an additive amendment
under §8 appears there the moment it lands, which is what "always the newest 1.x
schema" has to mean. `v1.0.0` is the pin, and it never moves — every release tag
serves the contract as that release shipped it, so a consumer that recorded a
version can always fetch the exact bytes it was written against.

A 1.1 of this document would be `SPEC-1.1.md` at the tag that publishes it, and
`SPEC-1.0.md` would stay exactly where it is, serving exactly what it serves today.
That is what "stable URL" has to mean for a frozen contract: the ref in the path is
the promise, and a git tag is the strongest form of that promise available.

**On the `$id`.** A JSON Schema `$id` is an identity, not a link, and changing one
means every consumer that cached the old identity now holds a different schema.
That makes the origin above part of what 1.0 freezes: it is not a convenience URL
to be tidied up later. Should the project ever publish from its own domain, the
`$id` moves with it — and a schema-identity change is a 2.0 concern, not a 1.x one.
