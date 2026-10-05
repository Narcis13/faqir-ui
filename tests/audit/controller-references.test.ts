// Every way a page loads the engine (task 1.1F-24, entry 9).
//
// `controller-loaded` and `focus-trap` ask whether the page runs a recipe's
// controller. They used to answer with a substring search over the whole
// source for five file names, so `faqir-core.dev.js`, `faqir-core.mjs` and
// `@faqir-ui/core` were "not loaded" and a page that booted the engine from a
// module got a critical per dialog. The answer is now read from the page's
// `<script>` elements, plus what the caller read out of the modules they load.

import { beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/html-audit";
import { engineControllerNames } from "../../src/audit/checker";
import type { Manifest } from "../../src/manifest";
import { loadRegistryManifestMap } from "../../src/utils/components";

const REGISTRY = join(import.meta.dir, "../../registry");
const RUNTIME_RULES = new Set(["controller-loaded", "focus-trap"]);

let manifests: Map<string, Manifest>;
let engineControllers: Set<string>;

beforeAll(async () => {
  manifests = await loadRegistryManifestMap(REGISTRY);
  engineControllers = engineControllerNames(REGISTRY);
  // A project's own recipe: the engine bundle does not carry its controller.
  const dialog = manifests.get("dialog")!;
  manifests.set("my-dialog", { ...dialog, name: "my-dialog", files: { ...dialog.files, js: "my-dialog.js" } });
});

function dialog(name = "dialog"): string {
  return `<div data-ui="${name}" data-state="closed" id="${name}-1">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="${name}-t" tabindex="-1">
    <h2 data-part="title" id="${name}-t">T</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">C</div>
  </div>
</div>`;
}

function page(head: string, body = dialog()): string {
  return `<!doctype html>
<html lang="en"><head><title>T</title>
${head}
</head><body><main>
${body}
</main></body></html>`;
}

function runtimeFindings(source: string, extra: { runtimeReferences?: string[] } = {}): string[] {
  return auditHtmlSource({ source, file: "index.html", manifests, engineControllers, ...extra })
    .filter((r) => RUNTIME_RULES.has(r.rule_id))
    .map((r) => `${r.rule_id}:${r.component_name}`)
    .sort();
}

const MISSING = ["controller-loaded:dialog", "focus-trap:dialog"];

describe("controller-loaded / focus-trap: engine entry points", () => {
  it("a page with no script is flagged (the baseline the rest are measured against)", () => {
    expect(runtimeFindings(page(""))).toEqual(MISSING);
  });

  it.each([
    ["the classic tag", `<script src="ui/core/faqir-core.js" defer></script>`],
    ["the minified CDN build", `<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.1.1/dist/faqir-core.min.js" defer></script>`],
    ["the development build", `<script src="ui/core/faqir-core.dev.js" defer></script>`],
    ["the ES module, by src", `<script type="module" src="ui/core/faqir-core.mjs"></script>`],
    ["an inline module import", `<script type="module">import Faqir from "./ui/core/faqir-core.mjs";</script>`],
    ["an inline dynamic import", `<script type="module">await import('./ui/core/faqir-core.dev.js');</script>`],
    ["@faqir-ui/core, bare", `<script type="module">import Faqir from "@faqir-ui/core";</script>`],
    ["@faqir-ui/core, by subpath", `<script type="module">import "@faqir-ui/core/faqir-core.mjs";</script>`],
    [
      "an import map",
      `<script type="importmap">{"imports":{"faqir":"/vendor/faqir-core.mjs"}}</script>
<script type="module">import Faqir from "faqir";</script>`,
    ],
    ["the project runtime", `<script type="module" src="ui/core/faqir.js"></script>`],
    ["the controller itself", `<script type="module" src="ui/recipes/dialog/dialog.js"></script>`],
  ])("%s loads the dialog's controller", (_label, head) => {
    expect(runtimeFindings(page(head))).toEqual([]);
  });

  it("a module the caller followed counts as the page's own reference", () => {
    const source = page(`<script type="module" src="app/main.mjs"></script>`);
    expect(runtimeFindings(source)).toEqual(MISSING);
    expect(runtimeFindings(source, { runtimeReferences: ["../ui/core/faqir-core.mjs"] })).toEqual([]);
  });

  it.each([
    ["an HTML comment", `<!-- <script src="ui/core/faqir-core.js"></script> -->`],
    ["body copy", `<p>Load faqir-core.js before the page binds.</p>`],
    ["a JSON data block", `<script type="application/json">{"engine":"faqir-core.js"}</script>`],
    ["a stylesheet link", `<link rel="stylesheet" href="faqir-core.min.js.css">`],
    ["another recipe's controller", `<script type="module" src="ui/recipes/alert-dialog/alert-dialog.js"></script>`],
    ["a file that merely ends in the name", `<script src="vendor/not-faqir-core.js"></script>`],
  ])("a name in %s loads nothing", (_label, head) => {
    expect(runtimeFindings(page(head))).toEqual(MISSING);
  });

  it("the engine bundle does not carry a project's own recipe", () => {
    const body = `${dialog()}\n${dialog("my-dialog")}`;
    const engineOnly = page(`<script src="ui/core/faqir-core.js" defer></script>`, body);
    expect(runtimeFindings(engineOnly)).toEqual(["controller-loaded:my-dialog", "focus-trap:my-dialog"]);

    // Its own controller beside the engine clears it, and so does the project's
    // assembled runtime, which imports every installed recipe.
    const withOwn = page(
      `<script src="ui/core/faqir-core.js" defer></script>
<script type="module" src="ui/recipes/my-dialog/my-dialog.js"></script>`,
      body,
    );
    expect(runtimeFindings(withOwn)).toEqual([]);
    expect(runtimeFindings(page(`<script type="module" src="ui/core/faqir.js"></script>`, body))).toEqual([]);
  });

  it("without engineControllers an engine reference still covers every recipe", () => {
    const source = page(`<script src="ui/core/faqir-core.js" defer></script>`, `${dialog()}\n${dialog("my-dialog")}`);
    const findings = auditHtmlSource({ source, file: "index.html", manifests }).filter((r) =>
      RUNTIME_RULES.has(r.rule_id),
    );
    expect(findings).toEqual([]);
  });

  it("engineControllerNames is the registry's recipes with a controller", () => {
    expect(engineControllers.has("dialog")).toBe(true);
    expect(engineControllers.has("command-palette")).toBe(true);
    expect(engineControllers.has("button")).toBe(false);
    expect(engineControllers.has("my-dialog")).toBe(false);
  });
});

// What `faqir repair` may write for a missing controller (task 1.1F-25, entry
// 10). It used to be `<script type="module" src="ui/recipes/<name>/<name>.js">`:
// a hard-coded `ui/`, wrong from any page not at the project root, and a module
// that only exports its factory, so it started nothing.
describe("controller-loaded: the add-script fix", () => {
  const fixOf = (source: string, runtimeScript?: string) =>
    auditHtmlSource({ source, file: "pages/p.html", manifests, engineControllers, runtimeScript })
      .filter((r) => r.rule_id === "controller-loaded")
      .map((r) => r.fix);

  it("loads the runtime path the caller gives, for every missing recipe", () => {
    const body = `${dialog()}\n${dialog("my-dialog")}`;
    expect(fixOf(page("", body), "../web/ui/core/faqir.js")).toEqual([
      { type: "add-script", offset: 0, details: { src: "../web/ui/core/faqir.js", component: "dialog" } },
      { type: "add-script", offset: 0, details: { src: "../web/ui/core/faqir.js", component: "my-dialog" } },
    ]);
  });

  it("a caller with no page location offers no fix, only the finding", () => {
    expect(fixOf(page(""))).toEqual([undefined]);
  });

  it("an engine page gets no fix: the runtime would load the registry's controllers twice", () => {
    const engineOnly = page(`<script src="ui/core/faqir-core.js" defer></script>`, `${dialog()}\n${dialog("my-dialog")}`);
    expect(fixOf(engineOnly, "../ui/core/faqir.js")).toEqual([undefined]);
  });

  it("an engine-module page has nothing to fix", () => {
    const moduled = page(`<script type="module">import Faqir from "../ui/core/faqir-core.mjs";</script>`);
    expect(fixOf(moduled, "../ui/core/faqir.js")).toEqual([]);
  });
});
