// ═══════════════════════════════════════════════════════════════════════════
// Auto-start timing for a classic `defer` script  [forecraft #28]
// ═══════════════════════════════════════════════════════════════════════════
//
// A page loading `faqir-core.js`, `faqir-validate.js`, `faqir-rules.js` and
// `form.js`, all `defer`, left `l-rules` inert about four loads in six: the
// engine ran with `readyState === "interactive"`, scheduled a one-task timer
// beside its `DOMContentLoaded` listener, and the timer fired between two of
// the deferred scripts — before the plugin that registers `l-rules` existed.
//
// The same stub-`document` harness as `auto-start.test.ts`: a real boot would
// scope the shared happy-dom realm's <body> for every later file.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "../../registry/core/faqir-core.js"), "utf8");

const BOOTED = new Error("booted");

interface Script {
  defer?: boolean;
  async?: boolean;
}

function load(opts: { readyState: string; currentScript?: Script | null }) {
  const timers: Array<() => void> = [];
  const domContentLoaded: Array<() => void> = [];
  const windowLoad: Array<() => void> = [];
  let booted = false;
  const document = {
    readyState: opts.readyState,
    currentScript: opts.currentScript
      ? { hasAttribute: () => false, defer: !!opts.currentScript.defer, async: !!opts.currentScript.async }
      : null,
    querySelector(selector: string) {
      if (selector === 'script[type="module"][data-manual]') return null;
      booted = true;
      throw BOOTED;
    },
    // The first thing `bootstrap()` touches — record the boot and abort it.
    querySelectorAll() {
      booted = true;
      throw BOOTED;
    },
    addEventListener(type: string, fn: () => void) {
      if (type === "DOMContentLoaded") domContentLoaded.push(fn);
    },
  };
  const window = {
    addEventListener(type: string, fn: () => void) {
      if (type === "load") windowLoad.push(fn);
    },
  };
  const module = { exports: {} as any };
  new Function("document", "window", "setTimeout", "module", "exports", SOURCE)(
    document,
    window,
    (fn: () => void) => { timers.push(fn); },
    module,
    module.exports,
  );
  return { timers, domContentLoaded, windowLoad, booted: () => booted, Faqir: module.exports };
}

function run(fns: Array<() => void>) {
  for (const fn of fns) {
    try {
      fn();
    } catch (err) {
      if (err !== BOOTED) throw err;
    }
  }
}

describe("auto-start from a classic defer script", () => {
  it("waits for DOMContentLoaded rather than one task", () => {
    const h = load({ readyState: "interactive", currentScript: { defer: true } });
    // No timer: nothing can fire between this deferred script and the next.
    expect(h.timers).toHaveLength(0);
    expect(h.domContentLoaded).toHaveLength(1);
    expect(h.booted()).toBe(false);

    // The next deferred script — a plugin — registers before the boot.
    h.Faqir.directive("late-rules", () => {});
    run(h.domContentLoaded);
    expect(h.booted()).toBe(true);
  });

  it("falls back to load, and boots once whichever arrives", () => {
    const h = load({ readyState: "interactive", currentScript: { defer: true } });
    expect(h.windowLoad).toHaveLength(1);
    run(h.domContentLoaded);
    expect(h.booted()).toBe(true);
    let again = false;
    try {
      h.windowLoad.forEach((fn) => fn());
    } catch {
      again = true;
    }
    expect(again).toBe(false);
  });

  it("keeps the timer for an async or injected script, which may run after DOMContentLoaded", () => {
    // An injected script reports `async` true unless it was set false.
    for (const currentScript of [{ async: true }, { defer: true, async: true }, {}]) {
      const h = load({ readyState: "interactive", currentScript });
      expect(h.timers).toHaveLength(1);
      expect(h.domContentLoaded).toHaveLength(1);
    }
  });

  it("keeps the timer once the document is complete, even for defer", () => {
    const h = load({ readyState: "complete", currentScript: { defer: true } });
    expect(h.timers).toHaveLength(1);
    run(h.timers);
    expect(h.booted()).toBe(true);
  });

  it("still boots a module import one task after evaluation", () => {
    // A module has no `currentScript` — the README's documented behaviour.
    const h = load({ readyState: "interactive", currentScript: null });
    expect(h.booted()).toBe(false);
    expect(h.timers).toHaveLength(1);
    run(h.timers);
    expect(h.booted()).toBe(true);
  });

  it("still waits for DOMContentLoaded from a parser-blocking script", () => {
    const h = load({ readyState: "loading", currentScript: {} });
    expect(h.timers).toHaveLength(0);
    expect(h.windowLoad).toHaveLength(0);
    expect(h.domContentLoaded).toHaveLength(1);
  });
});
