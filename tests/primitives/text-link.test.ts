// Text: an anchor carrying `data-ui="text"` reads as a link — task 1.1F-18.
//
// `base/reset.css` sets every `a` to `color: inherit; text-decoration: inherit`,
// and text.css gave an anchor nothing back, so `<a data-ui="text" href>` — the
// natural element for an id, a ref or a version in a table — could not be told
// from the text beside it. The `link` primitive is not the answer for those: it
// has no mono or size variant and paints itself primary, which turns a table of
// ids blue throughout.
//
// One rule gives the anchor its underline back and nothing else: the text keeps
// its own colour, variant and size. It selects on `:any-link`, not on `[href]`,
// so no new attribute enters the component's contract (SPEC-1.0 §3.2).
//
// These are stylesheet assertions on purpose — happy-dom computes no cascade
// worth trusting here. The computed result is pinned in Chromium by
// `tests/visual/variant-consistency.pw.ts`.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";

const REGISTRY = join(import.meta.dir, "../..", "registry");

function read(name: string, ext: string): string {
  return readFileSync(join(REGISTRY, "primitives", name, `${name}.${ext}`), "utf8");
}

function css(name: string): string {
  return read(name, "css").replace(/\/\*[^]*?\*\//g, "");
}

interface Rule {
  decls: Record<string, string>;
  body: string;
  /** Offset of the rule in the comment-stripped sheet — source order. */
  at: number;
}

/** The one rule whose selector list is exactly `selector`. */
function ruleOf(sheet: string, selector: string): Rule {
  const found: Rule[] = [];
  for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].trim().replace(/\s+/g, " ") !== selector) continue;
    const decls: Record<string, string> = {};
    for (const decl of m[2].split(";")) {
      const colon = decl.indexOf(":");
      if (colon !== -1) decls[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim();
    }
    found.push({ decls, body: m[2], at: m.index ?? -1 });
  }
  expect(found.length, `exactly one rule for ${selector}`).toBe(1);
  return found[0];
}

const tokensIn = (body: string): string[] =>
  [...body.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]).sort();

const TEXT = css("text");
const LINK = '[data-ui="text"]:any-link';
const FOCUS = '[data-ui="text"]:any-link:focus-visible';
const DONE = '[data-ui="text"][data-state="done"]';

describe("text — an anchor reads as a link", () => {
  it("gives a linked text its underline back, from the link tokens", () => {
    expect(ruleOf(TEXT, LINK).decls).toEqual({
      "text-decoration-line": "var(--link-decoration)",
      "text-decoration-thickness": "var(--link-thickness)",
      "text-underline-offset": "var(--link-underline-offset)",
      "text-decoration-color": "currentColor",
      cursor: "pointer",
    });
  });

  it("leaves the colour to the text — a table of id links does not turn primary", () => {
    const link = ruleOf(TEXT, LINK);
    expect(link.decls.color).toBeUndefined();
    expect(link.decls["font-family"]).toBeUndefined();
    expect(link.decls["font-size"]).toBeUndefined();
  });

  it("underlines in the text's own colour, never the ungated faint foreground", () => {
    // `--color-fg-subtle` is reserved for decoration and is not contrast-gated;
    // the downstream's underline in it was too faint to read as a link in dark.
    expect(TEXT).not.toContain("--color-fg-subtle");
    expect(TEXT).not.toContain("--color-border");
  });

  it("draws the same focus ring the link primitive draws", () => {
    const focus = ruleOf(TEXT, FOCUS);
    expect(focus.decls).toEqual(ruleOf(css("link"), '[data-ui="link"]:focus-visible').decls);
    expect(focus.decls.outline).toBe(
      "var(--focus-ring-width) var(--focus-ring-style) var(--focus-ring-color)",
    );
  });

  it("reads only link and focus tokens in the two rules", () => {
    expect(tokensIn(ruleOf(TEXT, LINK).body)).toEqual([
      "link-decoration",
      "link-thickness",
      "link-underline-offset",
    ]);
    expect(tokensIn(ruleOf(TEXT, FOCUS).body)).toEqual([
      "focus-ring-color",
      "focus-ring-offset",
      "focus-ring-style",
      "focus-ring-width",
      "focus-shadow",
    ]);
  });

  it("comes before the done state, so a done link keeps its strikethrough", () => {
    // Both selectors are (0,2,0); the later one wins, and the done rule's
    // `text-decoration` shorthand resets the line the link rule set.
    const done = ruleOf(TEXT, DONE);
    expect(ruleOf(TEXT, LINK).at).toBeLessThan(done.at);
    expect(ruleOf(TEXT, FOCUS).at).toBeLessThan(done.at);
    expect(done.decls["text-decoration"]).toBe("line-through");
  });

  it("selects on no attribute — nothing new to declare under SPEC §3.2", () => {
    // `:any-link` is the anchor having an href, stated as a pseudo-class. An
    // `[href]` selector would be an attribute the manifest has to declare.
    expect(TEXT).not.toContain("[href");
    expect(TEXT).not.toMatch(/(^|[\s,>+~])a[[:]/m);
    expect([...TEXT.matchAll(/:any-link/g)].length).toBe(2);
  });

  it("leaves headings alone — only text opts in", () => {
    expect(TEXT).not.toContain('[data-ui="heading"]:any-link');
  });
});

describe("text — the manifest and the reference say so", () => {
  const m = JSON.parse(read("text", "manifest.json")) as Manifest;

  it("ships a link template: an anchor root with an href", () => {
    expect(validateManifest(m)).toEqual([]);
    const template = (m.templates as Record<string, string>).html_link;
    expect(template).toMatch(/^<a data-ui="text"[^>]* href="\{href\}"[^>]*>\{content\}<\/a>$/);
    // The plain template is untouched: a paragraph is still the default root.
    expect(m.templates.html).toMatch(/^<p data-ui="text"/);
    expect(m.anatomy.tag).toBe("p");
  });

  it("declares the tokens the two rules read", () => {
    for (const token of [
      "link-decoration",
      "link-thickness",
      "link-underline-offset",
      "focus-ring-width",
      "focus-ring-style",
      "focus-ring-color",
      "focus-ring-offset",
      "focus-shadow",
    ]) {
      expect(m.tokens_used, token).toContain(token);
    }
  });

  it("notes when to use it, and when the link primitive is the better fit", () => {
    const a11y = m.a11y as { notes?: string; keyboard?: Record<string, string> };
    expect(a11y.notes).toContain("href");
    expect(a11y.notes).toContain('data-ui="link"');
    expect(a11y.keyboard?.Enter).toBeDefined();
  });

  it("records the change as a non-breaking patch", () => {
    // The entry, not the current version: a later change bumps the manifest.
    const entry = (m.changes ?? []).find((c) => c.version === "1.1.3");
    expect(entry?.breaking).toBe(false);
    expect(entry?.note).toContain(":any-link");
    expect(entry?.note).toContain("html_link");
  });

  it("demonstrates a linked text in the canonical reference", () => {
    const html = read("text", "html");
    expect(html).toMatch(/<a data-ui="text"[^>]* href="[^"]+"/);
    // …including the case the rule order exists for.
    expect(html).toMatch(/<a data-ui="text"[^>]*data-state="done"[^>]* href=|<a data-ui="text"[^>]* href="[^"]+"[^>]*data-state="done"/);
  });
});
