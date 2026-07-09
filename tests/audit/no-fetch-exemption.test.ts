// ═══════════════════════════════════════════════════════════════════════════
// no-fetch rule · l-source exemption  [task 0.3-08]
// ═══════════════════════════════════════════════════════════════════════════
//
// The `no-fetch` anti-pattern rule forbids data fetching in recipe *controllers*.
// It is deliberately scoped to recipe controller JS — declarative page-level
// data loading via the `l-source` directive is application code and is exempt.
// This suite pins that stance three ways:
//   1. the exemption is encoded in the rule metadata (NO_FETCH_RULE.exempt),
//   2. the rule's description output mentions it,
//   3. running the full audit proves it: a page using `l-source` yields zero
//      no-fetch findings, while a recipe controller calling fetch still flags.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NO_FETCH_RULE, getRuleInventory } from "../../src/audit/rules";
import { runAudit } from "../../src/audit/checker";

const TEST_DIR = join(import.meta.dir, "../.tmp-nofetch-test");

/** Write a minimal faqir project into TEST_DIR. */
function scaffold(opts: {
  recipes?: string[];
  files?: Record<string, string>; // path (relative to TEST_DIR) → contents
}) {
  const config = {
    version: "1.0.0",
    theme: "default",
    output_dir: "./ui",
    tokens_split: false,
    include_core: true,
    installed: { primitives: [], recipes: opts.recipes || [], patterns: [] },
  };
  writeFileSync(join(TEST_DIR, "faqir.config.json"), JSON.stringify(config, null, 2));
  for (const [rel, contents] of Object.entries(opts.files || {})) {
    const abs = join(TEST_DIR, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, contents);
  }
}

const CLEAN_CONTROLLER = [
  "// @ui:controller widget",
  'import { trapFocus } from "../../core/focus.js";',
  "export function createWidget(root) {",
  '  function open() { root.dataset.state = "open"; }',
  "  return { open };",
  "}",
].join("\n");

const FETCHING_CONTROLLER = [
  "// @ui:controller fetcher",
  "export function createFetcher(root) {",
  '  async function load() { const r = await fetch("/api/data"); return r.json(); }',
  "  return { load };",
  "}",
].join("\n");

// A page that loads data declaratively via l-source — the exempt case.
const L_SOURCE_PAGE = [
  '<!doctype html>',
  '<html><body>',
  '  <div l-data="{}"',
  '       l-source:items="/api/items"',
  '       l-source:stats.poll.5000="/api/dashboard/stats">',
  '    <template l-for="item in items">',
  '      <span l-text="item.name"></span>',
  '    </template>',
  '  </div>',
  '</body></html>',
].join("\n");

describe("no-fetch · rule metadata + description output", () => {
  it("encodes the l-source exemption in the rule metadata", () => {
    expect(NO_FETCH_RULE.id).toBe("no-fetch");
    expect(NO_FETCH_RULE.applies_to).toContain("recipe controller");
    expect(NO_FETCH_RULE.exempt).toBeDefined();
    expect(NO_FETCH_RULE.exempt!.some(e => e.includes("l-source"))).toBe(true);
  });

  it("mentions the l-source exemption in the rule's description output", () => {
    expect(NO_FETCH_RULE.description.toLowerCase()).toContain("l-source");
    expect(NO_FETCH_RULE.description.toLowerCase()).toContain("exempt");
  });

  it("surfaces the no-fetch rule (with its exemption) in the inventory", () => {
    const inv = getRuleInventory();
    const rule = inv.find(r => r.id === "no-fetch");
    expect(rule).toBeDefined();
    expect(rule!.exempt!.join(" ")).toContain("l-source");
  });
});

describe("no-fetch · audit exemption (end-to-end)", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("a page using l-source produces zero no-fetch findings", async () => {
    scaffold({
      recipes: ["widget"],
      files: {
        "ui/recipes/widget/widget.js": CLEAN_CONTROLLER,
        "page.html": L_SOURCE_PAGE,
      },
    });

    const summary = await runAudit({ cwd: TEST_DIR });
    const noFetch = summary.results.filter(r => r.rule_id === "no-fetch");
    expect(noFetch).toHaveLength(0);
  });

  it("a recipe controller calling fetch still flags no-fetch", async () => {
    scaffold({
      recipes: ["fetcher"],
      files: {
        "ui/recipes/fetcher/fetcher.js": FETCHING_CONTROLLER,
      },
    });

    const summary = await runAudit({ cwd: TEST_DIR });
    const noFetch = summary.results.filter(r => r.rule_id === "no-fetch");
    expect(noFetch.length).toBeGreaterThan(0);
    expect(noFetch[0].file).toContain("fetcher.js");
    expect(noFetch[0].severity).toBe("error");
  });

  it("a page using l-source AND a fetching controller flags only the controller", async () => {
    scaffold({
      recipes: ["fetcher"],
      files: {
        "ui/recipes/fetcher/fetcher.js": FETCHING_CONTROLLER,
        "page.html": L_SOURCE_PAGE,
      },
    });

    const summary = await runAudit({ cwd: TEST_DIR });
    const noFetch = summary.results.filter(r => r.rule_id === "no-fetch");
    // Exactly the controller's fetch is flagged; the page's l-source is not.
    expect(noFetch).toHaveLength(1);
    expect(noFetch[0].file).toContain("fetcher.js");
  });
});
