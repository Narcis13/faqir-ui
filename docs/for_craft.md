## Faqir UI Enhancement Prerequisites

> **This section must be completed BEFORE starting the craft unification.**
> Faqir UI in its current state is an excellent web UI framework, but it lacks several primitives and capabilities that reportcraft/forma need for document rendering, print output, and data-driven generation. Adding these to faqir-ui first means craft can consume them cleanly rather than working around gaps.

### Analysis: api-source.js and Data-Driven Rendering

Faqir UI recently added `api-source.js` (`registry/core/api-source.js`) — a thin CRUD service factory that creates reactive data sources consumable by `l-data` blocks. Two approaches are documented in `docs/data-driven-rendering.md`:

**Approach B (available now):** Application-level service layer
```html
<div l-data="{ ...apiSource('/api/invoices'), search: '' }" l-init="load()">
  <template l-for="inv in items">
    <span l-text="inv.number"></span>
  </template>
</div>
```
- `apiSource(endpoint, options)` returns reactive state: `items[]`, `loading`, `submitting`, `error`
- Full CRUD: `load()`, `create(payload)`, `update(id, payload)`, `remove(id)`
- Optimistic updates with rollback on failure
- Polling support: `startPolling(ms)`, `stopPolling()`
- Lives in a `<script>` tag — not a recipe controller, so it doesn't violate the `no-fetch` audit rule

**Approach C (planned):** `l-source` directive built into faqir-core.js
```html
<div l-data="{ search: '' }" l-source:invoices="/api/invoices">
  <template l-for="inv in invoices">...</template>
</div>
```
- Purely declarative — no JS needed in markup
- Modifiers: `.poll`, `.lazy`, `.optimistic`, `.key`
- Injects `$invoices` controller with same CRUD methods
- Multiple sources per element via multiple `l-source:name` attributes

**Relevance to craft unification:**

1. **Report rendering (read-only)**: Craft resolves `bind` expressions at render-time on the server. api-source isn't needed here — data is baked into the HTML at generation.

2. **Form rendering (interactive)**: Craft generates `l-model` bindings for form fields. api-source could enable the form's **submit handler** to POST to craft's `/submission/submit` endpoint directly from the generated HTML, without custom inline `<script>`.

3. **Hybrid documents**: The real win. A hybrid invoice form could use `l-source` to load supplier data from the API while presenting interactive fields for client input. This makes the `kind: 'hybrid'` concept truly live — read-only sections pull from API, interactive sections collect input.

4. **Live preview in studio**: contzo-studio could use `apiSource('/api/craft/template/{slug}/preview')` to render templates with live data previews.

**Recommendation**: Build Approach C (`l-source` directive) into faqir-core.js before unification. This gives craft a first-class data binding mechanism that works at both the declarative template level and runtime. Approach B works as the migration path and escape hatch.

---

### Missing Primitives and Recipes — Gap Analysis

#### Current Faqir UI Inventory
- **22 Primitives** (CSS-only): avatar, badge, button, card, checkbox, empty-state, grid, input, kbd, label, nav, progress, radio, select, separator, spinner, stack, stepper, surface, switch, text, textarea
- **15 Recipes** (CSS+JS): accordion, combobox, command-palette, date-picker, dialog, drawer, dropdown, pagination, popover, select-custom, sheet, table, tabs, toast, tooltip
- **6 Patterns**: auth-form, crud-table, dashboard-shell, empty-state, search-results, settings-page
- **4 Themes**: default, brutalist, midnight, paper

#### Gap Map: What Craft Needs vs What Faqir Has

