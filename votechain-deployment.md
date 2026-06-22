# VoteChain — Preview Network Deployment & Interaction Guide

Status: **All 6 modular contracts deployed on the Midnight Preview network.**

---

## 1. Deployed Contract Addresses (Preview)

| # | Contract | Address |
|---|----------|---------|
| 1 | **DAO** (`votechain-dao`) | `d4e3299040a14895c5a2f735b41dc57cd7c3127734baaf765bef136f4b84d931` |
| 2 | **Voting** (`votechain-voting`) | `edb5f277d19da414b8d51a728edda92edfd1f9890b389412ec0abdae071acaf5` |
| 3 | **Delegation** (`votechain-delegation`) | `75c21a6676ff1dc542ae654ba36eb1d6c8bb990d508b76374ab49e1291c9d4ca` |
| 4 | **Treasury** (`votechain-treasury`) | `61719733dd930830d45eb2055012a8e74bdf8f16a49e99a79c4673501f5b59b0` |
| 5 | **Feedback** (`votechain-feedback`) | `b5a939e58fb11b31f5e34baad05f9a40c95ed8ba4292d7fbecfd63680f49948e` |
| 6 | **Escrow** (`votechain-escrow`) | `51c20bf57bc7c2a0586b7214da27a09a7f84f8ed92426de84f2d94f8346c3145` |

> These addresses are network-specific (Preview). Redeploying produces new addresses.
> Escrow was deployed standalone via `npm run votechain:escrow-preview`.

---

## 2. Secrets You MUST Save

Interacting with the deployed contracts requires the **same** secrets used at deploy time:

| Secret | Purpose | How to obtain |
|--------|---------|---------------|
| **Wallet seed** (hex) | Funds + signs all transactions | Shown via menu **[6]**, or the seed you entered in menu **[2]** |
| **Admin secret** (32-byte hex) | Authorizes admin circuits across all 6 contracts | Printed when you deploy; pass via menu prompt or `ADMIN_SECRET` env |
| **Voter secrets** (32-byte hex) | One per eligible voter; used to vote/delegate | Generated when adding a voter (menu **[4]**) |

The admin pubkey is derived from the admin secret via `derive_voter_pubkey(adminSecret)`. **Lose the admin secret = lose admin control of all contracts.**

---

## 3. Network & Tooling Configuration

### Preview endpoints (`dao-cli/src/config.ts` → `PreviewConfig`)
| Service | URL |
|---------|-----|
| Indexer (GraphQL) | `https://indexer.preview.midnight.network/api/v3/graphql` |
| Indexer (WS) | `wss://indexer.preview.midnight.network/api/v3/graphql/ws` |
| Node (RPC) | `https://rpc.preview.midnight.network` |
| Proof server | `http://172.22.96.1:6300` (override with `PROOF_SERVER_URL`) |
| Faucet | `https://faucet.midnight.network` |

### Proof server (runs in Docker Desktop on Windows)
```powershell
# Start (latest = 8.1.0)
docker run -d --name midnight-ps -p 6300:6300 midnightntwrk/proof-server:latest midnight-proof-server -v

# Verify from WSL
curl http://172.22.96.1:6300/
```
> The CLI runs inside WSL; `172.22.96.1` is the Windows host IP reachable from WSL. If your Windows host IP differs, set `PROOF_SERVER_URL` accordingly. With Docker Desktop WSL integration, `http://127.0.0.1:6300` also works.

### Verified compatible version stack (all latest)
| Component | Version |
|-----------|---------|
| compact compiler | `0.31.0` (toolchain `0.5.1`) |
| compact language | `0.23.0` |
| `@midnight-ntwrk/compact-runtime` | `0.16.0` |
| `@midnight-ntwrk/compact-js` | `2.5.1` |
| `@midnight-ntwrk/ledger-v8` | `8.1.0` |
| `@midnight-ntwrk/midnight-js` (+ providers) | `4.1.1` |
| proof server | `latest` (= `8.1.0`) |

---

