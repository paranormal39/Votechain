# VoteChain — Handover

Updated at the end of every development session. Everything a new contributor (human or AI) needs to continue immediately.

---

## Session: 2026-06-17 — DAO Launchpad Pivot · Phase A 🟡

### Current State
- `tsc --noEmit` **clean**. Dev server in WSL at `http://localhost:3000`.
- VoteChain pivoted to a **DAO launchpad**: orgs are now born from funded projects. Phase A foundation (chain adapters + funding lifecycle + project UI) landed. Midnight escrow contract and the Discord bot are not yet built.

### Architecture (new)
- **`lib/chains/`** — pluggable per-chain adapter abstraction.
  - `types.ts` — `ChainAdapter` interface, `EscrowRef`, `SignerAuth`, `MembershipConfig`, errors.
  - `xrpl-adapter.ts` — XRPL/Xahau. Reads via validated JSON-RPC (`account_info`, `account_tx`); writes built + offline-signed with `xrpl.Wallet` and submitted via the `submit` RPC (no WebSocket). Mints NFTs (`NFTokenMint`) / issued tokens; refunds + release as `Payment`.
  - `midnight-adapter.ts` — wraps the (pending) Compact escrow contract. Reads return 0/empty (shielded by design); writes throw `AdapterUnsupportedError` until `MIDNIGHT_ESCROW_ADDRESS` is set, treated best-effort upstream.
  - `registry.ts` — `getChainAdapter(chain)`; launchpad chains = xrpl, xahau, midnight.
- **`lib/launchpad/`** — funding domain.
  - `project-types.ts`, `contribution-types.ts`; `project-repository.ts` (`.data/projects.json`), `contribution-repository.ts` (`.data/contributions.json`).
  - `crypto.ts` — AES-256-GCM (`LAUNCHPAD_ENCRYPTION_KEY`); `identity-repository.ts` — encrypted Discord↔wallet links (`.data/identity-links.json`).
  - `project-service.ts` — `createProject`, `openFunding`, `syncContributions`, `activate` (release → mint → create org via `orgService` → add members/eligible voters), `fail`, `refund`, `bindGuild`.
  - `membership-mint.ts` — best-effort mint to each contributor.
- **`lib/midnight/config.ts`** — added `votechainEscrowConfig`, `DEPLOYED_ADDRESSES.escrow`, `isEscrowContractDeployed()`.

### Last Changes
- New API: `app/api/projects/route.ts`, `app/api/projects/[id]/{route,status,contributions,contribute}/route.ts`.
- `lib/domain/schemas.ts` — `createProjectSchema`, `projectActionSchema`, `bindGuildSchema`, `membershipConfigSchema`.
- `lib/api/respond.ts` — maps `ProjectNotFoundError` (404) + `ProjectStateError` (409).
- `lib/domain/proposal-service.ts` — Live gate in `activateProposal`.
- `app/api/orgs/route.ts` — direct POST disabled (`ORG_CREATE_DISABLED`).
- UI: `app/projects/{page,new/page,[id]/page}.tsx`; `components/nav.tsx` + `app/page.tsx` CTAs; `app/organizations/new/page.tsx` → launchpad redirect.
- `.env.example` + `package.json` (xrpl/ripple-keypairs → deps).

### Open Tasks (next)
- **Escrow Compact contract**: author `open_escrow/deposit/release/refund/mint_membership_credential`, compile into `contract/dist/managed/votechain-escrow`, deploy to Preview, set `MIDNIGHT_ESCROW_ADDRESS`, wire `midnight-adapter` writes.
- **Phase B Discord bot** (`bot/`): hosted multi-tenant, OAuth2 install + `/setup`, `/link` (ZK proof for Midnight, encrypted mapping), proposal/vote commands, private-vote deep link, internal API (`BOT_INTERNAL_SECRET`).
- **E2E**: draft → fund (XRPL testnet) → activate → org+members → proposal gated until Live.
- **Decisions to finalize**: XRPL escrow custody (who holds escrow seeds; faucet-funding new escrow accounts on testnet), `LAUNCHPAD_ENCRYPTION_KEY` management/rotation.

