#!/usr/bin/env bash
# Phase 5 end-to-end smoke test: Confidential Treasury lifecycle.
set -euo pipefail
B="${BASE_URL:-http://localhost:3000}"

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }
field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }
field_num() { sed -n "s/.*\"$1\":\([0-9.]*\).*/\1/p"; }

echo "=== Phase 5 E2E against $B ==="

echo "--- create org + member ---"
ORG=$(curl -s -X POST "$B/api/orgs" -H 'Content-Type: application/json' \
  -d '{"name":"Treasury Test Org","description":"phase5","chain":"xrpl","createdBy":"rTAdmin01"}')
OID=$(echo "$ORG" | field id)
[ -n "$OID" ] && pass "org created id=$OID" || fail "no org id: $ORG"

echo "--- init treasury (GET auto-creates) ---"
TREAS=$(curl -s "$B/api/orgs/$OID/treasury")
echo "$TREAS" | grep -q '"balance":"0"' && pass "treasury initialised balance=0" || fail "bad treasury: $TREAS"

echo "--- record a deposit ---"
DEP=$(curl -s -X POST "$B/api/orgs/$OID/treasury" -H 'Content-Type: application/json' \
  -d '{"amount":"1000","initiatorAddress":"rTAdmin01","memo":"Initial funding"}')
echo "$DEP" | grep -q '"balance":"1000"' && pass "deposit recorded balance=1000" || fail "deposit failed: $DEP"

echo "--- bad amount should fail 422 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/orgs/$OID/treasury" -H 'Content-Type: application/json' \
  -d '{"amount":"-50","initiatorAddress":"rTAdmin01"}')
[ "$CODE" = "422" ] && pass "negative amount rejected (422)" || fail "expected 422, got $CODE"

echo "--- create spend request (no proposal yet) ---"
SR=$(curl -s -X POST "$B/api/orgs/$OID/treasury/spend" -H 'Content-Type: application/json' \
  -d '{"amount":"200","recipientAddress":"rVendor01","purpose":"Q3 infra costs","requestedBy":"rTAdmin01"}')
SRID=$(echo "$SR" | field id)
echo "$SR" | grep -q '"status":"pending"' && pass "spend request created status=pending id=$SRID" || fail "spend request failed: $SR"

echo "--- execute spend without linked proposal should 409 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/orgs/$OID/treasury/spend?action=execute" \
  -H 'Content-Type: application/json' \
  -d "{\"spendRequestId\":\"$SRID\",\"authorisedBy\":\"rTAdmin01\"}")
[ "$CODE" = "409" ] && pass "spend blocked — no linked proposal (409)" || fail "expected 409, got $CODE"

echo "--- create + activate treasury proposal ---"
PROP=$(curl -s -X POST "$B/api/orgs/$OID/proposals" -H 'Content-Type: application/json' \
  -d '{"title":"Approve Q3 spend","description":"Approve 200 USD for infra","type":"treasury","votingPeriodDays":1,"quorum":1,"createdBy":"rTAdmin01"}')
PID=$(echo "$PROP" | field id)
curl -s -X POST "$B/api/proposals/$PID/status" -H 'Content-Type: application/json' -d '{"action":"activate"}' > /dev/null
pass "treasury proposal created+activated id=$PID"

echo "--- link proposal to spend request ---"
LINK=$(curl -s -X POST "$B/api/orgs/$OID/treasury/spend?action=link" -H 'Content-Type: application/json' \
  -d "{\"spendRequestId\":\"$SRID\",\"proposalId\":\"$PID\"}")
echo "$LINK" | grep -q '"status":"approved"' && pass "spend request linked + approved" || fail "link failed: $LINK"

echo "--- execute spend still blocked (proposal not yet passed) ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/orgs/$OID/treasury/spend?action=execute" \
  -H 'Content-Type: application/json' \
  -d "{\"spendRequestId\":\"$SRID\",\"authorisedBy\":\"rTAdmin01\"}")
[ "$CODE" = "409" ] && pass "spend blocked — proposal not passed yet (409)" || fail "expected 409, got $CODE"

echo "--- vote yes + finalize proposal ---"
curl -s -X POST "$B/api/proposals/$PID/vote" -H 'Content-Type: application/json' \
  -d '{"walletAddress":"rTAdmin01","choice":"yes"}' > /dev/null
FIN=$(curl -s -X POST "$B/api/proposals/$PID/status" -H 'Content-Type: application/json' -d '{"action":"finalize"}')
echo "$FIN" | grep -q '"status":"passed"' && pass "treasury proposal passed" || fail "finalize failed: $FIN"

echo "--- execute spend now passes (proposal passed) ---"
EXEC=$(curl -s -X POST "$B/api/orgs/$OID/treasury/spend?action=execute" -H 'Content-Type: application/json' \
  -d "{\"spendRequestId\":\"$SRID\",\"authorisedBy\":\"rTAdmin01\"}")
echo "$EXEC" | grep -q '"status":"executed"' && pass "spend executed" || fail "execute failed: $EXEC"

echo "--- treasury balance reduced by 200 ---"
TREAS2=$(curl -s "$B/api/orgs/$OID/treasury")
echo "$TREAS2" | grep -q '"balance":"800"' && pass "balance=800 after spend" || fail "balance wrong: $TREAS2"

echo "--- double-execute should 409 ---"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/orgs/$OID/treasury/spend?action=execute" \
  -H 'Content-Type: application/json' \
  -d "{\"spendRequestId\":\"$SRID\",\"authorisedBy\":\"rTAdmin01\"}")
[ "$CODE" = "409" ] && pass "double-execute rejected (409)" || fail "expected 409, got $CODE"

echo "--- cancel a pending spend request ---"
SR2=$(curl -s -X POST "$B/api/orgs/$OID/treasury/spend" -H 'Content-Type: application/json' \
  -d '{"amount":"50","recipientAddress":"rVendor02","purpose":"test cancel","requestedBy":"rTAdmin01"}')
SRID2=$(echo "$SR2" | field id)
CANCEL=$(curl -s -X DELETE "$B/api/orgs/$OID/treasury/spend?spendRequestId=$SRID2")
echo "$CANCEL" | grep -q '"status":"cancelled"' && pass "spend request cancelled" || fail "cancel failed: $CANCEL"

echo ""
echo "=== Phase 5 E2E complete ==="
