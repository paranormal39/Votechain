#!/usr/bin/env bash
# Phase 3 end-to-end smoke test: public vote, private vote, double-vote rejection.
set -euo pipefail
B="${BASE_URL:-http://localhost:3000}"

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }
field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }
num_field() { sed -n "s/.*\"$1\":\([0-9]*\).*/\1/p"; }

echo "=== Phase 3 E2E against $B ==="

echo "--- create org ---"
ORG=$(curl -s -X POST "$B/api/orgs" -H 'Content-Type: application/json' \
  -d '{"name":"Vote Test Org","description":"phase3","chain":"cardano","createdBy":"addr_test1qadmin999"}')
OID=$(echo "$ORG" | field id)
[ -n "$OID" ] && pass "org created id=$OID" || fail "no org id: $ORG"

echo "--- add voter1 and voter2 as members ---"
curl -s -X POST "$B/api/orgs/$OID/members" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"addr_voter1","chain":"cardano","role":"member"}' > /dev/null
curl -s -X POST "$B/api/orgs/$OID/members" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"addr_voter2","chain":"cardano","role":"member"}' > /dev/null
pass "members added"

echo "--- create proposal with quorum=2 ---"
PROP=$(curl -s -X POST "$B/api/orgs/$OID/proposals" -H 'Content-Type: application/json' \
  -d '{"title":"Phase 3 vote test","description":"Testing voting","type":"general","votingPeriodDays":7,"quorum":2,"createdBy":"addr_test1qadmin999"}')
PID=$(echo "$PROP" | field id)
[ -n "$PID" ] && pass "proposal created id=$PID" || fail "no proposal id: $PROP"

echo "--- activate proposal ---"
ACT=$(curl -s -X POST "$B/api/proposals/$PID/status" -H 'Content-Type: application/json' -d '{"action":"activate"}')
echo "$ACT" | grep -q '"status":"active"' && pass "proposal activated" || fail "activate failed: $ACT"

echo "--- cast public yes vote from voter1 ---"
V1=$(curl -s -X POST "$B/api/proposals/$PID/vote" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"addr_voter1","choice":"yes"}')
echo "$V1" | grep -q '"yes":1' && pass "yes vote recorded (tally.yes=1)" || fail "yes vote failed: $V1"

echo "--- double-vote from voter1 should be 409 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/proposals/$PID/vote" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"addr_voter1","choice":"no"}')
[ "$CODE" = "409" ] && pass "double-vote rejected (409)" || fail "expected 409, got $CODE"

echo "--- cast private vote from voter2 (simulated proof hash) ---"
PROOF="sim_proof_$(date +%s | md5sum | head -c8)"
V2=$(curl -s -X POST "$B/api/proposals/$PID/vote" -H 'Content-Type: application/json' \
  -d "{\"walletAddress\":\"addr_voter2\",\"proofHash\":\"$PROOF\"}")
echo "$V2" | grep -q '"choice":"private"' && pass "private vote recorded (choice=private in log)" || fail "private vote failed: $V2"

echo "--- verify tally has 2 total votes ---"
FINAL=$(curl -s "$B/api/proposals/$PID")
echo "$FINAL" | grep -q '"yes":1' && pass "tally.yes still 1 after private vote" || fail "tally mismatch: $FINAL"
VOTE_COUNT=$(echo "$FINAL" | grep -o '"walletAddress"' | wc -l | tr -d ' ')
[ "$VOTE_COUNT" = "2" ] && pass "2 votes in vote log" || fail "expected 2 votes, got $VOTE_COUNT: $FINAL"

echo "--- double-vote from voter2 should be 409 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/proposals/$PID/vote" -H 'Content-Type: application/json' \
  -d "{\"walletAddress\":\"addr_voter2\",\"proofHash\":\"sim_proof_again\"}")
[ "$CODE" = "409" ] && pass "private double-vote rejected (409)" || fail "expected 409, got $CODE"

echo "--- finalize proposal (quorum met: 2/2) ---"
FIN=$(curl -s -X POST "$B/api/proposals/$PID/status" -H 'Content-Type: application/json' -d '{"action":"finalize"}')
echo "$FIN" | grep -qE '"status":"(passed|failed)"' && pass "proposal finalized ($(echo "$FIN" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p'))" || fail "finalize failed: $FIN"

echo ""
echo "=== Phase 3 E2E complete ==="