| Craft Component | Faqir Equivalent | Gap | Priority |
|---|---|---|---|
| `image` (reportcraft) | `avatar` (partial) | No general image primitive | **CRITICAL** |
| `key-value` (reportcraft) | None | No labeled data pair component | **CRITICAL** |
| `page-break` (reportcraft) | None | No print page break | **CRITICAL** |
| `table` with totals/footer (reportcraft) | `table` recipe (basic) | Missing footer rows, colspan, cell alignment, auto-calculations | **CRITICAL** |
| `signature-block` (reportcraft) | None | No signature line primitive | **HIGH** |
| `field-group` (forma React) | None | No label+input+error wrapper | **HIGH** |
| `alert` / `callout` | None | No info/warning/legal callout | **HIGH** |
| `document-surface` (print container) | `surface` (screen only) | No @page rules, print margins, A4 format | **HIGH** |
| `company-block` (Romanian) | `card` (generic) | No dedicated business info layout | MEDIUM |
| `document-meta` (Romanian) | None | No centered document header | MEDIUM |
| `totals-block` (financial) | None | No summary/totals component | MEDIUM |
| `qr-code` | None | No QR generation | MEDIUM |
| `barcode` | None | No barcode generation | LOW |
| `watermark` | None | No overlay text/image | LOW |

---

### Recommended Faqir UI Additions (Ordered by Priority)

#### TIER 1 — Critical (blocks unification without them)

**1. `image` primitive**
```
registry/primitives/image/
├── image.html
├── image.css
└── image.manifest.json
```
- `data-ui="image"` wrapping `<img>` with responsive behavior
- Variants: `responsive` (default), `thumbnail`, `cover`, `contain`
- Sizes: `xs` (48px), `sm` (96px), `md` (192px), `lg` (384px), `full` (100%)
- Features: alt text enforcement (a11y), aspect-ratio container, lazy loading via `loading="lazy"`, print-optimized max-width
- Why: reportcraft's `image` component renders inline-styled `<img>` tags. Craft needs a Faqir-native equivalent with `data-ui` attributes.

**2. `key-value` primitive**
```
registry/primitives/key-value/
├── key-value.html
├── key-value.css
└── key-value.manifest.json
```
- `data-ui="key-value"` for labeled data pairs
- Parts: `data-part="label"`, `data-part="value"`
- Variants: `horizontal` (label left, value right — default), `vertical` (label above value), `inline` (label: value on one line)
- Size variants for compact vs spacious
- Grid mode: `data-ui="key-value" data-cols="2"` for multiple pairs in columns
- Why: `key-value` is one of reportcraft's most-used components (company info, invoice details, contact data). Every document uses it.

**3. `page-break` primitive**
```
registry/primitives/page-break/
├── page-break.html
├── page-break.css
└── page-break.manifest.json
```
- `data-ui="page-break"` — applies `page-break-after: always`
- Screen behavior: renders as a thin dashed line with "page break" label (for visual editing)
- Print behavior: forces new page, hides the visual indicator
- Variant: `before` (page-break-before instead of after)
- Why: Essential for multi-page PDF documents. No workaround exists.

**4. Enhanced `table` recipe — footer, colspan, alignment**

Add to existing `registry/recipes/table/`:
- **Footer slot**: `data-part="tfoot"` for totals/summary rows
- **Cell alignment**: `data-align="left|center|right"` on `th`/`td`
- **Column spanning**: Standard HTML `colspan`/`rowspan` with proper CSS
- **Grouped rows**: `data-part="row-group"` with `data-part="group-header"` for category headers
- **Number formatting**: `data-format="number|currency|percent"` CSS alignment (tabular-nums, right-aligned)
- **Compact print**: `data-print="compact"` reduces padding for print output
- Why: reportcraft's `table`, `line-items`, and `vat-breakdown` all need footer rows, right-aligned currency columns, and auto-totals. The current table has none of these.

#### TIER 2 — High Priority (significantly improves quality)

**5. `field-group` primitive**
```
registry/primitives/field-group/
├── field-group.html
├── field-group.css
└── field-group.manifest.json
```
- `data-ui="field-group"` wraps label + input + description + error
- Parts: `data-part="label"`, `data-part="description"`, `data-part="input"` (slot), `data-part="error"`
- States: `data-state="error"` (red border + error message visible), `data-state="valid"` (green check)
- Required indicator: `data-required` shows asterisk after label
- Why: forma's React `FormaField.tsx` does exactly this. Craft needs it as Faqir HTML. Without it, every interactive component must manually compose label + input + error markup.

