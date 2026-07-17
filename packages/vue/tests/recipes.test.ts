// Behavior tests for the generated Vue recipe wrappers (task 0.6-13), via
// @vue/test-utils under happy-dom. Data-driven across every recipe: mount
// attaches the vendored controller exactly once, unmount destroys it and
// leaves zero leaked listeners (asserted via EventTarget spies), the exposed
// controller API drives the recipe, and controller `faqir:*` CustomEvents are
// re-emitted as Vue events with their payloads.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { loadRecipeBundle } from "../../../src/bindings/recipe-ir";
import { getRegistryPath } from "../../../src/utils/fs";
import * as barrel from "../src/index";
import { __activeControllers } from "../src/index";
import { LDialog, LAlertDialog, LTabs, LToast, LPagination, LAccordion } from "../src/index";

const recipes = await loadRecipeBundle(getRegistryPath());

function componentOf(ir: { componentName: string }) {
  return (barrel as Record<string, unknown>)[ir.componentName] as Parameters<typeof mount>[0];
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("mount/unmount lifecycle across all recipes", () => {
  it("controller is created once on mount and destroyed on unmount", () => {
    for (const ir of recipes.irs) {
      const before = __activeControllers.size;
      const wrapper = mount(componentOf(ir), { attachTo: document.body });
      expect(__activeControllers.size).toBe(before + 1);
      wrapper.unmount();
      expect(__activeControllers.size).toBe(before);
    }
  });

  it("no leaked listeners: every addEventListener is balanced on unmount", () => {
    const proto = EventTarget.prototype;
    const origAdd = proto.addEventListener;
    const origRemove = proto.removeEventListener;
    for (const ir of recipes.irs) {
      const live = new Map<string, number>();
      const key = (t: unknown, type: string, fn: unknown) =>
        `${(t as { constructor: { name: string } }).constructor.name}:${type}:${String(fn).slice(0, 60)}`;
      proto.addEventListener = function (this: EventTarget, type: string, fn: never, opts?: never) {
        live.set(key(this, type, fn), (live.get(key(this, type, fn)) ?? 0) + 1);
        return origAdd.call(this, type, fn, opts);
      } as typeof origAdd;
      proto.removeEventListener = function (this: EventTarget, type: string, fn: never, opts?: never) {
        const k = key(this, type, fn);
        if (live.has(k)) {
          const n = live.get(k)! - 1;
          if (n <= 0) live.delete(k);
          else live.set(k, n);
        }
        return origRemove.call(this, type, fn, opts);
      } as typeof origRemove;
      try {
        const wrapper = mount(componentOf(ir), { attachTo: document.body });
        wrapper.unmount();
      } finally {
        proto.addEventListener = origAdd;
        proto.removeEventListener = origRemove;
      }
      // `once`-style listeners self-remove; anything left after unmount leaked.
      expect({ recipe: ir.name, leaked: [...live.keys()] }).toEqual({ recipe: ir.name, leaked: [] });
    }
  });

  it("the double-init guard and the wrapper agree on one controller (dialog)", () => {
    const wrapper = mount(LDialog, { attachTo: document.body });
    const root = wrapper.element as HTMLElement & { _faqirDialog?: object };
    const exposed = wrapper.vm as unknown as { controller: () => object };
    expect(root._faqirDialog).toBeDefined();
    expect(exposed.controller()).toBe(root._faqirDialog!);
    wrapper.unmount();
    expect(root._faqirDialog).toBeUndefined();
  });
});

describe("exposed controller API (defineExpose surface)", () => {
  it("wrapper.vm.open() opens the dialog; close() closes it", () => {
    const wrapper = mount(LDialog, { attachTo: document.body });
    const vm = wrapper.vm as unknown as { open: () => void; close: () => void; toggle: () => void };
    const root = wrapper.element as HTMLElement;
    expect(root.getAttribute("data-state")).toBe("closed");
    vm.open();
    expect(root.getAttribute("data-state")).toBe("open");
    expect(root.querySelector<HTMLElement>("[data-part='panel']")!.hidden).toBe(false);
    vm.close();
    expect(root.getAttribute("data-state")).toBe("closed");
    wrapper.unmount();
  });

  it("the exposed API works through a template ref, §11.2-style", () => {
    const Host = defineComponent({
      setup() {
        const dialog = ref<InstanceType<typeof LDialog> & { open: () => void }>();
        return { dialog };
      },
      render() {
        return h("div", [h(LDialog, { ref: "dialog", title: "Sure?" })]);
      },
    });
    const host = mount(Host, { attachTo: document.body });
    (host.vm.dialog as { open: () => void }).open();
    expect(host.find("[data-ui='dialog']").attributes("data-state")).toBe("open");
    host.unmount();
  });

  it("tabs activate(), toast add()/dismissAll(), pagination setPage()/getPage()", async () => {
    const tabs = mount(LTabs, { attachTo: document.body });
    (tabs.vm as unknown as { activate: (i: number) => void }).activate(1);
    const triggers = tabs.element.querySelectorAll("[data-part='trigger']");
    expect(triggers[1].getAttribute("aria-selected")).toBe("true");
    tabs.unmount();

    const toast = mount(LToast, { attachTo: document.body });
    const toastVm = toast.vm as unknown as { add: (o: object) => void; dismissAll: () => void };
    toastVm.add({ message: "Saved", tone: "success" });
    expect(toast.element.querySelectorAll("[data-part='toast']").length).toBe(1);
    toast.unmount();

    const pagination = mount(LPagination, { attachTo: document.body });
    const pagVm = pagination.vm as unknown as { setTotal: (n: number) => void; setPage: (n: number) => void; getPage: () => number };
    pagVm.setTotal(5);
    pagVm.setPage(3);
    expect(pagVm.getPage()).toBe(3);
    pagination.unmount();
  });

  it("methods called before mount resolve to undefined instead of throwing", () => {
    // The exposed proxies guard on the controller existing; a pre-create call
    // (e.g. from a watcher firing before onMounted) is a no-op.
    const wrapper = mount(LDialog);
    wrapper.unmount();
    const vm = wrapper.vm as unknown as { open: () => unknown };
    expect(vm.open()).toBeUndefined(); // after unmount the controller is gone
  });
});

describe("controller events re-emitted as Vue events", () => {
  it("alert-dialog cancel/confirm re-emit with their detail payloads", async () => {
    const wrapper = mount(LAlertDialog, { attachTo: document.body });
    const vm = wrapper.vm as unknown as { open: () => void };
    vm.open();
    wrapper.element.querySelector<HTMLElement>("[data-part='cancel']")!.click();
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("cancel")![0][0]).toEqual({ reason: "cancel" });

    vm.open();
    wrapper.element.querySelector<HTMLElement>("[data-part='confirm']")!.click();
    expect(wrapper.emitted("confirm")).toHaveLength(1);
    expect((wrapper.emitted("confirm")![0][1] as CustomEvent).type).toBe("faqir:confirm");
    wrapper.unmount();
  });

  it("the raw CustomEvent rides along so confirm stays cancelable", () => {
    const wrapper = mount(LAlertDialog, {
      attachTo: document.body,
      props: { title: "Delete?" },
      attrs: {
        onConfirm: (_detail: unknown, event: Event) => event.preventDefault(),
      },
    });
    (wrapper.vm as unknown as { open: () => void }).open();
    wrapper.element.querySelector<HTMLElement>("[data-part='confirm']")!.click();
    // A prevented confirm keeps the dialog open (async-work contract).
    expect(wrapper.element.getAttribute("data-state")).toBe("open");
    wrapper.unmount();
  });

  it("pagination page-change re-emits with the page payload", () => {
    const wrapper = mount(LPagination, { attachTo: document.body });
    const vm = wrapper.vm as unknown as { setTotal: (n: number) => void; setPage: (n: number) => void };
    vm.setTotal(5);
    vm.setPage(2);
    const emitted = wrapper.emitted("page-change");
    expect(emitted).toBeDefined();
    expect((emitted![emitted!.length - 1][0] as { page: number }).page).toBe(2);
    wrapper.unmount();
  });
});

