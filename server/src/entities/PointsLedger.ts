import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { AppendOnlyEntity } from './AppendOnlyEntity';
import { User } from './User';

/** Why points moved. Shown to the user in their ledger, and the audit trail for the economy. */
export enum PointsReason {
  HABIT_COMPLETION = 'HABIT_COMPLETION',
  HABIT_STREAK_BONUS = 'HABIT_STREAK_BONUS',
  CHALLENGE_CHECK_IN = 'CHALLENGE_CHECK_IN',
  CHALLENGE_COMPLETION = 'CHALLENGE_COMPLETION',
  BUDGET_ADHERENCE = 'BUDGET_ADHERENCE',
  REDEMPTION = 'REDEMPTION',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
}

/** Which table `referenceId` points at. */
export enum PointsReferenceType {
  HABIT_COMPLETION = 'HABIT_COMPLETION',
  CHALLENGE_CHECK_IN = 'CHALLENGE_CHECK_IN',
  CHALLENGE_PARTICIPATION = 'CHALLENGE_PARTICIPATION',
  BUDGET_GOAL = 'BUDGET_GOAL',
  REDEMPTION = 'REDEMPTION',
}

/**
 * The append-only event log that *is* the points economy.
 *
 * No entity caches a balance. A balance is `SUM(amount)` over this table for a user, which means
 * there is no second copy of the number and therefore nothing that can drift out of agreement with
 * its own history. `PointsService` is the only code permitted to insert here.
 *
 * `amount` is signed — positive for an award, negative for a spend — so summing needs no case
 * analysis and a `direction` column would only be a way to contradict the sign.
 */
@Entity('points_ledger')
// Balance and ledger reads are both "this user, newest first".
@Index('ix_points_ledger_user_created_at', ['userId', 'createdAt'])
/**
 * The idempotency guard for once-only awards.
 *
 * A given source event may pay out at most once for a given reason: one award per check-in, one
 * completion bonus per participation, one adherence bonus per budget goal, one charge per
 * redemption. Because PostgreSQL treats NULLs as distinct in a unique index, rows with no reference
 * — an Admin adjustment — are unconstrained, which is exactly the intent.
 *
 * Every earn path inserts its trigger row and this row in the same transaction, so a constraint
 * violation on either side rolls back both.
 */
@Unique('uq_points_ledger_reference', ['referenceType', 'referenceId', 'reason'])
@Check('ck_points_ledger_amount_non_zero', '"amount" <> 0')
export class PointsLedger extends AppendOnlyEntity {
  @ManyToOne(() => User, (user) => user.ledgerEntries, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'int' })
  amount!: number;

  @Column({ type: 'enum', enum: PointsReason })
  reason!: PointsReason;

  /**
   * The event that caused this entry.
   *
   * Intentionally not a foreign key: it refers to one of several tables, and Postgres cannot express
   * a polymorphic reference. Integrity comes from the transaction instead — the referenced row and
   * this entry are always committed together — and the unique constraint above is what actually
   * depends on these two columns.
   */
  @Column({ type: 'enum', enum: PointsReferenceType, nullable: true })
  referenceType!: PointsReferenceType | null;

  @Column({ type: 'uuid', nullable: true })
  referenceId!: string | null;

  /** Human-readable detail for the user's ledger view, e.g. the habit or challenge name. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  description!: string | null;
}
