// DOM behavior tests for the generated React components (task 0.7-01), via
// @testing-library/react under happy-dom. The full prop matrix is data-driven
// from the same IR the codegen uses: every variant value of every primitive
// must land on the right attribute, every state prop must reflect per its kind,
// named slot props must project into their `data-part` wrappers, and refs must
// forward to the root element.

import { describe, it, expect, afterEach } from "bun:test";
import { createElement, createRef } from "react";
import { render, cleanup } from "@testing-library/react";
import { loadPrimitiveIRs } from "../../../src/bindings/ir";
import { getRegistryPath } from "../../../src/utils/fs";
import * as barrel from "../src/index";
import {
  LButton,
  LCard,
  LAvatar,
  LCollapsible,
  LFieldGroup,
  LToggle,
  LCheckbox,
  LInput,
  LIcon,
  LSeparator,
} from "../src/index";

afterEach(cleanup);

const irs = await loadPrimitiveIRs(getRegistryPath());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = any;

function componentOf(ir: { componentName: string }): AnyComponent {
  return (barrel as Record<string, unknown>)[ir.componentName];
}

function renderRoot(Component: AnyComponent, props: Record<string, unknown> = {}): HTMLElement {
  const { container } = render(createElement(Component, props));
  return container.firstElementChild as HTMLElement;
}

describe("prop matrix: data-ui / variants / states across all primitives", () => {
  it("bare render carries data-ui and no variant/state attributes", () => {
    for (const ir of irs) {
      const root = renderRoot(componentOf(ir));
      cleanup();
      expect(root.tagName.toLowerCase()).toBe(ir.tag);
      expect(root.getAttribute("data-ui")).toBe(ir.name);
      for (const v of ir.variants) expect(root.hasAttribute(v.attr)).toBe(false);
      expect(root.hasAttribute("data-state")).toBe(false);
    }
  });

  it("every variant value reflects onto its manifest attribute", () => {
    for (const ir of irs) {
      for (const v of ir.variants) {
        for (const value of v.values) {
          const root = renderRoot(componentOf(ir), { [v.prop]: value });
          cleanup();
          expect(root.getAttribute(v.attr)).toBe(value);
        }
      }
    }
  });

  it("every state prop reflects per its kind", () => {
    for (const ir of irs) {
      for (const s of ir.states) {
        // readOnly silences React's controlled-input warning for `checked`.
        const extra = s.attr === "checked" ? { readOnly: true } : {};
        const root = renderRoot(componentOf(ir), { [s.prop]: true, ...extra });
        cleanup();
        if (s.kind === "aria") {
          expect(root.getAttribute(s.attr)).toBe("true");
        } else if (s.kind === "presence") {
          // React special-cases form-control attributes (`checked`) as DOM
          // properties; accept either the reflected attribute or the property.
          const asProp = (root as unknown as Record<string, unknown>)[s.attr];
          expect(root.hasAttribute(s.attr) || asProp === true).toBe(true);
        } else {
          expect(root.getAttribute(s.attr)).toBe(s.value);
        }
      }
    }
  });
});

describe("state semantics", () => {
  it("first truthy data-state wins (field-group invalid before validating)", () => {
    const root = renderRoot(LFieldGroup, { invalid: true, validating: true });
    expect(root.getAttribute("data-state")).toBe("invalid");
  });

  it("aria states always render true/false (toggle aria-pressed)", () => {
    expect(renderRoot(LToggle).getAttribute("aria-pressed")).toBe("false");
    cleanup();
    expect(renderRoot(LToggle, { pressed: true }).getAttribute("aria-pressed")).toBe("true");
  });

  it("presence states reflect (checkbox checked + disabled)", () => {
    // readOnly silences React's controlled-input warning; the contract is the
    // reflected checked/disabled state, not interactivity.
    const root = renderRoot(LCheckbox, { checked: true, disabled: true, readOnly: true }) as HTMLInputElement;
    expect(root.disabled).toBe(true);
    expect(root.hasAttribute("disabled")).toBe(true);
    expect(root.checked).toBe(true);
  });

  it("button loading + disabled compose", () => {
    const root = renderRoot(LButton, { loading: true, disabled: true });
    expect(root.getAttribute("data-state")).toBe("loading");
    expect(root.hasAttribute("disabled")).toBe(true);
  });
});

