// A failing controller must break its own component and nothing else.
//
// Controllers are auto-mounted in a bare loop during bootstrap. Several of them
// query for a child part and dereference the result, so a root whose inner
// markup is incomplete — routine output from a generator working off an elided
// example — threw a TypeError. With no `try`/`catch` around the invocation that
// abandoned the whole bootstrap: no scopes created, no directives bound, no
// `Faqir` global, and every unrelated reactive island on the page left blank.
//
// That is the worst failure shape this framework can have, because the symptom
// (an empty page) points nowhere near the cause (one component's markup), and
// nothing is reported to whoever generated it.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// The four controllers that used to throw when mounted on a bare root. They no
// longer do — W3-2 gave each one an up-front check that names the missing part
// and returns an inert API — but the containment they motivated is what this
// file guards, so they stay the fixture. What must hold either way: the page
// survives, and the component says something.
const INCOMPLETE_ON_BARE_ROOT = ["calendar", "context-menu", "date-picker", "dropdown"];

let consoleMessages: unknown[][] = [];
let realError: typeof console.error;
let realWarn: typeof console.warn;

beforeEach(() => {
  // Deliberately does NOT clear document.body: the single bootstrapped page is
  // shared by every test here (see the note above). Console output is captured
  // per test so the reporting assertion sees only its own run.
  //
  // BOTH channels: a controller that throws is reported by the engine through
  // console.error, and one that detects its own incomplete markup reports it
  // through console.warn. The assertion is that neither shape is silent.
  realError = console.error;
  realWarn = console.warn;
  console.error = (...args: unknown[]) => void consoleMessages.push(args);
  console.warn = (...args: unknown[]) => void consoleMessages.push(args);
});

afterEach(() => {
  console.error = realError;
  console.warn = realWarn;
});

// `Faqir.start()` IS bootstrap — the controller auto-mount sweep lives there,
// not in initTree, so it is the only path that exercises this. Bun shares one
// happy-dom realm across every test file, and each call re-runs the sweep over
// the whole document, so this file boots ONCE and asserts everything against
// that single page. (Since W3-1 a second `start()` no longer re-binds an
// initialized scope or installs a second MutationObserver, but booting once is
// still the cheapest way to keep these assertions about ONE mount.)
describe("a throwing controller is contained", () => {
  let booted = false;

  function bootOnce() {
    if (booted) return;
    document.body.innerHTML = `
      ${INCOMPLETE_ON_BARE_ROOT.map((n) => `<div data-ui="${n}"></div>`).join("\n      ")}
      <div l-data="{ n: 7 }"><span id="probe" l-text="n"></span></div>
      <div l-data="{ open: false }">
        <button id="btn" @click="open = true">go</button>
        <span id="state" l-text="open ? 'yes' : 'no'"></span>
      </div>
    `;
    expect(() => Faqir.start()).not.toThrow();
    booted = true;
  }

  it("does not throw out of bootstrap when several controllers fail at once", async () => {
    bootOnce();
    await tick();
  });

  it("leaves an unrelated reactive island rendering", async () => {
    bootOnce();
    await tick();
    // The whole point: one component's bad markup must not blank the page.
    expect(document.getElementById("probe")!.textContent).toBe("7");
  });

  it("keeps a healthy component fully interactive alongside the broken ones", async () => {
    bootOnce();
    await tick();
    expect(document.getElementById("state")!.textContent).toBe("no");
    (document.getElementById("btn") as HTMLButtonElement).click();
    await tick();
    expect(document.getElementById("state")!.textContent).toBe("yes");
  });

  it("reports each failure instead of swallowing it", async () => {
    bootOnce();
    await tick();
    // A contained failure that is also a silent failure would just move the
    // problem: whoever generated the markup still needs to be told.
    const messages = consoleMessages.map((a) => String(a[0])).join("\n");
    for (const name of INCOMPLETE_ON_BARE_ROOT) {
      expect(messages, `${name} failed silently`).toContain(name);
    }
    expect(messages).toContain("[Faqir]");
  });
});
