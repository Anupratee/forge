import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, fromIsoDate, startOfMonth, toIsoDate } from './date';

/**
 * Every `date` column in the schema is zoneless and these helpers are the only code that converts, so a
 * mistake here shifts check-ins, streaks, and budget months by a day for anyone not sitting on UTC.
 */
describe('date helpers', () => {
  it('formats and parses a calendar date without shifting it', () => {
    expect(toIsoDate(fromIsoDate('2026-08-15'))).toBe('2026-08-15');
  });

  it('parses at UTC midnight rather than local midnight', () => {
    // The whole point of the string representation: a `date` has no zone, so parsing must not attach one.
    expect(fromIsoDate('2026-08-15').toISOString()).toBe('2026-08-15T00:00:00.000Z');
  });

  it('adds and subtracts whole days', () => {
    expect(addDays('2026-08-15', 1)).toBe('2026-08-16');
    expect(addDays('2026-08-15', -1)).toBe('2026-08-14');
    expect(addDays('2026-08-15', 0)).toBe('2026-08-15');
  });

  it('crosses month, year, and leap boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('is unaffected by daylight saving transitions', () => {
    // 29 March 2026 is a DST start in much of Europe. Local-time arithmetic would return the same day or
    // skip one; UTC arithmetic does not care.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('measures whole days between dates, signed', () => {
    expect(daysBetween('2026-08-15', '2026-08-18')).toBe(3);
    expect(daysBetween('2026-08-18', '2026-08-15')).toBe(-3);
    expect(daysBetween('2026-08-15', '2026-08-15')).toBe(0);
  });

  it('measures a full year including its leap day', () => {
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
    expect(daysBetween('2027-01-01', '2028-01-01')).toBe(365);
  });

  it('reduces any date to the first of its month', () => {
    expect(startOfMonth('2026-08-15')).toBe('2026-08-01');
    expect(startOfMonth('2026-08-01')).toBe('2026-08-01');
    expect(startOfMonth('2026-12-31')).toBe('2026-12-01');
  });
});
