import 'server-only';
import { AgilityClient, AgilityError } from '../agility/client';
import {
  onChainCreateProposal,
  onChainCheckProposalResult,
  onChainCreateTreasuryProposal,
  onChainGenerateTreasuryAudit,
  onChainVoteCommit,
  onChainVoteCommitDelegated,
  onChainVoteReveal,
  onChainDelegate,
  deriveWalletSecretHex,
  deriveVoterPubKeyForAddress,
} from '../midnight/client';
import type { VoteChoice } from './proposal-types';
import { orgRepository, OrgNotFoundError, type OrgRepository } from './repository';
import {
  proposalRepository,
  ProposalNotFoundError,
  type ProposalRepository,
} from './proposal-repository';
import { delegationService, type DelegationService } from './delegation-service';
import { treasuryService, type TreasuryService } from './treasury-service';
import { projectRepository } from '../launchpad/project-repository';
import {
  resolveOutcome,
  type AddCommentInput,
  type CastPrivateVoteInput,
  type CastPublicVoteInput,
  type CreateProposalInput,
  type Proposal,
} from './proposal-types';

export class ProposalStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalStateError';
  }
}

/** Map a public vote choice to the on-chain ballot encoding (0=NO, 1=YES, 2=ABSTAIN). */
function ballotFor(choice: Exclude<VoteChoice, 'private'>): 0 | 1 | 2 {
  return choice === 'yes' ? 1 : choice === 'no' ? 0 : 2;
}

/**
 * Proposal service: orchestrates the VoteChain proposal store and AgilityCore.
 *
 * Lifecycle: draft → active → passed/failed.
 * - create: stored locally as `draft`.
 * - activate: opens the voting window and best-effort provisions a backing
 *   AgilityCore proposal (needs the org's daoId) so Phase 3 voting has a target.
 * - finalize: resolves the outcome against the quorum (Phase 3 populates tally).
 * - comment: appended locally and best-effort mirrored to AgilityCore.
 *
 * AgilityCore failures are non-fatal — the VoteChain record remains the source
 * of truth, mirroring the org/DAO pattern from Phase 1.
 */
export class ProposalService {
  constructor(
    private readonly proposals: ProposalRepository = proposalRepository,
    private readonly orgs: OrgRepository = orgRepository,
    private readonly agility: AgilityClient = new AgilityClient(),
    private readonly delegations: DelegationService = delegationService,
    private readonly treasury: TreasuryService = treasuryService
  ) {}

  listByOrg(orgId: string): Promise<Proposal[]> {
    return this.proposals.listByOrg(orgId);
  }

  getProposal(id: string): Promise<Proposal | null> {
    return this.proposals.getProposal(id);
  }

  async createProposal(input: CreateProposalInput): Promise<Proposal> {
    const org = await this.orgs.getOrganization(input.orgId);
    if (!org) throw new OrgNotFoundError(input.orgId);
    return this.proposals.createProposal(input);
  }

