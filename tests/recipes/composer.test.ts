// ═══════════════════════════════════════════════════════════════════════════
// composer — controller contract
// ═══════════════════════════════════════════════════════════════════════════
//
//   • data-state empty | ready, and the send button disabled while empty
//     (whitespace does not count; a file does).
//   • Enter sends, Shift+Enter does not; data-enter="newline" flips that and
//     sends on Ctrl/Cmd+Enter; an Enter that is part of an IME composition
//     (isComposing, or the keyCode 229 Safari reports) never sends.
//   • faqir:send { text, files } is cancelable: cancelled, the draft stays;
//     otherwise the composer clears and focuses the textarea.
//   • Files (picker change, paste, drop, addFiles) render as chip primitives
//     with a "Remove {name}" button; duplicates are ignored; removing moves
//     focus to the next chip, or to the attach button.
//   • Without CSS field-sizing the textarea is sized from scrollHeight.

import { describe, it, expect, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createComposer } from "../../registry/recipes/composer/composer.js";
import { validateManifest, type Manifest } from "../../src/manifest";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";

const ROOT = join(import.meta.dir, "../..");
const DIR = join(ROOT, "registry", "recipes", "composer");
const HTML = readFileSync(join(DIR, "composer.html"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "composer.manifest.json"), "utf8")) as Manifest;

const MARKUP = (extra = "") => `
  <div data-ui="composer" data-state="empty" ${extra}>
    <div data-part="attachments" role="list" aria-label="Attachments" hidden></div>
    <div data-part="bar">
      <div data-part="field">
        <textarea data-part="input" rows="1" aria-label="Message"></textarea>
        <button type="button" data-part="attach" aria-label="Attach files">+</button>
        <input type="file" data-part="file" multiple hidden>
      </div>
      <button type="button" data-part="send" aria-label="Send" disabled>Send</button>
    </div>
  </div>`;

let host: HTMLElement | null = null;

function mount(extra = "") {
  host = document.createElement("div");
  host.innerHTML = MARKUP(extra);
  document.body.append(host);
  const root = host.querySelector("[data-ui='composer']") as HTMLElement;
  const api = createComposer(root);
  const input = root.querySelector("[data-part='input']") as HTMLTextAreaElement;
  const send = root.querySelector("[data-part='send']") as HTMLButtonElement;
  const attach = root.querySelector("[data-part='attach']") as HTMLButtonElement;
  const picker = root.querySelector("[data-part='file']") as HTMLInputElement;
  const tray = root.querySelector("[data-part='attachments']") as HTMLElement;
  const sent: { text: string; files: File[] }[] = [];
  root.addEventListener("faqir:send", (e) => sent.push((e as CustomEvent).detail));
  const type = (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const enter = (init: KeyboardEventInit & { keyCode?: number } = {}) => {
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init });
    if (init.keyCode !== undefined) Object.defineProperty(event, "keyCode", { value: init.keyCode });
    input.dispatchEvent(event);
    return event;
  };
  return { root, api, input, send, attach, picker, tray, sent, type, enter };
}

afterEach(() => {
  const root = host?.querySelector("[data-ui='composer']") as (HTMLElement & { _faqirComposer?: { destroy(): void } }) | null;
  root?._faqirComposer?.destroy();
  host?.remove();
  host = null;
});

const file = (name: string, size = 2048, lastModified = 1) =>
  new File([new Uint8Array(size)], name, { type: "application/pdf", lastModified });

describe("composer — readiness", () => {
  it("starts empty with send disabled, and is ready once there is text", () => {
    const { root, send, type } = mount();
    expect(root.dataset.state).toBe("empty");
    expect(send.disabled).toBe(true);
    type("   ");
    expect(root.dataset.state).toBe("empty");
    expect(send.disabled).toBe(true);
    type("Hi");
    expect(root.dataset.state).toBe("ready");
    expect(send.disabled).toBe(false);
  });

  it("a file alone is enough to send", () => {
    const { root, api, send } = mount();
    api.addFiles([file("brief.pdf")]);
    expect(root.dataset.state).toBe("ready");
    expect(send.disabled).toBe(false);
  });
});