## 4. Running the CLI

```bash
cd dao-cli
npm run votechain:preview          # deploy/manage all 6 contracts (Preview)
npm run votechain:escrow-preview   # deploy ONLY the Escrow contract (Preview)
npm run votechain:preprod          # same multi-contract flow on Preprod
```

**Flow:**
1. **Wallet setup** — `[1]` generate new wallet (fund it from the faucet) or `[2]` recover from seed.
2. **Main menu:**
   - `[1]` Deploy all 6 contracts in sequence (prints + saves addresses)
   - `[2]` Join existing contract by address (enter admin secret to manage)
   - `[3]` View DAO contract state
   - `[4]` Add eligible voter (generates/accepts a voter secret)
   - `[5]` Update block height (admin)
   - `[6]` Show wallet seed
   - `[7]` Exit

> The deploy step deploys DAO first, calls `initialize_dao`, then deploys Voting, Delegation, Treasury, Feedback, and Escrow, each sharing the same admin-derived private state.
>
> **Standalone Escrow:** `npm run votechain:escrow-preview` deploys just the Escrow contract and optionally calls `open_escrow` (prompts for funding goal, deadline, project id, and treasury key — defaults to the admin pubkey).

---

## 5. Contract Interaction Reference (Circuits)

All circuits are callable via `deployed.callTx.<circuit>(...)` after `findDeployedContract`/`joinVotechainDao`. Types: `Field` = bigint, `Bytes<32>` = `Uint8Array(32)`, `Uint<N>` = bigint.

### 5.1 DAO — `votechain-dao`
| Circuit | Params | Who | Notes |
|---------|--------|-----|-------|
| `initialize_dao` | `admin0, admin1, admin2: Bytes<32>` | deployer | One-time; pass same pubkey ×3 for single-admin |
| `add_eligible_voter` | `voterPubKey: Bytes<32>, adminSecret: Bytes<32>` | admin | Adds voter to Merkle tree |
| `remove_eligible_voter` | `voterPubKey: Bytes<32>, adminSecret: Bytes<32>` | admin | |
| `update_block_height` | `newHeight: Uint<64>, adminSecret: Bytes<32>` | admin | Drives time-based phases |

Pure helper: `VotechainDao.pureCircuits.derive_voter_pubkey(secret: Bytes<32>) → Bytes<32>`.

### 5.2 Voting — `votechain-voting`
| Circuit | Params | Notes |
|---------|--------|-------|
| `create_proposal` | `proposalId: Field, metaHash: Bytes<32>, commitDuration: Uint<64>, revealDuration: Uint<64>, quorum: Uint<32>` | Opens commit phase |
| `vote_commit` | `proposalId: Field, ballot: Uint<8>` | Commit-phase vote |
| `vote_reveal` | `proposalId: Field` | Reveal phase |
| `advance_proposal_by_time` | `proposalId: Field` | Advance phase by block height |
| `advance_proposal_multisig` | `proposalId: Field, adminSecret0: Bytes<32>, adminSecret1: Bytes<32>` | 2-of-N admin advance |
| `check_proposal_result` | `proposalId: Field` | Tally/finalize |

### 5.3 Delegation — `votechain-delegation`
| Circuit | Params | Notes |
|---------|--------|-------|
| `delegate` | `delegatePubKey: Bytes<32>, proposalId: Field` | Delegate during commit phase |
| `vote_commit_delegated` | `proposalId: Field, ballot: Uint<8>` | Delegate votes on behalf |
| `revoke_delegation` | `proposalId: Field` | Revoke |

### 5.4 Treasury — `votechain-treasury`
| Circuit | Params | Notes |
|---------|--------|-------|
| `create_treasury_proposal` | `proposalId: Field, metaHash: Bytes<32>, spendCommitment: Bytes<32>, commitDuration: Uint<64>, revealDuration: Uint<64>, quorum: Uint<32>` | Spend proposal |
| `execute_approved_spend` | `proposalId: Field, adminSecret: Bytes<32>` | Admin executes after approval |
| `generate_treasury_audit` | `proposalId: Field` | Audit record |

