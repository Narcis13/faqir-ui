/**
 * `packages/core/faqir-core.d.ts` against the engine it describes.  [task 1.0-02 · §A6]
 *
 * The engine is hand-written JavaScript with no build step, so nothing emits
 * these declarations — they are written beside the code and can drift from it
 * silently. Two gates stop that, and this file is both:
 *
 *   1. DRIFT. Every name in the declaration is held against the thing that
 *      actually defines it — the live `Faqir` object, the live devtools handle,
 *      a live `inspect()` snapshot, the engine's `@ui:magic` declarations, the
 *      `ctrl` literal `l-source` injects, and each recipe's `@ui:provides`
 *      header. Both directions every time: a member the engine gained and a
 *      member declared here that the engine does not have fail alike.
 *
 *   2. USE. `tests/fixtures/types/` is compiled by `tsc` with the declaration
 *      on the path. Correct usage must compile; every `@ts-expect-error` line
 *      must actually error (an unused directive is itself a diagnostic). So a
 *      declaration loose enough to wave misuse through fails here too.
 *
 * The declaration is parsed with the TypeScript AST rather than a regex: the
 * interfaces nest, extend one another and carry doc comments full of the very
 * identifiers a regex would match.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { parseEngineVocabulary, parseSourceController } from "../../src/generator/skill";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const DTS = join(ROOT, "packages", "core", "faqir-core.d.ts");
const ENGINE_SRC = join(ROOT, "src", "core-src", "engine.js");
const RECIPES = join(ROOT, "registry", "recipes");

const Faqir = require("../../registry/core/faqir-core.js");

// ── reading the declaration ────────────────────────────────────────────────

interface Declared {
  members: string[];
  extends: string[];
  /** For `ControllerApis`-style maps: member name → the interface it points at. */
  refs: Map<string, string>;
}

