import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../services/admin';
import { queryKeys } from '../services/queryKeys';

/**
 * Platform-wide counts.
 *
 * Aggregates only — how many habits exist, never whose. The API has no route that would let an Admin
 * read a user's habits or budgets, so there is nothing here to guard against.
 */
export function useSystemSummary() {
  return useQuery({
    queryKey: queryKeys.admin.summary,
    queryFn: adminApi.summary,
  });
}
