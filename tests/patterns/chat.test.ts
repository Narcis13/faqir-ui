// Contract for the `chat` pattern.
//
// A messaging app with no controller of its own: the reference page is mounted
// under faqir-core (production and strict-CSP builds — see helpers/engine-build)
// into a disposable container, and everything it does comes out of one l-data
// scope plus the list and composer controllers it composes:
//   · the list's faqir:select opens a conversation (and clears its unread count),
//     the back button closes it, and each option's aria-selected follows;
//   · the composer's faqir:send appends an outgoing chat-message to the open
//     conversation through a keyed l-for and updates the list's preview line;
//   · search and filters hide options;
//   · each pane mirrors the selection into data-state, which the one-pane
//     collapse below the md floor keys on.

import { describe, it, expect, afterEach } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEngine } from "../helpers/engine-build";
import { validateManifest, type Manifest } from "../../src/manifest";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { extractComponents, parseDocument } from "../../src/parser/html-parser";
import { DOCUMENT_RULES } from "../../src/audit/rules";

const Faqir = loadEngine();

const ROOT = join(import.meta.dir, "../..");
const DIR = join(ROOT, "registry", "patterns", "chat");
const HTML = readFileSync(join(DIR, "chat.html"), "utf8");
const CSS = readFileSync(join(DIR, "chat.css"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "chat.manifest.json"), "utf8")) as Manifest;

const tick = () => new Promise((r) => setTimeout(r, 0));

async function settle(check: () => boolean, turns = 20) {
  for (let i = 0; i < turns && !check(); i++) await tick();
}

// happy-dom keeps indexing a stale named attribute after a binding rewrites
// one that was also authored statically (see inbox.test.ts): read through the
// attribute list.
function attrOf(el: Element, name: string): string | null {
  for (const attr of [...el.attributes] as Attr[]) if (attr.name === name) return attr.value;
  return null;
}
const isHidden = (el: Element) => [...el.attributes].some((a) => a.name === "hidden");

let box: HTMLElement | null = null;

afterEach(() => {
  if (!box) return;
  Faqir.destroy?.(box);
  box.remove();
  box = null;
});

async function boot() {
  box = document.createElement("div");
  box.innerHTML = HTML;
  document.body.append(box);
  const chat = box.querySelector("[data-ui='chat']") as HTMLElement;
  Faqir.initTree(chat, null);
  await settle(() => chat.querySelector("[data-ui='list']")?.getAttribute("data-state") === "idle");

  const option = (id: string) => chat.querySelector(`[data-part='item'][data-value='${id}']`) as HTMLElement;
  const conversations = () => [...chat.querySelectorAll("[data-part='conversation']")] as HTMLElement[];
  const conversation = (id: string) =>
    conversations().find((c) => c.querySelector("[data-part='peer-name']")!.id === `chat-${id}-title`)!;
  const visible = () =>
    conversations().filter((c) => !isHidden(c)).map((c) => c.querySelector("[data-part='peer-name']")!.textContent);
  const pane = (which: "sidebar" | "main") => chat.querySelector(`[data-part='${which}']`) as HTMLElement;
  const composer = chat.querySelector("[data-ui='composer']") as HTMLElement;
  const input = composer.querySelector("[data-part='input']") as HTMLTextAreaElement;
  const outgoing = (id: string) =>
    [...conversation(id).querySelectorAll("[data-ui='chat-message'][data-variant='outgoing']")] as HTMLElement[];

  async function type(text: string) {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const before = chat.querySelectorAll("[data-ui='chat-message'][data-variant='outgoing']").length;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await settle(() => chat.querySelectorAll("[data-ui='chat-message'][data-variant='outgoing']").length > before);
  }

  return { chat, option, conversation, visible, pane, composer, input, outgoing, type };
}

