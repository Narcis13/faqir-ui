// faqir-tweak — the live theme studio. Dials write tokens onto <html> as
// inline custom properties, the export hands them back as a :root block, and
// the state round-trips through localStorage.
import { beforeEach, describe, expect, it } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.js");

let pluginCalls = 0;
const originalPlugin = Faqir.plugin;
Faqir.plugin = function (fn: (api: typeof Faqir) => void) {
  pluginCalls++;
  return originalPlugin.call(Faqir, fn);
};
(globalThis as any).Faqir = Faqir;
const install = require("../../registry/core/plugins/faqir-tweak.js");
Faqir.plugin = originalPlugin;

const html = document.documentElement;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// A stand-in token layer: the studio reads what the page computed, so the
// tests give it something to read.
const style = document.createElement("style");
style.textContent = `:root {
  --radius-sm: 0.25rem; --radius-md: 0.375rem; --radius-lg: 0.5rem; --radius-xl: 0.75rem; --radius-2xl: 1rem;
  --text-base: 1rem; --duration-normal: 200ms; --motion-stagger: 70ms;
  --color-primary: oklch(0.51 0.22 264);
}`;
document.head.appendChild(style);

async function mount(): Promise<HTMLElement> {
  const host = document.createElement("div");
  host.innerHTML = `<div l-data="{}"><aside id="studio" l-tweak aria-label="Theme studio"></aside></div>`;
  document.body.appendChild(host);
  Faqir.initTree(host);
  await tick();
  return document.getElementById("studio")!;
}

beforeEach(async () => {
  document.body.innerHTML = "";
  localStorage.clear();
  Faqir.tweak.reset();
  html.removeAttribute("data-theme");
  html.removeAttribute("data-density");
  await tick();
});

describe("faqir-tweak · registration", () => {
  it("self-registers via Faqir.plugin, exports the installer and publishes Faqir.tweak", () => {
    expect(pluginCalls).toBe(1);
    expect(typeof install).toBe("function");
    expect(typeof Faqir.tweak.apply).toBe("function");
    expect(typeof Faqir.tweak.css).toBe("function");
    expect(typeof Faqir.tweak.reset).toBe("function");
  });
});

describe("faqir-tweak · the dials write tokens onto <html>", () => {
  it("a scale dial multiplies every token of its family and keeps the unit", () => {
    Faqir.tweak.apply({ radius: 2 });
    expect(html.style.getPropertyValue("--radius-md")).toBe("0.75rem");
    expect(html.style.getPropertyValue("--radius-2xl")).toBe("2rem");
    // Untouched families stay untouched.
    expect(html.style.getPropertyValue("--text-base")).toBe("");
  });

  it("the accent dials rewrite the primary family through relative colour syntax, from the theme's own value", () => {
    Faqir.tweak.apply({ hue: 40, chroma: 1.5 });
    expect(html.style.getPropertyValue("--color-primary")).toBe(
      "oklch(from oklch(0.51 0.22 264) l calc(c * 1.5) calc(h + 40))",
    );
  });

  it("speed scales the durations and the stagger together", () => {
    Faqir.tweak.apply({ speed: 0.5 });
    expect(html.style.getPropertyValue("--duration-normal")).toBe("100ms");
    expect(html.style.getPropertyValue("--motion-stagger")).toBe("35ms");
  });

  it("scheme and density are attributes, and a cleared dial restores what the page had", () => {
    html.setAttribute("data-theme", "light");
    Faqir.tweak.apply({ scheme: "dark", density: "compact" });
    expect(html.getAttribute("data-theme")).toBe("dark");
    expect(html.getAttribute("data-density")).toBe("compact");
    Faqir.tweak.reset();
    expect(html.getAttribute("data-theme")).toBe("light");
    expect(html.hasAttribute("data-density")).toBe(false);
  });

  it("every other dial maps to the token a theme would set", () => {
    Faqir.tweak.apply({ easing: "spring", lift: "0 -2px", ambient: "paused", border: "heavy", depth: "flat", page: "grain", weight: "800", tracking: "-0.04", headingFont: "serif" });
    const v = (t: string) => html.style.getPropertyValue(t);
    expect(v("--ease-default")).toBe("var(--ease-spring)");
    expect(v("--motion-reveal-ease")).toBe("var(--ease-spring)");
    expect(v("--motion-hover-lift")).toBe("0 -2px");
    expect(v("--motion-ambient-play")).toBe("paused");
    expect(v("--border-width")).toBe("var(--border-width-lg)");
    expect(v("--shadow-md")).toBe("none");
    expect(v("--texture-page")).toBe("var(--texture-grain)");
    expect(v("--heading-weight")).toBe("800");
    expect(v("--heading-tracking")).toBe("-0.04em");
    expect(v("--font-heading")).toBe("var(--font-serif)");
  });

  it("reset removes every override it wrote and leaves nothing behind", () => {
    Faqir.tweak.apply({ radius: 2, speed: 2, depth: "flat" });
    expect(html.style.length).toBeGreaterThan(0);
    Faqir.tweak.reset();
    expect(html.style.length).toBe(0);
  });
});

