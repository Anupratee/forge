import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app';
import { AppDataSource } from '../config/data-source';
import { Challenge, ChallengeCategory, ChallengeStatus } from '../entities/Challenge';
import { Habit, HabitCategory } from '../entities/Habit';
import { PointsLedger, PointsReason } from '../entities/PointsLedger';
import { RewardItem, RewardItemType } from '../entities/RewardItem';
import { Role, User, UserStatus } from '../entities/User';
import { addDays, today } from '../utils/date';
import { signAccessToken } from '../utils/jwt';
import { hashPassword } from '../utils/password';

/**
 * Fixtures for the integration suite.
 *
 * Every test builds the rows it asserts against. It would be quicker to lean on `npm run seed`, and
 * that is exactly the trap: a test that reads seeded data passes or fails on decisions made in a file
 * it never mentions, and a test that *writes* near seeded data can delete it. Fixtures here are built
 * per file against a database the file emptied first, so a test states its own preconditions and
 * changing the seed cannot silently change what a test proves.
 *
 * Rows are written through repositories rather than through the API. Where a test's subject is the
 * endpoint, going through it would be assuming what is under test; where the subject is a database
 * constraint, the endpoint is simply not the point.
 */

/** The password every fixture account shares, so a login test has something to send. */
export const FIXTURE_PASSWORD = 'Forge!2026';

/**
 * The app is built once per test file.
 *
 * `createApp` does not listen — `server.ts` owns the process — so supertest drives it in-process with
 * no port to bind and nothing to leak between files.
 */
let app: Express | undefined;

export function api(): request.Agent {
  app ??= createApp();
  return request(app);
}

/**
 * Reads a response body at a stated type.
 *
 * supertest types `body` as `any`, which switches off the very checks that would catch a test
 * asserting against a field the API does not send — a test that passes because both sides are
 * `undefined`. Naming the shape at the call site puts them back.
 */
export function bodyOf<T>(response: request.Response): T {
  return response.body as T;
}

/** A created account and a token that authenticates as it. */
export interface TestAccount {
  id: string;
  email: string;
  role: Role;
  token: string;
}

export interface AccountOptions {
  role?: Role;
  status?: UserStatus;
  email?: string;
  displayName?: string;
  leaderboardOptIn?: boolean;
}

/**
 * bcrypt at cost 12 is deliberately slow, and every fixture account shares one password — so it is
 * hashed once per test file rather than once per account.
 */
let sharedHash: string | undefined;

export async function createAccount(options: AccountOptions = {}): Promise<TestAccount> {
  sharedHash ??= await hashPassword(FIXTURE_PASSWORD);

  const users = AppDataSource.getRepository(User);
  const role = options.role ?? Role.USER;

  const user = await users.save(
    users.create({
      // Unique by default: the suite creates many accounts and none of them care what they are called.
      email: options.email ?? `${randomUUID()}@forge.test`,
      passwordHash: sharedHash,
      displayName: options.displayName ?? 'Test Account',
      role,
      status: options.status ?? UserStatus.ACTIVE,
      leaderboardOptIn: options.leaderboardOptIn ?? false,
    }),
  );

  return {
    id: user.id,
    email: user.email,
    role,
    // Minted directly rather than fetched from `POST /auth/login`. A test about authorization should
    // not fail because login broke, and login has its own tests.
    token: signAccessToken({ sub: user.id, role }),
  };
}

/** The `Authorization` header value for an account. */
export function bearer(account: TestAccount): string {
  return `Bearer ${account.token}`;
}

export interface ChallengeOptions {
  createdById: string;
  status?: ChallengeStatus;
  title?: string;
  category?: ChallengeCategory;
  capacity?: number;
  pointsReward?: number;
  startDate?: string;
  endDate?: string;
  /** Set on an approved challenge, alongside the approval timestamp. */
  approvedById?: string;
}

export async function createChallenge(options: ChallengeOptions): Promise<Challenge> {
  const challenges = AppDataSource.getRepository(Challenge);
  const approvedById = options.approvedById ?? null;

  return challenges.save(
    challenges.create({
      title: options.title ?? 'Test Challenge',
      description: 'A challenge created by the integration suite.',
      category: options.category ?? ChallengeCategory.FITNESS,
      // A window open around today, so joining and checking in are both in range by default.
      startDate: options.startDate ?? addDays(today(), -3),
      endDate: options.endDate ?? addDays(today(), 20),
      capacity: options.capacity ?? 10,
      pointsReward: options.pointsReward ?? 100,
      status: options.status ?? ChallengeStatus.DRAFT,
      createdById: options.createdById,
      approvedById,
      approvedAt: approvedById === null ? null : new Date(),
    }),
  );
}

export interface RewardItemOptions {
  createdById: string;
  name?: string;
  type?: RewardItemType;
  pointsCost?: number;
  stock?: number;
}

export async function createRewardItem(options: RewardItemOptions): Promise<RewardItem> {
  const items = AppDataSource.getRepository(RewardItem);
  const type = options.type ?? RewardItemType.VOUCHER;

  return items.save(
    items.create({
      name: options.name ?? 'Test Reward',
      description: 'A reward created by the integration suite.',
      type,
      pointsCost: options.pointsCost ?? 100,
      stock: options.stock ?? 5,
      cosmeticTheme:
        type === RewardItemType.COSMETIC
          ? { primary: '#f97316', accent: '#fb923c', surface: '#1c1917' }
          : null,
      createdById: options.createdById,
    }),
  );
}

export interface HabitOptions {
  userId: string;
  name?: string;
  category?: HabitCategory;
  targetPerWeek?: number;
}

export async function createHabit(options: HabitOptions): Promise<Habit> {
  const habits = AppDataSource.getRepository(Habit);

  return habits.save(
    habits.create({
      name: options.name ?? 'Test Habit',
      category: options.category ?? HabitCategory.HEALTH,
      targetPerWeek: options.targetPerWeek ?? 7,
      userId: options.userId,
    }),
  );
}

/**
 * Puts points in an account without going through an earning path.
 *
 * `ADMIN_ADJUSTMENT` is the one reason with no reference row, and the idempotency key over
 * `(reference_type, reference_id, reason)` leaves NULL references unconstrained — so this can be
 * called repeatedly. Tests that need a balance to spend against use this rather than performing a
 * dozen check-ins, which would make the setup, rather than the redemption, the thing under test.
 */
export async function grantPoints(userId: string, amount: number): Promise<void> {
  const ledger = AppDataSource.getRepository(PointsLedger);

  await ledger.save(
    ledger.create({
      userId,
      amount,
      reason: PointsReason.ADMIN_ADJUSTMENT,
      referenceType: null,
      referenceId: null,
      description: 'Integration fixture',
    }),
  );
}

/** Reads a balance the way the API does — by summing the ledger, in SQL. */
export async function ledgerBalance(userId: string): Promise<number> {
  const result = await AppDataSource.createQueryBuilder(PointsLedger, 'ledger')
    .select('COALESCE(SUM(ledger.amount), 0)', 'balance')
    .where('ledger.userId = :userId', { userId })
    .getRawOne<{ balance: string }>();

  return Number(result?.balance ?? 0);
}

/** How many ledger rows an account has — the count an invariant test watches for change. */
export async function ledgerRowCount(userId: string): Promise<number> {
  return AppDataSource.getRepository(PointsLedger).countBy({ userId });
}
