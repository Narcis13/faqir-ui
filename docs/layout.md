# Layout & Responsiveness

> The normative version of everything below is **FAQIR-SPEC §15**; the executable
> version is `src/utils/breakpoints.ts` (the canon) and `src/utils/layout.ts` (this
> doctrine, as data). This page is the one you read to *build a page* — every code
> block on it is audited by `bun test` (`tests/generator/layout-docs.test.ts`), so
> nothing here is markup that only looks right.

Faqir has no grid classes, no `.container`, no `col-md-6`. A page is composed from
five primitives, sized by tokens, and made responsive by suffixing an attribute with
a breakpoint tier. Nothing about layout is a style opinion an agent has to invent:
the ladder is a constant, the attributes are declared in manifests, and the audit
fails markup that goes off-canon.

## The doctrine

Reach for the **first** mechanism that solves the problem. Most layouts never get
past step 1.

1. **Intrinsic first — no query at all.** `auto-fit`/`minmax()`, `flex-wrap`,
   `clamp()` and logical properties adapt to any width without naming one. This is
   the only mechanism that is correct at every size, including sizes nobody tested.
   In markup that means `data-cols="auto"`, `cluster`, and a `container` measure.
2. **Container queries second — a component responds to its own inline size.** A
   component does not know whether it was placed full-bleed or inside a sidebar; the
   viewport cannot tell it, its own inline size can. In markup that means `switcher`.
3. **Viewport media queries last — page-level only.** Only pages, patterns and
   scaffolds, which own the whole viewport, may ask about it. In markup that means
   the `data-<attr>-<tier>` ladder.

`prefers-reduced-motion`, `print` and the other feature queries sit outside this
hierarchy — they ask about a preference or an output medium, not about space.

## The ladder

One ladder. Four tiers. Every responsive threshold in Faqir is one of these numbers.

| Tier | Min-width | Equivalent px | Reads as |
|------|-----------|---------------|----------|
| `sm` | `40rem` | 640px | large phone and up |
| `md` | `48rem` | 768px | tablet and up |
| `lg` | `64rem` | 1024px | laptop and up |
| `xl` | `80rem` | 1280px | desktop and up |

The authored unit is `rem`, so the ladder scales with the reader's font-size
preference; the px column is documentation only and never appears in CSS. There is
no `xs` and no `2xl` — a threshold that is not one of these four is off-canon, and
the `breakpoint-canon` audit rule says so.

## The grammar

A responsive value is a suffixed attribute:

```
data-<attr>-<tier>      →   "this value, from that tier up"
```

`data-cols-md="2"` means *two columns from 48rem up*, leaving `data-cols` as the
mobile-first base. Reading a ladder left to right reads it small screen first:

```html
<div data-ui="grid" data-cols="1" data-cols-md="2" data-cols-lg="4" data-gap="4">
  <div data-ui="card" data-variant="outlined"><div data-part="body">One up on a phone.</div></div>
  <div data-ui="card" data-variant="outlined"><div data-part="body">Two from 48rem.</div></div>
  <div data-ui="card" data-variant="outlined"><div data-part="body">Four from 64rem.</div></div>
  <div data-ui="card" data-variant="outlined"><div data-part="body">Still four at 80rem.</div></div>
</div>
```

Three rules the audit enforces:

- **Only declared groups take a suffix.** A manifest marks a variant group
  `"responsive": true`; `faqir audit` flags `data-gutter-md` (a group that is not)
  and `data-cols-xs` (a tier that does not exist).
- **The five protocol attributes never do.** `data-ui`, `data-part`, `data-state`,
  `data-variant`, `data-size` are frozen — `data-variant-md` would be a sixth
  attribute in all but name. This is why `stack` moved direction off `data-variant`
  onto `data-direction` in v2.0: an axis that must vary by tier cannot live on a
  protocol attribute.
- **Mobile-first, `min-width` only.** Tiers are floors, so they cannot leave a gap
  between them — the class of bug where a `data-cols="12"` grid rendered twelve
  columns at 640.5px.

## The five primitives