### How to run
```bash
cd /home/anthony/CascadeProjects/Windsurf-Porject/votechain
npm run dev        # app: http://localhost:3000  → /projects
npm run typecheck  # tsc --noEmit
```

---

## Session: 2026-06-16 — Phase 5 Confidential Treasury ✅

### Current State
- `tsc --noEmit` **clean**. Dev server in WSL at `http://localhost:3000`.
- **Phase 5 ✅ complete.** E2E: **14/14 passing** (`scripts/e2e-phase5.sh`).

### Last Changes
- **`lib/domain/treasury-types.ts`** — `TreasuryAccount`, `SpendRequest`, `TreasuryTx`, `DepositInput`, `CreateSpendRequestInput`, `ExecuteSpendInput`, `PrivacyMode`.
- **`lib/domain/treasury-repository.ts`** — JSON file store (`.data/treasury.json`); arithmetic helpers; `TreasuryNotFoundError`, `TreasuryStateError`, `SpendRequestNotFoundError`.
- **`lib/domain/treasury-service.ts`** — `deposit`, `createSpendRequest`, `executeSpend` (governance gate), `cancelSpendRequest`, `linkProposal`, `approveSpendRequest`, `getOrInit`.
- **`lib/domain/proposal-service.ts`** — `finalizeProposal` now auto-approves linked spend requests when a treasury proposal passes.
- **`lib/domain/schemas.ts`** — treasury schemas: `depositSchema`, `createSpendRequestSchema`, `executeSpendSchema`, `linkProposalSchema`.
- **`lib/api/respond.ts`** — treasury error types mapped to HTTP responses.
- **`app/api/orgs/[id]/treasury/route.ts`** — GET (init/fetch) + POST (deposit).
- **`app/api/orgs/[id]/treasury/spend/route.ts`** — POST (create / execute?action=execute / link?action=link) + DELETE (cancel).
- **`components/organizations/treasury-section.tsx`** — full UI: balance display, privacy mode badge, deposit form, spend request form, pending requests list, ledger history.
- **`app/organizations/[id]/page.tsx`** — embeds `TreasurySection` for members.
- **`scripts/e2e-phase5.sh`** — 14/14 PASS.

### Phase 5 Acceptance Criteria Status
- [x] Admin can record deposits; running balance maintained.
- [x] Spend request created with purpose + recipient + privacy mode.
- [x] Spend blocked without a linked passed proposal (governance gate).
- [x] Treasury proposal passes → linked spend requests auto-approved.
- [x] Execute spend: balance decremented, ledger entry recorded.
- [x] Double-execute rejected (409). Cancel pending spend works.
- [x] Privacy mode selector (public / hybrid / private) — UI ready; ZK enforcement deferred to Phase 5 ZK upgrade via Compact contract.

### Privacy mode status
- `public` — fully functional (amounts visible in ledger).
- `hybrid` / `private` — field stored, UI surfaced; on-chain ZK enforcement requires Phase 5 ZK upgrade (see `docs/smart-contracts-needed.md#contract-4`).

### Open Tasks (next session — Phase 6: Governance Audit Proofs)
- Phase 6: proof receipts for finalized proposals, compliance dashboard, audit export.
- This is where the Compact `votechain.compact` contract becomes critical (see `docs/smart-contracts-needed.md`).
- AgilityCore treasury delegation endpoint (Phase 5 ZK upgrade, pre-documented in `agilitycore-update-requirements.md`).

### How to run
```bash
cd /home/anthony/CascadeProjects/Windsurf-Porject/votechain
npm run dev
# app: http://localhost:3000
```

---

## Session: 2026-06-16 — Phase 4 Delegation + Xaman Wallet ✅

### Current State
- `tsc --noEmit` **clean**. Dev server in WSL at `http://localhost:3000`.
- **Phase 4 ✅ complete.** E2E: **11/11 passing** (`scripts/e2e-phase4.sh`).
- **Xaman wallet** connect flow wired (QR modal + deeplink + BFF proxy).

