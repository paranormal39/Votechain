import { z } from 'zod';

export const chainSchema = z.enum(['midnight', 'xrpl', 'xahau', 'cardano']);

export const roleSchema = z.enum(['admin', 'member', 'observer']);

// ---- Membership settings & join requirements ----

export const joinPolicySchema = z.enum(['invite', 'open', 'gated']);

export const tokenRequirementSchema = z.object({
  kind: z.literal('token'),
  chain: chainSchema,
  label: z.string().max(120).optional(),
  issuer: z.string().min(4, 'A valid issuer address is required'),
  currency: z.string().min(1, 'Currency code is required').max(40),
  minBalance: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Minimum balance must be a non-negative number'),
});

export const nftRequirementSchema = z.object({
  kind: z.literal('nft'),
  chain: chainSchema,
  label: z.string().max(120).optional(),
  issuer: z.string().min(4, 'A valid issuer address is required'),
  taxon: z.number().int().min(0).optional(),
  minCount: z.number({ invalid_type_error: 'Minimum count must be a number' }).int().min(1),
});

export const midnightRequirementSchema = z.object({
  kind: z.literal('midnight'),
  chain: z.literal('midnight'),
  label: z.string().max(120).optional(),
  statement: z.string().max(200).optional(),
});

export const requirementSchema = z.discriminatedUnion('kind', [
  tokenRequirementSchema,
  nftRequirementSchema,
  midnightRequirementSchema,
]);

export const membershipSettingsSchema = z.object({
  joinPolicy: joinPolicySchema,
  requirements: z.array(requirementSchema).max(10),
});

export const updateSettingsSchema = z.object({
  membership: membershipSettingsSchema,
});

export const joinOrgSchema = z.object({
  walletAddress: z.string().min(4, 'A valid wallet address is required'),
  chain: chainSchema,
  displayName: z.string().max(80).optional(),
  proofHash: z.string().min(8).optional(),
});

export const createOrgSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().max(500).optional(),
  chain: chainSchema,
  createdBy: z.string().min(4, 'A valid wallet address is required'),
  membership: membershipSettingsSchema.optional(),
});

export const addMemberSchema = z.object({
  walletAddress: z.string().min(4, 'A valid wallet address is required'),
  chain: chainSchema,
  displayName: z.string().max(80).optional(),
  role: roleSchema.optional(),
});

export const updateRoleSchema = z.object({
  walletAddress: z.string().min(4),
  role: roleSchema,
});

export type CreateOrgBody = z.infer<typeof createOrgSchema>;
export type AddMemberBody = z.infer<typeof addMemberSchema>;
export type UpdateRoleBody = z.infer<typeof updateRoleSchema>;
export type MembershipSettingsBody = z.infer<typeof membershipSettingsSchema>;
export type UpdateSettingsBody = z.infer<typeof updateSettingsSchema>;
export type JoinOrgBody = z.infer<typeof joinOrgSchema>;

// ---- Proposals (Phase 2) ----

export const proposalTypeSchema = z.enum(['general', 'treasury']);

export const createProposalSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().min(1, 'Description is required').max(5000),
  type: proposalTypeSchema.optional(),
  votingPeriodDays: z
    .number({ invalid_type_error: 'Voting period must be a number' })
    .int('Voting period must be a whole number of days')
    .min(1, 'Voting period must be at least 1 day')
    .max(90, 'Voting period cannot exceed 90 days'),
  quorum: z
    .number({ invalid_type_error: 'Quorum must be a number' })
    .int('Quorum must be a whole number')
    .min(0, 'Quorum cannot be negative')
    .max(100000),
  createdBy: z.string().min(4, 'A valid wallet address is required'),
});

export const addCommentSchema = z.object({
  author: z.string().min(4, 'A valid wallet address is required'),
  body: z.string().min(1, 'Comment cannot be empty').max(2000),
});

export const proposalActionSchema = z.object({
  action: z.enum(['activate', 'finalize']),
});

export type CreateProposalBody = z.infer<typeof createProposalSchema>;
export type AddCommentBody = z.infer<typeof addCommentSchema>;
export type ProposalActionBody = z.infer<typeof proposalActionSchema>;

// ---- Voting (Phase 3) ----

export const publicVoteSchema = z.object({
  walletAddress: z.string().min(4, 'A valid wallet address is required'),
  choice: z.enum(['yes', 'no', 'abstain']),
});

