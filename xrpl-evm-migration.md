# VoteChain — XRPL EVM Sidechain Migration Plan

**Status:** Proposed (build doc for review — no code written yet)
**Author:** drafted 2026-06-21
**Goal:** Move the parts of VoteChain that currently lack real decentralization (escrow, treasury, membership, authoritative governance results) onto the **XRPL EVM Sidechain** as Solidity contracts, while keeping **Midnight** for ZK-private vote choice. This unblocks the stalled Midnight escrow Compact deploy and the flaky native-XRPL work by replacing both with a mature EVM toolchain.

---

## 1. Why this, why now

Two active roadblocks:

1. **Midnight escrow Compact contract won't deploy** — it is on the critical path for funding.
2. **Native XRPL** (rippled escrow / hooks / issued-currency mint) has been fragile.

Both pain points are the *settlement + authoritative-state* layer. The XRPL EVM Sidechain solves them in one move:

- **Solidity + Foundry/Hardhat + viem** is a mature, reliable toolchain — contracts deploy today.
- **XRP is the native gas token**, so we stay in the XRP ecosystem (story intact for the XRPL track).
- It is **live on mainnet (June 30, 2025)** with a public testnet, so this is production-viable, not experimental.

### What stays vs. moves

| Concern | Today (reality) | Target |
|---|---|---|
| Funding escrow | JSON + best-effort / blocked Compact | **XRPL EVM `CampaignEscrow`** (authoritative) |
| Treasury balance + spend | JSON balance, no funds move (`treasury-repository.ts`) | **XRPL EVM `Treasury`** (real funds) |
| Membership asset + gating | XRPL native mint; `verifyHolding` not re-checked by bot | **XRPL EVM `MembershipNFT`** (ERC-721); real `verifyHolding` |
| Public governance result | Computed in `.data/proposals.json`; on-chain calls are best-effort mirrors | **XRPL EVM `GovernanceResults`** anchor (authoritative public result) |
| **Private vote choice** | Midnight ZK (`lib/midnight/client.ts`) | **Unchanged — stays on Midnight** |
| Midnight escrow Compact | Won't deploy | **Shelved** (optional future ZK-private funding) |

> Design principle preserved: the private vote *choice* still never leaves the browser/Midnight. XRPL EVM only ever stores the *aggregate result/commitment*, never an individual's plaintext choice.

---

## 2. Network details (XRPL EVM)

Confirm current values against the official docs before coding — endpoints change.

| Item | Testnet | Mainnet |
|---|---|---|
| Chain ID | `1449000` (confirmed via ChainList) | ~`1440000` (verify) |
| Native gas token | XRP | XRP |
| RPC URL | per `xrplevm.org` docs (e.g. `https://rpc.testnet.xrplevm.org`) | per docs |
| Explorer | per docs (Blockscout-style) | per docs |
| Faucet | XRPL EVM testnet faucet | n/a |
| Consensus | Cosmos SDK + Proof-of-Authority | same |
| Bridge (XRPL mainnet ↔ EVM) | Axelar | Axelar |

Sources: `xrplevm.org`, `chainlist.org/chain/1449000`, `ripple.com/insights` (mainnet launch), Quicknode XRPL EVM docs.

---

## 3. Contracts (Solidity, OpenZeppelin)

All contracts use OpenZeppelin (`Ownable`/`AccessControl`, `ReentrancyGuard`, `ERC721`). Amounts are native XRP (wei-scale on EVM) unless an ERC-20 funding token is chosen.

### 3.1 `EscrowFactory.sol` + `CampaignEscrow.sol`
Replaces the blocked Midnight escrow.

- `EscrowFactory.createCampaign(projectId, goal, deadline, treasury, membershipNFT) → escrowAddress`
  - Deploys/clones a `CampaignEscrow`. The returned address becomes `EscrowRef.address`.
- `CampaignEscrow`:
  - `contribute() payable` — records `contributions[msg.sender] += msg.value`; emits `Contributed(from, amount, block)`.
  - `goal`, `deadline`, `totalRaised`, `released` state.
  - `release()` — when `totalRaised >= goal`: transfer balance to `treasury`; emits `Released`. Operator/owner-gated.
  - `refund()` — after `deadline` with goal missed: contributor pulls their `contributions[...]` back (pull-payment pattern, reentrancy-safe).
  - `goalMet() view`, `getBalance() view`.

### 3.2 `MembershipNFT.sol` (ERC-721)
- `mint(address to)` — operator-gated; one membership token per contributor on activation.
- Standard `balanceOf(addr)` powers `verifyHolding` (≥ 1 = member).
- Optional non-transferable (soulbound) override to keep membership tied to the contributor.

### 3.3 `Treasury.sol`
- Receives released escrow funds.
- `executeSpend(recipient, amount, proposalRef)` — gated: only callable when the referenced proposal is marked passed (via `GovernanceResults` or an operator attestation). Replaces the JSON `appendTx('spend')`.
- Emits `SpendExecuted` for the audit ledger.

### 3.4 `GovernanceResults.sol` (or OpenZeppelin `Governor`)
- `anchorResult(proposalId, outcome, tallyHash)` — operator-anchored authoritative public result. Provides on-chain auditability without exposing private choices.
- Phase 2 option: full on-chain `Governor` if/when we want fully trustless tallying for *public* proposals.