| Primitive | Mechanism | Reach for it when |
|-----------|-----------|-------------------|
| `stack` | intrinsic | One direction, one gap — page rhythm, toolbars, form columns. |
| `cluster` | intrinsic | A row that wraps by itself — tags, meta, button rows. |
| `grid` | intrinsic | Columns, either intrinsic (`data-cols="auto"`) or an editorial ladder. |
| `container` | intrinsic | A centred measure column — the only way to cap a page width. |
| `switcher` | container | Equal peers that fold to one column by *their own* width. |

Everything they can be told is declared in their manifests, so `faqir explain grid`,
the docs site, the bindings and the skill all describe the same attributes. The
short version:

```html
<!-- stack: direction, gap, align, justify — all four responsive -->
<div data-ui="stack" data-direction="vertical" data-direction-md="horizontal" data-gap="4" data-justify="between">
  <p data-ui="text">A column on a phone, a row from 48rem.</p>
  <p data-ui="text" data-variant="muted">No nested wrapper, no second stack.</p>
</div>

<!-- cluster: wraps with no breakpoint; data-push sends a child to the far end -->
<div data-ui="cluster" data-gap="2">
  <span data-ui="badge">design</span>
  <span data-ui="badge" data-variant="secondary">layout</span>
  <div data-push><button data-ui="button" data-variant="outline">Edit tags</button></div>
</div>

<!-- grid: intrinsic mode needs no query at all -->
<div data-ui="grid" data-cols="auto" data-min="16" data-gap="4">
  <div data-ui="card"><div data-part="body">Columns appear as room allows.</div></div>
  <div data-ui="card"><div data-part="body">No tier named anywhere.</div></div>
</div>

<!-- container: the measure ladder, optionally per tier -->
<div data-ui="container" data-measure="content" data-measure-lg="wide" data-gutter="4">
  <p data-ui="text">Reading width on a phone, page width from 64rem.</p>
</div>

<!-- switcher: folds on its OWN width, so it is correct in a sidebar too -->
<div data-ui="switcher" data-threshold="md" data-gap="4">
  <div data-ui="surface" data-variant="raised">Peer one</div>
  <div data-ui="surface" data-variant="raised">Peer two</div>
</div>
```

## Measure and rhythm

Two token ladders carry every page-level number, so a layout never hand-writes one.

**Measure** — the width of a centred column. `container`'s `data-measure` resolves
to these, and so does `surface`'s `data-max`:

| Token | Cut for |
|-------|---------|
| `--measure-narrow` | a single form column, a login card |
| `--measure-content` | an article body, a settings panel |
| `--measure-wide` | a page shell — the widest thing still centred |
| `--measure-prose` | optimal line length in `ch`, so it tracks the reader's font |

Measure names are deliberately **not** `sm|md|lg|xl`: those names belong to the
breakpoint ladder, and reusing them would make `data-max="lg"` read as "at the lg
tier" when it means "1152px wide".

**Rhythm** — the air between sections and the inset of the page:

| Token | Feels like |
|-------|-----------|
| `--section-gap-sm` | dense pages — docs, dashboards |
| `--section-gap-md` | the default marketing rhythm |
| `--section-gap-lg` | spacious — one idea per screen |
| `--content-gutter` | the page's own `padding-inline` |

Both are composed from `--space-*`, so density mode (`data-density="compact"`)
remaps them for free.

## The default rhythm

Every gap above is one you *ask* for. One is not — **FAQIR-SPEC §20**:

> **Inside a flow root, consecutive block-level Faqir components and nested flow roots are separated by `--flow-space` of vertical space.**

`--flow-space` defaults to `--section-gap-sm`. A **flow root** is the page's own
structure — `body`, `main`, `article`, `section`, `aside`, `header`, `footer`, `form`,
`fieldset`, `dialog`, `blockquote`, `figure`, `[data-ui="container"]`,
`[data-ui="surface"]` — never a component that lays out its own children, because
`stack`, `cluster`, `grid` and `switcher` already space theirs with `gap` and a margin
on top of that would double it.

So this is spaced, with no wrapper, no `stack` and no attribute:

```html
<section>
  <div data-ui="card" data-variant="outlined">
    <div data-part="body">First. The first child carries no margin.</div>
  </div>
  <div data-ui="card" data-variant="outlined">
    <div data-part="body">Second. Already separated — nothing was asked for.</div>
  </div>
</section>
```

