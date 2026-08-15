import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppDataSource } from '../config/data-source';
import { ChallengeStatus } from '../entities/Challenge';
import { PointsLedger } from '../entities/PointsLedger';
import { Redemption } from '../entities/Redemption';
import { RewardItem, RewardItemType } from '../entities/RewardItem';
import { Role } from '../entities/User';
import { PointsPolicy } from '../services/PointsPolicy';
import { today } from '../utils/date';
import { connectTestDatabase, disconnectTestDatabase, resetDatabase } from './database';
import {
  api,
  bearer,
  createAccount,
  createChallenge,
  createHabit,
  createRewardItem,
  grantPoints,
  ledgerBalance,
  ledgerRowCount,
} from './fixtures';
import type { TestAccount } from './fixtures';

/**
 * The invariants that hold the points economy together.
 *
 * These are the rules that would be most expensive to get wrong and least likely to be noticed: points
 * awarded twice for one action, or spent twice from one balance, leave a ledger that still adds up and
 * a user who is quietly richer than they earned.
 *
 * Every one of them is enforced by PostgreSQL rather than by an application check — unique keys for the
 * double award, a row lock for the double spend — because an application check is a read followed by a
 * write, and two concurrent requests both pass the read. So each of these tests has a companion that
 * fires the same request twice *at once*: a sequential test would pass against a naive implementation
 * and prove nothing about the guarantee that actually matters.
 */

let admin: TestAccount;
let user: TestAccount;

beforeAll(async () => {
  await connectTestDatabase();
}, 60_000);

beforeEach(async () => {
  // Balances are sums over the whole ledger, so a test that inherited another's rows would be
  // asserting against a number it did not set.
  await resetDatabase();

  admin = await createAccount({ role: Role.ADMIN });
  user = await createAccount({ role: Role.USER });
});

afterAll(disconnectTestDatabase);

describe('a balance is the ledger and nothing else', () => {
  it('reports exactly what the ledger sums to', async () => {
    await grantPoints(user.id, 140);
    await grantPoints(user.id, -40);

    const response = await api()
      .get('/api/points/balance')
      .set('Authorization', bearer(user))
      .expect(200);

    expect(response.body).toMatchObject({ balance: 100 });
    expect(await ledgerBalance(user.id)).toBe(100);
  });

  it('does not mint points on a read', async () => {
    const habit = await createHabit({ userId: user.id });

    await api()
      .post(`/api/habits/${habit.id}/completions`)
      .set('Authorization', bearer(user))
      .send({ date: today() })
      .expect(201);

    const earned = await ledgerBalance(user.id);

    // Reading a habit, a ledger, or a balance must never be an earning path. Anything that pays out is
    // a POST, deliberately, so a refresh cannot make someone richer.
    await api().get('/api/habits').set('Authorization', bearer(user)).expect(200);
    await api().get(`/api/habits/${habit.id}`).set('Authorization', bearer(user)).expect(200);
    await api().get('/api/points/ledger').set('Authorization', bearer(user)).expect(200);
    await api().get('/api/points/balance').set('Authorization', bearer(user)).expect(200);

    expect(await ledgerBalance(user.id)).toBe(earned);
  });
});