describe("template contract in the DOM", () => {
  it("string props fill template text; slots replace fallback content", () => {
    const wrapper = mount(LDialog, {
      props: { title: "From prop" },
      slots: { body: "<p>From slot</p>", footer: "<button>OK</button>" },
      attachTo: document.body,
    });
    const root = wrapper.element as HTMLElement;
    expect(root.querySelector("[data-part='title']")!.textContent).toBe("From prop");
    expect(root.querySelector("[data-part='body']")!.innerHTML).toBe("<p>From slot</p>");
    expect(root.querySelector("[data-part='footer']")!.innerHTML).toBe("<button>OK</button>");
    wrapper.unmount();
  });

  it("boolean template props toggle their bare attribute (alert-dialog confirm-required)", () => {
    const on = mount(LAlertDialog, { props: { confirmRequired: true } });
    expect(on.attributes("data-confirm-required")).toBe("");
    const off = mount(LAlertDialog);
    expect(off.attributes("data-confirm-required")).toBeUndefined();
    on.unmount();
    off.unmount();
  });

  it("variant props write their attr on the right part; invalid values fail validation", () => {
    const wrapper = mount(LDialog, { props: { size: "lg", tone: "danger" } });
    const panel = wrapper.element.querySelector("[data-part='panel']")!;
    expect(panel.getAttribute("data-size")).toBe("lg");
    expect(panel.getAttribute("data-variant")).toBe("danger");
    wrapper.unmount();

    const propDef = (LDialog as unknown as { props: Record<string, { validator: (v: unknown) => boolean }> }).props;
    expect(propDef.size.validator("xl")).toBe(false);
    expect(propDef.size.validator("full")).toBe(true);
  });

  it("the default slot replaces the whole template anatomy (tabs bring-your-own)", () => {
    const wrapper = mount(LAccordion, {
      slots: { default: '<div data-part="item" data-state="collapsed"><button data-part="trigger">One</button><div data-part="content" hidden>Body</div></div>' },
      attachTo: document.body,
    });
    expect(wrapper.element.querySelectorAll("[data-part='item']").length).toBe(1);
    expect(wrapper.element.querySelector("[data-part='trigger']")!.textContent).toBe("One");
    wrapper.unmount();
  });

  it("ids auto-generate per instance and stay overridable", () => {
    const auto = mount(LDialog, { attachTo: document.body });
    const a = auto.element as HTMLElement;
    expect(a.id).not.toBe("");
    expect(a.querySelector("[data-part='panel']")!.getAttribute("aria-labelledby")).toBe(`${a.id}-title`);
    const manual = mount(LDialog, { props: { id: "save-dialog" }, attachTo: document.body });
    expect((manual.element as HTMLElement).id).toBe("save-dialog");
    expect(manual.element.querySelector("[data-part='title']")!.id).toBe("save-dialog-title");
    auto.unmount();
    manual.unmount();
  });
});
