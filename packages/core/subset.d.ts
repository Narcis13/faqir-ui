// Types for @faqir-ui/core/subset.

/**
 * The bundle with only the component sections named in `components`, plus
 * every token, theme and base section and the header.
 */
export function subsetBundle(css: string, components: Iterable<string>): string;

/** The sections of a bundle in order, split on its `/* === path === *\/` markers. */
export function bundleSections(css: string): { label: string; component: string | undefined; text: string }[];