---

## 4. App integration

### 4.1 New chain adapter — `lib/chains/xrpl-evm-adapter.ts`
Implements the existing `ChainAdapter` interface (`lib/chains/types.ts`) with **`viem`** (`publicClient` for reads, `walletClient` for operator writes). Mapping:

| `ChainAdapter` method | XRPL EVM implementation |
|---|---|
| `createEscrow(input)` | `EscrowFactory.createCampaign(...)` → `ref.address` = escrow contract; `auth.secret` = operator key |
| `getEscrowBalance(ref)` | `publicClient.getBalance({ address: ref.address })` or `escrow.read.getBalance()` |
| `scanContributions(ref, marker)` | `publicClient.getLogs({ event: Contributed, fromBlock: marker })`; new `marker` = latest block |
| `releaseEscrow(ref, dest, auth)` | `escrow.write.release()` |
| `refundContributor(ref, who, amt, auth)` | `escrow.write.refund()` (pull) / operator-assisted |
| `mintMembership(input, auth)` | `MembershipNFT.write.mint(to)` |
| `verifyHolding(input)` | `MembershipNFT.read.balanceOf(addr) > 0n` |
| `getAccountReserve?()` | omit (no XRPL-style reserve on EVM) |

### 4.2 Registry + type
- `lib/agility/types.ts` → add `'xrpl-evm'` to `ChainName`.
- `lib/chains/registry.ts` → `case 'xrpl-evm': return new XrplEvmAdapter();` and add to `LAUNCHPAD_CHAINS`.

### 4.3 Config / env
```
XRPL_EVM_RPC_URL=            # testnet RPC
XRPL_EVM_CHAIN_ID=1449000
XRPL_EVM_OPERATOR_KEY=       # encrypted at rest; signs release/refund/mint (server-only)
XRPL_EVM_ESCROW_FACTORY=0x...
XRPL_EVM_MEMBERSHIP_NFT=0x...   # or per-project
XRPL_EVM_TREASURY=0x...         # or per-project
XRPL_EVM_GOVERNANCE=0x...
```
> Operator key is custody material — store encrypted (reuse `LAUNCHPAD_ENCRYPTION_KEY` pattern) and never expose to the browser.

### 4.4 Contracts workspace
- New top-level `contracts-evm/` (Foundry recommended; Hardhat acceptable).
- `src/` contracts, `test/` Foundry tests, `script/Deploy.s.sol` deploy script, deployed addresses written to a JSON the app reads.

---

## 5. Dependencies to add

- **App:** `viem` (TS-native EVM client; lighter than ethers).
- **Contracts:** Foundry (`forge`, `cast`) **or** Hardhat + `@openzeppelin/contracts`.
- Decision needed: **Foundry vs Hardhat** (see §8).

---

## 6. Deploy steps (testnet, once contracts exist)

1. Fund an operator address from the XRPL EVM testnet faucet.
2. `forge script script/Deploy.s.sol --rpc-url $XRPL_EVM_RPC_URL --broadcast` (or Hardhat deploy).
3. Record `EscrowFactory` / `MembershipNFT` / `Treasury` / `GovernanceResults` addresses into config/env.
4. Add `xrpl-evm` adapter, point a test project's `chain` to `xrpl-evm`.
5. Run the launchpad flow: create campaign → contribute (faucet XRP) → release → mint membership → Discord `/link` `verifyHolding` passes.

---

## 7. Rollout phases

- **EVM-1 — Escrow:** `CampaignEscrow` + `EscrowFactory` + deploy script + adapter escrow methods. *(Unblocks the funding roadblock.)*
- **EVM-2 — Membership:** `MembershipNFT` + `mintMembership`/`verifyHolding`; wire Discord `/vote` to re-verify on-chain holdings.
- **EVM-3 — Treasury:** `Treasury` + migrate spend execution off JSON.
- **EVM-4 — Governance anchor:** `GovernanceResults`; Midnight remains the private-vote layer, XRPL EVM stores authoritative public results.

---

## 8. Open decisions (need your call)

1. **Foundry or Hardhat** for `contracts-evm/`?
2. **Funding currency:** native XRP (gas token) or an ERC-20 stablecoin on XRPL EVM?
3. **Custody model:** single platform operator key for release/refund/mint, or per-project keys? (affects EscrowRef + key storage)
4. **Membership transferability:** soulbound (non-transferable) or standard ERC-721?
5. **Governance:** simple result-anchor now, or full OpenZeppelin `Governor` for public proposals later?
6. **Testnet vs mainnet** for the next demo.

---

## 9. Risks / notes

- **Bridging:** moving real XRP between XRPL mainnet and XRPL EVM uses Axelar; for the demo use native testnet XRP and defer bridging UX.
- **Operator key security:** the server holds a signing key — encrypt at rest, scope it, and consider a per-project key or a multisig later.
- **Indexer:** `scanContributions` via `getLogs` is fine at demo scale; for production add an indexer or bounded block-range pagination.
- **Midnight stays:** this plan does not remove Midnight — it narrows it to private voting, its strongest claim.
