// Docs-site agent surfaces + hosting artifacts (task 0.7-15, FAQIR-PLAN §13, §8.2, §9.2).
//
// The site has two audiences. The pages are for people; these files are for
// machines, and a machine's only handle on them is a URL. So the properties
// under test here are different in kind from the rest of the docs-site suite:
//
//  • **the paths do not move.** Every agent-facing URL is spelled out as a
//    literal in this file — not imported from the generator — so renaming a
//    constant cannot quietly rename a published URL. An llms.txt address that
//    has been pasted into a prompt somewhere is an API.
//  • **the machine files are the real ones.** The hosted schema and registry
//    index are byte-identical to the repository's, and the hosted llms.txt pair
//    is what the CLI's own `--format llms` generator produces for the registry —
//    not a second, site-flavoured rendering of the same facts.
//  • **the copied snippet runs.** The copy-for-agents payload is asserted as a
//    document: it parses into a real DOM, it carries the two-tag CDN preamble
//    pinned to an exact version with matching subresource integrity, it depends
//    on nothing relative, and it is clean under the same document rules the
//    live-example pages are. Then the button is clicked in a DOM and what lands
//    on the clipboard is compared to the file that was just asserted.

import { describe, it, expect } from "bun:test";
import { Window } from "happy-dom";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDocsSite,
  discoverDocsComponents,
  readCdnPin,
  sanitizeReferenceFragment,
  snippetPath,
  AGENTS_PAGE,
  HEADERS_FILE,
  LLMS_FULL_FILE,
  LLMS_INDEX_FILE,
  REGISTRY_INDEX_FILE,
  SCHEMA_FILE,
  SNIPPET_PREFIX,
} from "../../src/generator/docs";
import { buildRegistryContext } from "../../src/generator/registry-context";
import { formatContextLlms, formatContextLlmsFull } from "../../src/generator/context";
import { BREAKPOINT_LIST } from "../../src/utils/breakpoints";
import { LAYOUT_PRIMITIVES, RESPONSIVE_GRAMMAR } from "../../src/utils/layout";
import { DOCUMENT_RULES } from "../../src/audit/rules";
import { parseDocument } from "../../src/parser/html-parser";
import { validateAgainstSchema } from "../../src/utils/json-schema";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");

const components = discoverDocsComponents(REGISTRY);
const files = buildDocsSite();
const byPath = new Map(files.map((f) => [f.path, f.content]));
const pin = readCdnPin(REPO);
/** Components that ship reference markup — the ones with an example and a snippet. */
const withReference = components.filter((c) => byPath.has(c.examplePath));

function file(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`the site does not ship ${path}`);
  return content;
}

// ── the site contract ───────────────────────────────────────────────────────