### Last Changes
- **`lib/domain/delegation-types.ts`** — `Delegation`, `DelegateInput`, `RevokeDelegationInput`, `DelegateProfile` types.
- **`lib/domain/delegation-repository.ts`** — JSON file store (`.data/delegations.json`); `DuplicateDelegationError`, `SelfDelegationError`, `DelegationNotFoundError`.
- **`lib/domain/delegation-service.ts`** — `delegate`, `revoke`, `getDelegateProfile`, `resolveVoteWeight`.
- **`lib/domain/proposal-repository.ts`** — `addVote`/`addPrivateVote` accept optional `weight` param; tally incremented by weight; `VoteCast.delegatedWeight` field added.
- **`lib/domain/proposal-types.ts`** — `VoteCast.delegatedWeight?: number` added.
- **`lib/domain/proposal-service.ts`** — `castVote`/`castPrivateVote` call `delegationService.resolveVoteWeight` before recording vote.
- **`lib/domain/schemas.ts`** — `delegateSchema`, `revokeDelegationSchema`.
- **`lib/api/respond.ts`** — delegation error types mapped to HTTP responses.
- **`app/api/orgs/[id]/delegations/route.ts`** — GET (list), POST (create), DELETE (revoke).
- **`app/api/orgs/[id]/delegations/profile/[addr]/route.ts`** — GET delegate profile.
- **`components/organizations/delegation-section.tsx`** — full UI: outgoing delegation selector, incoming delegations list, revoke button, weight badge.
- **`app/organizations/[id]/page.tsx`** — embeds `DelegationSection` for members.
- **`lib/wallet/xaman.ts`** — Xaman sign-in payload creation + polling (client-side, BFF-backed).
- **`app/api/wallet/xaman/route.ts`** — BFF proxy for Xaman API; holds `XAMAN_API_KEY`/`XAMAN_API_SECRET` server-side.
- **`components/wallet/connect-button.tsx`** — Xaman section with QR modal + deeplink fallback.
- **`docs/agilitycore-update-requirements.md`** — Phase 4 delegation section added (pre-doc for ZK upgrade).
- **`docs/smart-contracts-needed.md`** — delegation circuit detail already present.
- **`scripts/e2e-phase4.sh`** — 11/11 PASS.

### Phase 4 Acceptance Criteria Status
- [x] Member can delegate to another member; weight applied immediately.
- [x] Delegate votes on a proposal; tally reflects weight (own + delegated).
- [x] Revocation takes effect on the next vote (active flag cleared immediately).
- [x] Delegate profile shows incoming delegations + total weight.
- [x] Self-delegation rejected (422). Duplicate delegation rejected (409).
- [x] Xaman (XUMM) QR sign-in flow connected for XRPL/Xahau wallets.

### Xaman setup required
Set env vars (`.env.local` in dev, Railway in prod):
```
XAMAN_API_KEY=<from https://apps.xaman.dev>
XAMAN_API_SECRET=<from https://apps.xaman.dev>
```
Without these, Xaman connect returns 503 `XAMAN_NOT_CONFIGURED` — all other wallets unaffected.

### Open Tasks (next session — Phase 5: Confidential Treasury)
- Phase 5: treasury dashboard, treasury proposals, governance-gated spend, audit trail.
- Cardano gating (Blockfrost) — deferred carry-forward.
- Server-side admin auth for `PATCH /api/orgs/[id]` — flagged hardening item.
- AgilityCore out of sim mode — `MIDNIGHT_PROOF_SERVER_URL` env var on Railway.

### How to run
```bash
# Inside a WSL shell
cd /home/anthony/CascadeProjects/Windsurf-Porject/votechain
npm run dev
# app: http://localhost:3000
```

---

## Session: 2026-06-16 — Phase 3 Private Voting ✅ + Lace Wallet Fix

