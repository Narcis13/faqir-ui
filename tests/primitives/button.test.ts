// Button: the pressed state, and link + size — task 1.1F-17.
//
// Two defects, both about a rule that was not there.
//
// **Pressed.** A button carrying `aria-pressed="true"` looked exactly like one
// carrying `"false"`: button.css had no rule for it, and the manifest no state.
// Pages hand-rolled the style (the docs site did, three times). The state is now
// styled for the unfilled variants — default, outline, ghost — and declared,
// which SPEC-1.0 §3.2 requires of any attribute a stylesheet selects on.
//
// **Link + size.** `[data-variant="link"]` and `[data-size="sm"]` have the same
// specificity and the size rule comes later, so a small link button got a
// control's height and inline padding back (32px tall, 12px padding). One rule
// after the sizes puts the two together.
//
// These are stylesheet assertions on purpose — happy-dom computes no cascade
// worth trusting here. The computed result is pinned in Chromium by
// `tests/visual/variant-consistency.pw.ts`.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";

const REGISTRY = join(import.meta.dir, "../..", "registry");

function css(name: string): string {
  return readFileSync(join(REGISTRY, "primitives", name, `${name}.css`), "utf8").replace(
    /\/\*[^]*?\*\//g,
    "",
  );
}

function manifest(name: string): Manifest {
  return JSON.parse(
    readFileSync(join(REGISTRY, "primitives", name, `${name}.manifest.json`), "utf8"),
  ) as Manifest;
}

interface Rule {
  selectors: string[];
  decls: Record<string, string>;
  /** Offset of the rule in the comment-stripped sheet — source order. */
  at: number;
}

/** Split a selector list on its top-level commas (not the ones inside `:where()`). */
function selectorList(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim().replace(/\s+/g, " "));
}

/** Every innermost `selector { decls }` rule, in source order, at-rule bodies included. */
function rules(sheet: string): Rule[] {
  const out: Rule[] = [];
  for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls: Record<string, string> = {};
    for (const decl of m[2].split(";")) {
      const colon = decl.indexOf(":");
      if (colon !== -1) decls[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim();
    }
    out.push({ selectors: selectorList(m[1]), decls, at: m.index! });
  }
  return out;
}

/** The one rule whose selector list is exactly `selectors`. */
function ruleFor(all: Rule[], ...selectors: string[]): Rule {
  const found = all.filter(
    (r) => r.selectors.length === selectors.length && r.selectors.every((s, i) => s === selectors[i]),
  );
  expect(found.length, `exactly one rule for ${selectors.join(", ")}`).toBe(1);
  return found[0];
}

/** The body of the `@media (forced-colors: active)` block. */
function forcedColorsBlock(sheet: string): string {
  const start = sheet.indexOf("@media (forced-colors: active)");
  expect(start, "a forced-colors block").not.toBe(-1);
  const end = sheet.indexOf("@media", start + 1);
  return sheet.slice(start, end === -1 ? undefined : end);
}

const UNFILLED =
  ':where(:not([data-variant]), [data-variant="default"], [data-variant="outline"], [data-variant="ghost"])';
const PRESSED = `[data-ui="button"][aria-pressed="true"]${UNFILLED}`;

describe("button — pressed (aria-pressed=\"true\")", () => {
  const BUTTON = css("button");
  const ALL = rules(BUTTON);

  it("styles the pressed state from the primary-subtle fill, not the secondary one", () => {
    const { decls } = ruleFor(ALL, PRESSED);
    expect(decls).toEqual({
      background: "var(--color-primary-subtle)",
      "border-color": "var(--color-primary)",
      color: "var(--color-primary)",
    });
    // `--color-secondary` is `--color-bg-subtle`: pressed would read as hover.
    expect(Object.values(decls).join(" ")).not.toContain("--color-secondary");
  });

  it("covers default (with and without the attribute), outline and ghost — and no filled variant", () => {
    const selector = ruleFor(ALL, PRESSED).selectors[0];
    for (const covered of [
      ":not([data-variant])",
      '[data-variant="default"]',
      '[data-variant="outline"]',
      '[data-variant="ghost"]',
    ]) {
      expect(selector).toContain(covered);
    }
    for (const filled of ["primary", "secondary", "destructive", "link"]) {
      expect(selector).not.toContain(`[data-variant="${filled}"]`);
    }
    // No other rule gives a filled variant a pressed style behind the list's back.
    const pressedRules = ALL.filter((r) => r.selectors.some((s) => s.includes("aria-pressed")));
    for (const rule of pressedRules) {
      for (const s of rule.selectors) expect(s.startsWith(PRESSED)).toBe(true);
    }
  });

  it("has a :hover twin, so a pressed button under the pointer does not read as released", () => {
    const { decls } = ruleFor(ALL, `${PRESSED}:hover`);
    expect(decls.background).toBe("var(--color-primary-subtle)");
  });

  it("comes after every variant rule and before the loading rule", () => {
    const pressed = ruleFor(ALL, PRESSED).at;
    const twin = ruleFor(ALL, `${PRESSED}:hover`).at;
    // `:where()` adds nothing, so pressed ties a variant rule and must win on order.
    const variantRules = ALL.filter((r) =>
      r.selectors.some((s) => /^\[data-ui="button"\]\[data-variant="[a-z]+"\](:hover)?$/.test(s)),
    );
    expect(variantRules.length).toBe(12);
    for (const rule of variantRules) expect(rule.at).toBeLessThan(pressed);
    expect(twin).toBeGreaterThan(pressed);
    // Loading hides the label with `color: transparent`; pressed must not bring it back.
    expect(ruleFor(ALL, '[data-ui="button"][data-state="loading"]').at).toBeGreaterThan(twin);
  });

  it("is forced-colors aware: Highlight / HighlightText, on the rule and its :hover twin", () => {
    const block = forcedColorsBlock(BUTTON);
    const { decls } = ruleFor(rules(block), PRESSED, `${PRESSED}:hover`);
    expect(decls).toEqual({
      background: "Highlight",
      "border-color": "Highlight",
      color: "HighlightText",
    });
  });

  it("toggle gets the same forced-colors rule", () => {
    const block = forcedColorsBlock(css("toggle"));
    const { decls } = ruleFor(
      rules(block),
      '[data-ui="toggle"][aria-pressed="true"]',
      '[data-ui="toggle"][aria-pressed="true"]:hover',
    );
    expect(decls).toEqual({
      background: "Highlight",
      "border-color": "Highlight",
      color: "HighlightText",
    });
  });
});