export const privateVoteSchema = z.object({
  walletAddress: z.string().min(4, 'A valid wallet address is required'),
  /** Opaque ZK proof hash produced client-side. Choice must NEVER be sent. */
  proofHash: z.string().min(8, 'A valid proof hash is required'),
});

export type PublicVoteBody = z.infer<typeof publicVoteSchema>;
export type PrivateVoteBody = z.infer<typeof privateVoteSchema>;

// ---- Delegation (Phase 4) ----

export const delegateSchema = z.object({
  delegatorAddress: z.string().min(4, 'A valid delegator wallet address is required'),
  delegateAddress: z.string().min(4, 'A valid delegate wallet address is required'),
});

export const revokeDelegationSchema = z.object({
  delegatorAddress: z.string().min(4, 'A valid delegator wallet address is required'),
});

export type DelegateBody = z.infer<typeof delegateSchema>;
export type RevokeDelegationBody = z.infer<typeof revokeDelegationSchema>;

// ---- Feedback (Phase 6) ----

export const submitFeedbackSchema = z.object({
  walletAddress: z.string().min(4, 'A valid wallet address is required'),
  body: z.string().min(1, 'Feedback cannot be empty').max(2000),
  /** Optional reporting period (e.g. "2026-Q1"); defaults to the current month. */
  period: z.string().min(1).max(40).optional(),
});

export type SubmitFeedbackBody = z.infer<typeof submitFeedbackSchema>;

// ---- Treasury (Phase 5) ----

const amountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Amount must be a positive number');

export const depositSchema = z.object({
  amount: amountSchema,
  currency: z.string().max(10).optional(),
  initiatorAddress: z.string().min(4, 'A valid wallet address is required'),
  memo: z.string().max(300).optional(),
  txHash: z.string().optional(),
});

export const createSpendRequestSchema = z.object({
  amount: amountSchema,
  currency: z.string().max(10).optional(),
  recipientAddress: z.string().min(4, 'A valid recipient address is required'),
  purpose: z.string().min(3, 'Purpose is required').max(300),
  privacyMode: z.enum(['public', 'hybrid', 'private']).optional(),
  requestedBy: z.string().min(4, 'A valid wallet address is required'),
  proposalId: z.string().optional(),
});

export const executeSpendSchema = z.object({
  spendRequestId: z.string().min(1),
  authorisedBy: z.string().min(4, 'A valid wallet address is required'),
  txHash: z.string().optional(),
});

export const linkProposalSchema = z.object({
  spendRequestId: z.string().min(1),
  proposalId: z.string().min(1),
});

export type DepositBody = z.infer<typeof depositSchema>;
export type CreateSpendRequestBody = z.infer<typeof createSpendRequestSchema>;
export type ExecuteSpendBody = z.infer<typeof executeSpendSchema>;
export type LinkProposalBody = z.infer<typeof linkProposalSchema>;

// ---- Launchpad projects (pivot) ----

// Launchpad funding currently supports XRPL/Xahau + Midnight; Cardano trails.
export const launchpadChainSchema = z.enum(['midnight', 'xrpl', 'xahau']);

export const membershipConfigSchema = z.object({
  kind: z.enum(['token', 'nft', 'credential']),
  name: z.string().min(2, 'Membership name is required').max(80),
  currency: z.string().max(40).optional(),
  amountPerContributor: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Amount must be a non-negative number')
    .optional(),
  taxon: z.number().int().min(0).optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().max(1000).optional(),
  chain: launchpadChainSchema,
  createdBy: z.string().min(4, 'A valid wallet address is required'),
  goalAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Goal must be a positive number'),
  currency: z.string().min(1).max(40),
  deadline: z.string().datetime({ message: 'Deadline must be an ISO datetime' }),
  membership: membershipConfigSchema,
});

export const projectActionSchema = z.object({
  action: z.enum(['open', 'sync', 'activate', 'fail', 'refund']),
});

export const bindGuildSchema = z.object({
  guildId: z.string().min(2, 'A valid Discord guild id is required'),
});

export type MembershipConfigBody = z.infer<typeof membershipConfigSchema>;
export type CreateProjectBody = z.infer<typeof createProjectSchema>;
export type ProjectActionBody = z.infer<typeof projectActionSchema>;
export type BindGuildBody = z.infer<typeof bindGuildSchema>;
