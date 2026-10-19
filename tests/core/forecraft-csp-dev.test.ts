// ═══════════════════════════════════════════════════════════════════════════
// The strict-CSP development build's diagnostics  [forecraft #50]
// ═══════════════════════════════════════════════════════════════════════════
//
// Loads ONLY `registry/core/faqir-core.csp.dev.js` — its own partition in
// `scripts/test.mjs`. An expression outside the interpreter's subset is the one
// failure the strict-CSP build adds, so the dev build has to say which
// expression, on which element, and that the subset is why.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.csp.dev.js");
const DEVTOOLS = Faqir.devtools;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

let baseline = 0;
let realWarn: typeof console.warn;
let printed: string[] = [];
let mounted: HTMLElement[] = [];

beforeEach(() => {
  baseline = DEVTOOLS.warnings().length;
  printed = [];
  realWarn = console.warn;
  console.warn = (...args: any[]) => {
    printed.push(args.join(" "));
  };
});

afterEach(() => {
  console.warn = realWarn;
  for (const host of mounted) {
    Faqir.destroy(host);
    host.remove();
  }
  mounted = [];
});

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  mounted.push(host);
  Faqir.initTree(host.firstElementChild as HTMLElement);
  return host;
}

const fresh = () => DEVTOOLS.warnings().slice(baseline).filter((w: any) => w.kind === "expression");

describe("strict-CSP dev build", () => {
  it("is a dev build of the CSP engine", () => {
    expect(DEVTOOLS.dev).toBe(true);
    expect(Faqir.evaluate("[1, 2].map(x => x * 2).join()", {}, null)).toBe("2,4");
  });

  it("names the rejected expression, the element and the subset", async () => {
    mount(`<div l-data="{ n: 1 }"><p id="bad" l-text="async () => n"></p></div>`);
    await tick();
    const [w] = fresh();
    expect(w).toBeDefined();
    expect(w.expression).toBe("async () => n");
    expect(w.message).toContain('Expression error in "async () => n"');
    expect(w.message).toContain("the strict-CSP build interprets a subset of JavaScript");
    expect(w.html).toContain('id="bad"');
    expect(printed.join("\n")).toContain('"async () => n"');
  });

  it("reports a rejected statement as a statement, naming it", async () => {
    const host = mount(`<div l-data="{ n: 1 }"><button id="b" @click="switch (n) { case 1: n = 2 }">x</button></div>`);
    (host.querySelector("#b") as HTMLElement).click();
    await tick();
    const [w] = fresh();
    expect(w.message).toContain('Statement error in "switch (n) { case 1: n = 2 }"');
    expect(w.message).toContain('Unsupported syntax "switch"');
  });

  it("reports a forbidden member with the expression it was in", async () => {
    mount(`<div l-data="{ s: 'x' }"><p l-text="s.constructor.name"></p><p l-text="s['__proto__']"></p></div>`);
    await tick();
    const messages = fresh().map((w: any) => w.message);
    expect(messages.some((m: string) => m.includes('"s.constructor.name"') && m.includes('Access to "constructor" is forbidden'))).toBe(true);
    expect(messages.some((m: string) => m.includes(`"s['__proto__']"`) && m.includes('Access to "__proto__" is forbidden'))).toBe(true);
  });
});
