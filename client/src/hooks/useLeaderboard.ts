import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { leaderboardApi } from '../services/leaderboard';
import type { LeaderboardQuery } from '../services/leaderboard';
import { queryKeys } from '../services/queryKeys';

/**
 * The standings, plus where the caller sits.
 *
 * Ranking is computed by PostgreSQL over the whole eligible set before the page is taken, so a rank is
 * a real position rather than an index into the page — and the caller's own standing arrives even when
 * it falls outside the visible rows, which is the one value a client cannot derive from what it was
 * sent.
 */
export function useLeaderboard(query: LeaderboardQuery) {
  return useQuery({
    queryKey: queryKeys.leaderboard.list(query),
    queryFn: () => leaderboardApi.list(query),
    placeholderData: keepPreviousData,
  });
}
