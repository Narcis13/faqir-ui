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

echo "✓ Smoke test passed — the CLI runs on plain Node with no Bun runtime."
