// ═══════════════════════════════════════════════════════════════════════════
// Auto-start timing
// ═══════════════════════════════════════════════════════════════════════════
//
// The engine booted DURING its own evaluation whenever the document was already
// parsed — always the case for a module, a `defer` script or a bundler import —
// so `Faqir.data()` registered on the line after the `import` was never seen.
// And `data-manual` was read off `document.currentScript`, which a module does
// not have.
//
// The engine is evaluated here against a stub `document`, never the shared
// happy-dom one: a real boot would scope the realm's <body> and leave a
// MutationObserver on it for every later file.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "../../registry/core/faqir-core.js"), "utf8");

const BOOTED = new Error("booted");

interface Harness {
  timers: Array<() => void>;
  domContentLoaded: Array<() => void>;
  booted: () => boolean;
  Faqir: any;
}

function load(opts: { readyState: string; currentScript?: { manual: boolean }; manualModule?: boolean }): Harness {
  const timers: Array<() => void> = [];
  const domContentLoaded: Array<() => void> = [];
  let booted = false;
  const document = {
    readyState: opts.readyState,
    currentScript: opts.currentScript
      ? { hasAttribute: (name: string) => name === "data-manual" && opts.currentScript!.manual }
      : null,
    querySelector(selector: string) {
      if (selector === 'script[type="module"][data-manual]') return opts.manualModule ? {} : null;
      // The first thing `bootstrap()` touches — record the boot and abort it.
      booted = true;
      throw BOOTED;
    },
    addEventListener(type: string, fn: () => void) {
      if (type === "DOMContentLoaded") domContentLoaded.push(fn);
    },
  };
  const module = { exports: {} as any };
  new Function("document", "window", "setTimeout", "module", "exports", SOURCE)(
    document,
    undefined,
    (fn: () => void) => { timers.push(fn); },
    module,
    module.exports,
  );
  return { timers, domContentLoaded, booted: () => booted, Faqir: module.exports };
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

describe("auto-start", () => {
  it("does not boot during evaluation once the document is parsed", () => {
    for (const readyState of ["interactive", "complete"]) {
      const h = load({ readyState });
      expect(h.booted()).toBe(false);
      // What the importing module does on its next line — in time now.
      h.Faqir.data("late", () => ({}));
      run(h.timers);
      expect(h.booted()).toBe(true);
    }
  });

  it("boots once, whichever of DOMContentLoaded and the timer comes first", () => {
    const h = load({ readyState: "interactive" });
    run(h.domContentLoaded);
    expect(h.booted()).toBe(true);
    // A second boot would hit the stub again; `autoStart` must not re-enter.
    let again = false;
    try {
      h.timers.forEach((fn) => fn());
    } catch {
      again = true;
    }
    expect(again).toBe(false);
  });

  it("waits for DOMContentLoaded while the document is loading", () => {
    const h = load({ readyState: "loading" });
    expect(h.timers).toHaveLength(0);
    expect(h.domContentLoaded).toHaveLength(1);
    run(h.domContentLoaded);
    expect(h.booted()).toBe(true);
  });

  it("honours data-manual on the classic script that loaded it", () => {
    const h = load({ readyState: "complete", currentScript: { manual: true } });
    expect(h.timers).toHaveLength(0);
    expect(h.domContentLoaded).toHaveLength(0);
  });

  it("honours data-manual on a module script when there is no currentScript", () => {
    const h = load({ readyState: "complete", manualModule: true });
    expect(h.timers).toHaveLength(0);
    expect(h.domContentLoaded).toHaveLength(0);
    expect(h.booted()).toBe(false);
  });

  it("ignores a module script's data-manual when a classic script loaded it", () => {
    const h = load({ readyState: "complete", currentScript: { manual: false }, manualModule: true });
    expect(h.timers).toHaveLength(1);
  });
});