  async activateProposal(id: string): Promise<Proposal> {
    const proposal = await this.requireProposal(id);
    if (proposal.status !== 'draft') {
      throw new ProposalStateError(
        `Only draft proposals can be activated (current: ${proposal.status})`
      );
    }

    // Launchpad gate: if the org was created by a launchpad project, governance
    // only opens once that project has reached its funding goal and gone Live.
    // Orgs with no backing project (legacy / direct) are unaffected.
    const backingProject = await projectRepository.getByOrgId(proposal.orgId).catch(() => null);
    if (backingProject && backingProject.status !== 'live') {
      throw new ProposalStateError(
        `Governance is locked until the funding goal is met (project status: ${backingProject.status})`
      );
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + proposal.votingPeriodDays * 24 * 60 * 60 * 1000);

    // Best-effort: provision the backing AgilityCore proposal.
    let agilityProposalId: string | undefined;
    const org = await this.orgs.getOrganization(proposal.orgId);
    if (org?.daoId) {
      try {
        const res = await this.agility.createProposal({
          daoId: org.daoId,
          title: proposal.title,
          description: proposal.description,
          chain: org.chain,
          status: 'active',
        });
        agilityProposalId = res.data?.id;
      } catch (err) {
        this.warn('createProposal', proposal.id, err);
      }
    }

    const updated = await this.proposals.update(id, (p) => ({
      ...p,
      status: 'active',
      activatedAt: now.toISOString(),
      votingEndsAt: endsAt.toISOString(),
      agilityProposalId: agilityProposalId ?? p.agilityProposalId,
    }));

    // Best-effort: create on-chain proposal in the Voting (or Treasury) contract.
    const onChainId = BigInt(Date.now());
    const metaHash = new Uint8Array(32);
    const idBytes = Buffer.from(updated.id);
    metaHash.set(idBytes.subarray(0, Math.min(32, idBytes.length)));
    const commitBlocks = BigInt(proposal.votingPeriodDays * 720); // ~1 block/2min
    const revealBlocks = 50n;
    let onChainCreated = false;
    try {
      if (proposal.type === 'treasury') {
        await onChainCreateTreasuryProposal(
          onChainId, metaHash, new Uint8Array(32), commitBlocks, revealBlocks, proposal.quorum
        );
      } else {
        await onChainCreateProposal(onChainId, metaHash, commitBlocks, revealBlocks, proposal.quorum);
      }
      await this.proposals.update(id, (p) => ({ ...p, onChainProposalId: Number(onChainId) }));
      onChainCreated = true;
    } catch (err) {
      this.warn('onChainCreateProposal', id, err);
    }

    // Best-effort: register the org's standing delegations on-chain for this
    // proposal so delegated voting power resolves during the commit phase.
    if (onChainCreated) {
      try {
        const delegations = (await this.delegations.listDelegations(proposal.orgId)).filter(
          (d) => d.active
        );
        for (const d of delegations) {
          try {
            await onChainDelegate(
              onChainId,
              deriveWalletSecretHex(d.delegatorAddress),
              deriveVoterPubKeyForAddress(d.delegateAddress)
            );
          } catch (err) {
            this.warn('onChainDelegate', `${id}:${d.delegatorAddress}`, err);
          }
        }
      } catch (err) {
        this.warn('onChainDelegate', id, err);
      }
    }

    return updated;
  }

  async finalizeProposal(id: string): Promise<Proposal> {
    const proposal = await this.requireProposal(id);
    if (proposal.status !== 'active') {
      throw new ProposalStateError(
        `Only active proposals can be finalized (current: ${proposal.status})`
      );
    }

    const outcome = resolveOutcome(proposal);
    const finalized = await this.proposals.update(id, (p) => ({
      ...p,
      status: outcome,
      finalizedAt: new Date().toISOString(),
    }));

    // Best-effort: reveal each committed public vote, then finalize on-chain.
    // Private (ZK) votes have no server-side choice and are skipped.
    if (proposal.onChainProposalId != null) {
      const onChainId = BigInt(proposal.onChainProposalId);
      for (const vote of proposal.votes) {
        if (vote.choice === 'private') continue;
        try {
          await onChainVoteReveal(onChainId, deriveWalletSecretHex(vote.walletAddress));
        } catch (err) {
          this.warn('onChainVoteReveal', `${id}:${vote.walletAddress}`, err);
        }
      }
      try {
        await onChainCheckProposalResult(onChainId);
      } catch (err) {
        this.warn('onChainCheckProposalResult', id, err);
      }
    }

    // Best-effort: generate audit receipt for passed treasury proposals.
    if (outcome === 'passed' && proposal.type === 'treasury' && proposal.onChainProposalId != null) {
      try {
        const receipt = await onChainGenerateTreasuryAudit(BigInt(proposal.onChainProposalId));
        await this.proposals.update(id, (p) => ({ ...p, auditReceipt: receipt }));
      } catch (err) {
        this.warn('onChainGenerateTreasuryAudit', id, err);
      }
    }

    // Treasury governance gate: auto-approve linked spend requests when proposal passes.
    if (outcome === 'passed' && proposal.type === 'treasury') {
      try {
        const account = await this.treasury.getOrInit(proposal.orgId);
        for (const sr of account.spendRequests) {
          if (sr.proposalId === id && sr.status === 'pending') {
            await this.treasury.approveSpendRequest(proposal.orgId, sr.id);
          }
        }
      } catch {
        /* non-fatal — treasury may not exist yet */
      }
    }

    return finalized;
  }

