import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js/utils';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { type Logger } from 'pino';

import { type WalletContext, createWalletAndMidnightProvider } from './api.js';
import { type Config, votechainTreasuryConfig } from './config.js';
import { VotechainTreasury, votechainWitnesses, type VotechainPrivateState } from '@midnight-ntwrk/dao-contract';

const compiledContract = CompiledContract.make('votechain-treasury', VotechainTreasury.Contract).pipe(
  CompiledContract.withWitnesses(votechainWitnesses as any),
  CompiledContract.withCompiledFileAssets(votechainTreasuryConfig.zkConfigPath),
);

const PrivateStateId = 'votechainTreasuryPrivateState' as const;

let logger: Logger;

export const configureTreasuryProviders = async (ctx: WalletContext, config: Config, log: Logger) => {
  logger = log;
  const w = await createWalletAndMidnightProvider(ctx);
  const accountId = w.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, 'hex').toString('base64')}!`;
  const zkConfigProvider = new NodeZkConfigProvider(votechainTreasuryConfig.zkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: votechainTreasuryConfig.privateStateStoreName,
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: w,
    midnightProvider: w,
  };
};

export const deployTreasuryContract = async (
  providers: Awaited<ReturnType<typeof configureTreasuryProviders>>,
  initialPrivateState: VotechainPrivateState,
  log: Logger,
) => {
  logger = log;
  logger.info('Deploying VoteChain Treasury contract...');
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: PrivateStateId,
    initialPrivateState,
  });
  logger.info(`Treasury contract deployed at: ${deployed.deployTxData.public.contractAddress}`);
  return deployed;
};

export const joinTreasuryContract = async (
  providers: Awaited<ReturnType<typeof configureTreasuryProviders>>,
  contractAddress: string,
  initialPrivateState: VotechainPrivateState,
  log: Logger,
) => {
  logger = log;
  assertIsContractAddress(contractAddress);
  return findDeployedContract(providers, {
    compiledContract,
    privateStateId: PrivateStateId,
    contractAddress: contractAddress as ContractAddress,
    initialPrivateState,
  });
};
