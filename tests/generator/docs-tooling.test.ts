// Tooling section of the docs site: the CLI reference and the Integrations page.
//
// Both pages are generated from sources of truth (the command registry, the
// live MCP server's registrations, the package manifests, the ESM entry, the
// shipped skill, the CDN pin). These tests hold exactly that: every registered
// command has an article, every registered MCP tool and resource is named, the
// package family and ESM exports match the files on disk — and both pages pass
// the same audit gate every other site page does, with no class or style.

import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createFaqirMcpServer } from "../../packages/mcp/src/server";
import {
  discoverDocsComponents,
  discoverThemes,
  parseTokenReference,
  readCdnPin,
  readSiteConfig,
  type SiteFile,
} from "../../src/generator/docs";
import { auditHtmlSource } from "../../src/audit/checker";
import { parseDocument } from "../../src/parser/html-parser";
import { COMMAND_CATEGORIES, COMMAND_NAMES } from "../../src/command-registry";
import { SCAFFOLD_NAMES } from "../../src/scaffolds/registry";
import { SEED_FLAGS } from "../../src/theme/seed";
import {
  CLI_PAGE,
  INTEGRATIONS_PAGE,
  renderToolingPages,
} from "../../src/generator/docs-pages/tooling";
import type { PageContext } from "../../src/generator/docs-pages/context";
import type { Manifest } from "../../src/manifest";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const SITE = join(REPO, "site");

function buildContext(): PageContext {
  const components = discoverDocsComponents(REGISTRY);
  const themes = discoverThemes(REGISTRY);
  const byName = new Map(
    [...components].reverse().map((c) => [c.name, c] as const),
  );
  return {
    config: readSiteConfig(SITE),
    components,
    themes,
    byName,
    tokenList: parseTokenReference(REGISTRY),
    registryRoot: REGISTRY,
    packageRoot: REPO,
    siteRoot: SITE,
    pin: readCdnPin(REPO),
  };
}

const ctx = buildContext();
const files: SiteFile[] = renderToolingPages(ctx);
const byPath = new Map(files.map((f) => [f.path, f.content]));

function page(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`no such generated page: ${path}`);
  return content;
}

/** Manifests keyed the way `faqir audit` keys them: canonical names + aliases. */
function auditManifests(): Map<string, Manifest> {
  const map = new Map<string, Manifest>();
  for (const c of ctx.components) {
    map.set(c.name, c.manifest);
    for (const alias of c.manifest.aliases ?? []) map.set(alias, c.manifest);
  }
  return map;
}

describe("tooling pages exist", () => {
  it("renders the CLI reference and the Integrations page, nothing else", () => {
    expect(files.map((f) => f.path).sort()).toEqual([CLI_PAGE, INTEGRATIONS_PAGE].sort());
    expect(page(CLI_PAGE)).toContain("<h1>CLI reference</h1>");
    expect(page(INTEGRATIONS_PAGE)).toContain("<h1>Integrations</h1>");
  });

  it("is deterministic", () => {
    const again = renderToolingPages(ctx);
    for (const f of again) expect(f.content).toBe(page(f.path));
  });

  it("carries an On-this-page nav whose anchors all resolve", () => {
    for (const f of files) {
      expect(f.content).toContain('<nav aria-label="On this page" data-docs-toc');
      const doc = parseDocument(f.content, f.path);
      const ids = new Set(doc.elements.map((el) => el.attrs["id"]).filter(Boolean));
      const anchors = [...f.content.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!);
      expect(anchors.length).toBeGreaterThan(0);
      for (const a of anchors) expect(ids.has(a), `${f.path}: #${a} has no target`).toBe(true);
    }
  });
});