### 5.5 Feedback — `votechain-feedback`
| Circuit | Params | Notes |
|---------|--------|-------|
| `submit_feedback` | `orgId: Field, periodId: Field` | Anonymous member feedback (nullifier-based) |
| `acknowledge_feedback` | `feedbackNullifier: Bytes<32>, adminSecret: Bytes<32>` | Admin acknowledges |

### 5.6 Escrow — `votechain-escrow`
| Circuit | Params | Who | Notes |
|---------|--------|-----|-------|
| `open_escrow` | `fundingGoal: Uint, deadline: Uint<64>, treasuryKey: Bytes<32>, admin: Bytes<32>, project: Field` | deployer | One-time; opens a funding campaign |
| `deposit` | `amount: Uint, contributorCommitment: Bytes<32>` | contributor | Adds a contribution leaf |
| `release` | `adminSecret: Bytes<32>` | admin | Releases raised funds to treasury on success |
| `refund` | `amount: Uint` | contributor | Refund when goal not met |
| `claimRefund` | `xrplAddress: Bytes` → `Uint` | contributor | Refund against a registered XRPL deposit |
| `fail_escrow` | — | anyone | Marks campaign failed past deadline |
| `close_escrow` | `adminSecret: Bytes<32>` | admin | Finalizes/closes the escrow |
| `mint_membership_credential` | `amount: Uint` → `Bytes<32>` | contributor | Mints membership credential |
| `verify_holding` | — | member | Proves credential holding |
| `registerXrpDeposit` | `receipt: { txHash: Bytes<32>, sender: Bytes, amount: Uint, ledgerIndex: Uint }, adminSecret: Bytes<32>` | admin | Registers a cross-chain XRPL deposit |
| `update_block_height` | `newHeight: Uint<64>, adminSecret: Bytes<32>` | admin | Drives deadline-based phases |

---

## 6. Programmatic Interaction (per API module)

Each contract has an API module in `dao-cli/src/`:
- `votechain-dao-api.ts` — full set (deploy, join, add/remove voter, update height, state queries)
- `votechain-voting-api.ts`, `votechain-delegation-api.ts`, `votechain-treasury-api.ts`, `votechain-feedback-api.ts` — currently expose `configure*Providers` + `deploy*Contract`.
- `votechain-escrow-api.ts` — `configureEscrowProviders`, `deployEscrowContract`, `joinEscrowContract`, plus an `openEscrow(deployed, { fundingGoal, deadline, treasuryKey, admin, project }, logger)` initializer.

Example (DAO, join + admin action):
```ts
import { PreviewConfig } from './config.js';
import { configureVotechainDaoProviders, joinVotechainDao, addEligibleVoter, deriveVoterPubKey } from './votechain-dao-api.js';

const config = new PreviewConfig();
const providers = await configureVotechainDaoProviders(walletContext, config, logger);
const dao = await joinVotechainDao(providers, '<DAO_ADDRESS>', adminSecret, logger);
await addEligibleVoter(dao, deriveVoterPubKey(voterSecret), adminSecret, logger);
```

> **To call Voting/Delegation/Treasury/Feedback circuits programmatically**, add thin wrapper functions in their API modules following the DAO pattern: `const c = await findDeployedContract(providers, { compiledContract, privateStateId, contractAddress, initialPrivateState }); await c.callTx.<circuit>(...)`.

---

## 7. Root Cause of the Deployment Failure (Resolved)

The `initialize_dao` call failed with `Failed Proof Server response: code=400, body="bad input"`.

**Root cause:** In `midnight-js@4.1.1`, the proof provider signature is:
```ts
httpClientProofProvider(url, zkConfigProvider, config)
```
The votechain API modules called it with **only the URL**:
```ts
proofProvider: httpClientProofProvider(config.proofServer)   // BUG: missing zkConfigProvider
```
So the proof provider's internal `zkConfigProvider` was `undefined`. When the SDK called `zkConfigProvider.get('initialize_dao')` it threw `Cannot read properties of undefined (reading 'get')`, which `getKeyMaterial` silently swallowed (`catch { return undefined }`). With no proving key/IR, the SDK sent an empty-IR `/check` payload, which the proof server rejected as `"bad input"`.

