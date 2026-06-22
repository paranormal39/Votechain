import 'server-only';
import { orgRepository, OrgNotFoundError, type OrgRepository } from './repository';
import {
  feedbackRepository,
  type FeedbackRepository,
} from './feedback-repository';
import {
  onChainSubmitFeedback,
  deriveWalletSecretHex,
  toFieldId,
} from '../midnight/client';
import type { Feedback, SubmitFeedbackInput } from './feedback-types';

export class FeedbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedbackError';
  }
}

/** Default reporting period: current calendar month (YYYY-MM, UTC). */
function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Member feedback service (Phase 6).
 *
 * Submitting feedback records an anonymous nullifier in the votechain-feedback
 * contract (one per member/org/period) and persists the feedback body locally
 * for org admins to review. The on-chain call is the source of truth for
 * one-per-period enforcement; when Midnight is disabled it is skipped and the
 * feedback is stored locally only.
 */
export class FeedbackService {
  constructor(
    private readonly feedback: FeedbackRepository = feedbackRepository,
    private readonly orgs: OrgRepository = orgRepository
  ) {}

  listByOrg(orgId: string): Promise<Feedback[]> {
    return this.feedback.listByOrg(orgId);
  }

  async submit(orgId: string, input: SubmitFeedbackInput): Promise<Feedback> {
    const org = await this.orgs.getOrganization(orgId);
    if (!org) throw new OrgNotFoundError(orgId);

    const member = org.members.find((m) => m.walletAddress === input.walletAddress);
    if (!member) {
      throw new FeedbackError(`${input.walletAddress} is not a member of this organization`);
    }

    const period = input.period ?? currentPeriod();

    // Submit the anonymous nullifier on-chain. Unlike most best-effort writes,
    // a thrown error here (e.g. duplicate submission for this period) must
    // surface so the member knows their feedback was rejected.
    let receipt: string | undefined;
    try {
      await onChainSubmitFeedback(
        toFieldId(orgId),
        toFieldId(period),
        deriveWalletSecretHex(input.walletAddress)
      );
      receipt = `feedback-${period}-${Date.now()}`;
    } catch (err) {
      throw new FeedbackError(
        `On-chain feedback submission failed (you may have already submitted for ${period}): ${String(err)}`
      );
    }

    return this.feedback.create(orgId, period, input.body, receipt);
  }
}

export const feedbackService = new FeedbackService();
