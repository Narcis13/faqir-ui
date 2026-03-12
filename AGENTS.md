# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the Bun CLI entrypoint and command implementation. Use `src/commands/` for user-facing commands such as `init`, `add`, and `doctor`, `src/utils/` for shared filesystem/config helpers, and `src/generator/` for generated project context. `registry/` stores shipped CSS, JS, HTML, and `*.manifest.json` component assets grouped by `base/`, `core/`, `primitives/`, `themes/`, and `tokens/`. Tests live in `tests/commands/` and currently exercise the CLI end to end.

## Build, Test, and Development Commands
Install dependencies with `bun install`.

- `bun test`: runs the Bun test suite in `tests/`.
- `bun run src/index.ts --help`: executes the CLI locally without publishing.
- `bun run src/index.ts init --dir design-system`: creates a sample output tree for manual verification.

There is no separate build step today; TypeScript is checked through Bun execution plus the strict `tsconfig.json` settings.

## Coding Style & Naming Conventions
Write TypeScript as ES modules with strict typing enabled. Follow the existing style: 2-space indentation, semicolons, double quotes, and small focused functions. Name command files by action (`add.ts`, `inspect.ts`) and keep exported helpers descriptive, for example `resolveRegistryPath`. Use `camelCase` for variables/functions, `PascalCase` for types, and kebab-case for registry asset folders such as `registry/primitives/button/`.

No ESLint or Prettier config is checked in, so match the surrounding file format exactly when editing.

## Testing Guidelines
Tests use `bun:test`. Add new CLI behavior under `tests/commands/*.test.ts`, mirroring the command name when possible. Prefer temporary project fixtures created with `mkdtemp` and verify observable outcomes such as generated files, config updates, exit codes, and console output. Run `bun test` before opening a PR.

## Commit & Pull Request Guidelines
Recent history uses short summaries (`Phase 1`, `Phase 2`), but future commits should be more specific and imperative, for example `Add doctor validation for invalid manifests`. Keep each commit focused on one change. PRs should include a concise description, linked issue or task if available, test evidence (`bun test`), and example CLI output or screenshots when command behavior changes.

## Configuration Notes
Schema files such as `loom.config.schema.json` and `manifest.schema.json` define contract shape. Update them alongside any config or manifest format change.
