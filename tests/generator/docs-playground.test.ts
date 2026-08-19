// Docs-site playground wiring (task 0.7-14, FAQIR-PLAN §13).
//
// The parity suite (audit-browser.test.ts) proves the browser bundle reports what
// the CLI reports. This one proves the *page* is wired to it: the generated
// playground HTML, the generated manifests payload, the committed bundle and the
// authored `playground.js` are loaded into a real DOM exactly as a browser would
// load them — same files, same order, no stubs — and then driven by typing.
//
// The load-bearing property is that it cannot crash. A playground audits whatever
// is in the textarea, which for most of a keystroke is malformed markup, so the
// fuzz corpus from task 0.5-09 is replayed through the page itself.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDocsSite,
  PLAYGROUND_PAGE,
  MANIFESTS_GLOBAL,
  THEME_LINK_ID,
  UI_VALUES_GLOBAL,
} from "../../src/generator/docs";
import { getHtmlRuleInventory } from "../../src/audit/rules";
import { knownUiValues } from "../../src/utils/components";
import { generateAt } from "../parser/fuzz/fuzz-core";

const REPO = join(import.meta.dir, "../..");
const files = buildDocsSite();
const byPath = new Map(files.map((f) => [f.path, f.content]));

function file(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`the site does not ship ${path}`);
  return content;
}

/** The four scripts the playground page loads, in the order it loads them. */
const SCRIPT_ORDER = [
  "scripts/gallery.js",
  "scripts/faqir-audit.js",
  "scripts/faqir-manifests.js",
  "scripts/playground.js",
];

interface Harness {
  window: Window;
  source: HTMLTextAreaElement;
  findings: HTMLElement;
  count: HTMLElement;
  preview: HTMLElement;
  /** Type into the textarea and let the debounce settle. */
  type(markup: string): Promise<void>;
  /** Run the audit pass synchronously, skipping the debounce. */
  run(markup: string): void;
  rows(): string[][];
}

let harness: Harness;

/**
 * A window holding the generated page, with subresource loading off.
 *
 * The `<script src>` tags are left in the document on purpose — `playground.js`
 * locates the registry engine by looking its own tag up, which is exactly the kind
 * of wiring a test that rewrote the page would stop covering.
 */
