# VoteChain MVP Milestones

> Full roadmap (all 8 phases, architecture, open questions): `docs/roadmap.md`
> Per-phase progress detail: `docs/milestone.md`
> Session handover: `docs/handover.md`

## Roadmap at a glance

| Phase | Name | Status |
|---|---|---|
| 0 | Technical Foundation (terminal harness, AgilityCore integration) | ✅ Complete |
| 1 | Organization Foundation (org creation, members, roles, wallet connect) | ✅ Complete |
| 2 | Governance Core (proposals, discussion, lifecycle, quorum) | ✅ Complete |
| 3 | Private Voting (ZK ballot, proof flow, public results) | ✅ Complete |
| 4 | Delegation (delegate registry, revocation, delegate profiles) | ✅ Complete |
| 5 | Confidential Treasury (treasury proposals, governance-gated spend, privacy modes) | ✅ Complete |
| 6 | Governance Audit Proofs (proof receipts, compliance dashboard, export) | ⬜ Next |
| 7 | Governance Intelligence (Mothra AI, health score, analytics) | ⬜ |
| 8 | Private Feedback (anonymous member feedback, ZK identity, admin dashboard) | ⬜ |

---

## Phase 0 — Technical Foundation (Terminal Harness) ✅

* [x] Create project directory structure
* [x] TypeScript project scaffold (ESM, tsx, node:test, ESLint/Prettier)
* [x] Environment configuration (`.env` loader + zod-validated config)
* [x] AgilityCore connection configuration (typed REST client)
* [x] Generative test wallets for all four chains (Midnight, XRPL, Xahau, Cardano)
* [x] Connection test suite vs live server (public endpoints: 7/7 passing)
* [x] Authenticated/admin endpoints verified (8/8 passing with admin key)
* [ ] Frontend scaffold (Next.js + TypeScript) — deferred (Phase 1 is terminal-first)

**Status:** Phase 1 complete (15/15 connection tests passing)
**Completion:** M1 complete
