/**
 * The Night Shift page (`night-shift/index.html`).
 *
 * The page is read from the shift's own files — `docs/night-shift.md`,
 * `docs/dream-rubric.md`, `.faqir-dreams/queue.json`, `dreams.tsv` — and these
 * tests hold it to them: every rubric criterion the document defines has a
 * heading, every queued brief and every ledger row has a table row, and the
 * page still builds (with honest empty states) from a package root that has
 * none of those files. It is audited exactly as `docs-site.test.ts` audits every
 * shell page, and carries no class or style attribute.
 */
import { describe, it, expect, afterAll } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  discoverDocsComponents,
  discoverThemes,
  parseTokenReference,
  readCdnPin,
  readSiteConfig,
  relUrl,
} from "../../src/generator/docs";
import type { PageContext } from "../../src/generator/docs-pages/context";
import {
  NIGHT_SHIFT_COMMANDS,
  NIGHT_SHIFT_PAGE,
  LOOP_STEPS,
  flattenHint,
  parseMarkdown,
  parseRubric,
  readLedgerFile,
  readQueueFile,
  renderNightShiftPages,
  splitSections,
} from "../../src/generator/docs-pages/night-shift";
import { auditHtmlSource } from "../../src/audit/checker";
import { parseDocument } from "../../src/parser/html-parser";
import type { Manifest } from "../../src/manifest";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const SITE = join(REPO, "site");
const TMP = join(import.meta.dir, "../.tmp-docs-night-shift");

function context(packageRoot: string): PageContext {
  const components = discoverDocsComponents(REGISTRY);
  const byName = new Map(components.map((c) => [c.name, c] as const));
  return {
    config: readSiteConfig(SITE),
    components,
    themes: discoverThemes(REGISTRY),
    byName: new Map([...byName].filter(([name, c]) => byName.get(name) === c)),
    tokenList: parseTokenReference(REGISTRY),
    registryRoot: REGISTRY,
    packageRoot,
    siteRoot: SITE,
    pin: readCdnPin(REPO),
  };
}

const ctx = context(REPO);
const files = renderNightShiftPages(ctx);
const html = files[0]?.content ?? "";

