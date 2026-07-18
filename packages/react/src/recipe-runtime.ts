// @faqir-ui/react recipe runtime — hand-written companion to runtime.ts
// (task 0.7-02, FAQIR-NEXT §11.3). Every module in src/recipes/ carries a
// `"use client"` directive and is nothing but a typed spec passed to
// `createFaqirRecipe`. This file interprets those specs:
// - render: the manifest reference template as a static React tree (SSR-safe —
//   plain elements with their contract attrs + `hidden` FOUC guards; no
//   window/document at render, so `renderToString` is clean);
// - mount (useEffect): `create(el)` attaches the vendored recipe controller and
//   its `faqir:<event>` CustomEvents are forwarded to `on<Event>` callback props;
// - unmount: listeners detach and `controller.destroy()` runs. StrictMode-safe:
//   the dev create→destroy→create double-invoke re-attaches cleanly because the
//   controller's own double-init guard is cleared by destroy() (no leak);
// - useImperativeHandle: the controller API methods, so `ref.current.open()`
//   works, plus `controller()` for the live instance.
//
// NO `"use client"` here — this shared runtime is hook-based but is pulled into
// the client graph by the recipe wrappers that import it; primitives (runtime.ts)
// never touch it, so they stay server-renderable.

import { createElement, forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";
import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  ReactNode,
  RefAttributes,
  RefObject,
} from "react";

/** One segment of an attribute value or text node. `{p}` reads a prop. */
export type RecipeSeg = string | { p: string };
/** Attr value: `true` = bare; `{b}` = bare while boolean prop is on; segs = string. */
export type RecipeAttrVal = true | { b: string } | RecipeSeg[];

export interface RecipeNode {
  tag: string;
  attrs: [string, RecipeAttrVal][];
  /** Named slot whose fill (a `ReactNode` prop) replaces this node's children. */
  slot?: string;
  /** Variant props written onto this element when set: [prop, attr][]. */
  dyn?: [string, string][];
  children: (RecipeNode | RecipeSeg)[];
}

/** The controller API a recipe factory returns (destroy + named methods). */
export type RecipeController = Record<string, unknown> & { destroy?: () => void };

/** A `faqir:<name>` event forwarded to a callback prop: `(detail, event)`. */
export type FaqirEventHandler = (detail: unknown, event: CustomEvent) => void;

/** The imperative handle a recipe exposes on its ref: controller API + accessor. */
export type RecipeHandle = Record<string, unknown> & {
  /** The live controller instance, or `null` before mount / after unmount. */
  controller: () => RecipeController | null;
};

export interface FaqirRecipeSpec {
  /** Manifest name — the `data-ui` value and devtools name source. */
  name: string;
  /** Vendored controller factory, attached in useEffect on mount. */
  create: (root: HTMLElement) => RecipeController;
  /** Controller API methods surfaced on the imperative handle (destroy stays internal). */
  methods: readonly string[];
  /** `faqir:<name>` events forwarded to `on<Event>` callback props. */
  events: readonly string[];
  /** Named-slot prop names (each a `ReactNode`), projected into their template element. */
  slots: readonly string[];
  stringProps: readonly { prop: string; default: string }[];
  boolProps: readonly string[];
  variantProps: readonly { prop: string; values: readonly string[] }[];
  tree: RecipeNode;
}

/** Live controller instances — introspection for tests and devtools. */
export const __activeControllers = new Set<RecipeController>();

function pascal(name: string): string {
  return name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());
}

/** `page-change` → `onPageChange`. */
function eventProp(event: string): string {
  return `on${pascal(event)}`;
}

