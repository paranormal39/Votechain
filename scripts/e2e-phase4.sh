#!/usr/bin/env bash
# Phase 4 end-to-end smoke test: delegation lifecycle + delegated vote weight.
set -euo pipefail
B="${BASE_URL:-http://localhost:3000}"

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }
field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }

echo "=== Phase 4 E2E against $B ==="

echo "--- create org ---"
ORG=$(curl -s -X POST "$B/api/orgs" -H 'Content-Type: application/json' \
  -d '{"name":"Delegation Test Org","description":"phase4","chain":"xrpl","createdBy":"rAdmin001"}')
OID=$(echo "$ORG" | field id)
[ -n "$OID" ] && pass "org created id=$OID" || fail "no org id: $ORG"

echo "--- add delegator and delegate as members ---"
curl -s -X POST "$B/api/orgs/$OID/members" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"rDelegator01","chain":"xrpl","role":"member"}' > /dev/null
curl -s -X POST "$B/api/orgs/$OID/members" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"rDelegate01","chain":"xrpl","role":"member"}' > /dev/null
pass "members added"

echo "--- create delegation ---"
DEL=$(curl -s -X POST "$B/api/orgs/$OID/delegations" -H 'Content-Type: application/json' \
  -d '{"delegatorAddress":"rDelegator01","delegateAddress":"rDelegate01"}')
echo "$DEL" | grep -q '"active":true' && pass "delegation created (active=true)" || fail "delegation failed: $DEL"
DID=$(echo "$DEL" | field id)

echo "--- self-delegation should fail 422 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/orgs/$OID/delegations" -H 'Content-Type: application/json' \
  -d '{"delegatorAddress":"rDelegate01","delegateAddress":"rDelegate01"}')
[ "$CODE" = "422" ] && pass "self-delegation rejected (422)" || fail "expected 422, got $CODE"

echo "--- duplicate delegation should fail 409 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/orgs/$OID/delegations" -H 'Content-Type: application/json' \
  -d '{"delegatorAddress":"rDelegator01","delegateAddress":"rDelegate01"}')
[ "$CODE" = "409" ] && pass "duplicate delegation rejected (409)" || fail "expected 409, got $CODE"

echo "--- delegate profile shows weight=2 ---"
PROFILE=$(curl -s "$B/api/orgs/$OID/delegations/profile/rDelegate01")
echo "$PROFILE" | grep -q '"voteWeight":2' && pass "delegate voteWeight=2" || fail "weight not 2: $PROFILE"

echo "--- create + activate proposal (quorum=1) ---"
PROP=$(curl -s -X POST "$B/api/orgs/$OID/proposals" -H 'Content-Type: application/json' \
  -d '{"title":"Delegation vote test","description":"test","type":"general","votingPeriodDays":7,"quorum":1,"createdBy":"rAdmin001"}')
PID=$(echo "$PROP" | field id)
curl -s -X POST "$B/api/proposals/$PID/status" -H 'Content-Type: application/json' -d '{"action":"activate"}' > /dev/null
pass "proposal activated id=$PID"

echo "--- delegate casts vote (should count as weight 2) ---"
VOTE=$(curl -s -X POST "$B/api/proposals/$PID/vote" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"rDelegate01","choice":"yes"}')
echo "$VOTE" | grep -q '"yes":2' && pass "delegated vote tally.yes=2 (weight applied)" || fail "tally wrong: $VOTE"

echo "--- revoke delegation ---"
REV=$(curl -s -X DELETE "$B/api/orgs/$OID/delegations" -H 'Content-Type: application/json' \
  -d '{"delegatorAddress":"rDelegator01"}')
echo "$REV" | grep -q '"active":false' && pass "delegation revoked (active=false)" || fail "revoke failed: $REV"

echo "--- profile weight back to 1 after revoke ---"
PROFILE2=$(curl -s "$B/api/orgs/$OID/delegations/profile/rDelegate01")
echo "$PROFILE2" | grep -q '"voteWeight":1' && pass "voteWeight=1 after revoke" || fail "weight not 1: $PROFILE2"

echo "--- revoke non-existent delegation should 404 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$B/api/orgs/$OID/delegations" -H 'Content-Type: application/json' \
  -d '{"delegatorAddress":"rDelegator01"}')
[ "$CODE" = "404" ] && pass "second revoke rejected (404)" || fail "expected 404, got $CODE"

echo ""
echo "=== Phase 4 E2E complete ==="
