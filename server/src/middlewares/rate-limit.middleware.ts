import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';
import { TooManyRequestsError } from '../utils/AppError';

/**
 * How many unauthenticated auth attempts one address may make in a window.
 *
 * The number is chosen to be invisible to a person and expensive to a script. Registration and login
 * are the only endpoints that will answer to a caller with no token at all, which makes them the only
 * ones a stranger can hammer — everything else is behind `authenticate`, where the account itself can
 * be suspended. Login in particular is the password-guessing surface, and bcrypt at cost 12 means each
 * attempt costs the server real CPU, so throttling protects availability as well as accounts.
 */
export const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const AUTH_ATTEMPT_LIMIT = 20;

interface RateLimiterOptions {
  windowMs: number;
  limit: number;
  /** Per-request escape hatch, evaluated on every call. */
  skip: () => boolean;
}

/**
 * Builds a limiter that reports a refusal the way the rest of the API does.
 *
 * A factory rather than a single ready-made instance, because a limiter counts per address and every
 * request in a test arrives from the same one: the application's limiter has to stand down under test
 * or it would start rejecting the suite's own logins, and the limiter still has to be provable. So the
 * application builds one that skips itself in tests, and the rate-limit test builds one with a limit of
 * two that does not — the same code path, exercised for real.
 *
 * `handler` hands a `TooManyRequestsError` to `next` instead of writing a response. The error middleware
 * stays the only thing that sets a status, and a throttled caller reads the same `{ code, message }`
 * envelope as any other failure.
 */
export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    // The current `RateLimit` header, rather than the deprecated `X-RateLimit-*` pair.
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: options.skip,
    handler: (_req, _res, next) => {
      next(new TooManyRequestsError('Too many attempts. Wait a few minutes and try again.'));
    },
  });
}

/** The limiter in front of registration and login. */
export const authRateLimiter = createRateLimiter({
  windowMs: AUTH_ATTEMPT_WINDOW_MS,
  limit: AUTH_ATTEMPT_LIMIT,
  skip: () => isTest,
});