### Current State
- `tsc --noEmit` **clean**. Dev server running in WSL at `http://localhost:3000`.
- **Phase 3 ✅ complete.** All acceptance criteria met. E2E: **12/12 passing** (`scripts/e2e-phase3.sh`).
- **Midnight Lace wallet successfully connected** on the `preview` network — end-to-end confirmed by user.

### Last Changes
- **`lib/wallet/midnight.ts`**: added `'preview'` to `MIDNIGHT_NETWORKS` probe list. Root cause: Lace was rejecting all prior network strings with "Network ID mismatch"; `preview` is the correct network id.
- **`components/proposals/voting-section.tsx`**:
  - Added **private vote choice picker** — user selects yes/no/abstain in-browser; choice is passed to `generateVoteProof` locally (committed into the ZK proof) and NEVER serialised into any network request.
  - **Proof server offline banner** — amber notice shown after first check; includes inline "configure your proof server" link that opens the URL editor. Badge updated to amber when offline.
  - **Receipt UI** — success box with green border shows proof hash after vote recorded; error shown with red border.
  - **Busy label** — "Generating proof and submitting…" during async operation.
- **`app/proposals/[pid]/page.tsx`**:
  - Replaced raw tally numbers with **`TallyCard`** component: participation progress bar toward quorum (amber → green when met), per-choice bars (Yes/No/Abstain) with percentages.
- **`scripts/e2e-phase3.sh`** — new E2E script: org + members + proposal, public vote, double-vote rejection (409), private vote (sim proof), private double-vote rejection, finalize. **12/12 PASS**.

### Phase 3 Acceptance Criteria Status
- [x] Member can cast a public vote; tally updates immediately.
- [x] Member can cast a private vote; proof is generated client-side before anything is sent.
- [x] Vote choice never appears in any network request, BFF log, or API payload.
- [x] UI shows proof hash returned by proof server (`sim_proof_…` acceptable while offline).
- [x] Double-vote rejected gracefully (409 → user-friendly error message).
- [x] Proof server offline state clearly surfaced with "configure your proof server" prompt.
- [x] Proof server URL is configurable by the user (default `http://localhost:6300`).

### Open Tasks (next session — Phase 4: Delegation)
- Phase 4: delegate registry, revocation, delegate profiles (see `docs/roadmap.md`).
- Cardano gating (Blockfrost) — deferred carry-forward.
- Server-side admin auth for `PATCH /api/orgs/[id]` — flagged hardening item.
- AgilityCore out of sim mode — needs `MIDNIGHT_PROOF_SERVER_URL` env on Railway.

### How to run
```bash
# Inside a WSL shell
cd /home/anthony/CascadeProjects/Windsurf-Porject/votechain
npm run dev
# app: http://localhost:3000
```
`npm run typecheck` (tsc --noEmit) works from WSL. Do NOT run next dev/build from Windows over the \\wsl.localhost UNC path.

---

## Session: 2026-06-15 (cont. 2) — Membership Gating + Wallet Connector Fixes

### Current State
- `tsc --noEmit` **clean**. Dev server runs **inside WSL** at `http://localhost:3000` (started with `setsid` so it survives the launching shell — see "How to run").
- New capability: organizations now have a **join policy** (`invite` | `open` | `gated`) and **self-service join** with **on-chain requirement verification**. Enables the create-org → swap wallet → join → vote flow.
- Wallet connector reworked to match Midnight's **current DApp Connector API** and to surface connection errors (previously failures were silent).

