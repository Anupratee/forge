/**
 * Display formatting, in one place.
 *
 * The rule this file exists to enforce: **a calendar date is never put through `new Date()`**.
 * `2026-08-15` parsed as a `Date` becomes midnight UTC, which in any negative offset renders as the
 * 14th. Every date the API returns is a zoneless calendar day — the day a habit was completed, the day
 * money was spent — so they are formatted by splitting the string, not by parsing it.
 *
 * Timestamps (`createdAt`, `joinedAt`) are genuine instants and *are* parsed, because for those the
 * viewer's local time is the correct answer.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** `2026-08-15` → `15 Aug 2026`. Never parsed as a `Date`. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (year === undefined || month === undefined || day === undefined) return isoDate;

  const name = MONTHS[Number(month) - 1];
  if (name === undefined) return isoDate;

  return `${Number(day)} ${name.slice(0, 3)} ${year}`;
}

/** `2026-08` → `August 2026`. */
export function formatMonth(isoMonth: string): string {
  const [year, month] = isoMonth.split('-');
  if (year === undefined || month === undefined) return isoMonth;

  const name = MONTHS[Number(month) - 1];
  return name === undefined ? isoMonth : `${name} ${year}`;
}

/** A real instant, so the viewer's timezone is what they want to see. */
export function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Today as `YYYY-MM-DD` in the viewer's own calendar — what a date input expects as its max. */
export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** The current month as `YYYY-MM`. */
export function currentMonthIso(): string {
  return todayIso().slice(0, 7);
}

/**
 * Money, to two decimal places.
 *
 * The server does every sum in SQL `numeric` and sends the result; this only prints it. Nothing in the
 * client adds two amounts together — a running total assembled from floats is exactly the drift the
 * `numeric` columns exist to prevent.
 */
export function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Points are whole numbers, and a signed ledger amount should show its sign. */
export function formatPoints(amount: number, { signed = false } = {}): string {
  const rendered = Math.abs(amount).toLocaleString();
  if (!signed) return amount.toLocaleString();
  return `${amount < 0 ? '−' : '+'}${rendered}`;
}

/**
 * `PENDING_APPROVAL` → `Pending approval`.
 *
 * Screaming-snake enum values are how the API spells them and how they must be sent back, so this
 * converts for display only — the value bound to a `<select>` is always the original.
 */
export function toTitle(value: string): string {
  const spaced = value.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `1 day` / `12 days` — pluralisation, once. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

/** Inclusive span between two calendar days, both `YYYY-MM-DD`. Computed in UTC so no offset shifts it. */
export function daysBetweenInclusive(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;

  return Math.floor((end - start) / 86_400_000) + 1;
}
