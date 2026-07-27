// Contract for the `inbox` pattern (task 0.7-09).
//
// A list-detail split view with no controller at all: the reference page is
// mounted verbatim under faqir-core and everything it does — selecting a
// message, swapping the detail pane, falling back to the empty state, and
// flipping the root state the responsive collapse keys on — comes out of one
// `l-data` scope plus bindings. The second instance on the page binds the same
// markup to a server collection with `l-source` + `l-for`, so these tests drive
// both: authored rows and rendered rows.
//
// The mobile collapse is CSS keyed on each pane's active/inactive state (no
// matchMedia, no resize listener in the pattern — that is the point). The tests
// below therefore mock `window.matchMedia` to stand in for the viewport, read
// the real rules out of inbox.css at the breakpoint the mock reports, and assert
// which pane survives for each selection state.
//
// Task 0.8-09 put this sheet on the canon and inverted it: the single-pane
// layout is now the unconditional BASE and `@media (min-width: 48rem)` adds the
// second pane, so the collapse floor moved from an ad-hoc 640px to the canon md.
// The assertions moved with it — same structure, canon numbers, and the hide/
// reveal claims now resolve through the shared cascade helper so they hold as
// facts about the cascade rather than about which block a line was typed in.

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { validateManifest, type Manifest } from "../../src/manifest";
import { extractComponents, parseDocument } from "../../src/parser/html-parser";
import { DOCUMENT_RULES } from "../../src/audit/rules";
import { BREAKPOINTS, ROOT_FONT_SIZE_PX, TIERS, minWidth } from "../../src/utils/breakpoints";
import { collectRules, resolve, resolveDeepValue } from "../helpers/css-cascade";
import { buildMatrix, discoverComponents, SCHEMES } from "../visual/matrix";
import { buildA11yMatrix, A11Y_THEMES } from "../a11y/a11y-matrix";

const Faqir = require("../../registry/core/faqir-core.js");

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const DIR = join(REGISTRY, "patterns", "inbox");

const HTML = readFileSync(join(DIR, "inbox.html"), "utf8");
const CSS = readFileSync(join(DIR, "inbox.css"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "inbox.manifest.json"), "utf8")) as Manifest;

const manifests = await loadRegistryManifestMap(REGISTRY);

// ── DOM helpers ──────────────────────────────────────────────────────────────

// happy-dom quirk (see wizard.test.ts): an element parsed with BOTH `x` and
// `:x` keeps indexing the stale named attribute after a binding rewrites the
// live one. Read such attributes — and `hidden` — through the item list.
function attrOf(el: Element, name: string): string | null {
  for (const attr of [...el.attributes] as Attr[]) {
    if (attr.name === name) return attr.value;
  }
  return null;
}

function isHidden(el: Element): boolean {
  return [...el.attributes].some((a) => a.name === "hidden");
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

/** The messages the stubbed endpoint serves to the l-source instance. */
const SERVED = [
  {
    id: "srv-1",
    sender: "Dana Ortiz",
    initials: "DO",
    time: "11:05",
    subject: "Contract renewal",
    preview: "Legal signed off this morning.",
    body: "Legal signed off this morning — we can countersign whenever you are ready.",
  },
  {
    id: "srv-2",
    sender: "Sam Weber",
    initials: "SW",
    time: "Tuesday",
    subject: "Warehouse audit",
    preview: "Two pallets are unaccounted for.",
    body: "Two pallets are unaccounted for. I have asked the carrier for the scan log.",
  },
];

let fetched: string[] = [];

/**
 * Mount the reference page under faqir-core with `/api/messages` stubbed, and
 * return both inbox instances: the authored one and the source-bound one.
 */
async function boot(): Promise<{ authored: HTMLElement; sourced: HTMLElement }> {
  fetched = [];
  globalThis.fetch = ((url: string) => {
    fetched.push(String(url));
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(SERVED),
    });
  }) as unknown as typeof fetch;

  // Fresh <body> per boot so each Faqir.start()'s MutationObserver is scoped to
  // its own document lifetime — one core boot per page load.
  const freshBody = document.createElement("body");
  document.documentElement.replaceChild(freshBody, document.body);
  document.body.innerHTML = HTML;
  Faqir.start();
  // Two ticks: one for the initial render, one for the stubbed fetch to land.
  await tick();
  await tick();

  const [authored, sourced] = [...document.querySelectorAll('[data-ui="inbox"]')] as HTMLElement[];
  return { authored, sourced };
}