### Last Changes
- **Membership model** (`lib/domain/types.ts`): `Organization.membership = { joinPolicy, requirements[] }`; `DEFAULT_MEMBERSHIP` = invite-only. Requirement union: `TokenRequirement` {issuer, currency, minBalance}, `NftRequirement` {issuer, taxon?, minCount}, `MidnightRequirement` {statement?} (chain locked to `midnight`). Added `JoinOrganizationInput`.
- **Schemas** (`lib/domain/schemas.ts`): `requirementSchema` (discriminatedUnion on `kind`), `membershipSettingsSchema`, `joinOrgSchema`, `updateSettingsSchema`; `createOrgSchema` gained optional `membership`.
- **Verifier** (`lib/membership/`): `verify.ts` (`verifyRequirements`, logical AND, fail-closed) + `xrpl-rpc.ts` (real public JSON-RPC: `account_lines` for token balances, `account_nfts` for NFT counts; `actNotFound` → empty) + `types.ts`. Midnight verified via client-supplied `proofHash` only (shielded balances can't be checked server-side).
- **Config** (`lib/config.ts` + `.env.example`): `config.chains.xrplRpcUrl` / `xahauRpcUrl` (env `XRPL_RPC_URL` / `XAHAU_RPC_URL`, default testnet). **Cardano gating NOT wired** (Blockfrost deferred by user).
- **Repository** (`lib/domain/repository.ts`): backfills `membership` on read for legacy orgs; defaults on create; added `updateSettings`.
- **Service** (`lib/domain/service.ts`): `joinOrganization` (enforces policy → verifies → addMember role `member`), `updateSettings`, new `MembershipDeniedError` → mapped to **403 `MEMBERSHIP_DENIED`** (with per-requirement results) in `lib/api/respond.ts`.
- **API**: `POST /api/orgs/[id]/join`; `PATCH /api/orgs/[id]` (update settings).
- **Proof client** (`lib/proof/client.ts`): added `generateMembershipProof(orgId, walletAddress)` (mirrors vote-proof flow).
- **UI**: `components/organizations/membership-editor.tsx` (policy picker + requirement builder) used in `app/organizations/new/page.tsx`; `JoinCard` + `MembershipSettingsCard` added to `app/organizations/[id]/page.tsx`.
- **Wallet connector**:
  - `lib/wallet/midnight.ts` rewritten to support the **current** DApp Connector API (`window.midnight.mnLace` → `connect(network)` → `getShieldedAddresses().shieldedAddress` / `getConnectionStatus()`), with **legacy `enable()`/`state()` fallback**. Detection now matches `connect` OR `enable`. When no network is passed it probes `MIDNIGHT_NETWORKS = ['undeployed','testnet','preprod','mainnet']` and uses the first that returns an address. Still reads `serviceUriConfig().proverServerUri`.
  - `components/wallet/connect-button.tsx`: connect failures now set a visible `connectError` + per-wallet `connecting…` state (CIP-30 + Midnight). Diagnostics line now shows `enable=…,connect=…` per Midnight wallet.

### Open Tasks (next session)
1. **Confirm the live Lace-for-Midnight connection** end-to-end and pin the correct network (ask user which: `undeployed`/`testnet`/`preprod`). If known, replace the probe with an explicit `connect(network)`.
2. **Cardano gating** still TODO — wire Blockfrost (`BLOCKFROST_PROJECT_ID`) for native-token amounts + NFT policy-id ownership, then extend `lib/membership/verify.ts` (the verifier is pluggable; add a `cardano` branch).
3. **Server-side admin auth** for `PATCH /api/orgs/[id]` and member mutations — currently admin-gating is UI-only (matches existing posture; flagged as a hardening item).
4. Resume **Phase 3 private voting** tasks below (unchanged).
5. Consider an E2E script for the join/gating flow (`scripts/e2e-membership.sh`).

### Important Decisions (this session)
- **Join requirements are AND-combined** and **fail-closed** (verification errors = not satisfied).
- **Real on-chain checks** chosen (user) for XRPL + Xahau via public RPC; **Midnight uses a client-side proof attestation** (consistent with the private-vote privacy principle); **Cardano deferred**.
- **Existing orgs auto-migrate** to invite-only via repository backfill — no data migration needed.
- Verifier is intentionally **pluggable** (`lib/membership/verify.ts`) so new chains slot in without touching callers.

### How to run (updated)
```bash
# inside a WSL shell — detached so it survives the launcher
cd /home/anthony/CascadeProjects/Windsurf-Porject/votechain
setsid bash -c 'npm run dev > /tmp/votechain-dev.log 2>&1' < /dev/null & disown
# logs: tail -f /tmp/votechain-dev.log  ·  app: http://localhost:3000
```
`npm run typecheck` (tsc --noEmit) works from WSL. Still do NOT run `next dev/build` from Windows over the `\\wsl.localhost` UNC path.

---

## Session: 2026-06-15 (cont.) — Phase 2 Governance Core (Proposals)

### Current State
- **Phase 2 ✅ complete.** `tsc --noEmit` clean; dev server running in WSL; **13/13 E2E passing** (`scripts/e2e-phase2.sh`).
- Proposal lifecycle **draft → active → passed/failed** works end-to-end. Activation provisions a backing AgilityCore proposal live (saw `agilityProposalId: proposal-e61b3800`). Comments work and mirror best-effort to AgilityCore.

### Last Changes
- Domain: `lib/domain/proposal-types.ts`, `proposal-repository.ts` (`.data/proposals.json`), `proposal-service.ts`; proposal schemas added to `lib/domain/schemas.ts`.
- API: `app/api/orgs/[id]/proposals/`, `app/api/proposals/[pid]/{route,status,comments}`; error mappings added to `lib/api/respond.ts` (`ProposalNotFoundError`→404, `ProposalStateError`→409).
- UI: `components/proposals/{proposals-section,status-badge}.tsx`; `app/organizations/[id]/proposals/new/page.tsx`; `app/proposals/[pid]/page.tsx`; proposals section embedded in org detail page.
- Test: `scripts/e2e-phase2.sh`.

### Open Tasks (next session) — Phase 3: Private Voting

**BLOCKER (Railway config only — no code change needed):** `MIDNIGHT_PROOF_SERVER_URL` is already implemented in AgilityCore (`src/proof/midnight-proof.adapter.ts`). It just isn't set on Railway. Steps: (1) expose local proof server publicly via ngrok/Cloudflare/Railway service, (2) set `MIDNIGHT_PROOF_SERVER_URL=<public-url>` in Railway dashboard, (3) redeploy. Full details in `docs/agilitycore-update-requirements.md`.

**VoteChain Phase 3 tasks (can build in parallel, sim proofs acceptable per roadmap):**
1. Wire public voting (`vote/yes|no|abstain`) → update `Proposal.tally`; private voting (`vote/private`) → show proof hash (`sim_proof_…` or real).
2. Double-vote prevention (track voters per proposal; AgilityCore 409 → friendly message).
3. Surface proof-server-offline / simulation state clearly in the UI (from `/api/health` — cache already fixed with `cache: 'no-store'`).
4. Never expose the vote choice for private votes (UI + API).
- The proposal model is ready: `agilityProposalId` is the AgilityCore target for votes; `tally` is zeroed and waiting.

### Important Decisions (this session)
- Backing AgilityCore proposal provisioned on **activate** (not create), mirroring org→DAO.
- **Quorum** = min total ballots; `resolveOutcome` passes only if participation ≥ quorum AND yes > no.
- Per-proposal voter tracking for double-vote prevention is **not yet** modeled — add a `votes`/`voters` structure to the proposal store in Phase 3.
- **Privacy architecture decision (Phase 3):** ZK proofs for private votes are generated **client-side in the browser** against the user's own Midnight proof server (`localhost:6300`). Only the opaque `proofHash` is ever sent over the network. The vote choice (`yes/no/abstain`) must NEVER appear in any BFF request, log, or AgilityCore payload. `PrivateVoteInput.midnightWallet` replaced with `PrivateVoteInput.proofHash` in `lib/agility/types.ts`. AgilityCore `vote/private` endpoint must accept `{ proposalId, walletAddress, proofHash }` — flagged in `docs/agilitycore-update-requirements.md`.
- **Midnight wallet integration (Phase 3):** Midnight Lace uses the **Midnight DApp Connector API** at `window.midnight.mnLace` — NOT CIP-30 (`window.cardano`). Implemented in `lib/wallet/midnight.ts`. On connect: `.enable()` → `.state()` gives the Midnight address, and `.serviceUriConfig()` returns `proverServerUri` — the user's own proof server URL. We feed that directly into `setProofServerUrl()` so client-side proof generation targets the wallet's configured prover automatically (no localhost:6300 guessing). Cardano Lace (CIP-30) still supported separately for public-vote identities; its `getChangeAddress()` returns CBOR hex, decoded by `decodeCborAddress()`.

---

## Session: 2026-06-15 — Phase 1 Organization Foundation (UI)

### Current State
- **Phase 1 ✅ complete and running.** Full Next.js App Router app on top of the Phase 0 `lib/agility` client; `tsc --noEmit` clean; **8/8 E2E checks passing** (`scripts/e2e-phase1.sh`).
- **Runtime resolved**: the app is run **inside WSL** (`npm run dev` → `http://localhost:3000`). Server starts clean in ~2.5s, no Watchpack errors. Create-org provisions a live AgilityCore DAO (saw `daoId: dao-…`).
- **Do NOT run `next dev`/`next build` from Windows over the `\\wsl.localhost` UNC path** — it fails (Webpack can't resolve `next-flight-client-entry-loader`, `EPERM` on `.next/trace`, Watchpack `EISDIR`). Windows `tsc --noEmit` still works fine.
- **node_modules is now a Linux-native install** (reinstalled inside WSL — needed for `@next/swc`). Windows-only tooling that needs native binaries should be re-checked if used.

### Last Changes
- Added deps: `lucide-react`, `clsx`, `tailwind-merge`, `server-only`, `tailwindcss`, `postcss`, `autoprefixer` (installed via `npm install --ignore-scripts`).
- Scaffold: `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `components/nav.tsx`.
- UI primitives: `components/ui/{button,card,input,badge}.tsx`; `lib/utils.ts`.
- Domain: `lib/domain/{types,schemas,repository,service}.ts` (JSON store at `.data/organizations.json`, gitignored).
- BFF: `app/api/orgs/**`, `app/api/health`, `app/api/wallet/generate`; `lib/api/{respond,fetch}.ts`.
- Wallet: `components/wallet/{wallet-provider,connect-button}.tsx`.
- Pages: `app/page.tsx`, `app/organizations/{page,new/page,[id]/page}.tsx`.

### Open Tasks (next session)
1. **Resolve the runtime blocker** — run inside WSL: `npm install` (Linux-native, regenerates `node_modules` with Linux binaries + Linux `@next/swc`) then `npm run dev`, all from a WSL shell at `/home/anthony/CascadeProjects/Windsurf-Porject/votechain`.
   - ⚠️ Tension with prior note ("do not reinstall inside WSL"): that was for the terminal harness. **Next.js cannot run from Windows over UNC, so a Linux-native install inside WSL is now required to run the app.** Windows `tsc` will still work afterward.
2. Manually verify Phase 1 acceptance criteria once running (create org, invite + roles, wallet connect, profile page).
3. Then proceed to Phase 2 (Governance Core — proposals).

### Important Decisions (this session)
- **Org is backed by an AgilityCore DAO** (best-effort `createDao`; `daoId` stored). Roles (admin/member/observer) are VoteChain-only domain data.
- **Interim persistence = file-backed `JsonOrgRepository`** behind an `OrgRepository` interface (swap for Prisma later). Chosen to keep momentum given the deferred Prisma/WSL toolchain friction.
- AgilityCore key stays server-side (BFF route handlers only).

---

## Session: 2026-06-13 — Phase 0 Foundation (terminal harness)

### Current State
- Project builds and typechecks cleanly (`tsc --noEmit` passes).
- AgilityCore typed client is implemented and **verified working against the live server** for all public endpoints (7/7).
- Generative wallets for all four chains work and are unit-tested (5/5).
- Connection harness produces a JSON report at `reports/phase1-connection-report.json`.
- Authenticated/admin endpoints **verified 8/8** with the admin key. Full suite: **15/15 passing**.

### Last Changes
- Scaffolded TS project: `package.json`, `tsconfig.json`, `.prettierrc`, `.gitignore`, `.env.example`.
- `lib/config.ts` (zod-validated config) + `lib/load-env.ts` (dependency-free `.env` loader).
- `lib/agility/` — `types.ts`, `client.ts` (`AgilityClient` + `AgilityError`), `index.ts` barrel.
- `scripts/wallets/` — per-chain generators (`midnight`, `xrpl`, `xahau`, `cardano`), aggregator `index.ts`, CLI `generate-all.ts`, tests `wallets.test.ts`.
- `scripts/test-connections.ts` — connection test suite + report writer.
- Docs: `docs/milestone.md`, `docs/handover.md`.

### Deployed contracts (reference)
Tracked in `lib/contracts.ts`, printed by the harness, and saved to the report:
- Cardano pre-prod `Counter` (PlutusV3) — tx `484b2f6a612c8d2a94cf122dde4d4f194bb5310f068103b5423bc877332c2186`
- Cardano pre-prod `DAO` — `addr_test1wzgxsphtczfamr2cljp80e48544vwp3p4u9n68702t6psgcnkt88j`
- Midnight preview `Proposal` (Compact) — `34f5d259563384c26baa3c9483458e0fa4d73bc2520b67950bfd833b5da9308b`

### Open Tasks
1. Begin Phase 2 (private voting lifecycle) once a Midnight proof server is available — `vote/private`
   currently returns a simulated `sim_proof_...` hash.
2. Decide: keep writing tests against the shared production instance vs a local AgilityCore clone.
3. (Later) Scaffold the Next.js app + BFF route handlers that reuse `lib/agility`.

### Important Decisions
- **Next.js** chosen over Vite (server-side BFF protects the AgilityCore key). UI deferred; Phase 1 is terminal-first.
- **Adapter over REST**: do not recreate AgilityCore's voting/treasury/proof/chain functionality.
- **Removed Prisma & Vitest**; **persistence deferred**; tests use **Node's built-in `node:test`** runner.
- **Relative imports** used in runtime code (not the `@/` alias) so `tsx` resolves them under the UNC path.

### Known Issues
- **WSL UNC + Windows Node**: `npm run …` fails because `cmd.exe` can't use a UNC cwd. **Workaround:** run scripts directly, e.g.
  - Wallets: `node ./node_modules/tsx/dist/cli.mjs ./scripts/wallets/generate-all.ts`
  - Connections: `node ./node_modules/tsx/dist/cli.mjs ./scripts/test-connections.ts`
  - Tests: `node ./node_modules/tsx/dist/cli.mjs --test scripts/wallets/wallets.test.ts`
  - Typecheck: `node ./node_modules/typescript/bin/tsc --noEmit`
  - Install: `npm install --ignore-scripts` (postinstall scripts break on UNC).
  - All of the above must set the working directory to the project root.
- Midnight proof server offline → `vote/private` is simulated.
- Midnight wallet uses a placeholder test-address format pending SDK integration.
- IDE may show a stale "Cannot find module 'zod'" lint; `tsc` confirms it resolves.

### Context For Next Session
- **AgilityCore** = "VaultChain Core" HTTP API at `https://agilitycore-production.up.railway.app`. Auth = `Authorization: Bearer <key>`. Currently in **simulation mode**; proof server offline.
- Live OpenAPI: `…/openapi.json`. VoteChain namespace = `/api/v1/votechain/*` (feeds, daos, proposals, vote/yes|no|abstain|private, comment, follow/unfollow). Admin key required to create DAOs/proposals.
- The typed client (`lib/agility`) is the single integration point and is designed to be reused by the future Next.js BFF.
- Plan of record: `C:\Users\amont\.windsurf\plans\votechain-foundation-144b30.md`.
- Node binaries were installed by **Windows** npm; do not reinstall inside WSL (would swap to Linux binaries and break Windows execution).