describe("CLI reference is generated from the command registry", () => {
  const html = page(CLI_PAGE);

  it("has an article with a usage line for every registered command", () => {
    for (const name of COMMAND_NAMES) {
      expect(html).toContain(`<article id="cmd-${name}" data-docs-cmd>`);
      const article = html.slice(html.indexOf(`<article id="cmd-${name}"`));
      const body = article.slice(0, article.indexOf("</article>"));
      expect(body).toContain("<pre tabindex=\"0\" data-docs-tooling-usage><code>faqir " + name);
      expect(body).toContain(`<h3 id="cmd-${name}-title">faqir ${name}</h3>`);
    }
    // …and no article for a command the registry does not know.
    const articles = [...html.matchAll(/<article id="cmd-([a-z-]+)" data-docs-cmd>/g)].map((m) => m[1]!);
    expect(articles.sort()).toEqual([...COMMAND_NAMES].sort());
  });

  it("groups commands under every registry category, in registry order", () => {
    const positions = COMMAND_CATEGORIES.map((c) => html.indexOf(`>${c}</h2>`));
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("documents the sub-commands and derived tables the task calls out", () => {
    for (const needle of [
      "faqir theme generate",
      "faqir theme bundle",
      "--scope",
      "faqir fonts add",
      "faqir rules lint",
      "faqir bindings vue|react",
      "faqir add icons",
      "--only",
      "--rules",
      "--skip-rules",
      "--port",
      "faqir context",
      "npm install -g faqir-ui-cli",
    ]) {
      expect(html, `missing: ${needle}`).toContain(needle);
    }
    // Every seed axis flag except --accent (listed separately as required).
    for (const flag of Object.keys(SEED_FLAGS).filter((f) => f !== "accent")) {
      expect(html).toContain(`<code>--${flag} &lt;value&gt;</code>`);
    }
    for (const name of SCAFFOLD_NAMES) expect(html).toContain(`<code>${name}</code>`);
  });

  it("explains the universal --json envelope and the exit codes", () => {
    expect(html).toContain('<h2 id="json-output">JSON output</h2>');
    expect(html).toContain("json_schema_version");
    expect(html).toContain('<h2 id="exit-codes">Exit codes</h2>');
    expect(html).toContain("conflict markers");
  });
});

describe("Integrations page is generated from the packages", () => {
  const html = page(INTEGRATIONS_PAGE);

  it("names every tool and resource the live MCP server registers", () => {
    const server = createFaqirMcpServer() as unknown as {
      _registeredTools: Record<string, unknown>;
      _registeredResources: Record<string, unknown>;
      _registeredResourceTemplates: Record<string, { resourceTemplate: { uriTemplate: { toString(): string } } }>;
    };
    const tools = Object.keys(server._registeredTools);
    expect(tools.length).toBeGreaterThanOrEqual(10);
    for (const t of tools) expect(html).toContain(`<article id="mcp-${t}" data-docs-cmd data-docs-tooling-tool>`);
    for (const uri of Object.keys(server._registeredResources)) expect(html).toContain(`<code>${uri}</code>`);
    for (const t of Object.values(server._registeredResourceTemplates)) {
      expect(html).toContain(`<code>${t.resourceTemplate.uriTemplate.toString()}</code>`);
    }
    expect(html).toContain("claude mcp add faqir -- npx -y @faqir-ui/mcp");
    expect(html).toMatch(/(&quot;|")mcpServers(&quot;|")/);
  });

  it("lists every named export of @faqir-ui/core", () => {
    const entry = readFileSync(join(REPO, "packages", "core", "src", "esm-entry.js"), "utf8");
    const names = [...entry.matchAll(/^export const (\w+) =/gm)].map((m) => m[1]!);
    expect(names.length).toBe(19);
    for (const n of names) expect(html).toContain(`<code>${n}</code>`);
  });

  it("carries the pinned two-tag CDN preamble", () => {
    const pin = readCdnPin(REPO);
    expect(html).toContain(`${pin.package}@${pin.version}`);
    expect(html).toContain("faqir-core.min.js");
    expect(html).toContain(pin.integrity["faqir-core.min.js"]!);
  });

  it("quotes the bindings usage examples from the package READMEs and names the gate", () => {
    expect(html).toContain("check:bindings");
    expect(html).toContain("LButton, LCard, LFieldGroup");
    expect(html).toContain("@faqir-ui/react");
    expect(html).toContain("@faqir-ui/vue");
    expect(html).toContain("&lt;template #title&gt;Sign in&lt;/template&gt;");
  });

  it("tables the seven publishable packages with their real versions and GitHub links", () => {
    const dirs = ["core", "forms", "mcp", "react", "rules", "vue"];
    const root = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { name: string; version: string };
    expect(html).toContain(`<code>${root.name}</code>`);
    for (const d of dirs) {
      const pkg = JSON.parse(readFileSync(join(REPO, "packages", d, "package.json"), "utf8")) as {
        name: string;
        version: string;
      };
      expect(html).toContain(`<code>${pkg.name}</code></td><td>${pkg.version}</td>`);
      expect(html).toContain(`href="https://github.com/Narcis13/faqir-ui/tree/main/packages/${d}" target="_blank" rel="noopener noreferrer"`);
    }
  });

  it("describes the shipped Claude Code skill from its file", () => {
    const skill = readFileSync(join(REPO, ".claude", "skills", "faqir-creator", "SKILL.md"), "utf8");
    const headings = [...skill.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
    expect(headings.length).toBeGreaterThan(10);
    for (const h of headings) expect(html).toContain(`<li>${h.replace(/&/g, "&amp;")}</li>`);
    const refs = readdirSync(join(REPO, ".claude", "skills", "faqir-creator", "references"));
    for (const r of refs) expect(html).toContain(`references/${r}`);
    expect(html).toContain("gen:skill");
    expect(html).toContain("faqir context --skill");
  });
});

describe("tooling pages pass the site gate", () => {
  const manifests = auditManifests();

  it("finds zero audit issues at any severity", () => {
    const findings: string[] = [];
    for (const f of files) {
      for (const r of auditHtmlSource({ source: f.content, file: f.path, manifests })) {
        findings.push(`${f.path}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`);
      }
    }
    expect(findings.join("\n")).toBe("");
  });

  it("uses no class and no style attribute", () => {
    for (const f of files) {
      expect(f.content, `${f.path} uses a class attribute`).not.toMatch(/\sclass\s*=/);
      const doc = parseDocument(f.content, f.path);
      const styled = doc.elements.filter((el) => el.attrs["style"] !== undefined);
      expect(styled.map((el) => `<${el.tag}>`).join("\n"), `${f.path} carries an inline style`).toBe("");
    }
  });

  it("keeps heading order and unique ids", () => {
    for (const f of files) {
      const doc = parseDocument(f.content, f.path);
      const ids = doc.elements.map((el) => el.attrs["id"]).filter((id): id is string => !!id);
      expect(new Set(ids).size, `${f.path} has duplicate ids`).toBe(ids.length);
    }
  });
});
