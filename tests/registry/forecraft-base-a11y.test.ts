// A protocol-clean visually-hidden helper, a skip link, and no rhythm gap
// under the header (forecraft #31, #8, #22).
//
// #31 — `.sr-only` was the only visually-hidden helper, and `class` is a
//        `no-class-attribute` warning: the one sanctioned helper could not be
//        written cleanly. `data-ui="visually-hidden"` is now a base-layer value
//        (derived from reset.css, like `prose`), `.sr-only` its alias.
// #8  — no skip link anywhere. `skip-link` is a primitive (a base-layer value
//        takes no variants, so "hidden until focus" cannot be a variant of
//        visually-hidden), and site-header's reference markup opens with one.
// #22 — `body` is a flow root, so `--flow-space` opened a band between a
//        site-header and `main`.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/html-audit";
import { baseLayerUiValues, baseLayerValueBlurb, loadBaseLayer } from "../../src/base-layer";
import { knownUiValues, loadRegistryManifestMap } from "../../src/utils/components";
import { REGISTRY, registryCss, rulesFor, splitSelectors } from "./forecraft-css";

const manifests = await loadRegistryManifestMap(REGISTRY);
const known = knownUiValues(REGISTRY);
const audit = (html: string) => auditHtmlSource({ source: html, manifests, knownUiValues: known });

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

describe("visually-hidden (forecraft #31)", () => {
  const reset = registryCss("base/reset.css");

  it("is one rule with the .sr-only alias", () => {
    const rule = rulesFor(reset, '[data-ui="visually-hidden"]')[0];
    expect(rule, "reset.css styles [data-ui=visually-hidden]").toBeDefined();
    expect(rule.selectors).toContain(".sr-only");
    expect(rule.decls.position).toBe("absolute");
    expect(rule.decls["clip-path"]).toBe("inset(50%)");
    expect(rule.decls["white-space"]).toBe("nowrap");
    // Hidden from sight, never from the accessibility tree.
    expect(rule.decls.display).toBeUndefined();
    expect(rule.decls.visibility).toBeUndefined();
  });

  it("is a base-layer value with a blurb of its own, so every surface documents it", () => {
    const files = loadBaseLayer(REGISTRY);
    expect(baseLayerUiValues(files)).toContain("visually-hidden");
    const resetFile = files.find((f) => f.file === "reset.css")!;
    expect(resetFile.defines).toEqual(["visually-hidden"]);
    const blurb = baseLayerValueBlurb(resetFile, "visually-hidden");
    expect(blurb).not.toBe(resetFile.blurb);
    expect(blurb).toContain("screen reader");
    // prose keeps its file's header blurb.
    const proseFile = files.find((f) => f.file === "prose.css")!;
    expect(baseLayerValueBlurb(proseFile, "prose")).toBe(proseFile.blurb);
  });

  it("audits clean where the class alias warns", () => {
    const attr = audit('<main><button data-ui="button">✕<span data-ui="visually-hidden">Close</span></button></main>');
    expect(attr.filter((r) => r.rule_id === "unknown-component" || r.rule_id === "no-class-attribute")).toEqual([]);
    const cls = audit('<main><button data-ui="button">✕<span class="sr-only">Close</span></button></main>');
    expect(cls.some((r) => r.rule_id === "no-class-attribute")).toBe(true);
  });
});

