# VoteChain — Milestones

This document tracks completed milestones and project progress. It always represents current project status.

> **Roadmap note:** The roadmap was restructured. The old "Phase 1 Foundation (terminal harness)" is now **Phase 0**. The new **Phase 1 = Organization Foundation** (first UI phase). See `docs/roadmap.md`.

---

## 2026-06-21 — Phase B · Discord Bot (interactions live)

**Status:** ✅ Working end-to-end — `tsc --noEmit` clean. Verified in a live guild: `/proposals` lists, `/vote` records to the web app, and `/link` links a wallet via Xaman QR.

### Delivered
- **Signed interactions endpoint** — `app/api/discord/interactions/route.ts` reads the raw body and verifies Discord's Ed25519 signature (`lib/discord/verify.ts`, `node:crypto` SPKI envelope, no extra deps), then dispatches in-process.
- **Commands** (`lib/discord/commands.ts` + `lib/discord/interactions.ts`): `/setup` (admin guild→DAO bind), `/link` (Xaman QR scan-to-link + typed-address fallback), `/proposals` (private), `/proposals-public` (channel broadcast, Manage-Messages gated), `/vote` (uses linked wallet).
- **Scan-to-link via Xaman** — `/link` creates a Xaman SignIn payload (`lib/wallet/xaman-server.ts`), tracks it in `lib/discord/pending-link-repository.ts`, and a webhook (`app/api/wallet/xaman/webhook/route.ts`) re-reads the signed account, checks DAO membership, writes the encrypted identity link, and posts a follow-up confirmation (`lib/discord/rest.ts`). Wallet address never enters a channel.
- **Registration script** — `scripts/register-discord-commands.ts` (`npm run scripts:discord:register`); instant guild registration via `DISCORD_GUILD_ID`.
- **Docs** — full setup + command reference added to `README.md` (Discord Bot section).

