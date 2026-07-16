import { describe, it, expect } from "bun:test";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createFaqirMcpServer } from "../src/server";
import { loadManifestMap } from "../src/registry";
import { auditHtmlSource } from "../../../src/audit/checker";
import { applyRepairsToSource } from "../../../src/audit/repairer";
import type { Manifest } from "../../../src/manifest";

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const REGISTRY = join(REPO_ROOT, "registry");

/** A fresh server + in-process client, with output-schema validators primed. */
async function makeClient() {
  const server = createFaqirMcpServer({ registryPath: REGISTRY });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "faqir-mcp-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  await client.listTools();
  return { client };
}

describe("write/verify tools — registration", () => {
  it("registers generate, scaffold, audit, repair, and theme generation with schemas", async () => {
    const { client } = await makeClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    for (const name of [
      "faqir_generate",
      "faqir_scaffold_page",
      "faqir_audit_html",
      "faqir_repair_html",
      "faqir_generate_theme",
    ]) {
      expect(names).toContain(name);
      const tool = tools.find((t) => t.name === name)!;
      expect((tool.inputSchema as { type?: string }).type).toBe("object");
      expect((tool.outputSchema as { type?: string }).type).toBe("object");
    }
  });
});

describe("faqir_generate → faqir_audit_html (property-style matrix)", () => {
  it("every generated primitive × variant × size passes a full audit", async () => {
    const { client } = await makeClient();
    const manifests = await loadManifestMap(REGISTRY);

    // Matrix: primitives with a self-contained `html` template. `radio` ships only
    // group/single templates; `field-group` is a wiring scaffold that needs a
    // description slot to be audit-clean — both excluded by design.
    const canonical = [...new Set(manifests.values())];
    const matrix = canonical.filter(
      (m) =>
        m.kind === "primitive" &&
        (m.templates as Record<string, string>)?.html &&
        m.name !== "field-group",
    );

    let combos = 0;
    const failures: string[] = [];

    for (const m of matrix) {
      const variantGroup = Object.values(m.variants || {}).find((v) => v.attr === "data-variant");
      const sizeGroup = (m.variants as Record<string, { attr: string; values: string[] }>)?.size;
      const variants = variantGroup ? variantGroup.values : [undefined];
      const sizes = sizeGroup ? sizeGroup.values : [undefined];

      for (const variant of variants) {
        for (const size of sizes) {
          combos++;
          const gen = await client.callTool({
            name: "faqir_generate",
            arguments: { component: m.name, ...(variant ? { variant } : {}), ...(size ? { size } : {}) },
          });
          expect(gen.isError).toBeFalsy();
          const genData = gen.structuredContent as any;

          // Feed the generated HTML straight back into faqir_audit_html.
          const audit = await client.callTool({
            name: "faqir_audit_html",
            arguments: { html: genData.html },
          });
          const auditData = audit.structuredContent as any;
          if (!auditData.passed) {
            failures.push(
              `${m.name} variant=${variant} size=${size}: ` +
                auditData.findings
                  .filter((f: any) => f.severity === "critical" || f.severity === "error")
                  .map((f: any) => `${f.rule_id}`)
                  .join(","),
            );
          }
        }
      }
    }

    expect(combos).toBeGreaterThan(50); // it really is a matrix
    expect(failures).toEqual([]);
  });

  it("rejects an invalid variant cleanly, listing the valid values", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_generate",
      arguments: { component: "button", variant: "banana" },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as any[])[0].text as string;
    expect(text).toContain("Invalid variant 'banana'");
    expect(text).toContain("primary"); // valid values listed
  });

  it("resolves an alias to its canonical component", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_generate",
      arguments: { component: "alert", props: { content: "Heads up" } },
    });
    const data = res.structuredContent as any;
    expect(data.component).toBe("callout");
    expect(data.html).toContain('data-ui="callout"');
  });
});

