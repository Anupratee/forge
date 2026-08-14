import pg from 'pg';

/**
 * Makes the driver return PostgreSQL `date` columns as `YYYY-MM-DD` strings.
 *
 * By default `pg` parses a `date` into a JavaScript `Date` at *local* midnight — the exact conversion the
 * schema is designed to avoid, since a `date` has no time and no zone.
 *
 * TypeORM hides this when it hydrates an entity: a `type: 'date'` column is converted back to a string on
 * the way out. But a raw select — `getRawMany`, a `MAX(check_in_date)` aggregate, anything read outside
 * entity hydration — skips that conversion and hands back the `Date`. So `completedOn` would be a string in
 * one code path and a `Date` in another, with the same declared type of `string`.
 *
 * That is not a difference worth defending against at every call site; it is worth removing. Setting the
 * parser here means a `date` is a `YYYY-MM-DD` string everywhere, which is what every date helper, streak
 * calculation, and check-in comparison already assumes.
 *
 * Imported for its side effect by `data-source.ts`, before any connection is opened.
 */
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);
