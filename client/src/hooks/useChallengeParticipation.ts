import { useQuery } from '@tanstack/react-query';
import { challengesApi } from '../services/challenges';
import { queryKeys } from '../services/queryKeys';
import type { JoinedChallenge } from '../types/api';

/** One request covers any realistic joined list; the loop below handles the rest. */
const PAGE_SIZE = 100;

/**
 * Whether the caller has joined a particular challenge, and their progress if so.
 *
 * **This works around a gap in the API.** There is no `GET /challenges/:id/participation`, and the
 * challenge record deliberately does not say who is looking at it — so the only way to answer is to
 * search the caller's own joined list, which `/challenges/joined` returns and which nobody else can
 * read. It pages through rather than assuming one page is enough, because `listMine` ignores the
 * keyword filter and pagination is the only narrowing it offers.
 *
 * A dedicated endpoint would make this one request with no scan. Worth adding; not worth blocking the
 * frontend on, since the answer this produces is correct either way.
 */
export function useChallengeParticipation(challengeId: string) {
  return useQuery({
    queryKey: [...queryKeys.participations.all, 'for-challenge', challengeId],
    queryFn: async (): Promise<JoinedChallenge | null> => {
      for (let page = 1; ; page += 1) {
        const joined = await challengesApi.listJoined({ page, pageSize: PAGE_SIZE });

        const match = joined.items.find((entry) => entry.challenge.id === challengeId);
        if (match !== undefined) return match;

        if (page >= joined.totalPages) return null;
      }
    },
  });
}
