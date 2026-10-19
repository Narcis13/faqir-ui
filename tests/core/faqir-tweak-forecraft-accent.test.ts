// faqir-tweak's named-accent dial (forecraft #9). The studio writes
// `data-accent` on <html> the way it writes `data-theme` and `data-density`:
// an attribute, not a token, restored to the page's own value when cleared,
// and offered with exactly the named hues `registry/tokens/accent.css` defines.
import { afterEach, describe, expect, it } from "bun:test";
import { ACCENT_HUES } from "../../src/theme/accent";

const Faqir = require("../../registry/core/faqir-core.js");
(globalThis as any).Faqir = Faqir;
require("../../registry/core/plugins/faqir-tweak.js");

const html = document.documentElement;
let host: HTMLElement | null = null;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(async () => {
  Faqir.tweak.reset();
  html.removeAttribute("data-accent");
  localStorage.clear();
  host?.remove();
  host = null;
  await tick();
});

describe("faqir-tweak · the named accent", () => {
  it("writes data-accent on <html>, exports it, and a cleared dial restores the page's own", () => {
    html.setAttribute("data-accent", "violet");
    Faqir.tweak.apply({ accent: "pink" });
    expect(html.getAttribute("data-accent")).toBe("pink");
    expect(Faqir.tweak.css().startsWith('/* <html data-accent="pink"> */\n:root {\n')).toBe(true);
    // An attribute, not a token: nothing inline.
    expect(html.style.getPropertyValue("--color-primary")).toBe("");
    Faqir.tweak.reset();
    expect(html.getAttribute("data-accent")).toBe("violet");
  });

  it("offers exactly the named hues, and the dial applies at once", async () => {
    host = document.createElement("div");
    host.innerHTML = `<div l-data="{}"><aside l-tweak aria-label="Theme studio"></aside></div>`;
    document.body.appendChild(host);
    Faqir.initTree(host);
    await tick();
    const select = host.querySelector("select[data-tweak='accent']") as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect([...select.options].map((o) => o.value)).toEqual(["", ...Object.keys(ACCENT_HUES)]);
    const label = host.querySelector(`label[for='${select.id}']`);
    expect(label?.textContent).toBe("Named accent");
    select.value = "fuchsia";
    select.dispatchEvent(new Event("change"));
    expect(html.getAttribute("data-accent")).toBe("fuchsia");
  });
});
