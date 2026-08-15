import { QueryFailedError } from 'typeorm';
import type { EntityManager } from 'typeorm';

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

/**
 * Every table holding domain rows, in one list.
 *
 * `migrations` is deliberately absent: emptying the data must never look like un-applying the schema.
 * The seed and the integration tests both start from an empty database, and they read this list rather
 * than each keeping their own — two lists that have to agree is exactly how a new table ends up
 * truncated by one and left behind by the other.
 */
export const DOMAIN_TABLES = [
  'points_ledger',
  'redemptions',
  'challenge_check_ins',
  'challenge_participations',
  'habit_completions',
  'habits',
  'expenses',
  'budget_goals',
  'challenges',
  'reward_items',
  'users',
] as const;

/**
 * Empties the domain tables.
 *
 * CASCADE is required rather than tidy: `users.equipped_redemption_id` points into `redemptions`, which
 * points back at `users`, so no ordering of these tables alone satisfies every foreign key.
 */
export async function truncateDomainTables(manager: EntityManager): Promise<void> {
  await manager.query(`TRUNCATE TABLE ${DOMAIN_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}