describe("button — link variant under a size", () => {
  const ALL = rules(css("button"));

  it("keeps the text's own box: height auto, no inline padding", () => {
    const { decls } = ruleFor(ALL, '[data-ui="button"][data-variant="link"][data-size]');
    expect(decls).toEqual({ height: "auto", "padding-inline": "0" });
  });

  it("follows both size rules, which it has to override", () => {
    const link = ruleFor(ALL, '[data-ui="button"][data-variant="link"][data-size]').at;
    expect(link).toBeGreaterThan(ruleFor(ALL, '[data-ui="button"][data-size="sm"]').at);
    expect(link).toBeGreaterThan(ruleFor(ALL, '[data-ui="button"][data-size="lg"]').at);
  });

  it("leaves the size's font size alone", () => {
    const { decls } = ruleFor(ALL, '[data-ui="button"][data-variant="link"][data-size]');
    expect(decls["font-size"]).toBeUndefined();
  });
});

describe("button manifest — the pressed state is declared", () => {
  const m = manifest("button");

  it("is schema-valid, with a 1.2.0 changes entry for it", () => {
    expect(validateManifest(m)).toEqual([]);
    // 1.2.x or later: a later release bumps the version past the entry (1.1F-23
    // did with a patch, the data-effect prop with a minor).
    expect(m.version).toMatch(/^1\.[2-9]\.\d+$/);
    const entry = m.changes?.find((c) => c.version === "1.2.0");
    expect(entry?.note).toContain("pressed");
    expect(entry?.note).toContain("link");
    expect(entry?.breaking).toBe(false);
  });

  it("declares states.pressed off aria-pressed", () => {
    expect(m.states.pressed.attr).toBe("aria-pressed");
    expect(m.states.pressed.description).toContain("toggle primitive");
    // Not the default state: a plain button carries no aria-pressed at all.
    expect(m.states.pressed.default).toBeUndefined();
  });

  it("says what a toggle button needs: type=button, both values, a stable label", () => {
    const a11y = m.a11y as { required_attrs: string[]; notes: string };
    expect(a11y.required_attrs).toContain(
      'type="button" and aria-pressed="true|false" on a toggle button',
    );
    expect(a11y.notes).toContain('type="button"');
    expect(a11y.notes).toContain("The label must not change with the state");
  });

  it("ships an html_pressed template on a variant that has a pressed style", () => {
    const html = m.templates.html_pressed;
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-variant="outline"');
  });

  it("lists the token the pressed fill reads", () => {
    expect(m.tokens_used).toContain("color-primary-subtle");
  });

  it("shows the state in the canonical markup, on and off", () => {
    const html = readFileSync(join(REGISTRY, "primitives", "button", "button.html"), "utf8");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('data-variant="link" data-size="sm"');
    // Every example toggle button is type="button".
    for (const tag of html.match(/<button[^>]*aria-pressed[^>]*>/g) ?? []) {
      expect(tag).toContain('type="button"');
    }
  });

  it("toggle records its forced-colors fix", () => {
    const toggle = manifest("toggle");
    expect(toggle.version).toBe("1.1.1");
    expect(toggle.changes?.[0].version).toBe("1.1.1");
    expect(toggle.changes?.[0].note).toContain("Forced colors");
  });
});

describe("docs site — pressed buttons use button's own style", () => {
  const DOCS = readFileSync(join(import.meta.dir, "../..", "site/styles/docs.css"), "utf8").replace(
    /\/\*[^]*?\*\//g,
    "",
  );
  const ALL = rules(DOCS);

  it("no longer hand-rolls the preview-width or scheme pressed style", () => {
    const pressed = ALL.flatMap((r) => r.selectors).filter((s) => s.includes("aria-pressed"));
    expect(pressed).toEqual(['[data-ui="button"][data-theme-pick][aria-pressed="true"]']);
  });

  it("keeps the picked theme solid, level with button's pressed :hover twin", () => {
    // Three attribute selectors, as the twin has two plus :hover; docs.css loads later.
    const { decls } = ruleFor(ALL, '[data-ui="button"][data-theme-pick][aria-pressed="true"]');
    expect(decls.background).toBe("var(--color-primary)");
    expect(decls.color).toBe("var(--color-primary-fg)");
  });
});
