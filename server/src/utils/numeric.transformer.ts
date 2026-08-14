import type { ValueTransformer } from 'typeorm';

/**
 * The largest value a `numeric(12, 2)` column holds: ten integer digits and two decimal places.
 *
 * DTOs bound money against this so an over-large amount is a 400 that names the field, rather than a
 * numeric-overflow error from PostgreSQL surfacing as a generic 500.
 */
export const MAX_MONEY_AMOUNT = 9_999_999_999.99;

/**
 * Maps a PostgreSQL `numeric` column to a JavaScript `number`.
 *
 * The `pg` driver returns `numeric` as a string, because the type is arbitrary-precision and a
 * double cannot represent all of it. Every money column here is `numeric(12, 2)` — ten integer
 * digits at most — which IEEE-754 represents exactly at two decimal places, so converting is safe
 * and keeps callers out of string arithmetic.
 *
 * Money is still never *summed* in JavaScript: totals come from SQL aggregates, where PostgreSQL
 * does the arithmetic in `numeric` and only the result crosses this boundary.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};
