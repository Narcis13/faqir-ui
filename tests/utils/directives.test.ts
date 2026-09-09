// Drift gate for `src/utils/directives.ts` (task W2-2).
//
// The audit's `directive-name` rule is only as good as the vocabulary it holds,
// and that vocabulary is a hand-written copy of what the engine implements —
// necessarily, because `src/audit/**` bundles for the browser and cannot read
// the engine off disk. So the copy is held against the original here, in BOTH
// directions: a directive added to the engine and not to the module would make
// correct markup report as unknown, and one removed from the engine and left in
// the module would let a dead attribute pass.
//
// The engine's own `@ui:directive` / `@ui:modifier` lines are the source (they
// already drive `references/directives.md`), and `KEY_MAP` is read as the code
// it is.

import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseEngineMap, parseEngineVocabulary } from "../../src/generator/skill";
import {
  CORE_DIRECTIVES,
  KEY_MODIFIERS,
  PLUGIN_DIRECTIVES,
  directiveByName,
  parseDirectiveName,
  splitTimedModifier,
} from "../../src/utils/directives";

const ROOT = join(import.meta.dir, "../..");
const engineSource = readFileSync(join(ROOT, "src/core-src/engine.js"), "utf8");
const vocabulary = parseEngineVocabulary(engineSource);

describe("core directives match the engine's own declarations", () => {
  it("declares exactly the directives the engine does", () => {
    const engine = vocabulary.directives
      .filter((d) => d.placement !== "internal")
      .map((d) => d.name.replace(/^l-/, ""))
      .sort();
    expect(CORE_DIRECTIVES.map((d) => d.name).sort()).toEqual(engine);
  });

  it("records the same argument shape the engine's attribute spells", () => {
    for (const declared of vocabulary.directives) {
      const name = declared.name.replace(/^l-/, "");
      const spec = directiveByName(name);
      if (!spec) continue;
      expect({ name, arg: spec.arg }).toEqual({
        name,
        arg: declared.attribute.includes(":<") ? "required" : "none",
      });
    }
  });

  it("records the same shorthand the engine's declaration does", () => {
    for (const declared of vocabulary.directives) {
      const spec = directiveByName(declared.name.replace(/^l-/, ""));
      if (!spec) continue;
      const engineShorthand = declared.shorthand === "—" ? null : declared.shorthand.replace(/<.*>$/, "");
      expect(spec.shorthand).toBe(engineShorthand);
    }
  });

  it("declares exactly the modifiers the engine does, per directive", () => {
    const byDirective = new Map<string, string[]>();
    for (const m of vocabulary.modifiers) {
      const name = m.directive.replace(/^l-/, "");
      const list = byDirective.get(name) ?? [];
      list.push(m.modifier.replace(/^\./, ""));
      byDirective.set(name, list);
    }
    for (const [name, modifiers] of byDirective) {
      const spec = directiveByName(name);
      expect(spec, `the engine declares modifiers for l-${name}`).not.toBeNull();
      expect([...spec!.modifiers].sort()).toEqual(modifiers.sort());
    }
    // …and nothing claims modifiers the engine never declared.
    for (const spec of CORE_DIRECTIVES) {
      if (spec.modifiers.length === 0) continue;
      expect(byDirective.has(spec.name), `l-${spec.name} declares modifiers`).toBe(true);
    }
  });

  it("declares exactly the key modifiers KEY_MAP defines", () => {
    const keys = parseEngineMap(engineSource, "KEY_MAP").map(([k]) => k);
    expect(keys.length).toBeGreaterThan(0);
    expect([...KEY_MODIFIERS].sort()).toEqual(keys.sort());
  });
});

describe("plugin directives match the shipped plugins", () => {
  it("names every plugin that ships an l-* directive, and only those", () => {
    const dir = join(ROOT, "registry/core/plugins");
    const shipped: { plugin: string; directive: string }[] = [];
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".js")) continue;
      const source = readFileSync(join(dir, file), "utf8");
      const plugin = /@ui:plugin\s+(\S+)/.exec(source)?.[1];
      const provides = /@ui:provides\s+(.+)/.exec(source)?.[1] ?? "";
      for (const token of provides.split(/[\s,]+/)) {
        if (token.startsWith("l-")) shipped.push({ plugin: plugin!, directive: token.slice(2) });
      }
    }
    expect(shipped.length).toBeGreaterThan(0);
    expect(
      PLUGIN_DIRECTIVES.map((d) => ({ plugin: d.plugin!, directive: d.name })).sort((a, b) =>
        a.directive.localeCompare(b.directive),
      ),
    ).toEqual(shipped.sort((a, b) => a.directive.localeCompare(b.directive)));
  });
});

describe("parseDirectiveName reads an attribute the way the engine does", () => {
  const cases: [string, { name: string; arg: string | null; modifiers: string[] } | null][] = [
    ["l-text", { name: "text", arg: null, modifiers: [] }],
    ["l-bind:class", { name: "bind", arg: "class", modifiers: [] }],
    [":class", { name: "bind", arg: "class", modifiers: [] }],
    ["l-on:click.prevent", { name: "on", arg: "click", modifiers: ["prevent"] }],
    ["@click.debounce.500ms", { name: "on", arg: "click", modifiers: ["debounce", "500ms"] }],
    ["l-source:tasks.poll.5000", { name: "source", arg: "tasks", modifiers: ["poll", "5000"] }],
    ["l-model.number.trim", { name: "model", arg: null, modifiers: ["number", "trim"] }],
    // The engine takes everything up to the first dot as the type, colon
    // included — which is exactly why `l-validate:company` dispatches on
    // nothing and the plugin has to read those attributes itself.
    ["l-validate:company", { name: "validate", arg: "company", modifiers: [] }],
    ["class", null],
    ["data-ui", null],
  ];

  for (const [attr, expected] of cases) {
    it(attr, () => {
      const parsed = parseDirectiveName(attr);
      if (expected === null) {
        expect(parsed).toBeNull();
        return;
      }
      expect({ name: parsed!.name, arg: parsed!.arg, modifiers: parsed!.modifiers }).toEqual(expected);
    });
  }
});

describe("splitTimedModifier reads a fused time the way parseTimeMod does", () => {
  it("reads ms and s, and rejects a bare number", () => {
    expect(splitTimedModifier("debounce500ms")).toEqual({ base: "debounce", ms: 500 });
    expect(splitTimedModifier("throttle2s")).toEqual({ base: "throttle", ms: 2000 });
    expect(splitTimedModifier("debounce500")).toEqual({ base: "debounce", ms: 500 });
    expect(splitTimedModifier("500ms")).toBeNull();
    expect(splitTimedModifier("prevent")).toBeNull();
  });
});
