#!/usr/bin/env bash
# Phase 1 end-to-end smoke test against the running dev server.
set -euo pipefail
B="${BASE_URL:-http://localhost:3000}"

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }

echo "=== Phase 1 E2E against $B ==="

echo "--- create org ---"
ORG=$(curl -s -X POST "$B/api/orgs" -H 'Content-Type: application/json' \
  -d '{"name":"Acme Foundation","description":"E2E test org","chain":"cardano","createdBy":"addr_test1qadmin000"}')
echo "$ORG"
ID=$(echo "$ORG" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
[ -n "$ID" ] && pass "created org id=$ID" || fail "no org id returned"

echo "--- add member (member role) ---"
ADD=$(curl -s -X POST "$B/api/orgs/$ID/members" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"rMember111","chain":"xrpl","role":"member"}')
echo "$ADD" | grep -q '"rMember111"' && pass "member added" || fail "member not added: $ADD"

echo "--- promote member to admin ---"
PROMO=$(curl -s -X PATCH "$B/api/orgs/$ID/members/rMember111" -H 'Content-Type: application/json' \
  -d '{"role":"admin"}')
echo "$PROMO" | grep -q '"role":"admin"' && pass "member promoted" || fail "promote failed: $PROMO"

echo "--- duplicate member should be 409 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/orgs/$ID/members" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"rMember111","chain":"xrpl"}')
[ "$CODE" = "409" ] && pass "duplicate rejected (409)" || fail "expected 409, got $CODE"

echo "--- invalid create should be 422 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/orgs" -H 'Content-Type: application/json' \
  -d '{"name":"x"}')
[ "$CODE" = "422" ] && pass "validation rejected (422)" || fail "expected 422, got $CODE"

echo "--- remove member ---"
RM=$(curl -s -X DELETE "$B/api/orgs/$ID/members/rMember111")
echo "$RM" | grep -q '"rMember111"' && fail "member still present after delete" || pass "member removed"

echo "--- generate test identity (xrpl) ---"
GEN=$(curl -s -X POST "$B/api/wallet/generate" -H 'Content-Type: application/json' -d '{"chain":"xrpl"}')
echo "$GEN" | grep -q '"address"' && pass "test identity generated" || fail "generate failed: $GEN"

echo "--- get org detail ---"
DET=$(curl -s "$B/api/orgs/$ID")
echo "$DET" | grep -q "\"id\":\"$ID\"" && pass "org detail fetched" || fail "detail failed: $DET"

echo "=== ALL PHASE 1 E2E CHECKS PASSED ==="
