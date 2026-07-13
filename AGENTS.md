# AGENTS.md

## Scope

These instructions apply to the entire repository. Preserve unrelated local
changes and keep each change focused on the requested behavior.

## Project overview

Faqir UI is an agent-native, manifest-driven UI framework. The repository
contains:

- a Bun/TypeScript CLI in `src/`;
- a distributable component registry in `registry/`;
- the reactive browser engine source in `src/core-src/engine.js`;
- package workspaces in `packages/`;
- tests in `tests/`, generally mirroring the source layout.

Development uses Bun 1.3 or newer. The compiled CLI and published packages must
continue to run on Node.js 18 or newer. The codebase uses ESM and strict
TypeScript.

## Sources of truth

- Read `README.md` for public behavior and architecture.
- Read `CONTRIBUTING.md` before changing registry components, generated files,
  packaging, or release behavior.
- Treat code and tests as the authority when planning documents disagree with
  the implemented repository.
- `src/command-registry.ts` is the command-registration source of truth.
- `manifest.schema.json` and the validation code in `src/manifest.ts` and
  `src/theme-manifest.ts` define manifest contracts.

## Setup and common commands

```bash
bun install
bun run dev                 # run the CLI from src/index.ts
bun test                    # full Bun test suite
bun test tests/path.test.ts # targeted test file
bun run typecheck           # root and MCP TypeScript checks
bun run build:cli           # build dist/faqir.mjs
bun run smoke               # exercise the Node-compatible CLI end to end
bun run audit:registry      # validate registry integrity
```

Other relevant checks:

```bash
bun run test:a11y
bun run test:visual
bun run size
bun run check:package
bun run check:registry-index
bun run check:skill
bun run check:schema-refs
```

Run the smallest relevant test while iterating. Before handing off a broad
change, run `bun test` and `bun run typecheck`; add build, smoke, registry,
accessibility, or visual checks when the affected area requires them. Do not
update visual snapshots unless the visual change is intentional. Local visual
baselines are ignored because canonical rendering happens in the pinned CI
environment.

## Implementation conventions

- Follow nearby code style; no repository-wide formatter or linter is defined.
- Prefer small, explicit changes over unrelated refactors.
- Add or update tests for behavior changes and regressions.
- Keep the CLI compatible with both Bun development and the Node-compatible
  bundle. Use the runtime abstraction in `src/utils/runtime-shim.ts` when a Bun
  global would otherwise leak into the published Node path.
- Do not add runtime dependencies to the core framework. The registry and
  browser runtime are designed to remain zero-dependency.
- Keep output deterministic in generators and build scripts. Avoid timestamps,
  unstable traversal order, and machine-specific paths in committed artifacts.
- Use imperative, concise commit messages that explain the intent.

## Registry component rules

Component directories live under `registry/primitives/`, `registry/recipes/`,
and `registry/patterns/`. Preserve the five-attribute protocol:

- `data-ui` identifies a component root.
- `data-part` identifies a child slot.
- `data-state` expresses runtime state.
- `data-variant` expresses a visual variant.
- `data-size` expresses a size variant.

For component CSS:

- use attribute selectors, not classes, for identity, parts, variants, or state;
- reference design tokens with `var(--token-name)` instead of hardcoded design
  values;
- do not use `!important`, ID selectors, or cross-component `@import` rules;
- keep selector specificity low;
- include a reduced-motion fallback for animation.

Every component needs canonical HTML, CSS, and a schema-valid manifest. Recipe
controllers additionally must:

- carry `// @ui:controller {name}` and export `create{Name}(root)`;
- be idempotent and prevent double initialization;
- scope part queries to the component root;
- represent state through `root.dataset.state`;
- return an API with `destroy()` cleanup;
- import helpers only from `registry/core/` via `../../core/...` and use no
  external dependencies.

Accessibility metadata and behavior are part of the component contract. Keep
ARIA relationships, keyboard behavior, focus management, reduced motion, and
manifest `a11y` declarations aligned with the implementation.

## Generated and committed artifacts

Do not hand-edit generated outputs. Change their source and regenerate them:

- `registry/core/faqir-core.js`: edit `src/core-src/engine.js` or a recipe
  controller, then run `bun run build:core`. This generated engine is committed.
- `registry/primitives/icon/{icons.css,icon.manifest.json,icon.html}`: edit
  `scripts/icons/curated-icons.txt` and the pinned SVG inputs, then run
  `bun run build:icons`.
- `registry/themes/*.theme.json`: edit theme CSS and the editorial seed in
  `scripts/gen-theme-manifests.mjs`, then run `bun run gen:theme-manifests`.
  Never hand-write `tokens_overridden` or `tokens_inherited`.
- `registry/registry-index.json`: run `bun run build:registry-index` after
  registry changes that affect the index.
- `.claude/skills/faqir-creator/`: run `bun run gen:skill` after relevant
  manifest or generator changes.
- Manifest `$schema` references: run `bun run gen:schema-refs`; use
  `bun run check:schema-refs` to verify drift.
- Root `dist/`, `packages/core/dist/`, and `packages/mcp/registry/` are ignored
  build outputs. Rebuild them for verification; do not force-add them.

When a generated artifact is tracked, commit the regenerated output together
with its source change.

## CLI and package changes

- Keep command definitions centralized through `src/command-registry.ts`.
- Preserve stable machine-readable output, especially JSON modes and exit codes.
- For CLI runtime or packaging changes, run `bun run build:cli`, `bun run smoke`,
  and the relevant launcher/build tests.
- For MCP changes, test under `packages/mcp/` as well as running the root
  typecheck. Build with `bun run build:mcp` when packaging is affected.
- For CDN/core package changes, regenerate with `bun run build:core-package` and
  check size-sensitive behavior.

## Completion checklist

Before finishing:

1. Review the diff for accidental generated, snapshot, or unrelated changes.
2. Run targeted tests for the changed behavior.
3. Run the broad checks appropriate to the change.
4. Regenerate and verify every affected committed artifact.
5. Report what changed, what was tested, and any check that could not be run.
