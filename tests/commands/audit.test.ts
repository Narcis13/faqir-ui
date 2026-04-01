import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { runAudit } from "../../src/audit/checker";
import { applyRepairs } from "../../src/audit/repairer";

const TEST_DIR = join(import.meta.dir, "../.tmp-audit-test");

describe("loom audit", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  async function setupProject(components: string[] = []) {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
      if (components.length > 0) {
        await add(components);
      }
    } finally {
      process.chdir(origCwd);
    }
  }

  it("passes on a clean project with no HTML files", async () => {
    await setupProject(["button"]);
    const summary = await runAudit({ cwd: TEST_DIR });
    // The component HTML files exist in ui/ but they should pass audit
    expect(summary.passed).toBe(true);
  });

  it("finds missing required slots in dialog", async () => {
    await setupProject(["dialog"]);

    // Write a broken dialog HTML file
    const html = `<div data-ui="dialog" data-state="closed" id="test">
  <button data-part="trigger">Open</button>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="test-title" hidden>
    <p>Missing overlay, title, body, close slots</p>
  </div>
</div>
<script type="module" src="ui/core/loom.js"></script>`;
    await Bun.write(join(TEST_DIR, "index.html"), html);

    const summary = await runAudit({ cwd: TEST_DIR });
    const slotResults = summary.results.filter(r => r.rule_id === "required-slot");
    // Should find missing: overlay, title, body, close
    expect(slotResults.length).toBeGreaterThan(0);
    expect(slotResults[0].severity).toBe("critical");
  });

  it("finds invalid variant values", async () => {
    await setupProject(["button"]);

    const html = '<button data-ui="button" data-variant="neon">Bad</button>';
    await Bun.write(join(TEST_DIR, "test.html"), html);

    const summary = await runAudit({ cwd: TEST_DIR });
    const variantResults = summary.results.filter(r => r.rule_id === "valid-variant");
    expect(variantResults.length).toBeGreaterThan(0);
    expect(variantResults[0].message).toContain("neon");
  });

  it("finds invalid state values", async () => {
    await setupProject(["dialog"]);

    const html = `<div data-ui="dialog" data-state="active" id="test">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="test-t">
    <h2 data-part="title" id="test-t">T</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">C</div>
  </div>
</div>
<script type="module" src="ui/core/loom.js"></script>`;
    await Bun.write(join(TEST_DIR, "test.html"), html);

    const summary = await runAudit({ cwd: TEST_DIR });
    const stateResults = summary.results.filter(r => r.rule_id === "valid-state");
    expect(stateResults.length).toBeGreaterThan(0);
    expect(stateResults[0].message).toContain("active");
  });

  it("finds orphan parts", async () => {
    await setupProject(["dialog"]);

    const html = `<div data-ui="dialog" data-state="closed" id="test">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="test-t">
    <h2 data-part="title" id="test-t">T</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">C</div>
    <div data-part="sidebar">Unknown slot</div>
  </div>
</div>
<script type="module" src="ui/core/loom.js"></script>`;
    await Bun.write(join(TEST_DIR, "test.html"), html);

    const summary = await runAudit({ cwd: TEST_DIR });
    const orphanResults = summary.results.filter(r => r.rule_id === "orphan-part");
    expect(orphanResults.length).toBeGreaterThan(0);
    expect(orphanResults[0].message).toContain("sidebar");
  });

  it("detects missing controller script", async () => {
    await setupProject(["dialog"]);

    // HTML with dialog but no script tag at all
    const html = `<div data-ui="dialog" data-state="closed" id="test">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="test-t">
    <h2 data-part="title" id="test-t">T</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">C</div>
  </div>
</div>`;
    await Bun.write(join(TEST_DIR, "test.html"), html);

    const summary = await runAudit({ cwd: TEST_DIR });
    const controllerResults = summary.results.filter(r => r.rule_id === "controller-loaded");
    expect(controllerResults.length).toBeGreaterThan(0);
  });

  it("audit --file scopes to a single file", async () => {
    await setupProject(["button"]);

    await Bun.write(join(TEST_DIR, "good.html"), '<button data-ui="button" data-variant="primary">OK</button>');
    await Bun.write(join(TEST_DIR, "bad.html"), '<button data-ui="button" data-variant="neon">Bad</button>');

    const summary = await runAudit({ cwd: TEST_DIR, file: join(TEST_DIR, "good.html") });
    const variantResults = summary.results.filter(r => r.rule_id === "valid-variant");
    expect(variantResults.length).toBe(0);
  });
});

describe("loom repair", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  async function setupProject(components: string[] = []) {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
      if (components.length > 0) {
        await add(components);
      }
    } finally {
      process.chdir(origCwd);
    }
  }

  it("repairs missing aria-label on close button", async () => {
    await setupProject(["dialog"]);

    const html = `<div data-ui="dialog" data-state="closed" id="test">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="test-t">
    <h2 data-part="title" id="test-t">Title</h2>
    <button data-part="close">X</button>
    <div data-part="body">Content</div>
  </div>
</div>
<script type="module" src="ui/core/loom.js"></script>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    // Run audit
    const audit1 = await runAudit({ cwd: TEST_DIR });
    const closeIssues = audit1.results.filter(r => r.rule_id === "close-label");
    expect(closeIssues.length).toBeGreaterThan(0);

    // Apply repairs
    const repairSummary = await applyRepairs(audit1.results, TEST_DIR);
    expect(repairSummary.fixes_applied).toBeGreaterThan(0);

    // Verify the fix
    const repaired = await Bun.file(filePath).text();
    expect(repaired).toContain('aria-label="Close"');
  });

  it("repair is idempotent — second repair changes nothing", async () => {
    await setupProject(["dialog"]);

    const html = `<div data-ui="dialog" data-state="closed" id="test">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="test-t">
    <h2 data-part="title" id="test-t">Title</h2>
    <button data-part="close">X</button>
    <div data-part="body">Content</div>
  </div>
</div>
<script type="module" src="ui/core/loom.js"></script>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    // First repair
    const audit1 = await runAudit({ cwd: TEST_DIR });
    await applyRepairs(audit1.results, TEST_DIR);
    const afterFirst = await Bun.file(filePath).text();

    // Second repair — should change nothing
    const audit2 = await runAudit({ cwd: TEST_DIR });
    const repair2 = await applyRepairs(audit2.results, TEST_DIR);
    const afterSecond = await Bun.file(filePath).text();

    expect(repair2.fixes_applied).toBe(0);
    expect(afterSecond).toBe(afterFirst);
  });
});
