// The version constants, in one place (task 1.0-01, FAQIR-SPEC §15).
//
// Three numbers that move independently and must never be confused:
//
//   VERSION           the npm package / CLI release. Bumped on every release by
//                     `scripts/release.mjs`, which rewrites the literal below.
//                     All seven published packages move in **lockstep** — the root
//                     `faqir-ui-cli` and the six under `packages/` carry the
//                     same number, and no package depends on another by range,
//                     so lockstep costs nothing and makes "which versions go
//                     together" a question nobody has to ask.
//   PROTOCOL_VERSION  the DOM contract — the five attributes, their value
//                     grammars, the sanctioned token modifiers and the responsive
//                     tier suffix. Frozen at 1.0; see SPEC-1.0.md.
//   SCHEMA_VERSION    the manifest contract — `manifest.schema.json`. It moves
//                     WITHIN the freeze: §8 lets the schema gain optional fields
//                     in any 1.x release, so 1.1 adds the theme-manifest fields
//                     while PROTOCOL_VERSION stays at 1.0. A manifest written
//                     against 1.0 still validates — that is what the freeze
//                     promises, and it is why these two are separate numbers.
//
// The CLI ships many releases per protocol version; that is the whole point of
// separating them. `tests/spec/protocol-1.0.test.ts` asserts that every surface
// which states one of these numbers — package.json, the schema, SPEC-1.0.md and
// the published site paths — states the same one.

/** The npm package and CLI version. Rewritten by `scripts/release.mjs`. */
export const VERSION = "1.0.0";

/**
 * The frozen attribute protocol. **Additive until 2.0** — see the amendment
 * process in SPEC-1.0.md §8 and {@link ../protocol.AMENDMENT_RULES}.
 */
export const PROTOCOL_VERSION = "1.0";

/**
 * The manifest schema — `manifest.schema.json`'s `schema_version`. Additive
 * under the frozen protocol: 1.1 (task 1.1A-07) added five optional theme
 * fields, and every 1.0 manifest still validates.
 */
export const SCHEMA_VERSION = "1.1";
