// forecraft #11: `alert-dialog` required its own trigger, which kept the root
// inside <main> next to it (the `landmark` warning). `dialog` made its trigger
// optional in 0.9-04; alert-dialog now does the same. The shared dialog
// controller already handled a missing trigger — these tests pin that an
// alert dialog without one audits clean and opens through its API and through
// an external [data-open] button, with focus going back where it came from.

import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/html-audit";
import { loadRegistryManifestMap, loadRegistryStylesheetMap } from "../../src/utils/components";
import { createAlertDialog } from "../../registry/recipes/alert-dialog/alert-dialog.js";

const REGISTRY = join(import.meta.dir, "../../registry");

let manifests: Awaited<ReturnType<typeof loadRegistryManifestMap>>;
let styles: Awaited<ReturnType<typeof loadRegistryStylesheetMap>>;
beforeAll(async () => {
  manifests = await loadRegistryManifestMap(REGISTRY);
  styles = await loadRegistryStylesheetMap(REGISTRY);
});

const ALERT = `<div data-ui="alert-dialog" data-state="closed" id="row-delete">
  <div data-part="overlay" hidden></div>
  <div data-part="panel" tabindex="-1" role="alertdialog" aria-modal="true"
       aria-labelledby="row-delete-title" aria-describedby="row-delete-desc"
       data-variant="destructive" data-size="sm" hidden>
    <div data-part="header">
      <h2 id="row-delete-title" data-part="title">Delete this invoice?</h2>
    </div>
    <div data-part="body">
      <p id="row-delete-desc" data-part="description">This cannot be undone.</p>
    </div>
    <div data-part="footer">
      <button data-ui="button" data-part="cancel" data-variant="outline">Cancel</button>
      <button data-ui="button" data-part="confirm" data-variant="destructive">Delete</button>
    </div>
  </div>
</div>`;

describe("alert-dialog without a trigger (forecraft #11)", () => {
  it("declares the trigger slot optional", () => {
    expect(manifests.get("alert-dialog")!.slots!.trigger.required).toBe(false);
  });

  it("audits clean as a fragment", () => {
    const findings = auditHtmlSource({ source: ALERT, file: "alert.html", manifests, styles });
    expect(findings).toEqual([]);
  });

  it("audits with no landmark or required-slot finding when it sits outside <main>", () => {
    const page = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Invoices</title></head>
<body>
  <main>
    <h1>Invoices</h1>
    <button data-ui="button" data-open="row-delete">Delete</button>
  </main>
  ${ALERT}
</body>
</html>`;
    const findings = auditHtmlSource({ source: page, file: "page.html", manifests, styles });
    const ids = findings.map((f) => f.rule_id);
    expect(ids).not.toContain("landmark");
    expect(ids).not.toContain("required-slot");
  });
});

describe("alert-dialog without a trigger — behaviour (forecraft #11)", () => {
  let box: HTMLElement | null = null;
  let api: { open(): void; close(): void; destroy(): void } | null = null;
  afterEach(() => {
    api?.destroy();
    api = null;
    box?.remove();
    box = null;
  });

  function mount() {
    box = document.createElement("div");
    box.innerHTML = `<button id="opener" data-open="row-delete">Delete</button>${ALERT}`;
    document.body.appendChild(box);
    const root = box.querySelector("[data-ui='alert-dialog']") as HTMLElement;
    api = createAlertDialog(root);
    return {
      root,
      opener: box.querySelector("#opener") as HTMLButtonElement,
      panel: root.querySelector("[data-part='panel']") as HTMLElement,
      cancel: root.querySelector("[data-part='cancel']") as HTMLButtonElement,
    };
  }

  it("opens through open() and focuses the least-destructive action", () => {
    const { root, panel, cancel } = mount();
    api!.open();
    expect(root.dataset.state).toBe("open");
    expect(panel.hidden).toBe(false);
    expect(document.activeElement).toBe(cancel);
  });

  it("opens from an external [data-open] button and returns focus to it", async () => {
    const { root, opener, cancel } = mount();
    opener.focus();
    opener.click();
    expect(root.dataset.state).toBe("open");
    cancel.click();
    // The exit wait settles on animationend/transitionend or its own timer.
    for (let i = 0; i < 50 && root.dataset.state !== "closed"; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(root.dataset.state).toBe("closed");
    expect(document.activeElement).toBe(opener);
  });
});
