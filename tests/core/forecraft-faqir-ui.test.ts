// ═══════════════════════════════════════════════════════════════════════════
// `Faqir.ui(elOrSelector)` — a controller from plain JavaScript  [forecraft #10]
// ═══════════════════════════════════════════════════════════════════════════
//
// From an expression `$ui('#toasts').add({…})` worked; from plain JavaScript
// the controller sat on a private `_faqir…` property with no public accessor.
// `Faqir.ui` is the function `$ui(…)` calls.

import { afterEach, describe, expect, it } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");

const NAME = "forecraft-ui-widget";
Faqir.controller(NAME, (root: any) => {
  if (root._faqirForecraftUi) return root._faqirForecraftUi;
  const api = {
    hello: () => "hello from " + root.id,
    destroy: () => { delete root._faqirForecraftUi; },
  };
  root._faqirForecraftUi = api;
  return api;
});

let host: HTMLElement | null = null;
function mount(html: string): HTMLElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  Faqir.initTree(host.firstElementChild as HTMLElement);
  return host;
}

afterEach(() => {
  if (host) {
    Faqir.destroy(host);
    host.remove();
    host = null;
  }
});

describe("Faqir.ui", () => {
  it("returns a component's controller by selector and by element", () => {
    const h = mount(`
      <div l-data="{}">
        <div id="fc-widget" data-ui="${NAME}"><span id="fc-inner">x</span></div>
      </div>`);
    const el = h.querySelector("#fc-widget")!;

    const bySelector = Faqir.ui("#fc-widget");
    expect(bySelector).not.toBeNull();
    expect(bySelector.hello()).toBe("hello from fc-widget");
    expect(Faqir.ui(el)).toBe(bySelector);
    // Anything inside the component resolves to the nearest enclosing one.
    expect(Faqir.ui("#fc-inner")).toBe(bySelector);
  });

  it("is the same API $ui(…) returns in an expression", () => {
    const h = mount(`
      <div l-data="{ api: null }" l-init="api = $ui('#fc-widget-2')">
        <div id="fc-widget-2" data-ui="${NAME}"></div>
      </div>`);
    const scope = (h.firstElementChild as any).__faqirScope;
    expect(scope.api).not.toBeNull();
    expect(Faqir.ui("#fc-widget-2")).toBe(scope.api.__target ?? scope.api);
  });

  it("returns null when nothing matches or the match has no controller", () => {
    mount(`<div l-data="{}"><p id="fc-plain">no component</p></div>`);
    expect(Faqir.ui("#fc-nothing-here")).toBeNull();
    expect(Faqir.ui("#fc-plain")).toBeNull();
    expect(Faqir.ui(null)).toBeNull();
    expect(Faqir.ui(undefined)).toBeNull();
  });
});
