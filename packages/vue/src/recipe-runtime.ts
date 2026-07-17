// @faqir-ui/vue recipe runtime — hand-written companion to runtime.ts
// (task 0.6-13, FAQIR-NEXT §11.2). Every module in src/recipes/ is generated
// from its registry manifest by `faqir bindings vue` and is nothing but a
// typed spec passed to `defineFaqirRecipe`. This file interprets those specs:
// - render: the manifest reference template as a static VNode tree (SSR-safe —
//   plain HTML, `hidden` FOUC guards included; no window/document at render);
// - mount: `create(el)` attaches the vendored recipe controller, and its
//   `faqir:<event>` CustomEvents are re-emitted as Vue events `(detail, event)`;
// - unmount: listeners detach and `controller.destroy()` runs;
// - expose: the controller's API methods, so `dialogRef.value.open()` works.

import { defineComponent, h, onBeforeUnmount, onMounted, ref, useId } from "vue";
import type { DefineComponent, VNode, VNodeArrayChildren } from "vue";

/** One segment of an attribute value or text node. `{p}` reads a prop. */
export type RecipeSeg = string | { p: string };
/** Attr value: `true` = bare; `{b}` = bare while boolean prop is on; segs = string. */
export type RecipeAttrVal = true | { b: string } | RecipeSeg[];

export interface RecipeNode {
  tag: string;
  attrs: [string, RecipeAttrVal][];
  /** Named slot whose fill replaces this node's template children. */
  slot?: string;
  /** Variant props written onto this element when set: [prop, attr][]. */
  dyn?: [string, string][];
  children: (RecipeNode | RecipeSeg)[];
}

/** The controller API a recipe factory returns (destroy + named methods). */
export type RecipeController = Record<string, unknown> & { destroy?: () => void };

export interface FaqirRecipeSpec {
  /** Manifest name — the `data-ui` value and devtools name source. */
  name: string;
  /** Vendored controller factory, attached in onMounted. */
  create: (root: HTMLElement) => RecipeController;
  /** Controller API methods surfaced via expose (destroy stays internal). */
  methods: readonly string[];
  /** `faqir:<name>` events re-emitted as Vue events. */
  events: readonly string[];
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

/** Build a Vue 3 component from a generated recipe spec. */
export function defineFaqirRecipe<Props extends object>(
  spec: FaqirRecipeSpec
): DefineComponent<Props> {
  const props: Record<string, unknown> = { id: { type: String, default: undefined } };
  for (const sp of spec.stringProps) props[sp.prop] = { type: String, default: sp.default };
  for (const bp of spec.boolProps) props[bp] = { type: Boolean, default: false };
  for (const vp of spec.variantProps) {
    props[vp.prop] = {
      type: String,
      default: undefined,
      validator: (x: unknown) => x == null || vp.values.includes(String(x)),
    };
  }

  const component = defineComponent({
    name: `L${pascal(spec.name)}`,
    inheritAttrs: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: props as any,
    emits: [...spec.events],
    setup(p: Record<string, unknown>, { slots, emit, expose }) {
      const root = ref<HTMLElement>();
      const autoId = useId();
      let api: RecipeController | null = null;
      const cleanups: (() => void)[] = [];

      onMounted(() => {
        const el = root.value;
        if (!el) return;
        // Listeners first, so events fired during controller create are seen.
        for (const ev of spec.events) {
          const handler = (e: Event) => emit(ev, (e as CustomEvent).detail, e);
          el.addEventListener(`faqir:${ev}`, handler);
          cleanups.push(() => el.removeEventListener(`faqir:${ev}`, handler));
        }
        api = spec.create(el);
        __activeControllers.add(api);
      });

      onBeforeUnmount(() => {
        for (const c of cleanups) c();
        cleanups.length = 0;
        if (api) {
          api.destroy?.();
          __activeControllers.delete(api);
          api = null;
        }
      });

      const exposed: Record<string, unknown> = { controller: () => api };
      for (const m of spec.methods) {
        exposed[m] = (...args: unknown[]) => (api?.[m] as (...a: unknown[]) => unknown)?.(...args);
      }
      expose(exposed);

      const seg = (s: RecipeSeg): string =>
        typeof s === "string" ? s : s.p === "id" ? String(p.id ?? autoId) : String(p[s.p] ?? "");

      function renderNode(node: RecipeNode, isRoot: boolean): VNode {
        const attrs: Record<string, unknown> = {};
        for (const [name, val] of node.attrs) {
          // "" renders a bare attribute (`hidden`, `data-confirm-required`) in
          // both DOM and SSR output — `true` would stringify on data-* attrs.
          if (val === true) attrs[name] = "";
          else if (Array.isArray(val)) attrs[name] = val.map(seg).join("");
          else if (p[val.b] === true) attrs[name] = "";
        }
        if (node.dyn) {
          for (const [prop, attr] of node.dyn) if (p[prop] != null) attrs[attr] = p[prop];
        }
        if (isRoot) attrs.ref = root;

        const fill = isRoot ? slots.default : node.slot ? slots[node.slot] : undefined;
        let children: VNodeArrayChildren | string | undefined;
        if (fill) {
          children = fill();
        } else {
          const kids = node.children.map((c) =>
            typeof c === "object" && "tag" in c ? renderNode(c, false) : seg(c)
          );
          // Text-only children collapse to one string for hydration-stable output.
          children = kids.length === 0 ? undefined
            : kids.every((k) => typeof k === "string") ? kids.join("")
            : kids;
        }
        return h(node.tag, attrs, children);
      }

      return () => renderNode(spec.tree, true);
    },
  });

  return component as unknown as DefineComponent<Props>;
}