const itemsOf = (inbox: HTMLElement) =>
  [...inbox.querySelectorAll('[data-part="item"]')] as HTMLElement[];
const detailsOf = (inbox: HTMLElement) =>
  [...inbox.querySelectorAll('[data-part="detail"]')] as HTMLElement[];
const emptyOf = (inbox: HTMLElement) => inbox.querySelector('[data-part="empty"]') as HTMLElement;
const backOf = (inbox: HTMLElement) => inbox.querySelector('[data-part="back"]') as HTMLElement;
const paneOf = (inbox: HTMLElement, which: "list" | "detail") =>
  inbox.querySelector(`[data-part="${which}-pane"]`) as HTMLElement;
/** The pane the collapsed layout would keep on screen. */
const activePane = (inbox: HTMLElement) =>
  (["list", "detail"] as const).filter((w) => attrOf(paneOf(inbox, w), "data-state") === "active");
const visibleDetail = (inbox: HTMLElement) => detailsOf(inbox).filter((d) => !isHidden(d));

beforeEach(async () => {
  await tick();
});

afterAll(() => {
  document.documentElement.replaceChild(document.createElement("body"), document.body);
});

// ── Static contract ──────────────────────────────────────────────────────────

describe("inbox — zero custom JavaScript", () => {
  it("ships no controller and no script", () => {
    expect(readdirSync(DIR).sort()).toEqual(
      ["inbox.css", "inbox.html", "inbox.manifest.json"].sort(),
    );
    expect(MANIFEST.files.js).toBeUndefined();
    expect(MANIFEST.kind).toBe("pattern");

    expect(HTML).not.toContain("<script");
    expect(HTML).not.toMatch(/\son[a-z]+\s*=/); // no inline handlers
  });

  it("uses only the declarative directives it documents", () => {
    const directives = new Set(
      [...HTML.matchAll(/\s(l-[a-z]+(?::[a-z]+)?|[:@][a-z-]+)=/g)].map((m) =>
        m[1].startsWith("l-source") ? "l-source:<name>" : m[1],
      ),
    );
    expect([...directives].sort()).toEqual(
      ["l-data", "l-for", "l-key", "l-source:<name>", "l-text", ":data-state", ":aria-current", ":hidden", "@click"].sort(),
    );
  });
});

describe("inbox — reference page is audit-clean", () => {
  it("has zero component findings", () => {
    expect(
      auditHtmlSource({ source: HTML, file: "registry/patterns/inbox/inbox.html", manifests }),
    ).toEqual([]);
  });

  it("has zero document-rule findings", () => {
    const doc = parseDocument(HTML, "inbox.html");
    expect(DOCUMENT_RULES.flatMap((rule) => rule.check(doc))).toEqual([]);
  });

  it("manifest validates", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
  });
});

