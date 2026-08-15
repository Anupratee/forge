import type { ManagedUser, Page, SystemSummary } from '../types/api';
import type { Role, UserStatus } from '../types/enums';
import type { QueryParams } from './api';
import { api, toParams } from './api';

export interface AdminUserQuery extends QueryParams {
  keyword?: string;
  role?: Role;
  status?: UserStatus;
  sortBy?: 'displayName' | 'email' | 'role' | 'createdAt' | 'lastLoginAt';
  sortDir?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

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

  /** The accounts an Admin governs. Email is included; nothing private to the user is. */
  async listUsers(query: AdminUserQuery): Promise<Page<ManagedUser>> {
    const { data } = await api.get<Page<ManagedUser>>('/admin/users', { params: toParams(query) });
    return data;
  },

  /**
   * Suspends or reactivates an account.
   *
   * One call for both, because they are the same write with a different value. Accounts are never
   * deleted — that would orphan ledger history and challenge ownership, both of which stay readable.
   */
  async setStatus(id: string, status: UserStatus): Promise<ManagedUser> {
    const { data } = await api.patch<ManagedUser>(`/admin/users/${id}/status`, { status });
    return data;
  },

  /** Changes which role an account holds. The server refuses self-changes and the last active Admin. */
  async setRole(id: string, role: Role): Promise<ManagedUser> {
    const { data } = await api.patch<ManagedUser>(`/admin/users/${id}/role`, { role });
    return data;
  },
};
