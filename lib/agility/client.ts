import { config } from '../config';
import type {
  AgentRegistration,
  ApiResponse,
  Comment,
  CommentInput,
  CreateDaoInput,
  CreateProposalInput,
  Dao,
  DaoState,
  FollowInput,
  HealthData,
  PrivateVoteInput,
  Proposal,
  RegisterAgentInput,
  VoteInput,
  VoteResult,
  WalletAddress,
  WalletBalance,
} from './types';

export class AgilityError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AgilityError';
  }
}

export interface AgilityClientOptions {
  baseUrl?: string;
  adminKey?: string;
  fetchImpl?: typeof fetch;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | undefined>;
}

/**
 * Server-only typed client for AgilityCore (VaultChain Core).
 * The Bearer key must never be exposed to the browser; instantiate this
 * in Next.js route handlers / server scripts only.
 */
export class AgilityClient {
  private readonly baseUrl: string;
  private readonly adminKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AgilityClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? config.agility.baseUrl).replace(/\/$/, '');
    this.adminKey = options.adminKey ?? config.agility.adminKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { method = 'GET', body, auth = false, query } = options;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      if (!this.adminKey) {
        throw new AgilityError('AGILITY_ADMIN_KEY required for this request', 401, 'NO_API_KEY');
      }
      headers['Authorization'] = `Bearer ${this.adminKey}`;
    }

    let res: Response;
    try {
      res = await this.fetchImpl(this.buildUrl(path, query), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        // AgilityCore reflects live chain/proof-server state; never serve the
        // Next.js fetch cache for it (otherwise health/state goes stale).
        cache: 'no-store',
      });
    } catch (err) {
      throw new AgilityError(
        `Network error reaching AgilityCore: ${(err as Error).message}`,
        0,
        'NETWORK_ERROR'
      );
    }

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const errBody = parsed as ApiResponse;
      throw new AgilityError(
        errBody?.error?.message ?? `HTTP ${res.status} on ${path}`,
        res.status,
        errBody?.error?.code,
        errBody?.error?.details ?? parsed
      );
    }

    // Some endpoints return raw arrays/objects rather than ApiResponse wrappers.
    const result = parsed as ApiResponse<T>;
    if (result && typeof result === 'object' && 'success' in result) {
      return result;
    }
    return { success: true, data: parsed as T };
  }

  // ---- Core (public) ----
  health() {
    return this.request<HealthData>('/health');
  }

  // ---- Wallet ----
  walletAddress() {
    return this.request<WalletAddress>('/wallet/address');
  }

  walletBalance() {
    return this.request<WalletBalance>('/wallet/balance');
  }

  // ---- DAO (core) ----
  daoState() {
    return this.request<DaoState>('/dao/state');
  }

  // ---- Agents ----
  listAgents() {
    return this.request('/agents');
  }

  registerAgent(input: RegisterAgentInput) {
    return this.request<AgentRegistration>('/agents/register', {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  // ---- VoteChain namespace ----
  feed() {
    return this.request<Proposal[]>('/api/v1/votechain/feed');
  }

  exploreFeed() {
    return this.request<Proposal[]>('/api/v1/votechain/feed/explore');
  }

  trendingFeed() {
    return this.request<Proposal[]>('/api/v1/votechain/feed/trending');
  }

  followingFeed(walletAddress: string) {
    return this.request<Proposal[]>('/api/v1/votechain/feed/following', {
      query: { walletAddress },
    });
  }

  listDaos() {
    return this.request<Dao[]>('/api/v1/votechain/daos');
  }

  getDao(id: string) {
    return this.request<Dao>(`/api/v1/votechain/daos/${encodeURIComponent(id)}`);
  }

  createDao(input: CreateDaoInput) {
    return this.request<Dao>('/api/v1/votechain/daos', {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  followDao(input: FollowInput) {
    return this.request('/api/v1/votechain/daos/follow', {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  unfollowDao(input: FollowInput) {
    return this.request('/api/v1/votechain/daos/unfollow', {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  createProposal(input: CreateProposalInput) {
    return this.request<Proposal>('/api/v1/votechain/proposals', {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  getProposal(id: string) {
    return this.request<Proposal>(`/api/v1/votechain/proposals/${encodeURIComponent(id)}`);
  }

  commentProposal(input: CommentInput) {
    return this.request<Comment>('/api/v1/votechain/proposals/comment', {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  voteYes(input: VoteInput) {
    return this.request<VoteResult>('/api/v1/votechain/vote/yes', {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  voteNo(input: VoteInput) {
    return this.request<VoteResult>('/api/v1/votechain/vote/no', {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  voteAbstain(input: VoteInput) {
    return this.request<VoteResult>('/api/v1/votechain/vote/abstain', {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  votePrivate(input: PrivateVoteInput) {
    return this.request<VoteResult>('/api/v1/votechain/vote/private', {
      method: 'POST',
      body: input,
      auth: true,
    });
  }
}

export const agility = new AgilityClient();
