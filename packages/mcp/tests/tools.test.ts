import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createFaqirMcpServer, type FaqirMcpServerOptions } from "../src/server";
import { init } from "../../../src/commands/init";
import { add } from "../../../src/commands/add";
import { context } from "../../../src/commands/context";

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const REGISTRY = join(REPO_ROOT, "registry");
const TMP = join(import.meta.dir, ".tmp-mcp");
const IN_PROJECT = join(TMP, "in-project");
const NO_PROJECT = join(TMP, "no-project");

/**
 * Spin up a fresh server and an in-process client linked to it (SDK test
 * transport). `listTools()` is called so the client caches output-schema
 * validators — every subsequent `callTool` then validates structured content
 * against the declared schema on both ends.
 */
async function makeClient(options: FaqirMcpServerOptions = {}) {
  const server = createFaqirMcpServer({ registryPath: REGISTRY, ...options });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "faqir-mcp-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  await client.listTools();
  return { client, server };
}

beforeAll(async () => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(IN_PROJECT, { recursive: true });
  mkdirSync(NO_PROJECT, { recursive: true });

  // Build a real Faqir project fixture using the CLI's own commands, so the
  // context.json the MCP server reads is the genuine generated artifact.
  const origCwd = process.cwd();
  process.chdir(IN_PROJECT);
  try {
    await init([]);
    await add(["button"]);
    await context([]);
  } finally {
    process.chdir(origCwd);
  }
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("faqir MCP server — boot & registration", () => {
  it("registers exactly the four read tools with input and output schemas", async () => {
    const { client } = await makeClient();
    const { tools } = await client.listTools();

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "faqir_get_manifest",
      "faqir_list_components",
      "faqir_project_context",
      "faqir_theme_info",
    ]);

    for (const tool of tools) {
      // Input/output schemas are declared MCP tool schemas, not free-form.
      expect(tool.inputSchema).toBeDefined();
      expect((tool.inputSchema as { type?: string }).type).toBe("object");
      expect(tool.outputSchema).toBeDefined();
      expect((tool.outputSchema as { type?: string }).type).toBe("object");
    }
  });
});

describe("faqir_list_components", () => {
  it("returns the full inventory with per-component metadata", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({ name: "faqir_list_components", arguments: {} });
    const data = res.structuredContent as any;

    expect(data.count).toBeGreaterThan(0);
    expect(data.components).toHaveLength(data.count);

    const button = data.components.find((c: any) => c.name === "button");
    expect(button).toBeDefined();
    expect(button.kind).toBe("primitive");
    expect(button.category).toBe("actions");
    expect(button.layer).toBe("primitives");
    expect(Array.isArray(button.aliases)).toBe(true);
    expect(typeof button.description).toBe("string");
  });

  it("filters by kind", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_list_components",
      arguments: { kind: "recipe" },
    });
    const data = res.structuredContent as any;

    expect(data.count).toBeGreaterThan(0);
    expect(data.components.every((c: any) => c.kind === "recipe")).toBe(true);
    expect(data.components.some((c: any) => c.name === "dialog")).toBe(true);
    expect(data.components.some((c: any) => c.name === "button")).toBe(false);
    expect(data.filter.kind).toBe("recipe");
  });

  it("filters by category", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_list_components",
      arguments: { category: "overlay" },
    });
    const data = res.structuredContent as any;

    expect(data.count).toBeGreaterThan(0);
    expect(data.components.every((c: any) => c.category === "overlay")).toBe(true);
    expect(data.components.some((c: any) => c.name === "dialog")).toBe(true);
  });

  it("filters by kind and category together", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_list_components",
      arguments: { kind: "primitive", category: "actions" },
    });
    const data = res.structuredContent as any;

    expect(data.components.every((c: any) => c.kind === "primitive" && c.category === "actions")).toBe(true);
    expect(data.components.some((c: any) => c.name === "button")).toBe(true);
  });

  it("rejects an invalid kind at the input-schema boundary", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_list_components",
      arguments: { kind: "widget" },
    });
    // The declared enum is enforced by the tool schema — invalid input never
    // reaches the handler; it surfaces as a clean tool error.
    expect(res.isError).toBe(true);
    expect((res.content as any[])[0].text).toContain("Input validation error");
  });
});