describe('an action pays out once', () => {
  it('refuses a second habit completion on the same day and writes nothing', async () => {
    const habit = await createHabit({ userId: user.id });

    await api()
      .post(`/api/habits/${habit.id}/completions`)
      .set('Authorization', bearer(user))
      .send({ date: today() })
      .expect(201);

    const balanceAfterFirst = await ledgerBalance(user.id);
    const rowsAfterFirst = await ledgerRowCount(user.id);

    expect(balanceAfterFirst).toBe(PointsPolicy.HABIT_COMPLETION);

    await api()
      .post(`/api/habits/${habit.id}/completions`)
      .set('Authorization', bearer(user))
      .send({ date: today() })
      .expect(409);

    expect(await ledgerBalance(user.id)).toBe(balanceAfterFirst);
    expect(await ledgerRowCount(user.id)).toBe(rowsAfterFirst);
  });

  it('pays for one of two simultaneous completions, not both', async () => {
    const habit = await createHabit({ userId: user.id });

    const attempts = await Promise.all(
      [0, 1].map(() =>
        api()
          .post(`/api/habits/${habit.id}/completions`)
          .set('Authorization', bearer(user))
          .send({ date: today() }),
      ),
    );

    // The unique key on `(habit_id, completed_on)` decides this, not a "have they already?" read —
    // which both of these requests would have passed before either had written anything.
    expect(attempts.filter((attempt) => attempt.status === 201)).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 409)).toHaveLength(1);
    expect(await ledgerBalance(user.id)).toBe(PointsPolicy.HABIT_COMPLETION);
  });

  it('refuses a second challenge check-in on the same day and writes nothing', async () => {
    const creator = await createAccount({ role: Role.CREATOR });
    const challenge = await createChallenge({
      createdById: creator.id,
      status: ChallengeStatus.APPROVED,
      approvedById: admin.id,
    });

    await api()
      .post(`/api/challenges/${challenge.id}/join`)
      .set('Authorization', bearer(user))
      .expect(201);

    await api()
      .post(`/api/challenges/${challenge.id}/check-ins`)
      .set('Authorization', bearer(user))
      .send({ date: today() })
      .expect(201);

    const balanceAfterFirst = await ledgerBalance(user.id);
    expect(balanceAfterFirst).toBe(PointsPolicy.CHALLENGE_CHECK_IN);

    await api()
      .post(`/api/challenges/${challenge.id}/check-ins`)
      .set('Authorization', bearer(user))
      .send({ date: today() })
      .expect(409);

    expect(await ledgerBalance(user.id)).toBe(balanceAfterFirst);
  });

  it('pays for one of two simultaneous check-ins, not both', async () => {
    const creator = await createAccount({ role: Role.CREATOR });
    const challenge = await createChallenge({
      createdById: creator.id,
      status: ChallengeStatus.APPROVED,
      approvedById: admin.id,
    });

    await api()
      .post(`/api/challenges/${challenge.id}/join`)
      .set('Authorization', bearer(user))
      .expect(201);

    const attempts = await Promise.all(
      [0, 1].map(() =>
        api()
          .post(`/api/challenges/${challenge.id}/check-ins`)
          .set('Authorization', bearer(user))
          .send({ date: today() }),
      ),
    );

    expect(attempts.filter((attempt) => attempt.status === 201)).toHaveLength(1);
    expect(await ledgerBalance(user.id)).toBe(PointsPolicy.CHALLENGE_CHECK_IN);
  });
});

