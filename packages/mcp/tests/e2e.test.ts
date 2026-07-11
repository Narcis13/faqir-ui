import { describe, it, expect, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PKG = resolve(import.meta.dir, "..");
const DIST = join(PKG, "dist", "index.mjs");

/**
 * End-to-end against the REAL compiled server: build the Node bundle, spawn it as
 * a separate `node` process over stdio (exactly how an MCP host launches it), and
 * drive a full tool call through the wire. This exercises the packaging path —
 * the bundle, the shebang, and the vendored registry resolution — not just the
 * in-process transport the other tests use.
 */
describe("compiled server — real stdio spawn", () => {
  beforeAll(() => {
    // Build once (idempotent). Requires Bun to compile; skipped-with-failure if absent.
    const build = spawnSync("node", [join(PKG, "build.mjs")], { cwd: PKG, stdio: "pipe" });
    if (build.status !== 0) {
      throw new Error(`build failed:\n${build.stderr?.toString() ?? ""}`);
    }
    if (!existsSync(DIST)) throw new Error(`compiled bundle missing at ${DIST}`);
  });

  it("boots on plain Node and answers a full tool call over stdio", async () => {
    const transport = new StdioClientTransport({ command: "node", args: [DIST] });
    const client = new Client({ name: "faqir-mcp-e2e", version: "0.0.0" });
    await client.connect(transport);

    try {
      // Tools are present…
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("faqir_audit_html");

      // …and one full round-trip returns schema-valid structured content.
      const res = await client.callTool({
        name: "faqir_audit_html",
        arguments: { html: `<button data-ui="button" data-variant="nope">x</button>` },
      });
      const data = res.structuredContent as any;
      expect(data.passed).toBe(false);
      expect(data.findings.some((f: any) => f.rule_id === "valid-variant")).toBe(true);

      // A generate call proves the vendored registry resolves in the packaged bundle.
      const gen = await client.callTool({
        name: "faqir_generate",
        arguments: { component: "button", variant: "primary", props: { text: "Ship it" } },
      });
      expect((gen.structuredContent as any).html).toContain('data-variant="primary"');

      // And a resource is fetchable over the wire.
      const proto = await client.readResource({ uri: "faqir://protocol" });
      expect((proto.contents[0] as { text: string }).text as string).toContain("data-ui");
    } finally {
      await client.close();
    }
  }, 30_000);
});
