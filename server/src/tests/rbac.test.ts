import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppDataSource } from '../config/data-source';
import { BudgetGoal } from '../entities/BudgetGoal';
import { ChallengeStatus } from '../entities/Challenge';
import { Expense, ExpenseCategory } from '../entities/Expense';
import { Role, User, UserStatus } from '../entities/User';
import { startOfMonth, today } from '../utils/date';
import { connectTestDatabase, disconnectTestDatabase, resetDatabase } from './database';
import { api, bearer, createAccount, createChallenge, createHabit } from './fixtures';
import type { TestAccount } from './fixtures';

/**
 * Authorization, asserted against the API rather than the interface.
 *
 * The course requires that access control be enforced at the API level and not only in the frontend,
 * and the only way to show that is to bypass the frontend entirely: these tests hold a token and call
 * the endpoint directly, which is exactly what someone circumventing the UI would do. `RequireRole` in
 * the client says in its own docblock that it is UX; this file is the part that is security.
 *
 * Three things are proved here, and they are different claims:
 *
 * 1. **The role matrix** — every protected route refuses every role it does not name, and admits the
 *    ones it does. The second half matters as much as the first: without it, a route that refuses
 *    everybody would pass.
 * 2. **Identity is re-read, not remembered** — suspending or demoting an account takes effect on its
 *    next request, not when its token happens to expire.
 * 3. **Ownership** — a role gate alone would let any Creator read any other Creator's participants,
 *    and says nothing at all about one User reading another's private data.
 */

const ROLES = [Role.ADMIN, Role.CREATOR, Role.USER] as const;

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface ProtectedRoute {
  method: Method;
  path: string;
  /** The roles the route names. Every other role must be refused. */
  allow: Role[];
}

/** Stands in for a real id. Every route gates on role before it validates or looks anything up. */
const SOME_ID = randomUUID();

/**
 * Every route that names a role, transcribed from `routes/`.
 *
 * Written out rather than derived from the router, deliberately. A matrix generated from the same
 * `authorize` calls it is checking would agree with the code by construction and prove nothing — it
 * would still pass if a guard were deleted. This list is a second, independent statement of what the
 * API is supposed to allow, so the two have to be changed together for a test to keep passing.
 */
