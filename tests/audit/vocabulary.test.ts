// The silent-failure rules (task W2-2).
//
// Six mistakes an agent makes by natural extrapolation produced no error, no
// warning and no console output anywhere. Each row of the readiness table gets a
// case here, and — just as important — so does the correct markup next to it:
// a rule that fires on `data-cols-md="6"` is worse than no rule, because it
// teaches its reader to stop reading the output.

import { describe, it, expect, beforeAll } from "bun:test";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/html-audit";
import { loadManifest, type Manifest } from "../../src/manifest";
import {
  ATTRIBUTE_VOCABULARY_RULE,
  DIRECTIVE_NAME_RULE,
  PART_ELEMENT_RULE,
  UNKNOWN_ATTRIBUTE_RULE,
} from "../../src/audit/vocabulary";

const ROOT = join(import.meta.dir, "../..");

/** Every registry manifest, the way a project with everything installed holds them. */
const manifests = new Map<string, Manifest>();

beforeAll(async () => {
  for (const layer of ["primitives", "recipes", "patterns"]) {
    const base = join(ROOT, "registry", layer);
    for (const name of readdirSync(base)) {
      const path = join(base, name, `${name}.manifest.json`);
      if (existsSync(path)) manifests.set(name, await loadManifest(path));
    }
  }
});

function audit(source: string) {
  return auditHtmlSource({ source, file: "page.html", manifests });
}

/** Findings for one rule, as messages — the shape an assertion reads best. */
function messages(source: string, ruleId: string): string[] {
  return audit(source)
    .filter((r) => r.rule_id === ruleId)
    .map((r) => r.message);
}

// ── the six rows of the readiness table ─────────────────────────────────────

