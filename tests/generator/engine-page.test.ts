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
 *
 * The page also loads every official plugin after the engine (see
 * `renderEnginePage` in src/generator/docs.ts), so this file does too, in the
 * same order and the same way: each plugin's source runs with this engine as
 * the global `Faqir` and registers itself. Without them the plugin examples'
 * attributes would be reported as directives nothing handles.
 *
 * Examples mount into a disposable host that is destroyed after each test —
 * never `Faqir.start()` or a scope on `document.body`, which would leak into
 * every file that runs after this one in the shared happy-dom realm.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGuideExamples, type GuideExample } from "../../src/generator/docs";
import { loadPluginMetadata } from "../../src/generator/plugins";
import { settle } from "../helpers/settle";

const Faqir = require("../../registry/core/faqir-core.dev.js");
const DEVTOOLS = Faqir.devtools;

const REPO = join(import.meta.dir, "../..");
const AUTHORED = readFileSync(join(REPO, "site", "content", "engine.html"), "utf8");
const MESSAGES = JSON.parse(readFileSync(join(REPO, "site", "content", "messages.json"), "utf8"));
const examples = parseGuideExamples(AUTHORED);

const G = globalThis as any;

// On the page, `faqir-core.js` defines the global `Faqir` and each plugin
// script registers itself on it. A `require()`d engine defines no global, so
// expose this one, then evaluate each plugin from source in the page's order
// (evaluating rather than `require()`ing leaves other suites' first-require
// self-registration untouched; re-registering a directive is idempotent). The
// `store` example also reaches the global from an expression, as the page does.
const previousFaqir = G.Faqir;
G.Faqir = Faqir;
const PLUGIN_DIR = join(REPO, "registry", "core", "plugins");
const PLUGINS = loadPluginMetadata(PLUGIN_DIR);
for (const plugin of PLUGINS) {
  const mod = { exports: {} as unknown };
  new Function("module", "exports", readFileSync(join(PLUGIN_DIR, plugin.file), "utf8"))(mod, mod.exports);
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The `l-source` examples read the site's own static endpoint. A static host
 * answers GET and nothing else, so every write is refused here as it is there.
 */
const originalFetch = globalThis.fetch;
const requests: string[] = [];
globalThis.fetch = (async (input: any, init?: RequestInit) => {
  if (!String(input).includes("api/messages")) return originalFetch(input, init);
  const method = (init?.method ?? "GET").toUpperCase();
  requests.push(`${method} ${String(input)}`);
  if (method !== "GET") return new Response("", { status: 405, statusText: "Method Not Allowed" });
  return new Response(JSON.stringify(MESSAGES), { headers: { "content-type": "application/json" } });
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = originalFetch;
  if (previousFaqir === undefined) delete G.Faqir;
  else G.Faqir = previousFaqir;
});

let baseline = 0;
let host: HTMLElement | null = null;

beforeEach(async () => {
  await tick();
  requests.length = 0;
  baseline = DEVTOOLS.warnings().length;
});

afterEach(() => {
  if (host) {
    Faqir.destroy(host);
    host.remove();
    host = null;
  }
});

/** Diagnostics the engine recorded since the current test began. */
function fresh(): { kind: string; message: string }[] {
  return DEVTOOLS.warnings().slice(baseline);
}

async function mount(example: GuideExample): Promise<HTMLElement> {
  if (host) {
    Faqir.destroy(host);
    host.remove();
  }
  host = document.createElement("div");
  host.innerHTML = example.html;
  document.body.appendChild(host);
  for (const el of [...host.children]) Faqir.initTree(el as HTMLElement);
  await tick();
  await tick();
  return host.firstElementChild as HTMLElement;
}

/** Type into a text-like control the way a browser reports it. */
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string, event = "input"): void {
  el.value = value;
  el.dispatchEvent(new Event(event, { bubbles: true }));
}

function scopeOf(el: Element): any {
  return Faqir.inspect(el).scope;
}