### Setup notes
- Requires env: `DISCORD_CLIENT_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `APP_PUBLIC_URL` (+ optional `DISCORD_GUILD_ID`).
- Local testing needs a public HTTPS tunnel (ngrok) set as both the Discord Interactions Endpoint URL and the Xaman Webhook URL.

---

## 2026-06-17 — DAO Launchpad Pivot · Phase A (foundation + Midnight & XRPL)

**Status:** 🟡 In progress — `tsc --noEmit` clean. Funding lifecycle, chain adapters, project API + UI landed; Midnight escrow contract + Discord bot still to come.

### Pivot summary
VoteChain becomes a **DAO launchpad**: organizations are now born from funded projects. A project raises real on-chain funds into escrow; on hitting the goal it activates — releasing escrow, minting membership, creating the backing Organization, and opening governance. Direct org creation (`POST /api/orgs`) is disabled and returns `ORG_CREATE_DISABLED`.

### Confirmed decisions
- **Chains (first wave):** Midnight + XRPL/Xahau side-by-side. Cardano trails (Phase C).
- **Midnight escrow:** new Compact escrow contract (deposit / release / refund / credential mint).
- **Bot distribution:** hosted multi-tenant via OAuth2 invite link + `/setup` guild binding.
- **Onboarding:** token/NFT-gated `/link`; privacy = ZK proof of holding (Midnight) + encrypted, never-public Discord↔wallet mapping (all chains).

### Features completed (Phase A)
- **Chain adapter layer** (`lib/chains/`): `ChainAdapter` interface (`createEscrow`, `getEscrowBalance`, `scanContributions`, `releaseEscrow`, `refundContributor`, `mintMembership`, `verifyHolding`), `registry.ts`, `xrpl-adapter.ts` (real JSON-RPC reads + offline-signed `submit` writes via `xrpl`), `midnight-adapter.ts` (escrow-contract wrapper; best-effort until `MIDNIGHT_ESCROW_ADDRESS` is set).
- **Launchpad domain** (`lib/launchpad/`): `project-types`, `contribution-types`, JSON repos, `crypto.ts` (AES-256-GCM), `identity-repository.ts` (encrypted Discord↔wallet links), `project-service.ts` (lifecycle + activation bridge into `OrgService`), `membership-mint.ts`.
- **API**: `GET/POST /api/projects`, `GET /api/projects/[id]`, `POST /api/projects/[id]/status` (open/sync/activate/fail/refund), `GET /api/projects/[id]/contributions`, `GET /api/projects/[id]/contribute`. New error codes `PROJECT_NOT_FOUND` (404), `PROJECT_STATE` (409), `ORG_CREATE_DISABLED` (409).
- **Governance Live gate**: `proposal-service.activateProposal` blocks activation unless the backing project is `live` (legacy orgs without a project are unaffected).
- **UI**: `app/projects` (list with funding progress), `app/projects/new` (launch form), `app/projects/[id]` (detail + contribute instructions + creator lifecycle controls). Nav + landing CTA point to the launchpad; `organizations/new` is now a launchpad redirect.
- **Config/env**: `MIDNIGHT_ESCROW_ADDRESS`, `LAUNCHPAD_ENCRYPTION_KEY`, Discord bot vars added to `.env.example`; `xrpl`/`ripple-keypairs` moved to runtime deps.

### Open (next)
- Author + compile + deploy the Compact escrow contract; wire `midnight-adapter` writes.
- Phase B Discord bot (hosted multi-tenant, `/link`, `/setup`, private-vote deep link).
- E2E script for the funding → activation → governance flow; escrow custody policy (XRPL keys) and encryption-key management.

### Verification
- `tsc --noEmit`: **passing** (run in WSL).

---

## 2026-06-15 — Membership Gating + Wallet Connector (post-Phase 2)

**Status:** ✅ Complete — `tsc --noEmit` clean; dev server running in WSL. (No dedicated E2E script yet — see handover open tasks.)

### Features completed
- **Organization join policies**: `invite` (default, admin-only — original behaviour), `open` (anyone with a wallet), `gated` (anyone meeting requirements). Stored on `Organization.membership`; legacy orgs auto-backfilled to invite-only.
- **Self-service join**: `POST /api/orgs/[id]/join` enforces the policy and (for `gated`) verifies requirements before adding the wallet as a `member`. `PATCH /api/orgs/[id]` updates membership settings.
- **On-chain requirement verification** (`lib/membership/`): pluggable verifier, AND-combined + fail-closed.
  - **XRPL + Xahau**: real public JSON-RPC — token trustline balances (`account_lines`) and NFT ownership (`account_nfts`). RPC URLs configurable via `XRPL_RPC_URL` / `XAHAU_RPC_URL`.
  - **Midnight**: client-generated `proofHash` attestation (shielded balances can't be verified server-side) via `generateMembershipProof`.
  - **Cardano**: deferred (Blockfrost not wired) — verifier returns "unsupported" for now.
- **UI**: requirement builder (`components/organizations/membership-editor.tsx`) in the create-org form; `JoinCard` (shows requirements + per-requirement pass/fail after a failed attempt, handles Midnight proof) and `MembershipSettingsCard` (admin) on the org detail page.
- **Wallet connector**: `lib/wallet/midnight.ts` updated to the current Midnight DApp Connector API (`connect(network)` + `getShieldedAddresses`) with legacy `enable()`/`state()` fallback and multi-network probing; `connect-button.tsx` now surfaces connection errors and a `connecting…` state instead of failing silently.

### Architecture decisions
- Requirement verification is **fail-closed** and **AND-combined**; the verifier is intentionally pluggable so new chains slot in without touching callers.
- Real on-chain checks for XRPL/Xahau; Midnight via client-side proof (consistent with the private-vote privacy model); Cardano deferred.
- Admin-gating for settings/member mutations remains **UI-only** (matches existing posture; server-side auth flagged as a hardening task).

### Verification
- `tsc --noEmit`: **passing** (run in WSL).
- Manual: dev server on `http://localhost:3000`; create-org → set policy → swap wallet → join → vote flow available. Dedicated E2E (`scripts/e2e-membership.sh`) is an open task.

---

## 2026-06-15 — Phase 2: Governance Core (Proposals)

**Status:** ✅ Complete — `tsc` clean, running in WSL, **13/13 E2E checks passing** (`scripts/e2e-phase2.sh`).