// HTML attribute → React prop name for the few camelCased DOM properties that
// appear in recipe templates. `data-*` / `aria-*` pass through untouched (React
// renders them verbatim), which is the bulk of the Faqir contract.
const ATTR_RENAME: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
  maxlength: "maxLength",
  minlength: "minLength",
  autocomplete: "autoComplete",
  autocapitalize: "autoCapitalize",
  autocorrect: "autoCorrect",
  autofocus: "autoFocus",
  inputmode: "inputMode",
  enterkeyhint: "enterKeyHint",
  spellcheck: "spellCheck",
  contenteditable: "contentEditable",
  colspan: "colSpan",
  rowspan: "rowSpan",
  novalidate: "noValidate",
  formnovalidate: "formNoValidate",
  crossorigin: "crossOrigin",
  srcset: "srcSet",
};

function reactAttr(name: string): string {
  if (name.startsWith("data-") || name.startsWith("aria-")) return name;
  return ATTR_RENAME[name] ?? name;
}

/** A bare template attr → the value React needs: `""` for `data-*` (so it
 * renders as a bare data attribute), `true` for boolean HTML attrs (`hidden`). */
function bareValue(name: string): string | true {
  return name.startsWith("data-") ? "" : true;
}

/** React's `style` prop wants an object, so an inline `style="a: b; c: d"`
 * template value (e.g. slider's `--slider-end` custom property) is parsed into
 * one. Custom properties survive as-is under a `Record<string, string>`. */
function parseStyle(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of value.split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const key = decl.slice(0, i).trim();
    if (key) out[key] = decl.slice(i + 1).trim();
  }
  return out;
}

/** Attach a controller to `el`, wiring `faqir:<event>` → callbacks. Returns the
 * live API and a cleanup that detaches listeners and destroys the controller. */
function attachController(
  el: HTMLElement,
  create: (root: HTMLElement) => RecipeController,
  listeners: readonly [string, FaqirEventHandler][]
): { api: RecipeController; cleanup: () => void } {
  const bound: (() => void)[] = [];
  // Listeners first, so events fired during controller create are seen.
  for (const [ev, fn] of listeners) {
    const handler = (e: Event) => fn((e as CustomEvent).detail, e as CustomEvent);
    el.addEventListener(`faqir:${ev}`, handler);
    bound.push(() => el.removeEventListener(`faqir:${ev}`, handler));
  }
  const api = create(el);
  __activeControllers.add(api);
  return {
    api,
    cleanup() {
      for (const c of bound) c();
      api.destroy?.();
      __activeControllers.delete(api);
    },
  };
}

/** Options for the low-level `useFaqirController` escape hatch. */
export interface UseFaqirControllerOptions {
  /** `faqir:<name>` events → callback `(detail, event)`. Latest values are read
   * at dispatch time, so changing a handler never re-attaches the controller. */
  on?: Record<string, FaqirEventHandler>;
}

/**
 * Low-level escape hatch: attach any Faqir recipe controller to an arbitrary
 * element ref, StrictMode-safe. Pass the controller factory (e.g. `createDialog`,
 * re-exported from this package) — the hook creates it on mount, destroys it on
 * unmount, and forwards its `faqir:*` events to `options.on`.
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   const dialog = useFaqirController(ref, createDialog, { on: { confirm: …} });
 *   // dialog.current?.open()
 */
export function useFaqirController<T extends RecipeController = RecipeController>(
  ref: RefObject<HTMLElement | null>,
  create: (root: HTMLElement) => RecipeController,
  options?: UseFaqirControllerOptions
): RefObject<T | null> {
  const apiRef = useRef<T | null>(null);
  // Keep the latest callbacks without re-running the effect (stable identity).
  const onRef = useRef(options?.on);
  onRef.current = options?.on;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const names = onRef.current ? Object.keys(onRef.current) : [];
    const listeners: [string, FaqirEventHandler][] = names.map((ev) => [
      ev,
      (detail, event) => onRef.current?.[ev]?.(detail, event),
    ]);
    const { api, cleanup } = attachController(el, create, listeners);
    apiRef.current = api as T;
    return () => {
      apiRef.current = null;
      cleanup();
    };
    // `create` is a stable module-level factory; `ref` identity is stable.
  }, [ref, create]);

  return apiRef;
}

/** Build a React `forwardRef` recipe component from a generated spec. The ref
 * exposes the controller API (`ref.current.open()`); unknown props fall through
 * to the root element. */
