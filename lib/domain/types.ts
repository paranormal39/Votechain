// VoteChain domain types.
//
// An Organization is backed by an AgilityCore DAO (the DAO id is stored on the
// org). Roles and richer member metadata are VoteChain-only concepts that
// AgilityCore does not model, so they live in the VoteChain domain store.

import type { ChainName } from '../agility/types';

export type MemberRole = 'admin' | 'member' | 'observer';

export const MEMBER_ROLES: MemberRole[] = ['admin', 'member', 'observer'];

export interface Member {
  /** Wallet address used as the member identity. */
  walletAddress: string;
  /** Chain the wallet identity belongs to. */
  chain: ChainName;
  /** Display name (optional). */
  displayName?: string;
  /** Governance role within the organization. */
  role: MemberRole;
  /** ISO timestamp of when the member joined. */
  joinedAt: string;
}

/**
 * How a wallet may become a member of an organization.
 * - `invite`: admins add members manually (the original behaviour).
 * - `open`: anyone with a connected wallet may self-join.
 * - `gated`: anyone may self-join provided they satisfy ALL requirements
 *   (NFT / token holdings verified on-chain, Midnight holding proofs, etc.).
 */
export type JoinPolicy = 'invite' | 'open' | 'gated';

export type RequirementKind = 'token' | 'nft' | 'midnight';

interface RequirementBase {
  kind: RequirementKind;
  /** Chain the requirement is evaluated against. */
  chain: ChainName;
  /** Optional human-readable label shown to applicants. */
  label?: string;
}

/** Holder must own at least `minBalance` of an issued token. */
export interface TokenRequirement extends RequirementBase {
  kind: 'token';
  /** Issuer / minter account address (XRPL/Xahau issuer). */
  issuer: string;
  /** Currency code (XRPL 3-char ASCII or 40-char hex). */
  currency: string;
  /** Minimum balance the wallet must hold (decimal string). */
  minBalance: string;
}

/** Holder must own at least `minCount` NFTs from an issuer (optionally a taxon). */
export interface NftRequirement extends RequirementBase {
  kind: 'nft';
  /** NFT issuer / minter account address. */
  issuer: string;
  /** Optional XRPL NFT taxon filter. */
  taxon?: number;
  /** Minimum number of matching NFTs the wallet must hold. */
  minCount: number;
}

/**
 * Holder must present a client-generated Midnight proof attesting they hold the
 * required shielded asset. Shielded balances cannot be verified server-side, so
 * the proof is produced in the browser against the user's own proof server and
 * only the opaque proofHash is transmitted.
 */
export interface MidnightRequirement extends RequirementBase {
  kind: 'midnight';
  chain: 'midnight';
  /** Human-readable statement of what the proof must attest. */
  statement?: string;
}

export type MembershipRequirement = TokenRequirement | NftRequirement | MidnightRequirement;

export interface MembershipSettings {
  joinPolicy: JoinPolicy;
  /** ALL requirements must be satisfied to join when joinPolicy is `gated`. */
  requirements: MembershipRequirement[];
}

export const DEFAULT_MEMBERSHIP: MembershipSettings = {
  joinPolicy: 'invite',
  requirements: [],
};

export interface Organization {
  /** VoteChain org id (slug-like, stable). */
  id: string;
  /** Human-readable organization name. */
  name: string;
  /** Optional description / mission. */
  description?: string;
  /** Primary governance chain. */
  chain: ChainName;
  /** Backing AgilityCore DAO id, when created/linked. */
  daoId?: string;
  /** Wallet address of the creating admin. */
  createdBy: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Membership policy and join requirements. */
  membership: MembershipSettings;
  /** Members and their roles. */
  members: Member[];
}

export interface CreateOrganizationInput {
  name: string;
  description?: string;
  chain: ChainName;
  /** Wallet address of the creator (becomes the first admin). */
  createdBy: string;
  /** Optional initial membership settings (defaults to invite-only). */
  membership?: MembershipSettings;
}

export interface JoinOrganizationInput {
  walletAddress: string;
  chain: ChainName;
  displayName?: string;
  /** Opaque client-generated proof hash, required when a Midnight requirement applies. */
  proofHash?: string;
}

export interface AddMemberInput {
  walletAddress: string;
  chain: ChainName;
  displayName?: string;
  role?: MemberRole;
}

export interface UpdateMemberRoleInput {
  walletAddress: string;
  role: MemberRole;
}
