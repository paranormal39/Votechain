import 'server-only';
import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js/utils';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { pino } from 'pino';
import { createHash } from 'crypto';
import {
  VotechainDao,
  VotechainVoting,
  VotechainDelegation,
  VotechainTreasury,
  VotechainFeedback,
  VotechainEscrow,
  votechainWitnesses,
  createVotechainPrivateState,
  withAdminSecretKey,
  withDelegatorSecretKey,
  type VotechainPrivateState,
} from '@midnight-ntwrk/dao-contract';
import {
  getNetworkConfig,
  DEPLOYED_ADDRESSES,
  votechainDaoConfig,
  votechainVotingConfig,
  votechainDelegationConfig,
  votechainTreasuryConfig,
  votechainFeedbackConfig,
  votechainEscrowConfig,
} from './config';
import {
  getServerWalletContext,
  getAdminSecret,
  isMidnightEnabled,
  createWalletAndMidnightProvider,
} from './provider';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// ─── Provider factory ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeProviders(zkConfigPath: string, privateStateName: string): Promise<any> {
  const cfg = getNetworkConfig();
  const ctx = await getServerWalletContext(cfg);
  const w = await createWalletAndMidnightProvider(ctx);
  const accountId = w.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, 'hex').toString('base64')}!`;
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: privateStateName,
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(cfg.indexer, cfg.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(cfg.proofServer, zkConfigProvider),
    walletProvider: w,
    midnightProvider: w,
  };
}

// ─── Compiled contract definitions ───────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
const _w = votechainWitnesses as any;
const _withW = CompiledContract.withWitnesses as any;
const _withAssets = CompiledContract.withCompiledFileAssets as any;

const compiledDao: any = CompiledContract.make('votechain-dao', VotechainDao.Contract as any).pipe(
  _withW(_w),
  _withAssets(votechainDaoConfig.zkConfigPath),
);

const compiledVoting: any = CompiledContract.make('votechain-voting', VotechainVoting.Contract as any).pipe(
  _withW(_w),
  _withAssets(votechainVotingConfig.zkConfigPath),
);

const compiledTreasury: any = CompiledContract.make('votechain-treasury', VotechainTreasury.Contract as any).pipe(
  _withW(_w),
  _withAssets(votechainTreasuryConfig.zkConfigPath),
);

const compiledFeedback: any = CompiledContract.make('votechain-feedback', VotechainFeedback.Contract as any).pipe(
  _withW(_w),
  _withAssets(votechainFeedbackConfig.zkConfigPath),
);

const compiledDelegation: any = CompiledContract.make('votechain-delegation', VotechainDelegation.Contract as any).pipe(
  _withW(_w),
  _withAssets(votechainDelegationConfig.zkConfigPath),
);

const compiledEscrow: any = CompiledContract.make('votechain-escrow', VotechainEscrow.Contract as any).pipe(
  _withW(_w),
  _withAssets(votechainEscrowConfig.zkConfigPath),
);
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Secret derivation ────────────────────────────────────────────────────────

/**
 * Deterministically derive a 32-byte voter/member secret (hex) from a wallet
 * address. Mirrors the scheme used in OrgService.addMember so the same wallet
 * always maps to the same on-chain identity across DAO, Voting, Delegation and
 * Feedback contracts.
 */
export function deriveWalletSecretHex(walletAddress: string): string {
  return createHash('sha256').update(walletAddress).digest('hex');
}

/** Derive the on-chain voter pubkey for a wallet address. */
export function deriveVoterPubKeyForAddress(walletAddress: string): Uint8Array {
  const secret = Buffer.from(deriveWalletSecretHex(walletAddress), 'hex');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (VotechainDao.pureCircuits as any).derive_voter_pubkey(secret) as Uint8Array;
}

/** Stable numeric (Field) id derived from an arbitrary string id. */
export function toFieldId(id: string): bigint {
  const digest = createHash('sha256').update(id).digest();
  // Use the low 16 bytes to stay well within the field modulus.
  return BigInt('0x' + digest.subarray(0, 16).toString('hex'));
}

// ─── Contract join helper ────────────────────────────────────────────────────

async function joinContract(
  addr: string,
  compiled: unknown,
  privateStateId: string,
  zkConfigPath: string,
  privateStateName: string,
  privateState: VotechainPrivateState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  assertIsContractAddress(addr);
  const providers = await makeProviders(zkConfigPath, privateStateName);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (findDeployedContract as any)(providers, {
    compiledContract: compiled,
    privateStateId,
    contractAddress: addr as ContractAddress,
    initialPrivateState: privateState,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export { isMidnightEnabled };

/**
 * Add an eligible voter to the DAO contract.
 * Called server-side when a member joins an org.
 * voterSecretHex: 32-byte hex secret for the voter.
 */
export async function onChainAddEligibleVoter(voterSecretHex: string): Promise<void> {
  if (!isMidnightEnabled()) return;
  const adminSecret = getAdminSecret();
  const voterSecret = Buffer.from(voterSecretHex, 'hex');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voterPubKey = (VotechainDao.pureCircuits as any).derive_voter_pubkey(voterSecret);
  log.info({ pub: Buffer.from(voterPubKey as Uint8Array).toString('hex').slice(0, 16) }, 'onChain: addEligibleVoter');
  const privateState = withAdminSecretKey(createVotechainPrivateState(adminSecret), adminSecret);
  const dao = await joinContract(
    DEPLOYED_ADDRESSES.dao, compiledDao, 'vcDaoState',
    votechainDaoConfig.zkConfigPath, votechainDaoConfig.privateStateStoreName, privateState,
  );
  await dao.callTx.add_eligible_voter(voterPubKey, adminSecret);
  log.info('onChain: addEligibleVoter done');
}

/**
 * Create an on-chain proposal in the Voting contract.
 * proposalId: numeric id (bigint)
 * metaHash: 32-byte hash of the proposal metadata
 */
export async function onChainCreateProposal(
  proposalId: bigint,
  metaHash: Uint8Array,
  commitDuration: bigint = 50n,
  revealDuration: bigint = 50n,
  quorum: number = 1,
): Promise<void> {
  if (!isMidnightEnabled()) return;
  const adminSecret = getAdminSecret();
  const privateState = withAdminSecretKey(createVotechainPrivateState(adminSecret), adminSecret);
  log.info({ proposalId }, 'onChain: createProposal');
  const voting = await joinContract(
    DEPLOYED_ADDRESSES.voting, compiledVoting, 'vcVotingState',
    votechainVotingConfig.zkConfigPath, votechainVotingConfig.privateStateStoreName, privateState,
  );
  await voting.callTx.create_proposal(proposalId, metaHash, commitDuration, revealDuration, BigInt(quorum));
  log.info({ proposalId }, 'onChain: createProposal done');
}

/**
 * Commit a vote on-chain for a voter.
 * voterSecretHex: voter private secret (32-byte hex)
 * ballot: 0=NO, 1=YES, 2=ABSTAIN
 */
export async function onChainVoteCommit(
  proposalId: bigint,
  voterSecretHex: string,
  ballot: 0 | 1 | 2,
): Promise<void> {
  if (!isMidnightEnabled()) return;
  const voterSecret = Buffer.from(voterSecretHex, 'hex');
  const privateState: VotechainPrivateState = { ...createVotechainPrivateState(voterSecret), voteChoice: ballot };
  const voting = await joinContract(
    DEPLOYED_ADDRESSES.voting, compiledVoting, 'vcVotingState',
    votechainVotingConfig.zkConfigPath, votechainVotingConfig.privateStateStoreName, privateState,
  );
  log.info({ proposalId, ballot }, 'onChain: voteCommit');
  await voting.callTx.vote_commit(proposalId, BigInt(ballot));
  log.info({ proposalId }, 'onChain: voteCommit done');
}

/**
 * Reveal a committed vote on-chain.
 */
export async function onChainVoteReveal(
  proposalId: bigint,
  voterSecretHex: string,
): Promise<void> {
  if (!isMidnightEnabled()) return;
  const voterSecret = Buffer.from(voterSecretHex, 'hex');
  const privateState = createVotechainPrivateState(voterSecret);
  const voting = await joinContract(
    DEPLOYED_ADDRESSES.voting, compiledVoting, 'vcVotingState',
    votechainVotingConfig.zkConfigPath, votechainVotingConfig.privateStateStoreName, privateState,
  );
  log.info({ proposalId }, 'onChain: voteReveal');
  await voting.callTx.vote_reveal(proposalId);
  log.info({ proposalId }, 'onChain: voteReveal done');
}

/**
 * Finalize (check result) of a proposal on-chain.
 */
export async function onChainCheckProposalResult(proposalId: bigint): Promise<void> {
  if (!isMidnightEnabled()) return;
  const adminSecret = getAdminSecret();
  const privateState = withAdminSecretKey(createVotechainPrivateState(adminSecret), adminSecret);
  const voting = await joinContract(
    DEPLOYED_ADDRESSES.voting, compiledVoting, 'vcVotingState',
    votechainVotingConfig.zkConfigPath, votechainVotingConfig.privateStateStoreName, privateState,
  );
  log.info({ proposalId }, 'onChain: checkProposalResult');
  await voting.callTx.check_proposal_result(proposalId);
  log.info({ proposalId }, 'onChain: checkProposalResult done');
}

/**
 * Create a treasury proposal on-chain.
 */
export async function onChainCreateTreasuryProposal(
  proposalId: bigint,
  metaHash: Uint8Array,
  spendCommitment: Uint8Array,
  commitDuration: bigint = 50n,
  revealDuration: bigint = 50n,
  quorum: number = 1,
): Promise<void> {
  if (!isMidnightEnabled()) return;
  const adminSecret = getAdminSecret();
  const privateState = withAdminSecretKey(createVotechainPrivateState(adminSecret), adminSecret);
  log.info({ proposalId }, 'onChain: createTreasuryProposal');
  const treasury = await joinContract(
    DEPLOYED_ADDRESSES.treasury, compiledTreasury, 'vcTreasuryState',
    votechainTreasuryConfig.zkConfigPath, votechainTreasuryConfig.privateStateStoreName, privateState,
  );
  await treasury.callTx.create_treasury_proposal(
    proposalId, metaHash, spendCommitment, commitDuration, revealDuration, BigInt(quorum),
  );
  log.info({ proposalId }, 'onChain: createTreasuryProposal done');
}

/**
 * Execute an approved treasury spend on-chain.
 */
export async function onChainExecuteApprovedSpend(proposalId: bigint): Promise<void> {
  if (!isMidnightEnabled()) return;
  const adminSecret = getAdminSecret();
  const privateState = withAdminSecretKey(createVotechainPrivateState(adminSecret), adminSecret);
  const treasury = await joinContract(
    DEPLOYED_ADDRESSES.treasury, compiledTreasury, 'vcTreasuryState',
    votechainTreasuryConfig.zkConfigPath, votechainTreasuryConfig.privateStateStoreName, privateState,
  );
  log.info({ proposalId }, 'onChain: executeApprovedSpend');
  await treasury.callTx.execute_approved_spend(proposalId, adminSecret);
  log.info({ proposalId }, 'onChain: executeApprovedSpend done');
}

/**
 * Generate a treasury audit record on-chain.
 * Returns the tx receipt for storage.
 */
export async function onChainGenerateTreasuryAudit(proposalId: bigint): Promise<string> {
  if (!isMidnightEnabled()) return 'midnight-disabled';
  const adminSecret = getAdminSecret();
  const privateState = withAdminSecretKey(createVotechainPrivateState(adminSecret), adminSecret);
  const treasury = await joinContract(
    DEPLOYED_ADDRESSES.treasury, compiledTreasury, 'vcTreasuryState',
    votechainTreasuryConfig.zkConfigPath, votechainTreasuryConfig.privateStateStoreName, privateState,
  );
  log.info({ proposalId }, 'onChain: generateTreasuryAudit');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await treasury.callTx.generate_treasury_audit(proposalId);
  const receipt: string = result?.contractAddress ?? `audit-${proposalId}-${Date.now()}`;
  log.info({ proposalId, receipt }, 'onChain: generateTreasuryAudit done');
  return receipt;
}

/**
 * Submit anonymous member feedback on-chain.
 */
export async function onChainSubmitFeedback(
  orgId: bigint,
  periodId: bigint,
  memberSecretHex: string,
): Promise<void> {
  if (!isMidnightEnabled()) return;
  const memberSecret = Buffer.from(memberSecretHex, 'hex');
  const privateState = createVotechainPrivateState(memberSecret);
  const feedback = await joinContract(
    DEPLOYED_ADDRESSES.feedback, compiledFeedback, 'vcFeedbackState',
    votechainFeedbackConfig.zkConfigPath, votechainFeedbackConfig.privateStateStoreName, privateState,
  );
  log.info({ orgId, periodId }, 'onChain: submitFeedback');
  await feedback.callTx.submit_feedback(orgId, periodId);
  log.info('onChain: submitFeedback done');
}

// ─── Delegation contract (votechain-delegation) ───────────────────────────────

/**
 * Delegate a wallet's voting power to another member for a specific proposal.
 * Must be called during the proposal's commit phase.
 * delegatorSecretHex: delegator's 32-byte secret (hex)
 * delegatePubKey: the delegate's derived voter pubkey (Bytes<32>)
 */
export async function onChainDelegate(
  proposalId: bigint,
  delegatorSecretHex: string,
  delegatePubKey: Uint8Array,
): Promise<void> {
  if (!isMidnightEnabled()) return;
  const delegatorSecret = Buffer.from(delegatorSecretHex, 'hex');
  const privateState = withDelegatorSecretKey(
    createVotechainPrivateState(delegatorSecret),
    delegatorSecret,
  );
  const delegation = await joinContract(
    DEPLOYED_ADDRESSES.delegation, compiledDelegation, 'vcDelegationState',
    votechainDelegationConfig.zkConfigPath, votechainDelegationConfig.privateStateStoreName, privateState,
  );
  log.info({ proposalId }, 'onChain: delegate');
  await delegation.callTx.delegate(delegatePubKey, proposalId);
  log.info({ proposalId }, 'onChain: delegate done');
}

/**
 * Cast a commit-phase vote on behalf of all wallets that delegated to this
 * delegate for the given proposal.
 * delegateSecretHex: delegate's own 32-byte secret (hex)
 * ballot: 0=NO, 1=YES, 2=ABSTAIN
 */
export async function onChainVoteCommitDelegated(
  proposalId: bigint,
  delegateSecretHex: string,
  ballot: 0 | 1 | 2,
): Promise<void> {
  if (!isMidnightEnabled()) return;
  const delegateSecret = Buffer.from(delegateSecretHex, 'hex');
  const privateState: VotechainPrivateState = {
    ...createVotechainPrivateState(delegateSecret),
    voteChoice: ballot,
  };
  const delegation = await joinContract(
    DEPLOYED_ADDRESSES.delegation, compiledDelegation, 'vcDelegationState',
    votechainDelegationConfig.zkConfigPath, votechainDelegationConfig.privateStateStoreName, privateState,
  );
  log.info({ proposalId, ballot }, 'onChain: voteCommitDelegated');
  await delegation.callTx.vote_commit_delegated(proposalId, BigInt(ballot));
  log.info({ proposalId }, 'onChain: voteCommitDelegated done');
}

/**
 * Revoke a previously-registered delegation for a specific proposal.
 */
export async function onChainRevokeDelegation(
  proposalId: bigint,
  delegatorSecretHex: string,
): Promise<void> {
  if (!isMidnightEnabled()) return;
  const delegatorSecret = Buffer.from(delegatorSecretHex, 'hex');
  const privateState = withDelegatorSecretKey(
    createVotechainPrivateState(delegatorSecret),
    delegatorSecret,
  );
  const delegation = await joinContract(
    DEPLOYED_ADDRESSES.delegation, compiledDelegation, 'vcDelegationState',
    votechainDelegationConfig.zkConfigPath, votechainDelegationConfig.privateStateStoreName, privateState,
  );
  log.info({ proposalId }, 'onChain: revokeDelegation');
  await delegation.callTx.revoke_delegation(proposalId);
  log.info({ proposalId }, 'onChain: revokeDelegation done');
}

// ─── Escrow contract (votechain-escrow) ───────────────────────────────────────
//
// The escrow is a single-campaign contract: all ledger maps are keyed at 0 and
// open_escrow can only be called once per deployed instance. Admin circuits
// (open/release/fail/close) take the admin secret as an argument. Contributor
// circuits (refund/mint/verify) are shielded — they require the contributor's
// own secret + a Merkle path witness, so they run against a private-state store
// seeded by the same secret used at deposit time.

/** Escrow lifecycle status as encoded by the contract enum. */
export const EscrowStatus = { open: 0, released: 1, failed: 2, refunding: 3, closed: 4 } as const;

async function joinEscrow(secret: Uint8Array, withAdmin = false) {
  const base = createVotechainPrivateState(secret);
  const privateState = withAdmin ? withAdminSecretKey(base, secret) : base;
  return joinContract(
    DEPLOYED_ADDRESSES.escrow, compiledEscrow, 'vcEscrowState',
    votechainEscrowConfig.zkConfigPath, votechainEscrowConfig.privateStateStoreName, privateState,
  );
}

/** Derive the shielded contributor commitment for a wallet + project (off-chain). */
export function deriveEscrowContributorCommitment(walletAddress: string, project: bigint): Uint8Array {
  const secret = Buffer.from(deriveWalletSecretHex(walletAddress), 'hex');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (VotechainEscrow.pureCircuits as any).derive_contributor_commitment(secret, project) as Uint8Array;
}

export interface OnChainEscrowState {
  initialized: boolean;
  status: number | null;
  raised: bigint;
  goal: bigint;
  refunded: bigint;
}

/** Read the public escrow ledger (aggregate raised/goal/status). Returns null if not deployed/queryable. */
export async function getOnChainEscrowState(): Promise<OnChainEscrowState | null> {
  if (!isMidnightEnabled() || !DEPLOYED_ADDRESSES.escrow) return null;
  const cfg = getNetworkConfig();
  const pdp = indexerPublicDataProvider(cfg.indexer, cfg.indexerWS);
  const state = await pdp.queryContractState(DEPLOYED_ADDRESSES.escrow as ContractAddress);
  if (!state) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ls: any = (VotechainEscrow as any).ledger(state.data);
  const k = 0n;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const read = (m: any, d: bigint | boolean) => (m && m.member(k) ? m.lookup(k) : d);
  return {
    initialized: Boolean(read(ls.initialized, false)),
    status: ls.status && ls.status.member(k) ? Number(ls.status.lookup(k)) : null,
    raised: BigInt(read(ls.raisedTotal, 0n)),
    goal: BigInt(read(ls.goal, 0n)),
    refunded: BigInt(read(ls.refundedTotal, 0n)),
  };
}

/**
 * Open (initialize) the escrow campaign. One-time per deployed instance; callers
 * should check {@link getOnChainEscrowState}().initialized first.
 */
export async function onChainOpenEscrow(
  fundingGoal: bigint,
  deadline: bigint,
  project: bigint,
  treasuryKey?: Uint8Array,
): Promise<void> {
  if (!isMidnightEnabled()) return;
  const adminSecret = getAdminSecret();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminPubKey = (VotechainDao.pureCircuits as any).derive_voter_pubkey(adminSecret) as Uint8Array;
  const escrow = await joinEscrow(adminSecret, true);
  log.info({ project: project.toString(), fundingGoal: fundingGoal.toString() }, 'onChain: openEscrow');
  await escrow.callTx.open_escrow(fundingGoal, deadline, treasuryKey ?? adminPubKey, adminPubKey, project);
  log.info('onChain: openEscrow done');
}

/** Record a contribution leaf on-chain (server-driven deposit accounting). */
export async function onChainEscrowDeposit(
  amount: bigint,
  contributorCommitment: Uint8Array,
  contributorSecretHex: string,
): Promise<void> {
  if (!isMidnightEnabled()) return;
  const secret = Buffer.from(contributorSecretHex, 'hex');
  const escrow = await joinEscrow(secret);
  log.info({ amount: amount.toString() }, 'onChain: escrowDeposit');
  await escrow.callTx.deposit(amount, contributorCommitment);
  log.info('onChain: escrowDeposit done');
}

/** Admin: release raised funds to the treasury (requires goal met). */
export async function onChainEscrowRelease(): Promise<void> {
  if (!isMidnightEnabled()) return;
  const adminSecret = getAdminSecret();
  const escrow = await joinEscrow(adminSecret, true);
  log.info('onChain: escrowRelease');
  await escrow.callTx.release(adminSecret);
  log.info('onChain: escrowRelease done');
}

/** Permissionless: mark the campaign failed once the deadline has passed with the goal unmet. */
export async function onChainEscrowFail(): Promise<void> {
  if (!isMidnightEnabled()) return;
  const adminSecret = getAdminSecret();
  const escrow = await joinEscrow(adminSecret, true);
  log.info('onChain: escrowFail');
  await escrow.callTx.fail_escrow();
  log.info('onChain: escrowFail done');
}

/**
 * Contributor refund (shielded). Requires the campaign to be failed/refunding
 * and the contributor's contribution leaf to exist in the private-state store
 * seeded with the same secret used at deposit.
 */
export async function onChainEscrowRefund(amount: bigint, contributorSecretHex: string): Promise<void> {
  if (!isMidnightEnabled()) return;
  const secret = Buffer.from(contributorSecretHex, 'hex');
  const escrow = await joinEscrow(secret);
  log.info({ amount: amount.toString() }, 'onChain: escrowRefund');
  await escrow.callTx.refund(amount);
  log.info('onChain: escrowRefund done');
}

/**
 * Contributor membership credential mint (shielded). Requires the campaign to be
 * released and the contributor's contribution leaf to exist in the private state.
 * Returns the credential commitment (hex).
 */
export async function onChainEscrowMintMembership(
  amount: bigint,
  contributorSecretHex: string,
): Promise<string> {
  if (!isMidnightEnabled()) throw new Error('Midnight not enabled');
  const secret = Buffer.from(contributorSecretHex, 'hex');
  const escrow = await joinEscrow(secret);
  log.info({ amount: amount.toString() }, 'onChain: escrowMintMembership');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await escrow.callTx.mint_membership_credential(amount);
  const credential: Uint8Array | undefined = result?.private?.result ?? result?.result;
  log.info('onChain: escrowMintMembership done');
  return credential ? Buffer.from(credential).toString('hex') : `cred-${Date.now()}`;
}