describe("faqir_audit_html", () => {
  it("returns the expected findings JSON for known-bad HTML", async () => {
    const { client } = await makeClient();
    const bad = `<!DOCTYPE html>
<html lang="en"><body><main>
  <button data-ui="button" data-variant="nope">Broken</button>
  <p id="dup">one</p>
  <p id="dup">two</p>
</main></body></html>`;

    const res = await client.callTool({ name: "faqir_audit_html", arguments: { html: bad } });
    const data = res.structuredContent as any;

    expect(data.passed).toBe(false);
    const byRule = new Set(data.findings.map((f: any) => f.rule_id));
    expect(byRule.has("valid-variant")).toBe(true);
    expect(byRule.has("duplicate-id")).toBe(true);

    const variant = data.findings.find((f: any) => f.rule_id === "valid-variant");
    expect(variant.severity).toBe("error");
    expect(variant.message).toContain("Invalid variant \"nope\"");
    expect(typeof variant.line).toBe("number");

    // Every field of the findings contract is present.
    for (const f of data.findings) {
      expect(f).toHaveProperty("rule_id");
      expect(f).toHaveProperty("severity");
      expect(f).toHaveProperty("message");
      expect(f).toHaveProperty("fixable");
    }
  });

  it("passes clean, valid Faqir markup", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_audit_html",
      arguments: { html: `<button data-ui="button" data-variant="primary" data-size="sm">OK</button>` },
    });
    const data = res.structuredContent as any;
    expect(data.passed).toBe(true);
    expect(data.counts.critical).toBe(0);
    expect(data.counts.error).toBe(0);
  });
});

describe("faqir_repair_html", () => {
  it("round-trips known-bad HTML to a clean audit and logs the change", async () => {
    const { client } = await makeClient();
    const bad = `<!DOCTYPE html>
<html lang="en"><body><main>
  <p id="dup">one</p>
  <p id="dup">two</p>
</main></body></html>`;

    const res = await client.callTool({ name: "faqir_repair_html", arguments: { html: bad } });
    const data = res.structuredContent as any;

    expect(data.before.passed).toBe(false);
    expect(data.applied).toBeGreaterThanOrEqual(1);
    expect(data.changes.some((c: any) => c.rule_id === "duplicate-id")).toBe(true);
    expect(data.after.passed).toBe(true);
    // The repaired HTML is materially different and no longer has the duplicate.
    expect(data.html).not.toBe(bad);
    expect(data.html).toContain("dup-2");
  });

  it("repairs a missing close-button aria-label", async () => {
    const { client } = await makeClient();
    const bad = `<div data-ui="card"><div data-part="body">x</div><button data-part="close">✕</button></div>`;
    const res = await client.callTool({ name: "faqir_repair_html", arguments: { html: bad } });
    const data = res.structuredContent as any;
    expect(data.changes.some((c: any) => c.rule_id === "close-label")).toBe(true);
    expect(data.html).toContain('aria-label="Close"');
  });
});

describe("faqir_scaffold_page", () => {
  it("produces a full, audit-clean page from sections", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_scaffold_page",
      arguments: {
        title: "Demo",
        sections: [
          { heading: "Welcome", level: 1 },
          { component: "button", variant: "primary", props: { text: "Go" } },
          { component: "card", props: { title: "A card" }, slots: { body: "content" } },
        ],
      },
    });
    const data = res.structuredContent as any;

    expect(data.html).toContain("<!DOCTYPE html>");
    expect(data.html).toContain("<main>");
    expect(data.components_used).toEqual(["button", "card"]);
    expect(data.audit.passed).toBe(true);
  });
});

describe("faqir_generate_theme", () => {
  it("returns a contrast-verified web + document theme without filesystem writes", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_generate_theme",
      arguments: {
        name: "agent-brand",
        accent: "oklch(0.9 0.16 85)",
        neutral: "warm",
        radius: "lg",
        scheme: "both",
        document: true,
      },
    });
    expect(res.isError).toBeFalsy();
    const data = res.structuredContent as any;
    expect(data.name).toBe("agent-brand");
    expect(data.generated.map((file: any) => file.kind)).toEqual(["theme", "document"]);
    expect(data.generated[0].css).toContain("--palette-agent-brand-950");
    expect(data.generated[0].manifest.name).toBe("agent-brand");
    expect(data.generated[1].manifest.scheme).toBe("light");
    const ratios = data.generated.flatMap((file: any) => file.contrast);
    expect(ratios.length).toBe(24);
    expect(ratios.every((pair: any) => pair.passes && pair.ratio >= 4.5)).toBe(true);
    expect(ratios.some((pair: any) => pair.auto_adjusted)).toBe(true);
  });

  it("rejects an invalid accent as a clean tool error", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_generate_theme",
      arguments: { name: "bad-brand", accent: "garbage" },
    });
    expect(res.isError).toBe(true);
    expect((res.content as any[])[0].text).toMatch(/Invalid accent.*oklch.*#rrggbb/s);
  });
});

