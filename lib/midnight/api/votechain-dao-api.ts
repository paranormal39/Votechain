import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js/utils';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { type Logger } from 'pino';
import { randomBytes } from 'crypto';

import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ImpureCircuitId } from '@midnight-ntwrk/compact-js';

import { type WalletContext, createWalletAndMidnightProvider } from './api.js';
import { type Config, votechainDaoConfig } from './config.js';

// ─── Contract imports (compiled artifacts) ───────────────────────────────────
import {
  VotechainDao,
  type VotechainPrivateState,
  type MerkleTreePath,
  votechainWitnesses,
  createVotechainPrivateState,
  withVoterAuthPath,
  withAdminSecretKey,
} from '@midnight-ntwrk/dao-contract';

// ─── Types ────────────────────────────────────────────────────────────────────

type VotechainDaoCircuits = ImpureCircuitId<VotechainDao.Contract<VotechainPrivateState>>;
const VotechainDaoPrivateStateId = 'votechainDaoPrivateState' as const;
type VotechainDaoProviders = MidnightProviders<
  VotechainDaoCircuits,
  typeof VotechainDaoPrivateStateId,
  VotechainPrivateState
>;
type DeployedVotechainDaoContract =
  | DeployedContract<VotechainDao.Contract<VotechainPrivateState>>
  | FoundContract<VotechainDao.Contract<VotechainPrivateState>>;

export interface VotechainDaoLedgerState {
  initialized: boolean;
  round: bigint;
  proposalCount: bigint;
  adminNonce: bigint;
  currentBlockHeight: bigint;
  adminPubKeys: Map<bigint, Uint8Array>;
}

let logger: Logger;

// ─── Compiled contract definition ─────────────────────────────────────────────

const compiledDaoContract = CompiledContract.make('votechain-dao', VotechainDao.Contract).pipe(
  CompiledContract.withWitnesses(votechainWitnesses as any),
  CompiledContract.withCompiledFileAssets(votechainDaoConfig.zkConfigPath),
);

// ─── Cryptographic helpers ─────────────────────────────────────────────────────

export function generateAdminSecret(): Uint8Array {
  return randomBytes(32);
}

export function deriveAdminPubKey(adminSecret: Uint8Array): Uint8Array {
  return VotechainDao.pureCircuits.derive_voter_pubkey(adminSecret);
}

export function deriveVoterPubKey(voterSecret: Uint8Array): Uint8Array {
  return VotechainDao.pureCircuits.derive_voter_pubkey(voterSecret);
}

// ─── Provider setup ───────────────────────────────────────────────────────────