Three things worth knowing and nothing else:

- **It nests.** A `section` inside a `main` is a flow root in its own right — and is
  itself spaced, because the participants are `[data-ui]` *plus* the flow-root tags.
  A `surface` boundary does not leak: the first child carries no margin and the last
  carries none either, so there is never a margin at a box edge to collapse through.
- **"Consecutive" is load-bearing.** The margin goes on the second of two
  participants, so anything else between them suppresses it — an `<h2>` stays welded
  to the table it labels rather than floating 3rem above it.
- **It skips inline-level components.** A vertical margin on an `inline-flex` box
  shifts it inside its line box instead of stacking it, so a row of badges stays a
  row. The 26 inline-level components are listed in `registry/base/rhythm.css`, and
  the list is derived from the registry by test rather than kept by hand.
- **`data-gap` on the flow root re-tunes it**, on the same `0 1 2 3 4 6 8 10 12 16`
  ladder the layout primitives take, and `data-gap="0"` turns it off. It inherits, so
  it is written once per page. The rule weighs (0,0,0), so any component rule and any
  authored rule beats it.

Reach for a `stack` when you want a *different* rhythm, a direction, or alignment —
not merely to separate a sequence.

## Page archetypes

Five pages, each *structured* by the five primitives and filled with ordinary
components. Every block below is audited against the registry manifests on every test
run, so they are safe to copy verbatim as a starting point.

### Dashboard {#dashboard}

A page shell at `--measure-wide`, a title row that splits with `data-push`, a stat
band that climbs 1 → 2 → 4, and a content grid whose lead card takes the whole row.

`data-span` holds at **every** width (it is a prop, not a responsive group), so the
only span that is safe under a `data-cols="1"` base is `full` — `grid-column: 1 / -1`
is a no-op in one column and the whole row in two. A span of 2 under a base of 1
would conjure an implicit second column on a phone.

```html
<div data-ui="container" data-measure="wide" data-gutter="6">
  <div data-ui="stack" data-gap="8">

    <div data-ui="cluster" data-gap="3">
      <h1 data-ui="text" data-size="1" data-weight="bold">Overview</h1>
      <div data-push>
        <div data-ui="cluster" data-gap="2">
          <button data-ui="button" data-variant="outline">Export</button>
          <button data-ui="button" data-variant="primary">New report</button>
        </div>
      </div>
    </div>

    <div data-ui="grid" data-cols="1" data-cols-sm="2" data-cols-lg="4" data-gap="4">
      <div data-ui="stat">
        <span data-part="label">Revenue</span>
        <span data-part="value">$48.2k</span>
        <span data-part="change" data-trend="up">+12%</span>
      </div>
      <div data-ui="stat">
        <span data-part="label">Signups</span>
        <span data-part="value">1,204</span>
        <span data-part="change" data-trend="up">+4%</span>
      </div>
      <div data-ui="stat">
        <span data-part="label">Churn</span>
        <span data-part="value">1.8%</span>
        <span data-part="change" data-trend="down">-0.3pt</span>
      </div>
      <div data-ui="stat">
        <span data-part="label">Open tickets</span>
        <span data-part="value">37</span>
      </div>
    </div>

    <div data-ui="grid" data-cols="1" data-cols-lg="2" data-gap="4">
      <div data-ui="card" data-span="full">
        <div data-part="header"><h2 data-part="title">Traffic</h2></div>
        <div data-part="body">A chart, a table, whatever the page is about.</div>
      </div>
      <div data-ui="card">
        <div data-part="header"><h2 data-part="title">Activity</h2></div>
        <div data-part="body">
          <div data-ui="stack" data-gap="2">
            <p data-ui="text" data-size="sm">Deploy finished</p>
            <p data-ui="text" data-size="sm" data-variant="muted">Invite accepted</p>
          </div>
        </div>
      </div>
      <div data-ui="card">
        <div data-part="header"><h2 data-part="title">Queue</h2></div>
        <div data-part="body">
          <div data-ui="cluster" data-gap="2">
            <span data-ui="badge">3 failed</span>
            <span data-ui="badge" data-variant="secondary">12 pending</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>
```

