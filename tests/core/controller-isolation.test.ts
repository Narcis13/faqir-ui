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

// Controllers observed to throw when mounted on a bare root. The point of the
// test is the containment, so it tolerates any of these learning to survive on
// its own — what it does not tolerate is the page dying with them.
const THROWS_ON_BARE_ROOT = ["calendar", "context-menu", "date-picker", "dropdown"];

let consoleErrors: unknown[][] = [];
let realError: typeof console.error;

beforeEach(() => {
  // Deliberately does NOT clear document.body: the single bootstrapped page is
  // shared by every test here (see the note above). console.error is captured
  // per test so the reporting assertion sees only its own run.
  realError = console.error;
  console.error = (...args: unknown[]) => void consoleErrors.push(args);
});

afterEach(() => {
  console.error = realError;
});

// `Faqir.start()` IS bootstrap — the controller auto-mount sweep lives there, not
// in initTree, so it is the only path that exercises this. It also has no
// re-entry guard and installs a fresh MutationObserver on document.body every
// call, and bun shares one happy-dom realm across every test file: each extra
// call leaves a permanent observer that fires on every later DOM mutation in the
// whole suite, running one querySelectorAll per registered controller. So this
// file boots ONCE and asserts everything against that single page.
describe("a throwing controller is contained", () => {
  let booted = false;

  function bootOnce() {
    if (booted) return;
    document.body.innerHTML = `
      ${THROWS_ON_BARE_ROOT.map((n) => `<div data-ui="${n}"></div>`).join("\n      ")}
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
    const messages = consoleErrors.map((a) => String(a[0])).join("\n");
    for (const name of THROWS_ON_BARE_ROOT) {
      expect(messages, `${name} failed silently`).toContain(name);
    }
    expect(messages).toContain("[Faqir]");
  });
});
