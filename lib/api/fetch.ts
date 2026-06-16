// Browser-side fetch helper for VoteChain BFF routes.

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !json?.success) {
    throw new ApiClientError(
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      json?.error?.code,
      json?.error?.details
    );
  }

  return json.data as T;
}