describe("inbox — manifest documents composition, slots and data shape", () => {
  it("declares every slot the reference page uses, and uses every slot it declares", () => {
    const declared = new Set(Object.keys(MANIFEST.slots));
    const used = new Set(
      extractComponents(HTML, "inbox.html")
        .filter((c) => c.name === "inbox")
        .flatMap((c) => Object.keys(c.parts)),
    );
    expect([...used].filter((p) => !declared.has(p))).toEqual([]);
    expect([...declared].filter((p) => !used.has(p))).toEqual([]);
  });

  it("lists the components it actually nests, and they all exist in the registry", () => {
    const nested = new Set(
      extractComponents(HTML, "inbox.html")
        .map((c) => c.name)
        .filter((n) => n !== "inbox"),
    );
    for (const declared of MANIFEST.composition.contains) {
      const found = ["primitives", "recipes", "patterns"].some((k) =>
        existsSync(join(REGISTRY, k, declared)),
      );
      expect(found, `${declared} is a registry component`).toBe(true);
      expect(nested.has(declared), `reference page nests ${declared}`).toBe(true);
    }
    for (const actual of nested) {
      expect(MANIFEST.composition.contains, `manifest documents nested ${actual}`).toContain(actual);
    }
  });

  it("spells out the slot expectations an agent needs", () => {
    for (const [name, slot] of Object.entries(MANIFEST.slots)) {
      expect(slot.description?.length ?? 0, `slot ${name} has a description`).toBeGreaterThan(20);
      expect(slot.selector).toBe(`[data-part='${name}']`);
    }
    const notes = ((MANIFEST.composition as unknown as { notes?: string[] }).notes ?? []).join(" ");
    expect(notes).toContain("data-part");
  });

  it("documents the data shape an agent binds — the scope, a message, and the source", () => {
    const shape = (MANIFEST as unknown as { data_shape?: Record<string, any> }).data_shape;
    expect(shape, "manifest declares data_shape").toBeDefined();

    // The single piece of state the pattern owns.
    expect(Object.keys(shape!.scope)).toEqual(["selected"]);
    expect(shape!.scope.selected).toContain("null");

    // Every field the reference page binds must be described.
    for (const field of ["id", "sender", "initials", "time", "subject", "preview", "body"]) {
      expect(shape!.message.item[field], `data_shape.message.${field}`).toBeTruthy();
    }

    // And the swap to a server collection, with the names l-source injects.
    expect(shape!.source.directive).toContain("l-source:messages");
    expect(shape!.source.injects).toContain("messagesLoading");
    expect(shape!.source.injects).toContain("messagesError");
  });

  it("declares the states the markup actually uses", () => {
    expect(Object.keys(MANIFEST.states).sort()).toEqual(["active", "inactive", "selected"]);
    expect((MANIFEST.states as any).selected.applied_to).toBe("item");
    expect((MANIFEST.states as any).active.applied_to).toBe("list-pane, detail-pane");
  });

  it("explains why the reactive state sits on the panes, not the root", () => {
    // faqir-core does not apply bind directives declared on an l-data scope
    // root (FAQIR-PLAN follow-up 0.6-15) — an agent that moves :data-state up
    // to [data-ui="inbox"] would get markup that renders once and never
    // updates, so the manifest has to say so.
    const notes = ((MANIFEST.composition as unknown as { notes?: string[] }).notes ?? []).join(" ");
    expect(notes).toContain("0.6-15");
    expect(HTML).not.toMatch(/data-ui="inbox"[^>]*:data-state/);
  });
});

describe("inbox — swept by the visual and a11y matrices", () => {
  it("is discovered as a pattern reference page", () => {
    const found = discoverComponents().find((c) => c.name === "inbox");
    expect(found, "inbox discovered").toBeDefined();
    expect(found!.kind).toBe("pattern");
    expect(found!.htmlRel).toBe("registry/patterns/inbox/inbox.html");
  });

  it("is captured in both schemes across every theme", () => {
    const cases = buildMatrix().filter((c) => c.component.name === "inbox");
    expect(new Set(cases.map((c) => c.theme)).size).toBeGreaterThanOrEqual(2);
    expect([...new Set(cases.map((c) => c.scheme))].sort()).toEqual([...SCHEMES].sort());
  });

  it("is scanned by axe in both schemes on the default and contrast themes", () => {
    const cases = buildA11yMatrix().filter((c) => c.component.name === "inbox");
    expect(cases.length).toBe(A11Y_THEMES.length * SCHEMES.length);
    expect([...new Set(cases.map((c) => c.theme))].sort()).toEqual([...A11Y_THEMES].sort());
    expect([...new Set(cases.map((c) => c.scheme))].sort()).toEqual([...SCHEMES].sort());
  });

  it("authors a pre-boot guard on everything a binding hides", () => {
    // Without the static `hidden`, every message in the thread would flash
    // before faqir-core boots — and the a11y/visual matrices, which load no JS,
    // would capture the whole pile.
    const inboxes = extractComponents(HTML, "inbox.html").filter((c) => c.name === "inbox");
    const authored = inboxes[0];
    const shown = authored.parts["detail"].filter((d) => !("hidden" in d.attrs));
    expect(shown.length, "exactly one detail is visible before boot").toBe(1);
    expect(shown[0].attrs["aria-labelledby"]).toBe("inbox-m-1-subject");
    expect("hidden" in authored.parts["empty"][0].attrs).toBe(true);

    // The source-bound instance starts with nothing selected, so its empty
    // state is the one thing that must NOT be guarded.
    const sourced = inboxes[1];
    expect("hidden" in sourced.parts["empty"][0].attrs).toBe(false);
  });
});

// ── Behaviour under faqir-core ───────────────────────────────────────────────

