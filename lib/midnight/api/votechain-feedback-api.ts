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
import { type Config, votechainFeedbackConfig } from './config.js';
import { VotechainFeedback, votechainWitnesses, type VotechainPrivateState } from '@midnight-ntwrk/dao-contract';

const compiledContract = CompiledContract.make('votechain-feedback', VotechainFeedback.Contract).pipe(
  CompiledContract.withWitnesses(votechainWitnesses as any),
  CompiledContract.withCompiledFileAssets(votechainFeedbackConfig.zkConfigPath),
);

const PrivateStateId = 'votechainFeedbackPrivateState' as const;

let logger: Logger;

export const configureFeedbackProviders = async (ctx: WalletContext, config: Config, log: Logger) => {
  logger = log;
  const w = await createWalletAndMidnightProvider(ctx);
  const accountId = w.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, 'hex').toString('base64')}!`;
  const zkConfigProvider = new NodeZkConfigProvider(votechainFeedbackConfig.zkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: votechainFeedbackConfig.privateStateStoreName,
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

export const deployFeedbackContract = async (
  providers: Awaited<ReturnType<typeof configureFeedbackProviders>>,
  initialPrivateState: VotechainPrivateState,
  log: Logger,
) => {
  logger = log;
  logger.info('Deploying VoteChain Feedback contract...');
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: PrivateStateId,
    initialPrivateState,
  });
  logger.info(`Feedback contract deployed at: ${deployed.deployTxData.public.contractAddress}`);
  return deployed;
};

export const joinFeedbackContract = async (
  providers: Awaited<ReturnType<typeof configureFeedbackProviders>>,
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
