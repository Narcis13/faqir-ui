# Contributing

## Setup

```bash
bun install
```

Primary local commands:

```bash
bun test
bun run audit:all
bun run bench
bun run src/index.ts --help
```

## Workflow

1. Make the smallest coherent change.
2. Keep HTML, CSS, JS, manifests, and schemas aligned.
3. Add or update tests for any command, audit rule, or registry behavior change.
4. Run `bun test` before opening a PR.
5. Run `bun run audit:all` when changing registry assets, the gallery, or audit logic.

## Repository Conventions

- Use strict TypeScript with ES modules.
- Match the existing format: 2 spaces, semicolons, double quotes.
- Keep functions small and focused.
- Put user-facing commands in `src/commands/`.
- Put shared helpers in `src/utils/`.
- Put shipped assets in `registry/`.
- Update `manifest.schema.json` or `loom.config.schema.json` when contract shapes change.

## Anti-Patterns

These rules are enforced by `loom audit` and should be treated as non-negotiable:

- Do not use classes for component identity or state.
- Do not hardcode color, spacing, or shadow values in component CSS.
- Do not use `!important` in component CSS.
- Do not use ID selectors in component CSS.
- Do not add external dependencies to runtime code.
- Do not add lifecycle observers or framework-style runtimes.
- Do not generate HTML from template literals or `innerHTML`.
- Do not add routing, data fetching, SSR, or extra state management layers.
- Do not rely on build-tool globals in shipped runtime code.

## Registry Changes

When editing or adding components:

- Keep the DOM contract centered on `data-ui`, `data-part`, `data-state`, `data-variant`, and `data-size`.
- Keep manifests accurate and machine-readable.
- Prefer token aliases when a component needs a reusable composite value.
- Make sure snippets remain browser-openable without bundling.

Useful validation loop:

```bash
bun run src/index.ts init
bun run src/index.ts add --all
bun run src/index.ts gallery
bun run src/index.ts audit
```

## Tests

Add command coverage in `tests/commands/`.

Prefer:

- temporary directories via `mkdtemp`
- observable CLI results
- JSON audit output when asserting rule ids
- fixture HTML for broken or edge-case markup

## Release Checklist

1. Run `bun test`.
2. Run `bun run audit:all`.
3. Run `bun run bench`.
4. Review `README.md`, `CONTRIBUTING.md`, and any schema changes.
5. Bump the package version in `package.json`.
6. Publish with `npm publish --access public`.
