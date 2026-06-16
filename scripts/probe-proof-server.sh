#!/usr/bin/env bash
# Probe the local Midnight proof server to discover its API surface.
set -uo pipefail
PS="${PROOF_SERVER:-http://localhost:6300}"

echo "=== Proof server probe: $PS ==="
echo

echo "--- /health ---"
curl -s "$PS/health"
echo

echo "--- route discovery (common paths) ---"
for path in / /prove /proof /generate /circuit /circuits /vote \
            /ballot /status /version /info /api /api/v1 \
            /prove/vote /proof/generate /zk/prove; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$PS$path")
  body=$(curl -s "$PS$path" | head -c 120)
  echo "$code  $path  →  $body"
done

echo
echo "--- POST /prove (empty body) ---"
curl -s -X POST "$PS/prove" -H 'Content-Type: application/json' -d '{}' | head -c 300
echo

echo "--- POST /proof/generate (empty body) ---"
curl -s -X POST "$PS/proof/generate" -H 'Content-Type: application/json' -d '{}' | head -c 300
echo
