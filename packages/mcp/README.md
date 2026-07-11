# @faqir-ui/mcp

A **stdio [Model Context Protocol](https://modelcontextprotocol.io) server** for
[Faqir UI](https://github.com/Narcis13/faqir-ui). It exposes the Faqir registry,
component manifests, themes, and host-project context to any MCP host — Claude
Code, Cursor, or anything else that speaks MCP — so an agent can browse and
understand Faqir components **without shelling out to the CLI**.

The server wraps the *same* TypeScript internals as the `faqir` CLI (one core,
two frontends), so the two can never drift. It ships compiled JS and runs on
plain Node ≥ 18.

> **Status — v0.5-02.** Read tools, **write/verify tools** (`faqir_generate`,
> `faqir_scaffold_page`, `faqir_audit_html`, `faqir_repair_html`), MCP resources
> (protocol spec, token reference, manifests), and `npx` packaging. An agent with
> only this server can produce a page **and** self-validate it — no filesystem,
> no CLI.

## Tools

### Read tools

Read-only; each returns structured JSON validated against a declared MCP output schema.

| Tool | Input | Returns |
|------|-------|---------|
| `faqir_list_components` | `{ kind?, category? }` | Registry inventory — name, kind, category, description, layer, aliases. Filterable by `kind` (`primitive` \| `recipe` \| `pattern` \| `scaffold`) and/or `category`. |
| `faqir_get_manifest` | `{ component }` | The full manifest for one component (anatomy, slots, variants, states, a11y, tokens, templates, transforms, composition). Accepts aliases (`alert` → `callout`). Errors cleanly on an unknown name, with a "did you mean …?" hint. |
| `faqir_theme_info` | `{ theme? }` | With no argument: a summary card for every registry theme (mood, scheme, dark mode, pairings). With `theme`: that theme's full manifest, including its overridden/inherited token sets. `active_theme` reflects the host project's configured theme when run inside one. |
| `faqir_project_context` | `{ root? }` | Whether the directory is a Faqir project (`faqir.config.json` present), its config, and the generated `.faqir/context.json` (installed components, active theme, protocol, rules) when available. Defaults to the server's working directory. |

### Write / verify tools

| Tool | Input | Returns |
|------|-------|---------|
| `faqir_generate` | `{ component, variant?, size?, slots?, props?, id?, template? }` | Component HTML rendered from the manifest template, **audit-verified before it is returned** — valid variant/size, required slots and ARIA present. `props`/`slots` fill the template's `{placeholders}` by name; invalid `variant`/`size` errors cleanly with the valid values. Recipes report the controller they need via `requires_controller`. |
| `faqir_scaffold_page` | `{ title?, layout?, stylesheet?, sections }` | A complete, landmark-correct HTML document. `sections` is an ordered list of components (`{ component, variant?, size?, props?, slots? }`), headings (`{ heading, level? }`), or raw HTML (`{ html }`). Content is wrapped in `<main>`; recipe controllers are auto-included; the whole page is audited. |
| `faqir_audit_html` | `{ html, skip_rules? }` | Findings JSON — `{ passed, counts, findings[] }` (rule id, severity, line, message, `fixable`). **String in, no filesystem** — a cloud agent with no disk can validate its own output. |
| `faqir_repair_html` | `{ html, skip_rules? }` | `{ html, applied, skipped, changes[], before, after }` — deterministic auto-fixes applied to the string (missing ARIA, safe duplicate-id renames, field-group wiring) plus before/after audits. **String in, string out, no filesystem.** |
| `faqir_generate_theme` | `{ accent?, name? }` | Parametric theme from an accent color. **Not yet implemented** (lands in task 0.6-11) — returns `{ implemented: false, planned_in }` cleanly instead of erroring. |

## Resources

Pinned into a host's context so an agent can author correct markup offline:

| URI | Type | Contents |
|-----|------|----------|
| `faqir://protocol` | `text/markdown` | The `data-ui`/`data-part`/`data-variant`/`data-size`/`data-state` protocol and the authoring rules the audit enforces. |
| `faqir://tokens` | `text/css` | Every design token (`var(--…)`), assembled from the registry token files in cascade order. |
| `faqir://manifests` | `application/json` | Index of every component manifest, each with its `faqir://manifest/{name}` URI. |
| `faqir://manifest/{name}` | `application/json` | The full manifest for a single component (aliases resolve). |

## Running

**Dev (Bun):**

```sh
bun run src/index.ts
```

**Compiled (plain Node ≥ 18):**

```sh
bun run build          # → dist/index.mjs (bundles the SDK + shared internals)
node dist/index.mjs
```

The server communicates over stdio; diagnostics go to **stderr** so stdout stays
a clean MCP channel.

### Environment overrides

| Variable | Purpose |
|----------|---------|
| `FAQIR_REGISTRY_PATH` | Point the server at a specific registry root (defaults to the bundled registry). |
| `FAQIR_PROJECT_ROOT` | The host project root for `faqir_project_context` (defaults to `process.cwd()`). |

## Host configuration

The published package is `npx`-ready — the registry ships inside it, so no local
checkout is needed.

**Claude Code** — add it with the CLI:

```sh
claude mcp add faqir -- npx -y @faqir-ui/mcp
```

…or by hand in `.mcp.json` at your project root:

```json
{
  "mcpServers": {
    "faqir": {
      "command": "npx",
      "args": ["-y", "@faqir-ui/mcp"]
    }
  }
}
```

**Cursor** — `~/.cursor/mcp.json` (or a project `.cursor/mcp.json`), same shape:

```json
{
  "mcpServers": {
    "faqir": {
      "command": "npx",
      "args": ["-y", "@faqir-ui/mcp"]
    }
  }
}
```

To pin a local checkout instead (development), point `command`/`args` at the
compiled bundle — `{ "command": "node", "args": ["/abs/path/faqir/packages/mcp/dist/index.mjs"] }`.

The host launches the server with your project as its working directory, so
`faqir_project_context` reads *that* project's `.faqir/context.json`.

## License

MIT