**Fix:** Hoist the `NodeZkConfigProvider` into a variable and pass it as the 2nd argument:
```ts
const zkConfigProvider = new NodeZkConfigProvider(votechain<X>Config.zkConfigPath);
// ...
zkConfigProvider,
proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
```
Applied to all 5 API modules: `votechain-dao-api.ts`, `votechain-voting-api.ts`, `votechain-delegation-api.ts`, `votechain-treasury-api.ts`, `votechain-feedback-api.ts`.

This was **not** a version, networking, or proof-server-image problem — those were all already correct.

### Diagnostic technique (for future debugging)
The proof provider discards the HTTP error body. Temporarily patching `node_modules/@midnight-ntwrk/midnight-js-http-client-proof-provider/dist/index.mjs` to (a) include `await response.text()` in the thrown error and (b) log the swallowed exception in `getKeyMaterial`'s `catch` revealed the real `TypeError`. Always restore `index.mjs` from its `.bak` afterward.

---

## 8. Key File Locations

| Path | Purpose |
|------|---------|
| `contract/src/votechain/{1-dao,2-voting,3-delegation,4-treasury,5-feedback,6-escrow}.compact` | Source contracts |
| `contract/src/managed/votechain-*/` | Compiled artifacts (`keys/`, `zkir/`) used by `NodeZkConfigProvider` |
| `contract/src/votechain-witnesses.ts` | Shared witnesses + `createVotechainPrivateState` |
| `dao-cli/src/votechain-*-api.ts` | Per-contract provider setup + operations |
| `dao-cli/src/votechain-preview.ts` | Interactive CLI entry point (all 6 contracts) |
| `dao-cli/src/votechain-preprod.ts` | Interactive CLI entry point on Preprod |
| `dao-cli/src/votechain-escrow-preview.ts` | Standalone Escrow-only deploy (Preview) |
| `dao-cli/src/config.ts` | Network/proof-server config |
| `dao-cli/proof-server.yml` | Docker compose for the proof server |
| `dao-cli/logs/preview/*.log` | Deployment logs (contains deployed addresses) |

---

## 9. Contract Artifacts (zk keys)

Every contract compiles to managed artifacts under `contract/src/managed/votechain-<name>/`
(copied to `contract/dist/managed/votechain-<name>/` on build). The corresponding
`NodeZkConfigProvider(votechain<Name>Config.zkConfigPath)` loads these at deploy/call time.

**Layout is identical for all six contracts** — for each circuit there is one
`keys/<circuit>.prover` + `keys/<circuit>.verifier` pair and one
`zkir/<circuit>.zkir` (text) + `zkir/<circuit>.bzkir` (binary) pair, plus a shared
`contract/index.*` (TS/JS bindings) and `compiler/contract-info.json` (metadata).

### 9.1 Circuits per contract

| Contract | Folder | Circuits (each → `.prover`/`.verifier` + `.zkir`/`.bzkir`) | Count |
|----------|--------|------------------------------------------------------------|-------|
| **DAO** | `votechain-dao` | `initialize_dao`, `add_eligible_voter`, `remove_eligible_voter`, `update_block_height` | 4 |
| **Voting** | `votechain-voting` | `create_proposal`, `vote_commit`, `vote_reveal`, `advance_proposal_by_time`, `advance_proposal_multisig`, `check_proposal_result` | 6 |
| **Delegation** | `votechain-delegation` | `delegate`, `vote_commit_delegated`, `revoke_delegation` | 3 |
| **Treasury** | `votechain-treasury` | `create_treasury_proposal`, `execute_approved_spend`, `generate_treasury_audit` | 3 |
| **Feedback** | `votechain-feedback` | `submit_feedback`, `acknowledge_feedback` | 2 |
| **Escrow** | `votechain-escrow` | `open_escrow`, `deposit`, `release`, `refund`, `claimRefund`, `fail_escrow`, `close_escrow`, `mint_membership_credential`, `verify_holding`, `registerXrpDeposit`, `update_block_height` | 11 |

