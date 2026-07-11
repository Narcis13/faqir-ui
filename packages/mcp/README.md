# @faqir-ui/mcp

A **stdio [Model Context Protocol](https://modelcontextprotocol.io) server** for
[Faqir UI](https://github.com/Narcis13/faqir-ui). It exposes the Faqir registry,
component manifests, themes, and host-project context to any MCP host — Claude
Code, Cursor, or anything else that speaks MCP — so an agent can browse and
understand Faqir components **without shelling out to the CLI**.

The server wraps the *same* TypeScript internals as the `faqir` CLI (one core,
two frontends), so the two can never drift. It ships compiled JS and runs on
plain Node ≥ 18.

> **Status — v0.5-01.** This release provides server boot and the **read tools**.
> Write/verify tools (`faqir_generate`, `faqir_scaffold_page`, `faqir_audit_html`,
> `faqir_repair_html`, …), MCP resources, and `npx` packaging land in v0.5-02.

## Tools

All tools are read-only and return structured JSON validated against a declared
MCP output schema.

| Tool | Input | Returns |
|------|-------|---------|
| `faqir_list_components` | `{ kind?, category? }` | Registry inventory — name, kind, category, description, layer, aliases. Filterable by `kind` (`primitive` \| `recipe` \| `pattern` \| `scaffold`) and/or `category`. |
| `faqir_get_manifest` | `{ component }` | The full manifest for one component (anatomy, slots, variants, states, a11y, tokens, templates, transforms, composition). Accepts aliases (`alert` → `callout`). Errors cleanly on an unknown name, with a "did you mean …?" hint. |
| `faqir_theme_info` | `{ theme? }` | With no argument: a summary card for every registry theme (mood, scheme, dark mode, pairings). With `theme`: that theme's full manifest, including its overridden/inherited token sets. `active_theme` reflects the host project's configured theme when run inside one. |
| `faqir_project_context` | `{ root? }` | Whether the directory is a Faqir project (`faqir.config.json` present), its config, and the generated `.faqir/context.json` (installed components, active theme, protocol, rules) when available. Defaults to the server's working directory. |

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

Until the `npx @faqir-ui/mcp` package ships (v0.5-02), point your MCP host at the
compiled bundle. **Claude Code** — `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "faqir": {
      "command": "node",
      "args": ["/absolute/path/to/faqir/packages/mcp/dist/index.mjs"]
    }
  }
}
```

**Cursor** — `~/.cursor/mcp.json` (or a project `.cursor/mcp.json`) uses the same
`command` / `args` shape.

The host launches the server with your project as its working directory, so
`faqir_project_context` reads *that* project's `.faqir/context.json`.

## License

MIT