### Features completed
- **Proposal domain** (`lib/domain/proposal-types.ts`): `Proposal` with lifecycle `draft → active → passed/failed`, `type` (general/treasury), `votingPeriodDays`, `quorum`, `tally` (zeroed; Phase 3 populates), `comments[]`, plus `participationCount()` and `resolveOutcome()` helpers.
- **Proposal repository** (`lib/domain/proposal-repository.ts`): `ProposalRepository` interface + `JsonProposalRepository` (`.data/proposals.json`), `listByOrg`/`getProposal`/`createProposal`/`update`/`addComment`.
- **Proposal service** (`lib/domain/proposal-service.ts`): create (draft), **activate** (opens voting window + best-effort provisions backing AgilityCore proposal via `createProposal`, needs org `daoId`), **finalize** (resolves outcome vs quorum), **comment** (local + best-effort `commentProposal` mirror). AgilityCore failures non-fatal.
- **Validation** (`lib/domain/schemas.ts`): `createProposalSchema`, `addCommentSchema`, `proposalActionSchema`.
- **BFF routes**: `orgs/[id]/proposals` (GET/POST), `proposals/[pid]` (GET), `proposals/[pid]/status` (POST activate/finalize), `proposals/[pid]/comments` (GET/POST). New error mappings: `PROPOSAL_NOT_FOUND` (404), `PROPOSAL_STATE` (409).
- **UI**: proposals section on org page (`components/proposals/proposals-section.tsx` + `status-badge.tsx`), create-proposal form (`app/organizations/[id]/proposals/new`), proposal detail page (`app/proposals/[pid]`) with quorum/period/voting-end info, tally panel (Phase 3 note), admin Activate/Finalize actions, and member discussion/comments.

### Architecture decisions
- **Proposal lifecycle is VoteChain-owned**; the backing AgilityCore proposal is provisioned on **activation** (mirrors the org→DAO pattern). `agilityProposalId` stored for Phase 3 voting.
- **Quorum** = minimum total ballots required; `resolveOutcome` passes only if participation ≥ quorum AND yes > no. With 0 votes (pre-Phase-3) finalize → `failed`, which is correct.
- Comments are local source-of-truth + best-effort mirrored to AgilityCore when a backing proposal exists.

### Verification
- `tsc --noEmit`: **passing** (run in WSL).
- `scripts/e2e-phase2.sh` — **13/13**: create org+member, create draft proposal, 422 on invalid, 409 on illegal transition (finalize-before-active), activate (voting window + `agilityProposalId: proposal-e61b3800` provisioned live), comment, 422 empty comment, finalize→failed (quorum not met), list, detail, 404 missing.

---

## 2026-06-15 — Phase 1: Organization Foundation (UI)

**Status:** ✅ Complete — code + `tsc` clean, **running inside WSL**, all E2E checks passing.

### Features completed
- **Next.js App Router scaffold**: Tailwind CSS theme (`tailwind.config.ts`, `app/globals.css`), `app/layout.tsx`, top nav (`components/nav.tsx`), `postcss.config.mjs`, `next.config.mjs`.
- **UI primitives** (`components/ui/`): `button`, `card`, `input`/`textarea`, `badge`; `cn`/`shortAddress`/`formatDate` helpers in `lib/utils.ts`.
- **Domain layer** (`lib/domain/`): `types.ts` (Organization, Member, MemberRole admin/member/observer), `schemas.ts` (zod), `repository.ts` (`OrgRepository` interface + `JsonOrgRepository` writing to `.data/organizations.json`), `service.ts` (`OrgService` — orchestrates repo + AgilityCore DAO provisioning/follow).
- **BFF route handlers** (`app/api/`): `orgs` (GET/POST), `orgs/[id]` (GET), `orgs/[id]/members` (GET/POST), `orgs/[id]/members/[wallet]` (PATCH role / DELETE), `health` (AgilityCore proxy), `wallet/generate` (ephemeral test identity). Shared helpers in `lib/api/respond.ts` + browser `lib/api/fetch.ts`.
- **Wallet connect** (`components/wallet/`): `WalletProvider` (localStorage identity), `ConnectButton` (CIP-30 detection + test-identity generation), `useWallet` hook.
- **Pages**: dashboard `/` (hero + AgilityCore network status), `/organizations` (list/empty state), `/organizations/new` (create form, wallet-gated), `/organizations/[id]` (member list, role management, invite — admin-gated).

### Architecture decisions
- **Org = AgilityCore DAO**: creating an org best-effort provisions a backing DAO (`createDao`) and stores `daoId`; member add/remove maps to `followDao`/`unfollowDao`. DAO failures are non-fatal (org still created locally).
- **Roles are VoteChain-only**: AgilityCore doesn't model roles, so members + roles live in the domain store.
- **Interim persistence**: `JsonOrgRepository` (file-backed) behind `OrgRepository` interface — swappable for Prisma later without touching callers.