export async function configureVotechainDaoProviders(
  walletContext: WalletContext,
  config: Config,
  log: Logger,
): Promise<VotechainDaoProviders> {
  logger = log;
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(walletContext);

  const accountId = walletAndMidnightProvider.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, 'hex').toString('base64')}!`;

  const zkConfigProvider = new NodeZkConfigProvider(votechainDaoConfig.zkConfigPath);

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: votechainDaoConfig.privateStateStoreName,
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
}

// ─── Deploy ───────────────────────────────────────────────────────────────────

export async function deployVotechainDao(
  providers: VotechainDaoProviders,
  adminSecret: Uint8Array,
  log: Logger,
): Promise<DeployedVotechainDaoContract> {
  logger = log;

  const adminPubKey = deriveAdminPubKey(adminSecret);
  const privateState = createVotechainPrivateState(adminSecret);

  logger.info('Deploying VoteChain DAO contract (Contract 1) to preview...');
  logger.info(`Admin pubkey: ${Buffer.from(adminPubKey).toString('hex').slice(0, 16)}...`);

  const deployed = await deployContract(providers, {
    compiledContract: compiledDaoContract,
    privateStateId: VotechainDaoPrivateStateId,
    initialPrivateState: privateState,
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  logger.info(`Contract deployed at: ${contractAddress}`);

  // Call initialize_dao — passes same pubkey for all 3 slots (single-admin org).
  // Multi-admin: pass 3 distinct derived pubkeys.
  logger.info('Calling initialize_dao...');
  await deployed.callTx.initialize_dao(adminPubKey, adminPubKey, adminPubKey);
  logger.info('DAO initialized successfully');

  return deployed;
}

// ─── Join existing ────────────────────────────────────────────────────────────

export async function joinVotechainDao(
  providers: VotechainDaoProviders,
  contractAddress: string,
  adminSecret: Uint8Array,
  log: Logger,
): Promise<DeployedVotechainDaoContract> {
  logger = log;
  assertIsContractAddress(contractAddress);

  const privateState = createVotechainPrivateState(adminSecret);

  logger.info(`Joining VoteChain DAO at ${contractAddress}...`);
  const found = await findDeployedContract(providers, {
    compiledContract: compiledDaoContract,
    privateStateId: VotechainDaoPrivateStateId,
    contractAddress: contractAddress as ContractAddress,
    initialPrivateState: privateState,
  });

  logger.info('Joined successfully');
  return found;
}

// ─── Admin: add eligible voter ────────────────────────────────────────────────

export async function addEligibleVoter(
  deployed: DeployedVotechainDaoContract,
  voterPubKey: Uint8Array,
  adminSecret: Uint8Array,
  log: Logger,
): Promise<void> {
  logger = log;
  logger.info(`Adding voter: ${Buffer.from(voterPubKey).toString('hex').slice(0, 16)}...`);
  await deployed.callTx.add_eligible_voter(voterPubKey, adminSecret);
  logger.info('Voter added');
}

// ─── Admin: update block height ───────────────────────────────────────────────

export async function updateBlockHeight(
  deployed: DeployedVotechainDaoContract,
  newHeight: bigint,
  adminSecret: Uint8Array,
  log: Logger,
): Promise<void> {
  logger = log;
  logger.info(`Updating block height to ${newHeight}...`);
  await deployed.callTx.update_block_height(newHeight, adminSecret);
  logger.info('Block height updated');
}

// ─── Ledger state query ───────────────────────────────────────────────────────

export async function getVotechainDaoLedgerState(
  providers: VotechainDaoProviders,
  contractAddress: string,
  log: Logger,
): Promise<VotechainDaoLedgerState | null> {
  logger = log;
  assertIsContractAddress(contractAddress);

  const contractState = await providers.publicDataProvider.queryContractState(
    contractAddress as ContractAddress,
  );
  if (!contractState) return null;

  const ls = VotechainDao.ledger(contractState.data);

  const adminPubKeys = new Map<bigint, Uint8Array>();
  for (const [k, v] of ls.adminPubKeys) adminPubKeys.set(k, v);

  const initialized = ls.daoInitialized.member(0n) && ls.daoInitialized.lookup(0n);
  const currentBlockHeight = ls.currentBlockHeight.member(0n)
    ? ls.currentBlockHeight.lookup(0n)
    : 0n;

  return {
    initialized,
    round: ls.round,
    proposalCount: ls.proposalCount,
    adminNonce: ls.adminNonce,
    currentBlockHeight,
    adminPubKeys,
  };
}

// ─── Voter auth path query ────────────────────────────────────────────────────

export async function getVoterAuthPath(
  providers: VotechainDaoProviders,
  contractAddress: string,
  voterPubKey: Uint8Array,
  log: Logger,
): Promise<MerkleTreePath | null> {
  logger = log;
  assertIsContractAddress(contractAddress);

  const contractState = await providers.publicDataProvider.queryContractState(
    contractAddress as ContractAddress,
  );
  if (!contractState) return null;

  const ls = VotechainDao.ledger(contractState.data);
  const runtimePath = ls.eligibleVoters.findPathForLeaf(voterPubKey) as any;
  if (!runtimePath) return null;

  if (runtimePath.path?.[0] && 'dir' in runtimePath.path[0]) {
    return {
      leaf: runtimePath.leaf,
      path: runtimePath.path.map((e: any) => ({
        sibling: e.sibling,
        goes_left: e.dir === 1,
      })),
    };
  }
  return runtimePath;
}
