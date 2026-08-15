import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Tests get their own database, and the name is a constant rather than a setting.
 *
 * `npm test` truncates every domain table between test files. Pointing that at the database being
 * demoed against would wipe the seed mid-demo, so the safest arrangement is one the developer cannot
 * misconfigure: the name is fixed here, the harness refuses to run against anything not ending in
 * `_test`, and the database is created on first use if it is missing.
 */
const TEST_DATABASE = 'forge_test';

export default defineConfig({
  /**
   * Vitest transpiles with esbuild, which does not implement `emitDecoratorMetadata` — it strips the
   * type information TypeORM's decorators read to infer a column's type, so an entity loaded under the
   * default transform registers no metadata and every repository call fails. SWC implements it, so the
   * transform is swapped wholesale rather than worked around.
   *
   * Until this was in place the unit tests had to stay on pure modules with no entity imports. That
   * constraint is what kept the integration tests out of the suite, and it is lifted here.
   */
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],

  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],

    /**
     * `NODE_ENV=test` also stands the auth rate limiter down — every supertest request arrives from the
     * same address, so a live limiter would start refusing the suite's own logins. The limiter has its
     * own test, which builds one that does not skip.
     *
     * These are applied before a test file loads, and `dotenv` does not overwrite a variable that is
     * already set, so they win over the repository's `.env`.
     */
    env: {
      NODE_ENV: 'test',
      DB_NAME: TEST_DATABASE,
    },

    /**
     * One file at a time. The integration tests share a single database and each truncates it before
     * building its fixtures, so running two files at once would have them deleting each other's rows.
     * Isolating them per file instead would mean a database per worker, which costs more than the
     * parallelism is worth at this size.
     */
    fileParallelism: false,

    // First run creates the database and applies every migration; bcrypt at cost 12 is slow by design.
    hookTimeout: 60_000,
  },
});
