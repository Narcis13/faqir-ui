// @ui:controller composer
// @ui:provides send clear focus setValue addFiles removeFile getFiles destroy

import { ownParts } from "../../core/dom.js";

/**
 * Message composer. The textarea grows with its text up to
 * --composer-max-lines and then scrolls — CSS `field-sizing: content` where
 * the browser has it, a scrollHeight measurement where it does not. Enter
 * sends and Shift+Enter breaks the line (data-enter="newline" swaps them for
 * long-form input: Enter breaks, Ctrl/Cmd+Enter sends), and an Enter that
 * commits an IME composition never sends. The send button is live only while
 * there is something to send. Files come from the attach button's picker, a
 * paste or a drop, and show as removable chips. Sending fires a cancelable
 * `faqir:send` { text, files }; unless a listener cancels it, the composer
 * clears and takes focus back.
 */
export function createComposer(root) {
  if (root._faqirComposer) return root._faqirComposer;

  const [input] = ownParts(root, "input");
  const [sendButton] = ownParts(root, "send");
  const [attach] = ownParts(root, "attach");
  const [picker] = ownParts(root, "file");
  // The tray sits directly in the root.
  const tray = root.querySelector(":scope > [data-part='attachments']");
  const measure = !globalThis.CSS?.supports?.("field-sizing", "content");
  let files = [];

  const node = (tag, attrs, text) => {
    const el = document.createElement(tag);
    for (const name in attrs) el.setAttribute(name, attrs[name]);
    if (text) el.textContent = text;
    return el;
  };
  const bytes = (n) =>
    n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB";

  function sync() {
    const ready = Boolean(input?.value.trim()) || files.length > 0;
    root.dataset.state = ready ? "ready" : "empty";
    if (sendButton) sendButton.disabled = !ready;
    if (measure && input) {
      input.style.height = "auto";
      input.style.height = input.scrollHeight + "px";
    }
  }

  function render() {
    if (tray) {
      tray.replaceChildren(
        ...files.map((file) => {
          const chip = node("span", { "data-ui": "chip", "data-size": "sm", role: "listitem" });
          chip.append(
            node("span", { "data-part": "label" }, `${file.name} · ${bytes(file.size)}`),
            node("button", { type: "button", "data-part": "dismiss", "aria-label": `Remove ${file.name}` }, "×"),
          );
          return chip;
        }),
      );
      tray.hidden = files.length === 0;
    }
    sync();
  }

  function addFiles(list) {
    for (const file of list ?? []) {
      const known = files.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified);
      if (!known) files.push(file);
    }
    render();
    return files.length;
  }

  function removeFile(index) {
    if (!(index >= 0 && index < files.length)) return false;
    files.splice(index, 1);
    render();
    return true;
  }

  function getFiles() {
    return [...files];
  }

  function setValue(text) {
    if (input) input.value = text;
    sync();
  }

  function clear() {
    files = [];
    if (input) input.value = "";
    render();
  }

  function focus() {
    input?.focus();
  }

  function send() {
    const text = input?.value.trim() ?? "";
    if (!text && !files.length) return false;
    const event = new CustomEvent("faqir:send", {
      bubbles: true,
      cancelable: true,
      detail: { text, files: [...files] },
    });
    if (!root.dispatchEvent(event)) return false;
    clear();
    focus();
    return true;
  }

  function onKeyDown(event) {
    if (event.target !== input || event.key !== "Enter") return;
    if (event.isComposing || event.keyCode === 229) return;
    const mod = event.ctrlKey || event.metaKey;
    const sends = root.dataset.enter === "newline" ? mod : !event.shiftKey;
    if (!sends) return;
    event.preventDefault();
    send();
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (sendButton?.contains(target)) {
      event.preventDefault();
      send();
    } else if (attach?.contains(target)) {
      picker?.click();
    } else {
      const chip = target.closest("[data-part='dismiss']")?.closest("[data-ui='chip']");
      if (!chip || chip.parentElement !== tray) return;
      const index = [...tray.children].indexOf(chip);
      if (!removeFile(index)) chip.remove();
      const next = tray.children[Math.min(index, tray.children.length - 1)];
      (next?.querySelector("[data-part='dismiss']") ?? attach ?? input)?.focus();
    }
  }

  function onInput(event) {
    if (event.target === input) sync();
  }

  function onChange(event) {
    if (event.target !== picker) return;
    addFiles(picker.files);
    picker.value = "";
  }

  function onSubmit(event) {
    event.preventDefault();
    send();
  }

  function onPaste(event) {
    if (event.target === input && event.clipboardData?.files?.length) addFiles(event.clipboardData.files);
  }

  function onDragOver(event) {
    if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
  }

  function onDrop(event) {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  const listeners = {
    keydown: onKeyDown,
    click: onClick,
    input: onInput,
    change: onChange,
    submit: onSubmit,
    paste: onPaste,
    dragover: onDragOver,
    drop: onDrop,
  };
  for (const [type, fn] of Object.entries(listeners)) root.addEventListener(type, fn);

  function destroy() {
    for (const [type, fn] of Object.entries(listeners)) root.removeEventListener(type, fn);
    delete root._faqirComposer;
  }

  const api = { send, clear, focus, setValue, addFiles, removeFile, getFiles, destroy };
  root._faqirComposer = api;
  sync();
  return api;
}
