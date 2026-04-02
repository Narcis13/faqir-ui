# Design Tokens Reference

Three-layer token system: palette (raw) -> semantic (purpose) -> aliases (theme overrides).

Always use `var(--token-name)` — never hardcode values.

---

## Colors (Semantic)

```
--color-bg                  Main background
--color-bg-subtle           Slightly off background
--color-bg-muted            Muted background (hover states)
--color-fg                  Main text
--color-fg-muted            Secondary text
--color-fg-subtle           Tertiary text
--color-primary             Primary brand color
--color-primary-hover       Primary hover
--color-primary-active      Primary active/pressed
--color-primary-fg          Text on primary
--color-primary-subtle      Light primary background
--color-secondary           Secondary color
--color-secondary-hover     Secondary hover
--color-secondary-fg        Text on secondary
--color-destructive         Danger/error color
--color-destructive-hover   Danger hover
--color-destructive-fg      Text on destructive
--color-destructive-subtle  Light destructive background
--color-success             Success color
--color-success-subtle      Light success background
--color-warning             Warning color
--color-warning-subtle      Light warning background
--color-info                Info color
--color-info-subtle         Light info background
--color-border              Default border
--color-border-strong       Emphasis border
--color-ring                Focus ring
```

## Spacing

4px base, harmonic scale.

```
--space-0     0
--space-px    1px
--space-0h    2px
--space-1     4px      --space-1h    6px
--space-2     8px      --space-2h    10px
--space-3     12px     --space-3h    14px
--space-4     16px     --space-5     20px
--space-6     24px     --space-7     28px
--space-8     32px     --space-10    40px
--space-12    48px     --space-16    64px
--space-20    80px     --space-24    96px
```

## Typography

```
--font-sans     system-ui, -apple-system, sans-serif
--font-mono     ui-monospace, monospace
--font-serif    Georgia, serif

--text-xs       0.75rem   (12px)
--text-sm       0.875rem  (14px)
--text-base     1rem      (16px)
--text-lg       1.125rem  (18px)
--text-xl       1.25rem   (20px)
--text-2xl      1.5rem    (24px)
--text-3xl      1.875rem  (30px)
--text-4xl      2.25rem   (36px)

--weight-normal     400
--weight-medium     500
--weight-semibold   600
--weight-bold       700

--leading-tight     1.25
--leading-snug      1.375
--leading-normal    1.5
--leading-relaxed   1.625
```

## Effects

```
--radius-none   0
--radius-sm     4px
--radius-md     6px
--radius-lg     8px
--radius-xl     12px
--radius-2xl    16px
--radius-full   9999px

--shadow-xs     0 1px 2px oklch(0 0 0 / 0.05)
--shadow-sm     0 1px 3px oklch(0 0 0 / 0.1)
--shadow-md     0 4px 6px oklch(0 0 0 / 0.1)
--shadow-lg     0 10px 15px oklch(0 0 0 / 0.1)
--shadow-xl     0 20px 25px oklch(0 0 0 / 0.1)
```

## Z-Index

```
--z-base        0
--z-raised      1
--z-dropdown    50
--z-sticky      100
--z-overlay     200
--z-modal       300
--z-toast       400
--z-max         9999
```

## Motion

```
--ease-default   cubic-bezier(0.4, 0, 0.2, 1)
--ease-in        cubic-bezier(0.4, 0, 1, 1)
--ease-out       cubic-bezier(0, 0, 0.2, 1)
--ease-in-out    cubic-bezier(0.4, 0, 0.2, 1)
--ease-bounce    cubic-bezier(0.34, 1.56, 0.64, 1)

--duration-instant    50ms
--duration-fast       150ms
--duration-normal     250ms
--duration-slow       350ms
--duration-slower     500ms
```

Always wrap animations in reduced-motion media query:
```css
@media (prefers-reduced-motion: reduce) {
  [data-ui="component"] { transition: none; animation: none; }
}
```
