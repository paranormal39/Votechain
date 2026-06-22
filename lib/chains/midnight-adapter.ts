import 'server-only';
import type { ChainName } from '../agility/types';
import { DEPLOYED_ADDRESSES, isEscrowContractDeployed } from '../midnight/config';
import { isMidnightEnabled } from '../midnight/provider';
import {
  toFieldId,
  deriveWalletSecretHex,
  getOnChainEscrowState,
  onChainOpenEscrow,
  onChainEscrowRelease,
  onChainEscrowRefund,
} from '../midnight/client';
import {
  AdapterUnsupportedError,
  type ChainAdapter,
  type ContributionScan,
  type CreateEscrowInput,
  type EscrowRef,
  type MintMembershipInput,
  type MintResult,
  type SignerAuth,
  type TxReceipt,
  type VerifyHoldingInput,
} from './types';

/** Escrow amounts are denominated in micro-NIGHT (6 dp) on-chain. */
const MICRO = 1_000_000n;

function toMicro(decimal: string): bigint {
  const [whole, frac = ''] = decimal.split('.');
  const fracPadded = (frac + '000000').slice(0, 6);
  return BigInt(whole || '0') * MICRO + BigInt(fracPadded || '0');
}

function fromMicro(micro: bigint): string {
  const whole = micro / MICRO;
  const frac = micro % MICRO;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
}

/**
 * Midnight adapter — funds NIGHT into a Compact escrow contract.
 *
 * The escrow contract (deposit / release / refund / mint_membership_credential)
 * is authored and deployed in the launchpad pivot. Until its address is
 * configured (`MIDNIGHT_ESCROW_ADDRESS`), contract-dependent operations throw
 * {@link AdapterUnsupportedError}; the launchpad service treats Midnight
 * escrow writes as best-effort, mirroring the existing on-chain call pattern.
 *
 * Privacy note: individual contributions are shielded. The escrow contract
 * exposes only the aggregate raised total publicly; per-contributor scanning is
 * intentionally unavailable. The contribute API records intents client-side.
 *
 * Signing for the escrow contract uses the server WalletFacade
 * (`MIDNIGHT_WALLET_SEED`), so `SignerAuth.secret` is not required and is
 * accepted only for interface symmetry.
 */
export class MidnightAdapter implements ChainAdapter {
  readonly chain: ChainName = 'midnight';

  private get serverSigner(): SignerAuth {
    // Midnight writes are authorised by the server wallet seed via the
    // WalletFacade, not a per-project secret.
    return { secret: 'server-wallet' };
  }

  private assertContract(feature: string): void {
    if (!isMidnightEnabled() || !isEscrowContractDeployed()) {
      throw new AdapterUnsupportedError(this.chain, feature);
    }
  }

  async createEscrow(input: CreateEscrowInput): Promise<{ ref: EscrowRef; auth: SignerAuth }> {
    // The deployed escrow is a single-campaign contract: its ledger is keyed at
    // 0 and open_escrow can be called only once. The ref points at the deployed
    // address; the project id is carried in meta and bound on-chain at open.
    const ref: EscrowRef = {
      chain: this.chain,
      address: DEPLOYED_ADDRESSES.escrow,
      meta: {
        projectId: input.projectId,
        currency: input.currency,
        goal: input.goalAmount,
        deadline: String(input.deadline),
      },
    };

    // Best-effort: open (initialize) the campaign on-chain if it has not been
    // opened yet. The contract deadline is a block height; we pass the unix
    // deadline as a large monotonic ceiling (the admin block-height oracle
    // starts at 0), keeping the campaign open for the funding window.
    if (isMidnightEnabled() && isEscrowContractDeployed()) {
      try {
        const state = await getOnChainEscrowState();
        if (!state?.initialized) {
          await onChainOpenEscrow(
            toMicro(input.goalAmount),
            BigInt(input.deadline),
            toFieldId(input.projectId)
          );
        }
      } catch (err) {
        console.warn(`[MidnightAdapter] openEscrow deferred for "${input.projectId}": ${String(err)}`);
      }
    }

    return { ref, auth: this.serverSigner };
  }

  async getEscrowBalance(ref: EscrowRef): Promise<string> {
    // Aggregate raised total is public on the escrow contract.
    if (!isMidnightEnabled() || !isEscrowContractDeployed()) return '0';
    void ref;
    try {
      const state = await getOnChainEscrowState();
      return state ? fromMicro(state.raised) : '0';
    } catch (err) {
      console.warn(`[MidnightAdapter] getEscrowBalance failed: ${String(err)}`);
      return '0';
    }
  }

  async scanContributions(ref: EscrowRef, sinceMarker?: string): Promise<ContributionScan> {
    // Shielded contributions are not individually scannable by design.
    void ref;
    return { contributions: [], marker: sinceMarker };
  }

  async releaseEscrow(ref: EscrowRef, destination: string, _auth: SignerAuth): Promise<TxReceipt> {
    this.assertContract('escrow release');
    void destination;
    // Admin-gated release. The contract authorises the transfer (raised >= goal);
    // the server wallet performs the matching coin transfer to the treasury.
    await onChainEscrowRelease();
    return { txHash: `midnight-release-${ref.meta?.projectId ?? ''}-${Date.now()}`, accepted: true };
  }

  async refundContributor(
    ref: EscrowRef,
    contributor: string,
    amount: string,
    _auth: SignerAuth
  ): Promise<TxReceipt> {
    this.assertContract('escrow refund');
    // Shielded contributor-pull refund. The contributor secret is derived from
    // their wallet address (matching the server-driven deposit accounting).
    await onChainEscrowRefund(toMicro(amount), deriveWalletSecretHex(contributor));
    return { txHash: `midnight-refund-${contributor}-${Date.now()}`, accepted: true };
  }

  async mintMembership(input: MintMembershipInput, _auth: SignerAuth): Promise<MintResult> {
    this.assertContract('credential mint');
    void input;
    // Membership credentials are shielded and bound to the contributor's
    // client-held secret + their exact contribution amount, so the mint proof
    // must be produced client-side (the server cannot mint on their behalf).
    // The Discord bot's /link flow verifies the resulting credential.
    throw new AdapterUnsupportedError(this.chain, 'server-side credential mint (shielded; client-side proof)');
  }

  async verifyHolding(input: VerifyHoldingInput): Promise<boolean> {
    // Shielded credential holdings cannot be verified server-side. The Discord
    // bot verifies a client-generated ZK proof of holding instead; this method
    // is not the verification path for Midnight credentials.
    void input;
    throw new AdapterUnsupportedError(this.chain, 'server-side credential verification');
  }
}
