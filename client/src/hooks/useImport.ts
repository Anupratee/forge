import { useMutation, useQuery } from '@tanstack/react-query';
import { expensesApi } from '../services/expenses';
import type { CreateExpenseInput } from '../services/expenses';
import { queryKeys } from '../services/queryKeys';
import type { ExpenseSource } from '../types/enums';
import { useInvalidate } from './useInvalidate';

/**
 * Which import routes this server offers.
 *
 * The AI route needs an API key a deployment may not have, and the specification's stated fallback is
 * manual and CSV entry. Asking once lets the screen hide a tab it cannot use, rather than presenting
 * it and explaining a 503 afterwards.
 */
export function useImportOptions() {
  return useQuery({
    queryKey: queryKeys.imports.options,
    queryFn: expensesApi.importOptions,
    // A deployment does not gain or lose its API key mid-session.
    staleTime: Infinity,
  });
}

/** Parses a CSV into a preview. Writes nothing — which is why it is safe to run on any upload. */
export function usePreviewCsv() {
  return useMutation({
    mutationFn: (file: File) => expensesApi.previewCsv(file),
  });
}

/**
 * Reads a statement PDF into the same preview shape.
 *
 * Slower than the CSV route by a wide margin — a model is reading a document — so the screen shows a
 * pending state rather than assuming it returns promptly.
 */
export function usePreviewStatement() {
  return useMutation({
    mutationFn: (file: File) => expensesApi.previewStatement(file),
  });
}

/**
 * Writes the rows the user accepted.
 *
 * Imported expenses count against budget goals for their month and category, so this invalidates
 * budgets as well — the same reason an ordinary expense write does.
 */
export function useConfirmImport() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({
      source,
      rows,
    }: {
      source: typeof ExpenseSource.CSV_IMPORT | typeof ExpenseSource.AI_IMPORT;
      rows: CreateExpenseInput[];
    }) => expensesApi.confirmImport(source, rows),
    onSuccess: () => invalidate(queryKeys.expenses.all, queryKeys.budgets.all),
  });
}
