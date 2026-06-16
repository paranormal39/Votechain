// Types mapped to the AgilityCore (VaultChain Core) OpenAPI contract.
// Source: https://agilitycore-production.up.railway.app/openapi.json

export type ChainName = 'midnight' | 'xrpl' | 'xahau' | 'cardano';

export interface ApiResponseMeta {
  simulation?: boolean;
  timestamp?: string;
  requestId?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiResponseMeta;
}

export interface ChainHealth {
  chain: ChainName;
  connected: boolean;
  network: string;
  mode: 'simulation' | 'live';
}

export interface HealthData {
  status: string;
  version: string;
  environment?: string;
  simulation: boolean;
  uptime?: number;
  chains: Record<string, ChainHealth>;
  proofServer?: {
    connected: boolean;
    url: string;
    mode: 'simulation' | 'live';
  };
}

export interface WalletAddress {
  address: string;
  chain: string;
  network: string;
}

export interface WalletBalance {
  address: string;
  balance: string;
  symbol: string;
  network: string;
  simulation?: boolean;
}

export interface DaoState {
  proposalCount: number;
  activeProposal?: {
    id: number;
    type: string;
    amount: number;
    status: string;
    yesVotes: number;
    noVotes: number;
  };
  simulation?: boolean;
}

export interface Dao {
  id: string;
  name: string;
  description?: string;
  chain?: string;
  followers?: number;
  proposalCount?: number;
  createdAt?: string;
}

export type ProposalStatus = 'active' | 'closed' | 'passed' | 'rejected';

export interface Proposal {
  id: string;
  daoId: string;
  daoName?: string;
  chain?: string;
  title: string;
  summary?: string;
  description?: string;
  status: ProposalStatus | string;
  yesVotes?: number;
  noVotes?: number;
  abstainVotes?: number;
  commentCount?: number;
  createdAt?: string;
}

export interface Comment {
  id: string;
  proposalId: string;
  walletAddress: string;
  comment: string;
  createdAt?: string;
}

export interface VoteResult {
  success: boolean;
  txHash?: string;
  chain?: string;
}

export interface Agent {
  id: string;
  agentName: string;
  description?: string;
  capabilities?: string[];
  createdAt?: string;
  active?: boolean;
}

export interface AgentRegistration extends Agent {
  apiKey?: string; // returned once on registration
}

// Request payloads
export interface CreateDaoInput {
  name: string;
  description?: string;
  chain?: string;
}

export interface CreateProposalInput {
  daoId: string;
  title: string;
  summary?: string;
  description?: string;
  chain?: string;
  status?: string;
}

export interface VoteInput {
  proposalId: string;
  walletAddress: string;
}

export interface PrivateVoteInput extends VoteInput {
  /** Opaque ZK proof hash generated client-side by the user's Midnight proof server.
   *  The vote choice is committed inside the proof and must NEVER be transmitted. */
  proofHash: string;
}

export interface CommentInput {
  proposalId: string;
  walletAddress: string;
  comment: string;
}

export interface FollowInput {
  daoId: string;
  walletAddress: string;
}

export interface RegisterAgentInput {
  agentName: string;
  description: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
}