describe("W2-2 · the six confirmed-silent mistakes now report", () => {
  it('data-span-lg="6" — an invented suffix on a prop that is not responsive', () => {
    const found = messages(
      `<div data-ui="grid" data-cols="3"><div data-span-lg="6">cell</div></div>`,
      ATTRIBUTE_VOCABULARY_RULE.id,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("data-span is not responsive");
    expect(found[0]).toContain("Write data-span instead");
  });

  it('data-gap="7" — a value outside a declared enum', () => {
    const found = messages(
      `<div data-ui="grid" data-cols="3" data-gap="7"></div>`,
      ATTRIBUTE_VOCABULARY_RULE.id,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('Invalid value "7" for data-gap');
    expect(found[0]).toContain("0, 1, 2, 3, 4, 6, 8, 10, 12, 16");
  });

  it('data-variant-md="ghost" — a tier suffix on one of the five', () => {
    const found = messages(
      `<button data-ui="button" data-variant-md="ghost">Go</button>`,
      ATTRIBUTE_VOCABULARY_RULE.id,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("never take a breakpoint suffix");
    expect(found[0]).toContain("Write data-variant");
  });

  it('l-tex="v" — a misspelled directive name, with the correction', () => {
    const found = messages(
      `<div l-data="{ v: 1 }"><span l-tex="v"></span></div>`,
      DIRECTIVE_NAME_RULE.id,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("Unknown directive l-tex");
    expect(found[0]).toContain("Did you mean l-text?");
  });

  it('<span data-part="title"> where the manifest requires a heading', () => {
    const found = messages(
      `<div data-ui="card">
         <div data-part="header"><span data-part="title">Title</span></div>
         <div data-part="body">Body</div>
       </div>`,
      PART_ELEMENT_RULE.id,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("is a <span>; the manifest names <h3>");
    expect(found[0]).toContain("document outline");
  });

  it("@click.debounce.500ms — the docs' own documented footgun, once", () => {
    const found = messages(
      `<div l-data="{ n: 0 }"><button @click.debounce.500ms="n++">go</button></div>`,
      DIRECTIVE_NAME_RULE.id,
    );
    // Exactly one finding: the stray time must not ALSO be reported as an
    // unknown modifier, or the real message is buried next to a wrong one.
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("is two modifiers, and the time is ignored");
    expect(found[0]).toContain("Fuse them: .debounce500ms");
  });
});

// ── correct markup stays silent ─────────────────────────────────────────────

describe("W2-2 · correct markup produces nothing", () => {
  const clean = [
    ["a full responsive grid", `<div data-ui="grid" data-cols="1" data-cols-md="2" data-cols-xl="3" data-gap="4"><div data-span="2">a</div></div>`],
    ["a fused debounce time", `<div l-data="{ n: 0 }"><button @click.debounce500ms="n++">go</button></div>`],
    ["a key modifier", `<div l-data="{ n: 0 }"><input @keydown.enter="n++"></div>`],
    ["an l-source with a dotted poll interval", `<div l-data="{}" l-source:t.poll.5000="/api/t"></div>`],
    ["an l-source with a dotted key name", `<div l-data="{}" l-source:t.key.uuid="/api/t"></div>`],
    ["a shorthand bind", `<div l-data="{ on: true }"><span :data-x="on"></span></div>`],
    ["a plugin directive", `<div l-data="{ open: false }"><div l-collapse="open">x</div></div>`],
    ["l-validate with a custom validator suffix", `<form l-validate><input l-validate:company="ok(value)"></form>`],
  ] as const;

  for (const [label, source] of clean) {
    it(label, () => {
      const found = audit(source).filter((r) =>
        [ATTRIBUTE_VOCABULARY_RULE.id, UNKNOWN_ATTRIBUTE_RULE.id, DIRECTIVE_NAME_RULE.id, PART_ELEMENT_RULE.id].includes(
          r.rule_id,
        ),
      );
      expect(found.map((r) => `${r.rule_id}: ${r.message}`)).toEqual([]);
    });
  }
});

// ── the false positives these rules had to be narrowed past ─────────────────
//
// Each of these was a finding on Faqir's own shipped markup before the rule was
// scoped. They are here so a future widening has to argue with a test.

describe("W2-2 · what these rules deliberately do NOT report", () => {
  it("an application's own data-* hooks — data-* is the platform's extension point", () => {
    const found = messages(
      `<main data-ui="surface" data-docs-page data-theme-select><p data-docs-token-preview="x">t</p></main>`,
      UNKNOWN_ATTRIBUTE_RULE.id,
    );
    expect(found).toEqual([]);
  });

  it("data-gap on a flow root — a base-layer rhythm attribute, not a component one", () => {
    expect(messages(`<main data-ui="surface" data-size="md" data-gap="4">x</main>`, UNKNOWN_ATTRIBUTE_RULE.id)).toEqual([]);
    expect(messages(`<section data-gap="6">x</section>`, UNKNOWN_ATTRIBUTE_RULE.id)).toEqual([]);
  });

  it("a layout primitive's attribute on its CHILD, where the child is a component", () => {
    // `cluster` declares `data-push`; the child that carries it is a button.
    const found = messages(
      `<div data-ui="cluster"><button data-ui="button" data-push>Right</button></div>`,
      UNKNOWN_ATTRIBUTE_RULE.id,
    );
    expect(found).toEqual([]);
  });

  it("a presentational tag_hint — <div> for a <span> is the author's call", () => {
    const found = messages(
      `<div data-ui="stat"><div data-part="value">42</div><div data-part="label">Users</div></div>`,
      PART_ELEMENT_RULE.id,
    );
    expect(found).toEqual([]);
  });

  it("an aria-hidden placeholder where the hint names a button", () => {
    const found = messages(
      `<table data-ui="table"><tbody><tr data-part="tr"><td data-part="td"><span data-part="expander" aria-hidden="true"></span>Leaf</td></tr></tbody></table>`,
      PART_ELEMENT_RULE.id,
    );
    expect(found).toEqual([]);
  });

  it("a part inside a component whose manifest the caller does not hold", () => {
    // `radio-label` has no manifest; attributing its `label` part outward to
    // `field-group` reported correct markup against the wrong contract.
    const found = messages(
      `<div data-ui="field-group">
         <div data-ui="radio-group"><label data-ui="radio-label"><input type="radio"><span data-part="label">one</span></label></div>
       </div>`,
      PART_ELEMENT_RULE.id,
    );
    expect(found).toEqual([]);
  });

  it("a <legend> filling a heading slot — it names its fieldset", () => {
    const found = messages(
      `<fieldset data-ui="card"><legend data-part="title">Address</legend><div data-part="body">x</div></fieldset>`,
      PART_ELEMENT_RULE.id,
    );
    expect(found).toEqual([]);
  });
});

// ── what unknown-attribute IS for ───────────────────────────────────────────

describe("unknown-attribute · the two shapes it reports", () => {
  it("a near-miss of an attribute the component declares", () => {
    const found = messages(`<div data-ui="grid" data-colls="3"></div>`, UNKNOWN_ATTRIBUTE_RULE.id);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("Did you mean data-cols?");
  });

  it("a real Faqir attribute owned by a different component", () => {
    const found = messages(`<div data-ui="stack" data-min="8"></div>`, UNKNOWN_ATTRIBUTE_RULE.id);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("grid");
    expect(found[0]).toContain("stack does not declare it");
  });
});

// ── directive-name, beyond the misspelling ──────────────────────────────────

describe("directive-name · arguments, modifiers and empty expressions", () => {
  it("l-bind without its attribute argument", () => {
    const found = messages(`<div l-data="{}"><span l-bind="x"></span></div>`, DIRECTIVE_NAME_RULE.id);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("needs an argument");
  });

  it("an argument on a directive that takes none", () => {
    const found = messages(`<div l-data="{}"><span l-text:x="v"></span></div>`, DIRECTIVE_NAME_RULE.id);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("takes no argument");
  });

  it("an unknown modifier, with the accepted set spelled out", () => {
    const found = messages(`<div l-data="{ n: 0 }"><button @click.preventt="n++">go</button></div>`, DIRECTIVE_NAME_RULE.id);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("Unknown modifier .preventt");
    expect(found[0]).toContain("Did you mean .prevent?");
  });

  it("a time fused onto a modifier that reads none", () => {
    const found = messages(`<div l-data="{ v: '' }"><input l-model.debounce500ms="v"></div>`, DIRECTIVE_NAME_RULE.id);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("takes no time");
  });

  it("an empty expression on a directive that needs one", () => {
    const found = messages(`<div l-data="{}"><span l-text=""></span></div>`, DIRECTIVE_NAME_RULE.id);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("binds nothing");
  });

  it("says nothing about l-cloak, which legitimately has no expression", () => {
    expect(messages(`<div l-data="{}"><span l-cloak></span></div>`, DIRECTIVE_NAME_RULE.id)).toEqual([]);
  });
});
