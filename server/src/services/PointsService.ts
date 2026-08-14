import type { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { PointsLedger } from '../entities/PointsLedger';
import type { PointsReason, PointsReferenceType } from '../entities/PointsLedger';
import { ConflictError } from '../utils/AppError';
import { isUniqueViolation } from '../utils/database';

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
