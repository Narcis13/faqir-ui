// l-model must store what the user typed — never compile it.
//
// The original implementation built the assignment as source text
// (`prop + " = '" + value + "'"`) and handed it to `new Function`, so an input
// value was JavaScript: typing `\'; sideEffect(); } //` closed the generated
// `with` block and ran the tail. The radio and select branches did not escape at
// all, so an `<option value>` rendered from server data executed on `change`.
// A backslash was silently swallowed, and a newline produced an unterminated
// literal whose SyntaxError was caught and warned away, leaving the binding
// permanently dead.
//
// Values now travel through a reserved `$modelValue` scope slot, so the compiled
// statement is the same for every keystroke and user data never reaches the
// compiler. These tests pin all three properties.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Mount into a disposable container, never document.body.
//
// bun shares one happy-dom realm across every test file, and `initTree(root)`
// makes `root` a scope root — so scoping document.body leaves a scope on it for
// the rest of the suite and every later test that inspects an element sees it.
// The container is torn out in afterEach so nothing survives this file.
let host: HTMLElement | null = null;

function mount(html: string): void {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  Faqir.initTree(host, null);
}

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__lModelSideEffect;
});

afterEach(() => {
  if (host) {
    Faqir.destroy?.(host);
    host.remove();
    host = null;
  }
});

describe("l-model never compiles the input value", () => {
  it("stores a breakout payload verbatim instead of executing it", async () => {
    mount(
      `<div l-data="{ name: '' }">
         <input id="i" l-model="name">
         <span id="t" l-text="name"></span>
       </div>`
    );
    const input = host!.querySelector("#i") as HTMLInputElement;

    // Closes the generated string, runs a statement, then closes the `with`
    // block so what follows still parses. This executed before the fix.
    const payload = String.raw`\'; globalThis.__lModelSideEffect = true; } //`;
    input.value = payload;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();

    expect((globalThis as Record<string, unknown>).__lModelSideEffect).toBeUndefined();
    expect(host!.querySelector("#t")!.textContent).toBe(payload);
  });

  it("stores an unescaped payload from a <select> option value", async () => {
    mount(
      `<div l-data="{ choice: '' }">
         <select id="s" l-model="choice">
           <option value="safe">safe</option>
           <option value="'; globalThis.__lModelSideEffect = true; x='">hostile</option>
         </select>
         <span id="t" l-text="choice"></span>
       </div>`
    );
    const select = host!.querySelector("#s") as HTMLSelectElement;
    select.value = "'; globalThis.__lModelSideEffect = true; x='";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();

    expect((globalThis as Record<string, unknown>).__lModelSideEffect).toBeUndefined();
    expect(host!.querySelector("#t")!.textContent).toBe(
      "'; globalThis.__lModelSideEffect = true; x='"
    );
  });

  it("stores an unescaped payload from a radio value", async () => {
    mount(
      `<div l-data="{ pick: '' }">
         <input id="r" type="radio" name="p" value="'; globalThis.__lModelSideEffect = true; y='" l-model="pick">
         <span id="t" l-text="pick"></span>
       </div>`
    );
    const radio = host!.querySelector("#r") as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();

    expect((globalThis as Record<string, unknown>).__lModelSideEffect).toBeUndefined();
    expect(host!.querySelector("#t")!.textContent).toBe(
      "'; globalThis.__lModelSideEffect = true; y='"
    );
  });
});

describe("l-model round-trips values losslessly", () => {
  const cases: Array<[string, string]> = [
    ["a Windows path", "C:\\Users\\me"],
    ["an apostrophe", "it's fine"],
    ["a double quote", 'he said "no"'],
    ["a lone backslash", "\\"],
    ["a template literal", "${danger}"],
    ["mixed quotes and slashes", `a'b"c\\d`],
  ];

  for (const [label, value] of cases) {
    it(`preserves ${label}`, async () => {
      mount(
        `<div l-data="{ p: '' }">
           <input id="i" l-model="p">
           <span id="t" l-text="p"></span>
         </div>`
      );
      const input = host!.querySelector("#i") as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();

      expect(host!.querySelector("#t")!.textContent).toBe(value);
    });
  }
});

describe("l-model on a <textarea>", () => {
  // <input type=text> strips newlines per the HTML spec, so a textarea is the
  // only place a newline can reach the binding. It is also where the original
  // splice produced an unterminated string literal, whose SyntaxError was caught
  // and warned away — leaving the binding silently dead from then on.
  it("preserves newlines and keeps updating afterwards", async () => {
    mount(
      `<div l-data="{ p: '' }">
         <textarea id="a" l-model="p"></textarea>
         <span id="t" l-text="p"></span>
       </div>`
    );
    const area = host!.querySelector("#a") as HTMLTextAreaElement;

    area.value = "line one\nline two";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(host!.querySelector("#t")!.textContent).toBe("line one\nline two");

    // The binding must still be alive after a multi-line write.
    area.value = "after";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(host!.querySelector("#t")!.textContent).toBe("after");
  });
});

describe("l-model compiles once per binding, not once per value", () => {
  it("keeps working after many distinct values", async () => {
    mount(
      `<div l-data="{ p: '' }">
         <input id="i" l-model="p">
         <span id="t" l-text="p"></span>
       </div>`
    );
    const input = host!.querySelector("#i") as HTMLInputElement;

    // Each of these used to compile and permanently cache its own Function.
    for (let n = 0; n < 200; n++) {
      input.value = "value-" + n;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await tick();

    expect(host!.querySelector("#t")!.textContent).toBe("value-199");
  });
});
