import { describe, it, expect, beforeEach } from "bun:test";

// Transitions 2.0 — attribute-visible l-transition lifecycle. [0.4-11 · §A4]
// The engine drives show/hide through a single `data-motion` attribute
// (enter → enter-active → cleared / leave → leave-active → cleared) with NO
// per-stage CSS classes, and a timeout fallback so leave always completes.
const Faqir = require("../../registry/core/faqir-core.js");

// setTimeout(0) resolves after the microtask queue AND the requestAnimationFrame
// callback (happy-dom order: microtask → rAF → timeout-0), so one tick advances
// the lifecycle from the from-state to the "-active" stage.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
// Long enough for the rAF stage plus the ~50ms timeout fallback to clear.
function settle(ms = 140): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Deterministically record every `data-motion` write the engine makes on `el`,
// in order — capturing the engine's actual setAttribute/removeAttribute calls
// (removeAttribute is recorded as null). Robust against happy-dom's flaky
// subtree MutationObserver attribute delivery.
function recordMotion(el: Element): (string | null)[] {
  const seq: (string | null)[] = [];
  const origSet = el.setAttribute.bind(el);
  const origRemove = el.removeAttribute.bind(el);
  (el as any).setAttribute = (name: string, value: string) => {
    if (name === "data-motion") seq.push(value);
    return origSet(name, value);
  };
  (el as any).removeAttribute = (name: string) => {
    if (name === "data-motion") seq.push(null);
    return origRemove(name);
  };
  return seq;
}

// Collapse consecutive duplicate stages. The bun/happy-dom harness leaves one
// lingering global MutationObserver per prior Faqir.start() in the process, so a
// single element's l-show effect can be registered N times and stamp each phase
// N times in a block (a test-only artifact — production bootstraps once). The
// distinct, ordered phase sequence is what the spec pins down.
function phases(seq: (string | null)[]): (string | null)[] {
  return seq.filter((v, i) => i === 0 || v !== seq[i - 1]);
}

beforeEach(async () => {
  document.body.innerHTML = "";
  await tick();
});

describe("l-transition · data-motion lifecycle (l-show)", () => {
  it("show stamps exactly enter → enter-active → (cleared)", async () => {
    document.body.innerHTML = `
      <div l-data="{ visible: false }">
        <span id="t" l-show="visible" l-transition="fade">Hi</span>
        <button id="b" @click="visible = !visible"></button>
      </div>`;
    Faqir.start();
    await settle(); // let the initial (hidden) mount settle

    const span = document.getElementById("t")!;
    const seq = recordMotion(span); // observe only the toggle
    document.getElementById("b")!.click();
    await settle();

    expect(phases(seq)).toEqual(["enter", "enter-active", null]);
    // Attribute-visible only — never a per-stage class.
    expect(span.className).toBe("");
    expect(span.classList.length).toBe(0);
  });

  it("hide stamps exactly leave → leave-active → (cleared), then display:none", async () => {
    document.body.innerHTML = `
      <div l-data="{ visible: true }">
        <span id="t" l-show="visible" l-transition="fade">Hi</span>
        <button id="b" @click="visible = !visible"></button>
      </div>`;
    Faqir.start();
    await settle();

    const span = document.getElementById("t")!;
    const seq = recordMotion(span);
    document.getElementById("b")!.click();
    await settle();

    expect(phases(seq)).toEqual(["leave", "leave-active", null]);
    expect(span.style.display).toBe("none");
    expect(span.className).toBe("");
  });
});

describe("l-transition · l-if structural insert/remove", () => {
  it("inserts on enter (no residue) and removes the node on leave", async () => {
    document.body.innerHTML = `
      <div l-data="{ show: false }">
        <template l-if="show"><span class="c" l-transition="slide-up">X</span></template>
        <button id="b" @click="show = !show"></button>
      </div>`;
    Faqir.start();
    await settle();
    expect(document.querySelector(".c")).toBeNull();

    // enter → node inserted, data-motion cleared, no per-stage class residue
    document.getElementById("b")!.click();
    await settle();
    const node = document.querySelector(".c")!;
    expect(node).not.toBeNull();
    expect(node.hasAttribute("data-motion")).toBe(false);
    expect(node.className).toBe("c");

    // leave → node removed after the cycle
    document.getElementById("b")!.click();
    await settle();
    expect(document.querySelector(".c")).toBeNull();
  });
});

