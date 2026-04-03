# Recipes Reference

All 16 interactive components (CSS + JS). Auto-initialize via `loom-core.js`.

## Table of Contents
- [Dialog](#dialog) | [Tabs](#tabs) | [Accordion](#accordion) | [Dropdown](#dropdown) | [Tooltip](#tooltip)
- [Toast](#toast) | [Popover](#popover) | [Date Picker](#date-picker) | [Combobox](#combobox)
- [Select Custom](#select-custom) | [Command Palette](#command-palette) | [Table](#table)
- [Pagination](#pagination) | [Drawer](#drawer) | [Sheet](#sheet) | [QR Code](#qr-code)
- [JS Controller Pattern](#js-controller-pattern) | [CSS Convention](#css-convention)

---

## Dialog

```html
<div data-ui="dialog" data-state="closed" id="my-dialog">
  <button data-part="trigger" data-ui="button">Open</button>
  <div data-part="overlay" hidden></div>
  <div data-part="panel" role="dialog" aria-modal="true"
       aria-labelledby="my-dialog-title" data-size="sm|md|lg|full" hidden>
    <div data-part="header">
      <h3 id="my-dialog-title" data-part="title">Title</h3>
      <button data-part="close" aria-label="Close">&#x2715;</button>
    </div>
    <div data-part="body">Content</div>
    <div data-part="footer">
      <button data-ui="button" data-variant="outline">Cancel</button>
      <button data-ui="button" data-variant="primary">Confirm</button>
    </div>
  </div>
</div>
```

Variants: `data-size="sm|md|lg|full"`, `data-variant="danger"` on panel. States: `closed`, `open`, `closing`. API: `_loomDialog.open()`, `.close()`, `.toggle()`, `.destroy()`.

## Tabs

```html
<div data-ui="tabs" data-variant="default|underline">
  <div data-part="list" role="tablist">
    <button data-part="trigger" role="tab" aria-selected="true">Tab 1</button>
    <button data-part="trigger" role="tab" aria-selected="false" tabindex="-1">Tab 2</button>
  </div>
  <div data-part="panel" role="tabpanel">Panel 1</div>
  <div data-part="panel" role="tabpanel" hidden>Panel 2</div>
</div>
```

API: `_loomTabs.select(index)`, `.destroy()`.

## Accordion

```html
<div data-ui="accordion" data-variant="single|multiple">
  <div data-part="item">
    <button data-part="trigger" aria-expanded="false">Section Title</button>
    <div data-part="content" hidden>
      <div data-ui="surface" data-variant="flat" data-size="sm">Content</div>
    </div>
  </div>
</div>
```

API: `_loomAccordion.expand(i)`, `.collapse(i)`, `.toggle(i)`, `.expandAll()`, `.collapseAll()`, `.destroy()`.

## Dropdown

```html
<div data-ui="dropdown">
  <button data-part="trigger" data-ui="button">Menu &#x25BE;</button>
  <div data-part="menu" role="menu" hidden>
    <button data-part="item" role="menuitem">Edit</button>
    <div data-ui="separator"></div>
    <button data-part="item" role="menuitem">Delete</button>
  </div>
</div>
```

API: `_loomDropdown.open()`, `.close()`, `.destroy()`.

## Tooltip

```html
<div data-ui="tooltip">
  <button data-part="trigger" data-ui="button">Hover me</button>
  <div data-part="content" role="tooltip">Tooltip text</div>
</div>
```

API: `_loomTooltip.show()`, `.hide()`, `.destroy()`.

## Toast

**Important:** `data-ui="toast"` and `data-part="container"` go on the SAME element. Toasts are appended as children dynamically.

```html
<div data-ui="toast" data-variant="top-right" data-part="container"
     role="region" aria-label="Notifications" id="my-toast">
  <!-- Toasts appended here by JS -->
</div>
```

Trigger from JS:
```js
document.getElementById('my-toast')._loomToast.add({
  message: 'Saved!',
  tone: 'success',       // default|success|error|warning
  icon: '&#x2713;',      // optional
  actionLabel: 'Undo',   // optional
  onAction: () => {},     // optional
  duration: 5000          // ms, 0 to disable
});
```

Position variants: `top-right`, `top-left`, `bottom-right`, `bottom-left`. API: `_loomToast.add(opts)`, `.dismiss(id)`, `.dismissAll()`, `.destroy()`.

## Popover

```html
<div data-ui="popover" data-state="closed">
  <button data-part="trigger" data-ui="button" aria-expanded="false">Click</button>
  <div data-part="content" data-variant="top|bottom|left|right" data-align="start|center|end" hidden>
    <p>Popover content</p>
    <button data-part="close" aria-label="Close">&#x2715;</button>
  </div>
</div>
```

API: `_loomPopover.open()`, `.close()`, `.toggle()`, `.destroy()`.

## Date Picker

**Important:** Calendar must contain full inner structure — header, nav buttons, month-label, grid with thead and tbody. JS queries these at init.

```html
<div data-ui="date-picker" data-state="closed" data-size="sm|md|lg">
  <div data-part="trigger">
    <input data-part="input" type="text" placeholder="Select a date"
           readonly aria-haspopup="dialog" aria-expanded="false" aria-label="Choose date">
    <span data-part="icon" aria-hidden="true">&#x1F4C5;</span>
  </div>
  <div data-part="calendar" role="dialog" aria-label="Date picker" hidden>
    <div data-part="header">
      <button data-part="nav-prev" aria-label="Previous month">&lsaquo;</button>
      <span data-part="month-label"></span>
      <button data-part="nav-next" aria-label="Next month">&rsaquo;</button>
    </div>
    <table data-part="grid" role="grid" aria-label="Calendar">
      <thead>
        <tr>
          <th scope="col" abbr="Sunday">Su</th>
          <th scope="col" abbr="Monday">Mo</th>
          <th scope="col" abbr="Tuesday">Tu</th>
          <th scope="col" abbr="Wednesday">We</th>
          <th scope="col" abbr="Thursday">Th</th>
          <th scope="col" abbr="Friday">Fr</th>
          <th scope="col" abbr="Saturday">Sa</th>
        </tr>
      </thead>
      <tbody data-part="grid-body"></tbody>
    </table>
  </div>
</div>
```

API: `_loomDatePicker.open()`, `.close()`, `.getValue()`, `.setValue(dateStr)`, `.navigate(month, year)`, `.destroy()`.

## Combobox

```html
<div data-ui="combobox" data-state="closed" data-size="sm|md|lg">
  <input data-part="input" role="combobox" placeholder="Search..."
         aria-expanded="false" aria-autocomplete="list">
  <ul data-part="listbox" role="listbox" hidden>
    <li data-part="option" role="option">Option A</li>
    <li data-part="option" role="option">Option B</li>
    <li data-part="empty" hidden>No results found</li>
  </ul>
</div>
```

API: `_loomCombobox.open()`, `.close()`, `.filter(query)`, `.select(value)`, `.destroy()`.

## Select Custom

```html
<div data-ui="select-custom" data-state="closed" data-size="sm|md|lg">
  <button data-part="trigger" role="combobox" aria-expanded="false" aria-haspopup="listbox">
    <span data-part="value" data-placeholder>Select...</span>
    <span data-part="chevron">&#x25BE;</span>
  </button>
  <div data-part="listbox" role="listbox" hidden>
    <input data-part="search" placeholder="Search...">  <!-- optional -->
    <div data-part="option" role="option" data-value="a">Option A</div>
    <div data-part="option" role="option" data-value="b">Option B</div>
    <div data-part="empty" hidden>No results found</div>
  </div>
</div>
```

API: `_loomSelectCustom.open()`, `.close()`, `.getValue()`, `.setValue(v)`, `.destroy()`.

## Command Palette

```html
<div data-ui="command-palette" data-state="closed" id="cmd">
  <div data-part="overlay" hidden></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-label="Command palette" data-size="sm|md|lg" hidden>
    <div data-part="search-wrapper">
      <input data-part="search" role="combobox" placeholder="Type a command..." aria-expanded="true" aria-autocomplete="list">
    </div>
    <div data-part="list" role="listbox">
      <div data-part="group">
        <div data-part="group-label">Category</div>
        <div data-part="item" role="option">
          <span data-part="item-label">Command Name</span>
          <kbd data-part="kbd">&#x2318;K</kbd>
        </div>
      </div>
      <div data-part="empty" hidden>No commands found</div>
    </div>
  </div>
</div>
```

Opens with Cmd+K / Ctrl+K. API: `_loomCommandPalette.open()`, `.close()`, `.filter(q)`, `.registerCommand(cmd)`, `.destroy()`.

## Table

```html
<div data-ui="table" data-variant="striped|bordered" data-size="sm|md|lg">
  <table data-part="table">
    <thead data-part="thead">
      <tr data-part="tr">
        <th data-part="th" scope="col">
          <input data-part="checkbox" type="checkbox" aria-label="Select all">
        </th>
        <th data-part="th" scope="col" data-sortable aria-sort="ascending">Name</th>
        <th data-part="th" scope="col" data-sortable aria-sort="none">Email</th>
      </tr>
    </thead>
    <tbody data-part="tbody">
      <tr data-part="tr" data-selected>
        <td data-part="td"><input data-part="checkbox" type="checkbox" checked></td>
        <td data-part="td">Alice</td>
        <td data-part="td">alice@example.com</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Table with footer, alignment, and number formatting

```html
<div data-ui="table" data-variant="bordered" data-size="md">
  <table data-part="table">
    <thead data-part="thead">
      <tr data-part="tr">
        <th data-part="th" scope="col">Item</th>
        <th data-part="th" scope="col" data-align="right">Amount</th>
      </tr>
    </thead>
    <tbody data-part="tbody">
      <tr data-part="tr">
        <td data-part="td">Service</td>
        <td data-part="td" data-align="right" data-format="currency">1,500.00</td>
      </tr>
    </tbody>
    <tfoot data-part="tfoot">
      <tr data-part="tr">
        <td data-part="td" data-align="right">Total</td>
        <td data-part="td" data-align="right" data-format="currency">1,500.00</td>
      </tr>
    </tfoot>
  </table>
</div>
```

### Grouped rows

```html
<tr data-part="group-header">
  <td data-part="td" colspan="3">Category Name</td>
</tr>
```

Cell attrs: `data-align="left|center|right"`, `data-format="number|currency|percent"`. Print: `data-print="compact"` on root. Footer via `tfoot data-part="tfoot"`. Group headers via `tr data-part="group-header"`.

`data-sortable` on th enables sort. `aria-sort="none|ascending|descending"`. `data-selected` on tr. API: `_loomTable.sort(col)`, `.selectAll()`, `.deselectAll()`, `.getSelected()`, `.destroy()`.

## Pagination

```html
<div data-ui="pagination" data-size="sm|md|lg">
  <nav data-part="nav" role="navigation" aria-label="Pagination">
    <button data-part="prev" aria-label="Previous page" disabled>&larr; Prev</button>
    <button data-part="page" data-state="active" data-page="1" aria-current="page">1</button>
    <button data-part="page" data-page="2">2</button>
    <span data-part="ellipsis">&hellip;</span>
    <button data-part="page" data-page="10">10</button>
    <button data-part="next" aria-label="Next page">Next &rarr;</button>
  </nav>
</div>
```

API: `_loomPagination.goTo(page)`, `.next()`, `.prev()`, `.destroy()`.

## Drawer

```html
<div data-ui="drawer" data-state="closed" id="my-drawer">
  <button data-part="trigger" data-ui="button">Open Drawer</button>
  <div data-part="overlay" hidden></div>
  <div data-part="panel" data-variant="left|right" data-size="sm|md|lg|full"
       role="dialog" aria-modal="true" aria-labelledby="my-drawer-title" hidden>
    <div data-part="header">
      <h2 id="my-drawer-title" data-part="title">Title</h2>
      <button data-part="close" aria-label="Close drawer">&#x2715;</button>
    </div>
    <div data-part="body">Content</div>
    <div data-part="footer">
      <button data-ui="button" data-variant="primary">Save</button>
    </div>
  </div>
</div>
```

States: `closed`, `open`, `closing`. API: `_loomDrawer.open()`, `.close()`, `.destroy()`.

## Sheet

```html
<div data-ui="sheet" data-state="closed" id="my-sheet">
  <button data-part="trigger" data-ui="button">Open Sheet</button>
  <div data-part="overlay" hidden></div>
  <div data-part="panel" data-variant="bottom|top|left|right" data-size="sm|md|lg"
       role="dialog" aria-modal="true" aria-labelledby="my-sheet-title" hidden>
    <div data-part="header">
      <h2 id="my-sheet-title" data-part="title">Title</h2>
      <button data-part="close" aria-label="Close sheet">&#x2715;</button>
    </div>
    <div data-part="body">Content</div>
  </div>
</div>
```

States: `closed`, `open`, `closing`. API: `_loomSheet.open()`, `.close()`, `.destroy()`.

## QR Code

```html
<div data-ui="qr-code" data-value="https://example.com"
     data-size="sm|md|lg" data-ecl="L|M|Q|H"
     role="img" aria-label="QR code: https://example.com">
  <span data-part="caption">Scan me</span>
</div>
```

Controller generates SVG from `data-value`. Sizes: sm=80px, md=128px, lg=200px. Error correction: L(7%), M(15%), Q(25%), H(30%). Updates on `data-value` change. `caption` slot is optional.

---

## JS Controller Pattern

All recipe controllers follow this structure:

```js
// @ui:controller {name}
// @ui:provides {methods} destroy

import { trapFocus } from "../../core/focus.js";

export function create{Name}(root) {
  // 1. Double-init guard
  if (root._loom{Name}) return root._loom{Name};

  // 2. Query parts
  const trigger = root.querySelector("[data-part='trigger']");
  const panel = root.querySelector("[data-part='panel']");

  // 3. State functions — ONLY modify root.dataset.state
  function open() {
    root.dataset.state = "open";
    panel.hidden = false;
  }
  function close() {
    root.dataset.state = "closed";
    panel.hidden = true;
  }

  // 4. Event listeners
  trigger?.addEventListener("click", open);

  // 5. Cleanup
  function destroy() {
    trigger?.removeEventListener("click", open);
    delete root._loom{Name};
  }

  // 6. Return and store API
  const api = { open, close, destroy };
  root._loom{Name} = api;
  return api;
}
```

Key rules:
- `root._loom{Name}` stores the API (idempotent)
- Only `root.dataset.state = value` modifies state
- Never use `classList` for state
- Query parts scoped to `root`
- Import only from `../../core/` (no external deps)
- Always provide `destroy()` for cleanup
- Register in `loom-core.js`: `controllerRegistry['name'] = createName;`

## CSS Convention

```css
/* @ui:component name */
/* @ui:tokens ... */

/* -- Base -- */
[data-ui="name"] { }

/* -- Variants -- */
[data-ui="name"][data-variant="x"] { }

/* -- Sizes -- */
[data-ui="name"][data-size="sm"] { }

/* -- States -- */
[data-ui="name"][data-state="open"] { }

/* -- Parts -- */
[data-ui="name"] [data-part="x"] { }

/* -- Motion -- */
@media (prefers-reduced-motion: reduce) {
  [data-ui="name"] { transition: none; }
}
```