  async castVote(id: string, input: CastPublicVoteInput): Promise<Proposal> {
    const proposal = await this.requireProposal(id);
    if (proposal.status !== 'active') {
      throw new ProposalStateError(`Voting is only open on active proposals (current: ${proposal.status})`);
    }
    const alreadyVoted = await this.proposals.hasVoted(id, input.walletAddress);
    if (alreadyVoted) {
      throw new ProposalStateError('You have already voted on this proposal');
    }

    // Resolve delegation weight (own vote + any active delegations to this wallet).
    const weight = await this.delegations
      .resolveVoteWeight(proposal.orgId, input.walletAddress)
      .catch(() => 1);

    let receipt: string | undefined;
    if (proposal.agilityProposalId) {
      try {
        const method =
          input.choice === 'yes'
            ? this.agility.voteYes.bind(this.agility)
            : input.choice === 'no'
              ? this.agility.voteNo.bind(this.agility)
              : this.agility.voteAbstain.bind(this.agility);
        const res = await method({ proposalId: proposal.agilityProposalId, walletAddress: input.walletAddress });
        receipt = res.data?.txHash;
      } catch (err) {
        this.warn('castVote', id, err);
      }
    }

    // Best-effort: commit the vote on-chain in the Voting contract. When the
    // voter carries delegated weight, route through the Delegation contract's
    // vote_commit_delegated circuit so delegators' power is bundled in.
    if (proposal.onChainProposalId != null) {
      const onChainId = BigInt(proposal.onChainProposalId);
      const ballot = ballotFor(input.choice);
      const voterSecret = deriveWalletSecretHex(input.walletAddress);
      try {
        if (weight > 1) {
          await onChainVoteCommitDelegated(onChainId, voterSecret, ballot);
        } else {
          await onChainVoteCommit(onChainId, voterSecret, ballot);
        }
      } catch (err) {
        this.warn('onChainVoteCommit', id, err);
      }
    }

    return this.proposals.addVote(id, input, receipt, weight);
  }

  async castPrivateVote(id: string, input: CastPrivateVoteInput): Promise<Proposal> {
    const proposal = await this.requireProposal(id);
    if (proposal.status !== 'active') {
      throw new ProposalStateError(`Voting is only open on active proposals (current: ${proposal.status})`);
    }
    const alreadyVoted = await this.proposals.hasVoted(id, input.walletAddress);
    if (alreadyVoted) {
      throw new ProposalStateError('You have already voted on this proposal');
    }

    const weight = await this.delegations
      .resolveVoteWeight(proposal.orgId, input.walletAddress)
      .catch(() => 1);

    let receipt: string | undefined;
    if (proposal.agilityProposalId) {
      try {
        const res = await this.agility.votePrivate({
          proposalId: proposal.agilityProposalId,
          walletAddress: input.walletAddress,
          proofHash: input.proofHash,
        });
        receipt = res.data?.txHash;
      } catch (err) {
        this.warn('castPrivateVote', id, err);
      }
    }

    return this.proposals.addPrivateVote(id, input, receipt, weight);
  }

  async comment(id: string, input: AddCommentInput): Promise<Proposal> {
    const proposal = await this.requireProposal(id);

    let agilityCommentId: string | undefined;
    if (proposal.agilityProposalId) {
      try {
        const res = await this.agility.commentProposal({
          proposalId: proposal.agilityProposalId,
          walletAddress: input.author,
          comment: input.body,
        });
        agilityCommentId = res.data?.id;
      } catch (err) {
        this.warn('commentProposal', proposal.id, err);
      }
    }

    return this.proposals.addComment(id, input, agilityCommentId);
  }

  private async requireProposal(id: string): Promise<Proposal> {
    const proposal = await this.proposals.getProposal(id);
    if (!proposal) throw new ProposalNotFoundError(id);
    return proposal;
  }

  private warn(op: string, id: string, err: unknown): void {
    const reason = err instanceof AgilityError ? `${err.status} ${err.message}` : String(err);
    console.warn(`[ProposalService] ${op} deferred for "${id}": ${reason}`);
  }
}

export const proposalService = new ProposalService();