> Totals: **29 circuits** → 29 `.prover` + 29 `.verifier` keys and 29 `.zkir` + 29 `.bzkir` IR files across the six contracts.

Rebuild any contract's artifacts via its `compact:*` script (or all at once with `compact:all`):

```bash
npm run -w @midnight-ntwrk/dao-contract compact:dao
npm run -w @midnight-ntwrk/dao-contract compact:voting
npm run -w @midnight-ntwrk/dao-contract compact:delegation
npm run -w @midnight-ntwrk/dao-contract compact:treasury
npm run -w @midnight-ntwrk/dao-contract compact:feedback
npm run -w @midnight-ntwrk/dao-contract compact:escrow
npm run -w @midnight-ntwrk/dao-contract compact:all     # all six
```

### 9.2 Example layout (Escrow)

```
contract/src/managed/votechain-escrow/
├── compiler/
│   └── contract-info.json
├── contract/
│   ├── index.cjs / index.d.cts
│   ├── index.js  / index.d.ts          # VotechainEscrow.Contract, ledger(), pureCircuits
│   └── index.js.map
├── keys/                               # proving + verifier keys (one pair per circuit)
│   ├── open_escrow.prover   / open_escrow.verifier
│   ├── deposit.prover       / deposit.verifier
│   ├── release.prover       / release.verifier
│   ├── refund.prover        / refund.verifier
│   ├── claimRefund.prover   / claimRefund.verifier
│   ├── fail_escrow.prover   / fail_escrow.verifier
│   ├── close_escrow.prover  / close_escrow.verifier
│   ├── mint_membership_credential.prover / mint_membership_credential.verifier
│   ├── verify_holding.prover           / verify_holding.verifier
│   ├── registerXrpDeposit.prover       / registerXrpDeposit.verifier
│   └── update_block_height.prover      / update_block_height.verifier
└── zkir/                               # ZK intermediate representation (text + binary)
    ├── open_escrow.zkir     / open_escrow.bzkir
    ├── deposit.zkir         / deposit.bzkir
    ├── release.zkir         / release.bzkir
    ├── refund.zkir          / refund.bzkir
    ├── claimRefund.zkir     / claimRefund.bzkir
    ├── fail_escrow.zkir     / fail_escrow.bzkir
    ├── close_escrow.zkir    / close_escrow.bzkir
    ├── mint_membership_credential.zkir / mint_membership_credential.bzkir
    ├── verify_holding.zkir             / verify_holding.bzkir
    ├── registerXrpDeposit.zkir         / registerXrpDeposit.bzkir
    └── update_block_height.zkir        / update_block_height.bzkir
```

| Asset type | Files | Used for |
|------------|-------|----------|
| Prover keys | `keys/<circuit>.prover` (11) | Generating the ZK proof for each circuit call |
| Verifier keys | `keys/<circuit>.verifier` (11) | On-chain/verifier-side proof verification |
| ZKIR (text) | `zkir/<circuit>.zkir` (11) | Human-readable intermediate representation |
| ZKIR (binary) | `zkir/<circuit>.bzkir` (11) | Compact binary IR consumed by the proof server |
| Contract module | `contract/index.*` | TS/JS bindings (`Contract`, `ledger`, `pureCircuits`) |
| Compiler metadata | `compiler/contract-info.json` | Circuit/ledger metadata emitted by `compact compile` |

> The other five contracts (`votechain-dao`, `votechain-voting`, `votechain-delegation`, `votechain-treasury`, `votechain-feedback`) follow this exact `keys/` + `zkir/` + `contract/` + `compiler/` layout — only the per-circuit file names differ (see the table in 9.1).
