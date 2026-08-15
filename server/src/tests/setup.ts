/**
 * Loaded before any test file, by `setupFiles` in `vitest.config.ts`.
 *
 * TypeORM's decorators call `Reflect.getMetadata` while an entity class is being *defined*, so the
 * polyfill has to be in place before the first entity module evaluates. A test file that imported an
 * entity ahead of the harness would otherwise decide the order by accident, and the failure — "no
 * metadata for User" — points nowhere near the import that caused it.
 */
import 'reflect-metadata';
