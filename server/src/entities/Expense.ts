import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { numericTransformer } from '../utils/numeric.transformer';
import { AuditedEntity } from './AuditedEntity';
import { User } from './User';

/**
 * The shared spending vocabulary. A `BudgetGoal` caps one of these categories for one month, and an
 * expense is measured against the goal that shares its category — so both sides must draw from the
 * same list or the comparison is meaningless.
 */
export enum ExpenseCategory {
  FOOD = 'FOOD',
  HOUSING = 'HOUSING',
  TRANSPORT = 'TRANSPORT',
  UTILITIES = 'UTILITIES',
  HEALTH = 'HEALTH',
  ENTERTAINMENT = 'ENTERTAINMENT',
  EDUCATION = 'EDUCATION',
  SHOPPING = 'SHOPPING',
  SAVINGS = 'SAVINGS',
  OTHER = 'OTHER',
}

/**
 * How the row got here. Kept because a bulk import can go wrong in ways manual entry cannot, and
 * being able to identify and undo one import batch is worth a single column.
 */
export enum ExpenseSource {
  MANUAL = 'MANUAL',
  CSV_IMPORT = 'CSV_IMPORT',
  AI_IMPORT = 'AI_IMPORT',
}

/**
 * A single logged expense, owned by a User and private to them.
 *
 * There is deliberately no foreign key to `BudgetGoal`. An expense is a fact about what was spent;
 * a goal is policy about a `(month, category)` pair that the user may set, change, or add long after
 * the fact. Joining them on that natural key means a goal created today immediately governs
 * expenses already logged this month, and an import never has to invent a goal to attach to.
 */
@Entity('expenses')
// The expense list is always scoped to one user and filtered by date range, then by category.
@Index('ix_expenses_user_spent_on', ['userId', 'spentOn'])
@Index('ix_expenses_user_category', ['userId', 'category'])
@Check('ck_expenses_amount_positive', '"amount" > 0')
export class Expense extends AuditedEntity {
  @Column({ type: 'varchar', length: 140 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @Column({ type: 'enum', enum: ExpenseCategory })
  category!: ExpenseCategory;

  /** The day the money was spent, `YYYY-MM-DD` — this is what assigns it to a budget month. */
  @Column({ type: 'date' })
  spentOn!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  receiptImage!: string | null;

  @Column({ type: 'enum', enum: ExpenseSource, default: ExpenseSource.MANUAL })
  source!: ExpenseSource;

  @ManyToOne(() => User, (user) => user.expenses, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;
}