### Landing page {#landing}

Sections stacked at a marketing rhythm, a hero measured for reading rather than for
the viewport, and a feature grid in **intrinsic** mode — the columns appear as room
allows and no tier is named.

```html
<div data-ui="stack" data-gap="16">

  <section>
    <div data-ui="container" data-measure="content" data-gutter="6">
      <div data-ui="stack" data-gap="4" data-align="center" data-align-text="center">
        <h1 data-ui="text" data-size="1" data-weight="bold">Ship UI an agent can read</h1>
        <p data-ui="text" data-size="lg" data-variant="muted">
          Five attributes, one token system, no classes. Copy the markup, keep the contract.
        </p>
        <div data-ui="cluster" data-gap="3" data-justify="center">
          <button data-ui="button" data-variant="primary" data-size="lg">Get started</button>
          <button data-ui="button" data-variant="outline" data-size="lg">Read the docs</button>
        </div>
      </div>
    </div>
  </section>

  <section>
    <div data-ui="container" data-measure="wide" data-gutter="6">
      <div data-ui="grid" data-cols="auto" data-min="16" data-gap="6">
        <div data-ui="card" data-variant="outlined">
          <div data-part="header"><h2 data-part="title">Manifest-driven</h2></div>
          <div data-part="body">Every component carries its own contract.</div>
        </div>
        <div data-ui="card" data-variant="outlined">
          <div data-part="header"><h2 data-part="title">Zero runtime deps</h2></div>
          <div data-part="body">Plain HTML, one stylesheet, no build step.</div>
        </div>
        <div data-ui="card" data-variant="outlined">
          <div data-part="header"><h2 data-part="title">Audited</h2></div>
          <div data-part="body">Markup is checked against the manifests it claims.</div>
        </div>
      </div>
    </div>
  </section>

  <section>
    <div data-ui="container" data-measure="narrow" data-gutter="6">
      <div data-ui="stack" data-gap="4" data-align="center" data-align-text="center">
        <h2 data-ui="text" data-size="2" data-weight="semibold">Start with one component</h2>
        <button data-ui="button" data-variant="primary" data-size="lg">faqir init</button>
      </div>
    </div>
  </section>

</div>
```

### Prose / document {#document}

The narrowest archetype and the one most often got wrong: reading width is set by
the *text*, not by the viewport. `data-measure="prose"` is sized in `ch`, so it
tracks the reader's font rather than the layout.

```html
<div data-ui="container" data-measure="prose" data-gutter="4">
  <article data-ui="stack" data-gap="6">

    <header>
      <div data-ui="stack" data-gap="2">
        <h1 data-ui="text" data-size="1" data-weight="bold">Layout without classes</h1>
        <div data-ui="cluster" data-gap="2">
          <span data-ui="text" data-size="sm" data-variant="muted">12 March 2026</span>
          <span data-ui="badge" data-variant="secondary">Guide</span>
        </div>
      </div>
    </header>

    <p data-ui="text">
      A document is a single column of text with a measure, a rhythm between blocks,
      and nothing else. The container caps the line length; the stack sets the rhythm.
    </p>

    <h2 data-ui="text" data-size="2" data-weight="semibold">Why measure is not a breakpoint</h2>
    <p data-ui="text">
      A column cut for reading stays the same width on a 27-inch display. Widening it
      because the viewport widened is how documents become unreadable at desk width.
    </p>

    <hr data-ui="separator">

    <p data-ui="text" data-size="sm" data-variant="muted">
      Next: the split view, where two panes fold on their own width rather than the page's.
    </p>

  </article>
</div>
```

### Split view {#split-view}

List and detail, side by side. The pair is a `switcher`, not a two-column grid, and
that is the whole lesson: a `switcher` folds on **its own** inline size, so this block
is correct pasted full-bleed, dropped into a dashboard cell, or opened inside a
dialog — three placements a viewport query cannot tell apart. The section nav above
it is a `cluster`, which wraps by itself and needs no tier either.

A page-level sidebar shell — persistent navigation that becomes a drawer on a phone —
is a different problem and already has an answer: the `dashboard-shell` pattern. Do
not hand-roll one out of a grid.

