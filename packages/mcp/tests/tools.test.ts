import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { containedProjectRoot, createFaqirMcpServer, type FaqirMcpServerOptions } from "../src/server";
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
  it("registers the read tools with input and output schemas", async () => {
    const { client } = await makeClient();
    const { tools } = await client.listTools();

    const names = tools.map((t) => t.name);
    // The four read tools (0.5-01) — write/verify tools are covered in write-tools.test.ts.
    for (const name of [
      "faqir_get_manifest",
      "faqir_list_components",
      "faqir_project_context",
      "faqir_theme_info",
    ]) {
      expect(names).toContain(name);
    }

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

  // ── Axes [1.1A-20] ──────────────────────────────────────────────────────

  it("includes each theme's derived axes, distinctiveness and kind in the summary list", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({ name: "faqir_theme_info", arguments: {} });
    const data = res.structuredContent as any;

    const glass = data.themes.find((t: any) => t.name === "glass");
    expect(glass.kind).toBe("authored");
    expect(glass.axes.depth).toBe("glass");
    expect(glass.axes.type.pairing).toBe("system");
    expect(glass.distinctiveness.nearest).toBe("aurora");
    expect(typeof glass.distinctiveness.axis_distance).toBe("number");

    const editorial = data.themes.find((t: any) => t.name === "editorial");
    expect(editorial.kind).toBe("generated");
    expect(editorial.axes.type.pairing).toBe("serif-editorial");
    // The summary stays light: no seed, no token arrays — the named call has them.
    expect(editorial.seed).toBeUndefined();
    expect(editorial.tokens_overridden).toBeUndefined();

    const companion = data.themes.find((t: any) => t.name === "editorial-document");
    expect(companion.kind).toBe("companion");
    expect(companion.axes).toBeUndefined();
  });

  it("returns seed, axes and distinctiveness on the full manifest", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({ name: "faqir_theme_info", arguments: { theme: "editorial" } });
    const data = res.structuredContent as any;
    expect(data.themes[0].seed.name).toBe("editorial");
    expect(data.themes[0].axes.density).toBe("spacious");
    expect(data.themes[0].distinctiveness.nearest).toBe("nordic");
  });
});