function button(root: Element, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent!.trim() === label);
  if (!found) throw new Error(`no "${label}" button`);
  return found as HTMLButtonElement;
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
      expect(DEVTOOLS.scopes(host!).length, `${example.id} declared no scope`)
        .toBeGreaterThan(0);
      expect(Faqir.inspect(root).directives.length, `${example.id} bound no directive`)
        .toBeGreaterThan(0);
      // `l-html` is the one directive the dev engine reports on EVERY use, by
      // design (it writes unsanitized markup); an example that demonstrates it
      // is allowed exactly that notice and nothing else.
      const demonstratesHtml = /\sl-html="/.test(example.html);
      expect(
        fresh()
          .filter((w) => !(demonstratesHtml && w.kind === "html"))
          .map((w) => `${w.kind}: ${w.message}`)
          .join("\n"),
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

  // ── directives ────────────────────────────────────────────────────────────

  it("captures the title in l-init, writes it back through l-effect, and uncloaks", async () => {
    const before = document.title;
    document.title = "Reactive engine";
    try {
      const root = await mount(byId("lifecycle"));
      const input = root.querySelector("input") as HTMLInputElement;
      const captured = root.querySelector("[data-variant='muted']") as HTMLElement;

      // `l-cloak` is gone once the tree is bound, and l-init ran exactly once.
      expect(root.querySelector("[l-cloak]")).toBeNull();
      expect(captured.textContent).toBe("l-init captured: Reactive engine");
      expect(input.value).toBe("Reactive engine");

      type(input, "Typing in the tab");
      await tick();
      expect(document.title).toBe("Typing in the tab");

      button(root, "Restore it").click();
      await tick();
      expect(document.title).toBe("Reactive engine");
      expect(input.value).toBe("Reactive engine");
    } finally {
      document.title = before;
    }
  });

  it("teleports the controls into the bar and they still drive the l-html line", async () => {
    const root = await mount(byId("html-teleport"));
    const bar = root.querySelector("#engine-teleport-bar") as HTMLElement;
    const line = root.querySelector("[l-html]") as HTMLElement;

    // Written last, rendered first — and bound exactly once.
    expect(bar.querySelectorAll("button").length).toBe(2);
    expect(line.innerHTML).toBe("Step <strong>1</strong> of 4: <em>Drafted</em>");
    expect(button(bar, "Back").disabled).toBe(true);

    button(bar, "Advance").click();
    await tick();
    expect(scopeOf(root).step).toBe(1);
    expect(line.innerHTML).toBe("Step <strong>2</strong> of 4: <em>Reviewed</em>");
    expect(button(bar, "Back").disabled).toBe(false);
  });

  // ── modifiers ─────────────────────────────────────────────────────────────

  it("stores numbers through .number, writes .lazy on change, and keeps the submit on the page", async () => {
    const root = await mount(byId("model-modifiers"));
    const [qty, , note] = [...root.querySelectorAll("input")] as HTMLInputElement[];
    const total = root.querySelector("[data-variant='mono']") as HTMLElement;

    expect(total.textContent).toBe("25.00");
    type(qty, "3");
    await tick();
    expect(scopeOf(root).qty).toBe(3);
    expect(total.textContent).toBe("37.50");

    // `.lazy`: typing writes nothing; leaving the field (change) does.
    type(note, "Leave it at the door");
    await tick();
    expect(scopeOf(root).note).toBe("");
    note.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(scopeOf(root).note).toBe("Leave it at the door");

    const submit = new Event("submit", { bubbles: true, cancelable: true });
    root.dispatchEvent(submit);
    await tick();
    expect(submit.defaultPrevented).toBe(true);
    expect(scopeOf(root).placed).toBe("Ordered 3 for 37.50, note: Leave it at the door.");
  });

  it("writes the debounced query once per pause, and filters by it", async () => {
    const root = await mount(byId("debounce-filter"));
    const input = root.querySelector("input") as HTMLInputElement;
    const badges = () => [...root.querySelectorAll("[data-ui='badge']")].map((b) => b.textContent);

    expect(badges().length).toBe(10);
    type(input, "m");
    type(input, "mo");
    type(input, "mon");
    await tick();
    expect(scopeOf(root).query).toBe("");
    await wait(350);
    expect(scopeOf(root).query).toBe("mon");
    expect(scopeOf(root).writes).toBe(1);
    expect(badges()).toEqual(["monolith"]);
  });

  it("traces a click through .capture, .self, .stop and .once", async () => {
    const root = await mount(byId("event-path"));
    const panel = root.querySelector("[data-ui='surface']") as HTMLElement;
    const path = () => [...scopeOf(root).path];

    button(root, "Bubble").click();
    await tick();
    expect(path()).toEqual([
      "root, .capture: heard first, on the way down",
      "button: handled, and the click bubbles on",
      "root: heard again as it bubbled back up",
    ]);
    expect(root.querySelectorAll("ol li").length).toBe(3);

    button(root, "Stop here").click();
    await tick();
    expect(path()).toEqual([
      "root, .capture: heard first, on the way down",
      "button, .stop: handled, and propagation stops here",
    ]);

    panel.click();
    await tick();
    expect(path()).toEqual([
      "root, .capture: heard first, on the way down",
      "panel, .self: the click landed on the panel itself",
      "root: heard again as it bubbled back up",
    ]);

    const claim = button(root, "Claim the bonus once");
    claim.click();
    await tick();
    expect(scopeOf(root).bonus).toBe(10);
    expect(claim.textContent).toBe("Bonus claimed");
    claim.click();
    await tick();
    // The listener removed itself: the second click is heard by the root only.
    expect(scopeOf(root).bonus).toBe(10);
    expect(path()).toEqual([
      "root, .capture: heard first, on the way down",
      "root: heard again as it bubbled back up",
    ]);
  });

  it("listens on the window and the document, debounced and throttled", async () => {
    const width = Object.getOwnPropertyDescriptor(window, "innerWidth");
    try {
      const root = await mount(byId("global-events"));
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });
      // A scrolling container somewhere else on the page — the site scrolls its
      // <main>, not the window. `scroll` does not bubble, so only the document's
      // capture-phase listener can hear it.
      const scroller = document.createElement("div");
      document.body.appendChild(scroller);
      Object.defineProperty(scroller, "scrollTop", { configurable: true, value: 120 });

      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
      scroller.dispatchEvent(new Event("scroll"));
      scroller.remove();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
      await tick();
      // Throttled: the first scroll lands at once. Keydown is not delayed.
      expect(scopeOf(root).scrolled).toBe(120);
      expect(scopeOf(root).key).toBe("Space");
      expect((root.querySelector("kbd") as HTMLElement).textContent).toBe("Space");
      // Debounced: the resize lands 300ms after the last one.
      expect(scopeOf(root).width).not.toBe(640);
      await wait(350);
      expect(scopeOf(root).width).toBe(640);
    } finally {
      if (width) Object.defineProperty(window, "innerWidth", width);
      else delete (window as any).innerWidth;
    }
  });

  // ── magics ────────────────────────────────────────────────────────────────

  it("reads $el, $this, and writes $variant onto the callout", async () => {
    const root = await mount(byId("protocol-magics"));
    const title = root.querySelector("[data-part='title']") as HTMLElement;

    expect(title.textContent).toBe("This callout is info");
    expect(root.querySelector("p code")!.textContent).toBe("div[data-ui=callout]");
    button(root, "Warning").click();
    // `$variant` re-runs its readers from the state bridge's MutationObserver.
    await settle(() => title.textContent === "This callout is warning", "the title re-reading $variant");
    expect(root.dataset.variant).toBe("warning");
    expect(title.textContent).toBe("This callout is warning");
    expect(scopeOf(root).pressed).toBe("Warning");
  });

  it("opens the popover through $ui, follows its $state, and hears $dispatch", async () => {
    const root = await mount(byId("popover-ui"));
    const popover = root.querySelector("#engine-popover") as HTMLElement;
    const trigger = popover.querySelector("[data-part='trigger']") as HTMLElement;
    const content = popover.querySelector("[data-part='content']") as HTMLElement;

    expect(trigger.textContent).toBe("Reply to the invite");
    button(root, "Open it from outside").click();
    await settle(() => trigger.textContent === "Close the reply menu", "the trigger re-reading $state");
    expect(popover.dataset.state).toBe("open");
    expect(content.hidden).toBe(false);
    // The controller wrote data-state; the scope's `$state` binding followed.
    expect(trigger.textContent).toBe("Close the reply menu");

    button(content, "Maybe").click();
    await settle(() => trigger.textContent === "Reply to the invite", "the trigger following the close");
    expect(popover.dataset.state).toBe("closed");
    expect(trigger.textContent).toBe("Reply to the invite");
    expect(scopeOf(root).verdict).toBe("The popover answered: maybe.");
  });

  it("registers a store from l-init and shares it between two scopes", async () => {
    const root = await mount(byId("store"));
    const select = root.querySelector("select") as HTMLSelectElement;
    const readings = () => [...root.querySelectorAll("li [data-variant='mono']")].map((r) => r.textContent);

    expect(Faqir.devtools.stores().forecast).toEqual({ unit: "C" });
    expect(readings()).toEqual(["18 °C", "23 °C", "9 °C"]);
    select.value = "F";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(readings()).toEqual(["64 °F", "73 °F", "48 °F"]);
  });

  it("focuses the l-if editor after $nextTick, wires $id, and $watch sees the goal crossed", async () => {
    const root = await mount(byId("draft-goal"));
    button(root, "Write a summary").click();
    await settle(() => root.querySelector("textarea") !== null, "the l-if editor to render");
    const pad = root.querySelector("textarea") as HTMLTextAreaElement;
    const count = root.querySelector("textarea + p") as HTMLElement;

    expect(pad).not.toBeNull();
    expect(document.activeElement).toBe(pad);
    expect(count.id).toMatch(/^faqir-\d+-count$/);
    expect(pad.getAttribute("aria-describedby")).toBe(count.id);

    type(pad, "one two three");
    await tick();
    expect(count.textContent).toBe("3 of 10 words");
    expect(scopeOf(root).reached).toBe("");
    type(pad, "one two three four five six seven eight nine ten");
    await settle(() => /^Goal reached at /.test(scopeOf(root).reached), "$watch to see the goal crossed");
    type(pad, "one two");
    await settle(() => scopeOf(root).reached === "", "$watch to clear the note below the goal");
  });

  // ── server data ───────────────────────────────────────────────────────────

  it("loads the .lazy collection on demand, and .optimistic rolls back a refused delete", async () => {
    const root = await mount(byId("source-optimistic"));
    expect(requests).toEqual([]);
    expect(root.querySelectorAll("li").length).toBe(0);

    button(root, "Load the inbox").click();
    await settle(() => root.querySelectorAll("li").length === MESSAGES.length, "the lazy inbox to load");
    expect(requests).toEqual(["GET ../api/messages"]);
    expect(root.querySelectorAll("li").length).toBe(MESSAGES.length);

    const archive = button(root.querySelector("li")!, "Archive");
    archive.click();
    // Optimistic: the row leaves before the server answers…
    expect(scopeOf(root).inbox.length).toBe(MESSAGES.length - 1);
    await settle(() => scopeOf(root).inboxError !== null, "the refused DELETE to answer");
    // …and comes back, in place, when the static host refuses the DELETE —
    // found by `.key.id`, which is what names the URL it addressed.
    expect(requests[1]).toBe(`DELETE ../api/messages/${MESSAGES[0].id}`);
    expect(scopeOf(root).inbox.map((m: any) => m.id)).toEqual(MESSAGES.map((m: any) => m.id));
    expect(scopeOf(root).inboxError).toBe("405 Method Not Allowed");
    expect((root.querySelector("p[l-show]") as HTMLElement).style.display).not.toBe("none");
  });

  it("polls the collection, stamps each load, and pauses on request", async () => {
    const root = await mount(byId("source-poll"));
    await settle(() => scopeOf(root).feedLoading === false, "the first load to finish");
    expect(requests).toEqual(["GET ../api/messages"]);
    expect(scopeOf(root).feed.length).toBe(MESSAGES.length);
    // The root's l-effect stamped the time once the load finished.
    expect(scopeOf(root).checked).toMatch(/\d/);

    button(root, "Pause polling").click();
    await tick();
    expect(scopeOf(root).polling).toBe(false);
    expect(root.querySelector("[data-ui='badge']")!.textContent).toBe("Paused");
    button(root, "Resume polling").click();
    await tick();
    expect(scopeOf(root).polling).toBe(true);
    expect(root.querySelector("[data-ui='badge']")!.textContent).toBe("Polling every 15s");
  });

  // ── plugins ───────────────────────────────────────────────────────────────

  it("collapses the list, persists `open` across a remount, and counts visits with $persist", async () => {
    const owned = () => Object.keys(localStorage).filter((k) => /^faqir:.*:(open|visits)$/.test(k));
    for (const k of owned()) localStorage.removeItem(k);
    try {
      let root = await mount(byId("plugin-persist-collapse"));
      let list = root.querySelector("[l-collapse]") as HTMLElement;
      expect(list.style.display).toBe("none");
      expect(scopeOf(root).visits).toBe(1);

      button(root, "Show the list").click();
      await tick();
      expect(list.style.display).not.toBe("none");
      expect(button(root, "Hide the list").getAttribute("aria-expanded")).toBe("true");

      // A reload, as far as the scope can tell: the plugin restores `open`.
      root = await mount(byId("plugin-persist-collapse"));
      list = root.querySelector("[l-collapse]") as HTMLElement;
      expect(scopeOf(root).open).toBe(true);
      expect(list.style.display).not.toBe("none");
      expect(scopeOf(root).visits).toBe(2);
    } finally {
      for (const k of owned()) localStorage.removeItem(k);
    }
  });

  it("runs l-intersect on enter, .leave on leave, and .once only the first time", async () => {
    const observers: { cb: (entries: unknown[]) => void; targets: Element[]; off: boolean }[] = [];
    class FakeObserver {
      private record: (typeof observers)[number];
      constructor(cb: (entries: unknown[]) => void) {
        this.record = { cb, targets: [], off: false };
        observers.push(this.record);
      }
      observe(el: Element) { this.record.targets.push(el); }
      unobserve() {}
      disconnect() { this.record.off = true; }
      takeRecords() { return []; }
    }
    const fire = (isIntersecting: boolean) => {
      for (const o of observers) if (!o.off) o.cb(o.targets.map((target) => ({ target, isIntersecting })));
    };
    const previous = G.IntersectionObserver;
    G.IntersectionObserver = FakeObserver;
    try {
      const root = await mount(byId("plugin-intersect"));
      expect(observers.length).toBe(3);
      fire(true);
      await tick();
      const first = scopeOf(root).firstSeen;
      expect(scopeOf(root).inView).toBe(true);
      expect(first).not.toBe("");
      expect(root.querySelector("[data-ui='badge']")!.textContent).toBe("In view");

      fire(false);
      await tick();
      expect(scopeOf(root).inView).toBe(false);
      fire(true);
      await tick();
      expect(scopeOf(root).entries).toBe(2);
      // `.once` disconnected its observer after the first entry.
      expect(observers.filter((o) => o.off).length).toBe(1);
    } finally {
      G.IntersectionObserver = previous;
    }
  });

  it("validates, masks and applies rules on one form", async () => {
    const root = await mount(byId("plugin-form"));
    const form = root as HTMLFormElement;
    const plan = form.querySelector("#engine-plan") as HTMLSelectElement;
    const seats = form.querySelector("#engine-seats") as HTMLInputElement;
    const company = form.querySelector("#engine-company") as HTMLInputElement;
    const handle = form.querySelector("#engine-handle") as HTMLInputElement;
    const phone = form.querySelector("#engine-phone") as HTMLInputElement;
    const group = (el: Element) => el.closest("[data-ui='field-group']") as HTMLElement;
    const error = (el: Element) => group(el).querySelector("[data-part='error']")!.textContent;
    const price = form.querySelector("p[data-weight='semibold']") as HTMLElement;
    const submit = async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await wait(450);
    };

    // l-rules: Company is hidden (and so disabled) until the plan is a team;
    // the price is a compute rule, read back through `$rules`.
    expect(group(company).hidden).toBe(true);
    expect(company.disabled).toBe(true);
    expect(price.textContent).toBe("Price, computed by the rules: 5 a month");
    plan.value = "team";
    plan.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(group(company).hidden).toBe(false);
    expect(company.disabled).toBe(false);
    expect(company.required).toBe(true);
    expect(price.textContent).toBe("Price, computed by the rules: 8 a month");

    // l-mask: formatted on screen, raw digits in the scope.
    type(phone, "5550100199");
    await settle(() => phone.value === "(555) 010-0199", "l-mask to repaint the formatted number");
    expect(scopeOf(root).phone).toBe("5550100199");
    expect(scopeOf(root).phone).toBe("5550100199");

    // l-validate: an empty handle, a missing company and a one-seat team all
    // fail on submit, each with its own message; the hook does not run.
    await submit();
    expect(group(handle).dataset.state).toBe("invalid");
    expect(error(handle)).toBe("Pick a handle.");
    expect(error(company)).toBe("A team needs a company name.");
    expect(group(seats).dataset.state).toBe("invalid");
    expect(error(seats)).toBe("A team plan starts at two seats.");
    expect(scopeOf(root).sent).toBe("");

    // l-validate:available.async: a taken handle fails once the promise answers.
    type(seats, "3");
    type(company, "Faqir Ltd");
    type(handle, "faqir");
    await submit();
    expect(price.textContent).toBe("Price, computed by the rules: 24 a month");
    expect(error(handle)).toBe("That handle is taken. Try another.");
    expect(scopeOf(root).sent).toBe("");

    // Clean: the l-validate expression runs as the on-valid hook.
    type(handle, "ada");
    await submit();
    for (const el of [handle, company, seats, phone]) expect(group(el).dataset.state).not.toBe("invalid");
    expect(scopeOf(root).sent).toBe("Requested a team workspace for @ada.");
  });
});