function auditManifests(): Map<string, Manifest> {
  const map = new Map<string, Manifest>();
  for (const c of ctx.components) {
    map.set(c.name, c.manifest);
    for (const alias of c.manifest.aliases ?? []) map.set(alias, c.manifest);
  }
  return map;
}

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("the Night Shift page", () => {
  it("renders exactly one page at the night-shift route", () => {
    expect(files.map((f) => f.path)).toEqual([NIGHT_SHIFT_PAGE]);
    expect(html).toContain("<h1>Night Shift</h1>");
    expect(html).toContain('aria-label="On this page"');
    expect(html).toContain("data-docs-toc");
  });

  it("draws the loop as a step sequence, one step per stage", () => {
    const steps = html.match(/data-docs-night-step>/g) ?? [];
    expect(steps.length).toBe(LOOP_STEPS.length);
    for (const step of LOOP_STEPS) expect(html).toContain(`>${step.name}</span>`);
  });

  it("has a heading for every criterion the rubric document defines", () => {
    const rubric = parseRubric(readFileSync(join(REPO, "docs", "dream-rubric.md"), "utf8"));
    expect(rubric.version).toBe("1.0");
    expect(rubric.criteria.map((c) => c.key)).toEqual([
      "hierarchy",
      "rhythm",
      "contrast",
      "restraint",
      "fit",
    ]);
    expect(rubric.threshold).toEqual({ floor: 3, mean: 3.5 });
    expect(rubric.scale).toEqual({ min: 1, max: 5 });
    for (const c of rubric.criteria) {
      expect(html).toContain(`id="criterion-${c.key}"`);
      expect(html).toContain(`>${c.key}</span></h4>`);
    }
    // The rubric's own sections follow, shifted one level down.
    expect(html).toContain('<h3 id="rubric-the-scale">');
    expect(html).toContain('<h3 id="rubric-the-threshold">');
  });

  it("tabulates every queued brief and every ledger row", () => {
    const queue = readQueueFile(join(REPO, ".faqir-dreams", "queue.json"));
    expect(queue).not.toBeNull();
    for (const brief of queue ?? []) {
      expect(html).toContain(`data-variant="mono">${brief.id}</span>`);
      expect(html).toContain(brief.brief.slice(0, 60).replace(/&/g, "&amp;"));
    }
    const ledger = readLedgerFile(join(REPO, "dreams.tsv"));
    expect(ledger).not.toBeNull();
    expect(ledger?.columns.length).toBe(13);
    const rows = html.match(/<tbody>[\s\S]*?<\/tbody>/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of ledger?.rows ?? []) {
      expect(html).toContain(`>${row.cells.status}</span>`);
      expect(html).toContain(row.cells.id);
    }
  });

  it("documents every command with the script it runs", () => {
    for (const c of NIGHT_SHIFT_COMMANDS) {
      expect(html).toContain(c.command.replace(/&/g, "&amp;"));
      expect(html).toContain(c.runs);
    }
    expect(html).toContain("bun run dream:nightly");
    expect(html).toContain("/faqir-dream");
    expect(html).toContain("DREAM_CMD=");
  });

  it("links a kept theme only when it ships in the registry", () => {
    const shipped = new Set(ctx.themes.map((t) => t.name));
    // Only the ledger links themes; the shell's own navigation is the lead's.
    const ledgerHtml = /<div data-docs-night-ledger[^>]*>[\s\S]*?<\/table>/.exec(html)?.[0] ?? "";
    expect(ledgerHtml).not.toBe("");
    const links = [...ledgerHtml.matchAll(/href="([^"]*themes\/([a-z0-9-]+)\/index\.html)"/g)];
    for (const [, href, theme] of links) {
      expect(shipped.has(theme), `${href} links a theme that does not ship`).toBe(true);
      expect(href).toBe(relUrl(NIGHT_SHIFT_PAGE, `themes/${theme}/index.html`));
    }
  });

  it("builds with honest empty states from a package root with none of the files", () => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    const bare = renderNightShiftPages(context(TMP));
    const page = bare[0]?.content ?? "";
    expect(bare.map((f) => f.path)).toEqual([NIGHT_SHIFT_PAGE]);
    expect(page).toContain("<h1>Night Shift</h1>");
    expect(page).toContain("The queue is not on this build.");
    expect(page).toContain("The ledger is not on this build.");
    expect(page).toContain("The taste rubric is not on this build.");
    expect(page).toContain("The gate list is not on this build.");
    expect(page).not.toMatch(/\sclass\s*=/);
    const findings = auditHtmlSource({ source: page, file: NIGHT_SHIFT_PAGE, manifests: auditManifests() });
    expect(findings.map((r) => `${r.rule_id}: ${r.message}`).join("\n")).toBe("");
  });

  it("renders an empty queue as a quiet night rather than an error", () => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, ".faqir-dreams"), { recursive: true });
    writeFileSync(join(TMP, ".faqir-dreams", "queue.json"), JSON.stringify({ version: 1, briefs: [] }));
    writeFileSync(join(TMP, "dreams.tsv"), "# metric_direction: higher_is_better\niteration\tdate\tkind\tid\n");
    const page = renderNightShiftPages(context(TMP))[0]?.content ?? "";
    expect(page).toContain("The queue is empty.");
    expect(page).toContain("No rows yet.");
  });

  it("is audit-clean, and carries no class or style attribute", () => {
    const findings = auditHtmlSource({ source: html, file: NIGHT_SHIFT_PAGE, manifests: auditManifests() });
    expect(
      findings.map((r) => `${NIGHT_SHIFT_PAGE}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`).join("\n"),
    ).toBe("");
    expect(html).not.toMatch(/\sclass\s*=/);
    const doc = parseDocument(html, NIGHT_SHIFT_PAGE);
    const styled = doc.elements.filter((el) => el.attrs["style"] !== undefined);
    expect(styled.map((el) => `<${el.tag} style="${el.attrs["style"]}">`).join("\n")).toBe("");
  });

  it("has unique ids and headings in order", () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1], `heading jump at index ${i}`).toBeLessThanOrEqual(1);
    }
    for (const anchor of [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])) {
      expect(ids, `#${anchor} has no target`).toContain(anchor);
    }
  });

  it("renders deterministically", () => {
    expect(renderNightShiftPages(ctx)[0]?.content).toBe(html);
  });
});

describe("the markdown subset the page parses", () => {
  it("parses headings, lists with continuation lines, tables, fences and comments", () => {
    const blocks = parseMarkdown(
      [
        "<!-- a comment",
        "     over two lines -->",
        "# Title",
        "",
        "A paragraph that",
        "wraps.",
        "",
        "- one",
        "  continued",
        "- two",
        "",
        "1. first",
        "2. second",
        "",
        "| a | b |",
        "|---|---|",
        "| 1 | 2 |",
        "",
        "```",
        "code",
        "```",
        "---",
        "## Next",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "paragraph", text: "A paragraph that wraps." },
      { kind: "list", ordered: false, items: ["one continued", "two"] },
      { kind: "list", ordered: true, items: ["first", "second"] },
      { kind: "table", rows: [["a", "b"], ["1", "2"]] },
      { kind: "fence", code: "code" },
      { kind: "rule" },
      { kind: "heading", level: 2, text: "Next" },
    ]);
    const sections = splitSections(blocks, 2);
    expect(sections.map((s) => s.heading)).toEqual(["Next"]);
  });

  it("flattens a nested axes hint to sorted dotted keys", () => {
    expect(flattenHint({ type: { pairing: "mono", scale: 1.125 }, accent: "#0e7490" })).toEqual([
      ["accent", "#0e7490"],
      ["type.pairing", "mono"],
      ["type.scale", "1.125"],
    ]);
    expect(flattenHint(undefined)).toEqual([]);
  });
});
