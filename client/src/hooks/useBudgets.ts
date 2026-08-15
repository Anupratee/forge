import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { budgetsApi } from '../services/budgets';
import type {
  BudgetQuery,
  CreateBudgetGoalInput,
  UpdateBudgetGoalInput,
} from '../services/budgets';
import { queryKeys } from '../services/queryKeys';
import { useInvalidate } from './useInvalidate';

// --------------------------------------------------------------------- Reads

export function useBudgetGoals(query: BudgetQuery) {
  return useQuery({
    queryKey: queryKeys.budgets.list(query),
    queryFn: () => budgetsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

/** Goals, spend, and uncovered categories for one month — the dashboard's whole budget panel. */
export function useMonthSummary(month?: string) {
  return useQuery({
    queryKey: queryKeys.budgets.month(month),
    queryFn: () => budgetsApi.monthSummary(month),
  });
}

// -------------------------------------------------------------------- Writes

export function useCreateBudgetGoal() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (input: CreateBudgetGoalInput) => budgetsApi.create(input),
    onSuccess: () => invalidate(queryKeys.budgets.all),
  });
}

export function useUpdateBudgetGoal() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBudgetGoalInput }) =>
      budgetsApi.update(id, input),
    onSuccess: () => invalidate(queryKeys.budgets.all),
  });
}

export function useDeleteBudgetGoal() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id: string) => budgetsApi.remove(id),
    onSuccess: () => invalidate(queryKeys.budgets.all),
  });
}

/** Claims the staying-within-budget bonus. Awards points, so the economy is invalidated with it. */
export function useClaimAdherence() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id: string) => budgetsApi.claimAdherence(id),
    onSuccess: () => invalidate(queryKeys.budgets.all, queryKeys.points.all),
  });
}
