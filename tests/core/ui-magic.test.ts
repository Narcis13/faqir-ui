// `$ui`, in both of its forms (task W2-6).
//
// `$ui` resolved from the scope root and nowhere else, so nothing in an
// expression could say "open that drawer". Opening a detail drawer from a table
// row — the most common admin pattern there is — needed an invented global store
// plus an `l-effect` handshake, about fifteen lines of ceremony to carry "the
// user clicked row 7" between two components that were both already in the DOM.
//
// It is now callable: `$ui('#detail-drawer').open()`. The local form is
// unchanged, and both are asserted here so the second cannot cost the first.

import { describe, it, expect, beforeEach } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A drawer whose controller the tests reach through `$ui`. */
function drawer(id: string): string {
  return `
    <div data-ui="drawer" data-state="closed" id="${id}">
      <button data-part="trigger">Open</button>
      <div data-part="overlay" hidden></div>
      <div data-part="panel" data-variant="left" data-size="md" role="dialog"
           aria-modal="true" aria-labelledby="${id}-title" hidden>
        <div data-part="header">
          <h2 id="${id}-title" data-part="title">Detail</h2>
          <button data-part="close" aria-label="Close">✕</button>
        </div>
        <div data-part="body"><p>Body.</p></div>
      </div>
    </div>`;
}

async function boot(html: string) {
  document.body.innerHTML = html;
  Faqir.start();
  await tick();
}

beforeEach(async () => {
  document.body.innerHTML = "";
  await tick();
});

describe("$ui · the local form is unchanged", () => {
  it("reaches the controller of the component the expression sits in", async () => {
    await boot(`
      <div data-ui="drawer" data-state="closed" id="local">
        <button data-part="trigger" id="go" @click="$ui.open()">Open</button>
        <div data-part="overlay" hidden></div>
        <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="local-title" hidden>
          <div data-part="header"><h2 id="local-title" data-part="title">T</h2>
            <button data-part="close" aria-label="Close">✕</button></div>
          <div data-part="body"><p>B</p></div>
        </div>
      </div>`);

    // The trigger's own click handler opens it too; drive the expression alone.
    const root = document.getElementById("local")!;
    const scope = (root as unknown as { __faqirScope: Record<string, unknown> }).__faqirScope;
    (scope.$ui as { open: () => void }).open();
    expect(root.dataset.state).toBe("open");
  });

  it("exposes the controller's own methods as properties", async () => {
    await boot(drawer("props"));
    const scope = (document.getElementById("props") as unknown as {
      __faqirScope: Record<string, unknown>;
    }).__faqirScope;
    const ui = scope.$ui as Record<string, unknown>;
    for (const method of ["open", "close", "toggle", "destroy"]) {
      expect(typeof ui[method], `$ui.${method}`).toBe("function");
    }
  });
});

describe("$ui(selector) · reaching another component", () => {
  it("opens a drawer from an element outside it", async () => {
    await boot(`
      <div l-data="{}">
        <button id="row" @click="$ui('#detail').open()">View</button>
      </div>
      ${drawer("detail")}`);

    expect(document.getElementById("detail")!.dataset.state).toBe("closed");
    document.getElementById("row")!.click();
    expect(document.getElementById("detail")!.dataset.state).toBe("open");
  });

  it("resolves from any element inside the component, not just its root", async () => {
    await boot(`
      <div l-data="{}">
        <button id="row" @click="$ui('#detail [data-part=&quot;title&quot;]').open()">View</button>
      </div>
      ${drawer("detail")}`);

    document.getElementById("row")!.click();
    expect(document.getElementById("detail")!.dataset.state).toBe("open");
  });

  it("takes an element as readily as a selector", async () => {
    await boot(`<div l-data="{}" id="scope"></div>${drawer("detail")}`);
    const scope = (document.getElementById("scope") as unknown as {
      __faqirScope: Record<string, unknown>;
    }).__faqirScope;
    const lookup = scope.$ui as (target: unknown) => { open: () => void } | null;
    lookup(document.getElementById("detail"))!.open();
    expect(document.getElementById("detail")!.dataset.state).toBe("open");
  });

  it("returns null for a selector that matches nothing", async () => {
    await boot(`<div l-data="{}" id="scope"></div>`);
    const scope = (document.getElementById("scope") as unknown as {
      __faqirScope: Record<string, unknown>;
    }).__faqirScope;
    expect((scope.$ui as (t: string) => unknown)("#nope")).toBeNull();
  });

  it("returns null for a match that has no controller", async () => {
    await boot(`<div l-data="{}" id="scope"></div><div data-ui="card" id="plain"></div>`);
    const scope = (document.getElementById("scope") as unknown as {
      __faqirScope: Record<string, unknown>;
    }).__faqirScope;
    expect((scope.$ui as (t: string) => unknown)("#plain")).toBeNull();
  });

  it("a typo is survivable — `$ui('#gone')?.open()` neither throws nor warns", async () => {
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
    try {
      await boot(`
        <div l-data="{ ran: false }">
          <button id="row" @click="$ui('#gone')?.open(); ran = true">View</button>
          <span id="flag" l-text="ran ? 'yes' : 'no'"></span>
        </div>`);
      document.getElementById("row")!.click();
      await tick();
      // The statement completed: the optional call was a no-op, not a throw.
      expect(document.getElementById("flag")!.textContent).toBe("yes");
    } finally {
      console.warn = origWarn;
    }
    expect(warnings).toEqual([]);
  });

  it("commands a drawer from a table row — the pattern this exists for", async () => {
    await boot(`
      <div l-data="{ selected: null }">
        <table>
          <tbody>
            <tr><td><button class="x" id="r1" @click="selected = 1; $ui('#detail').open()">Ada</button></td></tr>
            <tr><td><button class="x" id="r2" @click="selected = 2; $ui('#detail').open()">Grace</button></td></tr>
          </tbody>
        </table>
        <span id="which" l-text="selected === null ? '-' : String(selected)"></span>
      </div>
      ${drawer("detail")}`);

    document.getElementById("r2")!.click();
    await tick();
    expect(document.getElementById("detail")!.dataset.state).toBe("open");
    expect(document.getElementById("which")!.textContent).toBe("2");

    // …and closing it from inside, then re-opening from another row, still works.
    (document.getElementById("detail") as unknown as {
      _faqirDrawer: { close: () => void };
    })._faqirDrawer.close();
    expect(document.getElementById("detail")!.dataset.state).toBe("closed");

    document.getElementById("r1")!.click();
    await tick();
    expect(document.getElementById("detail")!.dataset.state).toBe("open");
    expect(document.getElementById("which")!.textContent).toBe("1");
  });
});