describe("skip-link (forecraft #8)", () => {
  const css = registryCss("primitives/skip-link/skip-link.css");
  const manifest = manifests.get("skip-link")!;

  it("is a registry primitive with an a11y contract", () => {
    expect(manifest).toBeDefined();
    expect(manifest.kind).toBe("primitive");
    expect(manifest.anatomy.tag).toBe("a");
    expect((manifest.a11y.required_attrs ?? []).join(" ")).toContain("href");
    expect((manifest.a11y as { notes?: string }).notes).toContain(":focus");
    expect(Object.keys(manifest.a11y.keyboard ?? {})).toEqual(["Tab", "Enter"]);
  });

  it("is out of the flow and above everything when shown", () => {
    const root = rulesFor(css, '[data-ui="skip-link"]')[0];
    expect(root.decls.position).toBe("absolute");
    expect(root.decls["z-index"]).toBe("var(--z-max)");
    expect(root.decls["inset-block-start"]).toBeDefined();
    expect(root.decls["inset-inline-start"]).toBeDefined();
  });

  it("is clipped, not removed, until it has focus — :focus, not only :focus-visible", () => {
    const hidden = rulesFor(css, '[data-ui="skip-link"]:not(:focus)')[0];
    expect(hidden, "a :not(:focus) rule hides it").toBeDefined();
    expect(hidden.decls["clip-path"]).toBe("inset(50%)");
    expect(hidden.decls["inline-size"]).toBe("1px");
    for (const rule of css) {
      expect(rule.decls.display, rule.selectors.join(", ")).not.toBe("none");
      expect(rule.decls.visibility, rule.selectors.join(", ")).toBeUndefined();
    }
  });

  it("does not move, so there is no motion to reduce", () => {
    for (const rule of css) {
      expect(rule.decls.transition).toBeUndefined();
      expect(rule.decls.animation).toBeUndefined();
    }
  });

  it("its reference fragment audits clean", () => {
    const html = readFileSync(join(REGISTRY, "primitives/skip-link/skip-link.html"), "utf8");
    expect(audit(html).filter((r) => r.severity !== "info")).toEqual([]);
  });
});

describe("site-header opens with the skip link (forecraft #8)", () => {
  const html = readFileSync(join(REGISTRY, "patterns/site-header/site-header.html"), "utf8");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const headers = [...doc.querySelectorAll('[data-ui="site-header"]')];

  it("makes it the first tab stop of the page's header", () => {
    const first = headers[0].querySelector(FOCUSABLE)!;
    expect(first.getAttribute("data-ui")).toBe("skip-link");
    expect(first.getAttribute("href")).toBe("#main");
    expect(first.textContent?.trim()).toBe("Skip to content");
    // A nested primitive, not a part of the header.
    expect(first.hasAttribute("data-part")).toBe(false);
    expect(first.parentElement === headers[0]).toBe(true);
  });

  it("writes one per page — only the first reference header carries it", () => {
    expect(doc.querySelectorAll('[data-ui="skip-link"]').length).toBe(1);
  });

  it("puts it first in the template too, and declares the composition", () => {
    const m = manifests.get("site-header")!;
    const tpl = new DOMParser().parseFromString(m.templates.html, "text/html");
    const first = tpl.querySelector('[data-ui="site-header"]')!.querySelector(FOCUSABLE)!;
    expect(first.getAttribute("data-ui")).toBe("skip-link");
    expect(m.composition.contains).toContain("skip-link");
    expect((m.a11y.required_attrs ?? []).some((a) => a.includes("skip link"))).toBe(true);
  });
});

describe("no rhythm gap under the header (forecraft #22)", () => {
  const rules = registryCss("base/rhythm.css");
  const exception = rules.find((r) => r.decls["margin-block-start"] === "0");

  it("zeroes the flow margin on whatever follows a site-header or a skip link", () => {
    expect(exception, "rhythm.css carries the chrome exception").toBeDefined();
    expect(exception!.at).toBe("");
    expect(exception!.selectors).toHaveLength(1);
    const sel = exception!.selectors[0];
    expect(sel.startsWith(':where([data-ui="site-header"], [data-ui="skip-link"]) + :where(')).toBe(true);
  });

  it("spaces the same participants as the rhythm rule, at zero weight, after it", () => {
    const main = rules[0];
    const participants = (sel: string) => {
      const m = /\+ :where\(([^)]*)\)/.exec(sel)!;
      return splitSelectors(m[1]);
    };
    expect(participants(exception!.selectors[0])).toEqual(participants(main.selectors[0]));
    expect(rules.indexOf(exception!)).toBeGreaterThan(0);
    // Every compound sits in :where(), so the rule weighs (0,0,0) and an authored margin wins.
    const bare = exception!.selectors[0].replace(/:where\((?:[^()]|\([^()]*\))*\)/g, "").replace(/[\s+]/g, "");
    expect(bare).toBe("");
  });
});
