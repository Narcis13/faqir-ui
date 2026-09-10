// The canonical published locations of the frozen 1.0 contract (task 1.0-04,
// SPEC-1.0 §10), in one place.
//
// Why this file exists at all
// ---------------------------
// SPEC-1.0 freezes a protocol, and a frozen protocol's URLs are part of what is
// frozen: the schema's `$id` is an *identity*, not a convenience link, and
// changing it later means anyone who cached the old one has a different schema.
// So the origin had to be a name that will still be there — and it had to be
// one that resolves today, because a canonical URL that 404s teaches every
// reader that the contract is aspirational.
//
// The repository is that name. Every URL below is a git ref on GitHub, which
// means the published bytes and the repository bytes are the same bytes by
// construction — there is no copy step to drift, no host to keep paid, and no
// window where the site is stale relative to the tag. The versioned URLs are
// pinned to {@link SPEC_REF}, an immutable release tag; the alias tracks
// `main`, which is what "always the newest 1.x schema" has to mean.
//
// The one thing this buys less of than a vanity domain: portability. If the
// project later publishes at its own origin, every URL here moves together and
// the schema `$id` changes with them — a schema-identity change, and therefore
// a 2.0 concern, not a 1.x one. That is the tradeoff, recorded rather than
// discovered later.
//
// `tests/spec/protocol-1.0.test.ts` holds `manifest.schema.json` and
// `SPEC-1.0.md` against these constants, so the prose, the schema and the code
// cannot disagree about where the contract lives.

import { PROTOCOL_VERSION } from "./version";

/** The GitHub account and repository that publish the contract. */
export const REPO_OWNER = "Narcis13";
export const REPO_NAME = "faqir-ui";
export const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`;

/** The repository's own page — the project's canonical home. */
export const REPO_URL = `https://github.com/${REPO_SLUG}`;

/** Raw file bytes, addressable by any git ref. */
export const RAW_ORIGIN = `https://raw.githubusercontent.com/${REPO_SLUG}`;

/**
 * The moving ref. The schema `$id` resolves here, so it always serves the
 * newest 1.x schema — additive amendments (SPEC-1.0 §8) appear on this ref the
 * moment they land, which is precisely the alias semantics §10 promises.
 */
export const ALIAS_REF = "main";

/**
 * The release tag SPEC-1.0 froze at. **Never moves**, and deliberately not
 * derived from {@link VERSION}: the CLI ships many releases per protocol
 * version, and the pinned spec URL must keep serving the bytes 1.0 froze with
 * however far the package version travels past it.
 */
export const SPEC_REF = "v1.0.0";

/** The spec document's filename, carrying its own protocol version. */
export const SPEC_DOC = `SPEC-${PROTOCOL_VERSION}.md`;

/** The manifest schema's filename, at the repository root. */
export const SCHEMA_DOC = "manifest.schema.json";

// ── The four published locations of §10 ─────────────────────────────────────

/** The specification, rendered. GitHub renders markdown at a blob URL. */
export const SPEC_RENDERED_URL = `${REPO_URL}/blob/${SPEC_REF}/${SPEC_DOC}`;

/** The specification's source bytes, for an agent that would rather read markdown. */
export const SPEC_MARKDOWN_URL = `${RAW_ORIGIN}/${SPEC_REF}/${SPEC_DOC}`;

/** Manifest schema 1.0, pinned to the freeze. Serves these bytes after 1.1 exists. */
export const SCHEMA_PINNED_URL = `${RAW_ORIGIN}/${SPEC_REF}/${SCHEMA_DOC}`;

/** The schema's own `$id` — the alias that always serves the newest 1.x schema. */
export const SCHEMA_ID_URL = `${RAW_ORIGIN}/${ALIAS_REF}/${SCHEMA_DOC}`;

/** The amendment process the schema points at — §8 of the pinned spec. */
export const AMENDMENT_POLICY_URL = `${SPEC_RENDERED_URL}#8-stability-and-the-amendment-process`;

/** Every canonical URL, for the gate that asserts §10 names all of them. */
export const PUBLISHED_LOCATIONS = [
  SPEC_RENDERED_URL,
  SPEC_MARKDOWN_URL,
  SCHEMA_PINNED_URL,
  SCHEMA_ID_URL,
] as const;

// ── The documentation site ──────────────────────────────────────────────────

/**
 * Where the generated site is served. Distinct from everything above on
 * purpose: the site is a *deployment*, the contract is an *identity*, and
 * conflating them is what made a dead domain load-bearing for a frozen schema.
 * Moving the site is a one-line change here; moving the schema `$id` is not.
 *
 * `wrangler.toml` names the Pages project `faqir-ui`, so `bun run deploy:site`
 * publishes to exactly this origin with no further configuration.
 */
export const SITE_ORIGIN = "https://faqir-ui.pages.dev";
