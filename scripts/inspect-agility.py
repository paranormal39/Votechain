#!/usr/bin/env python3
"""Inspect the deployed AgilityCore OpenAPI spec for config / chain / proof controls."""
import json
import sys
import urllib.request

URL = "https://agilitycore-production.up.railway.app/openapi.json"

raw = urllib.request.urlopen(URL, timeout=30).read()
spec = json.loads(raw)
paths = spec.get("paths", {})
print(f"{len(paths)} paths total\n")

# Group by first segment for a quick map.
print("=== ALL ENDPOINTS ===")
for p in sorted(paths):
    methods = ",".join(m.upper() for m in paths[p] if m in
                       ("get", "post", "put", "patch", "delete"))
    print(f"  {methods:12} {p}")

# Highlight anything that smells like configuration / mode / chain / proof.
KEYWORDS = ("config", "mode", "simulat", "chain", "proof", "admin",
            "setting", "connect", "live", "network", "env")
print("\n=== POSSIBLE CONFIG/MODE/PROOF CONTROLS ===")
hits = []
for p in sorted(paths):
    low = p.lower()
    if any(k in low for k in KEYWORDS):
        for m, op in paths[p].items():
            if m not in ("get", "post", "put", "patch", "delete"):
                continue
            summary = op.get("summary") or op.get("description") or ""
            hits.append(f"  {m.upper():6} {p}  — {summary}")
for h in hits:
    print(h)
if not hits:
    print("  (none found by keyword)")
