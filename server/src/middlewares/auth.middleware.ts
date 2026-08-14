import type { Request, RequestHandler } from 'express';
import type { Role } from '../entities/User';
import { authService } from '../services/AuthService';
import { ForbiddenError, UnauthorizedError } from '../utils/AppError';
import { verifyAccessToken } from '../utils/jwt';

/** Who the caller is, as established by {@link authenticate}. */
export interface AuthContext {
  userId: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the shape Express's types expect
  namespace Express {
    interface Request {
      /**
       * Set by `authenticate`, absent otherwise.
       *
       * Optional on purpose. Declaring it non-optional would be convenient and untrue, and would let a
       * route that forgot `authenticate` read `undefined` through a type that promises otherwise.
       * Read it with {@link getAuth}.
       */
      auth?: AuthContext;
    }
  }
}

const BEARER = 'Bearer ';

/**
 * Establishes who the caller is, or rejects the request.
 *
 * The token is verified for authenticity, then the account is re-read from the database. Both steps
 * matter: the signature proves the token was issued by us, and the read proves the account it names is
 * still allowed in. A suspended user's token stays cryptographically valid until it expires, so a
 * token-only check would keep letting them in for days.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;

  if (header === undefined || !header.startsWith(BEARER)) {
    throw new UnauthorizedError('Authentication required');
  }

  const claims = verifyAccessToken(header.slice(BEARER.length).trim());
  const account = await authService.getAuthenticatedAccount(claims.sub);

  // The role comes from the account, not from `claims.role`. Demoting a Creator takes effect on their
  // next request rather than whenever their token happens to run out.
  req.auth = { userId: account.id, role: account.role };
  next();
};

/**
 * Coarse role gate for a route: `authorize(Role.ADMIN)`.
 *
 * This is the whole of role-based access control. Anything finer — a Creator reading *their own*
 * challenge's participants — is ownership, which depends on the row being fetched and therefore belongs
 * in the service that fetches it. Splitting one rule across both layers means two places to change and
 * one to forget.
 */
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const { role } = getAuth(req);

    if (!roles.includes(role)) {
      throw new ForbiddenError(`This action requires the ${roles.join(' or ')} role`);
    }

    next();
  };
}

/**
 * Reads the authenticated caller, for controllers and for `authorize`.
 *
 * A missing context here is not a client error — it means a route was wired without `authenticate` in
 * front of it. So this throws a plain `Error`, which the error middleware reports as a 500 and logs,
 * rather than an `AppError` that would tell the caller they are unauthenticated when in fact the server
 * is misconfigured.
 */
export function getAuth(req: Request): AuthContext {
  if (req.auth === undefined) {
    throw new Error(
      `Route ${req.method} ${req.originalUrl} reads the authenticated user but is not behind the authenticate middleware`,
    );
  }

  return req.auth;
}
