import type { ChainName } from './agility/types';

/**
 * Registry of deployed contracts used for integration testing.
 *
 * These are real testnet deployments (Cardano pre-prod, Midnight preview).
 * Centralized here so the connection harness and future app code reference
 * the same addresses instead of hard-coding them.
 */

export interface DeployedContract {
  /** Human-readable contract name. */
  name: string;
  /** Chain the contract is deployed on. */
  chain: ChainName;
  /** Network / environment. */
  network: string;
  /** On-chain address, where applicable. */
  address?: string;
  /** Deployment transaction hash, where applicable. */
  txHash?: string;
  /** Contract/script kind or version. */
  kind?: string;
  /** Optional notes. */
  notes?: string;
}

export const CARDANO_COUNTER_CONTRACT: DeployedContract = {
  name: 'Counter',
  chain: 'cardano',
  network: 'preprod',
  kind: 'PlutusV3',
  txHash: '484b2f6a612c8d2a94cf122dde4d4f194bb5310f068103b5423bc877332c2186',
  notes: 'Confirmed deployment tx on Cardano pre-prod.',
};

export const CARDANO_DAO_CONTRACT: DeployedContract = {
  name: 'DAO',
  chain: 'cardano',
  network: 'preprod',
  kind: 'PlutusV3',
  address: 'addr_test1wzgxsphtczfamr2cljp80e48544vwp3p4u9n68702t6psgcnkt88j',
  notes: 'DAO governance script address on Cardano pre-prod.',
};

export const MIDNIGHT_PROPOSAL_CONTRACT: DeployedContract = {
  name: 'Proposal',
  chain: 'midnight',
  network: 'preview',
  kind: 'Compact',
  address: '34f5d259563384c26baa3c9483458e0fa4d73bc2520b67950bfd833b5da9308b',
  notes: 'Midnight Proposal contract deployed on preview.',
};

export const DEPLOYED_CONTRACTS: DeployedContract[] = [
  CARDANO_COUNTER_CONTRACT,
  CARDANO_DAO_CONTRACT,
  MIDNIGHT_PROPOSAL_CONTRACT,
];

export function contractsForChain(chain: ChainName): DeployedContract[] {
  return DEPLOYED_CONTRACTS.filter((c) => c.chain === chain);
}

export function findContract(name: string, chain?: ChainName): DeployedContract | undefined {
  return DEPLOYED_CONTRACTS.find(
    (c) => c.name.toLowerCase() === name.toLowerCase() && (!chain || c.chain === chain)
  );
}
