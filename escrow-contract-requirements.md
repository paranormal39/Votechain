# VoteChain — Compact Escrow Contract Requirements

**Status:** Specification for implementation (Launchpad Phase A, item `a15`).
**Owner:** contract author (you). **Consumer:** `lib/chains/midnight-adapter.ts` (already stubbed and gated).
**Target:** Midnight **Preview**, compiled into `contract/src/managed/votechain-escrow`, deployed, address set as `MIDNIGHT_ESCROW_ADDRESS`.

---

## 1. Purpose

The escrow contract is the on-chain settlement layer for the VoteChain **DAO launchpad** on Midnight. A launchpad *project* raises real NIGHT into escrow. When the funding goal is met by the deadline, the project **activates**: escrow is released to the project treasury and a **membership credential** is issued to each contributor. If the goal is missed, contributors are **refunded**.

It is the Midnight counterpart to the XRPL adapter (`lib/chains/xrpl-adapter.ts`), which already implements the same lifecycle natively. The contract must satisfy the `ChainAdapter` contract defined in `lib/chains/types.ts`.

### Privacy goals (non-negotiable)
- **Individual contributions are shielded** — a contributor's identity and amount must not be publicly linkable.
- **The aggregate raised total is public** — needed so the funding goal/progress can be read and the goal-met transition verified by anyone.
- **Membership is provable without doxxing** — a holder can later prove they hold the credential (e.g. to the Discord bot) via a ZK proof; the contract/bot learns only valid/invalid, never the wallet↔Discord mapping.

---

## 2. How it must plug into the existing system

Mirror the conventions already used by the five live contracts (`1-dao` … `5-feedback`).

### 2.1 Authoring + build
- Source file: `contract/src/votechain/6-escrow.compact`.
- Add a compile script to `contract/package.json`:
  ```json
  "compact:escrow": "compact compile src/votechain/6-escrow.compact src/managed/votechain-escrow",
  ```
  and append `&& npm run compact:escrow` to `compact:all`.
- Output ZK assets land in `contract/src/managed/votechain-escrow/` and are copied to `contract/dist/managed/` by the existing `build` script. `lib/midnight/config.ts` already points `votechainEscrowConfig.zkConfigPath` there.

### 2.2 Package exports (`@midnight-ntwrk/dao-contract`)
The BFF imports compiled contracts from this package. Export, following the existing pattern (`VotechainDao`, `VotechainTreasury`, …):
- `VotechainEscrow` (namespace with `Contract`, `ledger`, `pureCircuits`).
- Reuse `votechainWitnesses`, `VotechainPrivateState`, `createVotechainPrivateState`, `withAdminSecretKey` if compatible; otherwise add escrow-specific witness wiring and document it.

### 2.3 Already-wired seams (do not re-create)
- `lib/midnight/config.ts` → `votechainEscrowConfig`, `DEPLOYED_ADDRESSES.escrow`, `isEscrowContractDeployed()`.
- `.env.example` → `MIDNIGHT_ESCROW_ADDRESS` (empty until deployed).
- `lib/chains/midnight-adapter.ts` → stubbed methods that throw `AdapterUnsupportedError` until the address is set; these are where you wire `callTx`.

### 2.4 BFF call pattern (what the adapter will do)
Identical to `lib/midnight/client.ts`:
```ts
const escrow = await joinContract(
  DEPLOYED_ADDRESSES.escrow, compiledEscrow, 'vcEscrowState',
  votechainEscrowConfig.zkConfigPath, votechainEscrowConfig.privateStateStoreName, privateState,
);
await escrow.callTx.<circuit>(...args);
// reads: VotechainEscrow.ledger(await providers.publicDataProvider.queryContractState(addr).data)
```
Auth uses the **server wallet** (`MIDNIGHT_WALLET_SEED`) + **admin secret** (`MIDNIGHT_ADMIN_SECRET`), exactly like the treasury/voting admin circuits.

---

## 3. Funding & value model

> ⚠️ **Key implementation area — confirm against your Compact compiler version.** Native-token custody (receiving, holding, and sending NIGHT/tDUST coins inside a contract) is the hardest part and the API differs across Compact releases. Mirror how `4-treasury.compact` already moves value, and confirm the coin/`send`/`receive`/`mint` primitives available to you.

- **Escrow currency:** native Midnight token (tDUST on Preview / NIGHT on mainnet). One deployed escrow instance per project (the adapter's `createEscrow` returns this contract's address; `projectId` is carried in `EscrowRef.meta`).
  - *Decision to confirm:* one **shared** escrow contract keyed by `projectId`, **or** one **deployed instance per project**. Per-instance is simpler to reason about and matches the XRPL "one escrow account per project" model; shared is cheaper to deploy. **Recommended: one instance per project.**
