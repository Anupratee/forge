import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Role } from '../entities/User';
import type { FieldFailure } from '../middlewares/validate.middleware';
import { connectTestDatabase, disconnectTestDatabase, resetDatabase } from './database';
import { api, bearer, bodyOf, createAccount } from './fixtures';
import type { TestAccount } from './fixtures';

/**
 * Requests that are wrong rather than forbidden.
 *
 * A client mistake must come back as a 4xx that says what was wrong. A 500 is not a cosmetic
 * difference: it tells the caller the server broke, it hides the actual problem, and it puts a stack
 * trace in the log for something that was never a fault. Two of these cases *were* 500s until the RBAC
 * matrix sent every route without a body and found them — which is the whole reason a matrix that
 * checks the routes a role is allowed to reach, and not only the ones it is refused, earns its keep.
 */

let user: TestAccount;

beforeAll(async () => {
  await connectTestDatabase();
  await resetDatabase();
  user = await createAccount({ role: Role.USER });
}, 60_000);

afterAll(disconnectTestDatabase);

describe('a body that is not what the route expects', () => {
  it('reports a missing body as the missing fields it implies', async () => {
    const response = await api().post('/api/habits').set('Authorization', bearer(user)).expect(400);

    // Not "you sent nothing" — an absent body is treated as an empty one, so the DTO's own rules
    // answer, and the client gets the same field-level messages it would for a half-filled form.
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(bodyOf<{ details: FieldFailure[] }>(response).details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
    );
  });

  it('accepts an absent body where every field is optional', async () => {
    // The reason a missing body becomes `{}` rather than a refusal: checking in with nothing to say is
    // a legitimate request, and a blanket "body required" would have broken it.
    const response = await api()
      .post(`/api/challenges/${randomUUID()}/check-ins`)
      .set('Authorization', bearer(user));

    // 404 for the unknown challenge — which means it got past validation, as it should have.
    expect(response.status).toBe(404);
  });

  it('refuses malformed JSON without calling it a server error', async () => {
    const response = await api()
      .post('/api/habits')
      .set('Authorization', bearer(user))
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Request body is not valid JSON',
    });
  });

  it('refuses a body that parses but is not an object', async () => {
    const response = await api()
      .post('/api/habits')
      .set('Authorization', bearer(user))
      .set('Content-Type', 'application/json')
      .send('[1, 2, 3]')
      .expect(400);

    expect(response.body).toMatchObject({ message: 'Request body must be a JSON object' });
  });

  it('refuses a body larger than the limit as a 413, not a 500', async () => {
    const response = await api()
      .post('/api/habits')
      .set('Authorization', bearer(user))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(2 * 1024 * 1024) }))
      .expect(413);

    expect(response.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });
});

describe('a path that is not what the route expects', () => {
  it('refuses an id that is not a UUID before it reaches PostgreSQL', async () => {
    // Without `validateUuidParam` this reaches the database as `WHERE id = 'not-a-uuid'`, which is a
    // type error there and a generic 500 here.
    const response = await api()
      .get('/api/habits/not-a-uuid')
      .set('Authorization', bearer(user))
      .expect(400);

    expect(response.body).toMatchObject({ message: 'id must be a UUID' });
  });

  it('answers an unmatched route with the same envelope as any other failure', async () => {
    const response = await api()
      .get('/api/nothing-here')
      .set('Authorization', bearer(user))
      .expect(404);

    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('answers a missing upload with a 404 rather than a filesystem error', async () => {
    // `express.static` with `fallthrough: false` reports a miss by passing on a raw ENOENT, which the
    // shared error handler cannot recognise. A referenced image that is simply gone is a not-found.
    const response = await api().get('/uploads/covers/does-not-exist.png').expect(404);

    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('an unknown query parameter', () => {
  it('is reported rather than quietly ignored', async () => {
    // `forbidNonWhitelisted` again: a filter that silently does nothing looks identical to a filter
    // that found no matches, and a misspelled one would be debugged for a long time.
    const response = await api()
      .get('/api/habits?catgeory=HEALTH')
      .set('Authorization', bearer(user))
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
