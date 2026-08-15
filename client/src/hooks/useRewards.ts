import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { rewardsApi } from '../services/rewards';
import type {
  CreateRewardItemInput,
  RewardQuery,
  UpdateRewardItemInput,
} from '../services/rewards';
import type { QueryParams } from '../services/api';
import { queryKeys } from '../services/queryKeys';
import { useInvalidate } from './useInvalidate';

// --------------------------------------------------------------------- Reads

/** The shop: active items only. */
export function useStore(query: RewardQuery) {
  return useQuery({
    queryKey: queryKeys.rewards.store(query),
    queryFn: () => rewardsApi.listStore(query),
    placeholderData: keepPreviousData,
  });
}

/** The Admin inventory, a separate endpoint rather than the same one behaving differently by role. */
export function useAdminRewards(query: RewardQuery) {
  return useQuery({
    queryKey: queryKeys.rewards.manage(query),
    queryFn: () => rewardsApi.listForAdmin(query),
    placeholderData: keepPreviousData,
  });
}

export function useRedemptions(query: QueryParams) {
  return useQuery({
    queryKey: queryKeys.rewards.redemptions(query),
    queryFn: () => rewardsApi.listRedemptions(query),
    placeholderData: keepPreviousData,
  });
}

// -------------------------------------------------------------------- Writes

/**
 * Buys an item.
 *
 * Spends points and consumes a unit of stock, so both the economy and the store listing are stale
 * afterwards. The server does the whole thing in one transaction with a row lock on the buyer and the
 * item — two people racing for the last unit get a 201 and a 409, never a negative balance or stock.
 */
export function useRedeem() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (itemId: string) => rewardsApi.redeem(itemId),
    onSuccess: () => invalidate(queryKeys.rewards.all, queryKeys.points.all),
  });
}

/**
 * Wears a cosmetic, or takes one off with `null`.
 *
 * Invalidates the session profile rather than the store: the equipped theme rides on `PublicUser`, and
 * `useTheme` reads it from there — so repainting the app is a consequence of the profile refreshing,
 * not something this hook does itself.
 */
export function useEquipCosmetic() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (redemptionId: string | null) => rewardsApi.equip(redemptionId),
    onSuccess: () => invalidate(queryKeys.auth.me, queryKeys.rewards.all),
  });
}

export function useCreateRewardItem() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (input: CreateRewardItemInput) => rewardsApi.create(input),
    onSuccess: () => invalidate(queryKeys.rewards.all),
  });
}

export function useUpdateRewardItem() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRewardItemInput }) =>
      rewardsApi.update(id, input),
    onSuccess: () => invalidate(queryKeys.rewards.all),
  });
}

/** Resolves to the deactivation notice when the item had already been redeemed, or `null` if deleted. */
export function useDeleteRewardItem() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id: string) => rewardsApi.remove(id),
    onSuccess: () => invalidate(queryKeys.rewards.all),
  });
}