- **Deposit:** a contributor sends native coin into the contract via a `deposit` circuit. The contract:
  - adds the coin value to its held balance,
  - increments the **public** `raisedTotal`,
  - records a **shielded** per-contributor commitment so refunds and the no-double-mint rule are possible without revealing identities.
- **Release:** once `raisedTotal >= goal`, an admin-authorized `release` sends the full held balance to the project treasury (destination provided by the BFF).
- **Refund:** if the deadline passes with `raisedTotal < goal`, `refund` returns each contributor's deposited amount. Contributor proves their commitment (witness) to claim, or admin triggers refunds from recorded commitments — see §6 open questions.

---

## 4. Ledger (public) state

Public, readable via the indexer. Keep it minimal — no per-contributor data in the clear.

| Field | Type | Notes |
|---|---|---|
| `initialized` | bool | set by `open_escrow` |
| `goal` | Uint | funding goal in smallest unit |
| `deadlineBlock` | Uint | block height (or timestamp) deadline |
| `raisedTotal` | Uint | **public** aggregate raised |
| `status` | enum | `Open=0, Released=1, Failed=2, Refunding=3, Closed=4` |
| `treasury` | Bytes/ZswapCoinPublicKey | release destination |
| `adminPubKey` | Bytes[32] | derived from admin secret (as in DAO) |
| `contributionRoot` | MerkleTree root | commitments of `(contributorCommitment, amount)` for refund/mint proofs |
| `membershipRoot` / `mintedSet` | Merkle/Set | issued-credential commitments; prevents double-mint |
| `projectId` | Bytes/Uint | binding to the off-chain project (esp. if shared instance) |

State transitions: `Open → Released` (goal met + release) | `Open → Failed → Refunding → Closed` (deadline missed).

---

## 5. Circuits (entry points)

Names are suggestions; match VoteChain's `snake_case` convention. Mark each **admin** (requires admin secret, like treasury) or **public** (any contributor).

### 5.1 `open_escrow` — admin
```
open_escrow(goal: Uint, deadlineBlock: Uint, treasury: <coin pubkey>, adminPubKey: Bytes[32], projectId: ...)
```
Initializes ledger state; callable once. (Analogous to `initialize_dao`.)

### 5.2 `deposit` — public (contributor)
```
deposit(/* incoming native coin */, contributorCommitment: Bytes[32])
```
- Accepts the sent coin, adds value to held balance, `raisedTotal += amount`.
- Inserts `(contributorCommitment, amount)` into `contributionRoot`.
- `contributorCommitment` is derived **client-side** from the contributor's secret (witness) so the contributor stays anonymous but can later prove ownership for refund/mint.
- Reject if `status != Open` or `currentBlock > deadlineBlock`.

### 5.3 `release` — admin
```
release()
```
- Require `raisedTotal >= goal` and `status == Open`.
- Send entire held balance to `treasury`. Set `status = Released`.

### 5.4 `refund` — public (contributor) or admin
```
refund(contributorSecret/proof, amount, path: MerkleTreePath)
```
- Require `status` is `Failed`/`Refunding` (deadline passed, goal not met).
- Verify the contributor's commitment is in `contributionRoot` and not already refunded.
- Send `amount` back to the contributor; mark commitment spent.

### 5.5 `mint_membership_credential` — admin or contributor
```
mint_membership_credential(contributorProof, path: MerkleTreePath) -> credentialCommitment
```
- Require `status == Released`.
- Verify the caller contributed (commitment ∈ `contributionRoot`) and has not already minted (not ∈ `mintedSet`).
- Issue the membership credential and record its commitment in `membershipRoot`/`mintedSet`.
- **Credential design — decide:** (a) mint a domain-separated **token** to the contributor (transferable / checkable), or (b) record a **credential commitment** the holder later proves in zero-knowledge (best for the "prove holding without revealing identity" bot flow). **Recommended: (b)** + an optional non-transferable token receipt.

### 5.6 `verify_holding` (pure / read) — optional
A `pureCircuit` or witness-backed check that, given a holder's proof, returns whether they hold a credential — consumed by the Discord bot's `/link` gating. May live here or be derived from `membershipRoot`.

### 5.7 `fail_escrow` — admin (optional helper)
Flip `Open → Failed` after `deadlineBlock` to open the refund window (or make this implicit in `refund`).

---

## 6. Witnesses (private inputs)

Following `votechainWitnesses` / `VotechainPrivateState`:
- `contributorSecret: Bytes[32]` — derives `contributorCommitment = hash(domainSep, secret, projectId)`.
- `adminSecretKey: Bytes[32]` — admin authorization (reuse `withAdminSecretKey`).
- Merkle authentication paths for refund/mint membership proofs (reuse `MerkleTreePath` / `withVoterAuthPath` pattern from the DAO contract).

