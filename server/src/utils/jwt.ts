import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { Role } from '../entities/User';
import { UnauthorizedError } from './AppError';

/**
 * The signed claims. Deliberately tiny: an identifier and a role, nothing that goes stale badly.
 *
 * `role` is here because the client needs it to decide what to render, and because the specification
 * calls for a token carrying identity and role. It is **not** what the API authorizes against —
 * `authenticate` re-reads the role from the database on every request, so demoting or suspending an
 * account takes effect immediately rather than whenever the token happens to expire.
 */
export interface AccessTokenClaims {
  /** The user's id, in the standard `sub` claim. */
  sub: string;
  role: Role;
}

const ROLES = new Set<string>(Object.values(Role));

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.jwt.secret, {
    // The library types this as a template-literal union of duration strings; a value read from the
    // environment cannot be proven to match it at compile time. `config/env.ts` validates the format
    // at boot, which is what this cast rests on.
    expiresIn: env.jwt.expiresIn as SignOptions['expiresIn'],
  });
}

/**
 * Verifies a token and narrows its payload.
 *
 * Every failure — bad signature, expired, malformed, or a payload that does not match the shape above
 * — becomes the same `UnauthorizedError` with the same message. Distinguishing them would tell an
 * attacker which part of a forged token to fix next.
 */
export function verifyAccessToken(token: string): AccessTokenClaims {
  let payload: unknown;

  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch {
    throw new UnauthorizedError('Access token is missing, invalid, or expired');
  }

  if (!isAccessTokenClaims(payload)) {
    throw new UnauthorizedError('Access token is missing, invalid, or expired');
  }

  return payload;
}

/**
 * `jwt.verify` returns `string | JwtPayload`, and a `JwtPayload` is an open bag of unknown values —
 * so the claims have to be checked rather than asserted. A token signed by us with an older payload
 * shape would otherwise flow through as a valid identity.
 */
function isAccessTokenClaims(payload: unknown): payload is AccessTokenClaims {
  if (typeof payload !== 'object' || payload === null) return false;

  const { sub, role } = payload as Record<string, unknown>;
  return typeof sub === 'string' && sub !== '' && typeof role === 'string' && ROLES.has(role);
}
