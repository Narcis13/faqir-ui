# Primitives Reference

All 21 CSS-only primitives. No JavaScript required.

## Table of Contents
- [Stack](#stack) | [Grid](#grid) | [Surface](#surface)
- [Button](#button) | [Input](#input) | [Textarea](#textarea) | [Select](#select)
- [Checkbox](#checkbox) | [Radio](#radio) | [Switch](#switch) | [Label](#label)
- [Card](#card) | [Badge](#badge) | [Avatar](#avatar) | [Separator](#separator)
- [Spinner](#spinner) | [Kbd](#kbd) | [Progress](#progress) | [Empty State](#empty-state)
- [Stepper](#stepper) | [Nav](#nav) | [Text & Heading](#text--heading)

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
<div data-ui="separator"></div>
<div data-ui="separator" data-variant="vertical"></div>
<div data-ui="separator" data-label="OR"></div>
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
