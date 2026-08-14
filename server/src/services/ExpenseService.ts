import type { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import type {
  CreateExpenseDto,
  ExpenseQueryDto,
  ExpenseSortField,
  UpdateExpenseDto,
} from '../dtos/ExpenseDto';
import { Expense, ExpenseSource } from '../entities/Expense';
import type { ExpenseCategory } from '../entities/Expense';
import type { AuthContext } from '../middlewares/auth.middleware';
import { NotFoundError, ValidationError } from '../utils/AppError';
import { today } from '../utils/date';
import { toPage, toPageRequest } from '../utils/pagination';
import type { Page } from '../utils/pagination';
import { escapeLikePattern } from '../utils/sql';

export interface ExpenseSummary {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  category: ExpenseCategory;
  spentOn: string;
  receiptImage: string | null;
  source: ExpenseSource;
  createdAt: Date;
  updatedAt: Date;
}

/** Totals for the filtered set, so a client need not sum a page to show "matching total". */
export interface ExpenseTotals {
  matchingTotal: number;
  matchingCount: number;
}

const SORT_COLUMNS: Record<ExpenseSortField, string> = {
  spentOn: 'expense.spentOn',
  amount: 'expense.amount',
  category: 'expense.category',
  title: 'expense.title',
  createdAt: 'expense.createdAt',
};

/**
 * Logged expenses, private to their owner.
 *
 * Every read is scoped to one user by the single query builder below, so no endpoint added later can expose
 * another user's spending — the specification puts budget data alongside habits as strictly private.
 */
export class ExpenseService {
  constructor(private readonly dataSource: DataSource) {}

  private get expenses(): Repository<Expense> {
    return this.dataSource.getRepository(Expense);
  }

  async create(
    actor: AuthContext,
    input: CreateExpenseDto,
    receipt: string | null,
  ): Promise<ExpenseSummary> {
    assertNotFuture(input.spentOn);

    const expense = await this.expenses.save(
      this.expenses.create({
        title: input.title.trim(),
        description: input.description ?? null,
        amount: input.amount,
        category: input.category,
        spentOn: input.spentOn,
        receiptImage: receipt,
        // Set by the server, never accepted from the request: a client able to relabel a manual entry as
        // an import would make the audit trail worthless. Phase 7's importers pass their own value.
        source: ExpenseSource.MANUAL,
        userId: actor.userId,
      }),
    );

    return toSummary(expense);
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateExpenseDto,
    receipt: string | null,
  ): Promise<ExpenseSummary> {
    const expense = await this.requireOwned(actor, id);

    if (input.spentOn !== undefined) assertNotFuture(input.spentOn);

    if (input.title !== undefined) expense.title = input.title.trim();
    if (input.description !== undefined) expense.description = input.description;
    if (input.amount !== undefined) expense.amount = input.amount;
    if (input.category !== undefined) expense.category = input.category;
    if (input.spentOn !== undefined) expense.spentOn = input.spentOn;
    if (receipt !== null) expense.receiptImage = receipt;

    await this.expenses.save(expense);
    return toSummary(expense);
  }

  async remove(actor: AuthContext, id: string): Promise<void> {
    const expense = await this.requireOwned(actor, id);
    await this.expenses.delete(expense.id);
  }

  async getOne(actor: AuthContext, id: string): Promise<ExpenseSummary> {
    return toSummary(await this.requireOwned(actor, id));
  }

  /**
   * The filtered, sorted, paginated expense log — plus the total across everything that matched.
   *
   * The total is a separate SQL aggregate rather than a sum of the page. Summing the page would answer a
   * different question, and summing every matching row in JavaScript would both defeat pagination and
   * accumulate floating-point error across hundreds of values.
   */
  async list(
    actor: AuthContext,
    query: ExpenseQueryDto,
  ): Promise<Page<ExpenseSummary> & ExpenseTotals> {
    const request = toPageRequest(query);

    const builder = this.scopedQuery(actor, query);
    const totalsBuilder = this.scopedQuery(actor, query);

    builder
      .orderBy(SORT_COLUMNS[query.sortBy ?? 'spentOn'], query.sortDir ?? 'DESC')
      .addOrderBy('expense.id', 'ASC')
      .skip(request.skip)
      .take(request.take);

    const [[expenses, total], totals] = await Promise.all([
      builder.getManyAndCount(),
      totalsBuilder
        .select('COALESCE(SUM(expense.amount), 0)', 'matchingTotal')
        .getRawOne<{ matchingTotal: string }>(),
    ]);

    return {
      ...toPage(expenses.map(toSummary), total, request),
      matchingTotal: Number(totals?.matchingTotal ?? 0),
      matchingCount: total,
    };
  }

  // ---------------------------------------------------------------- Internal

  /** The only way expenses are read: always narrowed to one owner first. */
  private scopedQuery(actor: AuthContext, query: ExpenseQueryDto) {
    const builder = this.expenses
      .createQueryBuilder('expense')
      .where('expense.userId = :userId', { userId: actor.userId });

    if (query.keyword !== undefined) {
      builder.andWhere('(expense.title ILIKE :keyword OR expense.description ILIKE :keyword)', {
        keyword: `%${escapeLikePattern(query.keyword)}%`,
      });
    }

    if (query.category !== undefined) {
      builder.andWhere('expense.category = :category', { category: query.category });
    }

    // Inclusive on both ends, filtering the day the money was spent.
    if (query.dateFrom !== undefined) {
      builder.andWhere('expense.spentOn >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo !== undefined) {
      builder.andWhere('expense.spentOn <= :dateTo', { dateTo: query.dateTo });
    }

    if (query.minAmount !== undefined) {
      builder.andWhere('expense.amount >= :minAmount', { minAmount: query.minAmount });
    }
    if (query.maxAmount !== undefined) {
      builder.andWhere('expense.amount <= :maxAmount', { maxAmount: query.maxAmount });
    }

    return builder;
  }

  private async requireOwned(actor: AuthContext, id: string): Promise<Expense> {
    const expense = await this.expenses.findOneBy({ id, userId: actor.userId });

    if (!expense) {
      throw new NotFoundError('No expense with that id');
    }

    return expense;
  }
}

/**
 * Refuses a future-dated expense.
 *
 * A business invariant, not a shape rule: the DTO can check that `spentOn` is a date, but only the server
 * knows what today is. Without this, spending could be logged into a month whose budget has not begun.
 */
function assertNotFuture(spentOn: string): void {
  if (spentOn > today()) {
    throw new ValidationError('spentOn cannot be in the future');
  }
}

function toSummary(expense: Expense): ExpenseSummary {
  return {
    id: expense.id,
    title: expense.title,
    description: expense.description,
    amount: expense.amount,
    category: expense.category,
    spentOn: expense.spentOn,
    receiptImage: expense.receiptImage,
    source: expense.source,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

export const expenseService = new ExpenseService(AppDataSource);
