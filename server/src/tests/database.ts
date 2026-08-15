import { Client } from 'pg';
import type { DataSource } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { truncateDomainTables } from '../utils/database';

/**
 * The integration suite's database lifecycle.
 *
 * Integration tests run against a real PostgreSQL instance rather than a mock, because most of what
 * they exist to prove is enforced *by* PostgreSQL: the unique keys that stop a double award, the row
 * lock that stops an overdraft, the check constraints on money and dates. A fake would only assert
 * that the application asks for the right thing, not that the database refuses the wrong one.
 */

/**
 * Only a database whose name ends this way is treated as disposable.
 *
 * The suite truncates every domain table. `vitest.config.ts` points `DB_NAME` at `forge_test`, but a
 * stray `DB_NAME` in the environment could still redirect that at the database being demoed against —
 * so the destructive step refuses to run anywhere it does not recognise, rather than trusting the
 * configuration to be right.
 */
const DISPOSABLE_SUFFIX = '_test';

/**
 * Opens the connection, creating the database and applying the migrations if needed.
 *
 * Safe to call from every test file: after the first, the DataSource is already initialised and
 * `runMigrations` has nothing left to apply.
 *
 * The schema is built by running the generated migrations — the same ones the development database
 * uses — and never by `synchronize`. That keeps the course's code-first requirement true of the test
 * database too, and it means a migration that does not actually reproduce the entities fails the suite
 * rather than passing unnoticed.
 */
export async function connectTestDatabase(): Promise<DataSource> {
  assertDisposable();

  if (AppDataSource.isInitialized) return AppDataSource;

  await createDatabaseIfMissing();
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();

  return AppDataSource;
}

/** Empties every domain table, so a test file starts from a database it built entirely itself. */
export async function resetDatabase(): Promise<void> {
  assertDisposable();
  await truncateDomainTables(AppDataSource.manager);
}

export async function disconnectTestDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

function assertDisposable(): void {
  if (env.database.name.endsWith(DISPOSABLE_SUFFIX)) return;

  throw new Error(
    `Refusing to run integration tests against "${env.database.name}". They empty every domain ` +
      `table, and only a database whose name ends in "${DISPOSABLE_SUFFIX}" is treated as ` +
      `disposable. vitest.config.ts sets DB_NAME — check nothing has overridden it.`,
  );
}

/**
 * Creates the test database if it is not there yet.
 *
 * A database cannot be created from a connection to itself, so this borrows the `postgres` maintenance
 * database to issue the statement. It creates a database and no tables: the schema still comes only
 * from the entity classes, by way of the generated migrations that run immediately afterwards.
 */
async function createDatabaseIfMissing(): Promise<void> {
  const client = new Client({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: 'postgres',
  });

  await client.connect();

  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      env.database.name,
    ]);

    if (existing.rowCount === 0) {
      // A database name is an identifier, which cannot be a bind parameter. It is not user input —
      // `assertDisposable` has already checked it against a fixed suffix — and it is quoted so an
      // unusual but legal name still works.
      await client.query(`CREATE DATABASE "${env.database.name}"`);
    }
  } finally {
    await client.end();
  }
}
