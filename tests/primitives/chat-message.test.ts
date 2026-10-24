// Contracts for the two chat primitives: `chat-message` (one bubble) and
// `chat-thread` (the log they live in). Both are pure CSS, so these tests hold
// the markup contract of their reference pages and the stylesheet rules the
// behaviour rests on: grouping by `data-continued`, the tail only on the first
// bubble of a run, screen-reader text that is never said twice, the typing dots
// freezing under reduced motion, and the column-reverse log that pins the
// newest message.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { extractComponents, parseDocument } from "../../src/parser/html-parser";
import { DOCUMENT_RULES } from "../../src/audit/rules";

const ROOT = join(import.meta.dir, "../..");
const read = (name: string, file: string) => readFileSync(join(ROOT, "registry", "primitives", name, file), "utf8");

const MESSAGE = {
  html: read("chat-message", "chat-message.html"),
  css: read("chat-message", "chat-message.css"),
  manifest: JSON.parse(read("chat-message", "chat-message.manifest.json")) as Manifest,
};
const THREAD = {
  html: read("chat-thread", "chat-thread.html"),
  css: read("chat-thread", "chat-thread.css"),
  manifest: JSON.parse(read("chat-thread", "chat-thread.manifest.json")) as Manifest,
};

const manifests = await loadRegistryManifestMap(join(ROOT, "registry"));

