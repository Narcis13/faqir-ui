#!/usr/bin/env bash
#
# CI-runnable smoke test for the compiled, Node-compatible CLI.
#
# Builds dist/faqir.mjs (when Bun is available) and then drives it with `node`
# — i.e. the runtime path used on a machine with no Bun installed. Fails fast
# on any non-zero exit.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist/faqir.mjs"

echo "▶ Preparing Node-compatible CLI bundle…"
if command -v bun >/dev/null 2>&1; then
  node "$ROOT/scripts/build-cli.mjs"
elif [ ! -f "$DIST" ]; then
  echo "✗ Need either Bun (to build) or a prebuilt dist/faqir.mjs" >&2
  exit 1
else
  echo "  (Bun not found — using existing $DIST)"
fi

if [ ! -f "$DIST" ]; then
  echo "✗ dist/faqir.mjs was not produced" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "▶ node dist/faqir.mjs --version"
node "$DIST" --version

echo "▶ node dist/faqir.mjs help"
node "$DIST" help >/dev/null

echo "▶ node dist/faqir.mjs list"
node "$DIST" list >/dev/null

echo "▶ node dist/faqir.mjs init            (temp project: $TMP)"
( cd "$TMP" && node "$DIST" init >/dev/null )

echo "▶ node dist/faqir.mjs add button --dry-run"
( cd "$TMP" && node "$DIST" add button --dry-run >/dev/null )

echo "▶ node dist/faqir.mjs add button"
( cd "$TMP" && node "$DIST" add button >/dev/null )

if [ ! -f "$TMP/ui/primitives/button/button.css" ]; then
  echo "✗ add did not install component files" >&2
  exit 1
fi

echo "▶ node dist/faqir.mjs theme generate smoke-brand --accent '#168c5b' --depth hard --json"
# The seed reaches the generator, the scorecard comes back versioned, and the
# four artefacts land on disk — on Node, where `Bun.write`/`Bun.file` are the
# runtime shim rather than the real thing. [1.1A-11]
THEME_OUT="$( cd "$TMP" && node "$DIST" theme generate smoke-brand --accent '#168c5b' --depth hard --json )"
if ! printf '%s' "$THEME_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.scorecard_version!==2){console.error("bad scorecard version");process.exit(1)}if(r.seed.depth!=="hard"||r.axes.depth!=="hard"){console.error("seed/axes did not round-trip");process.exit(1)}if(!r.tap_targets.length||!r.tap_targets.every(t=>t.passes)){console.error("tap targets missing or failing");process.exit(1)}})'; then
  echo "✗ theme generate --json did not emit a valid scorecard" >&2
  exit 1
fi
for artefact in css theme.json seed.json preview.html; do
  if [ ! -f "$TMP/themes/smoke-brand.$artefact" ]; then
    echo "✗ theme generate did not write themes/smoke-brand.$artefact" >&2
    exit 1
  fi
done

echo "▶ node dist/faqir.mjs theme generate smoke-clone …  (must be refused)"
# The distinctiveness gate reads the OUTPUT DIRECTORY off disk, which is the one
# part of it that is filesystem work — so it is proven on Node, not only under
# Bun. Same seed, different name: a recolour of the theme just written. [1.1A-12]
if ( cd "$TMP" && node "$DIST" theme generate smoke-clone --accent '#168c5b' --depth hard >/dev/null 2>&1 ); then
  echo "✗ theme generate wrote a look-alike theme instead of refusing it" >&2
  exit 1
fi
if [ -f "$TMP/themes/smoke-clone.css" ]; then
  echo "✗ theme generate refused but wrote the stylesheet anyway" >&2
  exit 1
fi
if ! ( cd "$TMP" && node "$DIST" theme generate smoke-clone --accent '#168c5b' --depth hard --allow-similar >/dev/null 2>&1 ); then
  echo "✗ --allow-similar did not override the distinctiveness refusal" >&2
  exit 1
fi

echo "▶ echo '<button data-ui=\"button\" data-variant=\"neon\">…</button>' | node dist/faqir.mjs audit --stdin --json"
# Piped HTML → audit against the registry, machine-readable output. The bad
# variant must be reported (exit 1) and the payload must carry the schema version.
STDIN_OUT="$(printf '%s' '<button data-ui="button" data-variant="neon">x</button>' | node "$DIST" audit --stdin --json || true)"
if ! printf '%s' "$STDIN_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.audit_schema_version!==1){console.error("bad schema version");process.exit(1)}if(r.passed!==false){console.error("expected findings");process.exit(1)}})'; then
  echo "✗ audit --stdin --json did not emit the expected versioned JSON" >&2
  exit 1
fi

echo "✓ Smoke test passed — the CLI runs on plain Node with no Bun runtime."
