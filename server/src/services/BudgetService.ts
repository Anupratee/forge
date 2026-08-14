import type { DataSource, EntityManager, Repository } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import type {
  BudgetQueryDto,
  BudgetSortField,
  CreateBudgetGoalDto,
  UpdateBudgetGoalDto,
} from '../dtos/BudgetDto';
import { BudgetGoal } from '../entities/BudgetGoal';
import { Expense } from '../entities/Expense';
import type { ExpenseCategory } from '../entities/Expense';
import { PointsLedger, PointsReason, PointsReferenceType } from '../entities/PointsLedger';
import type { AuthContext } from '../middlewares/auth.middleware';
import { ConflictError, NotFoundError } from '../utils/AppError';
import { isUniqueViolation } from '../utils/database';
import { startOfMonth, today } from '../utils/date';
import { toPage, toPageRequest } from '../utils/pagination';
import type { Page } from '../utils/pagination';
import { PointsPolicy } from './PointsPolicy';
import type { PointsService } from './PointsService';
import { pointsService } from './PointsService';

export interface BudgetGoalSummary {
  id: string;
  title: string;
  description: string | null;
  category: ExpenseCategory;
  /** The month this goal governs, as `2026-08`. */
  month: string;
  limitAmount: number;
  /** Sum of matching expenses. Derived by SQL on every read, never stored. */
  spentAmount: number;
  remainingAmount: number;
  /** True once spending has passed the limit. */
  isOverBudget: boolean;
  /** Percentage of the limit used, capped for display at 999. */
  usedPercent: number;
  /** The month has closed and the goal was met, so the bonus can be claimed. */
  adherenceClaimable: boolean;
  adherenceClaimed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MonthSummary {
  month: string;
  totalSpent: number;
  totalBudgeted: number;
  goals: BudgetGoalSummary[];
  /** Spending in categories with no goal for the month — real spending no budget covers. */
  unbudgetedSpend: { category: ExpenseCategory; amount: number }[];
}

export interface AdherenceResult {
  goal: BudgetGoalSummary;
  pointsAwarded: number;
  balance: number;
}

const SORT_COLUMNS: Record<BudgetSortField, string> = {
  periodMonth: 'goal.periodMonth',
  category: 'goal.category',
  limitAmount: 'goal.limitAmount',
  createdAt: 'goal.createdAt',
};

/**
 * Monthly budget goals, and the reward for staying inside one.
 *
 * Nothing here stores progress. "How much of this budget is used" is a `SUM` over matching expenses,
 * evaluated per read — the same principle as the points balance, and for the same reason: a stored total
 * has to be updated on every expense write, edit, delete, and bulk import, and the one that drifts is the
 * one the reward is paid against.
 *
 * Expenses are matched on the natural `(user, month, category)` key rather than a foreign key, so a goal
 * created today immediately governs spending already logged this month.
 */
export class BudgetService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pointsService: PointsService,
  ) {}

  private get goals(): Repository<BudgetGoal> {
    return this.dataSource.getRepository(BudgetGoal);
  }

  async create(actor: AuthContext, input: CreateBudgetGoalDto): Promise<BudgetGoalSummary> {
    const periodMonth = `${input.month}-01`;

    try {
      const goal = await this.goals.save(
        this.goals.create({
          title: input.title.trim(),
          description: input.description ?? null,
          category: input.category,
          periodMonth,
          limitAmount: input.limitAmount,
          userId: actor.userId,
        }),
      );

      return this.summarize(goal);
    } catch (error) {
      // Two caps on one category in one month would make "did they stay within budget" ambiguous, and the
      // adherence award depends on that answer having exactly one meaning.
      if (isUniqueViolation(error, 'uq_budget_goal_user_month_category')) {
        throw new ConflictError(
          `A ${input.category} budget already exists for ${input.month}. Edit that goal instead.`,
        );
      }
      throw error;
    }
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateBudgetGoalDto,
  ): Promise<BudgetGoalSummary> {
    const goal = await this.requireOwned(actor, id);

    if (input.title !== undefined) goal.title = input.title.trim();
    if (input.description !== undefined) goal.description = input.description;
    if (input.limitAmount !== undefined) goal.limitAmount = input.limitAmount;

    await this.goals.save(goal);
    return this.summarize(goal);
  }

  async remove(actor: AuthContext, id: string): Promise<void> {
    const goal = await this.requireOwned(actor, id);
    await this.goals.delete(goal.id);
  }

  async getOne(actor: AuthContext, id: string): Promise<BudgetGoalSummary> {
    return this.summarize(await this.requireOwned(actor, id));
  }

  async list(actor: AuthContext, query: BudgetQueryDto): Promise<Page<BudgetGoalSummary>> {
    const request = toPageRequest(query);

    const builder = this.goals
      .createQueryBuilder('goal')
      .where('goal.userId = :userId', { userId: actor.userId });

    if (query.category !== undefined) {
      builder.andWhere('goal.category = :category', { category: query.category });
    }
    if (query.month !== undefined) {
      builder.andWhere('goal.periodMonth = :periodMonth', { periodMonth: `${query.month}-01` });
    }
    if (query.dateFrom !== undefined) {
      builder.andWhere('goal.periodMonth >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo !== undefined) {
      builder.andWhere('goal.periodMonth <= :dateTo', { dateTo: query.dateTo });
    }

    builder
      .orderBy(SORT_COLUMNS[query.sortBy ?? 'periodMonth'], query.sortDir ?? 'DESC')
      .addOrderBy('goal.id', 'ASC')
      .skip(request.skip)
      .take(request.take);

    const [goals, total] = await builder.getManyAndCount();
    const summaries = await Promise.all(goals.map((goal) => this.summarize(goal)));

    return toPage(summaries, total, request);
  }

  /** Everything the dashboard needs for one month, in one call. */
  async getMonthSummary(actor: AuthContext, month: string | undefined): Promise<MonthSummary> {
    const period = month === undefined ? startOfMonth(today()) : `${month}-01`;

    const goals = await this.goals.find({
      where: { userId: actor.userId, periodMonth: period },
      order: { category: 'ASC' },
    });

    const spendByCategory = await this.spendByCategory(actor.userId, period);
    const summaries = await Promise.all(goals.map((goal) => this.summarize(goal)));
    const budgetedCategories = new Set(goals.map((goal) => goal.category));

    return {
      month: period.slice(0, 7),
      totalSpent: [...spendByCategory.values()].reduce((sum, amount) => sum + amount, 0),
      totalBudgeted: goals.reduce((sum, goal) => sum + goal.limitAmount, 0),
      goals: summaries,
      unbudgetedSpend: [...spendByCategory.entries()]
        .filter(([category]) => !budgetedCategories.has(category))
        .map(([category, amount]) => ({ category, amount })),
    };
  }

  /**
   * Claims the reward for keeping a month's spending inside its limit.
   *
   * Claimed explicitly rather than granted automatically, because there is no scheduler here and the
   * alternative would be awarding it on a read — a request that quietly mints points is not something to
   * put on a GET.
   *
   * The month must be over. Allowing a claim mid-month would pay out on day one, before any spending had
   * happened, and there would be no way to take it back when the limit was later breached.
   */
  async claimAdherence(actor: AuthContext, id: string): Promise<AdherenceResult> {
    const goal = await this.requireOwned(actor, id);
    const currentPeriod = startOfMonth(today());

    if (goal.periodMonth >= currentPeriod) {
      throw new ConflictError(
        `The ${goal.periodMonth.slice(0, 7)} budget period has not closed yet. This can be claimed once the month is over.`,
      );
    }

    const spent = await this.spentOn(this.dataSource.manager, goal);
    if (spent > goal.limitAmount) {
      throw new ConflictError(
        `This budget was exceeded: ${spent} spent against a limit of ${goal.limitAmount}.`,
      );
    }

    const entry = await this.dataSource.transaction(async (manager) =>
      // The ledger's unique key on (reference_type, reference_id, reason) is what makes a second claim
      // fail, rather than a preceding "has this been claimed?" read that two requests would both pass.
      this.pointsService.award(manager, {
        userId: actor.userId,
        amount: PointsPolicy.BUDGET_ADHERENCE,
        reason: PointsReason.BUDGET_ADHERENCE,
        referenceType: PointsReferenceType.BUDGET_GOAL,
        referenceId: goal.id,
        description: `Stayed within the ${goal.category} budget for ${goal.periodMonth.slice(0, 7)}`,
      }),
    );

    return {
      goal: await this.summarize(goal),
      pointsAwarded: entry.amount,
      balance: await this.pointsService.getBalance(actor.userId),
    };
  }

  // ---------------------------------------------------------------- Internal

  private async requireOwned(actor: AuthContext, id: string): Promise<BudgetGoal> {
    const goal = await this.goals.findOneBy({ id, userId: actor.userId });

    // Scoped in the query and reported as absent: budgets are private, so a 403 would confirm that someone
    // else has a goal under this id.
    if (!goal) {
      throw new NotFoundError('No budget goal with that id');
    }

    return goal;
  }

  private async summarize(goal: BudgetGoal): Promise<BudgetGoalSummary> {
    const [spentAmount, adherenceClaimed] = await Promise.all([
      this.spentOn(this.dataSource.manager, goal),
      this.adherenceClaimed(goal.id),
    ]);

    const isOverBudget = spentAmount > goal.limitAmount;
    const monthHasClosed = goal.periodMonth < startOfMonth(today());

    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      category: goal.category,
      month: goal.periodMonth.slice(0, 7),
      limitAmount: goal.limitAmount,
      spentAmount,
      remainingAmount: round2(goal.limitAmount - spentAmount),
      isOverBudget,
      usedPercent: Math.min(999, Math.round((spentAmount / goal.limitAmount) * 100)),
      adherenceClaimable: monthHasClosed && !isOverBudget && !adherenceClaimed,
      adherenceClaimed,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    };
  }

  /**
   * Spending against one goal, matched on `(user, month, category)`.
   *
   * PostgreSQL does the arithmetic in `numeric` and returns one value. Summing money in JavaScript across
   * many rows would accumulate binary floating-point error; one already-summed value converts exactly at
   * two decimal places.
   */
  private async spentOn(manager: EntityManager, goal: BudgetGoal): Promise<number> {
    const result = await manager
      .createQueryBuilder(Expense, 'expense')
      .select('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.userId = :userId', { userId: goal.userId })
      .andWhere('expense.category = :category', { category: goal.category })
      // date_trunc rather than a range, so the month comparison cannot be off by a day at either end.
      .andWhere("date_trunc('month', expense.spentOn) = :periodMonth::date", {
        periodMonth: goal.periodMonth,
      })
      .getRawOne<{ total: string }>();

    return Number(result?.total ?? 0);
  }

  private async spendByCategory(
    userId: string,
    periodMonth: string,
  ): Promise<Map<ExpenseCategory, number>> {
    const rows = await this.dataSource
      .createQueryBuilder(Expense, 'expense')
      .select('expense.category', 'category')
      .addSelect('SUM(expense.amount)', 'total')
      .where('expense.userId = :userId', { userId })
      .andWhere("date_trunc('month', expense.spentOn) = :periodMonth::date", { periodMonth })
      .groupBy('expense.category')
      .getRawMany<{ category: ExpenseCategory; total: string }>();

    return new Map(rows.map((row) => [row.category, Number(row.total)]));
  }

  private async adherenceClaimed(goalId: string): Promise<boolean> {
    const count = await this.dataSource.getRepository(PointsLedger).countBy({
      referenceType: PointsReferenceType.BUDGET_GOAL,
      referenceId: goalId,
      reason: PointsReason.BUDGET_ADHERENCE,
    });

    return count > 0;
  }
}

/** Two decimal places, so a subtraction of two money values does not surface float noise in a response. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const budgetService = new BudgetService(AppDataSource, pointsService);
