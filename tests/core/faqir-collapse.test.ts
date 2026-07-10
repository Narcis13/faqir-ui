import { describe, it, expect, beforeEach } from "bun:test";

// faqir-collapse — l-collapse height animation plugin. [0.4-11 · §A5]
const Faqir = require("../../registry/core/faqir-core.js");

// Simulate the browser load order (core, then plugin): expose a global Faqir and
// spy on .plugin BEFORE requiring the plugin so we can assert self-registration.
let pluginCalls = 0;
const origPlugin = Faqir.plugin;
Faqir.plugin = function (fn: any) {
  pluginCalls++;
  return origPlugin.call(Faqir, fn);
};
(globalThis as any).Faqir = Faqir;
// First require triggers the plugin IIFE → self-registers via Faqir.plugin.
const install = require("../../registry/core/plugins/faqir-collapse.js");
Faqir.plugin = origPlugin;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
function endTransition(el: Element) {
  el.dispatchEvent(new Event("transitionend", { bubbles: true }));
}

beforeEach(async () => {
  document.body.innerHTML = "";
  await tick();
});

describe("faqir-collapse · registration", () => {
  it("self-registers via Faqir.plugin and exports the installer", () => {
    expect(pluginCalls).toBe(1);
    expect(typeof install).toBe("function");
  });
});

describe("faqir-collapse · l-collapse", () => {
  it("initial closed state is hidden with no inline height residue", async () => {
    document.body.innerHTML = `
      <div l-data="{ open: false }">
        <section id="c" l-collapse="open">body</section>
      </div>`;
    Faqir.start();
    await tick();

    const c = document.getElementById("c")!;
    expect(c.style.display).toBe("none");
    expect(c.style.height).toBe(""); // no residue
    expect(c.style.transition).toBe("");
  });

  it("initial open state is visible with no inline height residue", async () => {
    document.body.innerHTML = `
      <div l-data="{ open: true }">
        <section id="c" l-collapse="open">body</section>
      </div>`;
    Faqir.start();
    await tick();

    const c = document.getElementById("c")!;
    expect(c.style.display).toBe("");
    expect(c.style.height).toBe("");
  });

  it("animates open, then settles at auto height (no residue)", async () => {
    document.body.innerHTML = `
      <div l-data="{ open: false }">
        <section id="c" l-collapse="open">body</section>
        <button id="b" @click="open = !open"></button>
      </div>`;
    Faqir.start();
    await tick();
    const c = document.getElementById("c")!;

    document.getElementById("b")!.click();
    await tick();

    // mid-animation: visible, height driven, transition armed on height
    expect(c.style.display).toBe("");
    expect(c.style.transition).toContain("height");
    expect(c.style.height.endsWith("px")).toBe(true);

    endTransition(c);
    // settled: no inline height/overflow/transition residue
    expect(c.style.height).toBe("");
    expect(c.style.overflow).toBe("");
    expect(c.style.transition).toBe("");
    expect(c.style.display).toBe("");
  });

  it("animates closed, then hides (no residue)", async () => {
    document.body.innerHTML = `
      <div l-data="{ open: true }">
        <section id="c" l-collapse="open">body</section>
        <button id="b" @click="open = !open"></button>
      </div>`;
    Faqir.start();
    await tick();
    const c = document.getElementById("c")!;
    expect(c.style.display).toBe("");

    document.getElementById("b")!.click();
    await tick();

    expect(c.style.transition).toContain("height");
    expect(c.style.height.endsWith("px")).toBe(true);

    endTransition(c);
    expect(c.style.display).toBe("none");
    expect(c.style.height).toBe(""); // no residue
    expect(c.style.overflow).toBe("");
    expect(c.style.transition).toBe("");
  });

  it("respects prefers-reduced-motion: snaps with no animation or residue", async () => {
    const orig = window.matchMedia;
    document.body.innerHTML = `
      <div l-data="{ open: false }">
        <section id="c" l-collapse="open">body</section>
        <button id="b" @click="open = !open"></button>
      </div>`;
    Faqir.start();
    await tick(); // first-run snap (closed) with motion allowed

    (window as any).matchMedia = () => ({ matches: true });
    try {
      const c = document.getElementById("c")!;
      document.getElementById("b")!.click(); // open under reduced motion
      await tick();

      expect(c.style.display).toBe(""); // shown
      expect(c.style.transition).toBe(""); // NOT animated
      expect(c.style.height).toBe(""); // no residue
    } finally {
      (window as any).matchMedia = orig;
    }
  });
});
