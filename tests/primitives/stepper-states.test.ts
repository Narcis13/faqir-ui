// stepper 1.2 — the error state, the optional/description/status parts,
// aria-current, clickable steps and the responsive rules, read as a contract
// from the stylesheet, the manifest and the reference markup. The stepper is a
// CSS-only primitive; computed styles are checked in Chromium by
// tests/browser/stepper-wizard.pw.ts.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sheetSelectors } from "../../src/audit/part-selectors";

const DIR = join(import.meta.dir, "../../registry/primitives/stepper");
const css = readFileSync(join(DIR, "stepper.css"), "utf8");
const manifest = JSON.parse(readFileSync(join(DIR, "stepper.manifest.json"), "utf8"));
const html = readFileSync(join(DIR, "stepper.html"), "utf8");

/** Every rule as { selector (one complex selector), body, media }. */
function rules() {
  const out: { selector: string; body: string; media: string | null }[] = [];
  const src = css.replace(/\/\*[^]*?\*\//g, "");
  let media: string | null = null;
  let depth = 0;
  for (const m of src.matchAll(/([^{}]*)\{|\}/g)) {
    if (m[0] === "}") {
      depth--;
      if (depth === 0) media = null;
      continue;
    }
    const prelude = m[1].trim();
    if (prelude.startsWith("@")) {
      media = prelude;
      depth++;
      continue;
    }
    const start = m.index! + m[0].length;
    const body = src.slice(start, src.indexOf("}", start));
    for (const selector of prelude.split(/,(?![^(]*\))/)) {
      out.push({ selector: selector.trim().replace(/\s+/g, " "), body, media });
    }
    depth++;
  }
  return out;
}

const RULES = rules();
/** The value the last rule with exactly this selector declares for `prop`. */
const decl = (selector: string, prop: string, media: string | null = null) => {
  const matching = RULES.filter((r) => r.selector === selector && r.media === media);
  expect({ selector, found: matching.length > 0 }).toEqual({ selector, found: true });
  let value: string | undefined;
  for (const rule of matching) {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(rule.body);
    if (m) value = m[1].trim();
  }
  return value;
};

function mount() {
  const box = document.createElement("div");
  box.innerHTML = html.replace(/<!--[^]*?-->/g, "");
  return box;
}

describe("stepper · states", () => {
  it("declares error next to active and completed, applied to a step", () => {
    expect(Object.keys(manifest.states)).toEqual(["active", "completed", "error"]);
    expect(manifest.states.error.applied_to).toBe("step");
    for (const part of ["description", "optional", "status"]) expect(manifest.slots[part]).toBeDefined();
    expect(manifest.changes.map((c: { version: string }) => c.version)).toEqual(["1.2.0", "1.1.1", "1.1.0"]);
  });

  it("an error step draws the destructive pair, and its label and description follow", () => {
    const step = `[data-ui="stepper"] > [data-part="step"][data-state="error"]`;
    expect(decl(`${step} > [data-part="indicator"]`, "background")).toBe("var(--color-destructive)");
    expect(decl(`${step} > [data-part="indicator"]`, "color")).toBe("var(--color-destructive-fg)");
    expect(decl(`${step} > [data-part="label"]`, "color")).toBe("var(--color-destructive)");
    expect(decl(`${step} > [data-part="description"]`, "color")).toBe("var(--color-destructive)");
  });

  it("completed and error steps draw their glyph in the indicator's own colour", () => {
    for (const state of ["completed", "error"]) {
      const before = `[data-ui="stepper"] > [data-part="step"][data-state="${state}"] > [data-part="indicator"]::before`;
      expect(decl(before, "background-color")).toBe("currentColor");
      expect(decl(before, "mask")).toContain("data:image/svg+xml");
      // The number stays in the DOM for screen readers and gives way visually.
      expect(decl(`[data-ui="stepper"] > [data-part="step"][data-state="${state}"] > [data-part="indicator"]`, "-webkit-text-fill-color")).toBe("transparent");
    }
  });

  it("the completed and active colour contract of 1.1 is unchanged", () => {
    const step = (state: string) => `[data-ui="stepper"] > [data-part="step"][data-state="${state}"]`;
    expect(decl(`${step("completed")} > [data-part="indicator"]`, "background")).toBe("var(--color-success-subtle)");
    expect(decl(`${step("completed")} > [data-part="indicator"]`, "color")).toBe("var(--color-success)");
    expect(decl(`${step("active")} > [data-part="indicator"]`, "background")).toBe("var(--color-primary)");
    expect(decl(`${step("active")} > [data-part="label"]`, "color")).toBe("var(--color-primary)");
  });

  it("the status part is visually hidden; the optional marker is visible text", () => {
    const status = `[data-ui="stepper"] > :where([data-part="step"]) > [data-part="status"]`;
    expect(decl(status, "position")).toBe("absolute");
    expect(decl(status, "clip-path")).toBe("inset(50%)");
    const optional = `[data-ui="stepper"] > :where([data-part="step"]) > [data-part="optional"]`;
    expect(decl(optional, "font-style")).toBe("italic");
    expect(decl(optional, "display", "@media (min-width: 40rem)")).toBe("revert");
  });
});

describe("stepper · responsive", () => {
  it("on a phone only the aria-current step keeps its label; vertical shows them all", () => {
    expect(decl(`[data-ui="stepper"] > :where([data-part="step"]) > [data-part="label"]`, "display")).toBe("none");
    expect(decl(`[data-ui="stepper"] > [data-part="step"][aria-current="step"] > [data-part="label"]`, "display")).toBe("revert");
    expect(decl(`[data-ui="stepper"] > [data-part="step"][aria-current="step"] > [data-part="label"]`, "text-overflow")).toBe("ellipsis");
    expect(decl(`[data-ui="stepper"][data-variant="vertical"] > :where([data-part="step"]) > :is([data-part="label"], [data-part="description"], [data-part="optional"])`, "display")).toBe("revert");
  });
});

describe("stepper · clickable steps", () => {
  const step = `[data-ui="stepper"] > :where(a, button)[data-part="step"]`;

  it("a link or button step resets the control and shows the focus-ring tokens", () => {
    expect(decl(step, "background")).toBe("none");
    expect(decl(step, "border")).toBe("0");
    expect(decl(step, "cursor")).toBe("pointer");
    expect(decl(`${step}:focus-visible`, "outline")).toBe("var(--focus-ring-width) var(--focus-ring-style) var(--focus-ring-color)");
    expect(decl(`${step}:disabled`, "cursor")).toBe("default");
  });

  it("hover feedback skips disabled and current steps", () => {
    const hover = RULES.filter((r) => r.selector.startsWith(step) && r.selector.includes(":hover"));
    expect(hover.length).toBeGreaterThan(0);
    for (const rule of hover) {
      expect(rule.selector).toContain(`:not(:disabled, [aria-disabled="true"], [aria-current="step"])`);
    }
  });

  it("every part rule stays a child chain (nothing reaches a nested component)", () => {
    for (const { selector } of sheetSelectors(css)) {
      expect(/\]\s+(:where|:is|\[data-part)/.test(selector), selector).toBe(false);
    }
  });
});

describe("stepper · reference markup", () => {
  it("each stepper is named, marks at most one current step, and says every state", () => {
    const roots = [...mount().querySelectorAll<HTMLElement>("[data-ui='stepper']")];
    expect(roots.length).toBeGreaterThanOrEqual(5);
    for (const root of roots) {
      expect(root.getAttribute("aria-label")).toBeTruthy();
      expect(root.querySelectorAll("[aria-current='step']").length).toBeLessThanOrEqual(1);
      for (const step of root.querySelectorAll<HTMLElement>(":scope > [data-part='step']")) {
        const status = step.querySelector(":scope > [data-part='status']")?.textContent?.trim();
        if (step.dataset.state === "completed") expect(status).toBe("Completed");
        if (step.dataset.state === "error") expect(status).toBe("Error");
        if (step.tagName === "BUTTON") expect(step.getAttribute("type")).toBe("button");
      }
      if (root.tagName === "OL") {
        for (const connector of root.querySelectorAll(":scope > [data-part='connector']")) {
          expect(connector.tagName).toBe("LI");
          expect(connector.getAttribute("aria-hidden")).toBe("true");
        }
      }
    }
  });

  it("shows every state and part at least once", () => {
    const box = mount();
    for (const state of ["active", "completed", "error"]) {
      expect(box.querySelector(`[data-part='step'][data-state='${state}']`), state).not.toBeNull();
    }
    for (const part of ["description", "optional", "status"]) {
      expect(box.querySelector(`[data-part='${part}']`), part).not.toBeNull();
    }
    expect(box.querySelector("[data-variant='vertical']")).not.toBeNull();
    expect(box.querySelector("button[data-part='step'][disabled]")).not.toBeNull();
  });
});
