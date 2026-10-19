// Layout fixes from the forecraft notes: nav wraps (#23), prose tables scroll
// (#24), a hero shows the backdrop it sits in (#20) and takes a display size in
// every layout (#21), dashboard-shell does not cover a phone (#30), and
// key-value's grid layouts place grouped pairs (#41).
//
// Rendering is pinned by the Playwright suites; these pin the stylesheet and
// markup contracts in `bun run test`.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { REGISTRY, registryCss, rulesFor } from "./forecraft-css";

const manifests = await loadRegistryManifestMap(REGISTRY);
const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

describe("nav wraps instead of overflowing (#23)", () => {
  const css = registryCss("primitives/nav/nav.css");

  it("the row wraps", () => {
    expect(rulesFor(css, '[data-ui="nav"]')[0].decls["flex-wrap"]).toBe("wrap");
  });

  it("no variant turns the wrap back off or hides the overflow", () => {
    for (const rule of css) {
      expect(rule.decls["flex-wrap"] ?? "wrap", rule.selectors.join(", ")).toBe("wrap");
      expect(rule.decls["white-space"], rule.selectors.join(", ")).not.toBe("nowrap");
      expect(rule.decls.overflow ?? "", rule.selectors.join(", ")).not.toBe("hidden");
    }
  });
});

describe("prose tables scroll inside a wrapper (#24)", () => {
  const css = registryCss("base/prose.css");
  const WRAP = '[data-ui="prose"] :where(div, figure):has(> table)';

  it("a div or figure around a table is the scroller", () => {
    const rule = rulesFor(css, WRAP)[0];
    expect(rule, "prose.css styles the wrapper").toBeDefined();
    expect(rule.decls["overflow-x"]).toBe("auto");
    expect(rule.decls["max-inline-size"]).toBe("100%");
  });

  it("the wrapper carries the block margin; its focus ring is the reset's default", () => {
    expect(rulesFor(css, `${WRAP} > table`)[0].decls["margin-block"]).toBe("0");
    // reset.css owns the default ring (tests/tokens/shape-focus.test.ts).
    expect(rulesFor(css, `${WRAP}:focus-visible`)).toEqual([]);
  });

  it("takes no part — prose is a base-layer value", () => {
    for (const rule of css) {
      for (const sel of rule.selectors) expect(sel).not.toContain("data-part");
    }
  });

  it("is the shape the docs site already emits for its reference tables", () => {
    const docs = readFileSync(join(REGISTRY, "../src/generator/docs.ts"), "utf8");
    expect(docs).toContain('<div ${scroller} tabindex="0">\\n      <table>');
  });
});

describe("hero (#20, #21)", () => {
  const css = registryCss("patterns/hero/hero.css");

  it("is transparent inside a backdrop, at zero specificity", () => {
    const rule = rulesFor(css, ':where([data-ui="backdrop"] [data-ui="hero"])')[0];
    expect(rule, "hero.css clears --hero-bg inside a backdrop").toBeDefined();
    expect(rule.decls["--hero-bg"]).toBe("transparent");
    // The root still paints --hero-bg, so an author value on the hero wins.
    expect(rulesFor(css, '[data-ui="hero"]')[0].decls["background-color"]).toBe(
      "var(--hero-bg, var(--color-bg))",
    );
  });

  it("the backdrop example no longer needs an inline --hero-bg", () => {
    expect(read("patterns/hero/hero.html")).not.toContain('style="--hero-bg: transparent"');
  });

  it("reads --hero-display-size in every layout, with the old sizes as fallbacks", () => {
    const sizes = css
      .filter((r) => r.selectors.some((s) => s.endsWith('[data-part="headline"]')) && r.decls["font-size"])
      .map((r) => ({ sel: r.selectors[0], at: r.at, size: r.decls["font-size"] }));
    expect(sizes.length).toBeGreaterThanOrEqual(4);
    for (const s of sizes) expect(s.size, `${s.at} ${s.sel}`).toStartWith("var(--hero-display-size, ");

    const at = (sel: string, media = "") => rulesFor(css, sel, media)[0].decls["font-size"];
    expect(at('[data-ui="hero"] [data-part="headline"]')).toBe("var(--hero-display-size, var(--text-3xl))");
    expect(at('[data-ui="hero"][data-variant="split"] [data-part="headline"]')).toBe(
      "var(--hero-display-size, var(--text-3xl))",
    );
    expect(at('[data-ui="hero"] [data-part="headline"]', "@media (min-width: 40rem)")).toBe(
      "var(--hero-display-size, var(--text-4xl))",
    );
  });

  it("the manifest says so", () => {
    const props = manifests.get("hero")!.props!;
    expect(props["--hero-display-size"].description).toContain("every layout");
    expect(props["--hero-bg"].description).toContain("backdrop");
  });
});