/** Every `interface` in the .d.ts, by name, with its members and its heritage. */
function readInterfaces(source: string): Map<string, Declared> {
  const file = ts.createSourceFile(DTS, source, ts.ScriptTarget.ESNext, true);
  const out = new Map<string, Declared>();

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node)) {
      const members: string[] = [];
      const refs = new Map<string, string>();
      for (const member of node.members) {
        if (!member.name) continue;
        const name = ts.isStringLiteral(member.name) || ts.isIdentifier(member.name)
          ? member.name.text
          : null;
        if (name === null) continue;
        // Overloads (`controller`) declare the same name twice.
        if (!members.includes(name)) members.push(name);
        if (
          ts.isPropertySignature(member) &&
          member.type &&
          ts.isTypeReferenceNode(member.type) &&
          ts.isIdentifier(member.type.typeName)
        ) {
          refs.set(name, member.type.typeName.text);
        }
      }
      out.set(node.name.text, {
        members,
        extends: (node.heritageClauses ?? []).flatMap((clause) =>
          clause.types.map((t) => (ts.isIdentifier(t.expression) ? t.expression.text : "")),
        ).filter(Boolean),
        refs,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

const DECLARED = readInterfaces(readFileSync(DTS, "utf8"));

/** An interface's own members plus everything it inherits, sorted. */
function membersOf(name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const entry = DECLARED.get(name);
  if (!entry) throw new Error(`faqir-core.d.ts declares no interface "${name}"`);
  const all = new Set(entry.members);
  for (const parent of entry.extends) for (const m of membersOf(parent, seen)) all.add(m);
  return [...all].sort();
}

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();

// ── the fixture page every reflective assertion reads ──────────────────────

const PAGE = `
  <main id="app" l-data="{ title: 'Cart', qty: 2 }">
    <h1 l-text="title" data-part="heading"></h1>
    <button id="go" @click.prevent="qty++" :disabled="qty === 0">go</button>
    <div data-ui="tabs" data-variant="underline" data-size="sm" data-state="ready">
      <div data-part="list" role="tablist">
        <button data-part="trigger" role="tab" id="t1" aria-controls="p1" aria-selected="true">One</button>
      </div>
      <div data-part="panel" role="tabpanel" id="p1" aria-labelledby="t1">first</div>
    </div>
  </main>
`;

function mount(): void {
  document.body.innerHTML = PAGE;
  Faqir.start();
}

// ── 1. the Faqir global ────────────────────────────────────────────────────

describe("FaqirGlobal matches the live engine", () => {
  it("declares exactly the keys the engine exposes", () => {
    expect(sorted(Object.keys(Faqir))).toEqual(membersOf("FaqirGlobal"));
  });

  it("is not vacuous — the surface is the documented one", () => {
    // A parser that silently returned nothing would pass the equality above
    // against an engine that also returned nothing. Pin the shape once.
    expect(membersOf("FaqirGlobal")).toContain("inspect");
    expect(membersOf("FaqirGlobal")).toContain("plugin");
    expect(membersOf("FaqirGlobal").length).toBeGreaterThanOrEqual(19);
  });

  it("declares every member as the kind the engine implements", () => {
    for (const key of membersOf("FaqirGlobal")) {
      const expected = key === "version" ? "string" : key === "devtools" ? "object" : "function";
      expect(typeof (Faqir as Record<string, unknown>)[key], `Faqir.${key}`).toBe(expected);
    }
  });
});

// ── 2. the devtools handle ─────────────────────────────────────────────────

describe("Devtools matches window.__FAQIR_DEVTOOLS__", () => {
  it("declares exactly the handle's keys", () => {
    expect(sorted(Object.keys(Faqir.devtools))).toEqual(membersOf("Devtools"));
  });

  it("declares the handle's four diagnostic classes and no others", () => {
    const source = readFileSync(DTS, "utf8");
    const union = /kind:\s*([^;]+);/.exec(source)?.[1] ?? "";
    const declared = sorted([...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]));
    // The dev build's `devReport(kind, …)` call sites are the definition.
    const dev = readFileSync(join(ROOT, "src", "core-src", "dev-diagnostics.js"), "utf8");
    const emitted = sorted(
      [...dev.matchAll(/devReport\(\s*'([a-z]+)'/g)].map((m) => m[1]),
    );
    expect(emitted.length).toBe(4);
    expect(declared).toEqual(emitted);
  });

  it("declares the entry shapes scopes() and components() return", () => {
    mount();
    const scope = Faqir.devtools.scopes()[0];
    const component = Faqir.devtools.components()[0];
    expect(scope, "the fixture page must produce at least one scope").toBeDefined();
    expect(component, "the fixture page must produce at least one component").toBeDefined();
    expect(sorted(Object.keys(scope))).toEqual(membersOf("DevtoolsScope"));
    expect(sorted(Object.keys(component))).toEqual(membersOf("DevtoolsComponent"));
  });
});

// ── 3. inspect() ───────────────────────────────────────────────────────────

describe("Inspection matches what inspect() returns", () => {
  it("declares the snapshot's keys, its protocol block and its controller block", () => {
    mount();
    const snapshot = Faqir.inspect("#go");
    expect(sorted(Object.keys(snapshot))).toEqual(membersOf("Inspection"));
    expect(sorted(Object.keys(snapshot.state))).toEqual(membersOf("ProtocolState"));

    const withController = Faqir.inspect("[data-part='panel']");
    expect(withController.controller).not.toBeNull();
    expect(sorted(Object.keys(withController.controller))).toEqual(["api", "el", "methods", "ui"]);
  });

  it("declares the directive shape, with arg normalized only on the snapshot", () => {
    mount();
    // `@click.prevent` — the shorthand `l-on` form, which DOES carry an arg.
    const directive = Faqir.inspect("#go").directives.find(
      (d: { type: string }) => d.type === "on",
    );
    expect(directive).toBeDefined();
    expect(sorted(Object.keys(directive))).toEqual(membersOf("InspectedDirective"));
    // The handler-facing Directive is the same surface; `arg` is optional there
    // because the parser omits the key entirely for the no-argument forms.
    expect(membersOf("Directive")).toEqual(membersOf("InspectedDirective"));

    const seen: Record<string, unknown>[] = [];
    Faqir.directive("probe-shape", (_el: Element, dir: Record<string, unknown>) => {
      seen.push(dir);
    });
    document.body.innerHTML = `<div l-data="{}"><span l-probe-shape="1"></span></div>`;
    Faqir.start();
    expect(seen.length).toBeGreaterThan(0);
    const raw = seen[0];
    expect("arg" in raw).toBe(false);
    expect(sorted(Object.keys(raw))).toEqual(
      membersOf("Directive").filter((m) => m !== "arg"),
    );
  });
});

// ── 4. magics ──────────────────────────────────────────────────────────────

describe("Magics matches the engine's own @ui:magic declarations", () => {
  const vocab = parseEngineVocabulary(readFileSync(ENGINE_SRC, "utf8"));
  const declaredByEngine = sorted(
    vocab.magics.filter((m) => m.where !== "internal").map((m) => m.name),
  );

  it("declares every page-visible magic and no invented ones", () => {
    expect(declaredByEngine.length).toBeGreaterThanOrEqual(10);
    expect(membersOf("Magics")).toEqual(declaredByEngine);
  });

  it("leaves the engine-internal names out", () => {
    // `$scope` is the compiled function's own parameter, never page vocabulary.
    expect(vocab.magics.some((m) => m.name === "$scope" && m.where === "internal")).toBe(true);
    expect(membersOf("Magics")).not.toContain("$scope");
  });

  it("keeps PluginMagics empty — a plugin's magic is the caller's to declare", () => {
    expect(DECLARED.get("PluginMagics")?.members ?? []).toEqual([]);
  });
});

// ── 5. the l-source controller ─────────────────────────────────────────────

describe("SourceController matches the ctrl literal l-source injects", () => {
  it("declares exactly the methods the engine builds", () => {
    const methods = sorted(
      parseSourceController(readFileSync(ENGINE_SRC, "utf8")).map((m) => m.name),
    );
    expect(methods.length).toBeGreaterThanOrEqual(7);
    expect(membersOf("SourceController")).toEqual(methods);
  });
});

// ── 6. controller APIs ─────────────────────────────────────────────────────

/** recipe name → the methods its `@ui:provides` header promises. */
function registryControllers(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const name of readdirSync(RECIPES).sort()) {
    const file = join(RECIPES, name, `${name}.js`);
    if (!existsSync(file)) continue;
    const provides = /@ui:provides\s+([^\n]+)/.exec(readFileSync(file, "utf8"))?.[1];
    if (!provides) continue;
    out.set(name, sorted(provides.trim().split(/\s+/)));
  }
  return out;
}

describe("ControllerApis matches every recipe's @ui:provides header", () => {
  const registry = registryControllers();
  const map = DECLARED.get("ControllerApis");

  it("covers every recipe that ships a controller, and only those", () => {
    expect(registry.size).toBeGreaterThanOrEqual(29);
    expect(sorted(map!.members)).toEqual(sorted(registry.keys()));
  });

  for (const [name, provides] of registry) {
    it(`declares ${name}'s API exactly as its header promises`, () => {
      const iface = map!.refs.get(name);
      expect(iface, `ControllerApis["${name}"] must point at an interface`).toBeDefined();
      expect(membersOf(iface!)).toEqual(provides);
    });
  }

  it("gives every API interface `destroy` through ControllerApi", () => {
    // `$ui` and `inspect().controller.api` are typed as ControllerApi, so
    // `destroy()` is the one call that must be legal without a cast.
    expect(membersOf("ControllerApi")).toEqual(["destroy"]);
    for (const iface of map!.refs.values()) {
      expect(DECLARED.get(iface)?.extends, iface).toContain("ControllerApi");
    }
  });

  it("names the aliased controller once — alert-dialog and dialog share one", () => {
    expect(map!.refs.get("dialog")).toBe("DialogApi");
    expect(map!.refs.get("alert-dialog")).toBe("DialogApi");
  });
});

// ── 7. the type tests ──────────────────────────────────────────────────────

describe("the declaration compiles the fixtures — and rejects their misuse", () => {
  const FIXTURES = join(ROOT, "tests", "fixtures", "types");

  it("has at least ten asserted-to-fail and ten asserted-to-compile points", () => {
    const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    const source = files.map((f) => readFileSync(join(FIXTURES, f), "utf8")).join("\n");
    const negatives = source.match(/@ts-expect-error/g) ?? [];
    // A numbered heading per API surface point exercised in the positive direction.
    const positives = source.match(/^\/\/ ── \d+\./gm) ?? [];
    expect(negatives.length).toBeGreaterThanOrEqual(10);
    expect(positives.length).toBeGreaterThanOrEqual(10);
  });

  it("compiles tests/fixtures/types with zero diagnostics", () => {
    const tsc = join(ROOT, "node_modules", ".bin", "tsc");
    expect(existsSync(tsc), "typescript must be installed to run the type tests").toBe(true);
    const result = spawnSync(tsc, ["-p", join(FIXTURES, "tsconfig.json")], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    // TS2578 "Unused '@ts-expect-error' directive" is the negative direction
    // failing: the declaration accepted something it must reject.
    expect(output, output).toBe("");
    expect(result.status).toBe(0);
  }, 120_000);
});