### Verification
- `tsc --noEmit`: **passing**.
- **Runtime resolved**: Next.js will **not** run from Windows Node over the `\\wsl.localhost` UNC path (Webpack can't resolve `next-flight-client-entry-loader`, `EPERM` on `.next/trace`, Watchpack `EISDIR`). **Fix: Linux-native `npm install` + `npm run dev` inside WSL.** Server now starts clean (`Ready in 2.5s`, no Watchpack errors) at `http://localhost:3000`.
- **E2E smoke test** (`scripts/e2e-phase1.sh`) — **8/8 passing**: create org (backing DAO `dao-…` provisioned live on AgilityCore), add member, promote role, duplicate→409, invalid create→422, remove member, generate test identity, fetch org detail.

### How to run
```bash
# inside a WSL shell
cd /home/anthony/CascadeProjects/Windsurf-Porject/votechain
npm run dev          # http://localhost:3000
bash scripts/e2e-phase1.sh   # E2E smoke test
```
`tsc --noEmit` still works from Windows. Do NOT run `next dev/build` from Windows over UNC.

---

## 2026-06-13 — Phase 0: Foundation (Terminal Harness)

**Status:** Complete (all endpoints verified against live server)

### Features completed
- TypeScript project scaffold (ESM, `tsx`, Node `node:test`, ESLint/Prettier, strict `tsconfig`).
- Typed configuration loader (`lib/config.ts`) with zod validation + zero-dependency `.env` loader (`lib/load-env.ts`).
- **AgilityCore (VaultChain Core) client** (`lib/agility/`): server-only typed HTTP client with Bearer auth, normalized `ApiResponse` handling, and methods mapped to the live OpenAPI contract (health, wallet, dao state, agents, full `/api/v1/votechain/*` namespace incl. `vote/private`).
- **Generative test wallets** for all four chains (`scripts/wallets/`):
  - XRPL (`xrpl` lib) — devnet r-address.
  - Xahau (XRPL-format) — testnet r-address.
  - Cardano (`@emurgo/cardano-serialization-lib-nodejs` + bip39, CIP-1852) — testnet bech32 base address.
  - Midnight — seed + documented `mn_shield-addr_test1…` test address (SDK derivation deferred).
- **Connection test suite** (`scripts/test-connections.ts`): exercises public + authenticated endpoints against the live server, prints a pass/fail table, writes `reports/phase1-connection-report.json`.
- Unit tests (`scripts/wallets/wallets.test.ts`) — 5/5 passing.

### Verification results
- `tsc --noEmit`: passing.
- Unit tests (`node:test` via tsx): 5/5 passing.
- Connection suite vs live server `https://agilitycore-production.up.railway.app`: **15/15 passing**.
  - Public endpoints: **7/7** (health ok, simulation mode, all four chains connected).
  - Authenticated/admin endpoints: **8/8** (create DAO, create proposal, get proposal, vote/yes, vote/private, comment, follow, unfollow).
  - `vote/private` returned a `sim_proof_...` hash (Midnight private-vote path wired; simulated while proof server offline).
- Deployed-contract registry (`lib/contracts.ts`) for Cardano pre-prod (Counter, DAO) and Midnight preview (Proposal); printed by harness + saved to report.

### Major decisions
- **Framework = Next.js** (over Vite) to keep the AgilityCore Bearer key server-side via a BFF; UI build deferred (Phase 1 is terminal-first).
- **AgilityCore consumed over REST** behind a typed adapter; never recreate its voting/treasury/proof/chain logic.
- **Removed Prisma & Vitest** for now: their postinstall scripts / Vite path regex are incompatible with running Windows Node against the WSL UNC path. Persistence deferred; tests use Node's built-in runner.
- **Run scripts via `tsx` directly** (`node ./node_modules/tsx/dist/cli.mjs …`) rather than `npm run`, because `npm`/`cmd.exe` cannot use a UNC working directory.

### Remaining work
- Phase 2: private voting lifecycle + proof verification (requires Midnight proof server).
- (Later) Scaffold the Next.js app + BFF route handlers that reuse `lib/agility`.

### Risks identified
- Writing to the shared production AgilityCore instance mutates real state (test data namespaced `vc-test-*`).
- Midnight proof server offline → `vote/private` runs in simulation (placeholder proof).
- Real Midnight wallet derivation still TODO (needs SDK).
- Cross-platform friction: Windows Node + WSL UNC path breaks npm scripts, Prisma, and Vite.
