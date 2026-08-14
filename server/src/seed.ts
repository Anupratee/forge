import 'reflect-metadata';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from './config/data-source';
import { isProduction } from './config/env';
import { BudgetGoal } from './entities/BudgetGoal';
import { Challenge, ChallengeCategory, ChallengeStatus } from './entities/Challenge';
import { ChallengeCheckIn } from './entities/ChallengeCheckIn';
import { ChallengeParticipation } from './entities/ChallengeParticipation';
import { Expense, ExpenseCategory, ExpenseSource } from './entities/Expense';
import { Habit, HabitCategory } from './entities/Habit';
import { HabitCompletion } from './entities/HabitCompletion';
import { PointsLedger, PointsReason, PointsReferenceType } from './entities/PointsLedger';
import { Redemption } from './entities/Redemption';
import { RewardItem, RewardItemType } from './entities/RewardItem';
import { Role, User, UserStatus } from './entities/User';
import { PointsPolicy } from './services/PointsPolicy';
import { addDays, startOfMonth, today } from './utils/date';
import { hashPassword } from './utils/password';

/**
 * Development seed.
 *
 * The point of this script is that every later phase has something real to demonstrate against, and
 * that the negative paths have subjects: a suspended account to be rejected, a full challenge for
 * the availability filter to hide, an out-of-stock item for a redemption to fail on.
 *
 * It is deliberately destructive rather than half-idempotent — it truncates and reinserts, so running
 * it twice gives the same database rather than a subtly doubled one. That makes it a development tool
 * only, which the production guard enforces.
 *
 * Everything happens in one transaction. A seed that fails halfway and leaves a partial database
 * behind is worse than one that fails cleanly.
 */

/** Shared across every seeded account, so the demo needs one password rather than six. */
const SEED_PASSWORD = 'Forge!2026';

/**
 * Truncated in one statement. `migrations` is deliberately absent: the schema stays applied, only the
 * domain rows are replaced.
 *
 * CASCADE is required because `users.equipped_redemption_id` points into `redemptions`, so no
 * ordering of these tables alone would satisfy every foreign key.
 */
const DOMAIN_TABLES = [
  'points_ledger',
  'redemptions',
  'challenge_check_ins',
  'challenge_participations',
  'habit_completions',
  'habits',
  'expenses',
  'budget_goals',
  'challenges',
  'reward_items',
  'users',
];

interface SeededUsers {
  admin: User;
  maya: User;
  dev: User;
  asha: User;
  rohan: User;
  kim: User;
}

/**
 * A day in the current month, `offset` days after the 1st, never later than today.
 *
 * Month-relative data is built from today rather than a fixed date, so the current-month budget
 * dashboard has data whenever this runs. The clamp is what keeps that true on the 1st of a month,
 * when there are no earlier days to place an expense on.
 */
function dayThisMonth(offset: number): string {
  const now = today();
  const daysElapsed = Number(now.slice(8, 10)) - 1;
  return addDays(startOfMonth(now), Math.min(offset, daysElapsed));
}