```html
<div data-ui="container" data-measure="wide" data-gutter="4">
  <div data-ui="stack" data-gap="6">

    <div data-ui="cluster" data-gap="3">
      <h1 data-ui="text" data-size="1" data-weight="bold">Inbox</h1>
      <div data-push><span data-ui="badge">24 unread</span></div>
    </div>

    <nav data-ui="nav" aria-label="Mailboxes">
      <a data-part="link" href="#inbox" aria-current="page">Inbox</a>
      <a data-part="link" href="#drafts">Drafts</a>
      <a data-part="link" href="#archive">Archive</a>
    </nav>

    <div data-ui="switcher" data-threshold="md" data-gap="4">
      <div data-ui="surface" data-variant="raised" data-size="md">
        <div data-ui="stack" data-gap="3">
          <h2 data-ui="text" data-size="3" data-weight="semibold">Threads</h2>
          <div data-ui="stack" data-gap="2">
            <p data-ui="text" data-size="sm">Release notes for 0.8</p>
            <p data-ui="text" data-size="sm" data-variant="muted">Weekly digest</p>
          </div>
        </div>
      </div>
      <div data-ui="surface" data-variant="raised" data-size="md">
        <div data-ui="stack" data-gap="3">
          <h2 data-ui="text" data-size="3" data-weight="semibold">Release notes for 0.8</h2>
          <p data-ui="text">The detail pane — one column below the threshold, half the row above it.</p>
        </div>
      </div>
    </div>

  </div>
</div>
```

### Centred form {#centered-form}

One narrow column, centred, with the fields stacked at a single gap. No breakpoint
appears anywhere — a form column that is right on a phone is right on a desktop, and
that is the point of `--measure-narrow`.

```html
<div data-ui="container" data-measure="narrow" data-gutter="4">
  <div data-ui="card" data-size="lg">
    <div data-part="header">
      <h1 data-part="title">Sign in</h1>
      <p data-part="description">Use the address your team invited.</p>
    </div>
    <div data-part="body">
      <form>
        <div data-ui="stack" data-gap="4">
          <div data-ui="field-group">
            <label data-part="label" for="signin-email">Email</label>
            <div data-part="input">
              <input data-ui="input" id="signin-email" type="email" name="email" autocomplete="email">
            </div>
          </div>
          <div data-ui="field-group">
            <label data-part="label" for="signin-password">Password</label>
            <div data-part="input">
              <input data-ui="input" id="signin-password" type="password" name="password" autocomplete="current-password">
            </div>
          </div>
          <button data-ui="button" data-variant="primary" data-size="lg" type="submit">Sign in</button>
        </div>
      </form>
    </div>
    <div data-part="footer">
      <div data-ui="cluster" data-gap="2" data-justify="center">
        <a data-ui="link" href="#reset">Forgot password?</a>
      </div>
    </div>
  </div>
</div>
```

## What the audit enforces

Layout is not a matter of taste in Faqir; four rules run over every page and every
registry stylesheet:

- `breakpoint-canon` — a width threshold that is not a canon `min-width` is a
  finding, in CSS and in `<style>` blocks alike.
- `valid-variant` (responsive half) — `data-cols-md="7"` is an invalid value;
  `data-cols-xx="2"` is an unknown tier.
- `undeclared-attribute` — a stylesheet may not select on an attribute its manifest
  never declared, which is what keeps this page, the skill and the bindings complete.
- `logical-properties` — `margin-inline-start`, never `margin-left`, so every layout
  above is correct in RTL without a second stylesheet.

## Where else this is written down

| Surface | What it carries |
|---------|-----------------|
| `FAQIR-SPEC.md` §15 | the normative canon, rules and doctrine |
| `src/utils/breakpoints.ts` | the ladder as frozen constants + the grammar helpers |
| `src/utils/layout.ts` | this doctrine as data — what the generators read |
| `README.md` → Layout System | the five primitives and their full attribute tables |
| `.faqir/context.json` → `layout` / `responsive` | the same, for an agent |
| `llms.txt` / `llms-full.txt` | the ladder, the grammar and the primitives, for a crawler |
| the docs site → Layout | these five archetypes, rendered |
