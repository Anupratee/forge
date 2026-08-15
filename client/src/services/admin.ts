import type { SystemSummary } from '../types/api';
import { api } from './api';

export const adminApi = {
  /**
   * Platform-wide counts for the Admin dashboard.
   *
   * Aggregates only. Nothing here exposes an individual user's habits or budgets — the API has no route
   * that does, so the Admin dashboard can report how many habits exist but never whose.
   */
  async summary(): Promise<SystemSummary> {
    const { data } = await api.get<SystemSummary>('/admin/summary');
    return data;
  },
};
