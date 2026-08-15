import type { AdherenceResult, BudgetGoalSummary, MonthSummary, Page } from '../types/api';
import type { ExpenseCategory } from '../types/enums';
import type { QueryParams } from './api';
import { api, toParams } from './api';

export interface BudgetQuery extends QueryParams {
  keyword?: string;
  category?: ExpenseCategory;
  /** `YYYY-MM`. */
  month?: string;
  sortBy?: 'periodMonth' | 'category' | 'limitAmount' | 'createdAt';
  sortDir?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

export interface CreateBudgetGoalInput {
  title: string;
  description?: string;
  category: ExpenseCategory;
  /** `YYYY-MM`. One goal per category per month — the server has a unique key on it. */
  month: string;
  limitAmount: number;
}

/**
 * Category and month are absent on purpose: they identify which goal this is, and the server rejects
 * changing them. Moving a goal to another month would silently rewrite what it was measured against.
 */
export interface UpdateBudgetGoalInput {
  title?: string;
  description?: string;
  limitAmount?: number;
}

export const budgetsApi = {
  async list(query: BudgetQuery): Promise<Page<BudgetGoalSummary>> {
    const { data } = await api.get<Page<BudgetGoalSummary>>('/budgets', {
      params: toParams(query),
    });
    return data;
  },

  /** Everything the dashboard needs for one month in a single call. Defaults to the current month. */
  async monthSummary(month?: string): Promise<MonthSummary> {
    const { data } = await api.get<MonthSummary>('/budgets/summary', {
      params: toParams({ month }),
    });
    return data;
  },

  async getOne(id: string): Promise<BudgetGoalSummary> {
    const { data } = await api.get<BudgetGoalSummary>(`/budgets/${id}`);
    return data;
  },

  async create(input: CreateBudgetGoalInput): Promise<BudgetGoalSummary> {
    const { data } = await api.post<BudgetGoalSummary>('/budgets', input);
    return data;
  },

  async update(id: string, input: UpdateBudgetGoalInput): Promise<BudgetGoalSummary> {
    const { data } = await api.patch<BudgetGoalSummary>(`/budgets/${id}`, input);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/budgets/${id}`);
  },

  /**
   * Claims the staying-within-budget bonus, once the month has closed and the limit held.
   *
   * A POST because it awards points, and the server refuses a second claim with a unique key on the
   * ledger rather than by checking first.
   */
  async claimAdherence(id: string): Promise<AdherenceResult> {
    const { data } = await api.post<AdherenceResult>(`/budgets/${id}/adherence-claim`);
    return data;
  },
};