const PROTECTED_ROUTES: ProtectedRoute[] = [
  // Admin governance
  { method: 'get', path: '/api/admin/summary', allow: [Role.ADMIN] },
  { method: 'get', path: '/api/admin/users', allow: [Role.ADMIN] },
  { method: 'patch', path: `/api/admin/users/${SOME_ID}/status`, allow: [Role.ADMIN] },
  { method: 'patch', path: `/api/admin/users/${SOME_ID}/role`, allow: [Role.ADMIN] },

  // Challenge approval
  { method: 'get', path: '/api/challenges/pending-approval', allow: [Role.ADMIN] },
  { method: 'post', path: `/api/challenges/${SOME_ID}/approve`, allow: [Role.ADMIN] },
  { method: 'post', path: `/api/challenges/${SOME_ID}/reject`, allow: [Role.ADMIN] },

  // Store curation
  { method: 'get', path: '/api/rewards/manage', allow: [Role.ADMIN] },
  { method: 'post', path: '/api/rewards/manage', allow: [Role.ADMIN] },
  { method: 'patch', path: `/api/rewards/manage/${SOME_ID}`, allow: [Role.ADMIN] },
  { method: 'delete', path: `/api/rewards/manage/${SOME_ID}`, allow: [Role.ADMIN] },

  // Challenge authoring
  { method: 'get', path: '/api/challenges/authored', allow: [Role.CREATOR] },
  { method: 'post', path: '/api/challenges', allow: [Role.CREATOR] },
  { method: 'patch', path: `/api/challenges/${SOME_ID}`, allow: [Role.CREATOR] },
  { method: 'delete', path: `/api/challenges/${SOME_ID}`, allow: [Role.CREATOR] },
  { method: 'post', path: `/api/challenges/${SOME_ID}/submit`, allow: [Role.CREATOR] },
  { method: 'get', path: `/api/challenges/${SOME_ID}/participants`, allow: [Role.CREATOR] },

  // Participation
  { method: 'get', path: '/api/challenges/joined', allow: [Role.USER] },
  { method: 'post', path: `/api/challenges/${SOME_ID}/join`, allow: [Role.USER] },
  { method: 'post', path: `/api/challenges/${SOME_ID}/check-ins`, allow: [Role.USER] },

  // Habits — private, and the specification is explicit that no Admin or Creator route reaches them
  { method: 'get', path: '/api/habits', allow: [Role.USER] },
  { method: 'post', path: '/api/habits', allow: [Role.USER] },
  { method: 'get', path: `/api/habits/${SOME_ID}`, allow: [Role.USER] },
  { method: 'patch', path: `/api/habits/${SOME_ID}`, allow: [Role.USER] },
  { method: 'delete', path: `/api/habits/${SOME_ID}`, allow: [Role.USER] },
  { method: 'post', path: `/api/habits/${SOME_ID}/completions`, allow: [Role.USER] },

  // Budgets — likewise private
  { method: 'get', path: '/api/budgets', allow: [Role.USER] },
  { method: 'get', path: '/api/budgets/summary', allow: [Role.USER] },
  { method: 'post', path: '/api/budgets', allow: [Role.USER] },
  { method: 'get', path: `/api/budgets/${SOME_ID}`, allow: [Role.USER] },
  { method: 'patch', path: `/api/budgets/${SOME_ID}`, allow: [Role.USER] },
  { method: 'delete', path: `/api/budgets/${SOME_ID}`, allow: [Role.USER] },
  { method: 'post', path: `/api/budgets/${SOME_ID}/adherence-claim`, allow: [Role.USER] },

  // Expenses — likewise private, including both import steps
  { method: 'get', path: '/api/expenses', allow: [Role.USER] },
  { method: 'post', path: '/api/expenses', allow: [Role.USER] },
  { method: 'get', path: '/api/expenses/import/options', allow: [Role.USER] },
  { method: 'post', path: '/api/expenses/import/csv', allow: [Role.USER] },
  { method: 'post', path: '/api/expenses/import/statement', allow: [Role.USER] },
  { method: 'post', path: '/api/expenses/import/confirm', allow: [Role.USER] },
  { method: 'get', path: `/api/expenses/${SOME_ID}`, allow: [Role.USER] },
  { method: 'patch', path: `/api/expenses/${SOME_ID}`, allow: [Role.USER] },
  { method: 'delete', path: `/api/expenses/${SOME_ID}`, allow: [Role.USER] },

  // Spending and wearing
  { method: 'get', path: '/api/rewards/redemptions', allow: [Role.USER] },
  { method: 'put', path: '/api/rewards/equipped', allow: [Role.USER] },
  { method: 'post', path: `/api/rewards/${SOME_ID}/redeem`, allow: [Role.USER] },
];

/** Routes open to any signed-in account. They still must refuse a caller with no token at all. */
const AUTHENTICATED_ROUTES: { method: Method; path: string }[] = [
  { method: 'get', path: '/api/auth/me' },
  { method: 'patch', path: '/api/auth/me' },
  { method: 'get', path: '/api/challenges' },
  { method: 'get', path: `/api/challenges/${SOME_ID}` },
  { method: 'get', path: '/api/rewards' },
  { method: 'get', path: '/api/points/balance' },
  { method: 'get', path: '/api/points/ledger' },
  { method: 'get', path: '/api/leaderboard' },
];

const accounts = {} as Record<Role, TestAccount>;

beforeAll(async () => {
  await connectTestDatabase();
  await resetDatabase();

  accounts[Role.ADMIN] = await createAccount({ role: Role.ADMIN });
  accounts[Role.CREATOR] = await createAccount({ role: Role.CREATOR });
  accounts[Role.USER] = await createAccount({ role: Role.USER });
}, 60_000);

afterAll(disconnectTestDatabase);

function send(route: { method: Method; path: string }, account?: TestAccount) {
  const pending = api()[route.method](route.path);
  return account === undefined ? pending : pending.set('Authorization', bearer(account));
}

describe('the role matrix', () => {
  for (const route of PROTECTED_ROUTES) {
    const label = `${route.method.toUpperCase()} ${route.path.replace(SOME_ID, ':id')}`;

    for (const role of ROLES.filter((candidate) => !route.allow.includes(candidate))) {
      it(`${label} refuses ${role}`, async () => {
        const response = await send(route, accounts[role]);

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
      });
    }

    for (const role of route.allow) {
      /**
       * The control on the refusals above. A route that answered 403 to everyone would satisfy the
       * negative half of the matrix perfectly, so each allowed role has to get *past* the gate.
       *
       * What comes after the gate is not this file's business: most of these are sent without a body
       * or with an id that does not exist, so 400 and 404 are correct answers and are accepted. A 5xx
       * is not — that would mean the route broke rather than declined.
       */
      it(`${label} admits ${role}`, async () => {
        const response = await send(route, accounts[role]);

        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);
        expect(response.status).toBeLessThan(500);
      });
    }
  }
});

