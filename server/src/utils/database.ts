import { QueryFailedError } from 'typeorm';

/** PostgreSQL's SQLSTATE for `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/**
 * True when a failed query lost a race against a unique constraint.
 *
 * The schema prevents duplicates with unique keys rather than with an application-level "does this
 * already exist?" read, because that read is a race: two concurrent requests both see nothing and
 * both insert. The loser arrives here, and the service translates it into the right domain error —
 * a duplicate registration is a `ConflictError`, a second check-in on the same day is too.
 *
 * `constraint` lets a caller distinguish which key was hit when a table has more than one.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;

  const driverError = error.driverError as { code?: string; constraint?: string };
  if (driverError.code !== UNIQUE_VIOLATION) return false;

  return constraint === undefined || driverError.constraint === constraint;
}
