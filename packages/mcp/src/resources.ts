/**
 * MCP resource content — the protocol spec and manifest index an agent can pin
 * into context. The token reference lives in `registry.ts` (it reads the token
 * CSS). Resource URIs are namespaced under `faqir://`.
 */
import type { Manifest } from "../../../src/manifest";

export const PROTOCOL_URI = "faqir://protocol";
export const TOKENS_URI = "faqir://tokens";
export const MANIFEST_INDEX_URI = "faqir://manifests";
export const MANIFEST_URI_PREFIX = "faqir://manifest/";

/**
 * The Faqir attribute protocol, as a self-contained Markdown reference. This is
 * the single source an agent needs to author correct Faqir markup: the five data
 * attributes, how CSS targets them, and the non-negotiable authoring rules the
 * audit enforces. Static text — the protocol is a stable contract, not derived.
 */
export function buildProtocolSpec(): string {
  return `# Faqir UI — Attribute Protocol

Faqir components are **zero-class**: identity, structure, variants, and state all
live in \`data-*\` attributes, and CSS targets those attributes. Never use \`class\`
for component styling or state.

## The five attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| \`data-ui\` | Component identity — what this element *is* | \`data-ui="button"\` |
| \`data-part\` | A named slot/role inside a component | \`data-part="panel"\` |
| \`data-variant\` | Visual variant | \`data-variant="primary"\` |
| \`data-size\` | Size variant | \`data-size="sm"\` |
| \`data-state\` | Runtime state (set by JS controllers) | \`data-state="open"\` |

## CSS targeting

- Component: \`[data-ui="button"]\`
- Part: \`[data-ui="dialog"] [data-part="panel"]\`
- Variant: \`[data-ui="button"][data-variant="primary"]\`
- State: \`[data-ui="dialog"][data-state="open"]\`
- Theme: \`data-theme="dark"\` on \`<html>\` switches token values.

## Authoring rules (enforced by \`faqir_audit_html\`)

- Use \`data-state\`, never CSS classes, for runtime state.
- Reference design tokens via \`var(--token-name)\` — never hardcode colors, spacing, or radii.
- Every required slot (\`data-part\`) declared in a component's manifest must be present.
- Provide required ARIA per the manifest: e.g. an icon-only button needs \`aria-label\`;
  a dialog panel needs \`role="dialog"\` + \`aria-labelledby\` pointing at its title id.
- Interactive **recipes** (dialog, tabs, dropdown, …) need their JS controller loaded —
  include \`ui/core/faqir.js\` (auto-init) or import the named controller factory.
- IDs must be unique per document; headings must not skip levels; a full page needs a
  \`<main>\` landmark and dialogs must live outside it.
- CSS must avoid \`!important\`, class/id selectors, and physical (LTR-only) properties —
  use logical properties (\`margin-inline-start\`, \`inset-inline-end\`, \`text-align: start\`).

## Workflow for agents

1. \`faqir_list_components\` / \`faqir_get_manifest\` — discover components and their contracts.
2. \`faqir_generate\` — render one component (audit-verified before it is returned).
3. \`faqir_scaffold_page\` — compose components into a full, landmark-correct page.
4. \`faqir_audit_html\` — validate any HTML string you produced.
5. \`faqir_repair_html\` — auto-fix the deterministic findings, then re-audit.
`;
}

/** A compact index of every registry manifest, for the `faqir://manifests` resource. */
export function buildManifestIndex(manifests: Map<string, Manifest>): {
  count: number;
  components: Array<{ name: string; kind: string; category: string; description: string; uri: string }>;
} {
  // De-duplicate alias keys — index the canonical manifests only.
  const seen = new Set<string>();
  const components: Array<{ name: string; kind: string; category: string; description: string; uri: string }> = [];
  for (const manifest of manifests.values()) {
    if (seen.has(manifest.name)) continue;
    seen.add(manifest.name);
    components.push({
      name: manifest.name,
      kind: manifest.kind,
      category: manifest.category,
      description: manifest.description,
      uri: `${MANIFEST_URI_PREFIX}${manifest.name}`,
    });
  }
  components.sort((a, b) => a.name.localeCompare(b.name));
  return { count: components.length, components };
}
