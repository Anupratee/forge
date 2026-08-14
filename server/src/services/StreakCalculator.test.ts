import { describe, expect, it } from 'vitest';
import { runLengthEndingOn, summarizeStreak } from './StreakCalculator';

/**
 * These functions decide how many points a user is paid, so the cases below are deliberately
 * exhaustive — including the calendar boundaries that a naive day-arithmetic implementation gets wrong.
 */
describe('summarizeStreak', () => {
  const today = '2026-08-15';

  it('reports nothing for a habit with no completions', () => {
    expect(summarizeStreak([], today)).toEqual({
      current: 0,
      longest: 0,
      lastCompletedOn: null,
    });
  });

  it('counts a single completion today as a streak of one', () => {
    expect(summarizeStreak([today], today)).toEqual({
      current: 1,
      longest: 1,
      lastCompletedOn: today,
    });
  });

  it('keeps a streak alive when the last completion was yesterday', () => {
    // Today is not over. Breaking the streak now would tell a user at 9am that they had already lost it.
    expect(summarizeStreak(['2026-08-13', '2026-08-14'], today).current).toBe(2);
  });

  it('lapses a streak once a full day has been missed', () => {
    const summary = summarizeStreak(['2026-08-12', '2026-08-13'], today);
    expect(summary.current).toBe(0);
    // The history is still there, which is what the longest streak reports.
    expect(summary.longest).toBe(2);
  });

  it('counts a run of consecutive days ending today', () => {
    const week = [
      '2026-08-09',
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
    ];
    expect(summarizeStreak(week, today)).toEqual({
      current: 7,
      longest: 7,
      lastCompletedOn: '2026-08-15',
    });
  });

  it('separates the current run from a longer earlier one', () => {
    const dates = [
      // A four-day run in July...
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      // ...then a gap, then two days ending today.
      '2026-08-14',
      '2026-08-15',
    ];
    expect(summarizeStreak(dates, today)).toEqual({
      current: 2,
      longest: 4,
      lastCompletedOn: '2026-08-15',
    });
  });

  it('does not require the input to be sorted', () => {
    const shuffled = ['2026-08-15', '2026-08-13', '2026-08-14'];
    expect(summarizeStreak(shuffled, today).current).toBe(3);
  });

  it('tolerates duplicate dates', () => {
    // The unique key on (habit_id, completed_on) makes this impossible through the API, but a streak that
    // silently double-counts would be a very quiet bug if that ever changed.
    expect(summarizeStreak(['2026-08-14', '2026-08-14', '2026-08-15'], today).current).toBe(2);
  });

  it('counts across a month boundary', () => {
    expect(summarizeStreak(['2026-07-30', '2026-07-31', '2026-08-01'], '2026-08-01').current).toBe(
      3,
    );
  });

  it('counts across a year boundary', () => {
    expect(summarizeStreak(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01').current).toBe(
      3,
    );
  });

  it('counts across a leap day', () => {
    // 2028 is a leap year: 28 Feb, 29 Feb, 1 Mar are three consecutive days.
    expect(summarizeStreak(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01').current).toBe(
      3,
    );
  });

  it('does not invent a leap day in a common year', () => {
    // 2027 has no 29 February, so 28 Feb and 1 Mar are consecutive.
    expect(summarizeStreak(['2027-02-28', '2027-03-01'], '2027-03-01').current).toBe(2);
  });
});

describe('runLengthEndingOn', () => {
  it('returns zero when the day itself has no completion', () => {
    expect(runLengthEndingOn(['2026-08-14'], '2026-08-15')).toBe(0);
  });

  it('measures the run ending on the given day, ignoring later days', () => {
    const dates = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'];
    expect(runLengthEndingOn(dates, '2026-08-12')).toBe(3);
  });

  it('closes a seven-day run when a missing middle day is backfilled', () => {
    // The case the streak bonus depends on: days 1-6 and 8-13 are logged, then day 7 arrives late.
    // Measured as a run ending on day 7, that completion legitimately completes a week.
    const days = [
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-08',
      '2026-08-09',
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      // filled in last
      '2026-08-07',
    ];
    expect(runLengthEndingOn(days, '2026-08-07')).toBe(7);
    // And the whole stretch is now unbroken, so the next bonus falls due on day 14.
    expect(runLengthEndingOn(days, '2026-08-13')).toBe(13);
  });

  it('is unaffected by the order of the input', () => {
    expect(runLengthEndingOn(['2026-08-12', '2026-08-10', '2026-08-11'], '2026-08-12')).toBe(3);
  });
});