function fragment(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

/** Normalised selector → declarations, for the rules a test needs to read. */
function rule(css: string, selector: string): string {
  const flat = css.replace(/\/\*[^]*?\*\//g, "").replace(/\s+/g, " ");
  const at = flat.indexOf(`${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThan(-1);
  return flat.slice(at + selector.length + 2, flat.indexOf("}", at)).trim();
}

describe("chat-message / chat-thread — manifests and references", () => {
  for (const [name, c] of [["chat-message", MESSAGE], ["chat-thread", THREAD]] as const) {
    it(`${name}: manifest validates`, () => {
      expect(validateManifest(c.manifest)).toEqual([]);
    });

    it(`${name}: reference page is audit-clean`, () => {
      expect(auditHtmlSource({ source: c.html, file: `${name}.html`, manifests })).toEqual([]);
      expect(DOCUMENT_RULES.flatMap((r) => r.check(parseDocument(c.html, `${name}.html`)))).toEqual([]);
    });
  }

  it("every chat-message part used across both pages is a declared slot", () => {
    const declared = new Set(Object.keys(MESSAGE.manifest.slots));
    const used = new Set(
      [MESSAGE.html, THREAD.html].flatMap((html) =>
        extractComponents(html, "x.html").filter((c) => c.name === "chat-message").flatMap((c) => Object.keys(c.parts)),
      ),
    );
    expect([...used].filter((p) => !declared.has(p))).toEqual([]);
    expect([...declared].filter((p) => !used.has(p))).toEqual([]);
  });

  it("every chat-thread part used is declared, and vice versa", () => {
    const declared = new Set(Object.keys(THREAD.manifest.slots));
    const used = new Set(
      extractComponents(THREAD.html, "x.html").filter((c) => c.name === "chat-thread").flatMap((c) => Object.keys(c.parts)),
    );
    expect([...used].sort()).toEqual([...declared].sort());
  });
});

describe("chat-message — markup contract", () => {
  const messages = () =>
    [MESSAGE.html, THREAD.html].flatMap((html) => [...fragment(html).querySelectorAll("[data-ui='chat-message']")]);

  it("every message names its author once: a visible sender or a hidden label, never both", () => {
    for (const msg of messages()) {
      const bubble = msg.querySelector(":scope > [data-part='bubble']")!;
      const sender = bubble.querySelectorAll(":scope > [data-part='sender']").length;
      const label = bubble.querySelectorAll(":scope > [data-part='label']").length;
      expect(sender + label, msg.outerHTML.slice(0, 120)).toBe(1);
    }
  });

  it("delivery ticks are labelled images and the time stays readable", () => {
    for (const status of messages().flatMap((m) => [...m.querySelectorAll("[data-part='status']")])) {
      expect(status.getAttribute("role")).toBe("img");
      expect(status.getAttribute("aria-label")).toMatch(/^(Sent|Delivered|Read|Sending|Not sent)$/);
      expect(MESSAGE.manifest.props!.status.values).toContain(status.getAttribute("data-status")!);
    }
    for (const meta of messages().flatMap((m) => [...m.querySelectorAll("[data-part='meta']")])) {
      expect(meta.closest("[aria-hidden='true']")).toBeNull();
      expect(meta.querySelector("time")).not.toBeNull();
    }
  });

  it("avatars are decorative and reactions are pressed toggle buttons with a spoken label", () => {
    for (const avatar of messages().flatMap((m) => [...m.querySelectorAll(":scope > [data-part='avatar']")])) {
      expect(avatar.getAttribute("aria-hidden")).toBe("true");
    }
    const reactions = messages().flatMap((m) => [...m.querySelectorAll("[data-part='reaction']")]);
    expect(reactions.length).toBeGreaterThan(0);
    for (const r of reactions) {
      expect(r.tagName).toBe("BUTTON");
      expect(r.getAttribute("aria-pressed")).toMatch(/^(true|false)$/);
      expect(r.getAttribute("aria-label")).toMatch(/\d+ reactions?/);
    }
  });

  it("text parts carry no indentation (they are pre-wrap)", () => {
    for (const text of messages().flatMap((m) => [...m.querySelectorAll("[data-part='text']")])) {
      expect(text.textContent).toBe(text.textContent!.trim());
    }
  });
});

describe("chat-message — stylesheet contract", () => {
  it("draws the tail only on the first bubble of a run", () => {
    const tail = rule(MESSAGE.css, '[data-ui="chat-message"]:not([data-continued]) > [data-part="bubble"]::before');
    expect(tail).toContain('content: ""');
    expect(tail).toContain("clip-path: polygon(0 0, 100% 0, 100% 100%)");
    expect(MESSAGE.css).not.toMatch(/\[data-continued\] > \[data-part="bubble"\]::before/);
  });

  it("a continued message keeps the avatar column but hides the picture", () => {
    expect(rule(MESSAGE.css, '[data-ui="chat-message"][data-continued] > [data-part="avatar"]')).toBe("visibility: hidden;");
  });

  it("the label part is visually hidden, not display:none", () => {
    const label = rule(MESSAGE.css, '[data-ui="chat-message"] > [data-part="bubble"] > [data-part="label"]');
    expect(label).toContain("clip-path: inset(50%)");
    expect(label).not.toContain("display: none");
  });

  it("text preserves the newlines a composer typed", () => {
    expect(rule(MESSAGE.css, '[data-ui="chat-message"] > [data-part="bubble"] > [data-part="text"]')).toContain("white-space: pre-wrap");
  });

  it("the typing dots animate, and stop under prefers-reduced-motion", () => {
    const [motion, reduced] = MESSAGE.css.split("@media (prefers-reduced-motion: reduce)");
    expect(motion).toContain("animation: faqir-chat-typing");
    expect(reduced).toContain("animation: none");
  });

  it("uses tokens only — no literal colours", () => {
    expect(MESSAGE.css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    expect(THREAD.css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });
});

describe("chat-thread — contract", () => {
  it("the root is a named, focusable log whose ONE child is the messages list", () => {
    for (const html of [THREAD.html, MESSAGE.html]) {
      const thread = fragment(html).querySelector("[data-ui='chat-thread']")!;
      expect(thread.getAttribute("role")).toBe("log");
      expect(thread.getAttribute("aria-label")).toBeTruthy();
      expect(thread.getAttribute("tabindex")).toBe("0");
      expect([...thread.children].map((c) => c.getAttribute("data-part"))).toEqual(["messages"]);
      expect(thread.firstElementChild!.tagName).toBe("OL");
    }
  });

  it("pins the newest message with column-reverse and scrolls on its own", () => {
    const root = rule(THREAD.css, '[data-ui="chat-thread"]');
    expect(root).toContain("flex-direction: column-reverse");
    expect(root).toContain("overflow-y: auto");
  });

  it("date pills stick to the top", () => {
    const day = rule(THREAD.css, '[data-ui="chat-thread"] > :where([data-part="messages"]) > [data-part="day"]');
    expect(day).toContain("position: sticky");
  });

  it("data-size sets the message text scale every chat-message reads", () => {
    expect(rule(THREAD.css, '[data-ui="chat-thread"][data-size="lg"]')).toContain("--chat-text-size: var(--text-base)");
    expect(MESSAGE.css).toContain("font-size: var(--chat-text-size, var(--text-sm))");
  });
});
