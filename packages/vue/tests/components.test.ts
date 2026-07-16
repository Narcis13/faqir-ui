// DOM behavior tests for the generated Vue components (task 0.6-12), via
// @vue/test-utils under happy-dom. The full prop matrix is data-driven from
// the same IR the codegen uses: every variant value of every primitive must
// land on the right attribute, every state prop must reflect per its kind,
// and slots must project into the right `data-part` wrappers.

import { describe, it, expect } from "bun:test";
import { mount } from "@vue/test-utils";
import { h } from "vue";
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

const irs = await loadPrimitiveIRs(getRegistryPath());

function componentOf(ir: { componentName: string }) {
  return (barrel as Record<string, unknown>)[ir.componentName] as Parameters<typeof mount>[0];
}

describe("prop matrix: data-ui / variants / states across all primitives", () => {
  it("bare mount renders the root tag with data-ui and nothing else from props", () => {
    for (const ir of irs) {
      const wrapper = mount(componentOf(ir));
      const root = wrapper.element as HTMLElement;
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
          const wrapper = mount(componentOf(ir), { props: { [v.prop]: value } });
          expect((wrapper.element as HTMLElement).getAttribute(v.attr)).toBe(value);
        }
      }
    }
  });

  it("every state prop reflects per its kind", () => {
    for (const ir of irs) {
      for (const s of ir.states) {
        const wrapper = mount(componentOf(ir), { props: { [s.prop]: true } });
        const root = wrapper.element as HTMLElement;
        if (s.kind === "aria") expect(root.getAttribute(s.attr)).toBe("true");
        else if (s.kind === "presence") expect(root.hasAttribute(s.attr)).toBe(true);
        else expect(root.getAttribute(s.attr)).toBe(s.value);
      }
    }
  });
});

describe("state semantics", () => {
  it("first truthy data-state wins (field-group invalid before validating)", () => {
    const wrapper = mount(LFieldGroup, { props: { invalid: true, validating: true } });
    expect(wrapper.attributes("data-state")).toBe("invalid");
  });

  it("aria states always render true/false (toggle aria-pressed)", () => {
    expect(mount(LToggle).attributes("aria-pressed")).toBe("false");
    expect(mount(LToggle, { props: { pressed: true } }).attributes("aria-pressed")).toBe("true");
  });

  it("presence states render bare attributes (checkbox checked + disabled)", () => {
    const wrapper = mount(LCheckbox, { props: { checked: true, disabled: true } });
    expect(wrapper.attributes()).toHaveProperty("checked");
    expect(wrapper.attributes()).toHaveProperty("disabled");
  });

  it("button loading + disabled compose", () => {
    const wrapper = mount(LButton, { props: { loading: true, disabled: true } });
    expect(wrapper.attributes("data-state")).toBe("loading");
    expect(wrapper.attributes()).toHaveProperty("disabled");
  });
});

describe("slots project into the right data-part wrappers", () => {
  it("button: icon slot wraps in span[data-part=icon] before default content", () => {
    const wrapper = mount(LButton, {
      props: { variant: "primary" },
      slots: { icon: () => "★", default: () => "Save" },
    });
    expect(wrapper.html()).toBe(
      '<button data-ui="button" data-variant="primary"><span data-part="icon">★</span>Save</button>'
    );
  });

  it("optional slots render only when provided; required slots always render", () => {
    // card: body is required, header/title/description/footer optional.
    const bare = mount(LCard);
    expect(bare.find("[data-part='body']").exists()).toBe(true);
    expect(bare.find("[data-part='header']").exists()).toBe(false);

    const full = mount(LCard, {
      slots: { header: () => "Head", body: () => "Body", footer: () => "Foot" },
    });
    const parts = full
      .findAll("[data-part]")
      .map((p) => p.attributes("data-part"));
    expect(parts).toEqual(["header", "body", "footer"]);
    expect(full.find("[data-part='header']").element.tagName.toLowerCase()).toBe("div");
    expect(full.find("[data-part='footer']").text()).toBe("Foot");
  });

  it("collapsible: required trigger/content use manifest tag hints", () => {
    const wrapper = mount(LCollapsible, {
      props: { open: true },
      slots: { trigger: () => "Toggle", content: () => "Hidden" },
    });
    expect(wrapper.attributes()).toHaveProperty("open");
    expect(wrapper.find("summary[data-part='trigger']").text()).toBe("Toggle");
    expect(wrapper.find("div[data-part='content']").text()).toBe("Hidden");
  });

  it("field-group: label/input/error project into their parts", () => {
    const wrapper = mount(LFieldGroup, {
      props: { invalid: true },
      slots: {
        label: () => "Email",
        input: () => h("input", { "data-ui": "input", type: "email" }),
        error: () => "Required",
      },
    });
    expect(wrapper.find("label[data-part='label']").text()).toBe("Email");
    expect(wrapper.find("[data-part='input'] input[type='email']").exists()).toBe(true);
    expect(wrapper.find("p[data-part='error']").text()).toBe("Required");
  });

  it("void-tag slots render caller content as-is (avatar image)", () => {
    const wrapper = mount(LAvatar, {
      slots: {
        image: () => h("img", { "data-part": "image", src: "/a.png", alt: "" }),
        fallback: () => "NB",
      },
    });
    // The caller supplies the <img data-part>; no wrapper is added around it.
    expect(wrapper.find("img[data-part='image']").attributes("src")).toBe("/a.png");
    expect(wrapper.find("span[data-part='fallback']").text()).toBe("NB");
  });

  it("void roots render no children even when content is passed", () => {
    const wrapper = mount(LInput, { slots: { default: () => "ignored" } });
    expect(wrapper.element.childNodes.length).toBe(0);
    expect(wrapper.element.tagName.toLowerCase()).toBe("input");
  });
});

describe("attribute fallthrough and unions", () => {
  it("non-prop attributes fall through to the root element", () => {
    const wrapper = mount(LInput, {
      props: { size: "sm" },
      attrs: { type: "email", placeholder: "you@example.com" },
    });
    expect(wrapper.attributes("type")).toBe("email");
    expect(wrapper.attributes("placeholder")).toBe("you@example.com");
    expect(wrapper.attributes("data-size")).toBe("sm");
  });

  it("icon renders its data-icon variant (120-name union)", () => {
    const wrapper = mount(LIcon, { props: { icon: "check" } });
    expect(wrapper.attributes("data-icon")).toBe("check");
  });

  it("separator styleVariant maps to data-style", () => {
    const wrapper = mount(LSeparator, { props: { variant: "vertical", styleVariant: "dashed" } });
    expect(wrapper.attributes("data-variant")).toBe("vertical");
    expect(wrapper.attributes("data-style")).toBe("dashed");
  });
});
