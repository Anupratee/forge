import type { ExpensePage, ExpenseSummary } from '../types/api';
import type { ExpenseCategory } from '../types/enums';
import type { QueryParams } from './api';
import { api, toFormData, toParams } from './api';

export interface ExpenseQuery extends QueryParams {
  keyword?: string;
  category?: ExpenseCategory;
  /** Inclusive range over the day the money was spent. */
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: 'spentOn' | 'amount' | 'category' | 'title' | 'createdAt';
  sortDir?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

export interface CreateExpenseInput {
  title: string;
  description?: string;
  amount: number;
  category: ExpenseCategory;
  /** `YYYY-MM-DD`. */
  spentOn: string;
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

function expenseBody(input: Partial<CreateExpenseInput>, receiptImage?: File) {
  return receiptImage === undefined
    ? input
    : toFormData(input, { name: 'receiptImage', value: receiptImage });
}

export const expensesApi = {
  /**
   * A page of expenses, plus totals across everything matching the filters.
   *
   * The totals come from a SQL aggregate over the whole matching set, not from summing the page — the
   * page is 20 rows and the answer to "how much did I spend on food this month" is not 20 rows.
   */
  async list(query: ExpenseQuery): Promise<ExpensePage> {
    const { data } = await api.get<ExpensePage>('/expenses', { params: toParams(query) });
    return data;
  },

  async getOne(id: string): Promise<ExpenseSummary> {
    const { data } = await api.get<ExpenseSummary>(`/expenses/${id}`);
    return data;
  },

  async create(input: CreateExpenseInput, receiptImage?: File): Promise<ExpenseSummary> {
    const { data } = await api.post<ExpenseSummary>('/expenses', expenseBody(input, receiptImage));
    return data;
  },

  async update(
    id: string,
    input: UpdateExpenseInput,
    receiptImage?: File,
  ): Promise<ExpenseSummary> {
    const { data } = await api.patch<ExpenseSummary>(
      `/expenses/${id}`,
      expenseBody(input, receiptImage),
    );
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/expenses/${id}`);
  },
};
