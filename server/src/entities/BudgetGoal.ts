import { Check, Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { numericTransformer } from '../utils/numeric.transformer';
import { AuditedEntity } from './AuditedEntity';
import { ExpenseCategory } from './Expense';
import { User } from './User';

/**
 * A spending cap a User sets for one category in one month.
 *
 * Progress is never stored here. "How much of this budget is used" is
 * `SUM(expenses.amount)` over the matching user, category, and month — the same principle as the
 * points ledger: derive from the facts, so there is nothing to keep in sync.
 */
@Entity('budget_goals')
/**
 * One goal per user, month, and category. Two caps on the same category in the same month would make
 * "did they stay within budget" ambiguous, and the month-end award depends on that answer.
 */
@Unique('uq_budget_goal_user_month_category', ['userId', 'periodMonth', 'category'])
/**
 * `period_month` identifies a month, stored as its first day. The check keeps that representation
 * honest — without it, two rows could mean the same month while looking distinct to the unique
 * constraint above.
 */
@Check('ck_budget_goals_period_is_month_start', 'EXTRACT(DAY FROM "period_month") = 1')
@Check('ck_budget_goals_limit_positive', '"limit_amount" > 0')
export class BudgetGoal extends AuditedEntity {
  @Column({ type: 'varchar', length: 140 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: ExpenseCategory })
  category!: ExpenseCategory;

  /** The month this goal governs, as its first day: `2026-08-01` means August 2026. */
  @Column({ type: 'date' })
  periodMonth!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  limitAmount!: number;

  /** Optional supporting document, e.g. a statement the user based the budget on. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  attachment!: string | null;

  @ManyToOne(() => User, (user) => user.budgetGoals, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;
}
