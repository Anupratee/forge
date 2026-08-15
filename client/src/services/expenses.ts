import type {
  ExpensePage,
  ExpenseSummary,
  ImportOptions,
  ImportPreview,
  ImportResult,
} from '../types/api';
import type { ExpenseCategory, ExpenseSource } from '../types/enums';
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

  // -------------------------------------------------------------------- Import

  /** Whether this server can offer the AI route — it needs an API key a deployment may not have. */
  async importOptions(): Promise<ImportOptions> {
    const { data } = await api.get<ImportOptions>('/expenses/import/options');
    return data;
  },

  /** Parses a CSV and reports what it found. Writes nothing. */
  async previewCsv(file: File): Promise<ImportPreview> {
    const form = new FormData();
    form.append('file', file);

    const { data } = await api.post<ImportPreview>('/expenses/import/csv', form);
    return data;
  },

  /** Reads a statement PDF into the same preview shape. Also writes nothing. */
  async previewStatement(file: File): Promise<ImportPreview> {
    const form = new FormData();
    form.append('file', file);

    const { data } = await api.post<ImportPreview>('/expenses/import/statement', form);
    return data;
  },

  /**
   * Writes the rows the user reviewed and accepted.
   *
   * The server re-validates every row rather than trusting that these are the ones it offered — the
   * preview is a suggestion, and the rows come back edited by design.
   */
  async confirmImport(
    source: typeof ExpenseSource.CSV_IMPORT | typeof ExpenseSource.AI_IMPORT,
    rows: CreateExpenseInput[],
  ): Promise<ImportResult> {
    const { data } = await api.post<ImportResult>('/expenses/import/confirm', { source, rows });
    return data;
  },
};
