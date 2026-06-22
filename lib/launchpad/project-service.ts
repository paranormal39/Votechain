import 'server-only';
import { getChainAdapter, type SignerAuth } from '../chains';
import { orgService, type OrgService } from '../domain/service';
import { treasuryService } from '../domain/treasury-service';
import { encryptSecret, decryptSecret } from './crypto';
import {
  projectRepository,
  ProjectNotFoundError,
  type ProjectRepository,
} from './project-repository';
import {
  contributionRepository,
  type ContributionRepository,
} from './contribution-repository';
import { mintMembershipToContributors } from './membership-mint';
import {
  isExpired,
  isGoalMet,
  MIN_MEMBERSHIP_CONTRIBUTION,
  type CreateProjectInput,
  type Project,
} from './project-types';
import type { Contribution } from './contribution-types';

export class ProjectStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectStateError';
  }
}

/**
 * Launchpad project service — orchestrates the funding lifecycle and, on
 * success, bridges into the existing governance stack by creating the backing
 * Organization and registering contributors as members / eligible voters.
 *
 * On-chain actions go through the per-chain {@link getChainAdapter}. Escrow
 * signing secrets are stored AES-GCM encrypted on the project and only
 * decrypted here, server-side, to submit release/refund/mint transactions.
 */
export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository = projectRepository,
    private readonly contributions: ContributionRepository = contributionRepository,
    private readonly orgs: OrgService = orgService
  ) {}

  list(): Promise<Project[]> {
    return this.projects.list();
  }

  get(id: string): Promise<Project | null> {
    return this.projects.get(id);
  }

  listContributions(projectId: string) {
    return this.contributions.listByProject(projectId);
  }

  createProject(input: CreateProjectInput): Promise<Project> {
    return this.projects.create(input);
  }

  /** Open the campaign: provision the on-chain escrow and accept contributions. */
  async openFunding(id: string): Promise<Project> {
    const project = await this.require(id);
    if (project.status !== 'draft') {
      throw new ProjectStateError(`Only draft projects can open funding (current: ${project.status})`);
    }
    const adapter = getChainAdapter(project.chain);
    const { ref, auth } = await adapter.createEscrow({
      projectId: project.id,
      goalAmount: project.goalAmount,
      currency: project.currency,
      deadline: Math.floor(new Date(project.deadline).getTime() / 1000),
      membership: project.membership,
    });

    // Fold the on-chain account reserve into the goal so the net amount released
    // to the treasury still meets the creator's goal (the reserve stays locked
    // in the escrow account forever). Chains without a reserve are unaffected.
    let goalAmount = project.goalAmount;
    let reserveAmount: string | undefined;
    if (adapter.getAccountReserve) {
      const reserve = Number.parseFloat(await adapter.getAccountReserve());
      if (Number.isFinite(reserve) && reserve > 0) {
        reserveAmount = String(reserve);
        goalAmount = String(Number.parseFloat(project.goalAmount) + reserve);
      }
    }

    return this.projects.update(id, (p) => ({
      ...p,
      status: 'funding',
      escrowRef: ref,
      escrowSecretEnc: auth.secret ? encryptSecret(auth.secret) : undefined,
      goalAmount,
      reserveAmount,
    }));
  }

  /**
   * Poll the chain for new contributions, update the raised total, and
   * auto-transition: activate when the goal is met, or fail when expired.
   */
  async syncContributions(id: string): Promise<Project> {
    let project = await this.require(id);
    // Funding projects scan toward activation; live projects stay open so new
    // donors can join the DAO by donating. Other states have nothing to scan.
    if (project.status !== 'funding' && project.status !== 'live') return project;
    if (!project.escrowRef) return project;

    const adapter = getChainAdapter(project.chain);
    const scan = await adapter.scanContributions(project.escrowRef, project.scanMarker);

    const newTxHashes = new Set<string>();
    for (const c of scan.contributions) {
      const isNew = await this.contributions.recordIfNew({
        projectId: project.id,
        contributor: c.from,
        amount: c.amount,
        txHash: c.txHash,
      });
      if (isNew) newTxHashes.add(c.txHash);
    }

    if (newTxHashes.size > 0 || scan.marker !== project.scanMarker) {
      const all = await this.contributions.listByProject(project.id);
      const raised = all
        .filter((c) => c.status !== 'refunded')
        .reduce((sum, c) => sum + (Number.parseFloat(c.amount) || 0), 0);
      project = await this.projects.update(id, (p) => ({
        ...p,
        raisedAmount: String(raised),
        scanMarker: scan.marker ?? p.scanMarker,
      }));
    }

    // Live projects: enroll qualifying new donors and grow the treasury.
    if (project.status === 'live') {
      if (newTxHashes.size > 0) await this.enrollLiveDonors(project, newTxHashes);
      return project;
    }

    if (isGoalMet(project)) return this.activate(project.id);
    if (isExpired(project)) return this.fail(project.id);
    return project;
  }

  /** Sum non-refunded contributions per contributor. */
  private contributorTotals(contributions: Contribution[]): Map<string, number> {
    const totals = new Map<string, number>();
    for (const c of contributions) {
      if (c.status === 'refunded') continue;
      totals.set(c.contributor, (totals.get(c.contributor) ?? 0) + (Number.parseFloat(c.amount) || 0));
    }
    return totals;
  }

  /**
   * For a live (open) project: deposit each new donation into the treasury and
   * auto-add any contributor whose cumulative donations meet
   * {@link MIN_MEMBERSHIP_CONTRIBUTION} as a member of the backing org.
   */
  private async enrollLiveDonors(project: Project, newTxHashes: Set<string>): Promise<void> {
    if (!project.orgId) return;
    const org = await this.orgs.getOrganization(project.orgId);
    if (!org) return;
    const members = new Set(org.members.map((m) => m.walletAddress));

    const all = await this.contributions.listByProject(project.id);
    const totals = this.contributorTotals(all);

    // Grow the treasury by each newly-detected donation.
    for (const c of all) {
      if (!newTxHashes.has(c.txHash)) continue;
      try {
        await treasuryService.deposit(project.orgId, {
          amount: c.amount,
          currency: project.currency,
          initiatorAddress: c.contributor,
          memo: `Donation to live project ${project.id} (tx ${c.txHash})`,
        });
      } catch (err) {
        console.warn(`[ProjectService] live treasury deposit deferred for ${c.contributor}: ${String(err)}`);
      }
    }

    // Enroll contributors who cleared the minimum and are not yet members.
    for (const [contributor, total] of totals) {
      if (contributor === project.createdBy || members.has(contributor)) continue;
      if (total < MIN_MEMBERSHIP_CONTRIBUTION) continue;
      try {
        await this.orgs.addMember(project.orgId, { walletAddress: contributor, chain: project.chain });
        members.add(contributor);
      } catch (err) {
        console.warn(`[ProjectService] live addMember deferred for ${contributor}: ${String(err)}`);
      }
    }
  }

  /**
   * Activate a funded project: release escrow → mint membership → create the
   * backing Organization → register contributors as members + eligible voters.
   * On-chain steps are best-effort so a single chain hiccup can't strand the
   * org; the project still goes Live and unfinished steps can be retried.
   */
  async activate(id: string): Promise<Project> {
    let project = await this.require(id);
    if (project.status === 'live') return project;
    if (project.status !== 'funding' && project.status !== 'activating') {
      throw new ProjectStateError(`Cannot activate from status "${project.status}"`);
    }
    if (!isGoalMet(project)) {
      throw new ProjectStateError('Funding goal has not been met');
    }

    project = await this.projects.update(id, (p) => ({ ...p, status: 'activating' }));
    const auth = this.signer(project);

    // 1. Release escrow to the project treasury (creator wallet acts as the
    //    treasury destination until a dedicated treasury account is wired).
    if (project.escrowRef && auth) {
      try {
        const adapter = getChainAdapter(project.chain);
        await adapter.releaseEscrow(project.escrowRef, project.createdBy, auth);
      } catch (err) {
        console.warn(`[ProjectService] releaseEscrow deferred for "${id}": ${String(err)}`);
      }
    }

    // 2. Mint the membership asset (NFT/token) — but only to contributors whose
    //    cumulative contribution met the minimum. The minimum is what determines
    //    who receives the membership asset once the goal is achieved.
    const contributions = await this.contributions.listByProject(project.id);
    const totals = this.contributorTotals(contributions);
    const eligible = contributions.filter(
      (c) => (totals.get(c.contributor) ?? 0) >= MIN_MEMBERSHIP_CONTRIBUTION
    );
    if (auth) {
      await mintMembershipToContributors(project, eligible, auth, this.contributions).catch(
        (err) => console.warn(`[ProjectService] minting deferred for "${id}": ${String(err)}`)
      );
    }

    // 3. Create (or reuse) the backing Organization. Reusing when orgId is
    //    already set keeps activation idempotent if a previous attempt failed
    //    partway and is retried.
    const existingOrg = project.orgId ? await this.orgs.getOrganization(project.orgId) : null;
    const org =
      existingOrg ??
      (await this.orgs.createOrganization({
        name: project.name,
        description: project.description,
        chain: project.chain,
        createdBy: project.createdBy,
      }));

    // 4. Register each contributor whose cumulative contribution meets the
    //    minimum as a member (also adds on-chain eligible voter).
    const seen = new Set<string>([project.createdBy]);
    for (const c of contributions) {
      if (seen.has(c.contributor)) continue;
      seen.add(c.contributor);
      if ((totals.get(c.contributor) ?? 0) < MIN_MEMBERSHIP_CONTRIBUTION) continue;
      try {
        await this.orgs.addMember(org.id, { walletAddress: c.contributor, chain: project.chain });
      } catch (err) {
        console.warn(`[ProjectService] addMember deferred for ${c.contributor}: ${String(err)}`);
      }
    }

    // 5. Seed the governance treasury with the net released amount (raised minus
    //    the on-chain account reserve, which stays locked in escrow). Drives the
    //    Discord bot tier gate.
    try {
      const reserve = Number.parseFloat(project.reserveAmount ?? '0') || 0;
      const net = Math.max(0, (Number.parseFloat(project.raisedAmount) || 0) - reserve);
      await treasuryService.deposit(org.id, {
        amount: String(net),
        currency: project.currency,
        initiatorAddress: project.createdBy,
        memo: `Escrow release from launchpad project ${project.id}`,
      });
    } catch (err) {
      console.warn(`[ProjectService] treasury seed deferred for "${id}": ${String(err)}`);
    }

    return this.projects.update(id, (p) => ({
      ...p,
      status: 'live',
      orgId: org.id,
      activatedAt: new Date().toISOString(),
    }));
  }

  /** Mark a project failed (deadline passed without hitting the goal). */
  async fail(id: string): Promise<Project> {
    const project = await this.require(id);
    if (project.status !== 'funding') {
      throw new ProjectStateError(`Only funding projects can fail (current: ${project.status})`);
    }
    return this.projects.update(id, (p) => ({ ...p, status: 'failed' }));
  }

  /** Refund all contributors of a failed project. */
  async refund(id: string): Promise<Project> {
    let project = await this.require(id);
    if (project.status !== 'failed' && project.status !== 'refunding') {
      throw new ProjectStateError(`Cannot refund from status "${project.status}"`);
    }
    project = await this.projects.update(id, (p) => ({ ...p, status: 'refunding' }));

    const auth = this.signer(project);
    const contributions = await this.contributions.listByProject(project.id);
    if (project.escrowRef && auth) {
      const adapter = getChainAdapter(project.chain);
      for (const c of contributions) {
        if (c.status === 'refunded') continue;
        try {
          const receipt = await adapter.refundContributor(
            project.escrowRef,
            c.contributor,
            c.amount,
            auth
          );
          await this.contributions.update(c.id, (row) => ({
            ...row,
            status: 'refunded',
            refundTxHash: receipt.txHash,
          }));
        } catch (err) {
          console.warn(`[ProjectService] refund deferred for ${c.contributor}: ${String(err)}`);
        }
      }
    }

    return this.projects.update(id, (p) => ({ ...p, status: 'refunded' }));
  }

  /** Bind a Discord guild to a project (called by the bot /setup command). */
  bindGuild(id: string, guildId: string): Promise<Project> {
    return this.projects.update(id, (p) => ({ ...p, guildId }));
  }

  /**
   * Decrypt the escrow signer secret, if present. Returns null when there is no
   * secret or it can't be decrypted (e.g. it was encrypted with a now-lost
   * ephemeral key because LAUNCHPAD_ENCRYPTION_KEY wasn't set). On-chain write
   * steps are best-effort and guarded by a null check, so a missing signer must
   * never abort activation/refund — it just skips the on-chain action.
   */
  private signer(project: Project): SignerAuth | null {
    if (!project.escrowSecretEnc) {
      // Midnight uses the server WalletFacade rather than a per-project secret.
      return project.chain === 'midnight' ? { secret: 'server-wallet' } : null;
    }
    try {
      return { secret: decryptSecret(project.escrowSecretEnc) };
    } catch (err) {
      console.warn(
        `[ProjectService] escrow secret for "${project.id}" could not be decrypted ` +
          `(set LAUNCHPAD_ENCRYPTION_KEY to persist secrets across restarts). ` +
          `On-chain escrow actions will be skipped: ${String(err)}`
      );
      return null;
    }
  }

  private async require(id: string): Promise<Project> {
    const project = await this.projects.get(id);
    if (!project) throw new ProjectNotFoundError(id);
    return project;
  }
}

export const projectService = new ProjectService();
