# VoteChain MVP Roadmap

## Vision

VoteChain is a confidential governance platform built on Midnight that allows organizations to make decisions, manage treasuries, and delegate authority while preserving privacy and accountability.

Traditional governance platforms focus on transparency.

VoteChain focuses on confidentiality with verifiable outcomes.

---

## DAO Launchpad Pivot (current direction)

VoteChain is now a **DAO launchpad**: an organization is no longer created directly — it is **born from a funded project**. Every project must clear a real on-chain funding-escrow goal before its DAO activates, mints membership to contributors, and opens governance. A hosted, multi-tenant Discord bot is the primary surface for existing communities to privately gate access, view proposals, and vote.

**New core lifecycle:**

```
Draft → Funding (escrow open) → [goal hit] → Activating → Live
                              → [deadline missed] → Failed → Refunding → Refunded
```

On **goal hit**: release escrow to the treasury → mint membership (token / NFT / Midnight credential) → create the backing Organization (existing governance stack) → register contributors as members + eligible voters → open governance + bind the Discord bot.

**Confirmed decisions:**

- **Chains (first wave):** Midnight + XRPL/Xahau side-by-side (Xaman for XRPL/Xahau, Lace for Midnight/NIGHT). Cardano trails.
- **Midnight escrow:** a new Compact escrow contract (deposit / release / refund / `mint_membership_credential`).
- **Bot distribution:** hosted multi-tenant; communities add it via an OAuth2 invite link and bind a guild with `/setup`.
- **Onboarding existing members:** token/NFT-gated. Members must `/link` a wallet to access the bot. Privacy = both: Midnight ZK proof of holding (bot learns only valid/invalid) **and** an encrypted, never-public Discord↔wallet mapping for all chains.

**Launchpad phases:**