describe("inbox — selection swaps the detail pane", () => {
  it("opens the message named by l-data and hides the rest", async () => {
    const { authored } = await boot();
    expect(itemsOf(authored).length).toBe(3);
    expect(detailsOf(authored).length).toBe(3);

    const open = visibleDetail(authored);
    expect(open.length).toBe(1);
    expect(open[0].getAttribute("aria-labelledby")).toBe("inbox-m-1-subject");
    expect(isHidden(emptyOf(authored))).toBe(true);
  });

  it("marks the open row with data-state AND aria-current", async () => {
    const { authored } = await boot();
    const [first, second] = itemsOf(authored);
    expect(attrOf(first, "data-state")).toBe("selected");
    expect(attrOf(first, "aria-current")).toBe("true");
    expect(attrOf(second, "data-state")).toBeNull();
    expect(attrOf(second, "aria-current")).toBeNull();
  });

  it("swaps the pane when another row is clicked", async () => {
    const { authored } = await boot();
    const [first, second] = itemsOf(authored);

    click(second);
    await tick();

    const open = visibleDetail(authored);
    expect(open.length).toBe(1);
    expect(open[0].getAttribute("aria-labelledby")).toBe("inbox-m-2-subject");
    expect(attrOf(second, "data-state")).toBe("selected");
    expect(attrOf(second, "aria-current")).toBe("true");
    expect(attrOf(first, "data-state")).toBeNull();
    expect(attrOf(first, "aria-current")).toBeNull();
    expect(isHidden(emptyOf(authored))).toBe(true);
  });

  it("keeps every message row a native button", async () => {
    const { authored, sourced } = await boot();
    for (const item of [...itemsOf(authored), ...itemsOf(sourced)]) {
      expect(item.tagName.toLowerCase()).toBe("button");
      expect(item.getAttribute("type")).toBe("button");
    }
  });
});

describe("inbox — empty state and back navigation", () => {
  it("renders the empty state when nothing is selected", async () => {
    const { authored } = await boot();

    click(backOf(authored)); // back clears the selection
    await tick();

    expect(visibleDetail(authored).length).toBe(0);
    const empty = emptyOf(authored);
    expect(isHidden(empty)).toBe(false);
    expect(empty.querySelector('[data-ui="empty-state"]')).not.toBeNull();
    expect(empty.textContent).toContain("No message selected");
  });

  it("starts in the empty state when l-data selects nothing", async () => {
    const { sourced } = await boot();
    expect(isHidden(emptyOf(sourced))).toBe(false);
    expect(visibleDetail(sourced).length).toBe(0);
  });

  it("mirrors the selection into the panes' active/inactive state", async () => {
    const { authored, sourced } = await boot();
    expect(activePane(authored)).toEqual(["detail"]); // a message is open
    expect(activePane(sourced)).toEqual(["list"]); // nothing selected yet

    click(backOf(authored));
    await tick();
    expect(activePane(authored)).toEqual(["list"]);

    click(itemsOf(authored)[2]);
    await tick();
    expect(activePane(authored)).toEqual(["detail"]);
  });
});

describe("inbox — the source-bound instance", () => {
  it("loads its messages from the l-source endpoint", async () => {
    const { sourced } = await boot();
    expect(fetched).toContain("/api/messages");

    const items = itemsOf(sourced);
    expect(items.length).toBe(SERVED.length);
    expect(items[0].querySelector('[data-part="item-sender"]')!.textContent).toBe("Dana Ortiz");
    expect(items[0].querySelector('[data-part="item-subject"]')!.textContent).toBe("Contract renewal");
    expect(items[1].querySelector('[data-part="item-time"]')!.textContent).toBe("Tuesday");
    expect(sourced.querySelector('[data-part="list-header"] [data-ui="badge"]')!.textContent)
      .toBe("2 messages");
  });

  it("renders one detail per row and opens the one that is clicked", async () => {
    const { sourced } = await boot();
    expect(detailsOf(sourced).length).toBe(SERVED.length);

    click(itemsOf(sourced)[1]);
    await tick();

    const open = visibleDetail(sourced);
    expect(open.length).toBe(1);
    expect(open[0].querySelector('[data-part="detail-subject"]')!.textContent).toBe("Warehouse audit");
    expect(open[0].querySelector('[data-part="detail-body"]')!.textContent).toContain("carrier");
    expect(isHidden(emptyOf(sourced))).toBe(true);
    expect(activePane(sourced)).toEqual(["detail"]);
  });

  it("keeps the loading and error lines hidden on a clean load", async () => {
    const { sourced } = await boot();
    expect(isHidden(sourced.querySelector('[data-part="status"]')!)).toBe(true);
    expect(isHidden(sourced.querySelector('[data-part="error"]')!)).toBe(true);
  });

  it("shows the error line when the endpoint fails", async () => {
    globalThis.fetch = (() =>
      Promise.resolve({ ok: false, status: 503, statusText: "Service Unavailable" })) as unknown as typeof fetch;

    const freshBody = document.createElement("body");
    document.documentElement.replaceChild(freshBody, document.body);
    document.body.innerHTML = HTML;
    Faqir.start();
    await tick();
    await tick();

    const sourced = [...document.querySelectorAll('[data-ui="inbox"]')][1] as HTMLElement;
    const error = sourced.querySelector('[data-part="error"]')!;
    expect(isHidden(error)).toBe(false);
    expect(error.textContent).toContain("503");
    expect(error.getAttribute("role")).toBe("alert");
    expect(itemsOf(sourced).length).toBe(0);
  });
});

