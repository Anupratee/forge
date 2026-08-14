import type { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { PointsLedger } from '../entities/PointsLedger';
import type { PointsReason, PointsReferenceType } from '../entities/PointsLedger';
import { User } from '../entities/User';
import type { ListQueryDto } from '../dtos/ListQueryDto';
import { ConflictError } from '../utils/AppError';
import { isUniqueViolation } from '../utils/database';
import { toPage, toPageRequest } from '../utils/pagination';
import type { Page } from '../utils/pagination';

export interface AwardInput {
  userId: string;
  /** Always positive. Spending is a separate operation, so a negative award is a bug, not a refund. */
  amount: number;
  reason: PointsReason;
  /** Which table and row caused this. Together with `reason`, the idempotency key. */
  referenceType: PointsReferenceType;
  referenceId: string;
  description?: string;
}

/** Spending mirrors {@link AwardInput}; `amount` is positive here too and stored negative. */
export interface SpendInput {
  userId: string;
  amount: number;
  reason: PointsReason;
  referenceType: PointsReferenceType;
  referenceId: string;
  description?: string;
}

/** A ledger row as the API describes it. `referenceId` is internal and deliberately not exposed. */
export interface LedgerEntry {
  id: string;
  amount: number;
  reason: PointsReason;
  description: string | null;
  createdAt: Date;
}

/**
 * The only code permitted to write to `points_ledger`.
 *
 * The ledger is append-only and is the sole source of truth for a balance — no entity stores one, so there
 * is no second copy to fall out of agreement with its own history. A balance is `SUM(amount)`, and the
 * sign of `amount` carries the direction, so nothing has to be reconciled.
 */
export class PointsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Records an award.
   *
   * The `EntityManager` is a required parameter, not an optional one. Every earning action has to write
   * its triggering row and this ledger row in a single transaction — a check-in that succeeds while its
   * award fails would leave the user permanently unable to earn for that day, since the unique key on the
   * check-in blocks a retry. Demanding a manager makes that structural: there is no way to call this
   * outside a transaction and accidentally decouple the two writes.
   *
   * Double awards are prevented by the unique key on `(reference_type, reference_id, reason)` rather than
   * by a preceding "have we already paid for this?" read, which two concurrent requests would both pass.
   */
  async award(manager: EntityManager, input: AwardInput): Promise<PointsLedger> {
    const entry = manager.create(PointsLedger, {
      userId: input.userId,
      amount: input.amount,
      reason: input.reason,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description ?? null,
    });

    try {
      return await manager.save(entry);
    } catch (error) {
      if (isUniqueViolation(error, 'uq_points_ledger_reference')) {
        throw new ConflictError('These points have already been awarded');
      }
      throw error;
    }
  }

  /**
   * Records a spend, after proving the balance covers it.
   *
   * Like `award`, this requires a caller-supplied transaction — a redemption has to write the redemption
   * row, decrement stock, and record this entry together or not at all.
   *
   * The user row is locked first. Without that lock, summing the ledger and then inserting is a race: two
   * concurrent redemptions both read a balance of 150, both approve a 100-point purchase, and the user ends
   * up 50 points overdrawn with no constraint to catch it. There is no "balance" column a check constraint
   * could defend, precisely because the ledger is the only source of truth — so the lock is the defence.
   *
   * Locking the *user* is what makes this correct: it serialises that user's spending without serialising
   * everyone else's.
   */
  async spend(manager: EntityManager, input: SpendInput): Promise<PointsLedger> {
    await manager.findOne(User, {
      where: { id: input.userId },
      lock: { mode: 'pessimistic_write' },
    });

    const balance = await this.getBalance(input.userId, manager);

    if (balance < input.amount) {
      throw new ConflictError(
        `This costs ${input.amount} points and you have ${balance}. Earn ${input.amount - balance} more to redeem it.`,
      );
    }

    const entry = manager.create(PointsLedger, {
      userId: input.userId,
      // Stored negative. Direction lives in the sign, so a balance is a plain SUM and no second column can
      // contradict it.
      amount: -input.amount,
      reason: input.reason,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description ?? null,
    });

    try {
      return await manager.save(entry);
    } catch (error) {
      if (isUniqueViolation(error, 'uq_points_ledger_reference')) {
        throw new ConflictError('These points have already been spent');
      }
      throw error;
    }
  }

  /**
   * The caller's own ledger, newest first.
   *
   * Covered by the index on `(user_id, created_at)`, which is the same access path the balance uses.
   */
  async listLedger(userId: string, query: ListQueryDto): Promise<Page<LedgerEntry>> {
    const request = toPageRequest(query);

    const builder = this.dataSource
      .createQueryBuilder(PointsLedger, 'ledger')
      .where('ledger.userId = :userId', { userId });

    if (query.dateFrom !== undefined) {
      builder.andWhere('ledger.createdAt >= :dateFrom::date', { dateFrom: query.dateFrom });
    }
    if (query.dateTo !== undefined) {
      // Exclusive upper bound on the next day, so an inclusive date filter catches entries later in the day.
      builder.andWhere('ledger.createdAt < (:dateTo::date + 1)', { dateTo: query.dateTo });
    }

    const [entries, total] = await builder
      .orderBy('ledger.createdAt', query.sortDir ?? 'DESC')
      .addOrderBy('ledger.id', 'ASC')
      .skip(request.skip)
      .take(request.take)
      .getManyAndCount();

    return toPage(
      entries.map((entry) => ({
        id: entry.id,
        amount: entry.amount,
        reason: entry.reason,
        description: entry.description,
        createdAt: entry.createdAt,
      })),
      total,
      request,
    );
  }

  /**
   * A user's current balance, summed from the ledger.
   *
   * Takes an optional manager so it can be read inside a transaction that has just written to the ledger
   * and see its own uncommitted rows — a check-in response reporting a balance that excludes the points it
   * just awarded would look like a bug.
   *
   * PostgreSQL does the summing. The index on `(user_id, created_at)` covers the lookup.
   */
  async getBalance(userId: string, manager?: EntityManager): Promise<number> {
    const result = await (manager ?? this.dataSource.manager)
      .createQueryBuilder(PointsLedger, 'ledger')
      .select('COALESCE(SUM(ledger.amount), 0)', 'balance')
      .where('ledger.userId = :userId', { userId })
      .getRawOne<{ balance: string }>();

    // `numeric`/`bigint` aggregates come back as strings from the driver.
    return Number(result?.balance ?? 0);
  }
}

export const pointsService = new PointsService(AppDataSource);