export function createFaqirRecipe<Props extends object>(
  spec: FaqirRecipeSpec,
  displayName: string
): ForwardRefExoticComponent<PropsWithoutRef<Props> & RefAttributes<RecipeHandle>> {
  const owned = new Set<string>(["id", "children"]);
  for (const sp of spec.stringProps) owned.add(sp.prop);
  for (const bp of spec.boolProps) owned.add(bp);
  for (const vp of spec.variantProps) owned.add(vp.prop);
  for (const sl of spec.slots) owned.add(sl);
  const eventProps = spec.events.map((e) => [e, eventProp(e)] as const);
  for (const [, pn] of eventProps) owned.add(pn);

  const Component = forwardRef<RecipeHandle, Record<string, unknown>>((props, ref) => {
    const rootRef = useRef<HTMLElement | null>(null);
    const apiRef = useRef<RecipeController | null>(null);
    const autoId = useId();
    const id = (props.id as string | undefined) ?? autoId;

    // Latest props read at event-dispatch time — no re-attach when a callback changes.
    const propsRef = useRef(props);
    propsRef.current = props;

    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      const listeners: [string, FaqirEventHandler][] = eventProps.map(([ev, pn]) => [
        ev,
        (detail, event) =>
          (propsRef.current[pn] as FaqirEventHandler | undefined)?.(detail, event),
      ]);
      const { api, cleanup } = attachController(el, spec.create, listeners);
      apiRef.current = api;
      return () => {
        apiRef.current = null;
        cleanup();
      };
      // Mount once; controllers own their own reactivity from the DOM.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(
      ref,
      () => {
        const handle: RecipeHandle = { controller: () => apiRef.current };
        for (const m of spec.methods) {
          handle[m] = (...args: unknown[]) =>
            (apiRef.current?.[m] as ((...a: unknown[]) => unknown) | undefined)?.(...args);
        }
        return handle;
      },
      []
    );

    const seg = (s: RecipeSeg): string =>
      typeof s === "string" ? s : s.p === "id" ? id : String((props[s.p] as unknown) ?? "");

    function renderNode(node: RecipeNode, isRoot: boolean, key?: number): ReactNode {
      const attrs: Record<string, unknown> = {};
      for (const [name, val] of node.attrs) {
        const rn = reactAttr(name);
        if (val === true) attrs[rn] = bareValue(name);
        else if (Array.isArray(val)) {
          const str = val.map(seg).join("");
          attrs[rn] = name === "style" ? parseStyle(str) : str;
        } else if (props[val.b] === true) attrs[rn] = bareValue(name);
      }
      if (node.dyn) {
        for (const [prop, attr] of node.dyn) if (props[prop] != null) attrs[reactAttr(attr)] = props[prop];
      }
      if (isRoot) {
        attrs.ref = rootRef;
        // Every non-Faqir prop (className, style, onClick, aria-*, …) → root.
        for (const k in props) {
          if (owned.has(k)) continue;
          attrs[k] = props[k];
        }
      }
      if (key !== undefined) attrs.key = key;

      // A provided slot / default-children fill replaces this node's template children.
      const fill = isRoot ? props.children : node.slot ? props[node.slot] : undefined;
      let children: ReactNode;
      if (fill != null) {
        children = fill as ReactNode;
      } else {
        const kids = node.children.map((c, i) =>
          typeof c === "object" && "tag" in c ? renderNode(c, false, i) : seg(c)
        );
        // Text-only children collapse to one string for hydration-stable output.
        children =
          kids.length === 0
            ? undefined
            : kids.every((k) => typeof k === "string")
              ? (kids as string[]).join("")
              : kids;
      }
      return createElement(node.tag, attrs, children);
    }

    return renderNode(spec.tree, true);
  });

  Component.displayName = displayName;
  return Component as unknown as ForwardRefExoticComponent<
    PropsWithoutRef<Props> & RefAttributes<RecipeHandle>
  >;
}
