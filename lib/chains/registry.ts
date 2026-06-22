import 'server-only';
import type { ChainName } from '../agility/types';
import type { ChainAdapter } from './types';
import { XrplAdapter } from './xrpl-adapter';
import { MidnightAdapter } from './midnight-adapter';

/** Resolve the chain adapter for a project's chain. */
export function getChainAdapter(chain: ChainName): ChainAdapter {
  switch (chain) {
    case 'xrpl':
    case 'xahau':
      return new XrplAdapter(chain);
    case 'midnight':
      return new MidnightAdapter();
    case 'cardano':
      // Cardano adapter ships in Phase C.
      throw new Error('Cardano launchpad adapter is not implemented yet (Phase C)');
    default:
      throw new Error(`No chain adapter for "${chain as string}"`);
  }
}

/** Chains that currently support the launchpad funding flow. */
export const LAUNCHPAD_CHAINS: ChainName[] = ['xrpl', 'xahau', 'midnight'];

export function isLaunchpadChain(chain: ChainName): boolean {
  return LAUNCHPAD_CHAINS.includes(chain);
}
