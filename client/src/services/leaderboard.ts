import type { LeaderboardPage } from '../types/api';
import type { QueryParams } from './api';
import { api, toParams } from './api';

export interface LeaderboardQuery extends QueryParams {
  page?: number;
  pageSize?: number;
  sortDir?: 'ASC' | 'DESC';
}

/**
 * Public standings.
 *
 * Only accounts that opted in appear — the server excludes everyone else in the query itself, so there
 * is no response containing a non-participant's balance for this client to be careless with.
 */
export const leaderboardApi = {
  async list(query: LeaderboardQuery): Promise<LeaderboardPage> {
    const { data } = await api.get<LeaderboardPage>('/leaderboard', { params: toParams(query) });
    return data;
  },
};
