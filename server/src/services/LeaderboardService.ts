import type { DataSource } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import type { ListQueryDto } from '../dtos/ListQueryDto';
import type { CosmeticTheme } from '../entities/RewardItem';
import { RewardItemType } from '../entities/RewardItem';
import { UserStatus } from '../entities/User';
import type { AuthContext } from '../middlewares/auth.middleware';
import { toPage, toPageRequest } from '../utils/pagination';
import type { Page } from '../utils/pagination';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  balance: number;
  /** The palette of the cosmetic this user is wearing, if any — the point of buying one. */
  theme: CosmeticTheme | null;
  isSelf: boolean;
}

/** Where the caller stands, whether or not their rank falls on the page being shown. */
export interface SelfStanding {
  optedIn: boolean;
  /** Null when they have not opted in, since an unranked user has no position. */
  rank: number | null;
  balance: number;
}

export type LeaderboardPage = Page<LeaderboardEntry> & { me: SelfStanding };

interface RankedRow {
  user_id: string;
  display_name: string;
  /** `SUM` over an integer column is a bigint, which the driver returns as a string. */
  balance: string;
  rank: string;
  theme: CosmeticTheme | null;
}

/**
 * Standings, aggregated from the points ledger.
 *
 * Two properties this is built around:
 *
 * **It is opt-in.** A user who has not opted in is absent from the ranking entirely — not hidden at
 * render time, but excluded by the query, so there is no response containing their standing that a
 * client could be careless with. Suspended accounts are excluded for the same reason.
 *
 * **The ranking is computed by PostgreSQL, not assembled here.** `RANK()` gives tied balances the same
 * position, and paging works because the window is evaluated over the whole eligible set before the
 * page is taken. Ranking in JavaScript would mean fetching every user to number them.
 */
export class LeaderboardService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * One page of the ranking, plus the caller's own standing.
   *
   * `me` is returned separately because a user outside the visible page still wants to know where they
   * are, and their rank is the one row a client cannot derive from what it was sent.
   */
  async list(actor: AuthContext, query: ListQueryDto): Promise<LeaderboardPage> {
    const request = toPageRequest(query);

    /*
     * Written as SQL rather than through the query builder because of the window function: `RANK()`
     * has to be evaluated over the whole eligible set before `LIMIT` applies, which a CTE expresses
     * directly and a builder only obscures. Every value is a bound parameter.
     *
     * The `LEFT JOIN` on the ledger matters — a user who has opted in but never earned anything still
     * appears, at zero, rather than vanishing from their own leaderboard.
     */
    const rankedCte = `
      SELECT
        u.id                                   AS user_id,
        u.display_name                         AS display_name,
        COALESCE(SUM(l.amount), 0)             AS balance,
        RANK() OVER (ORDER BY COALESCE(SUM(l.amount), 0) DESC) AS rank,
        MAX(ri.cosmetic_theme::text)           AS theme
      FROM users u
      LEFT JOIN points_ledger l ON l.user_id = u.id
      LEFT JOIN redemptions r   ON r.id = u.equipped_redemption_id
      LEFT JOIN reward_items ri ON ri.id = r.reward_item_id AND ri.type = $1
      WHERE u.leaderboard_opt_in = true AND u.status = $2
      GROUP BY u.id, u.display_name
    `;

    const [rows, totals, self] = await Promise.all([
      this.dataSource.query<RankedRow[]>(
        `WITH ranked AS (${rankedCte})
         SELECT * FROM ranked ORDER BY rank ASC, display_name ASC LIMIT $3 OFFSET $4`,
        [RewardItemType.COSMETIC, UserStatus.ACTIVE, request.take, request.skip],
      ),

      this.dataSource.query<{ count: string }[]>(
        `WITH ranked AS (${rankedCte}) SELECT COUNT(*) AS count FROM ranked`,
        [RewardItemType.COSMETIC, UserStatus.ACTIVE],
      ),

      this.dataSource.query<{ rank: string; balance: string }[]>(
        `WITH ranked AS (${rankedCte})
         SELECT rank, balance FROM ranked WHERE user_id = $3`,
        [RewardItemType.COSMETIC, UserStatus.ACTIVE, actor.userId],
      ),
    ]);

    const standing = self[0];

    return {
      ...toPage(
        rows.map((row) => ({
          rank: Number(row.rank),
          userId: row.user_id,
          displayName: row.display_name,
          balance: Number(row.balance),
          theme: parseTheme(row.theme),
          isSelf: row.user_id === actor.userId,
        })),
        Number(totals[0]?.count ?? 0),
        request,
      ),

      me:
        standing === undefined
          ? // Absent from the ranking means they have not opted in (or are not active). Their balance
            // is their own to read from `/points/balance`; reporting 0 here would be wrong, so the
            // client asks the endpoint that actually knows.
            { optedIn: false, rank: null, balance: 0 }
          : { optedIn: true, rank: Number(standing.rank), balance: Number(standing.balance) },
    };
  }
}

/**
 * `MAX(...::text)` is how the theme survives the `GROUP BY` — the aggregate needs a comparable type,
 * and a `jsonb` column has no ordering operator. There is at most one equipped redemption per user, so
 * the aggregate is picking from a single row.
 */
function parseTheme(value: CosmeticTheme | string | null): CosmeticTheme | null {
  if (value === null) return null;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value) as CosmeticTheme;
  } catch {
    return null;
  }
}

export const leaderboardService = new LeaderboardService(AppDataSource);