async function truncateDomainTables(manager: EntityManager): Promise<void> {
  await manager.query(`TRUNCATE TABLE ${DOMAIN_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

/**
 * Accounts are saved one at a time rather than as one array, so each is a named binding. A batch save
 * would need positional destructuring, which reads badly and breaks silently if the order changes.
 */
async function seedUsers(manager: EntityManager): Promise<SeededUsers> {
  // Hashed once and reused: bcrypt at cost 12 is intentionally slow, and hashing the same plaintext
  // six times would make the seed six times slower for no benefit.
  const passwordHash = await hashPassword(SEED_PASSWORD);

  const admin = await manager.save(
    manager.create(User, {
      email: 'admin@forge.test',
      passwordHash,
      displayName: 'Priya Menon',
      bio: 'Platform administrator.',
      role: Role.ADMIN,
    }),
  );

  const maya = await manager.save(
    manager.create(User, {
      email: 'maya@forge.test',
      passwordHash,
      displayName: 'Maya Iyer',
      bio: 'Designs habit-forming community challenges.',
      role: Role.CREATOR,
    }),
  );

  const dev = await manager.save(
    manager.create(User, {
      email: 'dev@forge.test',
      passwordHash,
      displayName: 'Dev Sharma',
      bio: 'Fitness and learning challenges.',
      role: Role.CREATOR,
    }),
  );

  const asha = await manager.save(
    manager.create(User, {
      email: 'asha@forge.test',
      passwordHash,
      displayName: 'Asha Rao',
      bio: 'Runner, saver, occasional over-spender on takeaway.',
      role: Role.USER,
      leaderboardOptIn: true,
    }),
  );

  const rohan = await manager.save(
    manager.create(User, {
      email: 'rohan@forge.test',
      passwordHash,
      displayName: 'Rohan Gupta',
      role: Role.USER,
      leaderboardOptIn: true,
    }),
  );

  const kim = await manager.save(
    manager.create(User, {
      // Suspended, so Phase 3 has an account to prove the rejection against and Phase 6 has one for
      // the Admin reactivate control to act on.
      email: 'kim@forge.test',
      passwordHash,
      displayName: 'Kim Tan',
      role: Role.USER,
      status: UserStatus.SUSPENDED,
    }),
  );

  return { admin, maya, dev, asha, rohan, kim };
}

async function seedRewardItems(manager: EntityManager, admin: User): Promise<RewardItem> {
  const ember = await manager.save(
    manager.create(RewardItem, {
      name: 'Ember Theme',
      description: 'A warm orange profile theme.',
      type: RewardItemType.COSMETIC,
      pointsCost: 120,
      stock: 50,
      cosmeticTheme: { primary: '#f97316', accent: '#fb923c', surface: '#1c1917' },
      createdById: admin.id,
    }),
  );

  await manager.save(
    manager.create(RewardItem, [
      {
        name: 'Glacier Theme',
        description: 'A cool blue profile theme.',
        type: RewardItemType.COSMETIC,
        pointsCost: 150,
        stock: 50,
        cosmeticTheme: { primary: '#0ea5e9', accent: '#38bdf8', surface: '#0f172a' },
        createdById: admin.id,
      },
      {
        // Out of stock on purpose: the availability filter needs something to hide, and the
        // redemption path needs something to reject.
        name: 'Verdant Theme',
        description: 'A deep green profile theme. Currently unavailable.',
        type: RewardItemType.COSMETIC,
        pointsCost: 200,
        stock: 0,
        cosmeticTheme: { primary: '#16a34a', accent: '#4ade80', surface: '#052e16' },
        createdById: admin.id,
      },
      {
        name: 'Coffee Voucher',
        description: 'A simulated voucher worth 100 at participating cafes.',
        type: RewardItemType.VOUCHER,
        pointsCost: 300,
        stock: 20,
        createdById: admin.id,
      },
      {
        name: 'Bookstore Voucher',
        description: 'A simulated voucher worth 250 at partner bookstores.',
        type: RewardItemType.VOUCHER,
        pointsCost: 600,
        stock: 10,
        createdById: admin.id,
      },
      {
        name: 'Fitness Voucher',
        description: 'A simulated voucher worth 500 towards a gym membership.',
        type: RewardItemType.VOUCHER,
        pointsCost: 1000,
        stock: 5,
        createdById: admin.id,
      },
    ]),
  );

  return ember;
}

interface SeededChallenges {
  /** Approved and under capacity — the one Users join and check in against. */
  morningRun: Challenge;
  /** Approved with capacity 1, filled below, so the availability filter has something to hide. */
  meditation: Challenge;
}

/**
 * One challenge in each of the five statuses, split across both Creators — so the Admin queue, the
 * Creator dashboard, and the User browse each have something to show, and so Phase 4 can prove that
 * only `APPROVED` ever reaches a User.
 */
async function seedChallenges(
  manager: EntityManager,
  users: SeededUsers,
): Promise<SeededChallenges> {
  const now = today();

  const morningRun = await manager.save(
    manager.create(Challenge, {
      title: '30-Day Morning Run',
      description: 'Run at least two kilometres before 8am, every day for thirty days.',
      category: ChallengeCategory.FITNESS,
      startDate: addDays(now, -10),
      endDate: addDays(now, 20),
      capacity: 25,
      pointsReward: 300,
      status: ChallengeStatus.APPROVED,
      createdById: users.maya.id,
      approvedById: users.admin.id,
      approvedAt: new Date(),
    }),
  );

  const meditation = await manager.save(
    manager.create(Challenge, {
      title: 'Meditation Micro-Challenge',
      description: 'Ten minutes of stillness a day. Deliberately tiny — one seat only.',
      category: ChallengeCategory.WELLNESS,
      startDate: addDays(now, -2),
      endDate: addDays(now, 12),
      capacity: 1,
      pointsReward: 100,
      status: ChallengeStatus.APPROVED,
      createdById: users.dev.id,
      approvedById: users.admin.id,
      approvedAt: new Date(),
    }),
  );

  await manager.save(
    manager.create(Challenge, [
      {
        title: 'Sketch a Day',
        description: 'One drawing a day for two weeks. Any medium.',
        category: ChallengeCategory.ART,
        startDate: addDays(now, 14),
        endDate: addDays(now, 28),
        capacity: 40,
        pointsReward: 150,
        status: ChallengeStatus.DRAFT,
        createdById: users.maya.id,
      },
      {
        title: 'No-Spend Fortnight',
        description: 'Two weeks with no discretionary spending at all.',
        category: ChallengeCategory.FINANCE,
        startDate: addDays(now, 7),
        endDate: addDays(now, 21),
        capacity: 100,
        pointsReward: 250,
        status: ChallengeStatus.REJECTED,
        rejectionReason:
          'Completion criteria are not measurable — define what counts as discretionary spending, ' +
          'and how a participant proves a no-spend day.',
        createdById: users.maya.id,
      },
      {
        title: 'Learn SQL in 21 Days',
        description: 'One query exercise a day, building from SELECT to window functions.',
        category: ChallengeCategory.LEARNING,
        startDate: addDays(now, 3),
        endDate: addDays(now, 24),
        capacity: 60,
        pointsReward: 400,
        status: ChallengeStatus.PENDING_APPROVAL,
        createdById: users.dev.id,
      },
      {
        title: 'Summer Fitness Sprint',
        description: 'A finished challenge, kept for history and for the Creator dashboard.',
        category: ChallengeCategory.FITNESS,
        startDate: addDays(now, -60),
        endDate: addDays(now, -30),
        capacity: 30,
        pointsReward: 200,
        status: ChallengeStatus.ENDED,
        createdById: users.dev.id,
        approvedById: users.admin.id,
        approvedAt: new Date(),
      },
    ]),
  );

  return { morningRun, meditation };
}

/**
 * Participations, their check-ins, and the ledger row each check-in earned.
 *
 * The ledger rows are written here rather than left out because a balance is derived by summing that
 * table — seeded activity with no matching entries would show as a zero balance and read as a bug in
 * `PointsService` rather than a gap in the seed.
 */
async function seedParticipation(
  manager: EntityManager,
  users: SeededUsers,
  challenges: SeededChallenges,
): Promise<void> {
  const now = today();

  const ashaRun = await manager.save(
    manager.create(ChallengeParticipation, {
      challengeId: challenges.morningRun.id,
      userId: users.asha.id,
    }),
  );

  const rohanRun = await manager.save(
    manager.create(ChallengeParticipation, {
      challengeId: challenges.morningRun.id,
      userId: users.rohan.id,
    }),
  );

  await manager.save(
    manager.create(ChallengeParticipation, {
      // Takes the single seat on the capacity-1 challenge. No check-ins: a joined-but-not-started
      // participation is a state the dashboards have to render too.
      challengeId: challenges.meditation.id,
      userId: users.kim.id,
    }),
  );

  const checkInPlan = [
    { participation: ashaRun, user: users.asha, offsets: [-3, -2, -1, 0] },
    { participation: rohanRun, user: users.rohan, offsets: [-1, 0] },
  ];

  for (const { participation, user, offsets } of checkInPlan) {
    const checkIns = await manager.save(
      manager.create(
        ChallengeCheckIn,
        offsets.map((offset) => ({
          participationId: participation.id,
          checkInDate: addDays(now, offset),
          note: offset === 0 ? 'Done before sunrise.' : null,
        })),
      ),
    );

    await manager.save(
      manager.create(
        PointsLedger,
        checkIns.map((checkIn) => ({
          userId: user.id,
          amount: PointsPolicy.CHALLENGE_CHECK_IN,
          reason: PointsReason.CHALLENGE_CHECK_IN,
          referenceType: PointsReferenceType.CHALLENGE_CHECK_IN,
          referenceId: checkIn.id,
          description: '30-Day Morning Run check-in',
        })),
      ),
    );
  }
}

/**
 * Habits with completion runs, and the ledger rows they earned.
 *
 * Asha's morning run has five consecutive days on purpose: the streak function in Phase 5 needs real
 * input, and a run that stops short of the seven-day bonus interval is the more interesting case to
 * develop against.
 */
async function seedHabits(manager: EntityManager, users: SeededUsers): Promise<void> {
  const now = today();

  const habitPlan = [
    {
      user: users.asha,
      definition: {
        name: 'Morning run',
        description: 'Two kilometres before breakfast.',
        category: HabitCategory.FITNESS,
        targetPerWeek: 5,
        userId: users.asha.id,
      },
      offsets: [-4, -3, -2, -1, 0],
    },
    {
      user: users.asha,
      definition: {
        name: 'Read 20 pages',
        category: HabitCategory.LEARNING,
        targetPerWeek: 7,
        userId: users.asha.id,
      },
      offsets: [-2, -1, 0],
    },
    {
      user: users.rohan,
      definition: {
        name: 'Log the day’s expenses',
        category: HabitCategory.FINANCE,
        targetPerWeek: 7,
        userId: users.rohan.id,
      },
      offsets: [-1, 0],
    },
  ];

  for (const { user, definition, offsets } of habitPlan) {
    const habit = await manager.save(manager.create(Habit, definition));

    const completions = await manager.save(
      manager.create(
        HabitCompletion,
        offsets.map((offset) => ({ habitId: habit.id, completedOn: addDays(now, offset) })),
      ),
    );

    await manager.save(
      manager.create(
        PointsLedger,
        completions.map((completion) => ({
          userId: user.id,
          amount: PointsPolicy.HABIT_COMPLETION,
          reason: PointsReason.HABIT_COMPLETION,
          referenceType: PointsReferenceType.HABIT_COMPLETION,
          referenceId: completion.id,
          description: `${habit.name} completed`,
        })),
      ),
    );
  }
}

/**
 * Two budget goals for the current month and the expenses measured against them: one category over
 * its limit and one under, so the dashboard has both states and the adherence award has one goal that
 * qualifies and one that does not.
 *
 * Food totals 9,200 against a limit of 8,000. Transport totals 1,850 against 3,000, and earns the
 * bonus. Two further expenses fall in categories with no goal at all, which is a supported state —
 * expenses are facts, goals are optional policy over them.
 */
async function seedBudgets(manager: EntityManager, users: SeededUsers): Promise<void> {
  const periodMonth = startOfMonth(today());

  await manager.save(
    manager.create(BudgetGoal, {
      title: 'Eating out less',
      description: 'Cook at home at least five nights a week.',
      category: ExpenseCategory.FOOD,
      periodMonth,
      limitAmount: 8000,
      userId: users.asha.id,
    }),
  );

  const transportGoal = await manager.save(
    manager.create(BudgetGoal, {
      title: 'Cycle, don’t cab',
      category: ExpenseCategory.TRANSPORT,
      periodMonth,
      limitAmount: 3000,
      userId: users.asha.id,
    }),
  );

  await manager.save(
    manager.create(Expense, [
      {
        title: 'Weekly groceries',
        amount: 3200,
        category: ExpenseCategory.FOOD,
        spentOn: dayThisMonth(2),
        userId: users.asha.id,
      },
      {
        title: 'Dinner with friends',
        amount: 2400,
        category: ExpenseCategory.FOOD,
        spentOn: dayThisMonth(8),
        userId: users.asha.id,
      },
      {
        title: 'Groceries top-up',
        amount: 1800,
        category: ExpenseCategory.FOOD,
        spentOn: dayThisMonth(15),
        source: ExpenseSource.CSV_IMPORT,
        userId: users.asha.id,
      },
      {
        title: 'Late-night takeaway',
        description: 'The reason this budget exists.',
        amount: 1800,
        category: ExpenseCategory.FOOD,
        spentOn: dayThisMonth(21),
        userId: users.asha.id,
      },
      {
        title: 'Metro pass',
        amount: 1200,
        category: ExpenseCategory.TRANSPORT,
        spentOn: dayThisMonth(1),
        userId: users.asha.id,
      },
      {
        title: 'Cab home in the rain',
        amount: 650,
        category: ExpenseCategory.TRANSPORT,
        spentOn: dayThisMonth(12),
        source: ExpenseSource.CSV_IMPORT,
        userId: users.asha.id,
      },
      {
        title: 'Electricity bill',
        amount: 1500,
        category: ExpenseCategory.UTILITIES,
        spentOn: dayThisMonth(5),
        userId: users.asha.id,
      },
      {
        title: 'Cinema tickets',
        amount: 700,
        category: ExpenseCategory.ENTERTAINMENT,
        spentOn: dayThisMonth(18),
        userId: users.rohan.id,
      },
    ]),
  );

  // Only the transport goal is within its limit, so only it pays out. The food goal is left with no
  // ledger entry rather than a zero one — no award happened, and a zero row would claim otherwise.
  await manager.save(
    manager.create(PointsLedger, {
      userId: users.asha.id,
      amount: PointsPolicy.BUDGET_ADHERENCE,
      reason: PointsReason.BUDGET_ADHERENCE,
      referenceType: PointsReferenceType.BUDGET_GOAL,
      referenceId: transportGoal.id,
      description: 'Stayed within the transport budget',
    }),
  );
}

/**
 * One completed redemption: the negative ledger entry, the decremented stock, and the equipped
 * cosmetic. That is the whole spend path, seeded, so Phases 5 and 7 have a worked example to compare
 * against.
 */
async function seedRedemption(
  manager: EntityManager,
  users: SeededUsers,
  item: RewardItem,
): Promise<void> {
  const redemption = await manager.save(
    manager.create(Redemption, {
      userId: users.asha.id,
      rewardItemId: item.id,
      pointsSpent: item.pointsCost,
    }),
  );

  await manager.save(
    manager.create(PointsLedger, {
      userId: users.asha.id,
      // Negative, because the ledger records direction in the sign rather than in a second column
      // that could contradict it.
      amount: -item.pointsCost,
      reason: PointsReason.REDEMPTION,
      referenceType: PointsReferenceType.REDEMPTION,
      referenceId: redemption.id,
      description: `Redeemed ${item.name}`,
    }),
  );

  await manager.decrement(RewardItem, { id: item.id }, 'stock', 1);
  await manager.update(User, users.asha.id, { equippedRedemptionId: redemption.id });
}

/**
 * Reports the balances the seeded ledger actually sums to.
 *
 * This is a check as much as a summary: it reads a balance the same way `PointsService` will, so a
 * seed that wrote inconsistent ledger rows surfaces here rather than in Phase 5.
 */
async function reportBalances(manager: EntityManager): Promise<void> {
  const rows = await manager
    .createQueryBuilder(PointsLedger, 'ledger')
    .select('account.email', 'email')
    .addSelect('SUM(ledger.amount)', 'balance')
    .innerJoin(User, 'account', 'account.id = ledger.userId')
    .groupBy('account.email')
    .orderBy('balance', 'DESC')
    .getRawMany<{ email: string; balance: string }>();

  console.info('\nPoints balances, summed from the ledger:');
  for (const row of rows) {
    console.info(`  ${row.email.padEnd(20)}${row.balance.padStart(6)}`);
  }
}

async function main(): Promise<void> {
  if (isProduction) {
    console.error(
      'Refusing to seed: this truncates every domain table and NODE_ENV is production.',
    );
    process.exit(1);
  }

  await AppDataSource.initialize();

  try {
    await AppDataSource.transaction(async (manager) => {
      await truncateDomainTables(manager);

      const users = await seedUsers(manager);
      const ember = await seedRewardItems(manager, users.admin);
      const challenges = await seedChallenges(manager, users);

      await seedParticipation(manager, users, challenges);
      await seedHabits(manager, users);
      await seedBudgets(manager, users);
      await seedRedemption(manager, users, ember);

      await reportBalances(manager);
    });

    console.info(`\nSeed complete. Every account uses the password: ${SEED_PASSWORD}`);
    console.info('  admin@forge.test   Admin');
    console.info('  maya@forge.test    Creator');
    console.info('  dev@forge.test     Creator');
    console.info('  asha@forge.test    User');
    console.info('  rohan@forge.test   User');
    console.info('  kim@forge.test     User (suspended)\n');
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error('\nSeed failed. No changes were committed.\n', error);
  process.exit(1);
});