describe("faqir_get_manifest", () => {
  it("returns the full manifest for a known component", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_get_manifest",
      arguments: { component: "button" },
    });
    const data = res.structuredContent as any;

    expect(res.isError).toBeFalsy();
    expect(data.component).toBe("button");
    expect(data.manifest.name).toBe("button");
    expect(data.manifest.kind).toBe("primitive");
    expect(data.manifest.templates.html).toContain("data-ui=\"button\"");
  });

  it("resolves an alias to its canonical component", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_get_manifest",
      arguments: { component: "alert" },
    });
    const data = res.structuredContent as any;

    expect(res.isError).toBeFalsy();
    expect(data.manifest.name).toBe("callout");
  });

  it("errors cleanly on an unknown component", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_get_manifest",
      arguments: { component: "buton" },
    });

    expect(res.isError).toBe(true);
    const text = (res.content as any[])[0].text as string;
    expect(text).toContain("Unknown component 'buton'");
    expect(text).toContain("button"); // did-you-mean suggestion
  });
});

describe("faqir_theme_info", () => {
  it("lists every registry theme as a summary", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({ name: "faqir_theme_info", arguments: {} });
    const data = res.structuredContent as any;

    expect(data.count).toBe(data.themes.length);
    expect(data.count).toBeGreaterThan(1);
    expect(typeof data.active_theme).toBe("string");

    const names = data.themes.map((t: any) => t.name);
    expect(names).toContain("default");
    expect(names).toContain("midnight");

    const midnight = data.themes.find((t: any) => t.name === "midnight");
    expect(Array.isArray(midnight.mood)).toBe(true);
    expect(typeof midnight.scheme).toBe("string");
    // Summaries omit the heavy derived token arrays.
    expect(midnight.tokens_overridden).toBeUndefined();
  });

  it("returns a single theme's full manifest when named", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_theme_info",
      arguments: { theme: "midnight" },
    });
    const data = res.structuredContent as any;

    expect(data.count).toBe(1);
    expect(data.themes[0].name).toBe("midnight");
    expect(Array.isArray(data.themes[0].tokens_overridden)).toBe(true);
    expect(data.themes[0].tokens_overridden.length).toBeGreaterThan(0);
  });

  it("errors cleanly on an unknown theme", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_theme_info",
      arguments: { theme: "midnite" },
    });

    expect(res.isError).toBe(true);
    const text = (res.content as any[])[0].text as string;
    expect(text).toContain("Unknown theme 'midnite'");
    expect(text).toContain("midnight"); // suggestion
  });

  it("reflects the host project's active theme", async () => {
    const { client } = await makeClient({ projectRoot: IN_PROJECT });
    const res = await client.callTool({ name: "faqir_theme_info", arguments: {} });
    const data = res.structuredContent as any;
    expect(data.active_theme).toBe("default");
  });
});

describe("faqir_project_context", () => {
  it("reads context inside a Faqir project", async () => {
    const { client } = await makeClient({ projectRoot: IN_PROJECT });
    const res = await client.callTool({ name: "faqir_project_context", arguments: {} });
    const data = res.structuredContent as any;

    expect(data.in_project).toBe(true);
    expect(data.config).not.toBeNull();
    expect(data.config.theme).toBe("default");
    expect(data.context).not.toBeNull();
    expect(data.context.meta.framework).toBe("faqir");
    expect(data.context.components).toHaveProperty("button");
  });

  it("reports cleanly outside a Faqir project", async () => {
    const { client } = await makeClient({ projectRoot: NO_PROJECT });
    const res = await client.callTool({ name: "faqir_project_context", arguments: {} });
    const data = res.structuredContent as any;

    expect(data.in_project).toBe(false);
    expect(data.config).toBeNull();
    expect(data.context).toBeNull();
    expect(data.message).toContain("Not a Faqir project");
  });

  it("honours a per-call root override", async () => {
    // Server defaults to the in-project root, but the call overrides it.
    const { client } = await makeClient({ projectRoot: IN_PROJECT });
    const res = await client.callTool({
      name: "faqir_project_context",
      arguments: { root: NO_PROJECT },
    });
    const data = res.structuredContent as any;
    expect(data.in_project).toBe(false);
    expect(data.root).toBe(NO_PROJECT);
  });
});
