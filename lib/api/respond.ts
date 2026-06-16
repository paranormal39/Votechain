import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { AgilityError } from '../agility/client';
import { DuplicateMemberError, OrgNotFoundError } from '../domain/repository';
import { ProposalNotFoundError } from '../domain/proposal-repository';
import { ProposalStateError } from '../domain/proposal-service';
import { MembershipDeniedError } from '../domain/service';
import {
  DelegationNotFoundError,
  DuplicateDelegationError,
  SelfDelegationError,
} from '../domain/delegation-repository';
import { DelegationError } from '../domain/delegation-service';
import {
  TreasuryNotFoundError,
  TreasuryStateError,
  SpendRequestNotFoundError,
} from '../domain/treasury-repository';
import { TreasuryError } from '../domain/treasury-service';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(message: string, status = 400, code?: string, details?: unknown) {
  return NextResponse.json(
    { success: false, error: { code: code ?? 'ERROR', message, details } },
    { status }
  );
}

/** Parse + validate a JSON body against a zod schema, returning typed data or a 400 response. */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ data: T } | { response: NextResponse }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { response: fail('Invalid JSON body', 400, 'INVALID_JSON') };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      response: fail('Validation failed', 422, 'VALIDATION_ERROR', result.error.flatten()),
    };
  }
  return { data: result.data };
}

/** Map known domain/agility errors to HTTP responses. */
export function handleError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return fail('Validation failed', 422, 'VALIDATION_ERROR', err.flatten());
  }
  if (err instanceof OrgNotFoundError) {
    return fail(err.message, 404, 'ORG_NOT_FOUND');
  }
  if (err instanceof ProposalNotFoundError) {
    return fail(err.message, 404, 'PROPOSAL_NOT_FOUND');
  }
  if (err instanceof DuplicateMemberError) {
    return fail(err.message, 409, 'DUPLICATE_MEMBER');
  }
  if (err instanceof ProposalStateError) {
    return fail(err.message, 409, 'PROPOSAL_STATE');
  }
  if (err instanceof MembershipDeniedError) {
    return fail(err.message, 403, 'MEMBERSHIP_DENIED', err.results);
  }
  if (err instanceof DelegationNotFoundError) {
    return fail(err.message, 404, 'DELEGATION_NOT_FOUND');
  }
  if (err instanceof DuplicateDelegationError) {
    return fail(err.message, 409, 'DUPLICATE_DELEGATION');
  }
  if (err instanceof SelfDelegationError) {
    return fail(err.message, 422, 'SELF_DELEGATION');
  }
  if (err instanceof DelegationError) {
    return fail(err.message, 422, 'DELEGATION_ERROR');
  }
  if (err instanceof TreasuryNotFoundError) {
    return fail(err.message, 404, 'TREASURY_NOT_FOUND');
  }
  if (err instanceof SpendRequestNotFoundError) {
    return fail(err.message, 404, 'SPEND_REQUEST_NOT_FOUND');
  }
  if (err instanceof TreasuryStateError) {
    return fail(err.message, 409, 'TREASURY_STATE');
  }
  if (err instanceof TreasuryError) {
    return fail(err.message, 422, 'TREASURY_ERROR');
  }
  if (err instanceof AgilityError) {
    return fail(err.message, err.status >= 400 ? err.status : 502, err.code, err.details);
  }
  console.error('[api] Unhandled error:', err);
  return fail('Internal server error', 500, 'INTERNAL_ERROR');
}
