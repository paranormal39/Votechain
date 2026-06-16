# VoteChain

**Privacy-first, cross-chain governance platform.** VoteChain lets DAOs create proposals, vote privately using zero-knowledge proofs, delegate vote weight, and manage a governance-gated treasury — all across Midnight, XRPL, Xahau, and Cardano.

> Built on top of [AgilityCore](https://github.com/paranormal39/AgilityCore), which provides the cross-chain execution layer and Midnight proof server interface. VoteChain is the governance application layer — it does not duplicate AgilityCore's chain adapter or proof server logic.

---

## Features

| Feature | Status |
|---|---|
| Organization creation with join policies (open / invite / gated) | ✅ |
| Multi-chain wallet connect (Midnight Lace, Cardano Lace/CIP-30, Xaman/XUMM) | ✅ |
| Proposals with lifecycle — draft → active → passed/failed | ✅ |
| Public voting with live tally and quorum progress | ✅ |
| **Private voting** — ZK proof generated client-side; only an opaque hash reaches the server | ✅ |
| **Delegation** — delegate vote weight; revoke; profile shows incoming delegations | ✅ |
| **Confidential Treasury** — deposits, governance-gated spend requests, audit ledger | ✅ |
| Privacy modes on treasury (public / hybrid / private) | ✅ UI — ZK enforcement Phase 6 |
| Governance Audit Proofs (Compact contract integration) | 🔜 Phase 6 |
| Governance Intelligence (Mothra AI, health score) | 🔜 Phase 7 |
| Private Feedback (anonymous ZK membership proofs) | 🔜 Phase 8 |

---

## Architecture

```
Browser
  └─ Next.js BFF (App Router — route handlers)
       ├─ lib/domain/          ← org, proposal, delegation, treasury (JSON-backed, server-only)
       ├─ lib/agility/         ← AgilityCore typed REST client (server-only, holds API key)
       ├─ lib/proof/client.ts  ← ZK proof generation — runs in the browser against user's proof server
       └─ lib/wallet/          ← Midnight Lace, Cardano CIP-30, Xaman connectors
```

### Privacy model
- **Private votes**: ZK proof generated **in the browser** against the user's own Midnight proof server. Only the opaque `proofHash` is transmitted — the vote choice never leaves the browser.
- **Delegation**: relationships stored off-chain now; ZK commitment circuit planned for Phase 6.
- **Treasury**: `hybrid` / `private` spend amounts committed via ZK proof (Phase 5 ZK upgrade, post-Phase 6).

---

## Tech stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **UI**: Tailwind CSS, shadcn/ui, Lucide icons
- **Validation**: Zod
- **Persistence**: JSON file store (`.data/` — dev/preview; swap to DB for production)
- **ZK**: Midnight Compact (proof server via AgilityCore; client-side via `lib/proof/client.ts`)
- **Chains**: Midnight · XRPL · Xahau · Cardano

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in values
cp .env.example .env.local

# 3. Start the dev server
npm run dev
# → http://localhost:3000
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `AGILITY_BASE_URL` | ✅ | AgilityCore base URL (e.g. `https://agilitycore-production.up.railway.app`) |
| `AGILITY_ADMIN_KEY` | ✅ | AgilityCore Bearer API key (server-only — never sent to browser) |
| `MIDNIGHT_PROOF_SERVER_URL` | Optional | Override proof server URL (auto-detected from Midnight Lace wallet) |
| `XAMAN_API_KEY` | Optional | Xaman (XUMM) app key — from [apps.xaman.dev](https://apps.xaman.dev) |
| `XAMAN_API_SECRET` | Optional | Xaman app secret — from [apps.xaman.dev](https://apps.xaman.dev) |

> `XAMAN_API_KEY` and `XAMAN_API_SECRET` are only needed if you want Xaman/XUMM wallet support. All other wallets work without them.

---

## Wallet support

| Wallet | Chain | How to connect |
|---|---|---|
| **Midnight Lace** | Midnight | Browser extension — injects `window.midnight.mnLace` |
| **Lace / CIP-30** | Cardano | Browser extension — injects `window.cardano.*` |
| **Xaman (XUMM)** | XRPL / Xahau | QR code scan or deeplink — no browser extension needed |
| Test identity | Any | Generated server-side — for development only |

---

## Project structure

```
app/
  api/                   ← BFF route handlers
    orgs/                ← org CRUD, members, delegations, treasury
    proposals/           ← proposal lifecycle, voting
    wallet/              ← wallet generation, Xaman BFF proxy
  organizations/         ← org detail + proposal pages
  proposals/             ← proposal detail page

components/
  organizations/         ← MemberList, DelegationSection, TreasurySection
  proposals/             ← VotingSection, ProposalsSection
  wallet/                ← ConnectButton, WalletProvider

lib/
  agility/               ← AgilityCore REST client + types (server-only)
  api/                   ← respond helpers, apiFetch
  domain/                ← types, repos, services (org, proposal, delegation, treasury)
  proof/                 ← client-side ZK proof generation
  wallet/                ← Midnight Lace, Xaman connectors

scripts/
  e2e-phase3.sh          ← E2E: private voting (12/12)
  e2e-phase4.sh          ← E2E: delegation lifecycle (11/11)
  e2e-phase5.sh          ← E2E: treasury + governance gate (14/14)
  wallets/               ← test wallet generation
```

---

## Running E2E tests

Requires the dev server running at `http://localhost:3000`.

```bash
# Phase 3 — Private voting
bash scripts/e2e-phase3.sh

# Phase 4 — Delegation
bash scripts/e2e-phase4.sh

# Phase 5 — Confidential treasury
bash scripts/e2e-phase5.sh
```

## Typecheck

```bash
node ./node_modules/typescript/bin/tsc --noEmit
```

---

## Delegation

Members can delegate their vote weight to another member in the same org:

- Delegate → the delegate's votes count as `1 + number_of_active_delegations` on each proposal.
- Revoke → takes effect immediately; weight returns to the delegate on next vote.
- Self-delegation and duplicate delegation are rejected.
- Delegation profiles show incoming delegations and total weight.

---

## Confidential Treasury

Each org has a treasury with a governance-gated spend flow:

1. Admin records a **deposit** (balance increases immediately).
2. Admin creates a **spend request** with amount, recipient, purpose, and privacy mode.
3. A **treasury proposal** is created and must **pass** before the spend can execute.
4. Once the proposal passes, the spend request is auto-approved and the admin can **execute** it (balance decremented, ledger entry created).

Privacy modes:
- `public` — amount visible on-chain (fully operational).
- `hybrid` / `private` — amount ZK-committed; enforcement via Compact contract (Phase 5 ZK upgrade).

---

## Roadmap

| Phase | Name | Status |
|---|---|---|
| 0 | Technical Foundation | ✅ |
| 1 | Organization Foundation | ✅ |
| 2 | Governance Core | ✅ |
| 3 | Private Voting (ZK) | ✅ |
| 4 | Delegation | ✅ |
| 5 | Confidential Treasury | ✅ |
| 6 | Governance Audit Proofs (Compact) | 🔜 |
| 7 | Governance Intelligence | 🔜 |
| 8 | Private Feedback | 🔜 |

---

## Related

- [AgilityCore](https://github.com/paranormal39/AgilityCore) — cross-chain execution layer and Midnight proof server
- [Midnight Network](https://midnight.network) — privacy-preserving blockchain
- [Xaman (XUMM)](https://xaman.app) — XRPL / Xahau wallet
