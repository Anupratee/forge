import type { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import type { AdminUserQueryDto, UserSortField } from '../dtos/AdminUserDto';
import { Challenge, ChallengeStatus } from '../entities/Challenge';
import { PointsLedger } from '../entities/PointsLedger';
import { Redemption } from '../entities/Redemption';
import { Role, User, UserStatus } from '../entities/User';
import type { AuthContext } from '../middlewares/auth.middleware';
import { NotFoundError, ValidationError } from '../utils/AppError';
import { toPage, toPageRequest } from '../utils/pagination';
import type { Page } from '../utils/pagination';
import { escapeLikePattern } from '../utils/sql';

/** An account as an Admin sees it. Governance data only — never a hash, never anything private. */
export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  leaderboardOptIn: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  /** True for the Admin making the request, so the UI can explain why their own controls are absent. */
  isSelf: boolean;
}

const SORT_COLUMNS: Record<UserSortField, string> = {
  displayName: 'user.displayName',
  email: 'user.email',
  role: 'user.role',
  createdAt: 'user.createdAt',
  lastLoginAt: 'user.lastLoginAt',
};

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

  private get users(): Repository<User> {
    return this.dataSource.getRepository(User);
  }

  // ------------------------------------------------------------ Account management

  /**
   * The accounts an Admin governs.
   *
   * Email is included because it is how an Admin identifies the person they were asked about; nothing
   * else here is private. There is no route that would show this Admin a user's habits, budgets, or
   * expenses, so the listing cannot grow one by accident.
   */
  async listUsers(actor: AuthContext, query: AdminUserQueryDto): Promise<Page<ManagedUser>> {
    const request = toPageRequest(query);
    const builder = this.users.createQueryBuilder('user');

    if (query.keyword !== undefined) {
      builder.andWhere('(user.displayName ILIKE :keyword OR user.email ILIKE :keyword)', {
        keyword: `%${escapeLikePattern(query.keyword)}%`,
      });
    }

    if (query.role !== undefined) {
      builder.andWhere('user.role = :role', { role: query.role });
    }

    if (query.status !== undefined) {
      builder.andWhere('user.status = :status', { status: query.status });
    }

    const [users, total] = await builder
      .orderBy(SORT_COLUMNS[query.sortBy ?? 'createdAt'], query.sortDir ?? 'DESC')
      .addOrderBy('user.id', 'ASC')
      .skip(request.skip)
      .take(request.take)
      .getManyAndCount();

    return toPage(
      users.map((user) => toManagedUser(user, actor.userId)),
      total,
      request,
    );
  }

  /**
   * Suspends or reactivates an account.
   *
   * Suspension is how an account is removed from the platform — never deletion, which would orphan
   * ledger history and challenge ownership, both of which have to stay readable. `authenticate`
   * re-reads status on every request, so this takes effect on the suspended user's next call rather
   * than when their token expires.
   */
  async setStatus(actor: AuthContext, userId: string, status: UserStatus): Promise<ManagedUser> {
    const user = await this.requireUser(userId);

    // Suspending yourself locks you out of the only role that can undo it.
    if (user.id === actor.userId && status === UserStatus.SUSPENDED) {
      throw new ValidationError('You cannot suspend your own account');
    }

    if (user.status === status) return toManagedUser(user, actor.userId);

    user.status = status;
    return toManagedUser(await this.users.save(user), actor.userId);
  }

  /**
   * Changes which role an account holds.
   *
   * Existing rows are deliberately left alone: a demoted Creator's challenges keep their `created_by`,
   * and the ledger keeps every entry. Roles govern what may be done next, not what was done.
   *
   * One refusal, and it does more work than it looks like. An Admin cannot change their own role —
   * which is also what guarantees the platform always keeps a governing Admin, with no count of
   * remaining Admins needed anywhere.
   *
   * The argument: the caller is an active Admin (`authenticate` re-reads status, `authorize` re-reads
   * role) and is not this user. So if this user is *also* an active Admin, there are at least two, and
   * demoting one leaves at least one. And if this user is not an active Admin, demoting them cannot
   * reduce the number of active Admins at all. Either way the invariant survives.
   *
   * A "is this the last Admin?" count was here first. It could never fire in the case it was written
   * for — by the argument above — and did fire on a *suspended* Admin, refusing a change that could not
   * possibly strand anyone. A guard that is unreachable when needed and wrong when reached is worse
   * than none, so it is gone and the reasoning is written down instead.
   */
  async setRole(actor: AuthContext, userId: string, role: Role): Promise<ManagedUser> {
    const user = await this.requireUser(userId);

    if (user.id === actor.userId) {
      throw new ValidationError('You cannot change your own role');
    }

    if (user.role === role) return toManagedUser(user, actor.userId);

    user.role = role;
    return toManagedUser(await this.users.save(user), actor.userId);
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findOneBy({ id: userId });

    if (!user) {
      throw new NotFoundError('No user with that id');
    }

    return user;
  }

  // --------------------------------------------------------------------- Summary

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

function toManagedUser(user: User, actorId: string): ManagedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    leaderboardOptIn: user.leaderboardOptIn,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    isSelf: user.id === actorId,
  };
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
