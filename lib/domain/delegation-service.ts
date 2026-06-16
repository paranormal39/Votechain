import 'server-only';
import { orgRepository, OrgNotFoundError, type OrgRepository } from './repository';
import {
  delegationRepository,
  DelegationNotFoundError,
  type DelegationRepository,
} from './delegation-repository';
import type { Delegation, DelegateInput, DelegateProfile } from './delegation-types';

export class DelegationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DelegationError';
  }
}

export class DelegationService {
  constructor(
    private readonly delegations: DelegationRepository = delegationRepository,
    private readonly orgs: OrgRepository = orgRepository
  ) {}

  async delegate(orgId: string, input: DelegateInput): Promise<Delegation> {
    const org = await this.orgs.getOrganization(orgId);
    if (!org) throw new OrgNotFoundError(orgId);

    const delegatorMember = org.members.find((m) => m.walletAddress === input.delegatorAddress);
    if (!delegatorMember) {
      throw new DelegationError(`${input.delegatorAddress} is not a member of this organization`);
    }

    const delegateMember = org.members.find((m) => m.walletAddress === input.delegateAddress);
    if (!delegateMember) {
      throw new DelegationError(`${input.delegateAddress} is not a member of this organization`);
    }

    return this.delegations.create(orgId, input);
  }

  async revoke(orgId: string, delegatorAddress: string): Promise<Delegation> {
    const org = await this.orgs.getOrganization(orgId);
    if (!org) throw new OrgNotFoundError(orgId);
    return this.delegations.revoke(orgId, delegatorAddress);
  }

  async getActiveDelegation(orgId: string, delegatorAddress: string): Promise<Delegation | null> {
    return this.delegations.getActiveDelegationFrom(orgId, delegatorAddress);
  }

  async listDelegations(orgId: string): Promise<Delegation[]> {
    return this.delegations.listByOrg(orgId);
  }

  /** Get delegation profile for a delegate: their weight + all delegations to them. */
  async getDelegateProfile(orgId: string, delegateAddress: string): Promise<DelegateProfile> {
    const [activeDelegations, allHistory] = await Promise.all([
      this.delegations.listActiveDelegationsTo(orgId, delegateAddress),
      this.delegations.listByOrg(orgId).then((all) =>
        all.filter((d) => d.delegateAddress === delegateAddress)
      ),
    ]);

    return {
      walletAddress: delegateAddress,
      activeDelegations,
      voteWeight: 1 + activeDelegations.length,
      history: allHistory,
    };
  }

  /**
   * Resolve the effective vote weight for a wallet casting a vote in an org.
   * Weight = 1 (own vote) + number of active delegations pointing to this wallet.
   */
  async resolveVoteWeight(orgId: string, walletAddress: string): Promise<number> {
    const delegationsToMe = await this.delegations.listActiveDelegationsTo(orgId, walletAddress);
    return 1 + delegationsToMe.length;
  }
}

export { DelegationNotFoundError };
export const delegationService = new DelegationService();
