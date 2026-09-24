import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

// registry/core/faqir.js — the ESM auto-init — watched `addedNodes` only, so a
// controller whose root left the DOM was never destroyed: its document-level
// listeners, focus traps and timers outlived the component. It now destroys
// the controllers of removed subtrees, except a root that was moved (removed
// and re-added in one mutation batch), which must keep its controller.
//
// The module installs a permanent MutationObserver on `document.body` the
// moment it is imported, and would initialise every recipe other files mount
// into this shared happy-dom realm. So it runs in its own process.  [1.1 runtime fixes]

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

const CHILD = `
const tick = () => new Promise((r) => setTimeout(r, 0));
const markup = '<div data-ui="dialog" data-state="closed"><button data-part="trigger">o</button>' +
  '<div data-part="overlay" hidden></div><div data-part="panel" role="dialog" hidden tabindex="-1">' +
  '<button data-part="close">x</button></div></div>';
function host() {
  const el = document.createElement("div");
  el.innerHTML = markup;
  return el;
}
const out = {};
const first = host();
document.body.appendChild(first);
await import(${JSON.stringify(join(ROOT, "registry", "core", "faqir.js"))});
out.initial = !!first.firstElementChild._faqirDialog;

const second = host();
document.body.appendChild(second);
await tick();
const dialog = second.firstElementChild;
const api = dialog._faqirDialog;
out.added = !!api;

const elsewhere = document.createElement("section");
document.body.appendChild(elsewhere);
elsewhere.appendChild(dialog);
await tick();
out.movedKeepsController = dialog._faqirDialog === api;

api.open();
second.remove();
elsewhere.remove();
await tick();
out.removedIsDestroyed = dialog._faqirDialog === undefined;
out.removedIsClosed = dialog.dataset.state === "closed";

const transient = host();
document.body.appendChild(transient);
transient.remove();
await tick();
out.transientNeverInitialised = transient.firstElementChild._faqirDialog === undefined;

console.log(JSON.stringify(out));
process.exit(0);
`;

describe("core/faqir.js auto-init", () => {
  test("destroys controllers of removed subtrees and keeps moved ones", () => {
    const r = runSync("bun", ["--preload", "./tests/setup.ts", "-e", CHILD], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.CLI,
    });
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout.trim().split("\n").pop()!)).toEqual({
      initial: true,
      added: true,
      movedKeepsController: true,
      removedIsDestroyed: true,
      removedIsClosed: true,
      transientNeverInitialised: true,
    });
  });
});