describe('a caller with no token', () => {
  for (const route of [...PROTECTED_ROUTES, ...AUTHENTICATED_ROUTES]) {
    const label = `${route.method.toUpperCase()} ${route.path.replace(SOME_ID, ':id')}`;

    it(`${label} requires authentication`, async () => {
      const response = await send(route);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  }
});

describe('routes open to any signed-in account', () => {
  for (const route of AUTHENTICATED_ROUTES) {
    for (const role of ROLES) {
      it(`${route.method.toUpperCase()} ${route.path.replace(SOME_ID, ':id')} admits ${role}`, async () => {
        const response = await send(route, accounts[role]);

        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);
        expect(response.status).toBeLessThan(500);
      });
    }
  }
});

describe('a token is not an identity', () => {
  it('stops working the moment the account is suspended', async () => {
    const user = await createAccount({ role: Role.USER });

    await api().get('/api/habits').set('Authorization', bearer(user)).expect(200);

    await AppDataSource.getRepository(User).update(user.id, { status: UserStatus.SUSPENDED });

    // The same token, unexpired and correctly signed. `authenticate` re-reads status every request,
    // so suspension takes effect now rather than whenever the token would have run out.
    const refused = await api().get('/api/habits').set('Authorization', bearer(user)).expect(401);
    expect(refused.body).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('loses the old role the moment an Admin changes it', async () => {
    const creator = await createAccount({ role: Role.CREATOR });

    await api().get('/api/challenges/authored').set('Authorization', bearer(creator)).expect(200);

    await api()
      .patch(`/api/admin/users/${creator.id}/role`)
      .set('Authorization', bearer(accounts[Role.ADMIN]))
      .send({ role: Role.USER })
      .expect(200);

    // The token still carries `role: CREATOR`. Authorization reads the account, never the claim.
    await api().get('/api/challenges/authored').set('Authorization', bearer(creator)).expect(403);
  });

  it('refuses a token that was not signed by us', async () => {
    const forged = `${accounts[Role.ADMIN].token.slice(0, -4)}beef`;

    await api().get('/api/admin/summary').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('refuses a token presented without the Bearer scheme', async () => {
    await api()
      .get('/api/admin/summary')
      .set('Authorization', accounts[Role.ADMIN].token)
      .expect(401);
  });
});

describe('ownership, which a role gate cannot express', () => {
  it('hides one Creator’s participants from another Creator', async () => {
    const owner = await createAccount({ role: Role.CREATOR });
    const other = await createAccount({ role: Role.CREATOR });

    const published = await createChallenge({
      createdById: owner.id,
      status: ChallengeStatus.APPROVED,
      approvedById: accounts[Role.ADMIN].id,
    });

    await api()
      .get(`/api/challenges/${published.id}/participants`)
      .set('Authorization', bearer(owner))
      .expect(200);

    // 403, not 404: an approved challenge is already visible to everyone through `GET /challenges/:id`,
    // so refusing by existence would hide nothing and only mislead. What is protected here is the
    // participant list, and the answer says exactly that.
    await api()
      .get(`/api/challenges/${published.id}/participants`)
      .set('Authorization', bearer(other))
      .expect(403);
  });

  it('will not confirm an unpublished challenge exists by refusing it', async () => {
    const owner = await createAccount({ role: Role.CREATOR });
    const other = await createAccount({ role: Role.CREATOR });
    const draft = await createChallenge({ createdById: owner.id, status: ChallengeStatus.DRAFT });

    // The mirror of the case above, and the reason the two differ. Nothing has published this
    // challenge, so a 403 would tell a rival Creator that a challenge with this id exists — which
    // `GET /challenges/:id` correctly refuses to tell them.
    await api()
      .get(`/api/challenges/${draft.id}/participants`)
      .set('Authorization', bearer(other))
      .expect(404);
  });

  it('hides an unapproved challenge from everyone but its author and an Admin', async () => {
    const owner = await createAccount({ role: Role.CREATOR });
    const other = await createAccount({ role: Role.CREATOR });
    const draft = await createChallenge({ createdById: owner.id, status: ChallengeStatus.DRAFT });

    await api().get(`/api/challenges/${draft.id}`).set('Authorization', bearer(owner)).expect(200);
    await api().get(`/api/challenges/${draft.id}`).set('Authorization', bearer(other)).expect(404);
    await api()
      .get(`/api/challenges/${draft.id}`)
      .set('Authorization', bearer(accounts[Role.USER]))
      .expect(404);
  });

  it('hides one User’s habit from another User', async () => {
    const owner = await createAccount({ role: Role.USER });
    const other = await createAccount({ role: Role.USER });
    const habit = await createHabit({ userId: owner.id });

    await api().get(`/api/habits/${habit.id}`).set('Authorization', bearer(owner)).expect(200);
    await api().get(`/api/habits/${habit.id}`).set('Authorization', bearer(other)).expect(404);

    // Writing to it is refused the same way, and the row is untouched.
    await api()
      .patch(`/api/habits/${habit.id}`)
      .set('Authorization', bearer(other))
      .send({ name: 'Renamed by a stranger' })
      .expect(404);
  });

  it('hides one User’s budget and expenses from another User', async () => {
    const owner = await createAccount({ role: Role.USER });
    const other = await createAccount({ role: Role.USER });

    const goal = await AppDataSource.getRepository(BudgetGoal).save({
      title: 'Private goal',
      category: ExpenseCategory.FOOD,
      periodMonth: startOfMonth(today()),
      limitAmount: 5000,
      userId: owner.id,
    });

    const expense = await AppDataSource.getRepository(Expense).save({
      title: 'Private expense',
      amount: 250,
      category: ExpenseCategory.FOOD,
      spentOn: today(),
      userId: owner.id,
    });

    await api().get(`/api/budgets/${goal.id}`).set('Authorization', bearer(other)).expect(404);
    await api().get(`/api/expenses/${expense.id}`).set('Authorization', bearer(other)).expect(404);
    await api()
      .delete(`/api/expenses/${expense.id}`)
      .set('Authorization', bearer(other))
      .expect(404);

    // Still there, so the refusal was a refusal and not a silent success.
    await api().get(`/api/expenses/${expense.id}`).set('Authorization', bearer(owner)).expect(200);
  });
});

describe('escalation through a route that is allowed', () => {
  it('refuses a role or status smuggled into a profile update', async () => {
    const user = await createAccount({ role: Role.USER });

    for (const forbidden of [
      { role: Role.ADMIN },
      { status: UserStatus.ACTIVE },
      { email: 'x@y.z' },
    ]) {
      // 400, not a quietly discarded field. `forbidNonWhitelisted` on a DTO that never gained these
      // properties is the whole guard, and a silent drop would look identical to a successful attack.
      await api()
        .patch('/api/auth/me')
        .set('Authorization', bearer(user))
        .send({ displayName: 'Legitimate', ...forbidden })
        .expect(400);
    }

    const unchanged = await AppDataSource.getRepository(User).findOneByOrFail({ id: user.id });
    expect(unchanged.role).toBe(Role.USER);
  });

  it('refuses an Admin suspending or demoting themselves', async () => {
    const admin = accounts[Role.ADMIN];

    await api()
      .patch(`/api/admin/users/${admin.id}/status`)
      .set('Authorization', bearer(admin))
      .send({ status: UserStatus.SUSPENDED })
      .expect(400);

    await api()
      .patch(`/api/admin/users/${admin.id}/role`)
      .set('Authorization', bearer(admin))
      .send({ role: Role.USER })
      .expect(400);

    // These two refusals are what guarantee an active Admin always remains — see AdminService.setRole.
    const stillAdmin = await AppDataSource.getRepository(User).findOneByOrFail({ id: admin.id });
    expect(stillAdmin.role).toBe(Role.ADMIN);
    expect(stillAdmin.status).toBe(UserStatus.ACTIVE);
  });

  it('refuses a Creator approving their own challenge', async () => {
    const creator = await createAccount({ role: Role.CREATOR });
    const challenge = await createChallenge({
      createdById: creator.id,
      status: ChallengeStatus.PENDING_APPROVAL,
    });

    await api()
      .post(`/api/challenges/${challenge.id}/approve`)
      .set('Authorization', bearer(creator))
      .expect(403);
  });
});
