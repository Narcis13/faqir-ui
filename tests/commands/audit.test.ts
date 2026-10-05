import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { loadRegistryAuditInputs, runAudit, withProjectAuditInputs } from "../../src/audit/checker";
import { applyRepairs } from "../../src/audit/repairer";

const TEST_DIR = join(import.meta.dir, "../.tmp-audit-test");

describe("faqir audit", () => {
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

  // The overlay `audit --stdin` and the MCP tools share (task 1.1F-28).
  it("withProjectAuditInputs lays a project over the registry without touching it", async () => {
    const registry = await loadRegistryAuditInputs(join(import.meta.dir, "../../registry"));
    const registrySize = registry.manifests.size;

    // Not a project: the registry inputs come back as they are.
    const bare = await withProjectAuditInputs(registry, TEST_DIR);
    expect(bare.project).toBeNull();
    expect(bare.manifests).toBe(registry.manifests);
    expect(bare.styles).toBeUndefined();

    await setupProject(["button"]);
    const manifestPath = join(TEST_DIR, "ui/primitives/button/button.manifest.json");
    const edited = JSON.parse(readFileSync(manifestPath, "utf8"));
    edited.variants.visual.values = ["only"];
    await Bun.write(manifestPath, JSON.stringify(edited));
    const configPath = join(TEST_DIR, "faqir.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.audit = { forbid_directives: ["l-html"] };
    await Bun.write(configPath, JSON.stringify(config));

    const project = await withProjectAuditInputs(registry, TEST_DIR);
    expect(project.project).toBe(TEST_DIR);
    expect(project.manifests).not.toBe(registry.manifests);
    expect(project.manifests.get("button")!.variants.visual.values).toEqual(["only"]);
    expect(project.styles!.has("button")).toBe(true);
    expect(project.forbidDirectives).toEqual(["l-html"]);
    // The cached registry side is unchanged.
    expect(registry.manifests.size).toBe(registrySize);
    expect(registry.manifests.get("button")!.variants.visual.values).not.toEqual(["only"]);
  });

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
<script type="module" src="ui/core/faqir.js"></script>`;
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
<script type="module" src="ui/core/faqir.js"></script>`;
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
<script type="module" src="ui/core/faqir.js"></script>`;
    await Bun.write(join(TEST_DIR, "test.html"), html);

    const summary = await runAudit({ cwd: TEST_DIR });
    const orphanResults = summary.results.filter(r => r.rule_id === "orphan-part");
    expect(orphanResults.length).toBeGreaterThan(0);
    expect(orphanResults[0].message).toContain("sidebar");
  });

  it("detects missing controller script", async () => {
    await setupProject(["dialog"]);

    // A PAGE with a dialog and no script tag at all. The page is where the
    // runtime belongs, so this is where the rule applies (task 0.9-04).
    const html = `<!doctype html>
<html lang="en"><head><title>T</title></head><body><main>
<div data-ui="dialog" data-state="closed" id="test">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="test-t">
    <h2 data-part="title" id="test-t">T</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">C</div>
  </div>
</div>
</main></body></html>`;
    await Bun.write(join(TEST_DIR, "test.html"), html);

    const summary = await runAudit({ cwd: TEST_DIR });
    const controllerResults = summary.results.filter(r => r.rule_id === "controller-loaded");
    expect(controllerResults.length).toBeGreaterThan(0);
  });

  // Task 1.1F-24 (entry 9). A page that boots the engine from a module names no
  // engine file in its HTML: `index.html` loads `app/main.mjs`, which imports
  // `faqir-core.mjs`. `runAudit` reads the page's local modules, and what they
  // import, inside the project root.
  describe("an engine loaded from a local module", () => {
    const OUTSIDE = join(import.meta.dir, "../.tmp-audit-outside");
    const dialogPage = (script: string) => `<!doctype html>
<html lang="en"><head><title>T</title>${script}</head><body><main>
<div data-ui="dialog" data-state="closed" id="d">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="d-t" tabindex="-1">
    <h2 data-part="title" id="d-t">T</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">C</div>
  </div>
</div>
</main></body></html>`;
    const runtimeFindings = async () =>
      (await runAudit({ cwd: TEST_DIR, file: "index.html" })).results
        .filter((r) => r.rule_id === "controller-loaded" || r.rule_id === "focus-trap")
        .map((r) => `${r.rule_id}:${r.component_name}`)
        .sort();

    afterEach(() => rmSync(OUTSIDE, { recursive: true, force: true }));

    it("an external .mjs that imports the engine is clean", async () => {
      await setupProject(["dialog"]);
      await Bun.write(join(TEST_DIR, "app/main.mjs"), `import Faqir from "../ui/core/faqir-core.mjs";\nFaqir.store("x", {});\n`);
      await Bun.write(join(TEST_DIR, "index.html"), dialogPage(`<script type="module" src="app/main.mjs"></script>`));
      expect(await runtimeFindings()).toEqual([]);
    });

    it("follows a second level, and a root-relative src", async () => {
      await setupProject(["dialog"]);
      await Bun.write(join(TEST_DIR, "app/main.mjs"), `import "./boot.mjs";\n`);
      await Bun.write(join(TEST_DIR, "app/boot.mjs"), `export { default } from '../ui/core/faqir-core.mjs';\n`);
      await Bun.write(join(TEST_DIR, "index.html"), dialogPage(`<script type="module" src="/app/main.mjs?v=2"></script>`));
      expect(await runtimeFindings()).toEqual([]);
    });

    it("an inline module's relative import is followed too", async () => {
      await setupProject(["dialog"]);
      await Bun.write(join(TEST_DIR, "app/main.mjs"), `import Faqir from "../ui/core/faqir-core.mjs";\n`);
      await Bun.write(join(TEST_DIR, "index.html"), dialogPage(`<script type="module">import "./app/main.mjs";</script>`));
      expect(await runtimeFindings()).toEqual([]);
    });

    it("stops after two levels", async () => {
      await setupProject(["dialog"]);
      await Bun.write(join(TEST_DIR, "app/main.mjs"), `import "./a.mjs";\n`);
      await Bun.write(join(TEST_DIR, "app/a.mjs"), `import "./b.mjs";\n`);
      await Bun.write(join(TEST_DIR, "app/b.mjs"), `import "../ui/core/faqir-core.mjs";\n`);
      await Bun.write(join(TEST_DIR, "index.html"), dialogPage(`<script type="module" src="app/main.mjs"></script>`));
      expect(await runtimeFindings()).toEqual(["controller-loaded:dialog", "focus-trap:dialog"]);
    });

    it("a module outside the project root is not followed", async () => {
      await setupProject(["dialog"]);
      await Bun.write(join(OUTSIDE, "main.mjs"), `import Faqir from "./faqir-core.mjs";\n`);
      await Bun.write(
        join(TEST_DIR, "index.html"),
        dialogPage(`<script type="module" src="../.tmp-audit-outside/main.mjs"></script>`),
      );
      expect(await runtimeFindings()).toEqual(["controller-loaded:dialog", "focus-trap:dialog"]);
    });

    it("an engine reference does not clear a project's own recipe", async () => {
      await setupProject(["dialog"]);
      // A custom recipe, installed the way `faqir create` leaves one: its own
      // directory, manifest and controller, and a name in `installed.recipes`.
      const manifest = JSON.parse(readFileSync(join(TEST_DIR, "ui/recipes/dialog/dialog.manifest.json"), "utf8"));
      manifest.name = "my-dialog";
      manifest.files = { ...manifest.files, js: "my-dialog.js", css: "my-dialog.css", html: "my-dialog.html" };
      await Bun.write(join(TEST_DIR, "ui/recipes/my-dialog/my-dialog.manifest.json"), JSON.stringify(manifest, null, 2));
      const configPath = join(TEST_DIR, "faqir.config.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.installed.recipes.push("my-dialog");
      await Bun.write(configPath, JSON.stringify(config, null, 2));

      await Bun.write(join(TEST_DIR, "app/main.mjs"), `import Faqir from "../ui/core/faqir-core.mjs";\n`);
      await Bun.write(
        join(TEST_DIR, "index.html"),
        dialogPage(`<script type="module" src="app/main.mjs"></script>`).replace(
          "</main>",
          `<div data-ui="my-dialog" data-state="closed" id="m">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="m-t" tabindex="-1">
    <h2 data-part="title" id="m-t">T</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">C</div>
  </div>
</div>
</main>`,
        ),
      );
      expect(await runtimeFindings()).toEqual(["controller-loaded:my-dialog", "focus-trap:my-dialog"]);
    });
  });

  // Task 0.9-04, resolving follow-up 0.7-17. `faqir audit` scans `ui/**`, which
  // includes every reference fragment `faqir add` copied in; before this, a
  // fresh `init` + `add` reported a wall of findings from Faqir's own markup.
  // A fragment cannot carry the runtime, so the rules that ask for one do not
  // apply to it — decided from the content, never from a path allow-list.
  it("does not ask a fragment for a runtime it cannot carry", async () => {
    await setupProject(["dialog"]);

    const fragment = `<div data-ui="dialog" data-state="closed" id="frag">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="frag-t">
    <h2 data-part="title" id="frag-t">T</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">C</div>
  </div>
</div>`;
    await Bun.write(join(TEST_DIR, "fragment.html"), fragment);

    const summary = await runAudit({ cwd: TEST_DIR });
    const runtimeResults = summary.results.filter(
      (r) => r.file.includes("fragment.html") && (r.rule_id === "controller-loaded" || r.rule_id === "focus-trap"),
    );
    expect(runtimeResults).toEqual([]);
  });

  // Task 1.1F-27: the project's config bans a directive, and runAudit reads it.
  it("audit.forbid_directives turns a banned directive into an error", async () => {
    await setupProject(["button"]);
    const page = `<div l-data="{ body: '' }"><div l-html="body"></div><div l-text="body"></div></div>`;
    await Bun.write(join(TEST_DIR, "page.html"), page);

    const before = await runAudit({ cwd: TEST_DIR, file: "page.html" });
    expect(before.results.filter((r) => r.rule_id === "forbidden-directive")).toEqual([]);
    expect(before.passed).toBe(true);

    const configPath = join(TEST_DIR, "faqir.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    await Bun.write(configPath, JSON.stringify({ ...config, audit: { forbid_directives: ["l-html"] } }, null, 2));

    const after = await runAudit({ cwd: TEST_DIR, file: "page.html" });
    const found = after.results.filter((r) => r.rule_id === "forbidden-directive");
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe("error");
    expect(found[0].file).toBe("page.html");
    expect(after.passed).toBe(false);
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

describe("faqir repair", () => {
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
    <button data-part="close"><svg aria-hidden="true"></svg></button>
    <div data-part="body">Content</div>
  </div>
</div>
<script type="module" src="ui/core/faqir.js"></script>`;
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
    <button data-part="close"><svg aria-hidden="true"></svg></button>
    <div data-part="body">Content</div>
  </div>
</div>
<script type="module" src="ui/core/faqir.js"></script>`;
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
