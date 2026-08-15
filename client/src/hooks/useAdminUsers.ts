import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { adminApi } from '../services/admin';
import type { AdminUserQuery } from '../services/admin';
import { queryKeys } from '../services/queryKeys';
import type { Role, UserStatus } from '../types/enums';
import { useInvalidate } from './useInvalidate';

// --------------------------------------------------------------------- Reads

export function useAdminUsers(query: AdminUserQuery) {
  return useQuery({
    queryKey: queryKeys.admin.users(query),
    queryFn: () => adminApi.listUsers(query),
    placeholderData: keepPreviousData,
  });
}

// -------------------------------------------------------------------- Writes

/**
 * Suspends or reactivates an account.
 *
 * Also invalidates the system summary, which counts suspended accounts — the Admin dashboard would
 * otherwise keep reporting the figure from before the change.
 */
export function useSetUserStatus() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      adminApi.setStatus(id, status),
    onSuccess: () => invalidate(queryKeys.admin.all),
  });
}

/** Changes a role. The server refuses a self-change and refuses to demote the last active Admin. */
export function useSetUserRole() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => adminApi.setRole(id, role),
    onSuccess: () => invalidate(queryKeys.admin.all),
  });
}
