#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
[ -f .env ] && source .env
set +a
python3 scripts/probe-proof.py
