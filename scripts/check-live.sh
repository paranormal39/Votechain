#!/usr/bin/env bash
# Quick live-state probe: compares our BFF health proxy vs the deployed server.
set -euo pipefail
B="${BASE_URL:-http://localhost:3000}"
AGILITY="${AGILITY_URL:-https://agilitycore-production.up.railway.app}"

echo "=== our app /api/health (should be fresh, no cache) ==="
curl -s "$B/api/health" \
  | grep -oE '"simulation":(true|false)|"uptime":[0-9.]+|"connected":(true|false)|"mode":"[a-z]+"' \
  | head -8

echo
echo "=== deployed server /health (direct) ==="
curl -s "$AGILITY/health" \
  | grep -oE '"simulation":(true|false)|"uptime":[0-9.]+|"connected":(true|false)|"mode":"[a-z]+"' \
  | head -8
