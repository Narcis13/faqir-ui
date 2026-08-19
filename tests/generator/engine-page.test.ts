/**
 * The engine page's examples, run under the real engine.  [task 1.0R-09]
 *
 * `tests/generator/docs-site.test.ts` proves the reactive-engine page documents
 * the vocabulary the engine declares, and audits the bytes it mounts. That is
 * only half of the claim: an example can be audit-clean, correctly rendered and
 * still not *work*. This file mounts every authored example under the shipped
 * engine and asserts it binds, renders and reacts.
 *
 * It loads ONLY `registry/core/faqir-core.dev.js`, per the note in
 * `tests/core/dev-build.test.ts`: each engine bootstraps a MutationObserver over
 * the shared document, so one engine per file. The DEV build is the one worth
 * having here — it records a diagnostic for a failed expression, an `l-…`
 * attribute nothing handles and an unkeyed `l-for`, so "zero warnings after
 * mounting every example" is a real assertion about the examples rather than
 * about the engine's silence.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGuideExamples, type GuideExample } from "../../src/generator/docs";

const Faqir = require("../../registry/core/faqir-core.dev.js");
const DEVTOOLS = Faqir.devtools;

const REPO = join(import.meta.dir, "../..");
const AUTHORED = readFileSync(join(REPO, "site", "content", "engine.html"), "utf8");
const MESSAGES = JSON.parse(readFileSync(join(REPO, "site", "content", "messages.json"), "utf8"));
const examples = parseGuideExamples(AUTHORED);

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The `l-source` example reads the site's own static endpoint. */
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: any) =>
  String(input).includes("api/messages")
    ? new Response(JSON.stringify(MESSAGES), { headers: { "content-type": "application/json" } })
    : originalFetch(input)) as typeof fetch;

let baseline = 0;

beforeEach(async () => {
  document.body.innerHTML = "";
  await tick();
  baseline = DEVTOOLS.warnings().length;
});

/** Diagnostics the engine recorded since the current test began. */
function fresh(): { kind: string; message: string }[] {
  return DEVTOOLS.warnings().slice(baseline);
}

async function mount(example: GuideExample): Promise<HTMLElement> {
  document.body.innerHTML = example.html;
  Faqir.start();
  await tick();
  await tick();
  return document.body.firstElementChild as HTMLElement;
}

function byId(id: string): GuideExample {
  const found = examples.find((e) => e.id === id);
  if (!found) throw new Error(`the engine page no longer carries the ${id} example`);
  return found;
}

describe("the engine page's examples run under the engine", () => {
  it("has examples to run", () => {
    expect(examples.length).toBeGreaterThanOrEqual(4);
  });

  for (const example of examples) {
    it(`binds ${example.id} with no diagnostic from the dev engine`, async () => {
      const root = await mount(example);
      expect(root).not.toBeNull();
      // The engine saw a scope here — an example that silently bound nothing
      // would pass every string assertion in the generator suite.
      expect(DEVTOOLS.scopes(document.body).length, `${example.id} declared no scope`)
        .toBeGreaterThan(0);
      expect(Faqir.inspect(root).directives.length, `${example.id} bound no directive`)
        .toBeGreaterThan(0);
      expect(
        fresh().map((w) => `${w.kind}: ${w.message}`).join("\n"),
        `${example.id} made the dev engine complain`,
      ).toBe("");
    });
  }

  it("counts up and down when the counter's buttons are clicked", async () => {
    const root = await mount(byId("counter"));
    const [less, more] = [...root.querySelectorAll("button")];
    const output = root.querySelector("[l-text]") as HTMLElement;

    expect(output.textContent).toBe("0");
    more.click();
    await tick();
    expect(output.textContent).toBe("1");
    less.click();
    less.click();
    await tick();
    expect(output.textContent).toBe("-1");
  });

  it("writes the input back into the scope through l-model.trim", async () => {
    const root = await mount(byId("two-way"));
    const input = root.querySelector("input") as HTMLInputElement;
    const greeting = root.querySelector("p [l-text]") as HTMLElement;

    expect(greeting.textContent).toBe("stranger");
    input.value = "  Ada  ";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    // `.trim` is the modifier the example demonstrates: the scope must hold the
    // trimmed value, not the typed one.
    expect(Faqir.inspect(root).scope.name).toBe("Ada");
    expect(greeting.textContent).toBe("Ada");
  });

  it("renders one row per item and reconciles a removal by key", async () => {
    const root = await mount(byId("keyed-list"));
    const rows = () => [...root.querySelectorAll("li")];
    expect(rows().length).toBe(2);
    expect(rows()[0].textContent).toContain("Read the manifest");

    (rows()[0].querySelector("button") as HTMLElement).click();
    await tick();
    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain("Ship the page");

    // …and the `l-if` empty case is real markup, not decoration.
    (rows()[0].querySelector("button") as HTMLElement).click();
    await tick();
    await tick();
    expect(rows().length).toBe(0);
    expect(root.textContent).toContain("Nothing left");
  });

  it("toggles the l-show panel and stamps the motion phases l-transition names", async () => {
    const root = await mount(byId("show-transition"));
    const panel = root.querySelector("[l-show]") as HTMLElement;
    const toggle = root.querySelector("button") as HTMLElement;

    expect(panel.style.display).not.toBe("none");
    expect(toggle.textContent).toBe("Hide the note");
    toggle.click();
    await tick();
    expect(toggle.textContent).toBe("Show the note");
    // The engine only stamps `data-motion`; the CSS animates. Either the phase
    // attribute is present (mid-cycle) or the element is already hidden.
    expect(panel.hasAttribute("data-motion") || panel.style.display === "none").toBe(true);
  });

  it("loads the l-source collection and renders it", async () => {
    const root = await mount(byId("source"));
    // The static endpoint the site ships, through the engine's own loader.
    await tick();
    const scope = Faqir.inspect(root).scope;
    expect(Array.isArray(scope.messages)).toBe(true);
    expect(scope.messages.length).toBe(MESSAGES.length);
    expect(scope.messagesLoading).toBe(false);
    expect(scope.messagesError).toBeFalsy();
    const rows = [...root.querySelectorAll("li")];
    expect(rows.length).toBe(MESSAGES.length);
    expect(rows[0].textContent).toContain(MESSAGES[0].sender);
  });
});