describe("the site contract — stable agent-facing URLs", () => {
  /**
   * Written out by hand, deliberately. Deriving this list from the generator's
   * own constants would assert only that the generator agrees with itself; these
   * strings are the published contract, and changing one has to fail here.
   */
  const STABLE_PATHS = [
    "llms.txt",
    "llms-full.txt",
    "manifest.schema.json",
    "registry-index.json",
    "_headers",
    "agents/index.html",
    "snippets/primitives/button.html.txt",
    "snippets/recipes/dialog.html.txt",
  ];

  it("serves every documented path", () => {
    const missing = STABLE_PATHS.filter((p) => !byPath.has(p));
    expect(missing.join(", ")).toBe("");
  });

  it("pins the generator's constants to those same literals", () => {
    // The other half of the guard: the constants the generator builds paths from
    // are what the literals above say they are, so a rename shows up as a failure
    // in one obvious place rather than as a silently relocated URL.
    expect(LLMS_INDEX_FILE).toBe("llms.txt");
    expect(LLMS_FULL_FILE).toBe("llms-full.txt");
    expect(SCHEMA_FILE).toBe("manifest.schema.json");
    expect(REGISTRY_INDEX_FILE).toBe("registry-index.json");
    expect(HEADERS_FILE).toBe("_headers");
    expect(AGENTS_PAGE).toBe("agents/index.html");
    expect(SNIPPET_PREFIX).toBe("snippets/");
    expect(snippetPath("primitives", "button")).toBe("snippets/primitives/button.html.txt");
  });

  it("gives every component with reference markup a snippet URL", () => {
    expect(withReference.length).toBeGreaterThan(50); // tripwire
    for (const c of withReference) {
      expect(byPath.has(snippetPath(c.layer, c.name)), `${c.name} has no snippet`).toBe(true);
    }
    // Layer-scoped like the pages, for the same reason: `empty-state` ships as
    // both a primitive and a pattern.
    const dupes = components.filter((c) => c.name === "empty-state");
    expect(new Set(dupes.map((c) => snippetPath(c.layer, c.name))).size).toBe(2);
  });

  it("declares a content type and CORS for every machine file", () => {
    const headers = file(HEADERS_FILE);
    const types: Record<string, string> = {
      "/llms.txt": "text/plain; charset=utf-8",
      "/llms-full.txt": "text/plain; charset=utf-8",
      "/manifest.schema.json": "application/schema+json; charset=utf-8",
      "/registry-index.json": "application/json; charset=utf-8",
      "/snippets/*": "text/plain; charset=utf-8",
    };
    for (const [path, type] of Object.entries(types)) {
      expect(headers, `${path} has no rule in _headers`).toContain(
        `${path}\n  Content-Type: ${type}\n  Access-Control-Allow-Origin: *`,
      );
    }
  });

  it("documents each machine file on the agents page, linked to the file itself", () => {
    const agents = file(AGENTS_PAGE);
    for (const name of [LLMS_INDEX_FILE, LLMS_FULL_FILE, SCHEMA_FILE, REGISTRY_INDEX_FILE]) {
      expect(agents, `${name} is served but not documented`).toContain(`href="../${name}"`);
    }
    // The link checker (docs-site.test.ts) resolves those hrefs against the built
    // tree, so "documented" also means "resolves".
    expect(agents).toContain(`href="../${SNIPPET_PREFIX}`);
  });
});

// ── llms.txt / llms-full.txt ────────────────────────────────────────────────

