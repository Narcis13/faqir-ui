// Behavior tests for the generated React recipe wrappers (task 0.7-02), via
// @testing-library/react under happy-dom + react-dom/server for SSR. Covers the
// four pillars of the task: controller lifecycle (create on mount / destroy on
// unmount, no leaks), StrictMode double-effect safety (the classic pitfall —
// create→destroy→create must not leak or break), the imperative handle +
// `on<Event>` callback wiring, the low-level `useFaqirController` escape hatch,
// and warning-free `renderToString` for every recipe.

import { describe, it, expect, afterEach, mock } from "bun:test";
import { createElement, createRef, useRef, StrictMode } from "react";
import type { RefObject } from "react";
import { render, cleanup, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { loadRecipeBundle } from "../../../src/bindings/recipe-ir";
import { getRegistryPath } from "../../../src/utils/fs";
import * as barrel from "../src/index";
import {
  __activeControllers,
  useFaqirController,
  createDialog,
  type RecipeController,
  type RecipeHandle,
} from "../src/index";
import { LDialog, LAlertDialog, LTabs, LToast, LPagination } from "../src/index";

const recipes = await loadRecipeBundle(getRegistryPath());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function componentOf(ir: { componentName: string }): any {
  return (barrel as Record<string, unknown>)[ir.componentName];
}

afterEach(cleanup);

describe("mount / unmount lifecycle across every recipe", () => {
  it("creates exactly one controller on mount and destroys it on unmount", () => {
    for (const ir of recipes.irs) {
      const before = __activeControllers.size;
      const { unmount } = render(createElement(componentOf(ir)));
      expect({ recipe: ir.name, live: __activeControllers.size }).toEqual({
        recipe: ir.name,
        live: before + 1,
      });
      unmount();
      expect({ recipe: ir.name, live: __activeControllers.size }).toEqual({
        recipe: ir.name,
        live: before,
      });
    }
  });

  it("destroy() runs on unmount: the controller's double-init marker is cleared (dialog)", () => {
    const { container, unmount } = render(createElement(LDialog));
    const root = container.firstElementChild as HTMLElement & { _faqirDialog?: object };
    expect(root._faqirDialog).toBeDefined();
    unmount();
    expect(root._faqirDialog).toBeUndefined();
  });
});

describe("StrictMode double-effect safety (the classic pitfall)", () => {
  it("create→destroy→create leaves exactly one live controller, balanced on unmount", () => {
    let creates = 0;
    let destroys = 0;
    const factory = (): RecipeController => {
      creates++;
      return { destroy: () => void destroys++ };
    };
    function Host() {
      const ref = useRef<HTMLDivElement>(null);
      useFaqirController(ref, factory);
      return createElement("div", { ref, "data-ui": "probe" });
    }

    const before = __activeControllers.size;
    const { unmount } = render(createElement(StrictMode, null, createElement(Host)));
    // Under React's dev StrictMode the effect double-invokes (create, destroy,
    // create); either way exactly one controller stays live (destroys = creates − 1).
    expect(destroys).toBe(creates - 1);
    expect(__activeControllers.size).toBe(before + 1);
    console.log(`StrictMode probe: ${creates} create(s), ${destroys} destroy(s)`);

    unmount();
    expect(destroys).toBe(creates);
    expect(__activeControllers.size).toBe(before);
  });

  it("a real recipe stays fully functional after the StrictMode remount", () => {
    const ref = createRef<RecipeHandle>();
    const before = __activeControllers.size;
    const { container, unmount } = render(
      createElement(StrictMode, null, createElement(LDialog, { ref }))
    );
    expect(__activeControllers.size).toBe(before + 1);
    const root = container.firstElementChild as HTMLElement;
    // If the second controller weren't wired (broken destroy / double-init), open()
    // would be a no-op here.
    act(() => void (ref.current as { open: () => void }).open());
    expect(root.getAttribute("data-state")).toBe("open");
    unmount();
    expect(__activeControllers.size).toBe(before);
  });
});

describe("imperative handle (ref.current.<method>())", () => {
  it("dialog: open() / close() drive the controller through the ref", () => {
    const ref = createRef<RecipeHandle>();
    const { container } = render(createElement(LDialog, { ref }));
    const root = container.firstElementChild as HTMLElement;
    const api = ref.current as { open: () => void; close: () => void };
    expect(root.getAttribute("data-state")).toBe("closed");
    act(() => api.open());
    expect(root.getAttribute("data-state")).toBe("open");
    expect(root.querySelector<HTMLElement>("[data-part='panel']")!.hidden).toBe(false);
    act(() => api.close());
    expect(root.getAttribute("data-state")).toBe("closed");
  });

  it("tabs activate(), toast add(), pagination setTotal()/setPage()/getPage()", () => {
    const tabsRef = createRef<RecipeHandle>();
    const tabs = render(createElement(LTabs, { ref: tabsRef }));
    act(() => void (tabsRef.current as { activate: (i: number) => void }).activate(1));
    const triggers = tabs.container.querySelectorAll("[data-part='trigger']");
    expect(triggers[1].getAttribute("aria-selected")).toBe("true");

    const toastRef = createRef<RecipeHandle>();
    const toast = render(createElement(LToast, { ref: toastRef }));
    act(() => void (toastRef.current as { add: (o: object) => void }).add({ message: "Saved", tone: "success" }));
    expect(toast.container.querySelectorAll("[data-part='toast']").length).toBe(1);

    const pagRef = createRef<RecipeHandle>();
    render(createElement(LPagination, { ref: pagRef }));
    const pag = pagRef.current as { setTotal: (n: number) => void; setPage: (n: number) => void; getPage: () => number };
    act(() => {
      pag.setTotal(5);
      pag.setPage(3);
    });
    expect(pag.getPage()).toBe(3);
  });

  it("controller() returns the live instance; methods no-op after unmount", () => {
    const ref = createRef<RecipeHandle>();
    const { container, unmount } = render(createElement(LDialog, { ref }));
    const root = container.firstElementChild as HTMLElement & { _faqirDialog?: object };
    // Hold the handle: React nulls `ref.current` on unmount, but the exposed
    // object's methods keep reading the (now-torn-down) controller ref.
    const handle = ref.current as RecipeHandle & { open: () => unknown };
    expect(handle.controller()).toBe(root._faqirDialog!);
    unmount();
    expect(handle.controller()).toBeNull();
    expect(handle.open()).toBeUndefined();
  });
});

describe("controller events → on<Event> callback props", () => {
  it("alert-dialog: onCancel / onConfirm receive (detail, event)", () => {
    const onCancel = mock((_detail: unknown, _event: CustomEvent) => {});
    const onConfirm = mock((_detail: unknown, _event: CustomEvent) => {});
    const ref = createRef<RecipeHandle>();
    const { container } = render(createElement(LAlertDialog, { ref, onCancel, onConfirm }));
    const api = ref.current as { open: () => void };

    act(() => api.open());
    act(() => container.querySelector<HTMLElement>("[data-part='cancel']")!.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel.mock.calls[0][0]).toEqual({ reason: "cancel" });
    expect(onCancel.mock.calls[0][1].type).toBe("faqir:cancel");

    act(() => api.open());
    act(() => container.querySelector<HTMLElement>("[data-part='confirm']")!.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][1]).toBeInstanceOf(CustomEvent);
  });

  it("the raw CustomEvent rides along so a prevented confirm keeps the dialog open", () => {
    const onConfirm = mock((_detail: unknown, event: CustomEvent) => event.preventDefault());
    const ref = createRef<RecipeHandle>();
    const { container } = render(
      createElement(LAlertDialog, { ref, title: "Delete?", onConfirm })
    );
    act(() => void (ref.current as { open: () => void }).open());
    act(() => container.querySelector<HTMLElement>("[data-part='confirm']")!.click());
    expect(container.firstElementChild!.getAttribute("data-state")).toBe("open");
  });

  it("pagination: onPageChange re-emits with the page payload", () => {
    const onPageChange = mock((_detail: unknown, _event: CustomEvent) => {});
    const ref = createRef<RecipeHandle>();
    render(createElement(LPagination, { ref, onPageChange }));
    const api = ref.current as { setTotal: (n: number) => void; setPage: (n: number) => void };
    act(() => {
      api.setTotal(5);
      api.setPage(2);
    });
    const last = onPageChange.mock.calls.at(-1)!;
    expect((last[0] as { page: number }).page).toBe(2);
  });

  it("swapping a callback prop does not re-create the controller (latest wins)", () => {
    const first = mock((_d: unknown, _e: CustomEvent) => {});
    const second = mock((_d: unknown, _e: CustomEvent) => {});
    const ref = createRef<RecipeHandle>();
    const before = __activeControllers.size;
    const { container, rerender } = render(createElement(LAlertDialog, { ref, onCancel: first }));
    const controller = ref.current!.controller();
    rerender(createElement(LAlertDialog, { ref, onCancel: second }));
    // Same live controller instance — no teardown/recreate on prop change.
    expect(ref.current!.controller()).toBe(controller);
    expect(__activeControllers.size).toBe(before + 1);
    act(() => void (ref.current as { open: () => void }).open());
    act(() => container.querySelector<HTMLElement>("[data-part='cancel']")!.click());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("useFaqirController escape hatch on an arbitrary element ref", () => {
  it("attaches any controller factory to a plain ref and exposes its API", () => {
    const factory = (root: HTMLElement): RecipeController => {
      root.dataset.attached = "yes";
      return {
        ping: () => 42,
        destroy: () => {
          root.dataset.attached = "no";
        },
      };
    };
    let apiRef: RefObject<RecipeController | null> | undefined;
    function Host() {
      const ref = useRef<HTMLElement>(null);
      apiRef = useFaqirController(ref, factory);
      return createElement("section", { ref, "data-ui": "custom" });
    }
    const before = __activeControllers.size;
    const { container, unmount } = render(createElement(Host));
    const el = container.firstElementChild as HTMLElement;
    expect(el.dataset.attached).toBe("yes");
    expect(__activeControllers.size).toBe(before + 1);
    expect((apiRef!.current as { ping: () => number }).ping()).toBe(42);
    unmount();
    expect(el.dataset.attached).toBe("no");
    expect(__activeControllers.size).toBe(before);
  });

  it("forwards faqir:<event> to options.on with (detail, event)", () => {
    const onThing = mock((_detail: unknown, _event: CustomEvent) => {});
    const factory = (root: HTMLElement): RecipeController => ({
      fire: () =>
        root.dispatchEvent(new CustomEvent("faqir:thing", { detail: { ok: true }, bubbles: true })),
      destroy: () => {},
    });
    let apiRef: RefObject<RecipeController | null> | undefined;
    function Host() {
      const ref = useRef<HTMLElement>(null);
      apiRef = useFaqirController(ref, factory, { on: { thing: onThing } });
      return createElement("div", { ref });
    }
    render(createElement(Host));
    act(() => void (apiRef!.current as { fire: () => void }).fire());
    expect(onThing).toHaveBeenCalledTimes(1);
    expect(onThing.mock.calls[0][0]).toEqual({ ok: true });
    expect(onThing.mock.calls[0][1].type).toBe("faqir:thing");
  });

  it("attaches the real dialog controller through the hook, driving the exposed API", () => {
    let apiRef: RefObject<RecipeController | null> | undefined;
    function Host() {
      const ref = useRef<HTMLElement>(null);
      apiRef = useFaqirController(ref, createDialog);
      return createElement(
        "div",
        { ref, "data-ui": "dialog", "data-state": "closed", id: "hook-dialog" },
        createElement("div", { "data-part": "overlay", hidden: true }),
        createElement("div", { "data-part": "panel", role: "dialog", "aria-modal": "true", hidden: true })
      );
    }
    const { container } = render(createElement(Host));
    const root = container.firstElementChild as HTMLElement;
    act(() => void (apiRef!.current as { open: () => void }).open());
    expect(root.getAttribute("data-state")).toBe("open");
  });
});

describe("SSR: renderToString is clean for every recipe wrapper", () => {
  it("renders each recipe server-side with no throw and the data-ui contract", () => {
    for (const ir of recipes.irs) {
      const html = renderToString(createElement(componentOf(ir)));
      expect({ recipe: ir.name, ok: html.includes(`data-ui="${ir.name}"`) }).toEqual({
        recipe: ir.name,
        ok: true,
      });
    }
  });

  it("emits no React warnings/errors during server render (attr contract is valid)", () => {
    const errors: unknown[][] = [];
    const origError = console.error;
    const origWarn = console.warn;
    console.error = (...a: unknown[]) => void errors.push(a);
    console.warn = (...a: unknown[]) => void errors.push(a);
    try {
      for (const ir of recipes.irs) renderToString(createElement(componentOf(ir)));
    } finally {
      console.error = origError;
      console.warn = origWarn;
    }
    expect(errors).toEqual([]);
  });

  it("server markup keeps FOUC guards and slot substitution (dialog)", () => {
    const html = renderToString(
      createElement(LDialog, { title: "Save?", size: "lg", tone: "danger" })
    );
    expect(html).toContain('data-part="panel"');
    expect(html).toContain('data-size="lg"');
    expect(html).toContain('data-variant="danger"');
    expect(html).toContain("hidden"); // FOUC guards present server-side
    expect(html).toContain("Save?");
  });

  it("slider parses its inline style string into custom properties server-side", () => {
    const { LSlider } = barrel as Record<string, unknown> as { LSlider: typeof LDialog };
    const html = renderToString(createElement(LSlider, {}));
    expect(html).toContain("data-ui=\"slider\"");
    expect(html).toContain("--slider"); // style string → object → custom prop attr
  });
});

describe("client render emits no warnings for any recipe", () => {
  it("mounts every recipe under happy-dom without a React warning", () => {
    const errors: unknown[][] = [];
    const origError = console.error;
    console.error = (...a: unknown[]) => void errors.push(a);
    try {
      for (const ir of recipes.irs) {
        const { unmount } = render(createElement(componentOf(ir)));
        unmount();
      }
    } finally {
      console.error = origError;
    }
    expect(errors).toEqual([]);
  });
});
