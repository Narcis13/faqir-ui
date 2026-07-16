// ═══════════════════════════════════════════════════════════════════════════
// barcode — Code 128-B encoder + controller contract  [task 0.6-09]
// ═══════════════════════════════════════════════════════════════════════════

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createBarcode } from "../../registry/recipes/barcode/barcode.js";

const controllers: Array<{ destroy(): void }> = [];

function render(value: string | null, caption = false) {
  const attr = value === null ? "" : ` data-value="${value}"`;
  document.body.innerHTML =
    `<div data-ui="barcode"${attr} role="img" aria-label="Barcode">` +
    (caption ? `<span data-part="caption">${value ?? ""}</span>` : "") +
    `</div>`;
  const root = document.querySelector('[data-ui="barcode"]') as HTMLElement;
  const api = createBarcode(root);
  controllers.push(api);
  return { root, api };
}

function symbol(root: HTMLElement) {
  const svg = root.querySelector(":scope > [data-part='svg']") as SVGElement | null;
  if (!svg) throw new Error("barcode SVG was not rendered");
  return {
    svg,
    checksum: Number(svg.getAttribute("data-checksum")),
    pattern: svg.getAttribute("data-pattern"),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  for (const controller of controllers) controller.destroy();
  controllers.length = 0;
  document.body.innerHTML = "";
});

describe("barcode · Code 128-B known vectors", () => {
  const vectors = [
    {
      value: "A",
      checksum: 34,
      pattern: "2112141113231311232331112",
    },
    {
      value: "AB",
      checksum: 102,
      pattern: "2112141113231311234111312331112",
    },
    {
      value: "123",
      checksum: 8,
      pattern: "2112141232212232112211321322122331112",
    },
  ] as const;

  for (const vector of vectors) {
    it(`${JSON.stringify(vector.value)} has checksum ${vector.checksum} and the canonical bar pattern`, () => {
      const encoded = symbol(render(vector.value).root);
      expect(encoded.checksum).toBe(vector.checksum);
      expect(encoded.pattern).toBe(vector.pattern);
    });
  }
});

describe("barcode controller", () => {
  it("renders a crisp inline SVG with background, bars, and ten-module quiet zones", () => {
    const encoded = symbol(render("AB").root);
    expect(encoded.svg.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(encoded.svg.querySelector("rect")).not.toBeNull();
    const path = encoded.svg.querySelector("path")!;
    expect(path.getAttribute("d")).toStartWith("M10,0");

    const patternWidth = [...encoded.pattern!].reduce((sum, digit) => sum + Number(digit), 0);
    expect(encoded.svg.getAttribute("viewBox")).toBe(`0 0 ${patternWidth + 20} 50`);
  });

  it("inserts generated SVG before an existing caption", () => {
    const { root } = render("INV-42", true);
    expect([...root.children].map((child) => child.getAttribute("data-part"))).toEqual([
      "svg",
      "caption",
    ]);
  });

  it("sets ready, empty, and error state on the root", () => {
    expect(render("READY").root.dataset.state).toBe("ready");
    expect(render("").root.dataset.state).toBe("empty");

    const warn = console.warn;
    console.warn = () => {};
    try {
      const { root } = render("café");
      expect(root.dataset.state).toBe("error");
      expect(root.querySelector("[data-part='svg']")).toBeNull();
    } finally {
      console.warn = warn;
    }
  });

  it("rejects control characters cleanly without throwing from the controller", () => {
    const warn = console.warn;
    const warnings: string[] = [];
    console.warn = (message) => warnings.push(String(message));
    try {
      expect(() => render("line\nbreak")).not.toThrow();
      const root = document.querySelector('[data-ui="barcode"]') as HTMLElement;
      expect(root.dataset.state).toBe("error");
      expect(root.querySelector("[data-part='svg']")).toBeNull();
      expect(warnings.join("\n")).toContain("printable ASCII only");
    } finally {
      console.warn = warn;
    }
  });

  it("update() and direct data-value changes replace the symbol", async () => {
    const { root, api } = render("A");
    const first = symbol(root).pattern;
    api.update("AB");
    expect(symbol(root).pattern).not.toBe(first);

    root.setAttribute("data-value", "123");
    await tick();
    expect(symbol(root).checksum).toBe(8);
  });

  it("is idempotent and destroy removes generated state", () => {
    const { root, api } = render("A");
    expect(createBarcode(root)).toBe(api);
    api.destroy();
    expect(root.querySelector("[data-part='svg']")).toBeNull();
    expect(root.hasAttribute("data-state")).toBe(false);
    expect((root as any)._faqirBarcode).toBeUndefined();
  });
});
