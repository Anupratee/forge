import type { DataSource } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Challenge, ChallengeStatus } from '../entities/Challenge';
import { PointsLedger } from '../entities/PointsLedger';
import { Redemption } from '../entities/Redemption';
import { Role, User, UserStatus } from '../entities/User';

export interface SystemSummary {
  users: {
    total: number;
    suspended: number;
    byRole: Record<Role, number>;
  };
  challenges: {
    total: number;
    byStatus: Record<ChallengeStatus, number>;
  };
  economy: {
    pointsAwarded: number;
    pointsSpent: number;
    redemptions: number;
  };
}

/**
 * Platform-wide figures for the Admin dashboard.
 *
 * Everything here is an aggregate over rows the Admin governs. Nothing exposes an individual user's
 * habits or budgets — those are private to their owner, and no Admin route reveals them, only how many
 * there are.
 */
export class AdminService {
  constructor(private readonly dataSource: DataSource) {}

  async getSystemSummary(): Promise<SystemSummary> {
    const users = this.dataSource.getRepository(User);
    const challenges = this.dataSource.getRepository(Challenge);
    const ledger = this.dataSource.getRepository(PointsLedger);
    const redemptions = this.dataSource.getRepository(Redemption);

    const [
      totalUsers,
      suspendedUsers,
      usersByRole,
      totalChallenges,
      challengesByStatus,
      economy,
      totalRedemptions,
    ] = await Promise.all([
      users.count(),
      users.countBy({ status: UserStatus.SUSPENDED }),

      users
        .createQueryBuilder('user')
        .select('user.role', 'key')
        .addSelect('COUNT(*)', 'count')
        .groupBy('user.role')
        .getRawMany<CountRow<Role>>(),

      challenges.count(),

      challenges
        .createQueryBuilder('challenge')
        .select('challenge.status', 'key')
        .addSelect('COUNT(*)', 'count')
        .groupBy('challenge.status')
        .getRawMany<CountRow<ChallengeStatus>>(),

      // Awarded and spent are split by the sign of the amount rather than counted from two columns.
      // The ledger stores direction in the sign, so this derives both totals from the one source of
      // truth in a single pass, and PostgreSQL does the arithmetic.
      ledger
        .createQueryBuilder('ledger')
        .select('COALESCE(SUM(CASE WHEN ledger.amount > 0 THEN ledger.amount END), 0)', 'awarded')
        .addSelect('COALESCE(-SUM(CASE WHEN ledger.amount < 0 THEN ledger.amount END), 0)', 'spent')
        .getRawOne<{ awarded: string; spent: string }>(),

      redemptions.count(),
    ]);

    return {
      users: {
        total: totalUsers,
        suspended: suspendedUsers,
        byRole: tally(Object.values(Role), usersByRole),
      },
      challenges: {
        total: totalChallenges,
        byStatus: tally(Object.values(ChallengeStatus), challengesByStatus),
      },
      economy: {
        pointsAwarded: Number(economy?.awarded ?? 0),
        pointsSpent: Number(economy?.spent ?? 0),
        redemptions: totalRedemptions,
      },
    };
  }
}

interface CountRow<T extends string> {
  key: T;
  /** PostgreSQL returns `COUNT(*)` as `bigint`, which the driver hands back as a string. */
  count: string;
}

/**
 * Turns grouped counts into a complete map.
 *
 * `GROUP BY` omits values with no rows, so a status nobody has used would be missing from the response
 * rather than reported as zero — and a dashboard would render a gap instead of a nought. Starting from
 * every enum member and filling in what the query found avoids that.
 */
function tally<T extends string>(all: readonly T[], rows: CountRow<T>[]): Record<T, number> {
  const totals = Object.fromEntries(all.map((key) => [key, 0])) as Record<T, number>;

  for (const row of rows) {
    totals[row.key] = Number(row.count);
  }

  return totals;
}

export const adminService = new AdminService(AppDataSource);
