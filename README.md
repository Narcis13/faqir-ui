# Loom UI CLI

Loom is an agent-native, HTML-first UI framework distributed as a Bun CLI. It installs plain HTML, CSS, and vanilla JavaScript components, keeps their contracts in JSON manifests, and audits projects for regressions and anti-patterns.

## Principles

- Zero external runtime dependencies
- No framework runtime
- No required build step for generated UI
- Component identity via `data-ui`
- State via `data-state`
- Styling via tokens, not hardcoded values

## Requirements

- Bun `1.3.8+`

## Install

```bash
bun install
```

Run the CLI locally:

```bash
bun run src/index.ts --help
```

Or use the published package name:

```bash
bunx @loom-ui/cli --help
```

## Quick Start

Initialize a project:

```bash
bun run src/index.ts init
```

Add a few components:

```bash
bun run src/index.ts add button dialog tabs dropdown
```

Generate the self-hosted gallery:

```bash
bun run src/index.ts gallery
```

Audit the entire project:

```bash
bun run src/index.ts audit
```

Repair deterministic issues:

```bash
bun run src/index.ts repair --file repairable-page.html
```

## Example Flow

```bash
bun run src/index.ts init --dir design-system
bun run src/index.ts add auth-form dashboard-shell
bun run src/index.ts theme set midnight
bun run src/index.ts scaffold admin-dashboard
bun run src/index.ts gallery
bun run src/index.ts audit
```

This creates:

- `design-system/tokens/` for design tokens
- `design-system/primitives/`, `recipes/`, and `patterns/` for installed assets
- `design-system/loom.js` for controller wiring
- `.loom/context.json` for agent-readable project context
- `design-system/gallery.html` for the component gallery

## Commands

```text
loom init
loom add <name...>
loom list
loom inspect <name>
loom doctor
loom gallery
loom audit [--json] [--file <path>]
loom repair [--json] [--file <path>]
loom context
loom explain <name>
loom trace <name>
loom conform
loom theme <set|create|list>
loom scaffold <name>
loom variant <add|remove>
```

## Audit Rules

`loom audit` checks manifest contracts and Loom anti-patterns across:

- component HTML snippets
- project HTML files
- installed component CSS
- installed recipe controllers
- generated `loom.js`

Anti-pattern enforcement includes:

- no class names inside Loom component markup
- no class selectors in component CSS
- no ID selectors in component CSS
- no `!important` in component CSS
- no hardcoded color, spacing, or shadow values in component CSS
- no external dependencies in controllers
- no lifecycle observers in runtime code
- no HTML generation via template literals or `innerHTML`
- no routing, data fetching, SSR, or external state managers in controllers
- no build-tool globals such as `import.meta.env` or `process.env`

## Gallery

`loom gallery` auto-installs the full registry if needed and writes `ui/gallery.html` (or your configured output directory). The gallery is self-hosted: open the HTML file directly in a browser with the generated CSS and JS assets beside it.

## Benchmarks And Full Audit

Run the full-registry audit smoke:

```bash
bun run audit:all
```

Run benchmark suites:

```bash
bun run bench
bun run bench -- --iterations 5 --json
```

The benchmark script measures:

- a CLI smoke path (`init`, `add`, `audit`)
- a full gallery path (`init`, `gallery`, `audit`)

## Testing

```bash
bun test
```

Phase 9 verification commands:

```bash
bun test
bun run audit:all
bun run bench
```

## Publish

The package is configured for npm as `@loom-ui/cli` with public scoped publishing:

```bash
npm publish --access public
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local workflow, test expectations, anti-pattern rules, and release steps.
