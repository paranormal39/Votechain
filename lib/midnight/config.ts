import 'server-only';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Root of the copied contract artifacts (contract/dist/managed/)
const managedDir = path.resolve(__dirname, '..', '..', 'contract', 'dist', 'managed');

export const votechainDaoConfig = {
  privateStateStoreName: 'vc-dao-private-state',
  zkConfigPath: path.join(managedDir, 'votechain-dao'),
};

export const votechainVotingConfig = {
  privateStateStoreName: 'vc-voting-private-state',
  zkConfigPath: path.join(managedDir, 'votechain-voting'),
};

export const votechainDelegationConfig = {
  privateStateStoreName: 'vc-delegation-private-state',
  zkConfigPath: path.join(managedDir, 'votechain-delegation'),
};

export const votechainTreasuryConfig = {
  privateStateStoreName: 'vc-treasury-private-state',
  zkConfigPath: path.join(managedDir, 'votechain-treasury'),
};

export const votechainFeedbackConfig = {
  privateStateStoreName: 'vc-feedback-private-state',
  zkConfigPath: path.join(managedDir, 'votechain-feedback'),
};

// Launchpad escrow contract (authored in the launchpad pivot; compiled into
// contract/dist/managed/votechain-escrow once deployed to Preview).
export const votechainEscrowConfig = {
  privateStateStoreName: 'vc-escrow-private-state',
  zkConfigPath: path.join(managedDir, 'votechain-escrow'),
};

export interface MidnightNetworkConfig {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

export function getNetworkConfig(): MidnightNetworkConfig {
  setNetworkId('preview');
  return {
    indexer: 'https://indexer.preview.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    proofServer: process.env.MIDNIGHT_PROOF_SERVER_URL ?? 'http://172.22.96.1:6300',
  };
}

// Deployed contract addresses on Midnight Preview
export const DEPLOYED_ADDRESSES = {
  dao: process.env.MIDNIGHT_DAO_ADDRESS ??
    'd4e3299040a14895c5a2f735b41dc57cd7c3127734baaf765bef136f4b84d931',
  voting: process.env.MIDNIGHT_VOTING_ADDRESS ??
    'edb5f277d19da414b8d51a728edda92edfd1f9890b389412ec0abdae071acaf5',
  delegation: process.env.MIDNIGHT_DELEGATION_ADDRESS ??
    '75c21a6676ff1dc542ae654ba36eb1d6c8bb990d508b76374ab49e1291c9d4ca',
  treasury: process.env.MIDNIGHT_TREASURY_ADDRESS ??
    '61719733dd930830d45eb2055012a8e74bdf8f16a49e99a79c4673501f5b59b0',
  feedback: process.env.MIDNIGHT_FEEDBACK_ADDRESS ??
    'b5a939e58fb11b31f5e34baad05f9a40c95ed8ba4292d7fbecfd63680f49948e',
  escrow: process.env.MIDNIGHT_ESCROW_ADDRESS ??
    '51c20bf57bc7c2a0586b7214da27a09a7f84f8ed92426de84f2d94f8346c3145',
} as const;

/** True once a Midnight escrow contract address has been configured. */
export function isEscrowContractDeployed(): boolean {
  return Boolean(DEPLOYED_ADDRESSES.escrow);
}