describe("composer — keyboard", () => {
  it("Enter sends the trimmed text (keeping inner newlines) and prevents the newline", () => {
    const { sent, type, enter } = mount();
    type("  line one\nline two  ");
    const event = enter();
    expect(event.defaultPrevented).toBe(true);
    expect(sent).toEqual([{ text: "line one\nline two", files: [] }]);
  });

  it("Shift+Enter inserts a newline instead of sending", () => {
    const { sent, type, enter } = mount();
    type("draft");
    const event = enter({ shiftKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(sent).toEqual([]);
  });

  it("never sends on an Enter that belongs to an IME composition", () => {
    const { sent, type, enter, input } = mount();
    type("にほん");
    expect(enter({ isComposing: true }).defaultPrevented).toBe(false);
    expect(enter({ keyCode: 229 }).defaultPrevented).toBe(false);
    expect(sent).toEqual([]);
    expect(input.value).toBe("にほん");
    enter();
    expect(sent.map((s) => s.text)).toEqual(["にほん"]);
  });

  it("does nothing on Enter when there is nothing to send", () => {
    const { sent, enter } = mount();
    enter();
    expect(sent).toEqual([]);
  });

  it("data-enter=newline: Enter breaks the line, Ctrl/Cmd+Enter sends", () => {
    const { sent, type, enter } = mount('data-enter="newline"');
    type("long form");
    expect(enter().defaultPrevented).toBe(false);
    expect(sent).toEqual([]);
    enter({ ctrlKey: true });
    type("again");
    enter({ metaKey: true });
    expect(sent.map((s) => s.text)).toEqual(["long form", "again"]);
  });
});

describe("composer — sending", () => {
  it("the send button sends, then the composer clears, disables send and refocuses", () => {
    const { root, send, sent, type, input } = mount();
    type("Hello");
    send.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(sent.map((s) => s.text)).toEqual(["Hello"]);
    expect(input.value).toBe("");
    expect(send.disabled).toBe(true);
    expect(root.dataset.state).toBe("empty");
    expect(document.activeElement).toBe(input);
  });

  // Needs happy-dom >= 20.14.6 (package.json's floor): before it, `closest()` from
  // inside a parsed <form> returned an object that was not the form itself, so
  // the composer owned none of its parts and the submit sent nothing.
  it("a <form> root: a submit sends once and never navigates", () => {
    host = document.createElement("div");
    host.innerHTML = MARKUP().replace('<div data-ui="composer"', '<form data-ui="composer"').replace(/<\/div>\s*$/, "</form>");
    document.body.append(host);
    const root = host.querySelector("[data-ui='composer']") as HTMLElement;
    createComposer(root);
    const sent: string[] = [];
    root.addEventListener("faqir:send", (e) => sent.push((e as CustomEvent).detail.text));
    const input = root.querySelector("[data-part='input']") as HTMLTextAreaElement;
    input.value = "Via submit";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const event = new Event("submit", { bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(sent).toEqual(["Via submit"]);
  });

  it("a cancelled faqir:send keeps the draft and the files", () => {
    const { root, api, input, type } = mount();
    root.addEventListener("faqir:send", (e) => e.preventDefault());
    api.addFiles([file("keep.pdf")]);
    type("keep me");
    expect(api.send()).toBe(false);
    expect(input.value).toBe("keep me");
    expect(api.getFiles().map((f: File) => f.name)).toEqual(["keep.pdf"]);
  });

  it("sends text and files together and clears the tray", () => {
    const { api, sent, tray, type } = mount();
    const a = file("a.pdf", 3 * 1024 * 1024);
    api.addFiles([a]);
    type("see attached");
    expect(api.send()).toBe(true);
    expect(sent[0].text).toBe("see attached");
    expect(sent[0].files).toEqual([a]);
    expect(tray.children.length).toBe(0);
    expect(tray.hidden).toBe(true);
  });
});

describe("composer — attachments", () => {
  it("renders each file as a chip with its size and a labelled remove button", () => {
    const { api, tray } = mount();
    api.addFiles([file("brief.pdf", 1536), file("photo.jpg", 2 * 1024 * 1024), file("tiny.txt", 12)]);
    expect(tray.hidden).toBe(false);
    const chips = [...tray.children] as HTMLElement[];
    expect(chips.map((c) => c.getAttribute("data-ui"))).toEqual(["chip", "chip", "chip"]);
    expect(chips.every((c) => c.getAttribute("role") === "listitem")).toBe(true);
    expect(chips.map((c) => c.querySelector("[data-part='label']")!.textContent)).toEqual([
      "brief.pdf · 2 KB",
      "photo.jpg · 2.0 MB",
      "tiny.txt · 12 B",
    ]);
    expect(chips[1].querySelector("[data-part='dismiss']")!.getAttribute("aria-label")).toBe("Remove photo.jpg");
  });

  it("ignores a file it already holds", () => {
    const { api } = mount();
    api.addFiles([file("same.pdf", 10, 5)]);
    expect(api.addFiles([file("same.pdf", 10, 5), file("other.pdf")])).toBe(2);
  });

  it("removing a chip drops the file and moves focus on", () => {
    const { api, tray, attach } = mount();
    api.addFiles([file("one.pdf"), file("two.pdf")]);
    const dismiss = () => [...tray.querySelectorAll("[data-part='dismiss']")] as HTMLButtonElement[];
    dismiss()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(api.getFiles().map((f: File) => f.name)).toEqual(["two.pdf"]);
    expect(document.activeElement).toBe(dismiss()[0]);
    dismiss()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(api.getFiles()).toEqual([]);
    expect(tray.hidden).toBe(true);
    expect(document.activeElement).toBe(attach);
    expect(api.removeFile(0)).toBe(false);
  });

  it("the attach button opens the hidden picker; a picked file is added and the picker reset", () => {
    const { attach, picker, api } = mount();
    let opened = 0;
    picker.click = () => {
      opened++;
    };
    attach.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(opened).toBe(1);
    const picked = [file("picked.pdf")];
    Object.defineProperty(picker, "files", { value: picked, configurable: true });
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    expect(api.getFiles().map((f: File) => f.name)).toEqual(["picked.pdf"]);
  });

  it("accepts files dropped on it and pasted into the textarea", () => {
    const { root, input, api } = mount();
    const drop = new Event("drop", { bubbles: true, cancelable: true }) as any;
    drop.dataTransfer = { files: [file("dropped.png")], types: ["Files"] };
    root.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    const paste = new Event("paste", { bubbles: true, cancelable: true }) as any;
    paste.clipboardData = { files: [file("pasted.png")] };
    input.dispatchEvent(paste);
    expect(api.getFiles().map((f: File) => f.name)).toEqual(["dropped.png", "pasted.png"]);
  });

  it("keeps authored chips until a file arrives, and their remove buttons still work", () => {
    host = document.createElement("div");
    host.innerHTML = MARKUP().replace(
      '<div data-part="attachments" role="list" aria-label="Attachments" hidden></div>',
      '<div data-part="attachments" role="list" aria-label="Attachments"><span data-ui="chip" role="listitem"><span data-part="label">x.pdf</span><button type="button" data-part="dismiss" aria-label="Remove x.pdf">×</button></span></div>',
    );
    document.body.append(host);
    const root = host.querySelector("[data-ui='composer']") as HTMLElement;
    createComposer(root);
    const tray = root.querySelector("[data-part='attachments']")!;
    expect(tray.children.length).toBe(1);
    tray.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(tray.children.length).toBe(0);
  });
});

describe("composer — auto-grow fallback", () => {
  it("sizes the textarea from scrollHeight when field-sizing is unavailable", () => {
    const supports = (globalThis as any).CSS?.supports;
    if (supports?.("field-sizing", "content")) return; // native path: nothing to measure
    const { input, type } = mount();
    Object.defineProperty(input, "scrollHeight", { value: 96, configurable: true });
    type("one\ntwo\nthree\nfour");
    expect(input.style.height).toBe("96px");
  });
});

describe("composer — lifecycle", () => {
  it("returns the same API on double init", () => {
    const { root, api } = mount();
    expect(createComposer(root)).toBe(api);
  });

  it("destroy removes its listeners", () => {
    const { root, api, sent, type, enter } = mount();
    api.destroy();
    type("after destroy");
    enter();
    expect(sent).toEqual([]);
    expect((root as any)._faqirComposer).toBeUndefined();
  });

  it("setValue / clear / focus", () => {
    const { api, input, root } = mount();
    api.setValue("prefilled");
    expect(root.dataset.state).toBe("ready");
    api.clear();
    expect(input.value).toBe("");
    api.focus();
    expect(document.activeElement).toBe(input);
  });
});

describe("composer — reference and manifest", () => {
  it("manifest validates", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
  });

  it("reference page is audit-clean", async () => {
    const manifests = await loadRegistryManifestMap(join(ROOT, "registry"));
    expect(auditHtmlSource({ source: HTML, file: "registry/recipes/composer/composer.html", manifests })).toEqual([]);
  });
});
