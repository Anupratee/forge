import type { LedgerEntry, Page, PointsBalance } from '../types/api';
import type { QueryParams } from './api';
import { api, toParams } from './api';

export interface LedgerQuery extends QueryParams {
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  sortDir?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

/**
 * The caller's own economy, always.
 *
 * Neither endpoint takes a user id — the subject comes from the token — so there is no call shape here
 * that could be pointed at somebody else's balance.
 */
export const pointsApi = {
  /** Summed from the append-only ledger on every read. Nothing stores a balance. */
  async balance(): Promise<number> {
    const { data } = await api.get<PointsBalance>('/points/balance');
    return data.balance;
  },

  async ledger(query: LedgerQuery): Promise<Page<LedgerEntry>> {
    const { data } = await api.get<Page<LedgerEntry>>('/points/ledger', {
      params: toParams(query),
    });
    return data;
  },
};