- **Phase A — Funding foundation + Midnight & XRPL/Xahau (in progress):** `lib/chains/` adapter abstraction + registry, `xrpl-adapter` (escrow account, contribution watch, mint, refund), `midnight-adapter` (escrow contract wrapper, graceful until deployed), `lib/launchpad/` (projects, contributions, encrypted identity links, project-service + activation bridge), project API routes + `app/projects/*` UI, and the governance Live gate.
- **Phase B — Discord bot (hosted multi-tenant):** treasury-tier-unlocked OAuth2 install + `/setup` guild binding, signature-verified `/link` private gated access (ZK proof for Midnight, encrypted mapping), proposal/vote commands with re-verify-on-action, private-vote deep link. **Full spec, tier table, command list, and B0–B5 build order: see [Phase B — Discord Bot](#phase-b--discord-bot-hosted-multi-tenant) below.**
- **Phase C — Cardano adapter.**

The Phases 1–8 below describe the **post-activation governance layer** that a Live project's Organization operates on. They remain accurate for everything after activation; the launchpad simply gates entry into them.

---

## Core Problem

Organizations need governance.

Organizations also need privacy.

Current DAO tools expose:

- Votes
- Treasury balances
- Delegate relationships
- Internal decision making

VoteChain allows organizations to prove governance happened correctly without exposing sensitive information.

---

## MVP Goal

Answer one question:

> "Can an organization govern privately while remaining accountable?"

Everything in the MVP should support that goal.

---

## MVP Demo Story

1. Create Organization
2. Add Members
3. Create Treasury Proposal
4. Members Vote Privately
5. Proposal Passes
6. Treasury Action Executes
7. Audit Proof Generated

**Result:** A complete confidential governance workflow powered by Midnight.

---

## Positioning

VoteChain is not another DAO platform.

VoteChain is **confidential governance infrastructure** for organizations.

**Target customers:** DAOs · Foundations · Cooperatives · Investment groups · Business networks · Digital organizations

**Core value:** Private decisions. Public accountability.

---

## Technical foundation

**Integration principle:** VoteChain orchestrates and presents governance. AgilityCore owns chain execution, proofs, and treasury operations. Never recreate what AgilityCore already provides.

**Privacy principle:** No unhashed private vote data may leave the user's browser. ZK proofs for private votes are generated client-side against the user's own Midnight proof server (default `localhost:6300`). Only the opaque proof hash is transmitted to the BFF and AgilityCore. The vote choice is committed inside the proof and never serialised into any HTTP request.

**Framework:** Next.js (App Router) + TypeScript. AgilityCore Bearer/admin key lives server-side only (BFF route handlers). Browser never sees it.

**Live server:** `https://agilitycore-production.up.railway.app` — simulation mode, all four chains connected (Midnight/preview · XRPL/devnet · Xahau/testnet · Cardano/testnet).

```
Browser (React UI)
  ├─ [private vote only] calls user's OWN proof server directly
  │     └─> localhost:6300 (Midnight proof server, user-operated)
  │               returns opaque proofHash — choice never leaves browser
  └─> Next.js Server (App Router, BFF route handlers, session)
        ├─ VoteChain domain (Prisma/SQLite → Postgres in production)
        │    orgs · members · proposals · votes · delegations
        └─ AgilityCore adapter (lib/agility/, server-only, Bearer key)
              └─> AgilityCore REST API
                    ├─ /api/v1/votechain/*   (feed, DAOs, proposals, voting)
                    │    vote/private receives { proposalId, walletAddress, proofHash }
                    │    — choice is NEVER in this payload
                    ├─ /dao/*                (open-election, cast-vote, fund-treasury, state)
                    ├─ /wallet/*             (address, balance, send, tokens)
                    ├─ /agents/*             (register, execute, Mothra governance agent)
                    └─> Chain adapters + Midnight Proof Server (AgilityCore-side, sim/fallback)
                              Midnight · XRPL · Xahau · Cardano
```

### Deployed contracts (reference)
| Chain | Network | Contract | Address / Tx |
|---|---|---|---|
| Cardano | preprod | Counter (PlutusV3) | tx `484b2f6a…2c2186` |
| Cardano | preprod | DAO (PlutusV3) | `addr_test1wzgxsphtczfamr2cljp80e48544vwp3p4u9n68702t6psgcnkt88j` |
| Midnight | preview | Proposal (Compact) | `34f5d259…a9308b` |

---

## Phase 0 — Technical Foundation ✅ COMPLETE

**Goal:** Establish the typed integration layer and verify end-to-end connectivity to AgilityCore before building any UI.

### Delivered
- TypeScript project scaffold (ESM, `tsx`, `node:test`, ESLint/Prettier, strict `tsconfig`).
- Zero-dependency `.env` loader + zod-validated `lib/config.ts`.
- **AgilityCore typed client** (`lib/agility/`) — server-only, full OpenAPI coverage incl. `vote/private`.
- **Generative test wallets** for all four chains (XRPL, Xahau, Cardano CIP-1852, Midnight test-address).
- **Connection test suite** (`scripts/test-connections.ts`) — 15/15 passing against live server.
- **Deployed contracts registry** (`lib/contracts.ts`).

### Acceptance criteria (all met)
- [x] Wallets generated for all four chains with valid addresses.
- [x] 7/7 public endpoints PASS.
- [x] 8/8 authenticated/admin endpoints PASS (create DAO, proposal, vote, `vote/private`, comment, follow/unfollow).
- [x] `vote/private` returns a `sim_proof_...` hash (simulated; proof server offline).
- [x] `tsc --noEmit` clean. Unit tests 5/5.

---

## Phase 1 — Organization Foundation ✅ COMPLETE

**Goal:** Allow organizations to create and manage governance spaces.

### Features
- Create organization
- Organization profile
- Invite members
- Role management (Admin · Member · Observer)
- Wallet connection
- Cross-chain identity support

### AgilityCore endpoints used
- `POST /api/v1/votechain/dao` — create DAO / org
- `GET /api/v1/votechain/dao/{id}` — org profile + state
- `POST /api/v1/votechain/follow` / `unfollow` — membership
- `GET /wallet/address` — wallet identity

### Acceptance criteria
- [x] Organization can be created with name, description, and admin wallet.
- [x] Members can be invited and roles assigned (Admin / Member / Observer).
- [x] Wallet connect flow works for at least one chain (XRPL or Cardano).
- [x] Org profile page shows member list and role breakdown.

**Deliverable:** ✅ An organization can be created and members can join. Verified via `scripts/e2e-phase1.sh` (8/8).

---

## Phase 2 — Governance Core ✅ COMPLETE

**Goal:** Allow organizations to create and manage proposals.

### Features
- Create proposal
- Proposal discussion (comments)
- Proposal status: Draft · Active · Passed · Failed
- Voting periods
- Quorum settings

### AgilityCore endpoints used
- `POST /api/v1/votechain/proposals` — create
- `GET /api/v1/votechain/proposals/{id}` — status + tally
- `POST /api/v1/votechain/comment` — discussion

### Acceptance criteria
- [x] Admin can create a proposal with title, description, voting period, and quorum.
- [x] Proposal moves through Draft → Active → Passed/Failed lifecycle.
- [x] Members can comment on proposals.
- [x] Proposal list view shows status and participation count.

**Deliverable:** ✅ Organizations can create governance proposals. Verified via `scripts/e2e-phase2.sh` (13/13).

---

## Phase 3 — Private Voting

**Goal:** Allow members to vote privately.

### Features
- Public voting
- Private voting via Midnight ZK proofs
- Proof generation and status display
- Double-vote prevention
- Public results with private ballots

### Privacy model
- **Public vote**: choice is recorded and visible (yes/no/abstain) — travels as plaintext to the BFF.
- **Private vote**: vote choice is **committed into a ZK proof client-side** (in the browser, by the user's own Midnight proof server). Only the opaque proof hash travels to the BFF and on to AgilityCore. The choice itself never leaves the user's machine.

### Client-side proof generation principle
> **No unhashed data from a private vote may leave the user's browser.**

Correct flow:
```
Browser
  ├─ User selects choice (stays in memory only)
  ├─ Browser calls user's proof server directly (localhost:6300 or configured URL)
  ├─ Proof server returns opaque proof hash (commits choice without revealing it)
  └─> BFF → AgilityCore: { proposalId, walletAddress, proofHash }
                          ← choice is NEVER in this payload
```

Wrong flow (must NOT build):
```
Browser → BFF → AgilityCore: { proposalId, walletAddress, choice }   ← privacy violation
```

This is why each user must run their own proof server. AgilityCore's `MIDNIGHT_PROOF_SERVER_URL` is the fallback for simulation/testing only.

### AgilityCore endpoints used
- `POST /api/v1/votechain/vote/yes|no|abstain` — public vote
- `POST /api/v1/votechain/vote/private` — receives `{ proposalId, walletAddress, proofHash }` (hash only, no choice)
- `GET /health` — proof server status (sim mode detection)

### Acceptance criteria
- [ ] Member can cast a public vote; tally updates immediately.
- [ ] Member can cast a private vote; proof is generated client-side in the browser before anything is sent.
- [ ] Vote choice never appears in any network request, BFF log, or API payload.
- [ ] UI shows the proof hash returned by the proof server (`sim_proof_...` acceptable while proof server offline).
- [ ] Double-vote rejected gracefully (AgilityCore 409 → user-friendly message).
- [ ] Proof server offline state clearly surfaced in the UI with a "configure your proof server" prompt.
- [ ] Proof server URL is configurable by the user (default `http://localhost:6300`).

**Deliverable:** Members can vote without revealing their choice.

> **Demo moment:** "Nobody can see how I voted, but everyone can verify the outcome."

---

## Phase 4 — Delegation

**Goal:** Allow members to delegate governance power.

### Features
- Delegate voting power to another member
- Revoke delegation
- Delegation history
- Delegate profiles

### Implementation notes
- `Delegation` table (delegator, delegate, scope, active, createdAt, revokedAt) in VoteChain DB.
- Revocation is immediate for future proposals; history preserved for audit.
- Delegation-aware voting: when a delegate votes, the delegated weight is recorded.

### Acceptance criteria
- [ ] Member can delegate to another member; delegation reflected immediately.
- [ ] Delegate can vote on behalf of delegator; vote records the delegation chain.
- [ ] Revocation takes effect on the next proposal.
- [ ] Delegate profile page shows active delegations and vote history.

**Deliverable:** Organizations can operate representative governance.

> **Demo moment:** "I trust Anthony to vote for me."

---

## Phase 5 — Confidential Treasury

**Goal:** Bring treasury operations under governance control.

### Features
- Treasury dashboard
- Treasury proposals (special proposal type linked to a spend)
- Spending approvals (governance gate: passed vote → fund-treasury)
- Treasury audit records (every movement linked to originating proposal)
- Governance-linked treasury actions

### Privacy modes
| Mode | Balance | Transactions | Proof |
|---|---|---|---|
| **Public** | Visible | Visible | — |
| **Hybrid** | Private | Results public | — |
| **Private** | Private | Private | Governance proof public |

### AgilityCore endpoints used
- `GET /wallet/balance` — treasury balance
- `POST /dao/open-election` — create treasury proposal
- `GET /dao/state` — active proposal / count
- `POST /dao/fund-treasury` — execute approved spend (governance-gated)
- `POST /dao/cast-vote` — cast vote on treasury proposal

### Acceptance criteria
- [ ] Treasury balance displayed on dashboard.
- [ ] Treasury proposal type available in proposal create flow.
- [ ] Passed treasury proposal triggers `fund-treasury`; failed proposal does not.
- [ ] Every treasury movement is linked to originating proposal in audit trail.
- [ ] Audit trail exportable as JSON/CSV.

**Deliverable:** Organizations can approve treasury actions privately.

> **Demo moment:** "We approved a payment without exposing internal finances."

---

## Phase 6 — Governance Audit Proofs

**Goal:** Provide accountability without revealing sensitive data.

### Features
- Governance proof receipts (per-proposal ZK proof of correct outcome)
- Proposal audit history
- Treasury proof history
- Export reports
- Compliance dashboard

### Implementation notes
- Each passed proposal generates a Midnight ZK proof attesting the outcome.
- Proof stored alongside the proposal record in VoteChain DB.
- Compliance dashboard shows proof status per proposal/treasury action.

### AgilityCore endpoints used
- `POST /api/v1/votechain/vote/private` — proof generation path
- `GET /api/v1/votechain/proposals/{id}` — proof hash retrieval

### Acceptance criteria
- [ ] Every closed proposal has an associated proof receipt.
- [ ] Proof receipt page shows: proposal title, outcome, proof hash, timestamp.
- [ ] Treasury actions linked to their governance proof.
- [ ] Export endpoint returns full audit history as JSON.

**Deliverable:** Organizations can prove governance occurred correctly.

> **Demo moment:** "Here is proof the proposal passed and funds were approved."

---

## Phase 7 — Governance Intelligence

**Goal:** Help organizations understand governance activity.

### Features
- AI proposal summaries (Mothra agent)
- Participation metrics
- Governance health score (org-level)
- Voting trend analysis
- Delegate analytics

### AgilityCore endpoints used
- `POST /agents/mothra/execute` — AI analysis actions
- `GET /agents` / `GET /agents/{agentName}` — agent registry
- `GET /api/v1/whalewatcher/market/signals` — cross-chain market context

### Acceptance criteria
- [ ] Proposal detail page shows Mothra-generated plain-language summary.
- [ ] Governance health score computed and displayed on org dashboard.
- [ ] Participation metrics (vote rate, streak, delegation concentration) visible.
- [ ] Delegate analytics page shows voting alignment per delegate.

**Deliverable:** Organizations gain insight into governance activity.

---

## Phase 8 — Private Feedback

**Goal:** Allow members to submit confidential feedback to their organization without revealing their identity, while giving admins verifiable signal on governance health.

### Features
- Anonymous feedback submission (ZK-protected sender identity)
- Feedback categories (proposal quality, governance process, delegate performance, general)
- Admin feedback dashboard (aggregated themes, sentiment; no individual attribution)
- Feedback acknowledgement (admin marks feedback as reviewed; member notified without de-anonymising)
- Rate limiting per member per period (prevents spam; enforced server-side)
- Optional public summary (admin can publish a sanitised summary for transparency)

### Privacy model
- Feedback content and sender identity are kept private via Midnight ZK proof.
- Admin sees aggregated feedback and categories; cannot link a submission to a wallet.
- Proof attests that the submitter is a valid org member without revealing which member.

### AgilityCore endpoints used
- `POST /api/v1/votechain/vote/private` — ZK membership proof (reused to attest valid member without identity)
- `POST /api/v1/votechain/comment` — underlying submission transport
- `GET /health` — proof server status

### Acceptance criteria
- [ ] Member can submit feedback anonymously; submission confirmed without revealing identity.
- [ ] Admin dashboard shows feedback volume, categories, and sentiment — no wallet attribution.
- [ ] Non-member wallet cannot submit feedback (membership proof required).
- [ ] Admin can mark feedback as reviewed; member receives acknowledgement.
- [ ] Rate limit prevents more than N submissions per member per voting period.

**Deliverable:** Organizations can collect honest member feedback without fear of attribution.

> **Demo moment:** "I shared real concerns about the proposal process. The admin saw the pattern. Nobody knows it was me."

---

## Phase B — Discord Bot (hosted multi-tenant)

**Goal:** Let a Live DAO bring governance into its existing Discord community — privately gate access by on-chain credential, list proposals, and vote — without exposing any member's wallet.

### Architecture (decided)
- **HTTP-interactions, not a gateway bot.** Discord slash commands POST to a Next.js route (`app/api/discord/interactions/route.ts`); requests are Ed25519-verified and handled in-process, reusing `lib/launchpad` + `lib/chains` + `lib/membership` services directly. Side effects (role grant/revoke, DMs) use the Discord REST API via the bot token — no persistent gateway connection. A standalone `bot/` gateway worker can be added later for event-driven features (auto-DM on join, live announcements).
- **Privacy preserved:** the Discord↔wallet mapping stays AES-GCM encrypted at rest (`lib/launchpad/identity-repository.ts`) and is never echoed into a channel. Private votes only ever emit a deep link — the choice is committed in-browser per the Phase 3 principle.

### Treasury-tier unlock
The bot is gated behind the DAO's treasury balance. Once a tier threshold is met, the project detail page (`app/projects/[id]`) reveals an **"Invite Bot"** OAuth2 install link bound to that project. Higher tiers unlock more bot surface.

| Tier | Name | Test threshold | Bot capability |
|---|---|---|---|
| 1 | Basic | `1` | Invite bot · `/proposals` · `/vote` |
| 2 | Second | `5` | + announcements, `/treasury` read |
| 3 | High | `10` | + delegation commands, analytics |
| 4 | Enterprise | `20` | + private feedback, audit export |

> Test values only — replace with production thresholds (and pin the currency) before launch.

### Auth model (two layers)
- **Bot ↔ VoteChain (service):** internal endpoints authenticated with `BOT_INTERNAL_SECRET` (only needed once a standalone gateway worker is added; in-process interactions call services directly).
- **Discord user ↔ wallet (identity):** `/link` issues an ephemeral, short-TTL deep link to a web verify page carrying `guildId` + `discordUserId`. The user **connects + signs a nonce** (Xaman for XRPL/Xahau; Lace + ZK proof for Midnight) to prove wallet control before the encrypted link is written and the role is granted. A Discord id alone never grants access.

### Credential verification
- **Re-verify on every gated action.** Before each `/vote` / `/proposals`, the bot re-runs `ChainAdapter.verifyHolding(...)` against the live chain (with a short ~60–120s per-wallet TTL cache to avoid RPC hammering). If holdings have dropped, the action is denied and the Discord role is revoked.
- **Default scope:** the DAO's own membership asset minted on activation (XRPL/Xahau NFT/token implemented; Midnight via client-side ZK proof of holding; Cardano trails). Arbitrary external token/NFT gates can later reuse `lib/membership/verify.ts`.

### Commands

**Setup & identity**
- `/setup` — admin-only; bind this guild to the unlocked project/DAO, configure the verified-member role. *(B2)*
- `/link` — start wallet linking; deep link → web verify page → wallet signature → encrypted link + role grant. *(B3)*
- `/unlink` — remove the encrypted Discord↔wallet link and strip the role. *(B3)*
- `/whoami` — ephemeral; show link status + chain (never the address). *(B3)*

**Governance reads**
- `/proposals` — list active proposals with status + quorum progress (re-verifies first). *(B4)*
- `/proposal <id>` — detail: description, tally bars, voting deadline. *(B4)*
- `/status` — DAO snapshot: treasury tier, member count, open proposals. *(B4)*

**Voting**
- `/vote <id> <yes|no|abstain>` — public vote inline (re-verify before accepting). *(B5)*
- `/vote-private <id>` — deep link to the ZK voting UI; choice never touches Discord. *(B5)*

**Tier 2+ (later)**
- `/treasury` — balance + privacy-mode badge. *(Tier 2)*
- `/delegate <@user>` / `/revoke-delegation` — delegation via the Phase 4 stack. *(Tier 3)*
- `/feedback` — anonymous ZK feedback deep link (Phase 8). *(Tier 4)*
- `/audit <id>` — governance proof receipt link (Phase 6). *(Tier 4)*

**Admin / ops**
- `/announce` — push a proposal opening/closing notice to a configured channel. *(Tier 2)*
- `/sync` — admin; force a holdings re-check across linked members. *(B4)*

### Build order
- **B0 — Tier gate:** `botUnlocked(project)` helper + gated "Invite Bot" button on `app/projects/[id]`.
- **B1 — Interactions plumbing:** `app/api/discord/interactions/route.ts`, Ed25519 verification, command registration.
- **B2 — `/setup`:** OAuth2 install → `bindGuild` (guild ↔ project) + member-role config.
- **B3 — `/link` / `/unlink` / `/whoami`:** signature-verified linking, encrypted mapping, role grant.
- **B4 — Gated reads:** `/proposals`, `/proposal`, `/status`, `/sync` with re-verify + TTL cache.
- **B5 — Voting:** `/vote` (public inline), `/vote-private` (deep link).

### Acceptance criteria
- [ ] Bot install link appears only after the DAO's treasury clears the tier threshold.
- [ ] `/setup` binds exactly one guild to one project; non-admins are rejected.
- [ ] `/link` requires a valid wallet signature; the wallet address is never posted to a channel and is stored encrypted at rest.
- [ ] Every gated command re-verifies on-chain holdings; a member who no longer holds the asset is denied and de-roled.
- [ ] Private voting from Discord only ever produces a deep link; the vote choice never appears in any Discord payload, bot log, or internal request.

**Deliverable:** Existing communities can privately gate access and govern from Discord, with the bot unlocked by treasury tier.

> **Demo moment:** "Our DAO hit its treasury tier, we dropped the bot into Discord, and members vote privately right from their server."

---

## Future Roadmap (Post-MVP)

- Participation rewards
- Reputation system
- Whitelist campaigns
- NFT fundraising
- Grant programs
- Cross-chain governance bridges
- Private board elections
- Corporate governance tools
- Cooperative governance tools
- Foundation governance tools

---

## Cross-cutting concerns (all phases)

| Concern | Approach |
|---|---|
| **Auth** | Wallet-linked session (NextAuth/iron-session); org membership gated server-side |
| **Privacy** | Vote choices ZK-protected via Midnight; public tallies only; eligibility proofs not identity |
| **Key security** | AgilityCore admin/Bearer key server-side only (BFF); never in browser bundle |
| **Persistence** | Prisma + SQLite (dev) / Postgres (prod); deferred from Phase 1 pending toolchain fix |
| **Testing** | `node:test` via `tsx` (Phase 1); extend with Playwright E2E from Phase 2 |
| **Docs** | `docs/milestone.md` updated after each phase; `docs/handover.md` updated each session |
| **Simulation mode** | AgilityCore is in sim mode; all proofs are `sim_proof_...` until proof server available |

---

## Open questions / risks

| Item | Status |
|---|---|
| Midnight wallet SDK derivation (real keygen vs placeholder) | Open — deferred to Phase 2 |
| Midnight proof server availability (`localhost:6300`) | **Proof server v8.1.0 running locally on port 6300.** AgilityCore update in flight: needs `MIDNIGHT_PROOF_SERVER_URL` env var to point at a public URL. See `docs/agilitycore-update-requirements.md`. |
| Write tests vs production AgilityCore (shared state) | Open — consider local clone for writes |
| Windows Node + WSL UNC path: npm scripts / Prisma / Vite | Workaround in place; resolve properly in Phase 2 |
| DB choice: SQLite dev → Postgres prod (Railway) | Decided; implementation deferred |
| Agent key scoping: admin key vs per-agent keys | Admin key used; agent keys minted via `POST /agents/register` |