describe("faqir-tweak · export and persistence", () => {
  it("css() is a :root block of exactly the overrides, with the attributes as a comment", () => {
    Faqir.tweak.apply({ radius: 2, scheme: "dark" });
    const css = Faqir.tweak.css();
    expect(css.startsWith('/* <html data-theme="dark"> */\n:root {\n')).toBe(true);
    expect(css).toContain("  --radius-md: 0.75rem;\n");
    expect(css).not.toContain("--text-base");
    expect(css.endsWith("}\n")).toBe(true);
  });

  it("the state survives a reload through localStorage", () => {
    Faqir.tweak.apply({ radius: 1.5, lift: "0 -1px" });
    const saved = JSON.parse(localStorage.getItem("faqir:tweak")!);
    expect(saved.radius).toBe(1.5);
    Faqir.tweak.reset();
    expect(html.style.getPropertyValue("--radius-md")).toBe("");
    localStorage.setItem("faqir:tweak", JSON.stringify(saved));
    Faqir.tweak.restore();
    expect(html.style.getPropertyValue("--radius-md")).toBe("0.5625rem");
    expect(html.style.getPropertyValue("--motion-hover-lift")).toBe("0 -1px");
  });
});

describe("faqir-tweak · l-tweak", () => {
  it("mounts a labelled panel of registry primitives into the element", async () => {
    const studio = await mount();
    expect(studio.querySelectorAll("details[data-ui='collapsible']").length).toBe(6);
    const labels = studio.querySelectorAll("label[data-ui='label']");
    expect(labels.length).toBeGreaterThan(15);
    for (const label of labels) {
      const target = document.getElementById(label.getAttribute("for")!);
      expect(target, `label "${label.textContent}" points at a control`).not.toBeNull();
      expect(["INPUT", "SELECT"]).toContain(target!.tagName);
    }
    expect(studio.querySelector("button[data-ui='button'][data-variant='primary']")!.textContent).toBe("Copy CSS");
  });

  it("a dial change applies at once, and the panel follows an API change", async () => {
    const studio = await mount();
    const radius = studio.querySelector("input[data-tweak='radius']") as HTMLInputElement;
    radius.value = "2";
    radius.dispatchEvent(new Event("input"));
    expect(html.style.getPropertyValue("--radius-md")).toBe("0.75rem");

    const scheme = studio.querySelector("select[data-tweak='scheme']") as HTMLSelectElement;
    scheme.value = "dark";
    scheme.dispatchEvent(new Event("change"));
    expect(html.getAttribute("data-theme")).toBe("dark");
    // The radius dial is still what the panel last set: one state, merged.
    expect(html.style.getPropertyValue("--radius-md")).toBe("0.75rem");

    Faqir.tweak.apply({ radius: 1 });
    expect(radius.value).toBe("1");
  });

  it("mounts one panel and unmounts it with its scope", async () => {
    const studio = await mount();
    expect(studio.querySelectorAll("button[data-ui='button']").length).toBe(2);
    Faqir.destroy(studio.parentElement!);
    expect(studio.children.length).toBe(0);
  });
});
