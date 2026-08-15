import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { habitsApi } from '../services/habits';
import type {
  CompleteHabitInput,
  CreateHabitInput,
  HabitQuery,
  UpdateHabitInput,
} from '../services/habits';
import { queryKeys } from '../services/queryKeys';
import { useInvalidate } from './useInvalidate';

// --------------------------------------------------------------------- Reads

export function useHabits(query: HabitQuery) {
  return useQuery({
    queryKey: queryKeys.habits.list(query),
    queryFn: () => habitsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useHabit(id: string) {
  return useQuery({
    queryKey: queryKeys.habits.detail(id),
    queryFn: () => habitsApi.getOne(id),
  });
}

// -------------------------------------------------------------------- Writes

export function useCreateHabit() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (input: CreateHabitInput) => habitsApi.create(input),
    onSuccess: () => invalidate(queryKeys.habits.all),
  });
}

export function useUpdateHabit() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHabitInput }) =>
      habitsApi.update(id, input),
    onSuccess: () => invalidate(queryKeys.habits.all),
  });
}

export function useDeleteHabit() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id: string) => habitsApi.remove(id),
    // Deleting a habit removes its completions, and with them the ledger rows they earned — so the
    // balance changes too, and a stale points chip would be showing money that no longer exists.
    onSuccess: () => invalidate(queryKeys.habits.all, queryKeys.points.all),
  });
}

/**
 * Records a completion.
 *
 * This is one of the few calls that mints points, so it invalidates the economy as well as the habit:
 * the streak on the card, the balance in the navigation, and the ledger page all move together.
 */
export function useCompleteHabit() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: CompleteHabitInput }) =>
      habitsApi.complete(id, input),
    onSuccess: () => invalidate(queryKeys.habits.all, queryKeys.points.all),
  });
}