describe("l-transition · completion paths", () => {
  it("timeout fallback completes the cycle when no transitionend fires", async () => {
    document.body.innerHTML = `
      <div l-data="{ visible: false }">
        <span id="t" l-show="visible" l-transition="fade">Hi</span>
        <button id="b" @click="visible = !visible"></button>
      </div>`;
    Faqir.start();
    await settle();

    const span = document.getElementById("t")!;
    document.getElementById("b")!.click();
    await tick(); // rAF has run → active stage; the fallback timer is still pending

    expect(span.getAttribute("data-motion")).toBe("enter-active");

    await settle(); // no transitionend is ever dispatched → fallback must clear it
    expect(span.hasAttribute("data-motion")).toBe(false);
  });

  it("transitionend completes the cycle immediately, before the fallback", async () => {
    document.body.innerHTML = `
      <div l-data="{ visible: false }">
        <span id="t" l-show="visible" l-transition="fade">Hi</span>
        <button id="b" @click="visible = !visible"></button>
      </div>`;
    Faqir.start();
    await settle();

    const span = document.getElementById("t")!;
    document.getElementById("b")!.click();
    await tick();
    expect(span.getAttribute("data-motion")).toBe("enter-active");

    span.dispatchEvent(new Event("transitionend", { bubbles: true }));
    expect(span.hasAttribute("data-motion")).toBe(false); // cleared synchronously
  });
});

describe("l-transition · re-entrancy", () => {
  // The cycle that is still in flight when the next toggle arrives. This is the
  // condition the CI runner kept hitting and a local machine did not: the mount
  // starts a leave cycle, and on a loaded runner its ~50ms finisher had not run
  // yet when the click flipped the element back on. The stale finisher then
  // fired into the new cycle — clearing the enter's `data-motion` between the
  // from-state and the active stage, and running the leave's `done`, which puts
  // `display: none` on an element the enter had just shown. A visibly broken
  // toggle, not merely a flaky assertion.
  it("a toggle mid-cycle cancels the old cycle instead of being clipped by it", async () => {
    document.body.innerHTML = `
      <div l-data="{ visible: false }">
        <span id="t" l-show="visible" l-transition="fade">Hi</span>
        <button id="b" @click="visible = !visible"></button>
      </div>`;
    Faqir.start();
    // Deliberately starved: one tick is past the mount leave's rAF and short of
    // its finisher, so the click below lands with a cycle still running.
    await tick();

    const span = document.getElementById("t")!;
    const seq = recordMotion(span);
    document.getElementById("b")!.click();
    await settle(300);

    expect(phases(seq)).toEqual(["enter", "enter-active", null]);
    // The load-bearing one: the stale leave must not have hidden it.
    expect(span.style.display).not.toBe("none");
  });

  it("the last of several rapid toggles decides the final state", async () => {
    document.body.innerHTML = `
      <div l-data="{ visible: true }">
        <span id="t" l-show="visible" l-transition="fade">Hi</span>
        <button id="b" @click="visible = !visible"></button>
      </div>`;
    Faqir.start();
    await settle();

    const span = document.getElementById("t")!;
    const button = document.getElementById("b")!;
    button.click(); // → hide
    await tick();
    button.click(); // → show, while the leave is mid-flight
    await settle(300);

    expect(span.hasAttribute("data-motion")).toBe(false); // no residue
    expect(span.style.display).not.toBe("none");
  });
});

describe("l-transition · preset resolution", () => {
  function captureWarn() {
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (...a: any[]) => warns.push(a.join(" "));
    return { warns, restore: () => (console.warn = orig) };
  }

  it("known presets resolve without a preset warning", async () => {
    const cap = captureWarn();
    document.body.innerHTML = `
      <div l-data="{ visible: true }">
        <span l-show="visible" l-transition="scale">Hi</span>
        <button id="b" @click="visible = !visible"></button>
      </div>`;
    Faqir.start();
    await settle();
    document.getElementById("b")!.click();
    await settle();
    cap.restore();
    expect(cap.warns.some((w) => w.includes("unknown preset"))).toBe(false);
  });

  it("unknown preset warns in dev but still animates cleanly", async () => {
    const cap = captureWarn();
    document.body.innerHTML = `
      <div l-data="{ visible: false }">
        <span id="t" l-show="visible" l-transition="whoosh">Hi</span>
        <button id="b" @click="visible = !visible"></button>
      </div>`;
    Faqir.start();
    await settle();
    document.getElementById("b")!.click();
    await settle();
    cap.restore();

    expect(cap.warns.some((w) => w.includes('unknown preset "whoosh"'))).toBe(true);
    const span = document.getElementById("t")!;
    expect(span.hasAttribute("data-motion")).toBe(false); // still completes
    expect(span.className).toBe("");
  });
});

describe("l-transition · reduced motion", () => {
  it("never stamps a motion phase and completes synchronously", async () => {
    const orig = window.matchMedia;
    (window as any).matchMedia = () => ({ matches: true });
    try {
      document.body.innerHTML = `
        <div l-data="{ visible: true }">
          <span id="t" l-show="visible" l-transition="fade">Hi</span>
          <button id="b" @click="visible = !visible"></button>
        </div>`;
      Faqir.start();
      await settle();

      const span = document.getElementById("t")!;
      const seq = recordMotion(span);
      document.getElementById("b")!.click();
      await tick();

      // No enter/leave/-active phase is ever stamped (only cleanup may run).
      expect(seq.filter(Boolean)).toEqual([]);
      expect(span.style.display).toBe("none"); // hidden immediately, no animation
    } finally {
      (window as any).matchMedia = orig;
    }
  });
});