describe("acceptance — an agent with only this server can produce AND self-validate a page", () => {
  it("scaffolds a page, then validates it via faqir_audit_html — tools only", async () => {
    const { client } = await makeClient();

    const scaffold = await client.callTool({
      name: "faqir_scaffold_page",
      arguments: {
        title: "Generated",
        sections: [
          { heading: "Report", level: 1 },
          { component: "badge", variant: "success", props: { text: "Live" } },
          { component: "button", variant: "primary", props: { text: "Refresh" } },
        ],
      },
    });
    const page = (scaffold.structuredContent as any).html as string;

    const audit = await client.callTool({ name: "faqir_audit_html", arguments: { html: page } });
    expect((audit.structuredContent as any).passed).toBe(true);
  });
});

describe("acceptance — audit/repair require zero filesystem access", () => {
  // The audit/repair engines are pure functions over an in-memory manifest map.
  // Here we hand-build a synthetic manifest and drive them directly: no registry,
  // no getRegistryPath, no disk — proving the tools need none per call.
  const syntheticManifest = {
    name: "button",
    version: "1.0.0",
    kind: "primitive",
    category: "actions",
    description: "synthetic",
    anatomy: { tag: "button", selector: "[data-ui='button']", content_model: "inline" },
    slots: {},
    variants: {
      visual: { values: ["default", "primary"], default: "default", attr: "data-variant", applied_to: "root" },
    },
    states: {},
    a11y: {},
    tokens_used: [],
    templates: { html: "<button data-ui=\"button\">{text}</button>" },
    safe_transforms: [],
    unsafe_transforms: [],
    composition: { contains: [], used_in: [] },
    files: { html: "button.html", css: "button.css", manifest: "button.manifest.json" },
    tests: [],
  } as unknown as Manifest;

  // A second synthetic manifest so a component with a `close` part is recognized
  // (per-component rules only run for components present in the map).
  const syntheticCard = { ...syntheticManifest, name: "card", category: "layout" } as Manifest;
  const manifests = new Map<string, Manifest>([
    ["button", syntheticManifest],
    ["card", syntheticCard],
  ]);

  it("audits a string against an in-memory manifest — no filesystem", () => {
    const results = auditHtmlSource({
      source: `<button data-ui="button" data-variant="ghost">x</button>`,
      manifests,
    });
    expect(results.some((r) => r.rule_id === "valid-variant")).toBe(true);
  });

  it("repairs a string with no filesystem access", () => {
    const src = `<div data-ui="card"><div data-part="body">x</div><button data-part="close">✕</button></div>`;
    const results = auditHtmlSource({ source: src, manifests });
    const repaired = applyRepairsToSource(src, results);
    expect(repaired.applied).toBeGreaterThanOrEqual(1);
    expect(repaired.source).toContain('aria-label="Close"');
  });
});

describe("MCP resources", () => {
  it("lists the fixed resources and the manifest template", async () => {
    const { client } = await makeClient();

    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("faqir://protocol");
    expect(uris).toContain("faqir://tokens");
    expect(uris).toContain("faqir://manifests");

    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.some((t) => t.uriTemplate === "faqir://manifest/{name}")).toBe(true);
  });

  it("fetches the protocol spec", async () => {
    const { client } = await makeClient();
    const res = await client.readResource({ uri: "faqir://protocol" });
    const text = (res.contents[0] as { text: string }).text as string;
    expect(res.contents[0].mimeType).toBe("text/markdown");
    expect(text).toContain("Attribute Protocol");
    expect(text).toContain("data-ui");
  });

  it("fetches the token reference as CSS", async () => {
    const { client } = await makeClient();
    const res = await client.readResource({ uri: "faqir://tokens" });
    expect(res.contents[0].mimeType).toBe("text/css");
    expect((res.contents[0] as { text: string }).text as string).toContain("--");
  });

  it("fetches a single manifest via the resource template", async () => {
    const { client } = await makeClient();
    const res = await client.readResource({ uri: "faqir://manifest/button" });
    const manifest = JSON.parse((res.contents[0] as { text: string }).text as string);
    expect(manifest.name).toBe("button");
    expect(manifest.kind).toBe("primitive");
  });

  it("lists manifests through the template's list callback", async () => {
    const { client } = await makeClient();
    const res = await client.readResource({ uri: "faqir://manifests" });
    const index = JSON.parse((res.contents[0] as { text: string }).text as string);
    expect(index.count).toBeGreaterThan(10);
    expect(index.components.some((c: any) => c.name === "button")).toBe(true);
  });
});
