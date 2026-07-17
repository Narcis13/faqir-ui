// RSC smoke test (task 0.7-01): the primitives must be importable and
// renderable in a React Server Component context — no hooks, no client-only
// APIs, no `"use client"` directive. `renderToStaticMarkup` (react-dom/server)
// is the server-render path; if a primitive reached for a hook or a browser
// global it would throw here. We render EVERY primitive server-side and check
// the attribute contract survives with no client bailout.

import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadPrimitiveIRs } from "../../../src/bindings/ir";
import { getRegistryPath } from "../../../src/utils/fs";
import * as barrel from "../src/index";
import { LButton, LInput, LCard } from "../src/index";

const SRC = join(import.meta.dir, "..", "src");
const irs = await loadPrimitiveIRs(getRegistryPath());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function componentOf(name: string): any {
  const ir = irs.find((i) => i.name === name)!;
  return (barrel as Record<string, unknown>)[ir.componentName];
}

describe("no client boundary in primitive output", () => {
  it('no generated primitive module contains a "use client" directive', () => {
    for (const file of readdirSync(join(SRC, "components"))) {
      const source = readFileSync(join(SRC, "components", file), "utf8");
      expect(source).not.toMatch(/^\s*["']use client["'];?\s*$/m);
    }
  });

  it("no generated module imports a client-only React hook", () => {
    for (const file of readdirSync(join(SRC, "components"))) {
      const source = readFileSync(join(SRC, "components", file), "utf8");
      expect(source).not.toMatch(/\buse(State|Effect|Ref|Context|Reducer|LayoutEffect|Id)\b/);
    }
    // The runtime is likewise hook-free.
    expect(readFileSync(join(SRC, "runtime.ts"), "utf8")).not.toMatch(
      /\buse(State|Effect|Ref|Context|Reducer|LayoutEffect|Id)\b/
    );
  });
});

describe("server rendering (renderToStaticMarkup)", () => {
  it("every primitive renders server-side without throwing", () => {
    for (const ir of irs) {
      const html = renderToStaticMarkup(createElement(componentOf(ir.name)));
      expect(html).toContain(`data-ui="${ir.name}"`);
      expect(html.startsWith(`<${ir.tag}`)).toBe(true);
    }
  });

  it("variants, states, and slots render into server markup", () => {
    const button = renderToStaticMarkup(
      createElement(LButton, { variant: "primary", size: "lg", loading: true, icon: "★", children: "Save" })
    );
    expect(button).toBe(
      '<button data-ui="button" data-variant="primary" data-size="lg" data-state="loading"><span data-part="icon">★</span>Save</button>'
    );
  });

  it("void roots render as self-contained server markup", () => {
    const input = renderToStaticMarkup(createElement(LInput, { size: "sm" }));
    expect(input).toBe('<input data-ui="input" data-size="sm"/>');
  });

  it("required parts render server-side even when empty (card body)", () => {
    const card = renderToStaticMarkup(createElement(LCard, {}));
    expect(card).toBe('<div data-ui="card"><div data-part="body"></div></div>');
  });
});
