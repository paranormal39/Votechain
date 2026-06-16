#!/usr/bin/env python3
"""Inspect + probe the AgilityCore proof/create and vote/private endpoints."""
import json
import os
import urllib.request
import urllib.error

BASE = "https://agilitycore-production.up.railway.app"
KEY = os.environ.get("AGILITY_ADMIN_KEY", "")


def get(path):
    return json.loads(urllib.request.urlopen(BASE + path, timeout=30).read())


def show_schema(spec, path, method="post"):
    op = spec["paths"].get(path, {}).get(method, {})
    print(f"\n=== {method.upper()} {path} ===")
    print("summary:", op.get("summary"))
    body = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
    if body:
        # Resolve a top-level $ref if present.
        if "$ref" in body:
            ref = body["$ref"].split("/")[-1]
            body = spec.get("components", {}).get("schemas", {}).get(ref, body)
        print("request schema:", json.dumps(body, indent=2)[:1200])


def post(path, payload, auth=True):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if auth and KEY:
        req.add_header("Authorization", f"Bearer {KEY}")
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:600]


spec = get("/openapi.json")
show_schema(spec, "/api/v1/agility/proof/create")
show_schema(spec, "/api/v1/votechain/vote/private")

print("\n=== health (proof server + chain modes) ===")
h = get("/health")["data"]
print("global simulation:", h["simulation"])
print("proofServer:", h.get("proofServer"))
for name, c in h["chains"].items():
    print(f"  {name}: connected={c['connected']} mode={c['mode']}")

print("\n=== probe POST /api/v1/agility/proof/create ===")
print("admin key present:", bool(KEY))
status, resp = post("/api/v1/agility/proof/create",
                    {"circuit": "vote", "inputs": {"choice": "yes"}})
print("status:", status)
print("resp:", json.dumps(resp, indent=2)[:800] if isinstance(resp, dict) else resp)
