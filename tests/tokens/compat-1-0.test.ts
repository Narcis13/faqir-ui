/**
 * 1.0 override handles still work in 1.1.
 *
 * 1.1 moved components from direct values onto role tokens (`--font-ui`) and
 * paint tokens (`--texture-surface`), and in two places it quietly dropped a
 * handle a 1.0 project could have been using:
 *
 * - **Per-component font tokens.** Ten components read
 *   `var(--<name>-font, var(--font-sans))` in 1.0; 1.1 rewrote them to
 *   `var(--font-ui)`, so `--input-font`, `--select-font`, … — still listed in
 *   the theme manifests — stopped doing anything. They are restored as the
 *   first choice over the role.
 * - **`--card-bg` as a gradient.** 1.0 painted it with the `background`
 *   shorthand; 1.1 moved to `background-color` to make room for the texture,
 *   and a `linear-gradient()` there is an invalid colour, so the card went
 *   transparent. The texture and the fill are now two layers of one shorthand.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const REGISTRY = join(import.meta.dir, "../../registry");
const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

const FONT_KNOBS: Array<[string, string]> = [
  ["primitives", "input"],
  ["primitives", "select"],
  ["primitives", "textarea"],
  ["primitives", "badge"],
  ["primitives", "chip"],
  ["primitives", "toggle"],
  ["primitives", "breadcrumb"],
  ["primitives", "collapsible"],
  ["recipes", "carousel"],
  ["recipes", "toggle-group"],
];

describe("per-component font tokens", () => {
  for (const [layer, name] of FONT_KNOBS) {
    it(`${name} reads --${name}-font ahead of the --font-ui role`, () => {
      expect(read(`${layer}/${name}/${name}.css`)).toContain(`font-family: var(--${name}-font, var(--font-ui));`);
    });
  }

  it("an override on one element reaches that element only", () => {
    const win = new Window();
    try {
      const doc = win.document;
      const style = doc.createElement("style");
      style.textContent = `:root { --font-ui: sans-serif; }\n${read("primitives/input/input.css")}`;
      doc.head.appendChild(style);
      doc.body.innerHTML =
        '<input id="a" data-ui="input"><input id="b" data-ui="input" style="--input-font: serif">';
      expect(win.getComputedStyle(doc.getElementById("a")!).fontFamily).toBe("sans-serif");
      expect(win.getComputedStyle(doc.getElementById("b")!).fontFamily).toBe("serif");
    } finally {
      win.close();
    }
  });
});

describe("text-control fill overrides", () => {
  // `--input-bg` on `:root` (the 1.0 way) still fills every text control, and a
  // region or one element takes `--input-fill` — `--input-bg` below the root
  // cannot win over the fill `:root` already resolved (see tokens/aliases.css).
  function fills(extra: string, body: string): Record<string, string> {
    const win = new Window();
    try {
      const doc = win.document;
      const style = doc.createElement("style");
      style.textContent = `${read("tokens/aliases.css")}\n:root { --color-bg: #ffffff; }\n${extra}\n${read("primitives/input/input.css")}`;
      doc.head.appendChild(style);
      doc.body.innerHTML = body;
      const out: Record<string, string> = {};
      for (const el of doc.querySelectorAll("input")) out[el.id] = win.getComputedStyle(el).backgroundColor;
      return out;
    } finally {
      win.close();
    }
  }

  it("--input-bg on :root fills every input", () => {
    expect(fills(":root { --input-bg: #ff0000; }", '<input id="a" data-ui="input">').a).toBe("#ff0000");
  });

  it("--input-fill on one element or a region fills only there", () => {
    const got = fills(
      "",
      '<input id="plain" data-ui="input"><input id="one" data-ui="input" style="--input-fill: #00ff00">' +
        '<div style="--input-fill: #0000ff"><input id="region" data-ui="input"></div>',
    );
    expect(got.plain).toBe("#ffffff");
    expect(got.one).toBe("#00ff00");
    expect(got.region).toBe("#0000ff");
  });
});

describe("--card-bg takes any background again", () => {
  const card = read("primitives/card/card.css");

  it("the fill is the final layer of the shorthand, under the texture", () => {
    // The final layer is the only one allowed a colour, so a colour, a gradient
    // or an image all parse there; `--texture-surface` is `none` by default.
    expect(card).toContain("background: var(--texture-surface), var(--card-bg, var(--color-surface-1));");
    expect(card).not.toMatch(/background-color:\s*var\(--card-bg/);
  });

  it("the filled variant replaces a gradient fill, as it did in 1.0", () => {
    expect(card).toContain("background: var(--texture-surface), var(--color-surface-2);");
  });
});