function newWindow(): Window {
  return new Window({
    url: "https://faqir.test/playground/index.html",
    settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
}

/**
 * Run one of the site's script files against a window.
 *
 * happy-dom does not evaluate script elements, so each file is compiled once and
 * called with the window's globals bound — `window`, `document`, `globalThis` and
 * the timer pair, which is every global these files touch. The *sources* are
 * the shipped bytes and the *order* is the page's order, so what is being tested
 * is still the real wiring; only the loader is the test's.
 */
function loadScript(window: Window, path: string): void {
  const compiled = new Function(
    "window",
    "document",
    "globalThis",
    "setTimeout",
    "clearTimeout",
    `${file(path)}\n//# sourceURL=${path}`,
  );
  compiled(
    window,
    window.document,
    window,
    window.setTimeout.bind(window),
    window.clearTimeout.bind(window),
  );
}

/**
 * Load the generated page into happy-dom and execute its scripts in order.
 *
 * The page goes in verbatim and its four scripts are then run in the page's own
 * order — shared appearance, the engine, the manifests, and playground wiring.
 * That order is part of what is
 * under test: `playground.js` refuses to run without the first two, which the
 * "degrades to an explanation" case exercises from the other side.
 */
function mount(): Harness {
  const window = newWindow();
  window.document.write(file(PLAYGROUND_PAGE));

  for (const path of SCRIPT_ORDER) loadScript(window, path);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

  const doc = window.document;
  const get = (id: string): HTMLElement => {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`the playground page has no #${id}`);
    return el as unknown as HTMLElement;
  };
  const source = get("playground-source") as unknown as HTMLTextAreaElement;
  const findings = get("playground-findings");

  return {
    window,
    source,
    findings,
    count: get("playground-count"),
    preview: get("playground-preview"),
    async type(markup: string) {
      source.value = markup;
      // happy-dom's own Event class, cast across the two DOM typings in play (the
      // globally-registered one and this file's imported Window).
      source.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
      await new Promise((resolve) => setTimeout(resolve, 250));
    },
    run(markup: string) {
      source.value = markup;
      (window as unknown as { FaqirPlayground: { run(): void } }).FaqirPlayground.run();
    },
    rows() {
      return [...findings.querySelectorAll("tbody tr")].map((tr) =>
        [...tr.querySelectorAll("td")].map((td) => (td.textContent ?? "").trim()),
      );
    },
  };
}

beforeAll(() => {
  harness = mount();
});

afterAll(async () => {
  await harness.window.happyDOM?.close();
});

// ── the page as generated ───────────────────────────────────────────────────

describe("the playground page", () => {
  const page = file(PLAYGROUND_PAGE);

  it("loads shared appearance, the engine, manifests and wiring in order from this site", () => {
    const srcs = [...page.matchAll(/<script src="([^"]+)"([^>]*)><\/script>/g)];
    expect(srcs.map((m) => m[1])).toEqual([
      "../scripts/gallery.js",
      "../scripts/faqir-audit.js",
      "../scripts/faqir-manifests.js",
      "../scripts/playground.js",
    ]);
    // `defer` on every one: they must run after the textarea exists, in order.
    for (const m of srcs) expect(m[2]).toContain("defer");
    for (const path of SCRIPT_ORDER) expect(byPath.has(path)).toBe(true);
  });

  it("ships the committed browser bundle byte for byte", () => {
    expect(file("scripts/faqir-audit.js")).toBe(
      readFileSync(join(REPO, "site", "lib", "faqir-audit.js"), "utf8"),
    );
    expect(file("scripts/playground.js")).toBe(
      readFileSync(join(REPO, "site", "lib", "playground.js"), "utf8"),
    );
  });

  it("says what it does before any script runs", () => {
    // The page is honest with JavaScript off: it explains rather than showing an
    // empty findings list that looks like a clean bill of health.
    expect(page).toContain("with JavaScript disabled there are no findings to show");
  });

  it("documents every rule the engine actually runs", () => {
    // `getHtmlRuleInventory()` is the engine's own list of the rules a caller
    // holding markup alone can run, so a rule added there gains its legend row
    // with no edit to the generator and none to the site (task 1.0R-11).
    expect(getHtmlRuleInventory().map((r) => r.id)).toContain("unknown-component");
    for (const rule of getHtmlRuleInventory()) {
      expect(page, `the playground does not document ${rule.id}`).toContain(
        `<code>${rule.id}</code>`,
      );
    }
  });

  it("loads no external subresources — the audit runs in the page", () => {
    // The manifests payload is excluded: it is registry *data*, and manifests
    // quote URLs (schema refs, example image sources) inside JSON strings. It is
    // held to being a single assignment instead, below. The shell may link to
    // GitHub as navigation; only fetched subresources are relevant here.
    expect(page).not.toMatch(
      /<(?:script|iframe)\b[^>]*\bsrc="https?:\/\/|<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="https?:\/\/)[^>]*>/i,
    );
    for (const path of [
      "scripts/gallery.js",
      "scripts/faqir-audit.js",
      "scripts/playground.js",
    ]) {
      expect(file(path), `${path} names an external origin`).not.toMatch(/https?:\/\//);
    }
    expect(file("scripts/playground.js")).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|import\s*\(/);
  });
});

// ── wiring ──────────────────────────────────────────────────────────────────

describe("typing into the playground", () => {
  it("audits the authored sample on load", async () => {
    const rules = new Set(harness.rows().map((r) => r[1]));
    expect(rules.size).toBeGreaterThan(0);
    expect(rules.has("valid-variant")).toBe(true);
    expect(harness.count.textContent).toBe(String(harness.rows().length));
  });

  it("updates the findings list as the markup changes", async () => {
    await harness.type('<button data-ui="button" data-variant="nope">Go</button>');
    expect(harness.rows().map((r) => r[1])).toEqual(["valid-variant"]);
    expect(harness.rows()[0][0]).toBe("error");
    expect(harness.rows()[0][3]).toContain('Invalid variant "nope"');
    expect(harness.count.textContent).toBe("1");

    await harness.type('<button data-ui="button" data-variant="primary">Go</button>');
    expect(harness.rows()).toEqual([]);
    expect(harness.findings.querySelector('[data-ui="callout"]')?.getAttribute("data-variant")).toBe(
      "success",
    );
    expect(harness.count.textContent).toBe("0");
  });

  it("catches a hallucinated component name in the page (task 1.0R-11)", async () => {
    // The rule the playground exists to demonstrate: an agent's most likely
    // mistake, in the shop window, decided from the registry name list the
    // generator ships beside the manifests.
    await harness.type('<div data-ui="dailog"><div data-part="panel">Hi</div></div>');
    expect(harness.rows().map((r) => r[1])).toEqual(["unknown-component"]);
    expect(harness.rows()[0][0]).toBe("warning");
    expect(harness.rows()[0][3]).toContain('Did you mean data-ui="dialog"?');

    // …and the names that merely have no manifest in the payload stay silent:
    // an alias, a base-layer value and a companion value.
    await harness.type(
      '<div data-ui="alert"><div data-part="content">A</div></div>' +
        '<article data-ui="prose"><p>B</p></article>' +
        '<div data-ui="button-group"><button data-ui="button">C</button></div>',
    );
    expect(harness.rows().map((r) => r[1])).toEqual([]);
  });

  it("orders findings worst-first", async () => {
    await harness.type(
      '<button data-ui="button" data-variant="nope">Go</button>' +
        '<div data-ui="card"><div data-part="header">h</div></div>',
    );
    const severities = harness.rows().map((r) => r[0]);
    expect(severities[0]).toBe("critical");
    expect(new Set(severities)).toEqual(new Set(["critical", "error"]));
  });

  it("renders findings as text, never as markup", async () => {
    // The textarea is arbitrary HTML; a finding's message quotes it back. If the
    // list were built with innerHTML, this would inject a live element.
    await harness.type('<div data-ui="badge" data-variant="<img src=x>">b</div>');
    expect(harness.findings.querySelector("img")).toBeNull();
    expect(harness.rows()[0][3]).toContain("<img src=x>");
  });

  it("feeds the preview frame the markup with the site's own stylesheets", async () => {
    await harness.type('<button data-ui="button" data-variant="primary">Go</button>');
    const srcdoc = harness.preview.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain('<button data-ui="button" data-variant="primary">Go</button>');
    expect(srcdoc).toContain("styles/faqir.css");
    expect(srcdoc).toContain("styles/themes/");
    expect(srcdoc).toContain("scripts/faqir-core.js");
    expect(srcdoc).toContain("<main>");
    // Sandboxed, and without `allow-same-origin`: the preview can run recipe
    // controllers but cannot reach the page that framed it.
    expect(harness.preview.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("keeps the preview in the scheme the page is in", async () => {
    harness.window.document.documentElement.setAttribute("data-theme", "dark");
    await harness.type("<p>hello</p>");
    expect(harness.preview.getAttribute("srcdoc")).toContain('data-theme="dark"');
    harness.window.document.documentElement.setAttribute("data-theme", "auto");
  });

  it("finds the theme link by its stable id", () => {
    expect(harness.window.document.getElementById(THEME_LINK_ID)).not.toBeNull();
  });
});

// ── malformed input ─────────────────────────────────────────────────────────

describe("malformed input", () => {
  const samples = [
    "",
    "<",
    "<div",
    '<div data-ui="',
    "<!--",
    "<div data-ui=card><div data-part=body></div>",
    "</div></div>",
    '<div data-ui="button" data-variant=\'"><script>x</script>',
    "<div ".repeat(500),
    "&#x0;&amp;&lt;",
    ...Array.from({ length: 120 }, (_, i) => generateAt(0x7014, i)),
  ];

  it(`survives ${samples.length} malformed inputs without throwing`, () => {
    for (const sample of samples) {
      expect(() => harness.run(sample)).not.toThrow();
      // Still a live page after every one: the findings region has content and
      // the count badge is a number.
      expect(harness.findings.childElementCount).toBeGreaterThan(0);
      expect(harness.count.textContent).toMatch(/^\d+$/);
    }
  });

  it("never reports its own engine failure — the fallback finding stays unused", () => {
    for (const sample of samples) {
      harness.run(sample);
      expect(
        harness.rows().map((r) => r[1]),
        "the audit engine bailed out on a fuzz sample",
      ).not.toContain("audit-error");
    }
  });

  it("degrades to an explanation when the engine is missing", async () => {
    const window = newWindow();
    window.document.write(file(PLAYGROUND_PAGE));
    loadScript(window, "scripts/playground.js"); // no engine, no manifests
    window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
    const findings = window.document.getElementById("playground-findings");
    expect(findings?.querySelector('[data-ui="callout"]')?.getAttribute("data-variant")).toBe(
      "destructive",
    );
    expect(findings?.textContent).toContain("did not load");
    await window.happyDOM?.close();
  });
});

// ── the manifests payload ───────────────────────────────────────────────────

describe("the manifests payload", () => {
  it("installs two globals and nothing else", () => {
    const content = file("scripts/faqir-manifests.js");
    // Data, not code: a comment, then one assignment of a JSON object literal
    // (the manifests) and one of a JSON array (every data-ui value the registry
    // defines — the input `unknown-component` is decided from, task 1.0R-11).
    expect(content).toMatch(
      new RegExp(
        `^/\\*[^]*?\\*/\\n` +
          `window\\.${MANIFESTS_GLOBAL} = \\{".*\\};\\n` +
          `window\\.${UI_VALUES_GLOBAL} = \\[".*"\\];\\n$`,
      ),
    );
    expect(content.split("\n").filter((l) => l && !l.startsWith("/*")).length).toBe(2);
  });

  it("ships exactly the names the CLI decides `unknown-component` from", () => {
    // Not a second derivation: the generator calls the same `knownUiValues` the
    // CLI does, so the playground cannot disagree with `faqir audit` about what
    // a Faqir component is.
    const content = file("scripts/faqir-manifests.js");
    const line = content.split("\n").find((l) => l.startsWith(`window.${UI_VALUES_GLOBAL}`))!;
    const values = JSON.parse(line.slice(line.indexOf("=") + 1).trim().replace(/;$/, ""));
    expect(values).toEqual(knownUiValues(join(import.meta.dir, "../../registry")));
    // The three kinds that have no manifest of their own, and would otherwise
    // look hallucinated in a page: an alias, a base-layer value, a companion.
    expect(values).toContain("alert");
    expect(values).toContain("prose");
    expect(values).toContain("button-group");
  });

  it("is handed to the auditor, so the playground runs the rule it documents", () => {
    const wiring = file("scripts/playground.js");
    expect(wiring).toContain(`window.${UI_VALUES_GLOBAL}`);
    expect(wiring).toMatch(/createAuditor\(/);
  });

  it("reports its size", () => {
    const content = file("scripts/faqir-manifests.js");
    const raw = Buffer.byteLength(content);
    console.log(`playground manifests payload: ${(raw / 1024).toFixed(2)} KB raw`);
    expect(raw).toBeGreaterThan(50 * 1024); // it is the whole registry, not a sample
  });
});
