import 'server-only';
import { orgRepository, OrgNotFoundError, type OrgRepository } from './repository';
import {
  treasuryRepository,
  TreasuryNotFoundError,
  TreasuryStateError,
  SpendRequestNotFoundError,
  type TreasuryRepository,
} from './treasury-repository';
import {
  proposalRepository,
  type ProposalRepository,
} from './proposal-repository';
import type {
  TreasuryAccount,
  SpendRequest,
  DepositInput,
  CreateSpendRequestInput,
  ExecuteSpendInput,
  PrivacyMode,
} from './treasury-types';

export class TreasuryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TreasuryError';
  }
}

export class TreasuryService {
  constructor(
    private readonly treasury: TreasuryRepository = treasuryRepository,
    private readonly orgs: OrgRepository = orgRepository,
    private readonly proposals: ProposalRepository = proposalRepository
  ) {}

  /** Get or initialise the treasury for an org. */
  async getOrInit(orgId: string, currency?: string): Promise<TreasuryAccount> {
    const org = await this.orgs.getOrganization(orgId);
    if (!org) throw new OrgNotFoundError(orgId);
    return this.treasury.getOrCreate(orgId, currency);
  }

  /** Record a deposit — admin only (caller must validate role before calling). */
  async deposit(orgId: string, input: DepositInput): Promise<TreasuryAccount> {
    const org = await this.orgs.getOrganization(orgId);
    if (!org) throw new OrgNotFoundError(orgId);
    return this.treasury.deposit(orgId, input);
  }

  /** Create a spend request (pending governance approval). */
  async createSpendRequest(orgId: string, input: CreateSpendRequestInput): Promise<SpendRequest> {
    const org = await this.orgs.getOrganization(orgId);
    if (!org) throw new OrgNotFoundError(orgId);
    return this.treasury.createSpendRequest(orgId, input);
  }

  /**
   * Execute a spend request.
   * Governance gate: the linked proposal must be in 'passed' state.
   * Checks balance covers the spend amount.
   */
  async executeSpend(orgId: string, input: ExecuteSpendInput): Promise<SpendRequest> {
    const account = await this.treasury.get(orgId);
    if (!account) throw new TreasuryNotFoundError(orgId);

    const spendReq = account.spendRequests.find((s) => s.id === input.spendRequestId);
    if (!spendReq) throw new SpendRequestNotFoundError(input.spendRequestId);

    if (spendReq.status === 'executed') {
      throw new TreasuryStateError('Spend request has already been executed');
    }
    if (spendReq.status === 'cancelled' || spendReq.status === 'rejected') {
      throw new TreasuryStateError(`Cannot execute a ${spendReq.status} spend request`);
    }

    // Governance gate: check backing proposal passed.
    if (spendReq.proposalId) {
      const proposal = await this.proposals.getProposal(spendReq.proposalId);
      if (!proposal) {
        throw new TreasuryError(`Backing proposal "${spendReq.proposalId}" not found`);
      }
      if (proposal.status !== 'passed') {
        throw new TreasuryStateError(
          `Spend is blocked — backing proposal is "${proposal.status}" (must be "passed")`
        );
      }
    } else {
      throw new TreasuryStateError('Spend request must be linked to a passed proposal before execution');
    }

    // Balance check.
    if (parseFloat(account.balance) < parseFloat(spendReq.amount)) {
      throw new TreasuryStateError(
        `Insufficient balance: have ${account.balance} ${account.currency}, need ${spendReq.amount}`
      );
    }

    // Record spend on ledger.
    await this.treasury.appendTx(orgId, {
      kind: 'spend',
      amount: spendReq.amount,
      currency: spendReq.currency,
      initiatorAddress: input.authorisedBy,
      memo: spendReq.purpose,
      proposalId: spendReq.proposalId,
      txHash: input.txHash,
    });

    // Mark spend request executed.
    return this.treasury.updateSpendRequest(orgId, input.spendRequestId, (s) => ({
      ...s,
      status: 'executed',
      executedAt: new Date().toISOString(),
      executedTxHash: input.txHash,
      updatedAt: new Date().toISOString(),
    }));
  }

  /** Cancel a pending spend request (admin). */
  async cancelSpendRequest(orgId: string, spendRequestId: string): Promise<SpendRequest> {
    const account = await this.treasury.get(orgId);
    if (!account) throw new TreasuryNotFoundError(orgId);
    const spendReq = account.spendRequests.find((s) => s.id === spendRequestId);
    if (!spendReq) throw new SpendRequestNotFoundError(spendRequestId);
    if (spendReq.status !== 'pending') {
      throw new TreasuryStateError(`Cannot cancel a ${spendReq.status} spend request`);
    }
    return this.treasury.updateSpendRequest(orgId, spendRequestId, (s) => ({
      ...s,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    }));
  }

  /** Approve a spend request — called internally when a treasury proposal passes. */
  async approveSpendRequest(orgId: string, spendRequestId: string): Promise<SpendRequest> {
    return this.treasury.updateSpendRequest(orgId, spendRequestId, (s) => ({
      ...s,
      status: 'approved' as const,
      updatedAt: new Date().toISOString(),
    }));
  }

  /** Update the privacy mode for the whole treasury (admin). */
  async setPrivacyMode(_orgId: string, _mode: PrivacyMode): Promise<TreasuryAccount> {
    throw new TreasuryError('setPrivacyMode not yet implemented — Phase 5 ZK upgrade');
  }

  /** Link an existing proposal to a spend request (used when proposal is created separately). */
  async linkProposal(orgId: string, spendRequestId: string, proposalId: string): Promise<SpendRequest> {
    const account = await this.treasury.get(orgId);
    if (!account) throw new TreasuryNotFoundError(orgId);
    return this.treasury.updateSpendRequest(orgId, spendRequestId, (s) => ({
      ...s,
      proposalId,
      status: 'approved',
      updatedAt: new Date().toISOString(),
    }));
  }
}

export { TreasuryNotFoundError, TreasuryStateError, SpendRequestNotFoundError };
export const treasuryService = new TreasuryService();
