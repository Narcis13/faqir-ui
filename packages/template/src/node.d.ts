// Types for @faqir-ui/template/node (docs/template.md §15.2).

/** A loader reading `<root>/<name>` as UTF-8; null for anything outside the root or missing. */
export function createFileLoader(root: string): (name: string) => string | null;
