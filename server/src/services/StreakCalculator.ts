import { addDays, daysBetween } from '../utils/date';

/**
 * Streak arithmetic over habit completion dates.
 *
 * Pure functions over `YYYY-MM-DD` strings — no database, no entities, no clock of their own. That is
 * deliberate: a streak decides how many points a user is paid, so it is the one piece of this codebase
 * that most needs to be exhaustively testable, and it is fully covered by unit tests.
 *
 * Nothing stores a streak. It is derived from `habit_completions` on every read, so it cannot drift away
 * from the log it summarises — the same reasoning as the points balance.
 */

export interface StreakSummary {
  /** The run still in progress, or 0 if it has lapsed. */
  current: number;
  /** The longest run ever recorded for this habit. */
  longest: number;
  lastCompletedOn: string | null;
}

/**
 * The length of the unbroken run of days ending exactly on `date`.
 *
 * This is what the streak bonus is keyed on, and the reason it is *this* rather than "the streak right
 * now" is order-independence. Completions may be backfilled, so a user might log days 8–13 and only then
 * fill in day 7. Measured as a run ending on day 7, that completion correctly closes a seven-day run and
 * earns its bonus; measured against the current streak at the moment of writing, it would not.
 *
 * Returns 0 when `date` itself has no completion.
 */
export function runLengthEndingOn(completedDates: readonly string[], date: string): number {
  const days = new Set(completedDates);
  if (!days.has(date)) return 0;

  let length = 0;
  let cursor = date;

  while (days.has(cursor)) {
    length += 1;
    cursor = addDays(cursor, -1);
  }

  return length;
}

/**
 * The current and longest streaks, as of `asOf` (normally today).
 *
 * A streak is *not* broken by having no completion today. Today is not over yet, so a run ending
 * yesterday is still alive and shows its full length — breaking it at midnight would tell a user they had
 * lost a nine-day streak at 9am on the tenth day. It lapses once a full day has been missed.
 */
export function summarizeStreak(completedDates: readonly string[], asOf: string): StreakSummary {
  if (completedDates.length === 0) {
    return { current: 0, longest: 0, lastCompletedOn: null };
  }

  // Not assumed sorted: callers may pass rows in whatever order the query returned them.
  const days = [...new Set(completedDates)].sort();
  const lastCompletedOn = days[days.length - 1] ?? null;

  return {
    current: lastCompletedOn === null ? 0 : currentRun(days, lastCompletedOn, asOf),
    longest: longestRun(days),
    lastCompletedOn,
  };
}

function currentRun(sortedDays: string[], lastCompletedOn: string, asOf: string): number {
  const daysSince = daysBetween(lastCompletedOn, asOf);

  // Ahead of `asOf` means a backfill window that has not arrived, or a clock disagreement. Either way the
  // run is live, so it is measured from its own end rather than discarded.
  if (daysSince > 1) return 0;

  return runLengthEndingOn(sortedDays, lastCompletedOn);
}

function longestRun(sortedDays: string[]): number {
  let longest = 0;
  let run = 0;
  let previous: string | null = null;

  for (const day of sortedDays) {
    run = previous !== null && daysBetween(previous, day) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  return longest;
}
