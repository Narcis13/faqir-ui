# Manifest Schema Reference

Every component has a `.manifest.json` — the machine-readable contract.

Location: `registry/{type}/{name}/{name}.manifest.json`

---

## Full Schema

```json
{
  "name": "component-name",
  "version": "1.0.0",
  "kind": "primitive | recipe | pattern",
  "category": "actions | forms | layout | navigation | data-display | feedback | overlay | typography | composite",
  "description": "One-line description",

  "anatomy": {
    "tag": "div | button | nav | ...",
    "selector": "[data-ui='name']",
    "content_model": "inline | block | slots | text"
  },

  "slots": {
    "slot_name": {
      "selector": "[data-part='name']",
      "required": true,
      "tag_hint": "button",
      "description": "What goes here"
    }
  },

  "variants": {
    "variant_group": {
      "values": ["value1", "value2"],
      "default": "value1",
      "attr": "data-variant | data-size | custom",
      "applied_to": "root | slot_name"
    }
  },

  "states": {
    "state_name": {
      "attr": "data-state=\"value\"",
      "default": true,
      "transient": false
    }
  },

  "a11y": {
    "role": "dialog",
    "aria-modal": true,
    "required_attrs": ["aria-label", "aria-labelledby"],
    "focus_trap": true,
    "escape_closes": true,
    "return_focus": "trigger",
    "keyboard": {
      "Escape": "close",
      "Enter": "activate",
      "ArrowDown": "next item"
    }
  },

  "tokens_used": ["color-primary", "space-4", "radius-md"],

  "templates": {
    "html": "<button data-ui=\"button\" data-variant=\"{variant}\">{text}</button>",
    "html_with_icon": "<button data-ui=\"button\"><span data-part=\"icon\">{icon}</span>{text}</button>"
  },

  "safe_transforms": ["change-variant", "change-size", "add-icon"],
  "unsafe_transforms": ["remove-button-element", "remove-aria-labelledby"],

  "composition": {
    "contains": ["button", "input"],
    "used_in": ["auth-form", "settings-page"]
  },

  "files": {
    "html": "name.html",
    "css": "name.css",
    "js": "name.js",
    "manifest": "name.manifest.json"
  },

  "tests": ["renders-as-correct-element", "variant-sets-correct-attr"]
}
```

## File Set Per Kind

| Kind | .html | .css | .manifest.json | .js |
|------|-------|------|----------------|-----|
| primitive | Yes | Yes | Yes | No |
| recipe | Yes | Yes | Yes | Yes |
| pattern | Yes | Yes | Yes | No |

## Example: Button (Primitive)

```json
{
  "name": "button",
  "version": "1.0.0",
  "kind": "primitive",
  "category": "actions",
  "description": "Interactive button with multiple visual variants and sizes",
  "anatomy": { "tag": "button", "selector": "[data-ui='button']", "content_model": "inline" },
  "slots": {
    "icon": { "selector": "[data-part='icon']", "required": false, "tag_hint": "span" }
  },
  "variants": {
    "visual": { "values": ["default","primary","secondary","destructive","ghost","outline","link"], "default": "default", "attr": "data-variant" },
    "size": { "values": ["sm","md","lg"], "default": "md", "attr": "data-size" }
  },
  "states": {
    "default": { "attr": "data-state=\"default\"", "default": true },
    "loading": { "attr": "data-state=\"loading\"" },
    "disabled": { "attr": "disabled" }
  },
  "tokens_used": ["color-primary","color-primary-hover","color-primary-fg","radius-md","space-2","space-4","text-sm","weight-medium","duration-fast","ease-default"],
  "safe_transforms": ["change-variant","change-size","add-icon","add-loading-state"],
  "unsafe_transforms": ["remove-button-element","change-to-div-without-role"]
}
```

## Example: Dialog (Recipe)

```json
{
  "name": "dialog",
  "version": "1.0.0",
  "kind": "recipe",
  "category": "overlay",
  "description": "Modal dialog with focus trap, escape-to-close, and overlay backdrop",
  "anatomy": { "tag": "div", "selector": "[data-ui='dialog']", "content_model": "slots" },
  "slots": {
    "trigger": { "selector": "[data-part='trigger']", "required": true },
    "overlay": { "selector": "[data-part='overlay']", "required": true },
    "panel": { "selector": "[data-part='panel']", "required": true },
    "header": { "selector": "[data-part='header']", "required": false },
    "title": { "selector": "[data-part='title']", "required": true },
    "body": { "selector": "[data-part='body']", "required": true },
    "footer": { "selector": "[data-part='footer']", "required": false },
    "close": { "selector": "[data-part='close']", "required": true }
  },
  "variants": {
    "size": { "values": ["sm","md","lg","full"], "default": "md", "attr": "data-size", "applied_to": "panel" },
    "tone": { "values": ["default","danger"], "default": "default", "attr": "data-variant", "applied_to": "panel" }
  },
  "states": {
    "closed": { "attr": "data-state=\"closed\"", "default": true },
    "open": { "attr": "data-state=\"open\"" },
    "closing": { "attr": "data-state=\"closing\"", "transient": true }
  },
  "a11y": {
    "role": "dialog",
    "aria-modal": true,
    "required_attrs": ["aria-labelledby"],
    "focus_trap": true,
    "escape_closes": true,
    "return_focus": "trigger",
    "keyboard": { "Escape": "close dialog", "Tab": "cycle focus within panel" }
  },
  "tokens_used": ["radius-xl","shadow-xl","space-6","z-overlay","z-modal","duration-normal","ease-out"],
  "safe_transforms": ["change-size","change-tone","add-description","change-title-text"],
  "unsafe_transforms": ["remove-overlay","remove-focus-trap","remove-aria-labelledby"]
}
```

## Machine Comments

HTML files start with machine-parseable comments:
```html
<!-- @ui:component dialog -->
<!-- @ui:kind recipe -->
<!-- @ui:slots trigger overlay panel header title body footer close -->
<!-- @ui:variants size=sm|md|lg|full tone=default|danger -->
<!-- @ui:controller dialog.js -->
```

CSS files start with:
```css
/* @ui:component dialog */
/* @ui:tokens radius-xl shadow-xl space-6 z-overlay z-modal ... */
```