describe("dashboard-shell does not cover a phone (#30)", () => {
  const html = read("patterns/dashboard-shell/dashboard-shell.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const shells = [...doc.querySelectorAll('[data-ui="dashboard-shell"]')];

  it("ships no expanded sidebar, in any variant or the template", () => {
    expect(shells.length).toBeGreaterThanOrEqual(3);
    expect(doc.querySelectorAll('[data-part="sidebar"][data-state="expanded"]').length).toBe(0);
    const tpl = manifests.get("dashboard-shell")!.templates.html;
    expect(tpl).not.toContain('data-state="expanded"');
  });

  it("wires the default toggle with directives, Escape included", () => {
    const shell = shells[0];
    expect(shell.getAttribute("l-data")).toContain("drawer: false");
    expect(shell.getAttribute("@keydown.escape")).toBe("drawer = false");
    const sidebar = shell.querySelector('[data-part="sidebar"]')!;
    expect(sidebar.getAttribute(":data-state")).toBe("drawer ? 'expanded' : null");
    const toggle = shell.querySelector('[data-part="sidebar-toggle"]')!;
    expect(toggle.getAttribute("@click")).toBe("drawer = !drawer");
    expect(toggle.getAttribute("aria-controls")).toBe(sidebar.id);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("type")).toBe("button");
  });

  it("hides the toggle from the md floor, where the sidebar is docked", () => {
    const css = registryCss("patterns/dashboard-shell/dashboard-shell.css");
    const rule = rulesFor(
      css,
      '[data-ui="dashboard-shell"] > :where([data-part="header"]) > [data-part="sidebar-toggle"]',
      "@media (min-width: 48rem)",
    )[0];
    expect(rule?.decls.display).toBe("none");
    // And the docked sidebar does not depend on a state below it.
    const docked = rulesFor(css, '[data-ui="dashboard-shell"] > [data-part="sidebar"]', "@media (min-width: 48rem)")[0];
    expect(docked.decls.visibility).toBe("visible");
    expect(docked.decls.position).toBe("static");
  });
});

describe("key-value grouped pairs (#41)", () => {
  const css = registryCss("primitives/key-value/key-value.css");
  const contents = css.filter((r) => r.decls.display === "contents");

  it("a plain grouping <div> is display: contents in every grid and row layout", () => {
    const selectors = contents.flatMap((r) => r.selectors);
    for (const layout of [
      '[data-ui="key-value"][data-variant="horizontal"]',
      '[data-ui="key-value"]:not([data-variant])',
      '[data-ui="key-value"][data-variant="inline"]',
      '[data-ui="key-value"][data-cols]',
    ]) {
      expect(selectors, layout).toContain(`${layout} > :where(div:not([data-ui]))`);
    }
  });

  it("leaves the vertical variant's group box alone, and never a nested component", () => {
    for (const sel of contents.flatMap((r) => r.selectors)) {
      expect(sel).not.toContain('data-variant="vertical"');
      expect(sel).toContain(":not([data-ui])");
    }
  });
});
