// Optional aria states through the bindings codegen (task 1.1F-17).
//
// An `aria-*` state used to mean one thing in a binding: the attribute is always
// rendered, `"true"` or `"false"`. That is right for `toggle`, whose identity is
// `aria-pressed`. It is wrong for `button`, which gained a `pressed` state:
// `aria-pressed="false"` on every button would announce every button as a toggle.
//
// So an aria state is *optional* — absent until the prop is given — unless the
// manifest also declares a prop of the same name with a default, which is how
// toggle says the attribute always has a value (`props.pressed.default: false`).

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { manifestToIR } from "../../src/bindings/ir";
import { emitVueComponent } from "../../src/bindings/vue";
import { emitReactComponent } from "../../src/bindings/react";
import type { Manifest } from "../../src/manifest";

const REGISTRY = join(import.meta.dir, "../..", "registry");

function irOf(name: string) {
  const rel = `registry/primitives/${name}/${name}.manifest.json`;
  const manifest = JSON.parse(
    readFileSync(join(REGISTRY, "primitives", name, `${name}.manifest.json`), "utf8"),
  ) as Manifest;
  return manifestToIR(manifest, rel);
}

describe("aria states in the primitive IR", () => {
  it("button's pressed is optional: the manifest declares the state and no default for it", () => {
    const pressed = irOf("button").states.find((s) => s.prop === "pressed");
    expect(pressed).toEqual({
      prop: "pressed",
      attr: "aria-pressed",
      value: null,
      kind: "aria",
      optional: true,
    });
  });

  it("toggle's pressed is not: its `pressed` prop defaults to false, so the attribute always has a value", () => {
    const pressed = irOf("toggle").states.find((s) => s.prop === "pressed");
    expect(pressed).toEqual({ prop: "pressed", attr: "aria-pressed", value: null, kind: "aria" });
  });

  it("never marks a presence or value state optional", () => {
    for (const s of irOf("button").states) {
      if (s.kind !== "aria") expect(s.optional).toBeUndefined();
    }
  });
});

for (const [target, emit] of [
  ["vue", emitVueComponent],
  ["react", emitReactComponent],
] as const) {
  describe(`${target} emits the optional flag`, () => {
    const button = emit(irOf("button"));
    const toggle = emit(irOf("toggle"));

    it("passes `optional: true` to the runtime spec for button, and nothing new for toggle", () => {
      expect(button).toContain(
        `{ prop: "pressed", attr: "aria-pressed", value: null, kind: "aria", optional: true },`,
      );
      expect(toggle).toContain(
        `{ prop: "pressed", attr: "aria-pressed", value: null, kind: "aria" },`,
      );
    });

    it("says on the prop that unset means no attribute", () => {
      expect(button).toContain("the attribute is omitted while the prop is unset");
      expect(toggle).not.toContain("omitted while the prop is unset");
    });
  });
}