// ── Responsive collapse ──────────────────────────────────────────────────────

/** Declarations of one selector inside a `@media (<query>)` block. */
function mediaRules(query: string): Map<string, string> {
  const at = CSS.indexOf(`@media (${query})`);
  expect(at, `no @media (${query}) block`).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", at);
  let depth = 0;
  let body = "";
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}") {
      depth--;
      if (depth === 0) {
        body = CSS.slice(open + 1, i);
        break;
      }
    }
  }
  const rules = new Map<string, string>();
  body = body.replace(/\/\*[^]*?\*\//g, "");
  for (const m of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    rules.set(m[1].trim().replace(/\s+/g, " "), m[2].trim());
  }
  return rules;
}

/**
 * A viewport of `width` px, seen through window.matchMedia. Understands `rem` as
 * well as `px`: the canon is authored in rem (0.8-01), so the queries this sheet
 * actually ships say `48rem`, not `768px`.
 */
function mockViewport(width: number): void {
  const bound = (query: string, kind: "min" | "max"): number | null => {
    const m = new RegExp(`${kind}-width:\\s*([\\d.]+)(rem|px)`).exec(query);
    if (!m) return null;
    return m[2] === "rem" ? Number(m[1]) * ROOT_FONT_SIZE_PX : Number(m[1]);
  };
  window.matchMedia = ((query: string) => {
    const max = bound(query, "max");
    const min = bound(query, "min");
    const matches =
      (max === null || width <= max) && (min === null || width >= min) && (max !== null || min !== null);
    return { matches, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

describe("inbox — collapses to a single pane on a phone", () => {
  // Canon floors (task 0.8-01) in the mobile-first `min-width` form task 0.8-09
  // put this sheet in: the second pane arrives at md, the wide list at lg.
  const MD = minWidth("md");
  const LG = minWidth("lg");
  const RULES = collectRules(CSS);

  /** `display` for one pane in a given selection state, at a viewport width. */
  const paneDisplay = (part: string, state: string | null, widthPx: number) =>
    resolveDeepValue(RULES, "inbox", "display", {
      subject: state ? { "data-part": part, "data-state": state } : { "data-part": part },
      widthPx,
    });

  it("the collapse floor is the canon md tier", () => {
    mockViewport(390);
    expect(window.matchMedia(`(${MD})`).matches).toBe(false);
    mockViewport(BREAKPOINTS.md.px);
    expect(window.matchMedia(`(${MD})`).matches).toBe(true);
    mockViewport(1280);
    expect(window.matchMedia(`(${MD})`).matches).toBe(true);
    // 0.8-09 moved this floor: 640px used to be the two-pane layout and is now
    // the single-pane one. There is no tier between sm and md to land on.
    mockViewport(BREAKPOINTS.sm.px);
    expect(window.matchMedia(`(${MD})`).matches).toBe(false);
  });

  it("hides exactly one pane per selection state below the floor", async () => {
    mockViewport(390);
    expect(window.matchMedia(`(${MD})`).matches, "the mocked viewport is a phone").toBe(false);

    // Only the INACTIVE pane steps aside, and only below md.
    for (const part of ["list-pane", "detail-pane"]) {
      expect(paneDisplay(part, "inactive", 390), `${part} inactive @390`).toBe("none");
      expect(paneDisplay(part, "inactive", BREAKPOINTS.md.px - 1)).toBe("none");
      expect(paneDisplay(part, "inactive", BREAKPOINTS.md.px)).toBe("flex");
      expect(paneDisplay(part, "inactive", 1280)).toBe("flex");
      // Never a pane unconditionally: that would blank the collapsed layout.
      expect(paneDisplay(part, null, 390), `${part} active @390`).toBe("flex");
      expect(paneDisplay(part, "active", 390)).toBe("flex");
    }
    // And the phone gets one column, from the base rule rather than an override.
    expect(resolve(RULES, "inbox", {}, "grid-template-columns", 390)).toBe("1fr");
    const base = RULES.find(
      (r) => r.media === null && r.decls["grid-template-columns"] !== undefined,
    );
    expect(base?.decls["grid-template-columns"]).toBe("1fr");

    // The live page supplies the state half of those selectors: exactly one
    // pane is active at any moment, so exactly one survives the collapse.
    const { authored, sourced } = await boot();
    expect(activePane(authored)).toEqual(["detail"]); // → message on screen
    expect(activePane(sourced)).toEqual(["list"]); // → list on screen

    click(backOf(authored));
    await tick();
    expect(activePane(authored)).toEqual(["list"]); // back returns to the list
    expect(attrOf(paneOf(authored, "detail"), "data-state")).toBe("inactive");
  });

  it("reveals the back button only in the collapsed layout", () => {
    const back = (widthPx: number) =>
      resolveDeepValue(RULES, "inbox", "display", { subject: { "data-part": "back" }, widthPx });
    mockViewport(390);
    expect(back(390)).toBe("inline-flex");
    mockViewport(1280);
    expect(back(BREAKPOINTS.md.px)).toBe("none");
    expect(back(1280)).toBe("none");
  });

  it("widens the list column at lg, having gained it at md", () => {
    const columns = (widthPx: number) =>
      resolve(RULES, "inbox", {}, "grid-template-columns", widthPx);
    expect(columns(390)).toBe("1fr");
    expect(columns(BREAKPOINTS.md.px)).toBe("17rem 1fr");
    expect(columns(BREAKPOINTS.lg.px - 1)).toBe("17rem 1fr");
    expect(columns(BREAKPOINTS.lg.px)).toBe("22rem 1fr");
  });

  it("gives the phone an intrinsic height and the desk a fixed one", () => {
    // A phone scrolls the page; a 32rem box would strand the message body.
    expect(resolve(RULES, "inbox", {}, "block-size", 390)).toBe("auto");
    expect(resolve(RULES, "inbox", {}, "min-block-size", 390)).toBe("24rem");
    expect(resolve(RULES, "inbox", {}, "block-size", BREAKPOINTS.md.px)).toBe("32rem");
  });

  it("stays on the canon, in mobile-first form", () => {
    const canon = new Set(TIERS.map((t) => minWidth(t)));
    const queries = [...CSS.replace(/\/\*[^]*?\*\//g, "").matchAll(/@media \(([^)]+)\)/g)].map(
      (m) => m[1],
    );
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      if (!/width/.test(query)) {
        expect(query, `inbox: ${query}`).toBe("prefers-reduced-motion: reduce");
        continue;
      }
      expect([...canon], `inbox: ${query}`).toContain(query);
    }
    expect(queries).toContain(MD);
    expect(queries).toContain(LG);
  });

  it("keeps its own [data-part] rules out of the components it nests", () => {
    // The nested tabs own a [data-part="list"] too (its tablist). An unscoped
    // `[data-ui="inbox"] [data-part="list"]` rule turned that row into a
    // stacked grid — caught in Chrome. Every list rule is scoped to the pane.
    for (const m of CSS.matchAll(/\[data-ui="inbox"\]([^{]*)\{/g)) {
      const selector = m[1];
      if (!selector.includes('[data-part="list"]')) continue;
      expect(selector, "list rules are scoped to the list pane").toContain('[data-part="list-pane"]');
    }
  });

  it("uses logical properties throughout", () => {
    expect(CSS).not.toMatch(/(^|[\s;{])(margin|padding|border)-(left|right)\s*:/);
    expect(CSS).not.toMatch(/text-align:\s*(left|right)/);
    expect(CSS).toContain("border-inline-end");
    expect(CSS).toContain("text-align: start");
    expect(CSS).toContain("min-inline-size");
  });
});
