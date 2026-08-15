import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppDataSource } from '../config/data-source';
import { Role, User, UserStatus } from '../entities/User';
import { verifyPassword } from '../utils/password';
import { connectTestDatabase, disconnectTestDatabase, resetDatabase } from './database';
import { FIXTURE_PASSWORD, api, bearer, bodyOf, createAccount } from './fixtures';

/**
 * Registration and sign-in.
 *
 * The RBAC matrix mints its tokens directly, so that a test about authorization does not fail because
 * login broke. This file is the other half: it proves the tokens those tests assume can actually be
 * obtained, and that the credential handling behind them holds — a password is stored hashed, is never
 * returned, and a suspended account cannot trade one for a token.
 */

beforeAll(async () => {
  await connectTestDatabase();
  await resetDatabase();
}, 60_000);

afterAll(disconnectTestDatabase);

const NEW_ACCOUNT = {
  email: 'newcomer@forge.test',
  password: 'Forge!2026',
  displayName: 'New Comer',
};

describe('registration', () => {
  it('creates an account and returns a usable token', async () => {
    const response = await api().post('/api/auth/register').send(NEW_ACCOUNT).expect(201);

    expect(response.body).toMatchObject({
      user: { email: NEW_ACCOUNT.email, role: Role.USER },
    });

    const { token } = bodyOf<{ token: string }>(response);

    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    expect(me.body).toMatchObject({ email: NEW_ACCOUNT.email });
  });

  it('stores the password hashed, and never returns it', async () => {
    const stored = await AppDataSource.getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: NEW_ACCOUNT.email })
      .getOneOrFail();

    // bcrypt at cost 12: a 60-character digest that is not the password, and verifies against it.
    expect(stored.passwordHash).not.toContain(NEW_ACCOUNT.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword(NEW_ACCOUNT.password, stored.passwordHash)).toBe(true);

    // `select: false` on the column keeps it out of every ordinary read, so a controller cannot leak
    // it by forgetting to strip it.
    const response = await api()
      .post('/api/auth/login')
      .send({ email: NEW_ACCOUNT.email, password: NEW_ACCOUNT.password })
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain('$2b$');
    expect(bodyOf<{ user: object }>(response).user).not.toHaveProperty('passwordHash');
  });

  it('refuses a second account on the same email', async () => {
    await api().post('/api/auth/register').send(NEW_ACCOUNT).expect(409);
  });

  it('refuses to let a registration choose its own role', async () => {
    // The DTO does not declare `role`, and `forbidNonWhitelisted` turns sending one into a 400 rather
    // than a silently ignored field — which would be indistinguishable from a successful escalation.
    await api()
      .post('/api/auth/register')
      .send({ ...NEW_ACCOUNT, email: 'climber@forge.test', role: Role.ADMIN })
      .expect(400);
  });
});

describe('sign-in', () => {
  it('gives the same answer to an unknown email and a wrong password', async () => {
    const unknown = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@forge.test', password: FIXTURE_PASSWORD })
      .expect(401);

    const wrong = await api()
      .post('/api/auth/login')
      .send({ email: NEW_ACCOUNT.email, password: 'Wrong!2026' })
      .expect(401);

    // Distinguishing them would turn the login form into a way to enumerate who has an account here.
    expect(bodyOf<{ message: string }>(unknown).message).toBe(
      bodyOf<{ message: string }>(wrong).message,
    );
  });

  it('refuses a suspended account, and lets it back in when reactivated', async () => {
    const admin = await createAccount({ role: Role.ADMIN });
    const suspended = await createAccount({ role: Role.USER });

    await api()
      .patch(`/api/admin/users/${suspended.id}/status`)
      .set('Authorization', bearer(admin))
      .send({ status: UserStatus.SUSPENDED })
      .expect(200);

    await api()
      .post('/api/auth/login')
      .send({ email: suspended.email, password: FIXTURE_PASSWORD })
      .expect(401);

    await api()
      .patch(`/api/admin/users/${suspended.id}/status`)
      .set('Authorization', bearer(admin))
      .send({ status: UserStatus.ACTIVE })
      .expect(200);

    await api()
      .post('/api/auth/login')
      .send({ email: suspended.email, password: FIXTURE_PASSWORD })
      .expect(200);
  });

  it('matches an email regardless of how it was capitalised', async () => {
    await api()
      .post('/api/auth/login')
      .send({ email: NEW_ACCOUNT.email.toUpperCase(), password: NEW_ACCOUNT.password })
      .expect(200);
  });
});
