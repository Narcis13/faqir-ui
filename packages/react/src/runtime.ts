// @faqir-ui/react runtime — the ONLY hand-written code in this package (§11.3).
// Every module in src/components/ is generated from its registry manifest by
// `faqir bindings react` and consists of nothing but a typed spec passed to
// `createFaqirPrimitive`. This file interprets those specs with plain
// `React.createElement` inside a `forwardRef`: the host framework owns
// reactivity, Faqir contributes the attribute contract (data-ui / data-part /
// data-variant / data-size / data-state).
//
// RSC-safe by construction: NO `"use client"` directive, no hooks, no
// client-only API — a primitive is importable and renderable in a React Server
// Component. Ships no CSS — style with the Faqir bundle.

import { createElement, forwardRef } from "react";
import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from "react";

/** One variant group: a string prop written to its manifest attribute. */
export interface SpecVariant {
  /** React prop name (attribute minus `data-`; reserved names get a suffix). */
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
  /** Void wrappers (e.g. `img`) can't hold content: the slot content is
   * rendered as-is and the caller supplies the `data-part` element itself. */
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
  /** Whether `children` is rendered after the named slots. */
  defaultSlot: boolean;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** Build a React `forwardRef` component from a generated primitive spec. The
 * ref forwards to the root element; unknown props fall through to it. */
export function createFaqirPrimitive<Props extends object>(
  spec: FaqirPrimitiveSpec,
  displayName: string
): ForwardRefExoticComponent<PropsWithoutRef<Props> & RefAttributes<HTMLElement>> {
  const owned = new Set<string>();
  for (const v of spec.variants) owned.add(v.prop);
  for (const s of spec.states) owned.add(s.prop);
  for (const sl of spec.slots) owned.add(sl.name);
  const voidRoot = VOID_TAGS.has(spec.tag);

  const Component = forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
    const attrs: Record<string, unknown> = { "data-ui": spec.name, ref };

    for (const v of spec.variants) {
      const value = props[v.prop];
      if (value != null) attrs[v.attr] = value;
    }

    let dataState: string | undefined;
    for (const s of spec.states) {
      const on = props[s.prop] === true;
      if (s.kind === "aria") attrs[s.attr] = String(on);
      else if (!on) continue;
      else if (s.attr === "data-state") dataState ??= s.value ?? undefined;
      else if (s.kind === "presence") attrs[s.attr] = true;
      else attrs[s.attr] = s.value;
    }
    if (dataState !== undefined) attrs["data-state"] = dataState;

    // Pass every non-Faqir, non-children prop through to the root element.
    for (const key in props) {
      if (key === "children" || owned.has(key)) continue;
      attrs[key] = props[key];
    }

    if (voidRoot) return createElement(spec.tag, attrs);

    const children: ReactNode[] = [];
    for (const sl of spec.slots) {
      const fill = props[sl.name] as ReactNode;
      if (sl.isVoid) {
        if (fill != null) children.push(fill);
        continue;
      }
      if (fill != null || sl.required) {
        children.push(createElement(sl.tag, { "data-part": sl.name }, fill));
      }
    }
    if (spec.defaultSlot && props.children != null) children.push(props.children as ReactNode);

    // Spread positionally so React never asks for keys on the projected parts.
    return createElement(spec.tag, attrs, ...children);
  });

  Component.displayName = displayName;
  return Component as unknown as ForwardRefExoticComponent<
    PropsWithoutRef<Props> & RefAttributes<HTMLElement>
  >;
}
