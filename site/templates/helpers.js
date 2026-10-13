// The helpers the docs site registers with @faqir-ui/template. A helper is
// the host's code, never the template's: plain functions, declared to
// `compile` by name and passed to `render` by value.

export const helpers = {
  upper: (text) => String(text).toUpperCase(),
  plural: (count, one, many) => (count === 1 ? one : many),
  money: (cents) => `€${(cents / 100).toFixed(2)}`,
};
