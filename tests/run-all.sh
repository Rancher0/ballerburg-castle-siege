#!/usr/bin/env bash
# Alle Tests. Für den Browser-Test: NODE_PATH auf ein node_modules mit puppeteer-core setzen.
set -e
cd "$(dirname "$0")/.."
node tests/logic.test.mjs
node tests/sim.test.mjs 2
if [ -n "$NODE_PATH" ]; then
  python3 -m http.server 8840 --bind 127.0.0.1 >/dev/null 2>&1 & SRV=$!; sleep 1
  node tests/browser/smoke.cjs "${1:-/tmp}"; R=$?; kill $SRV; exit $R
fi