describe('spending cannot exceed what was earned', () => {
  it('refuses a redemption the balance does not cover, and writes nothing at all', async () => {
    const item = await createRewardItem({ createdById: admin.id, pointsCost: 500, stock: 3 });
    await grantPoints(user.id, 100);

    const refused = await api()
      .post(`/api/rewards/${item.id}/redeem`)
      .set('Authorization', bearer(user))
      .expect(409);

    expect(refused.body).toMatchObject({ code: 'CONFLICT' });

    // All three writes of a redemption are in one transaction, so a refusal must leave none of them.
    expect(await ledgerBalance(user.id)).toBe(100);
    expect(await AppDataSource.getRepository(Redemption).countBy({ userId: user.id })).toBe(0);
    expect(
      (await AppDataSource.getRepository(RewardItem).findOneByOrFail({ id: item.id })).stock,
    ).toBe(3);
  });

  it('refuses a redemption of something out of stock, however rich the caller is', async () => {
    const item = await createRewardItem({ createdById: admin.id, pointsCost: 10, stock: 0 });
    await grantPoints(user.id, 10_000);

    await api()
      .post(`/api/rewards/${item.id}/redeem`)
      .set('Authorization', bearer(user))
      .expect(409);

    expect(await ledgerBalance(user.id)).toBe(10_000);
    expect(await AppDataSource.getRepository(Redemption).countBy({ userId: user.id })).toBe(0);
  });

  it('records a successful redemption as one negative entry and one less in stock', async () => {
    const item = await createRewardItem({
      createdById: admin.id,
      type: RewardItemType.COSMETIC,
      pointsCost: 120,
      stock: 2,
    });
    await grantPoints(user.id, 200);

    await api()
      .post(`/api/rewards/${item.id}/redeem`)
      .set('Authorization', bearer(user))
      .expect(201);

    expect(await ledgerBalance(user.id)).toBe(80);
    expect(
      (await AppDataSource.getRepository(RewardItem).findOneByOrFail({ id: item.id })).stock,
    ).toBe(1);

    const spend = await AppDataSource.getRepository(PointsLedger).findOneByOrFail({
      userId: user.id,
      amount: -120,
    });
    // Direction lives in the sign. A second column saying "SPEND" could contradict it; this cannot.
    expect(spend.amount).toBeLessThan(0);
  });

  it('lets only one of two simultaneous redemptions through when only one is affordable', async () => {
    const item = await createRewardItem({ createdById: admin.id, pointsCost: 100, stock: 10 });
    await grantPoints(user.id, 100);

    const attempts = await Promise.all(
      [0, 1].map(() =>
        api().post(`/api/rewards/${item.id}/redeem`).set('Authorization', bearer(user)),
      ),
    );

    /**
     * This is the test the pessimistic row lock in `PointsService.spend` exists for, and the one an
     * implementation that merely sums-then-inserts would fail. Both requests read a balance of 100,
     * both find it sufficient, and both insert — leaving the account 100 points overdrawn with no
     * constraint able to notice, because there is no balance column for one to defend.
     */
    expect(attempts.filter((attempt) => attempt.status === 201)).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 409)).toHaveLength(1);

    expect(await ledgerBalance(user.id)).toBe(0);
    expect(await AppDataSource.getRepository(Redemption).countBy({ userId: user.id })).toBe(1);
  });

  it('never lets a balance go negative across a burst of redemptions', async () => {
    const item = await createRewardItem({ createdById: admin.id, pointsCost: 30, stock: 100 });
    await grantPoints(user.id, 100);

    // Three are affordable out of eight. The lock serialises this user's spending without serialising
    // anybody else's, so the arithmetic has to come out exactly — not merely non-negative.
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        api().post(`/api/rewards/${item.id}/redeem`).set('Authorization', bearer(user)),
      ),
    );

    expect(attempts.filter((attempt) => attempt.status === 201)).toHaveLength(3);
    expect(await ledgerBalance(user.id)).toBe(10);
  });
});

describe('the ledger is append-only', () => {
  it('has no route that edits or deletes an entry', async () => {
    await grantPoints(user.id, 50);
    const entry = await AppDataSource.getRepository(PointsLedger).findOneByOrFail({
      userId: user.id,
    });

    // Not "these are forbidden" — these do not exist. A correction is a compensating entry, so that
    // the history stays true and a balance is still derivable from it.
    for (const account of [user, admin]) {
      await api()
        .patch(`/api/points/ledger/${entry.id}`)
        .set('Authorization', bearer(account))
        .send({ amount: 10_000 })
        .expect(404);

      await api()
        .delete(`/api/points/ledger/${entry.id}`)
        .set('Authorization', bearer(account))
        .expect(404);
    }

    expect(await ledgerBalance(user.id)).toBe(50);
  });

  it('shows a user their own entries and nobody else’s', async () => {
    const other = await createAccount({ role: Role.USER });
    await grantPoints(user.id, 50);
    await grantPoints(other.id, 999);

    const response = await api()
      .get('/api/points/ledger')
      .set('Authorization', bearer(user))
      .expect(200);

    expect(response.body).toMatchObject({ total: 1 });
    expect(await ledgerBalance(other.id)).toBe(999);
  });
});
