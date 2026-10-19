// @faqir-ui/core/subset — cut a prebuilt theme bundle (`dist/faqir.<theme>.css`)
// down to the components a page draws. Zero dependencies; runs in Node, Bun and
// a browser.
//
// The bundle is a sequence of sections, each opened by a marker on a line of
// its own:
//
//   /* === tokens/palette.css === */
//   /* === themes/slate.css === */
//   /* === base/prose.css === */
//   /* === primitives/button.css === */
//   /* === recipes/tabs.css === */
//   /* === patterns/hero.css === */
//
// The markers are a stable contract of the bundle (see README): tokens, the
// theme and the base layer come first and are always kept; a component section
// is kept when its name is in `components`.

const MARKER = /^\/\* === ([^\n]+?) === \*\/$/m;
const COMPONENT = /^(primitives|recipes|patterns)\/([a-z0-9-]+)\.css$/;

/**
 * The bundle with only the component sections named in `components`, plus
 * every token, theme and base section. Anything before the first marker (the
 * bundle's header comment) is kept.
 * @param {string} css a `faqir.<theme>.css` bundle
 * @param {Iterable<string>} components `data-ui` names, e.g. a compiled
 *   template's `ast.uses`
 * @returns {string}
 */
export function subsetBundle(css, components) {
  if (typeof css !== "string") throw new TypeError("subsetBundle: css must be a string");
  const keep = new Set(components);
  return bundleSections(css)
    .filter((s) => s.component === undefined || keep.has(s.component))
    .map((s) => s.text)
    .join("");
}

/**
 * The sections of a bundle in order: `label` is the marker's path (empty for
 * the header before the first marker), `component` the component a
 * `primitives|recipes|patterns/<name>.css` section styles, and `text` the
 * section including its marker and the blank lines after it.
 * @param {string} css
 * @returns {{ label: string, component: string | undefined, text: string }[]}
 */
export function bundleSections(css) {
  const parts = css.split(/^(?=\/\* === [^\n]+? === \*\/$)/m);
  return parts.map((text) => {
    const label = MARKER.exec(text.split("\n", 1)[0])?.[1] ?? "";
    return { label, component: COMPONENT.exec(label)?.[2], text };
  });
}
