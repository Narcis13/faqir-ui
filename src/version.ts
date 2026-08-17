// The version constants, in one place (task 1.0-01, FAQIR-SPEC §15).
//
// Three numbers that move independently and must never be confused:
//
//   VERSION           the npm package / CLI release. Bumped on every release by
//                     `scripts/release.mjs`, which rewrites the literal below.
//   PROTOCOL_VERSION  the DOM contract — the five attributes, their value
//                     grammars, the sanctioned token modifiers and the responsive
//                     tier suffix. Frozen at 1.0; see SPEC-1.0.md.
//   SCHEMA_VERSION    the manifest contract — `manifest.schema.json`. Frozen at
//                     1.0 alongside the protocol.
//
// The CLI ships many releases per protocol version; that is the whole point of
// separating them. `tests/spec/protocol-1.0.test.ts` asserts that every surface
// which states one of these numbers — package.json, the schema, SPEC-1.0.md and
// the published site paths — states the same one.

/** The npm package and CLI version. Rewritten by `scripts/release.mjs`. */
export const VERSION = "0.2.4";

/**
 * The frozen attribute protocol. **Additive until 2.0** — see the amendment
 * process in SPEC-1.0.md §8 and {@link ../protocol.AMENDMENT_RULES}.
 */
export const PROTOCOL_VERSION = "1.0";

/** The frozen manifest schema — `manifest.schema.json`'s `schema_version`. */
export const SCHEMA_VERSION = "1.0";
