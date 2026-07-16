// @faqir-ui/vue runtime — the ONLY hand-written code in this package (§11.1).
// Every component in src/components/ is generated from its registry manifest by
// `faqir bindings vue` and consists of nothing but a typed spec passed to
// `defineFaqirPrimitive`. This file interprets those specs with plain Vue 3
// render functions: the host framework owns reactivity, Faqir contributes the
// attribute contract (data-ui / data-part / data-variant / data-size /
// data-state). No faqir-core directives, no CSS — style with the Faqir bundle.

import { defineComponent, h } from "vue";
import type { DefineComponent, VNodeChild } from "vue";

/** One variant group: a string prop written to its manifest attribute. */
export interface SpecVariant {
  /** Vue prop name (attribute minus `data-`; reserved names get a suffix). */
  prop: string;
  /** Attribute written to the root element, e.g. `data-variant`. */
  attr: string;
  /** Literal union of allowed values, from the manifest. */
  values: readonly string[];
}

/** One boolean state prop and how it reflects onto the root element. */
export interface SpecState {
  prop: string;
  attr: string;
  /** Attribute value when the state is on (`null` for presence-only attrs). */
  value: string | null;
  /**
   * value    → `attr="value"` while on (data-state entries: first truthy wins)
   * presence → bare boolean attribute while on (e.g. `disabled`, `open`)
   * aria     → always rendered as `"true"`/`"false"` (e.g. `aria-pressed`)
   */
  kind: "value" | "presence" | "aria";
}

/** One named slot, projected inside a `data-part` wrapper element. */
export interface SpecSlot {
  name: string;
  /** Wrapper tag from the manifest slot's `tag_hint`. */
  tag: string;
  /** Required slots render their wrapper even when no content is provided. */
  required: boolean;
  /** Void wrappers (e.g. `img`) can't hold content: slot content is rendered
   * as-is and the caller supplies the `data-part` element itself. */
  isVoid: boolean;
}

/** The full generated spec for one primitive. */
export interface FaqirPrimitiveSpec {
  /** Manifest name — becomes the `data-ui` value. */
  name: string;
  /** Root element tag from the manifest anatomy. */
  tag: string;
  variants: readonly SpecVariant[];
  states: readonly SpecState[];
  slots: readonly SpecSlot[];
  /** Whether children/default-slot content is rendered after named slots. */
  defaultSlot: boolean;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function pascal(name: string): string {
  return name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());
}

/** Build a Vue 3 component from a generated primitive spec. */
export function defineFaqirPrimitive<Props extends object>(
  spec: FaqirPrimitiveSpec
): DefineComponent<Props> {
  const props: Record<string, unknown> = {};
  for (const v of spec.variants) {
    props[v.prop] = {
      type: String,
      default: undefined,
      validator: (x: unknown) => x == null || v.values.includes(String(x)),
    };
  }
  for (const s of spec.states) props[s.prop] = { type: Boolean, default: false };

  const voidRoot = VOID_TAGS.has(spec.tag);

  const component = defineComponent({
    name: `L${pascal(spec.name)}`,
    inheritAttrs: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: props as any,
    setup(p: Record<string, unknown>, { slots }) {
      return () => {
        const attrs: Record<string, unknown> = { "data-ui": spec.name };
        for (const v of spec.variants) {
          if (p[v.prop] != null) attrs[v.attr] = p[v.prop];
        }
        let dataState: string | undefined;
        for (const s of spec.states) {
          const on = p[s.prop] === true;
          if (s.kind === "aria") attrs[s.attr] = String(on);
          else if (!on) continue;
          else if (s.attr === "data-state") dataState ??= s.value ?? undefined;
          else if (s.kind === "presence") attrs[s.attr] = true;
          else attrs[s.attr] = s.value;
        }
        if (dataState !== undefined) attrs["data-state"] = dataState;

        if (voidRoot) return h(spec.tag, attrs);

        const children: VNodeChild[] = [];
        for (const sl of spec.slots) {
          const fill = slots[sl.name];
          if (sl.isVoid) {
            if (fill) children.push(fill());
            continue;
          }
          if (fill || sl.required) {
            children.push(h(sl.tag, { "data-part": sl.name }, fill ? fill() : undefined));
          }
        }
        if (spec.defaultSlot && slots.default) children.push(slots.default());
        return h(spec.tag, attrs, children.length ? children : undefined);
      };
    },
  });

  return component as unknown as DefineComponent<Props>;
}
