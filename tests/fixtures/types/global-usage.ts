// Type fixture — the classic-script shape.
//
// No import and no export, so this file is a SCRIPT: it sees the UMD global
// that `export as namespace Faqir` declares, exactly as a page that loaded
// `<script src=".../faqir-core.min.js">` does. Same contract as
// module-usage.ts — zero diagnostics, `@ts-expect-error` marking every line
// that must be rejected.

// ── the global itself ──────────────────────────────────────────────────────
Faqir.start();
const engineVersion: string = Faqir.version;

// ── window.Faqir — the same object the classic-script build sets ───────────
window.Faqir?.start();

// ── window.__FAQIR_DEVTOOLS__ — the handle both builds install ─────────────
// @ts-expect-error — declared optional: nothing installs it until an engine loads.
window.__FAQIR_DEVTOOLS__.warnings();
const handle = window.__FAQIR_DEVTOOLS__;
if (handle) {
  const scopeCount: number = handle.scopes().length;
  const componentNames: (string | null)[] = handle.components().map((c) => c.ui);
  const running: Faqir.FaqirGlobal = handle.faqir;
  void [scopeCount, componentNames, running, handle.warnings()];
  // @ts-expect-error — `scopes()` takes a root to search within, not a selector.
  handle.scopes("#app");
}

// ── the protocol snapshot ──────────────────────────────────────────────────
const el = document.querySelector("[data-ui='tabs']");
if (el) {
  const inspection = Faqir.inspect<Faqir.ControllerApis["tabs"]>(el);
  inspection?.controller?.api.activate(0);
  const ui: string | null | undefined = inspection?.state.ui;
  void ui;
  // @ts-expect-error — scopeId is a number or null, never a string.
  const scopeId: string = inspection?.scopeId ?? "";
  void scopeId;
}

void engineVersion;
