import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { expensesApi } from '../services/expenses';
import type { CreateExpenseInput, ExpenseQuery, UpdateExpenseInput } from '../services/expenses';
import { queryKeys } from '../services/queryKeys';
import { useInvalidate } from './useInvalidate';

// --------------------------------------------------------------------- Reads

export function useExpenses(query: ExpenseQuery) {
  return useQuery({
    queryKey: queryKeys.expenses.list(query),
    queryFn: () => expensesApi.list(query),
    placeholderData: keepPreviousData,
  });
}

// -------------------------------------------------------------------- Writes

/**
 * Every expense write invalidates budgets as well.
 *
 * Expenses and goals have no foreign key between them — they meet on the natural `(user, month,
 * category)` key — so a new expense silently changes the spend on whichever goal covers that month and
 * category. Nothing in the response says which goal that was, and the honest answer is to re-read them.
 */
const AFFECTED = [queryKeys.expenses.all, queryKeys.budgets.all] as const;

export function useCreateExpense() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ input, receiptImage }: { input: CreateExpenseInput; receiptImage?: File }) =>
      expensesApi.create(input, receiptImage),
    onSuccess: () => invalidate(...AFFECTED),
  });
}

export function useUpdateExpense() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({
      id,
      input,
      receiptImage,
    }: {
      id: string;
      input: UpdateExpenseInput;
      receiptImage?: File;
    }) => expensesApi.update(id, input, receiptImage),
    onSuccess: () => invalidate(...AFFECTED),
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id: string) => expensesApi.remove(id),
    onSuccess: () => invalidate(...AFFECTED),
  });
}
