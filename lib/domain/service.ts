import 'server-only';
import { AgilityClient, AgilityError } from '../agility/client';
import { verifyRequirements } from '../membership/verify';
import type { RequirementResult } from '../membership/types';
import { orgRepository, OrgNotFoundError, type OrgRepository } from './repository';
import type {
  AddMemberInput,
  CreateOrganizationInput,
  JoinOrganizationInput,
  MemberRole,
  MembershipSettings,
  Organization,
} from './types';

/** Thrown when a wallet may not join (invite-only) or fails requirements. */
export class MembershipDeniedError extends Error {
  constructor(
    message: string,
    public readonly results?: RequirementResult[]
  ) {
    super(message);
    this.name = 'MembershipDeniedError';
  }
}

/**
 * Organization service: orchestrates the VoteChain domain store and AgilityCore.
 *
 * Creating an organization also provisions a backing AgilityCore DAO so that
 * later phases (proposals, voting, treasury) have a chain-side entity to target.
 * DAO provisioning failures are non-fatal in Phase 1 — the org is still created
 * locally and the DAO can be linked later.
 */
export class OrgService {
  constructor(
    private readonly repo: OrgRepository = orgRepository,
    private readonly agility: AgilityClient = new AgilityClient()
  ) {}

  listOrganizations(): Promise<Organization[]> {
    return this.repo.listOrganizations();
  }

  getOrganization(id: string): Promise<Organization | null> {
    return this.repo.getOrganization(id);
  }

  async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    const org = await this.repo.createOrganization(input);

    // Best-effort: provision a backing AgilityCore DAO.
    try {
      const res = await this.agility.createDao({
        name: input.name,
        description: input.description,
        chain: input.chain,
      });
      const daoId = res.data?.id;
      if (daoId) {
        return this.repo.setDaoId(org.id, daoId);
      }
    } catch (err) {
      // Surface the reason in logs but don't fail org creation.
      const reason = err instanceof AgilityError ? `${err.status} ${err.message}` : String(err);
      console.warn(`[OrgService] DAO provisioning deferred for "${org.id}": ${reason}`);
    }

    return org;
  }

  updateSettings(orgId: string, membership: MembershipSettings): Promise<Organization> {
    return this.repo.updateSettings(orgId, membership);
  }

  /**
   * Self-service join. Enforces the org's join policy:
   * - `invite`: rejected (admins must add members).
   * - `open`: anyone may join.
   * - `gated`: all on-chain/proof requirements must be satisfied.
   */
  async joinOrganization(orgId: string, input: JoinOrganizationInput): Promise<Organization> {
    const org = await this.repo.getOrganization(orgId);
    if (!org) throw new OrgNotFoundError(orgId);

    const policy = org.membership.joinPolicy;
    if (policy === 'invite') {
      throw new MembershipDeniedError('This organization is invite-only.');
    }

    if (policy === 'gated' && org.membership.requirements.length > 0) {
      const outcome = await verifyRequirements(org.membership.requirements, {
        walletAddress: input.walletAddress,
        chain: input.chain,
        proofHash: input.proofHash,
      });
      if (!outcome.satisfied) {
        throw new MembershipDeniedError(
          'You do not meet the membership requirements for this organization.',
          outcome.results
        );
      }
    }

    return this.addMember(orgId, {
      walletAddress: input.walletAddress,
      chain: input.chain,
      displayName: input.displayName,
      role: 'member',
    });
  }

  async addMember(orgId: string, input: AddMemberInput): Promise<Organization> {
    const org = await this.repo.addMember(orgId, input);

    // Best-effort: register the member as a DAO follower in AgilityCore.
    if (org.daoId) {
      try {
        await this.agility.followDao({ daoId: org.daoId, walletAddress: input.walletAddress });
      } catch (err) {
        const reason = err instanceof AgilityError ? `${err.status} ${err.message}` : String(err);
        console.warn(`[OrgService] followDao deferred for "${orgId}": ${reason}`);
      }
    }

    return org;
  }

  async removeMember(orgId: string, walletAddress: string): Promise<Organization> {
    const org = await this.repo.removeMember(orgId, walletAddress);
    if (org.daoId) {
      try {
        await this.agility.unfollowDao({ daoId: org.daoId, walletAddress });
      } catch (err) {
        const reason = err instanceof AgilityError ? `${err.status} ${err.message}` : String(err);
        console.warn(`[OrgService] unfollowDao deferred for "${orgId}": ${reason}`);
      }
    }
    return org;
  }

  updateMemberRole(orgId: string, walletAddress: string, role: MemberRole): Promise<Organization> {
    return this.repo.updateMemberRole(orgId, walletAddress, role);
  }
}

export const orgService = new OrgService();