describe("chat — static contract", () => {
  it("ships no controller and no script", () => {
    expect(readdirSync(DIR).sort()).toEqual(["chat.css", "chat.html", "chat.manifest.json"]);
    expect(MANIFEST.files.js).toBeUndefined();
    expect(HTML).not.toContain("<script");
    expect(HTML).not.toMatch(/\son[a-z]+\s*=/);
  });

  it("manifest validates", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
  });

  it("reference page is audit-clean, component and document rules alike", async () => {
    const manifests = await loadRegistryManifestMap(join(ROOT, "registry"));
    expect(auditHtmlSource({ source: HTML, file: "registry/patterns/chat/chat.html", manifests })).toEqual([]);
    const doc = parseDocument(HTML, "chat.html");
    expect(DOCUMENT_RULES.flatMap((rule) => rule.check(doc))).toEqual([]);
  });

  it("declares every slot the page uses and uses every slot it declares", () => {
    const declared = new Set(Object.keys(MANIFEST.slots));
    const used = new Set(
      extractComponents(HTML, "chat.html")
        .filter((c) => c.name === "chat")
        .flatMap((c) => Object.keys(c.parts)),
    );
    expect([...used].filter((p) => !declared.has(p))).toEqual([]);
    expect([...declared].filter((p) => !used.has(p))).toEqual([]);
  });

  it("lists exactly the components it nests", () => {
    const nested = new Set(
      extractComponents(HTML, "chat.html").map((c) => c.name).filter((n) => n !== "chat" && n !== "visually-hidden"),
    );
    expect([...nested].sort()).toEqual([...MANIFEST.composition.contains].sort());
  });

  it("collapses to one pane below md and shows both from md up", () => {
    const [base, md] = CSS.split("@media (min-width: 48rem)");
    expect(base).toMatch(/\[data-part="sidebar"\]\[data-state="inactive"\],\s*\[data-ui="chat"\] > \[data-part="main"\]\[data-state="inactive"\] \{\s*display: none;/);
    expect(md).toMatch(/\[data-part="main"\]\[data-state="inactive"\] \{\s*display: flex;/);
    expect(md).toMatch(/\[data-part="back"\] \{\s*display: none;/);
  });
});

describe("chat — selecting a conversation", () => {
  it("opens on the authored conversation", async () => {
    const { option, visible, pane, composer } = await boot();
    expect(visible()).toEqual(["Lisbon trip"]);
    expect(attrOf(option("lisbon"), "aria-selected")).toBe("true");
    expect(attrOf(option("maya"), "aria-selected")).toBe("false");
    expect(attrOf(pane("sidebar"), "data-state")).toBe("inactive");
    expect(attrOf(pane("main"), "data-state")).toBe("active");
    expect(isHidden(composer)).toBe(false);
  });

  it("clicking an option shows its thread, selects it and clears its unread count", async () => {
    const { chat, option, visible, input } = await boot();
    const count = option("maya").querySelector("[data-part='count']")!;
    expect(isHidden(count)).toBe(false);
    option("maya").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await settle(() => visible()[0] === "Maya Chen");
    expect(visible()).toEqual(["Maya Chen"]);
    expect(attrOf(option("maya"), "aria-selected")).toBe("true");
    expect(attrOf(option("lisbon"), "aria-selected")).toBe("false");
    expect(isHidden(count)).toBe(true);
    expect(attrOf(input, "aria-label")).toBe("Message Maya Chen");
    expect(chat.querySelector("[data-ui='list']")!.getAttribute("data-state")).toBe("idle");
  });

  it("the keyboard opens one too: arrows move, Enter selects", async () => {
    const { option, visible } = await boot();
    option("lisbon").focus();
    option("lisbon").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(option("priya"));
    option("priya").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await settle(() => visible()[0] === "Priya Shah");
    expect(visible()).toEqual(["Priya Shah"]);
  });

  it("back closes the conversation: list pane active, nothing selected, composer hidden", async () => {
    const { chat, conversation, option, pane, composer, visible } = await boot();
    const back = conversation("lisbon").querySelector("[data-part='back']") as HTMLElement;
    back.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(() => attrOf(pane("sidebar"), "data-state") === "active");
    expect(attrOf(pane("sidebar"), "data-state")).toBe("active");
    expect(attrOf(pane("main"), "data-state")).toBe("inactive");
    expect(visible()).toEqual([]);
    expect(isHidden(chat.querySelector("[data-part='empty']")!)).toBe(false);
    expect(isHidden(composer)).toBe(true);
    expect(attrOf(option("lisbon"), "aria-selected")).toBe("false");
  });
});

describe("chat — sending", () => {
  it("Enter in the composer appends an outgoing bubble and updates the preview", async () => {
    const { option, outgoing, type, input } = await boot();
    const before = outgoing("lisbon").length;
    await type("On my way ✈️");
    const mine = outgoing("lisbon");
    expect(mine.length).toBe(before + 1);
    const last = mine[mine.length - 1];
    expect(last.querySelector("[data-part='text']")!.textContent).toBe("On my way ✈️");
    expect(last.hasAttribute("data-continued")).toBe(false);
    expect(last.querySelector("[data-part='time']") ?? last.querySelector("time")).not.toBeNull();
    expect(last.querySelector("[data-part='status']")!.getAttribute("aria-label")).toBe("Sent");
    expect(option("lisbon").querySelector("[data-part='subtitle']")!.textContent).toBe("You: On my way ✈️");
    expect(input.value).toBe("");

    await type("See you at arrivals");
    const again = outgoing("lisbon");
    expect(again.length).toBe(before + 2);
    expect(again[again.length - 1].hasAttribute("data-continued")).toBe(true);
  });

  it("sends into whichever conversation is open, before its typing indicator", async () => {
    const { option, conversation, outgoing, type } = await boot();
    option("maya").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await tick();
    const before = outgoing("maya").length;
    await type("8 works!");
    expect(outgoing("maya").length).toBe(before + 1);
    const entries = [...conversation("maya").querySelectorAll("[data-ui='chat-message']")];
    expect(entries[entries.length - 1].getAttribute("data-state")).toBe("typing");
    expect(entries[entries.length - 2].querySelector("[data-part='text']")!.textContent).toBe("8 works!");
  });

  it("files are sent as file cards", async () => {
    const { composer, outgoing } = await boot();
    const api = (composer as any)._faqirComposer;
    api.addFiles([new File([new Uint8Array(3 * 1024)], "tickets.pdf")]);
    const before = outgoing("lisbon").length;
    api.send();
    await settle(() => outgoing("lisbon").length > before);
    const mine = outgoing("lisbon");
    const card = mine[mine.length - 1].querySelector("[data-part='file']")!;
    expect(card.querySelector("[data-part='name']")!.textContent).toBe("tickets.pdf");
    expect(card.querySelector("[data-part='info']")!.textContent).toBe("3 KB");
    expect(mine[mine.length - 1].querySelector("[data-part='text']")).toBeNull();
  });
});

describe("chat — search and filters", () => {
  const shown = (chat: HTMLElement) =>
    ([...chat.querySelectorAll("[data-part='item']")] as HTMLElement[]).filter((o) => !isHidden(o)).map((o) => o.dataset.value);

  it("search hides the conversations whose name does not match", async () => {
    const { chat } = await boot();
    const search = chat.querySelector("[data-part='search'] input") as HTMLInputElement;
    search.value = "ma";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(() => shown(chat).length === 1);
    expect(shown(chat)).toEqual(["maya"]);
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(() => shown(chat).length === 5);
    expect(shown(chat)).toEqual(["design", "maya", "lisbon", "priya", "sam"]);
  });

  it("Unread and Groups filter the list and press their toggle", async () => {
    const { chat } = await boot();
    const filter = (label: string) =>
      ([...chat.querySelectorAll("[data-part='filter']")] as HTMLElement[]).find((b) => b.textContent === label)!;
    filter("Unread").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(() => shown(chat).length === 2);
    expect(shown(chat)).toEqual(["design", "maya"]);
    expect(attrOf(filter("Unread"), "aria-pressed")).toBe("true");
    expect(attrOf(filter("All"), "aria-pressed")).toBe("false");
    filter("Groups").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(() => shown(chat).length === 2 && shown(chat)[1] === "lisbon");
    expect(shown(chat)).toEqual(["design", "lisbon"]);
  });
});
