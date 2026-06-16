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
import {
  VotechainDao,
  VotechainVoting,
  VotechainTreasury,
  VotechainFeedback,
  votechainWitnesses,
  createVotechainPrivateState,
  withAdminSecretKey,
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
/* eslint-enable @typescript-eslint/no-explicit-any */

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
