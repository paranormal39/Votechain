#!/usr/bin/env bash
# Phase 2 end-to-end smoke test: proposal lifecycle + comments.
set -euo pipefail
B="${BASE_URL:-http://localhost:3000}"

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }
field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }

echo "=== Phase 2 E2E against $B ==="

echo "--- create org ---"
ORG=$(curl -s -X POST "$B/api/orgs" -H 'Content-Type: application/json' \
  -d '{"name":"Gov Test Org","description":"phase2","chain":"cardano","createdBy":"addr_test1qadmin999"}')
OID=$(echo "$ORG" | field id)
[ -n "$OID" ] && pass "org created id=$OID" || fail "no org id: $ORG"

echo "--- add a member (for comment gating) ---"
curl -s -X POST "$B/api/orgs/$OID/members" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"rVoter01","chain":"xrpl","role":"member"}' > /dev/null
pass "member added"

echo "--- create proposal (draft) ---"
PROP=$(curl -s -X POST "$B/api/orgs/$OID/proposals" -H 'Content-Type: application/json' \
  -d '{"title":"Increase grants budget","description":"Raise Q3 grants by 20%","type":"general","votingPeriodDays":7,"quorum":2,"createdBy":"addr_test1qadmin999"}')
PID=$(echo "$PROP" | field id)
echo "$PROP" | grep -q '"status":"draft"' && pass "proposal created as draft id=$PID" || fail "not draft: $PROP"

echo "--- invalid proposal should be 422 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/orgs/$OID/proposals" -H 'Content-Type: application/json' \
  -d '{"title":"x","description":"","votingPeriodDays":0,"quorum":-1,"createdBy":"addr_test1qadmin999"}')
[ "$CODE" = "422" ] && pass "validation rejected (422)" || fail "expected 422, got $CODE"

echo "--- finalize before active should be 409 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/proposals/$PID/status" -H 'Content-Type: application/json' \
  -d '{"action":"finalize"}')
[ "$CODE" = "409" ] && pass "illegal transition rejected (409)" || fail "expected 409, got $CODE"

echo "--- activate proposal (draft -> active) ---"
ACT=$(curl -s -X POST "$B/api/proposals/$PID/status" -H 'Content-Type: application/json' -d '{"action":"activate"}')
echo "$ACT" | grep -q '"status":"active"' && pass "proposal activated" || fail "activate failed: $ACT"
echo "$ACT" | grep -q '"votingEndsAt"' && pass "voting window set" || fail "no voting window: $ACT"

echo "--- comment as member ---"
CMT=$(curl -s -X POST "$B/api/proposals/$PID/comments" -H 'Content-Type: application/json' \
  -d '{"author":"rVoter01","body":"I support this."}')
echo "$CMT" | grep -q 'I support this.' && pass "comment added" || fail "comment failed: $CMT"

echo "--- empty comment should be 422 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/proposals/$PID/comments" -H 'Content-Type: application/json' \
  -d '{"author":"rVoter01","body":""}')
[ "$CODE" = "422" ] && pass "empty comment rejected (422)" || fail "expected 422, got $CODE"

echo "--- finalize proposal (active -> failed, 0 votes < quorum 2) ---"
FIN=$(curl -s -X POST "$B/api/proposals/$PID/status" -H 'Content-Type: application/json' -d '{"action":"finalize"}')
echo "$FIN" | grep -q '"status":"failed"' && pass "finalized as failed (quorum not met)" || fail "finalize wrong: $FIN"

echo "--- proposal list shows the proposal ---"
LIST=$(curl -s "$B/api/orgs/$OID/proposals")
echo "$LIST" | grep -q "$PID" && pass "proposal appears in list" || fail "missing from list"

echo "--- get proposal detail ---"
DET=$(curl -s "$B/api/proposals/$PID")
echo "$DET" | grep -q "\"id\":\"$PID\"" && pass "detail fetched" || fail "detail failed: $DET"

echo "--- missing proposal should be 404 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$B/api/proposals/does-not-exist")
[ "$CODE" = "404" ] && pass "missing proposal 404" || fail "expected 404, got $CODE"

echo "=== ALL PHASE 2 E2E CHECKS PASSED ==="
