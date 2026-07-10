# Primitives Reference

All 33 CSS-only primitives. No JavaScript required.

## Table of Contents
- [Stack](#stack) | [Grid](#grid) | [Surface](#surface)
- [Button](#button) | [Input](#input) | [Textarea](#textarea) | [Select](#select)
- [Checkbox](#checkbox) | [Radio](#radio) | [Switch](#switch) | [Label](#label)
- [Card](#card) | [Badge](#badge) | [Avatar](#avatar) | [Separator](#separator)
- [Spinner](#spinner) | [Kbd](#kbd) | [Progress](#progress) | [Empty State](#empty-state)
- [Stepper](#stepper) | [Nav](#nav) | [Text & Heading](#text--heading)
- [Callout](#callout) | [Description List](#description-list) | [Field Group](#field-group) | [Image](#image)
- [Key-Value](#key-value) | [Page Break](#page-break) | [Signature](#signature) | [Stat](#stat)
- [Skeleton](#skeleton) | [Chip](#chip) | [Link](#link)

---

## Stack

Flexbox container for vertical or horizontal stacking.

```html
<div data-ui="stack"
     data-variant="horizontal"
     data-gap="0|1|2|3|4|6|8|10|12|16"
     data-align="start|center|end|stretch"
     data-justify="start|center|end|between|around"
     data-wrap>
  <div data-flex="1|auto|none">Child</div>
</div>
```

Default: vertical (column). Add `data-variant="horizontal"` for row.

## Grid

CSS Grid container.

```html
<div data-ui="grid"
     data-cols="1|2|3|4|6|12"
     data-gap="2|4|6|8|10|12|16"
     data-cols-sm="1|2|3"
     data-cols-md="1|2|3|4">
  <div data-span="2|3|4|6|full">Child</div>
</div>
```

Auto-stacks to 1 column at <=640px.

## Surface

Container with visual elevation.

```html
<div data-ui="surface"
     data-variant="flat|raised|overlay"
     data-size="sm|md|lg"
     data-max="sm|md|lg|xl|full"
     data-align-text="center|right">
</div>
```

Max sizes: sm=640px, md=768px, lg=1024px, xl=1280px.

## Button

```html
<button data-ui="button"
        data-variant="primary|secondary|destructive|ghost|outline|link"
        data-size="sm|md|lg"
        data-state="loading"
        disabled>
  <span data-part="icon">...</span> Text
</button>
```

Button Group: `<div data-ui="button-group">` wraps adjacent buttons.

## Input

```html
<input data-ui="input"
       data-size="sm|md|lg"
       data-state="error"
       type="text|email|password|number|search|url|tel">
```

Input Group: `<div data-ui="input-group">` with `[data-part="prefix"]` and `[data-part="suffix"]`.

## Textarea

```html
<textarea data-ui="textarea" rows="4"
          data-size="sm|md|lg"
          data-state="error"></textarea>
```

## Select

```html
<select data-ui="select" data-size="sm|md|lg">
  <option>Option</option>
</select>
```

## Checkbox

```html
<label data-ui="checkbox-label">
  <input data-ui="checkbox" type="checkbox" checked> Label text
</label>
```

States: `checked`, `indeterminate`, `disabled`. Sizes via `data-size="sm|md|lg"`.

## Radio

```html
<div data-ui="radio-group">
  <label data-ui="radio-label">
    <input data-ui="radio" type="radio" name="group" checked> Option A
  </label>
  <label data-ui="radio-label">
    <input data-ui="radio" type="radio" name="group"> Option B
  </label>
</div>
```

## Switch

```html
<label data-ui="switch-label">
  <input data-ui="switch" type="checkbox" role="switch" checked> Toggle
</label>
```

## Label

```html
<label data-ui="label" data-size="sm|md|lg">Field label</label>
```

Optional: `data-required` or `data-optional` indicator.

## Card

```html
<div data-ui="card" data-variant="default|outlined|filled" data-size="sm|md|lg">
  <div data-part="header">
    <h3 data-part="title">Title</h3>
    <p data-part="description">Description</p>
  </div>
  <div data-part="body">Content (required slot)</div>
  <div data-part="footer">
    <button data-ui="button" data-variant="outline">Action</button>
  </div>
</div>
```

## Badge

```html
<span data-ui="badge"
      data-variant="primary|secondary|destructive|success|warning"
      data-size="sm|lg">
  Text
</span>
```

## Avatar

```html
<div data-ui="avatar" data-size="sm|md|lg">
  <img data-part="image" src="..." alt="...">
  <span data-part="fallback">AB</span>
</div>
```

Fallback shows when no image.

## Separator

```html
<!-- Horizontal (default) -->
<hr data-ui="separator">

<!-- Vertical -->
<hr data-ui="separator" data-variant="vertical" data-size="sm|md|lg" aria-orientation="vertical">

<!-- With label -->
<div data-ui="separator" role="separator">
  <span data-part="label">OR</span>
</div>

<!-- Styles: solid (default), dashed, dotted, thick -->
<hr data-ui="separator" data-style="dashed">
<hr data-ui="separator" data-style="dotted">
<hr data-ui="separator" data-style="thick">

<!-- Dashed with label -->
<div data-ui="separator" data-style="dashed" role="separator">
  <span data-part="label">Section Break</span>
</div>

<!-- Vertical dashed -->
<hr data-ui="separator" data-variant="vertical" data-style="dashed" data-size="md" aria-orientation="vertical">
```

## Spinner

```html
<div data-ui="spinner" data-size="sm|md|lg"></div>
```

## Kbd

```html
<kbd data-ui="kbd">Ctrl</kbd>
```

## Progress

```html
<div data-ui="progress"
     data-variant="default|success|warning|destructive"
     data-size="sm|md|lg"
     role="progressbar" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100">
  <div data-part="track">
    <div data-part="fill" style="width: 60%"></div>
  </div>
  <span data-part="label">60%</span>
</div>
```

## Empty State

```html
<div data-ui="empty-state" data-size="sm|md">
  <span data-part="icon">...</span>
  <h3 data-part="title">No items yet</h3>
  <p data-part="description">Get started by creating your first item.</p>
  <div data-part="actions">
    <button data-ui="button" data-variant="primary">Create</button>
  </div>
</div>
```

## Stepper

```html
<div data-ui="stepper" data-variant="horizontal|vertical" data-size="sm|md|lg" aria-label="Steps">
  <div data-part="step" data-state="completed">
    <span data-part="indicator">...</span>
    <span data-part="label">Account</span>
  </div>
  <div data-part="connector" data-state="completed"></div>
  <div data-part="step" data-state="active">
    <span data-part="indicator">2</span>
    <span data-part="label">Project</span>
  </div>
  <div data-part="connector"></div>
  <div data-part="step">
    <span data-part="indicator">3</span>
    <span data-part="label">Review</span>
  </div>
</div>
```

Step states: `completed`, `active`, (none = pending).

## Nav

```html
<nav data-ui="nav"
     data-variant="horizontal|vertical|underline|pill"
     aria-label="Main">
  <a data-part="link" data-state="active" href="#">Dashboard</a>
  <a data-part="link" href="#">Settings</a>
  <div data-part="separator"></div>
  <a data-part="link" href="#">Help</a>
</nav>
```

## Text & Heading

```html
<h1 data-ui="heading" data-size="1|2|3|4|5|6" data-align="center|right">Title</h1>

<p data-ui="text"
   data-size="xs|sm|base|lg|xl|2xl"
   data-variant="muted|subtle|primary|mono"
   data-weight="normal|medium|semibold|bold"
   data-leading="tight|snug|normal|relaxed"
   data-align="center|right"
   data-truncate
   data-tabular>
  Content
</p>
```

---

## Callout

```html
<div data-ui="callout" data-variant="info|warning|destructive|success|muted" role="note">
  <span data-part="icon">{icon}</span>
  <div data-part="content">
    <strong data-part="title">Note</strong>
    <p>Callout body text</p>
  </div>
</div>
```

Slots: `icon` (optional), `content` (required), `title` (optional). Use `role="alert"` for destructive/warning variants.

## Description List

```html
<dl data-ui="description-list" data-variant="vertical|horizontal" data-size="sm|md|lg" data-divided>
  <dt data-part="term">Term</dt>
  <dd data-part="details">Description</dd>
  <dt data-part="term">Another Term</dt>
  <dd data-part="details">Another description</dd>
</dl>
```

Uses semantic `dl/dt/dd`. `data-divided` adds border between items.

## Field Group

```html
<div data-ui="field-group" data-variant="vertical|horizontal" data-size="sm|md|lg" data-required>
  <label data-part="label" for="email">Email</label>
  <div data-part="input">
    <input data-ui="input" id="email" name="email">
  </div>
  <p data-part="description">We'll never share your email</p>
</div>

<!-- Error state -->
<div data-ui="field-group" data-state="error">
  <label data-part="label" for="pw">Password</label>
  <div data-part="input">
    <input data-ui="input" id="pw" aria-invalid="true" aria-describedby="pw-error">
  </div>
  <p data-part="error" id="pw-error">Password too short</p>
</div>
```

States: `default`, `error`, `valid`. `data-required` shows asterisk. Always use `for`/`id` pairing.

## Image

```html
<figure data-ui="image" data-variant="responsive|thumbnail|cover|contain" data-size="xs|sm|md|lg|full">
  <img data-part="img" src="photo.jpg" alt="Description" loading="lazy">
  <figcaption data-part="caption">Optional caption</figcaption>
</figure>
```

Sizes: xs=48px, sm=96px, md=192px, lg=384px, full=100%. `alt` is required.

## Key-Value

```html
<!-- Single pair -->
<dl data-ui="key-value" data-variant="horizontal|vertical|inline">
  <dt data-part="label">Invoice</dt>
  <dd data-part="value">#INV-001</dd>
</dl>

<!-- Grid of pairs -->
<dl data-ui="key-value" data-variant="horizontal" data-cols="2|3">
  <dt data-part="label">Date</dt>
  <dd data-part="value">2026-01-15</dd>
  <dt data-part="label">Due</dt>
  <dd data-part="value">2026-02-15</dd>
</dl>
```

Uses semantic `dl/dt/dd`. `data-cols` creates multi-column grid.

## Page Break

```html
<!-- Page break after (default) -->
<div data-ui="page-break" role="separator" aria-label="Page break"></div>

<!-- Page break before -->
<div data-ui="page-break" data-variant="before" role="separator" aria-label="Page break"></div>
```

Shows dashed line on screen, forces CSS `page-break-after`/`page-break-before` in print.

## Signature

```html
<div data-ui="signature" data-size="sm|md|lg" data-align="left|center|right"
     role="img" aria-label="Signature: John Doe">
  <div data-part="line"></div>
  <span data-part="label">John Doe</span>
</div>
```

Sizes: sm=40%, md=60%, lg=80% width. The line provides space for handwritten signature in print.

## Stat

```html
<div data-ui="stat" data-size="sm|md|lg" data-variant="default|card" data-trend="up|down|neutral"
     aria-label="Revenue: $12,345, up 12%">
  <span data-part="label">Revenue</span>
  <span data-part="value">$12,345</span>
  <span data-part="change" data-trend="up">+12%</span>
</div>
```

Trend: `up` = green, `down` = red, `neutral` = gray. `card` variant adds border and padding.

## Skeleton

```html
<div data-ui="skeleton" aria-hidden="true"></div>
<div data-ui="skeleton" aria-hidden="true" style="--skeleton-width: 60%"></div>
<div data-ui="skeleton" data-variant="circle" aria-hidden="true"></div>
<div data-ui="skeleton" data-variant="rect" aria-hidden="true"></div>
```

Loading placeholder. Default variant is a text line (`--skeleton-width`/`--skeleton-height` custom
properties size it); `circle` sizes via `--skeleton-size`; `rect` is an image/card block. Always set
`aria-hidden="true"` (required by audit). Shimmer animation auto-disables under `prefers-reduced-motion`.

## Chip

```html
<span data-ui="chip" data-variant="default|primary|outline|destructive" data-size="sm|lg">
  <span data-part="label">Label</span>
  <button data-part="dismiss" type="button" aria-label="Remove Label">&times;</button>
</span>
```

Label slot is required; dismiss is optional. A dismiss button must be `type="button"` with an
`aria-label` (both enforced by audit).

## Link

```html
<a data-ui="link" href="/docs">Documentation</a>
<a data-ui="link" data-variant="external" href="https://…" target="_blank" rel="noopener noreferrer">External</a>
<a data-ui="link" data-variant="muted" href="/terms">Terms</a>
```

Styled anchor. `external` gets a CSS-only ↗ indicator — pair it with `target="_blank"` and
`rel="noopener noreferrer"`. `muted` renders in the muted foreground color.
