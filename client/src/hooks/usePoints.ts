import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { pointsApi } from '../services/points';
import type { LedgerQuery } from '../services/points';
import { queryKeys } from '../services/queryKeys';

/**
 * The caller's balance.
 *
 * Read by the navigation chip and by several dashboards at once, which is exactly what the shared cache
 * is for — one request serves all of them, and any mutation that invalidates `queryKeys.points.all`
 * refreshes every place the number appears.
 */
export function usePointsBalance() {
  return useQuery({
    queryKey: queryKeys.points.balance,
    queryFn: pointsApi.balance,
  });
}

export function useLedger(query: LedgerQuery) {
  return useQuery({
    queryKey: queryKeys.points.ledger(query),
    queryFn: () => pointsApi.ledger(query),
    // Paging keeps the previous page on screen while the next one loads, so the list does not collapse
    // to a spinner and back on every click.
    placeholderData: keepPreviousData,
  });
}