**6. `signature` primitive**
```
registry/primitives/signature/
├── signature.html
├── signature.css
└── signature.manifest.json
```
- `data-ui="signature"` — horizontal line with label below
- Parts: `data-part="line"` (the signing line), `data-part="label"` (name/title below)
- Configurable width: `data-size="sm|md|lg"` (40%/60%/80% width)
- Print-optimized: sufficient vertical space above the line for physical signing
- Why: Every Romanian business document needs a signature block. reportcraft has `signature-block` — craft needs the Faqir equivalent.

**7. `callout` primitive**
```
registry/primitives/callout/
├── callout.html
├── callout.css
└── callout.manifest.json
```
- `data-ui="callout"` for legal text, disclaimers, info notices
- Variants: `info`, `warning`, `destructive`, `success`, `muted`
- Parts: `data-part="icon"` (optional), `data-part="content"`
- Print behavior: always visible, border-only (no background color waste)
- Why: reportcraft's `legal-text` and `invoice-legal-text` need a styled container. Currently mapped to `data-ui="text" data-variant="muted"` which is too plain for legal notices that must stand out.

**8. `document` pattern**
```
registry/patterns/document/
├── document.html
├── document.css
└── document.manifest.json
```
- `data-ui="document"` — full-page document container optimized for print
- Built-in `@page` CSS rules: configurable format (A4/Letter), orientation, margins
- Parts: `data-part="header"` (repeats on every printed page via `position: running(header)`), `data-part="footer"` (same), `data-part="body"`
- Screen behavior: centered content with max-width, subtle paper shadow
- Variants: `invoice`, `form`, `report` (adjust spacing/typography)
- Theme integration: `data-theme` controls both screen and print appearance
- Why: This is the outermost shell that craft's `assembleFaqirDocument()` and `assembleFaqirForm()` would generate. Currently the unification plan uses a hand-rolled HTML shell. A proper Faqir pattern makes it consistent, themeable, and agent-readable.

#### TIER 3 — Medium Priority (nice to have)

**9. `stat` primitive** — Large metric display (number + label + change indicator). Useful for `totals-block`, `currency-amount`, and dashboard KPIs.

**10. `qr-code` recipe** — SVG QR code generation from text input. Uses a lightweight QR library embedded in the recipe controller. Essential for Romanian e-factura payment QR codes. Configurable size, error correction level.

**11. `description-list` primitive** — HTML `<dl>/<dt>/<dd>` with Faqir styling. Alternative to `key-value` for longer descriptive content. Horizontal and vertical layouts.

**12. `divider` variants for `separator`** — Add to existing separator: labeled divider (`data-variant="labeled"`), dotted/dashed styles, vertical orientation for use in horizontal stacks.

---

### api-source.js Integration with Craft

The `apiSource()` pattern maps directly to craft's data consumption model:

```html
<!-- Craft-generated hybrid invoice form -->
<div l-data="{
  ...apiSource('/api/craft/data/supplier/SC-ACME-SRL'),
  fields: { client_cui: '', payment_method: 'transfer' }
}" l-init="load()">

  <!-- Read-only section: supplier data from API -->
  <div data-ui="document" data-part="body">
    <div data-ui="key-value" data-cols="2">
      <span data-part="label">Furnizor</span>
      <span data-part="value" l-text="items.name"></span>
      <span data-part="label">CIF</span>
      <span data-part="value" l-text="items.cui"></span>
      <span data-part="label">IBAN</span>
      <span data-part="value" l-text="items.iban"></span>
    </div>
  </div>

  <!-- Interactive section: client input -->
  <div data-ui="field-group" data-required>
    <label data-part="label">CIF Client</label>
    <input data-ui="input" l-model="fields.client_cui"
           @input.debounce.300ms="validateCui('client_cui')">
    <span data-part="error" l-show="errors.client_cui" l-text="errors.client_cui"></span>
  </div>
</div>
```

This demonstrates why the `l-source` directive (Approach C) is even more powerful — it would let craft generate:
```html
<div l-source:supplier="/api/craft/data/supplier/SC-ACME-SRL"
     l-data="{ fields: { client_cui: '' } }">
  <!-- supplier data auto-loaded, fields for user input -->
</div>
```

**Action item**: Implement `l-source` directive in faqir-core.js. This is a 1-file change (~100 lines) that unlocks declarative data binding for all of craft's rendering modes.

