import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './error.middleware';
import { createRateLimiter } from './rate-limit.middleware';

/**
 * The limiter, on a throwaway app rather than the real one.
 *
 * `authRateLimiter` stands itself down under `NODE_ENV=test`, because every supertest request arrives
 * from the same address and a live limiter would start refusing the rest of the suite's logins. So the
 * middleware is proved here instead, built through the same factory with `skip` returning false — the
 * production code path, with a limit small enough to reach in three requests.
 */
function appWithLimit(limit: number) {
  const app = express();

  app.post(
    '/attempt',
    createRateLimiter({ windowMs: 60_000, limit, skip: () => false }),
    (_req, res) => {
      res.status(204).end();
    },
  );
  app.use(errorHandler);

  return app;
}

describe('createRateLimiter', () => {
  it('allows requests up to the limit and refuses the next one', async () => {
    const app = appWithLimit(2);

    await request(app).post('/attempt').expect(204);
    await request(app).post('/attempt').expect(204);

    const refused = await request(app).post('/attempt').expect(429);

    // Shaped by the error middleware like every other failure, so the client reads it with the same code.
    expect(refused.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('reports the remaining allowance in the standard header', async () => {
    const app = appWithLimit(3);

    const first = await request(app).post('/attempt').expect(204);

    // draft-8 `RateLimit`, not the deprecated `X-RateLimit-*` pair.
    expect(first.headers['ratelimit']).toContain('r=2');
    expect(first.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('does not count requests while skip returns true', async () => {
    const app = express();
    app.post(
      '/attempt',
      createRateLimiter({ windowMs: 60_000, limit: 1, skip: () => true }),
      (_req, res) => {
        res.status(204).end();
      },
    );

    // This is what the application's limiter does under test. If skipping ever stopped working, the
    // whole suite would start failing on its logins instead of failing here.
    await request(app).post('/attempt').expect(204);
    await request(app).post('/attempt').expect(204);
    await request(app).post('/attempt').expect(204);
  });
});