describe("named slot props project into the right data-part wrappers", () => {
  it("button: icon wraps in span[data-part=icon] before children", () => {
    const root = renderRoot(LButton, { variant: "primary", icon: "★", children: "Save" });
    expect(root.outerHTML).toBe(
      '<button data-ui="button" data-variant="primary"><span data-part="icon">★</span>Save</button>'
    );
  });

  it("optional slots render only when provided; required slots always render", () => {
    const bare = renderRoot(LCard);
    expect(bare.querySelector("[data-part='body']")).not.toBeNull();
    expect(bare.querySelector("[data-part='header']")).toBeNull();
    cleanup();

    const full = renderRoot(LCard, { header: "Head", body: "Body", footer: "Foot" });
    const parts = [...full.querySelectorAll("[data-part]")].map((p) => p.getAttribute("data-part"));
    expect(parts).toEqual(["header", "body", "footer"]);
    expect(full.querySelector("[data-part='header']")!.tagName.toLowerCase()).toBe("div");
    expect(full.querySelector("[data-part='footer']")!.textContent).toBe("Foot");
  });

  it("collapsible: required trigger/content use manifest tag hints", () => {
    const root = renderRoot(LCollapsible, { open: true, trigger: "Toggle", content: "Hidden" });
    expect(root.hasAttribute("open")).toBe(true);
    expect(root.querySelector("summary[data-part='trigger']")!.textContent).toBe("Toggle");
    expect(root.querySelector("div[data-part='content']")!.textContent).toBe("Hidden");
  });

  it("field-group: label/input/error project into their parts", () => {
    const root = renderRoot(LFieldGroup, {
      invalid: true,
      label: "Email",
      input: createElement("input", { "data-ui": "input", type: "email" }),
      error: "Required",
    });
    expect(root.querySelector("label[data-part='label']")!.textContent).toBe("Email");
    expect(root.querySelector("[data-part='input'] input[type='email']")).not.toBeNull();
    expect(root.querySelector("p[data-part='error']")!.textContent).toBe("Required");
  });

  it("void-tag slots render caller content as-is (avatar image)", () => {
    const root = renderRoot(LAvatar, {
      image: createElement("img", { "data-part": "image", src: "/a.png", alt: "" }),
      fallback: "NB",
    });
    expect(root.querySelector("img[data-part='image']")!.getAttribute("src")).toBe("/a.png");
    expect(root.querySelector("span[data-part='fallback']")!.textContent).toBe("NB");
  });

  it("void roots render no children even when children are passed", () => {
    const root = renderRoot(LInput, { children: "ignored" });
    expect(root.childNodes.length).toBe(0);
    expect(root.tagName.toLowerCase()).toBe("input");
  });
});

describe("attribute fallthrough and unions", () => {
  it("non-Faqir props fall through to the root element", () => {
    const root = renderRoot(LInput, { size: "sm", type: "email", placeholder: "you@example.com" });
    expect(root.getAttribute("type")).toBe("email");
    expect(root.getAttribute("placeholder")).toBe("you@example.com");
    expect(root.getAttribute("data-size")).toBe("sm");
  });

  it("icon renders its data-icon variant", () => {
    expect(renderRoot(LIcon, { icon: "check" }).getAttribute("data-icon")).toBe("check");
  });

  it("separator styleVariant maps to data-style", () => {
    const root = renderRoot(LSeparator, { variant: "vertical", styleVariant: "dashed" });
    expect(root.getAttribute("data-variant")).toBe("vertical");
    expect(root.getAttribute("data-style")).toBe("dashed");
  });
});

describe("refs forward to the root element", () => {
  it("every primitive forwards its ref to the rendered root", () => {
    for (const ir of irs) {
      const ref = createRef<HTMLElement>();
      // Read the ref BEFORE unmounting — React nulls it on unmount.
      const { unmount } = render(createElement(componentOf(ir), { ref }));
      expect(ref.current).not.toBeNull();
      expect(ref.current!.tagName.toLowerCase()).toBe(ir.tag);
      expect(ref.current!.getAttribute("data-ui")).toBe(ir.name);
      unmount();
    }
  });

  it("the ref is the same node testing-library renders (button)", () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(createElement(LButton, { ref, children: "Go" }));
    expect(ref.current).toBe(container.firstElementChild);
    expect(ref.current!.textContent).toBe("Go");
  });
});
