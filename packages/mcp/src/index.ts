#!/usr/bin/env node
/**
 * `@faqir-ui/mcp` — stdio entry point.
 *
 * Boots the Faqir MCP server and connects it to stdio so any MCP host (Claude
 * Code, Cursor, …) can drive it. Runs under Bun (`bun run src/index.ts`) and,
 * once compiled with `bun build --target=node`, on plain Node
 * (`node dist/index.mjs`) — the runtime shim below polyfills the `Bun.*` globals
 * the shared CLI internals rely on. The shim MUST be imported first, before any
 * module that touches a `Bun.*` API.
 */
import "../../../src/utils/runtime-shim";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFaqirMcpServer } from "./server";

async function main(): Promise<void> {
  const server = createFaqirMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stdout is the MCP channel — diagnostics must go to stderr only.
  process.stderr.write("faqir-mcp server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`faqir-mcp failed to start: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
