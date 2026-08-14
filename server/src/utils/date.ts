/**
 * Calendar-date helpers.
 *
 * Every `date` column in the schema is carried as a `YYYY-MM-DD` string rather than a `Date`,
 * because a SQL `date` has no time and no zone — see the note on `Challenge.startDate`. These
 * functions are the only place that converts between the two representations, and they are pure, so
 * the streak and budget rules built on top of them are unit-testable without a database.
 *
 * All arithmetic here is deliberately done in UTC. A local-time calculation would give two users in
 * different zones different answers to "what day is this?", and a check-in is either on a day or it
 * is not.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Matches exactly a calendar date, `YYYY-MM-DD`.
 *
 * DTOs validate against this rather than `@IsDateString`, which also accepts a full timestamp with an
 * offset. Every `date` column here is zoneless, so accepting `2026-08-15T23:00:00+05:30` would mean
 * silently discarding information the caller thought they were sending.
 */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Matches a calendar month, `YYYY-MM`.
 *
 * Budget goals are accepted as a month rather than a date, so a caller cannot express something the schema
 * forbids: `period_month` stores the first of the month and a check constraint enforces it, which would
 * make `2026-08-17` a request the database must reject. {@link startOfMonth} expands the accepted value.
 */
export const ISO_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Formats a `Date` as the `YYYY-MM-DD` string the schema stores. */
export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Parses a `YYYY-MM-DD` string to a `Date` at UTC midnight. */
export function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Today, as `YYYY-MM-DD`. */
export function today(): string {
  return toIsoDate(new Date());
}

/** Shifts a date string by whole days; `days` may be negative. */
export function addDays(value: string, days: number): string {
  return toIsoDate(new Date(fromIsoDate(value).getTime() + days * MS_PER_DAY));
}

/**
 * The first day of the month a date falls in — the canonical form of `BudgetGoal.periodMonth`.
 *
 * The database enforces the same rule with a check constraint, so a value that skips this helper is
 * rejected rather than quietly stored as a second representation of the same month.
 */
export function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

/** Whole days from `from` to `to`, negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / MS_PER_DAY);
}