describe("the hosted llms.txt pair describes the whole registry", () => {
  const index = () => file(LLMS_INDEX_FILE);
  const full = () => file(LLMS_FULL_FILE);

  it("is the CLI's own generator, pointed at the registry", () => {
    // Structural parity, not a lookalike: the same formatters the project-scoped
    // `faqir context --format llms` calls, over a ContextData built from the
    // registry instead of from an installed `ui/` directory.
    const context = buildRegistryContext({
      registryRoot: REGISTRY,
      components,
      theme: "default",
    });
    expect(index()).toBe(formatContextLlms(context));
    expect(full()).toBe(formatContextLlmsFull(context));
  });

  it("covers every component in the registry", () => {
    const idx = index();
    const doc = full();
    for (const c of components) {
      expect(idx, `${c.name} is missing from llms.txt`).toContain(`[${c.name}](llms-full.txt#`);
      expect(doc, `${c.name} is missing from llms-full.txt`).toContain(`### ${c.name}\n`);
    }
    // Counted from the registry, so a component that stopped being documented
    // shows up as a number, not just as a missing line. One block per registry
    // component — `empty-state` is documented twice because it ships twice, as a
    // primitive and as a pattern (its markdown anchor collides: task 0.7-21).
    expect([...doc.matchAll(/^### (.+)$/gm)].length).toBe(components.length);
  });

  it("resolves every link it makes into the full reference", () => {
    const anchors = new Set([...full().matchAll(/^#{2,3} (.+)$/gm)].map((m) => slug(m[1])));
    const broken: string[] = [];
    for (const m of index().matchAll(/\]\(llms-full\.txt#([^)]+)\)/g)) {
      if (!anchors.has(m[1])) broken.push(m[1]);
    }
    expect(broken.join(", ")).toBe("");
  });

  it("speaks as a registry, not as somebody's project", () => {
    // The blurb is generated from `meta.scope`; a hosted file claiming "this
    // project installs …" would be describing a project the reader does not have.
    expect(index()).toContain("The registry ships");
    expect(index()).not.toContain("This project installs");
    const counts = {
      primitives: components.filter((c) => c.layer === "primitives").length,
      recipes: components.filter((c) => c.layer === "recipes").length,
      patterns: components.filter((c) => c.layer === "patterns").length,
    };
    expect(index()).toContain(
      `${counts.primitives} primitives, ${counts.recipes} recipes, and ${counts.patterns} patterns`,
    );
  });

  it("teaches layout to a crawler that reads only the index (task 0.8-12)", () => {
    // The component list can describe every variant and still leave an agent
    // guessing a breakpoint, so the ladder and the grammar are stated in
    // llms.txt itself rather than only linked into the full reference.
    const idx = index();
    for (const b of BREAKPOINT_LIST) expect(idx).toContain(`${b.tier} ${b.rem}rem`);
    expect(idx).toContain(RESPONSIVE_GRAMMAR);
    for (const p of LAYOUT_PRIMITIVES) {
      expect(idx, `llms.txt omits the ${p.name} primitive`).toContain(`\`${p.name}\``);
      // …and each one is a component of the registry it indexes.
      expect(idx).toContain(`[${p.name}](llms-full.txt#${p.name})`);
    }
    expect(full()).toContain("## Layout system");
    expect(full()).toContain("## Responsive tiers");
  });

  it("carries no timestamp, so the drift gate stays meaningful", () => {
    for (const path of [LLMS_INDEX_FILE, LLMS_FULL_FILE]) {
      expect(file(path)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    }
  });
});

/** GitHub-style anchor slug for a markdown heading. */
function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ── schema + registry index ────────────────────────────────────────────────

describe("the hosted schema and registry index are the real ones", () => {
  it("serves manifest.schema.json byte-identical to the repository's", () => {
    expect(file(SCHEMA_FILE)).toBe(readFileSync(join(REPO, SCHEMA_FILE), "utf8"));
  });

  it("serves the schema at the path its own $id claims", () => {
    // `$id` is not a convention here, it is an identifier: every manifest's
    // `$schema` resolves against it, so the hosted path has to match.
    const schema = JSON.parse(file(SCHEMA_FILE)) as { $id: string };
    expect(new URL(schema.$id).pathname).toBe(`/${SCHEMA_FILE}`);
  });

  it("validates every registry manifest against the hosted copy", () => {
    const schema = JSON.parse(file(SCHEMA_FILE));
    const failures: string[] = [];
    for (const c of components) {
      const errors = validateAgainstSchema(schema, c.manifest);
      if (errors.length > 0) {
        failures.push(`${c.layer}/${c.name}: ${errors.map((e) => e.message).join("; ")}`);
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  it("serves registry-index.json byte-identical to the built index", () => {
    expect(file(REGISTRY_INDEX_FILE)).toBe(
      readFileSync(join(REGISTRY, REGISTRY_INDEX_FILE), "utf8"),
    );
  });

  it("indexes every documented component, with a hash per file", () => {
    const index = JSON.parse(file(REGISTRY_INDEX_FILE)) as {
      schema: string;
      count: number;
      components: { name: string; layer: string; hash: string; files: { path: string; sha256: string }[] }[];
    };
    expect(index.schema).toBe("faqir-registry-index@1");
    expect(index.count).toBe(index.components.length);

    const indexed = new Set(index.components.map((c) => `${c.layer}/${c.name}`));
    for (const c of components) {
      expect(indexed.has(`${c.layer}/${c.name}`), `${c.name} is not in the registry index`).toBe(
        true,
      );
    }
    for (const entry of index.components) {
      expect(entry.hash, `${entry.name} has no component hash`).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.files.length, `${entry.name} indexes no files`).toBeGreaterThan(0);
      for (const f of entry.files) {
        expect(f.sha256, `${entry.name}/${f.path} has no sha256`).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });
});

// ── the CDN pin ────────────────────────────────────────────────────────────

describe("the CDN pin the snippets carry", () => {
  const corePkg = JSON.parse(
    readFileSync(join(REPO, "packages", "core", "package.json"), "utf8"),
  ) as { name: string; version: string };

  it("belongs to the version of @faqir-ui/core in this repository", () => {
    // A pin whose version has moved on from its hashes ships a page the browser
    // refuses to render: the URL resolves to bytes the integrity does not match.
    expect(pin.package).toBe(corePkg.name);
    expect(pin.version).toBe(corePkg.version);
    expect(pin.base).toBe(`https://cdn.jsdelivr.net/npm/${corePkg.name}@${corePkg.version}/dist/`);
  });

  it("hashes the two files the preamble loads", () => {
    for (const name of ["faqir.default.css", "faqir-core.min.js"]) {
      expect(pin.integrity[name], `${name} has no integrity hash`).toMatch(/^sha384-[A-Za-z0-9+/=]+$/);
    }
  });

  it("agrees with the package build's own sri.json when it has been run", () => {
    // `packages/core/dist/` is git-ignored, so this holds on a developer machine
    // and is vacuous on a bare CI checkout — which is exactly why the pin is
    // committed separately in the first place.
    const sriPath = join(REPO, "packages", "core", "dist", "sri.json");
    if (!existsSync(sriPath)) return;
    const sri = JSON.parse(readFileSync(sriPath, "utf8")) as Record<string, string>;
    expect(pin.integrity).toEqual(sri);
  });
});

// ── the copy-for-agents payload ────────────────────────────────────────────

describe("copy-for-agents payloads are standalone documents", () => {
  /** Load a payload into a real DOM, the way a pasted file would be loaded. */
  function parse(source: string): Window {
    const window = new Window({
      url: "https://faqir.test/pasted.html",
      settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
    });
    window.document.write(source);
    return window;
  }

  it("parses into a document with a title and one main landmark", () => {
    for (const c of withReference) {
      const window = parse(file(snippetPath(c.layer, c.name)));
      const doc = window.document;
      expect(doc.documentElement.getAttribute("lang"), `${c.name}`).toBe("en");
      expect(doc.title, `${c.name} has no title`).toContain(c.name);
      // At least one, not exactly one: `sidebar`'s reference page demonstrates
      // two whole shells, each with its own `<main>`. That is the registry's
      // markup and it goes in verbatim; what governs it is the `landmark`
      // document rule, asserted over every payload below.
      expect(doc.querySelectorAll("main").length, `${c.name} main landmarks`).toBeGreaterThan(0);
      expect(doc.body.children.length, `${c.name} renders nothing`).toBeGreaterThan(0);
    }
  });

  it("loads exactly the two pinned CDN tags, with matching integrity", () => {
    for (const c of withReference) {
      const source = file(snippetPath(c.layer, c.name));
      const doc = parse(source).document;

      const links = [...doc.querySelectorAll("link")];
      const scripts = [...doc.querySelectorAll("script")];
      expect(links.length, `${c.name} link tags`).toBe(1);
      expect(scripts.length, `${c.name} script tags`).toBe(1);

      const css = links[0];
      expect(css.getAttribute("href")).toBe(`${pin.base}faqir.default.css`);
      expect(css.getAttribute("integrity")).toBe(pin.integrity["faqir.default.css"]);
      expect(css.getAttribute("crossorigin")).toBe("anonymous");

      const js = scripts[0];
      expect(js.getAttribute("src")).toBe(`${pin.base}faqir-core.min.js`);
      expect(js.getAttribute("integrity")).toBe(pin.integrity["faqir-core.min.js"]);
      expect(js.getAttribute("crossorigin")).toBe("anonymous");
      expect(js.hasAttribute("defer")).toBe(true);
    }
  });

  it("pins an exact version — never a range", () => {
    // `@0.2` would resolve to whatever jsDelivr serves tomorrow, and the
    // integrity hash would stop matching the moment it did.
    for (const c of withReference) {
      const source = file(snippetPath(c.layer, c.name));
      for (const m of source.matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/([^"]+)/g)) {
        expect(m[1], `${c.name} pins ${m[1]}`).toMatch(
          new RegExp(`^@faqir-ui/core@${pin.version.replace(/\./g, "\\.")}/dist/`),
        );
      }
    }
  });

  it("depends on nothing relative — it runs from an empty directory", () => {
    for (const c of withReference) {
      const doc = parseDocument(file(snippetPath(c.layer, c.name)), c.name);
      for (const el of doc.elements) {
        for (const attr of ["src", "href"]) {
          const value = el.attrs[attr];
          if (!value) continue;
          // Registry demo markup carries placeholder `href="/"` / `href="#tab"`
          // links for an imaginary host app; only fetched subresources matter.
          if (el.tag !== "link" && el.tag !== "script" && el.tag !== "img") continue;
          expect(
            /^(?:https:\/\/cdn\.jsdelivr\.net\/|data:)/.test(value),
            `${c.name} loads ${value} from somewhere else`,
          ).toBe(true);
        }
      }
    }
  });

  it("carries the registry's reference markup verbatim", () => {
    for (const c of withReference) {
      const fragment = sanitizeReferenceFragment(readFileSync(c.referencePath, "utf8"));
      expect(file(snippetPath(c.layer, c.name)), `${c.name}'s snippet is not its fragment`).toContain(
        fragment,
      );
    }
  });

  it("is clean under the document rules, like the example pages it mirrors", () => {
    const findings: string[] = [];
    for (const c of withReference) {
      const path = snippetPath(c.layer, c.name);
      const doc = parseDocument(file(path), path);
      for (const rule of DOCUMENT_RULES) {
        for (const r of rule.check(doc)) {
          findings.push(`${path}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`);
        }
      }
    }
    expect(findings.join("\n")).toBe("");
  });
});

// ── the button ─────────────────────────────────────────────────────────────

describe("the copy button copies exactly that payload", () => {
  const probe = components.find((c) => c.name === "button" && c.layer === "primitives")!;

  /**
   * A component page in a DOM, with `copy-snippet.js` executed against it.
   *
   * happy-dom does not run script elements, so the shipped file is compiled and
   * called with the window's globals bound. `navigator` is passed explicitly:
   * left free it would resolve to the *test runner's* navigator, and the
   * clipboard assertion below would be testing nothing.
   */
  function mount(pagePath: string, clipboard: { writes: string[] } | null) {
    const window = new Window({
      url: "https://faqir.test/components/primitives/button.html",
      settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
    });
    window.document.write(file(pagePath));
    const navigator = clipboard
      ? { clipboard: { writeText: (text: string) => (clipboard.writes.push(text), Promise.resolve()) } }
      : {};
    new Function(
      "window",
      "document",
      "globalThis",
      "navigator",
      `${file("scripts/copy-snippet.js")}\n//# sourceURL=scripts/copy-snippet.js`,
    )(window, window.document, window, navigator);
    window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
    return window;
  }

  it("puts the snippet file's exact bytes on the clipboard", async () => {
    const clipboard = { writes: [] as string[] };
    const window = mount(probe.pagePath, clipboard);
    const button = window.document.querySelector("[data-copy-snippet]");
    expect(button, "the component page has no copy button").not.toBeNull();

    button!.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(clipboard.writes.length).toBe(1);
    expect(clipboard.writes[0]).toBe(file(snippetPath(probe.layer, probe.name)));
    expect(window.document.getElementById("agent-snippet-status")!.textContent).toContain("Copied");
  });

  it("shows the same bytes on the page, so it works with no JavaScript at all", () => {
    // The visible <pre><code> is the payload's only copy on the page — the button
    // reads it rather than carrying a duplicate — so a reader who selects it by
    // hand gets the file, and `file://` (no clipboard API) still works.
    const window = mount(probe.pagePath, null);
    const source = window.document.getElementById("agent-snippet");
    expect(source!.textContent).toBe(file(snippetPath(probe.layer, probe.name)));
  });

  it("says so instead of failing silently when there is no clipboard", () => {
    const window = mount(probe.pagePath, null);
    window.document
      .querySelector("[data-copy-snippet]")!
      .dispatchEvent(new window.Event("click", { bubbles: true }));
    const status = window.document.getElementById("agent-snippet-status")!.textContent;
    expect(status.length).toBeGreaterThan(0);
    expect(status).not.toContain("Copied");
  });

  it("puts a button on every component page that has a payload", () => {
    for (const c of withReference) {
      expect(file(c.pagePath), `${c.name} has no copy button`).toContain(
        'data-copy-snippet="agent-snippet"',
      );
      expect(file(c.pagePath), `${c.name} does not link its snippet file`).toContain(
        `href="${"../".repeat(c.pagePath.split("/").length - 1)}${snippetPath(c.layer, c.name)}"`,
      );
    }
  });
});