The BFF holds the admin secret (`MIDNIGHT_ADMIN_SECRET`). The **contributor secret** is the privacy-critical piece — see open questions.

---

## 7. Authorization & security

- **Admin-gated:** `open_escrow`, `release`, `fail_escrow`, and (if chosen) `mint_membership_credential`. Verify the caller knows the admin secret matching `adminPubKey` (mirror `add_eligible_voter` / `execute_approved_spend`).
- **Anti–double-spend:** refunds and mints must be single-use per contribution commitment (spent-set / nullifier).
- **Deadline & goal invariants:** `deposit` only while `Open` and before deadline; `release` only when goal met; `refund` only after fail.
- **No fund lock-up:** every coin path (release **or** refund) must fully drain the contract; add a guarded admin sweep only as a last-resort, clearly documented.
- **Reentrancy / partial failure:** ensure state is updated before/atomically with value transfer.

---

## 8. Adapter mapping (acceptance criteria)

The contract is "done" when `lib/chains/midnight-adapter.ts` can implement, against real circuits:

| Adapter method | Escrow circuit / read |
|---|---|
| `createEscrow` | deploy instance + `open_escrow` (or register `projectId` on shared instance) |
| `getEscrowBalance` | read `raisedTotal` from ledger |
| `scanContributions` | (shielded) returns aggregate only; per-contributor stays empty by design |
| `releaseEscrow` | `release()` |
| `refundContributor` | `refund(...)` |
| `mintMembership` | `mint_membership_credential(...)` |
| `verifyHolding` | `verify_holding` / `membershipRoot` proof |

---

## 9. Build, deploy, configure

1. Author `contract/src/votechain/6-escrow.compact`.
2. `npm run compact:escrow` (and add to `compact:all`); then `npm run build` in `contract/`.
3. Export `VotechainEscrow` from `@midnight-ntwrk/dao-contract`; rebuild the package.
4. Deploy to Preview with a script mirroring the existing deploy flow (proof server at `MIDNIGHT_PROOF_SERVER_URL`, server wallet from `MIDNIGHT_WALLET_SEED`). Record the address.
5. Set `MIDNIGHT_ESCROW_ADDRESS=<addr>` in `.env`. `isEscrowContractDeployed()` flips true.
6. Wire `callTx`/reads in `lib/chains/midnight-adapter.ts` (replace the `AdapterUnsupportedError` stubs) + add the `votechain-escrow-api.ts` provider module like the other contracts.
7. Update `votechain-deployment.md` with the new address.

---

## 10. Testing

- **Contract unit tests** (`vitest`, like existing contracts): open → deposit (×N) → goal met → release drains balance to treasury; open → deposit → deadline → refund returns exact amounts; double-refund and double-mint are rejected; deposit after deadline rejected; non-admin `release` rejected.
- **Privacy assertions:** ledger exposes `raisedTotal` but no per-contributor identity/amount.
- **Integration / E2E:** extend the launchpad flow — fund a Midnight project on Preview → `activate` → confirm release tx + credential commitments → contributor proves holding.

---

## 11. Open questions (please decide before coding)

1. **One escrow instance per project** (recommended) vs one shared instance keyed by `projectId`?
2. **Contributor secret custody:** does the contributor generate/hold it in their wallet (best privacy; needs Lace-side UX to deposit + later prove), or does the BFF custody a per-contributor secret (simpler, weaker privacy)? This drives the `deposit`/`refund`/`mint` UX.
3. **Credential form:** ZK-provable commitment (recommended, best for bot gating) vs transferable token vs both?
4. **Deadline unit:** block height (consistent with the DAO's `currentBlockHeight`) vs timestamp.
5. **Refund trigger:** contributor-pull (each claims) vs admin-push (BFF iterates commitments). Pull is more trustless; push is simpler operationally.
6. **Native coin handling specifics** for your Compact version (§3 warning) — confirm the exact receive/send/mint primitives.

---

## 12. Reference (existing patterns to copy)

- `lib/midnight/client.ts` — `joinContract`, admin-secret circuit calls (`add_eligible_voter`, `execute_approved_spend`).
- `lib/midnight/api/votechain-treasury-api.ts` — provider setup + deploy/join; value/spend handling to mirror for release.
- `lib/midnight/api/votechain-dao-api.ts` — `pureCircuits.derive_voter_pubkey`, `withAdminSecretKey`, Merkle paths, ledger reads.
- `contract/package.json` — compile script convention.
- `lib/chains/types.ts` + `lib/chains/midnight-adapter.ts` — the interface this contract must satisfy.
- `lib/chains/xrpl-adapter.ts` — the same lifecycle implemented natively on XRPL, as a behavioral reference.