describe("faqir_theme_list", () => {
  /** Every shipped manifest, read straight off disk — the oracle the filter is held to. */
  function manifests(): any[] {
    return readdirSync(join(REGISTRY, "themes"))
      .filter((f) => f.endsWith(".theme.json"))
      .sort()
      .map((f) => JSON.parse(readFileSync(join(REGISTRY, "themes", f), "utf8")));
  }

  it("is registered with schemas", async () => {
    const { client } = await makeClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "faqir_theme_list")!;
    expect(tool).toBeDefined();
    expect((tool.inputSchema as { type?: string }).type).toBe("object");
    expect((tool.outputSchema as { type?: string }).type).toBe("object");
  });

  it("lists every theme with its axes when unfiltered", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({ name: "faqir_theme_list", arguments: {} });
    const data = res.structuredContent as any;
    expect(data.count).toBe(data.total);
    expect(data.count).toBe(manifests().length);
    expect(data.filter).toEqual({});
    expect(data.themes.filter((t: any) => t.axes).length).toBe(manifests().filter((m) => m.axes).length);
  });

  it("returns exactly the themes whose axes land on depth=glass", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_theme_list",
      arguments: { axes: { depth: "glass" } },
    });
    const data = res.structuredContent as any;
    const expected = manifests()
      .filter((m) => m.axes?.depth === "glass")
      .map((m) => m.name);
    expect(expected).toContain("glass");
    expect(data.themes.map((t: any) => t.name)).toEqual(expected);
    expect(data.count).toBe(expected.length);
    expect(data.total).toBe(manifests().length);
    expect(data.filter.axes).toEqual({ depth: "glass" });
    for (const t of data.themes) expect(t.axes.depth).toBe("glass");
  });

  it("conjoins clauses, coerces numeric leaves, and never matches a companion", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "faqir_theme_list",
      arguments: { axes: { "type.pairing": "serif-editorial", "type.scale": "1.333", density: "spacious" } },
    });
    const data = res.structuredContent as any;
    const expected = manifests()
      .filter(
        (m) =>
          m.axes?.type.pairing === "serif-editorial" && m.axes?.type.scale === 1.333 && m.axes?.density === "spacious",
      )
      .map((m) => m.name);
    expect(expected).toContain("editorial");
    expect(data.themes.map((t: any) => t.name)).toEqual(expected);

    // A companion has no axes, so any axis clause excludes it — even one its parent satisfies.
    const light = await client.callTool({ name: "faqir_theme_list", arguments: { axes: { scheme: "light" } } });
    const names = (light.structuredContent as any).themes.map((t: any) => t.name);
    expect(names).toContain("ink");
    expect(names).not.toContain("ink-document");
    expect(names).not.toContain("editorial-document");

    // …while `kind` finds them by name.
    const companions = await client.callTool({ name: "faqir_theme_list", arguments: { kind: "companion" } });
    expect((companions.structuredContent as any).themes.map((t: any) => t.name)).toEqual(
      manifests()
        .filter((m) => !m.axes)
        .map((m) => m.name),
    );

    // And mood still works, on its own or beside an axis.
    const dark = await client.callTool({ name: "faqir_theme_list", arguments: { mood: "dark", axes: { depth: "layered" } } });
    const darkNames = (dark.structuredContent as any).themes.map((t: any) => t.name);
    expect(darkNames).toEqual(
      manifests()
        .filter((m) => m.mood.includes("dark") && m.axes?.depth === "layered")
        .map((m) => m.name),
    );
  });

  it("errors cleanly on an unknown axis or a value outside the vocabulary, naming the options", async () => {
    const { client } = await makeClient();
    const badPath = await client.callTool({ name: "faqir_theme_list", arguments: { axes: { deepness: "glass" } } });
    expect(badPath.isError).toBe(true);
    const pathText = (badPath.content as any[])[0].text as string;
    expect(pathText).toContain("Unknown axis 'deepness'");
    expect(pathText).toContain("depth");
    expect(pathText).toContain("type.pairing");

    const badValue = await client.callTool({ name: "faqir_theme_list", arguments: { axes: { depth: "glas" } } });
    expect(badValue.isError).toBe(true);
    const valueText = (badValue.content as any[])[0].text as string;
    expect(valueText).toContain("'glas' is not a value of 'depth'");
    expect(valueText).toContain("glass");
    expect(valueText).toContain("flat");
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

  it("honours a per-call root inside the server's project root", async () => {
    // A monorepo-shaped server: its root holds two sub-projects, and a call
    // can point at either — relative to the root, or absolute.
    const { client } = await makeClient({ projectRoot: TMP });
    const relative = await client.callTool({
      name: "faqir_project_context",
      arguments: { root: "no-project" },
    });
    expect((relative.structuredContent as any).in_project).toBe(false);
    expect((relative.structuredContent as any).root).toBe(NO_PROJECT);

    const absolute = await client.callTool({
      name: "faqir_project_context",
      arguments: { root: IN_PROJECT },
    });
    expect((absolute.structuredContent as any).in_project).toBe(true);
    expect((absolute.structuredContent as any).root).toBe(IN_PROJECT);
  });

  it("refuses a root outside the server's project root", async () => {
    // The tool returns faqir.config.json and .faqir/context.json verbatim, so
    // an unconstrained root read those files out of any directory at all.
    const { client } = await makeClient({ projectRoot: IN_PROJECT });
    for (const root of [NO_PROJECT, "../no-project", "/"]) {
      const res = await client.callTool({ name: "faqir_project_context", arguments: { root } });
      expect(res.isError, root).toBe(true);
      expect((res.content as any[])[0].text).toContain("outside the server's project root");
    }
  });

  it("containedProjectRoot resolves inside and rejects outside", () => {
    expect(containedProjectRoot("/a/b", "c")).toBe("/a/b/c");
    expect(containedProjectRoot("/a/b", "/a/b/c/d")).toBe("/a/b/c/d");
    expect(containedProjectRoot("/a/b", ".")).toBe("/a/b");
    expect(containedProjectRoot("/a/b", "../c")).toBeNull();
    expect(containedProjectRoot("/a/b", "/a/bc")).toBeNull();
    expect(containedProjectRoot("/a/b", "/etc")).toBeNull();
  });
});

describe("every tool fails as a tool error, never a protocol crash", () => {
  it("a handler that throws returns isError with the reason", async () => {
    // A registry holding one unparseable manifest makes the manifest map —
    // which the audit and repair tools load lazily — throw inside the handler.
    // Before, that throw escaped as a protocol-level error.
    const badRegistry = join(TMP, "bad-registry");
    mkdirSync(join(badRegistry, "primitives", "bad"), { recursive: true });
    writeFileSync(join(badRegistry, "primitives", "bad", "bad.manifest.json"), "{not json");

    const server = createFaqirMcpServer({ registryPath: badRegistry });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "faqir-mcp-test", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    for (const name of ["faqir_audit_html", "faqir_repair_html"]) {
      const res = await client.callTool({ name, arguments: { html: "<div></div>" } });
      expect(res.isError, name).toBe(true);
      expect((res.content as any[])[0].text, name).toContain("JSON");
    }
  });
});
