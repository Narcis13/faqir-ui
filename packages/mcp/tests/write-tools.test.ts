import { describe, it, expect } from "bun:test";
import { CONTRAST_PAIRS } from "../../../src/audit/contrast-tokens";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createFaqirMcpServer } from "../src/server";
import { loadManifestMap } from "../src/registry";
import { auditHtmlSource } from "../../../src/audit/checker";
import { applyRepairsToSource } from "../../../src/audit/repairer";
import {
  generateThemeBundle,
  THEME_SCORECARD_VERSION,
} from "../../../src/commands/theme-generate";
import { themeBaseSources } from "../../../src/theme/sources";
import { validateThemeAxes, validateThemeSeed } from "../../../src/theme-manifest";
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
    const bad = `<div data-ui="card"><div data-part="body">x</div><button data-part="close"><svg aria-hidden="true"></svg></button></div>`;
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
    // One entry per declared token pair per scheme. Derived from the pair list
    // rather than hardcoded: it grew in W3-3 (the focus ring, and the two pairs
    // the gate had exempted by forgetting), and a literal read as a regression.
    expect(ratios.length).toBe(CONTRAST_PAIRS.length * 3);
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

  // ── Seed parity with the CLI [1.1A-11] ───────────────────────────────────

  it("takes a full seed object and returns scorecard v2", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_generate_theme",
      arguments: {
        seed: {
          name: "agent-seeded",
          accent: "oklch(0.55 0.2 150)",
          depth: "hard",
          density: "compact",
          type: { pairing: "slab", scale: 1.25 },
          controls: { input: "underline" },
        },
      },
    });
    expect(res.isError).toBeFalsy();
    const data = res.structuredContent as any;
    const card = data.scorecard;
    expect(card.scorecard_version).toBe(THEME_SCORECARD_VERSION);
    expect(card.command).toBe("theme generate");
    // The seed comes back filled out, and validates against the same
    // `definitions.themeSeed` the CLI writes to `<name>.seed.json`.
    expect(validateThemeSeed(card.seed)).toEqual([]);
    expect(card.seed.depth).toBe("hard");
    expect(card.seed.type).toEqual({
      pairing: "slab",
      scale: 1.25,
      base: 16,
      voice: { weight: "bold", tracking: "normal", transform: "none" },
    });
    // …and the axes are DERIVED from the CSS this call returned.
    expect(validateThemeAxes(card.axes)).toEqual([]);
    expect(card.axes.controls.input).toBe("underline");
    expect(card.axes.density).toBe("compact");
    // The three guarantees v1 could not see, all present and all measured.
    expect(card.elevation.every((row: any) => row.passes)).toBe(true);
    expect(card.focus_ring.every((row: any) => row.passes)).toBe(true);
    expect(card.tap_targets.length).toBeGreaterThan(0);
    expect(card.tap_targets.every((row: any) => row.density === "compact" && row.passes)).toBe(true);
    // This tool writes nothing: the paths say where the CLI WOULD write.
    expect(card.generated[0].css).toBe("themes/agent-seeded.css");
    expect(card.generated[0].seed).toBe("themes/agent-seeded.seed.json");
    // The 1.0 shape is still there beside it, in memory as always.
    expect(data.generated[0].css).toContain("--palette-agent-seeded-500");
    expect(data.generated[0].manifest.seed).toEqual(card.seed);
  });

  it("a scalar argument overrides the seed it is passed with", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_generate_theme",
      arguments: {
        seed: { name: "from-seed", accent: "#0ea5e9", depth: "hard" },
        name: "overridden",
        document: true,
      },
    });
    expect(res.isError).toBeFalsy();
    const data = res.structuredContent as any;
    expect(data.name).toBe("overridden");
    expect(data.scorecard.seed.depth).toBe("hard");
    expect(data.generated.map((file: any) => file.kind)).toEqual(["theme", "document"]);
  });

  it("rejects an invalid axis with the SAME sentence the CLI prints", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_generate_theme",
      arguments: { seed: { name: "bad-axis", accent: "#0ea5e9", depth: "fluffy" } },
    });
    expect(res.isError).toBe(true);
    // One code path, one error text: the message is `validateThemeSeed`'s,
    // reached through `normalizeSeed` — exactly as `faqir theme generate
    // --depth fluffy` reaches it. Quoted from the validator rather than
    // retyped, so the two cannot drift apart silently.
    const expected = validateThemeSeed({ name: "bad-axis", accent: "#0ea5e9", depth: "fluffy" });
    expect(expected.length).toBe(1);
    expect((res.content as any[])[0].text)
      .toContain(`${expected[0].field}: ${expected[0].message}`);
  });

  it("generates from the same base layer the CLI does", async () => {
    // `readTokenReference` hands over ONE concatenated string, so the surface
    // derived from it used to include `density.css` and `textures.css` — the
    // two files `NON_SURFACE_TOKEN_FILES` exists to keep out. Both callers now
    // read through `themeBaseSources`, so `tokens_inherited` is the same set.
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_generate_theme",
      arguments: { seed: { name: "parity-brand", accent: "#168c5b" } },
    });
    const data = res.structuredContent as any;
    const local = generateThemeBundle(
      { name: "parity-brand", accent: "#168c5b" },
      themeBaseSources(REGISTRY),
    );
    expect(data.generated[0].css).toBe(local.generated[0].css);
    expect(data.generated[0].manifest).toEqual(local.generated[0].manifest);
    expect(data.generated[0].manifest.tokens_inherited).not.toContain("density-scale");
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
    const src = `<div data-ui="card"><div data-part="body">x</div><button data-part="close"><svg aria-hidden="true"></svg></button></div>`;
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
